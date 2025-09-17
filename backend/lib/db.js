const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/testcasebuilder';

let connected = false;
async function connect() {
  if (connected) return mongoose.connection;
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGODB_URI, {
    autoIndex: true,
  });
  connected = true;
  return mongoose.connection;
}

const TestStepSchema = new mongoose.Schema({}, { strict: false, _id: false });
const ValidationSchema = new mongoose.Schema({}, { strict: false, _id: false });

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  description: { type: String },
}, { timestamps: true });

const TestCaseSchema = new mongoose.Schema({
  filename: { type: String, required: true, unique: true, index: true },
  description: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  product: { type: String, default: 'General', index: true },
  testOrder: { type: Number, required: true, index: true },
  testSteps: { type: [TestStepSchema], default: [] },
}, { timestamps: true });

// Enforce uniqueness of testOrder within a product
TestCaseSchema.index({ product: 1, testOrder: 1 }, { unique: true });

const TestCase = mongoose.models.TestCase || mongoose.model('TestCase', TestCaseSchema);
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

module.exports = { connect, TestCase, Product };
