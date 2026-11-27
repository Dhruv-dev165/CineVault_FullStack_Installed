'use strict';

// Imports metadata and already-hosted video URLs from an owner-controlled JSON feed.
// It intentionally does not scrape third-party movie sites or bypass access controls.
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const {
  MONGO_URI = process.env.MONGODB_URI,
  MONGODB_DB_NAME = 'cinevault',
  MOVIE_IMPORT_FEED_URL,
  MOVIE_IMPORT_TOKEN,
  MOVIE_IMPORT_INTERVAL_SECONDS = '300',
  MOVIE_IMPORT_TIMEOUT_MS = '20000',
} = process.env;

const intervalMs = Math.max(60, Number(MOVIE_IMPORT_INTERVAL_SECONDS) || 300) * 1000;
const timeoutMs = Math.max(3000, Number(MOVIE_IMPORT_TIMEOUT_MS) || 20000);

function required(value, name) {
  if (!value) throw new Error(name + ' environment variable is required');
  return value;
}

function safeHttpsUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + ' must be a valid URL'); }
  if (url.protocol !== 'https:') throw new Error(label + ' must use HTTPS');
  if (url.username || url.password) throw new Error(label + ' must not embed credentials in the URL');
  return url;
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error('Feed request failed with HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function validateVideo(urlValue) {
  const url = safeHttpsUrl(urlValue, 'video URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'error' });
    if (!response.ok) return false;
    const type = (response.headers.get('content-type') || '').toLowerCase();
    const pathLooksVideo = /\.(mp4|m3u8|webm|mov)(?:$|\?)/i.test(url.pathname + url.search);
    return type.startsWith('video/') || type.includes('mpegurl') || pathLooksVideo;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMovie(item) {
  if (!item || typeof item !== 'object') throw new Error('Each feed item must be an object');
  const title = String(item.title || '').trim();
  const sourceId = String(item.id || item.sourceId || '').trim();
  if (!title || !sourceId) throw new Error('Each movie needs title and stable id/sourceId');
  const videoUrl = item.videoUrl || item.video_url || item.fileUrl;
  const links = item.links && typeof item.links === 'object' ? item.links : {};
  if (videoUrl) links.original = videoUrl;
  const videoLinks = Object.values(links).filter(v => typeof v === 'string' && v.trim());
  if (!videoLinks.length) throw new Error('Movie ' + title + ' has no authorized video URL');
  for (const link of videoLinks) safeHttpsUrl(link, 'video URL');
  const key = crypto.createHash('sha256').update(sourceId).digest('hex');
  return {
    sourceKey: key,
    sourceId,
    title,
    category: String(item.category || item.genre || 'Uncategorized'),
    year: String(item.year || ''),
    language: String(item.language || ''),
    qualityTag: String(item.qualityTag || item.quality || ''),
    size: String(item.size || ''),
    poster: item.poster ? String(item.poster) : '',
    synopsis: String(item.synopsis || item.description || ''),
    links: Object.fromEntries(Object.entries(links).filter(([k,v]) => typeof v === 'string' && v.trim()).map(([k,v]) => [k, v.trim()])),
    source: 'authorized-feed',
    published: true,
    status: 'published',
    updatedAt: new Date().toISOString(),
  };
}

async function importOnce(collection) {
  const feedUrl = safeHttpsUrl(required(MOVIE_IMPORT_FEED_URL, 'MOVIE_IMPORT_FEED_URL'), 'MOVIE_IMPORT_FEED_URL');
  const headers = { accept: 'application/json' };
  if (MOVIE_IMPORT_TOKEN) headers.authorization = 'Bearer ' + MOVIE_IMPORT_TOKEN;
  const payload = await fetchJson(feedUrl, headers);
  const items = Array.isArray(payload) ? payload : payload.movies;
  if (!Array.isArray(items)) throw new Error('Feed JSON must be an array or an object containing a movies array');

  let imported = 0, skipped = 0, failed = 0;
  for (const item of items) {
    try {
      const movie = normalizeMovie(item);
      const urls = Object.values(movie.links);
      const checks = await Promise.all(urls.map(validateVideo));
      if (!checks.some(Boolean)) {
        skipped++;
        console.warn('Skipped unavailable/non-video asset:', movie.title);
        continue;
      }
      movie.id = 'import_' + movie.sourceKey.slice(0, 24);
      movie.createdAt = new Date().toISOString();
      const { createdAt, ...movieFields } = movie;
      await collection.updateOne(
        { sourceKey: movie.sourceKey },
        { $set: movieFields, $setOnInsert: { createdAt } },
        { upsert: true }
      );
      imported++;
      console.log('Published:', movie.title);
    } catch (error) {
      failed++;
      console.error('Import item failed:', error.message);
    }
  }
  console.log(JSON.stringify({ checked: items.length, importedOrUpdated: imported, skipped, failed, at: new Date().toISOString() }));
}

async function main() {
  const uri = required(MONGO_URI, 'MONGO_URI (or MONGODB_URI)');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const collection = client.db(MONGODB_DB_NAME).collection('movies');
  await collection.createIndex({ sourceKey: 1 }, { unique: true, sparse: true });
  console.log('CineVault importer connected. Poll interval:', intervalMs / 1000, 'seconds');
  const run = async () => {
    try { await importOnce(collection); }
    catch (error) { console.error('Import cycle failed:', error.message); }
  };
  await run();
  setInterval(run, intervalMs);
  const shutdown = async () => { await client.close(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(error => { console.error('Importer startup failed:', error.message); process.exit(1); });
