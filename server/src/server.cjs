/* eslint-disable */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const cors = require('cors');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const Database = require('better-sqlite3');
const mime = require('mime-types');
require('dotenv').config();

// --- Config ---
const PORT = parseInt(process.env.PORT || '8080', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '2048', 10);
const LINK_TTL_HOURS = parseInt(process.env.LINK_TTL_HOURS || '72', 10);
const CLEANUP_INTERVAL_MINUTES = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '30', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// Ensure dirs
fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });

// --- DB ---
const db = new Database(path.join(process.cwd(), 'data', 'app.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS uploads (
  code TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0
);
`);

// --- Utils ---
function genCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function nowSec(){ return Math.floor(Date.now()/1000); }

// --- Rate limit ---
const limiter = new RateLimiterMemory({
  points: 100, // 100 req
  duration: 60, // per minute
});
function rateLimit(req, res, next) {
  limiter.consume(req.ip)
    .then(() => next())
    .catch(() => res.status(429).send('Too Many Requests'));
}

// --- App ---
const app = express();
app.use(helmet());
app.use(express.json());
app.use(rateLimit);

if (ALLOWED_ORIGINS.length > 0) {
  app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: false,
  }));
} else {
  app.use(cors());
}

// Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, STORAGE_DIR); },
  filename: function (req, file, cb) {
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    cb(null, unique + '-' + safeBase);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// --- API ---
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const code = genCode(7);

  const createdAt = nowSec();
  const expiresAt = createdAt + LINK_TTL_HOURS * 3600;
  const mimeType = req.file.mimetype || mime.lookup(req.file.originalname) || 'application/octet-stream';
  const stmt = db.prepare(`INSERT INTO uploads (code, original_name, stored_path, mime_type, size_bytes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  stmt.run(code, req.file.originalname, req.file.path, mimeType, req.file.size, createdAt, expiresAt);

  return res.json({
    code,
    originalName: req.file.originalname,
    sizeBytes: req.file.size,
    expiresAt,
    downloadPage: `${BASE_URL}/d/${code}`,
    directUrl: `${BASE_URL}/api/download/${code}`
  });
});

app.get('/api/lookup/:code', (req, res) => {
  const code = req.params.code;
  const row = db.prepare('SELECT * FROM uploads WHERE code = ?').get(code);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.expires_at < nowSec()) return res.status(410).json({ error: 'Gone' });
  res.json({
    code: row.code,
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    downloadPage: `${BASE_URL}/d/${row.code}`,
    directUrl: `${BASE_URL}/api/download/${row.code}`
  });
});

app.get('/api/download/:code', (req, res) => {
  const code = req.params.code;
  const row = db.prepare('SELECT * FROM uploads WHERE code = ?').get(code);
  if (!row) return res.status(404).send('Not found');
  if (row.expires_at < nowSec()) return res.status(410).send('Link expired');

  // Increment downloads
  db.prepare('UPDATE uploads SET downloads = downloads + 1 WHERE code = ?').run(code);

  const filename = row.original_name;
  const type = row.mime_type || 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  const stream = fs.createReadStream(row.stored_path);
  stream.on('error', () => res.status(500).end('File missing'));
  stream.pipe(res);
});

// Cleanup expired files periodically
setInterval(() => {
  try {
    const now = nowSec();
    const rows = db.prepare('SELECT code, stored_path FROM uploads WHERE expires_at < ?').all(now);
    const delStmt = db.prepare('DELETE FROM uploads WHERE code = ?');
    for (const r of rows) {
      try { fs.unlinkSync(r.stored_path); } catch {}
      delStmt.run(r.code);
    }
    if (rows.length > 0) {
      console.log(`Cleanup removed ${rows.length} expired file(s).`);
    }
  } catch (e) {
    console.error('Cleanup error', e);
  }
}, CLEANUP_INTERVAL_MINUTES * 60 * 1000);

// Serve static frontend
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('/d/:code', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
