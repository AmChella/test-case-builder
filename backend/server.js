const express = require('express');
const bodyParser = require('body-parser');
const { validateTestCase, normalizeFilename } = require('./lib/schema');
const { connect, TestCase } = require('./lib/db');


const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/api/testcases', async (req, res) => {
  try {
    await connect();
    const docs = await TestCase.find({}).sort({ testOrder: 1 }).lean();
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list' });
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
    res.status(500).json({ error: 'Failed to get' });
  }
});

app.post('/api/testcases', async (req, res) => {
  try {
    await connect();
    const payload = req.body;
    const items = Array.isArray(payload) ? payload : [payload];

    // Gather existing orders
    const existing = await TestCase.find({}, { testOrder: 1 }).lean();
    const existingOrders = new Set(existing.map(t => t.testOrder).filter(n => typeof n === 'number'));

    // Validate duplicates within payload for provided testOrder
    const providedOrders = items
      .map((it) => it.testOrder)
      .filter((order) => typeof order === 'number');
    const seen = new Set();
    const duplicatesWithin = new Set();
    for (const order of providedOrders) {
      if (seen.has(order)) duplicatesWithin.add(order); else seen.add(order);
    }
    const conflictsWithExisting = Array.from(seen).filter(o => existingOrders.has(o));
    if (duplicatesWithin.size || conflictsWithExisting.length) {
      return res.status(400).json({
        error: 'Duplicate testOrder',
        details: { duplicatesWithin: Array.from(duplicatesWithin), conflictsWithExisting }
      });
    }

    // Assign missing orders to next free integers
    const used = new Set([...existingOrders, ...Array.from(seen)]);
    const nextFree = () => {
      let n = 1;
      while (used.has(n)) n++;
      used.add(n);
      return n;
    };

    const saved = [];
    for (const item of items) {
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

      if (typeof item.testOrder !== 'number') item.testOrder = nextFree();

      const doc = await TestCase.create({ filename, ...item });
      saved.push({ filename: doc.filename, description: doc.description, enabled: doc.enabled, testOrder: doc.testOrder, testSteps: doc.testSteps });
    }
    res.json({ saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create' });
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
    res.status(500).json({ error: 'Failed to update' });
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
    res.status(500).json({ error: 'Failed to delete' });
  }
});

app.post('/api/import', (req, res) => {
  return app._router.handle(req, res, () => {});
});

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
