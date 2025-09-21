const express = require('express');
const bodyParser = require('body-parser');
const { validateTestCase, normalizeFilename } = require('./lib/schema');
const { connect, TestCase, Product } = require('./lib/db');


const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Debug');
  next();
});

// Debug mode detection middleware
// Enable detailed error payloads by sending header: x-debug: 1
// or adding ?debug=1 to request query, or setting env FORCE_DEBUG_API=1.
app.use((req, res, next) => {
  // Enable when x-debug: 1 header, query ?debug=1, or env FORCE_DEBUG_API
  const headerDebug = req.header('x-debug');
  req.debugEnabled = (headerDebug === '1' || headerDebug === 'true') || req.query.debug === '1' || process.env.FORCE_DEBUG_API === '1';
  next();
});

// Utility to format errors with optional debug details
function formatError(message, err, debugEnabled, extra) {
  const base = { error: message };
  if (extra !== undefined) base.details = extra;
  if (debugEnabled) {
    base.debug = {
      type: err?.name,
      message: err?.message,
      stack: err?.stack,
      raw: (err && typeof err === 'object') ? Object.fromEntries(Object.entries(err).slice(0, 10)) : err
    };
  }
  return base;
}

app.get('/api/testcases', async (req, res) => {
  try {
    await connect();
    const filter = {};
    if (req.query.product) filter.product = req.query.product;
    const docs = await TestCase.find(filter).sort({ testOrder: 1 }).lean();
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json(formatError('Failed to list', err, req.debugEnabled));
  }
});

app.get('/api/testcases/:filename', async (req, res) => {
  try {
    await connect();
    const doc = await TestCase.findOne({ filename: req.params.filename }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json(formatError('Failed to get', err, req.debugEnabled));
  }
});

app.post('/api/testcases', async (req, res) => {
  try {
    await connect();
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [payload];

    // Ensure product default and build per-product buckets
    const payloadWithProduct = items.map(it => ({ ...it, product: it.product || 'General' }));
    const byProduct = new Map();
    for (const it of payloadWithProduct) {
      const p = it.product;
      if (!byProduct.has(p)) byProduct.set(p, []);
      byProduct.get(p).push(it);
    }

    // Validate duplicates within payload per product for provided testOrder
    for (const [product, list] of byProduct.entries()) {
      const provided = list
        .map((it) => it.testOrder)
        .filter((order) => typeof order === 'number');
      const seen = new Set();
      const dup = new Set();
      for (const o of provided) { if (seen.has(o)) dup.add(o); else seen.add(o); }
      if (dup.size) {
        return res.status(400).json({ error: 'Duplicate testOrder within batch', details: { product, duplicates: Array.from(dup) } });
      }
      // Check conflicts with existing for that product
      const existing = await TestCase.find({ product }, { testOrder: 1 }).lean();
      const existingOrders = new Set(existing.map(t => t.testOrder).filter(n => typeof n === 'number'));
      const conflicts = Array.from(seen).filter(o => existingOrders.has(o));
      if (conflicts.length) {
        return res.status(400).json({ error: 'Duplicate testOrder for product', details: { product, conflicts } });
      }
    }

    // Compute next free orders per product
    const usedByProduct = new Map(); // product -> Set(numbers)
    for (const [product] of byProduct.entries()) {
      const existing = await TestCase.find({ product }, { testOrder: 1 }).lean();
      const used = new Set(existing.map(t => t.testOrder).filter(n => typeof n === 'number'));
      usedByProduct.set(product, used);
    }
    const nextFree = (product) => {
      const used = usedByProduct.get(product) || new Set();
      let n = 1;
      while (used.has(n)) n++;
      used.add(n);
      usedByProduct.set(product, used);
      return n;
    };

    const saved = [];
    for (const raw of payloadWithProduct) {
      // Strip server-managed or disallowed fields
      const { _id, filename: incomingFilename, createdAt, updatedAt, ...item } = raw;
      const valid = validateTestCase(item);
      if (!valid.valid) return res.status(400).json({ error: 'Validation failed', details: valid.errors });

      // Generate unique filename (kept as previous .json names but without extension stored)
      const base = (item.description || 'testcase').replace(/[^a-z0-9\-]/gi, '_').toLowerCase();
      let filename = normalizeFilename(base) + '.json';
      let suffix = 1;
      // Ensure uniqueness against DB
      // strip extension when checking, we keep .json to preserve frontend expectations
      while (await TestCase.findOne({ filename }).lean()) {
        filename = normalizeFilename(base) + `_${suffix++}` + '.json';
      }

      if (typeof item.testOrder !== 'number') item.testOrder = nextFree(item.product);

      try {
        const doc = await TestCase.create({ filename, ...item });
        saved.push({ filename: doc.filename, description: doc.description, enabled: doc.enabled, testOrder: doc.testOrder, testSteps: doc.testSteps });
      } catch (createErr) {
        // Duplicate _id or other index errors
        if (createErr && createErr.code === 11000) {
          if (String(createErr.message || '').includes('filename')) {
            return res.status(400).json({ error: 'Duplicate generated filename', details: createErr.message });
          }
          return res.status(400).json({ error: 'Duplicate key error', details: createErr.message });
        }
        throw createErr;
      }
    }
    res.json({ saved });
  } catch (err) {
    console.error(err);
    // handle unique index violation for (product, testOrder)
    if (err && err.code === 11000) {
      return res.status(400).json(formatError('Duplicate testOrder for product', err, req.debugEnabled));
    }
    res.status(500).json(formatError('Failed to create', err, req.debugEnabled, err?.message));
  }
});

app.put('/api/testcases/:filename', async (req, res) => {
  try {
    await connect();
    const item = req.body;
    const valid = validateTestCase(item);
    if (!valid.valid) return res.status(400).json({ error: 'Validation failed', details: valid.errors });
    const updated = await TestCase.findOneAndUpdate({ filename: req.params.filename }, item, { new: false });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json(formatError('Failed to update', err, req.debugEnabled));
  }
});

app.delete('/api/testcases/:filename', async (req, res) => {
  try {
    await connect();
    const out = await TestCase.deleteOne({ filename: req.params.filename });
    if (out.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json(formatError('Failed to delete', err, req.debugEnabled));
  }
});

app.post('/api/import', (req, res) => {
  return app._router.handle(req, res, () => {});
});

// Product routes
app.get('/api/products', async (req, res) => {
  try {
    await connect();
    const list = await Product.find({}).sort({ name: 1 }).lean();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json(formatError('Failed to list products', err, req.debugEnabled));
  }
});

app.post('/api/products', async (req, res) => {
  try {
    await connect();
    const name = (req.body?.name || '').trim();
    const description = req.body?.description || '';
    if (!name) return res.status(400).json({ error: 'Name required' });
    let doc = await Product.findOne({ name });
    if (!doc) doc = await Product.create({ name, description });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json(formatError('Failed to create product', err, req.debugEnabled));
  }
});

app.delete('/api/products/:name', async (req, res) => {
  try {
    await connect();
    const out = await Product.deleteOne({ name: req.params.name });
    if (out.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json(formatError('Failed to delete product', err, req.debugEnabled));
  }
});

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
