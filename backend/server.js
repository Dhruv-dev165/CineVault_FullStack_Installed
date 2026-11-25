const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'cinevault';
const DATA_FILE = path.join(__dirname, 'data', 'movies.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

let moviesCollection;

function readLegacyMovies() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read legacy movies.json:', error.message);
    return [];
  }
}

async function connectDatabase() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is missing. Add it in Render Environment before starting CineVault.');
  }

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
  });
  await client.connect();
  const db = client.db(DB_NAME);
  moviesCollection = db.collection('movies');
  await moviesCollection.createIndex({ id: 1 }, { unique: true });

  // One-time migration: import existing JSON movies only when the collection is empty.
  const existingCount = await moviesCollection.countDocuments();
  if (existingCount === 0) {
    const legacyMovies = readLegacyMovies();
    if (legacyMovies.length) {
      const cleanMovies = legacyMovies.map(movie => ({
        ...movie,
        id: String(movie.id || 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2))
      }));
      await moviesCollection.insertMany(cleanMovies, { ordered: false });
      console.log('Migrated', cleanMovies.length, 'legacy movies into MongoDB.');
    }
  }

  console.log('Connected to MongoDB database:', DB_NAME);
  return client;
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-password'];
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
  }
  next();
}

function applyFilters(movies, query) {
  const { category, search, quality } = query;
  if (category && category !== 'All') {
    movies = movies.filter(m => (m.category || '').toLowerCase() === category.toLowerCase());
  }
  if (quality && quality !== 'All') {
    movies = movies.filter(m => m.links && m.links[quality] && String(m.links[quality]).trim() !== '');
  }
  if (search && search.trim() !== '') {
    const q = search.toLowerCase();
    movies = movies.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.synopsis || '').toLowerCase().includes(q) ||
      (m.language || '').toLowerCase().includes(q)
    );
  }
  return movies;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: moviesCollection ? 'connected' : 'disconnected' });
});

app.get('/api/movies', async (req, res) => {
  try {
    const movies = await moviesCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(applyFilters(movies, req.query));
  } catch (error) {
    console.error('Get movies failed:', error);
    res.status(500).json({ error: 'Could not load movies from database' });
  }
});

app.get('/api/movies/:id', async (req, res) => {
  try {
    const movie = await moviesCollection.findOne({ id: req.params.id });
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json(movie);
  } catch (error) {
    console.error('Get movie failed:', error);
    res.status(500).json({ error: 'Could not load movie' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: 'Authenticated' });
  }
  return res.status(401).json({ success: false, error: 'Wrong Admin Password' });
});

app.post('/api/movies', requireAdmin, async (req, res) => {
  try {
    const { title, category, year, qualityTag, language, size, poster, synopsis, links } = req.body;
    if (!title || !links || (!links['480p'] && !links['720p'] && !links['1080p'])) {
      return res.status(400).json({ error: 'Title and at least one download link (480p/720p/1080p) are required.' });
    }

    const newMovie = {
      id: 'mov_' + Date.now(),
      title: title.trim(),
      category: category || 'Bollywood',
      year: year || '2026',
      qualityTag: qualityTag || '1080p WEB-DL',
      language: language || 'Hindi / Dual Audio',
      size: size || '450MB / 950MB / 2.2GB',
      poster: poster && poster.trim() !== ''
        ? poster.trim()
        : 'https://placehold.co/400x600/151a24/e11d48?text=' + encodeURIComponent(title.slice(0, 20)),
      synopsis: synopsis || 'Movie details and available download qualities.',
      links: {
        '480p': links['480p'] ? String(links['480p']).trim() : '',
        '720p': links['720p'] ? String(links['720p']).trim() : '',
        '1080p': links['1080p'] ? String(links['1080p']).trim() : ''
      },
      createdAt: new Date().toISOString()
    };

    await moviesCollection.insertOne(newMovie);
    res.status(201).json({ success: true, movie: newMovie });
  } catch (error) {
    console.error('Add movie failed:', error);
    res.status(500).json({ error: 'Movie could not be saved to database' });
  }
});

app.delete('/api/movies/:id', requireAdmin, async (req, res) => {
  try {
    const result = await moviesCollection.deleteOne({ id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Movie not found' });
    res.json({ success: true, message: 'Movie deleted' });
  } catch (error) {
    console.error('Delete movie failed:', error);
    res.status(500).json({ error: 'Movie could not be deleted from database' });
  }
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

async function start() {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      console.log('CineVault API running on port', PORT);
      console.log('Admin Panel: /admin');
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
}

start();
