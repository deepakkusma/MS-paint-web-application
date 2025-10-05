import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/paint_flowchart';
mongoose
  .connect(mongoUri, { dbName: process.env.MONGODB_DB || undefined })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Mongoose Schema
const DrawingSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'Untitled' },
    data: { type: Object, required: true },
    imageDataUrl: { type: String },
  },
  { timestamps: true }
);

const Drawing = mongoose.model('Drawing', DrawingSchema);

// API routes
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/drawings', async (req, res) => {
  try {
    const list = await Drawing.find({}, { imageDataUrl: 0 }).sort({ updatedAt: -1 }).limit(50);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drawings' });
  }
});

app.get('/api/drawings/:id', async (req, res) => {
  try {
    const doc = await Drawing.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drawing' });
  }
});

app.post('/api/drawings', async (req, res) => {
  try {
    const { title, data, imageDataUrl } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing data' });
    const created = await Drawing.create({ title: title || 'Untitled', data, imageDataUrl });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save drawing' });
  }
});

app.put('/api/drawings/:id', async (req, res) => {
  try {
    const { title, data, imageDataUrl } = req.body;
    const updated = await Drawing.findByIdAndUpdate(
      req.params.id,
      { $set: { title, data, imageDataUrl } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update drawing' });
  }
});

app.delete('/api/drawings/:id', async (req, res) => {
  try {
    const deleted = await Drawing.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete drawing' });
  }
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));





