const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { validateTestCase, normalizeFilename } = require('./lib/schema');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/api/testcases', (req, res) => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const items = files.map(f => {
    const content = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    return { filename: f, ...content };
  });
  items.sort((a,b) => (a.testOrder || 0) - (b.testOrder || 0));
  res.json(items);
});

app.get('/api/testcases/:filename', (req, res) => {
  const file = path.join(DATA_DIR, req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  const content = JSON.parse(fs.readFileSync(file, 'utf8'));
  res.json(content);
});

app.post('/api/testcases', (req, res) => {
  const payload = req.body;
  const items = Array.isArray(payload) ? payload : [payload];

  const saved = [];
  const existingItems = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
  const existingOrders = new Set(existingItems.map(t => t.testOrder).filter(n => typeof n === 'number'));

  // Validate duplicates within payload for provided testOrder
  const providedOrders = items
    .map((it, idx) => ({ idx, order: it.testOrder }))
    .filter(({ order }) => typeof order === 'number');
  const seen = new Set();
  const duplicatesWithin = new Set();
  for (const { order } of providedOrders) {
    if (seen.has(order)) duplicatesWithin.add(order); else seen.add(order);
  }
  const conflictsWithExisting = Array.from(seen).filter(o => existingOrders.has(o));
  if (duplicatesWithin.size || conflictsWithExisting.length) {
    return res.status(400).json({
      error: 'Duplicate testOrder',
      details: {
        duplicatesWithin: Array.from(duplicatesWithin),
        conflictsWithExisting,
      }
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

  for (const item of items) {
    const valid = validateTestCase(item);
    if (!valid.valid) return res.status(400).json({ error: 'Validation failed', details: valid.errors });

    let base = (item.description || 'testcase').replace(/[^a-z0-9\-]/gi, '_').toLowerCase();
    let filename = normalizeFilename(base) + '.json';
    let i = 1;
    while (fs.existsSync(path.join(DATA_DIR, filename))) {
      filename = normalizeFilename(base) + `_${i++}` + '.json';
    }

    if (typeof item.testOrder !== 'number') item.testOrder = nextFree();

    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(item, null, 2));
    saved.push({ filename, ...item });
  }
  res.json({ saved });
});

app.put('/api/testcases/:filename', (req, res) => {
  const file = path.join(DATA_DIR, req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  const item = req.body;
  const valid = validateTestCase(item);
  if (!valid.valid) return res.status(400).json({ error: 'Validation failed', details: valid.errors });
  fs.writeFileSync(file, JSON.stringify(item, null, 2));
  res.json({ ok: true });
});

app.delete('/api/testcases/:filename', (req, res) => {
  const file = path.join(DATA_DIR, req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

app.post('/api/import', (req, res) => {
  return app._router.handle(req, res, () => {});
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
