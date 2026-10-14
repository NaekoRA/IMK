// server.js — Entry point Express RuangTemu
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');

const ruanganRoute  = require('./routes/ruangan');
const jadwalRoute   = require('./routes/jadwal');
const penggunaRoute = require('./routes/pengguna');
const reservasiRoute= require('./routes/reservasi');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────
app.use(cors());
app.use(express.json());

// Sajikan file statis frontend dari folder induk
app.use(express.static(path.join(__dirname, '..')));

// ─── API Routes ───────────────────────────────────────
app.use('/api/ruangan',  ruanganRoute);
app.use('/api/jadwal',   jadwalRoute);
app.use('/api/pengguna', penggunaRoute);
app.use('/api/reservasi',reservasiRoute);

// ─── Health check ─────────────────────────────────────
app.get('/api/status', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'terhubung', waktu: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', pesan: err.message });
  }
});

// ─── Fallback: semua rute non-API ke index.html ───────
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'denah-figma.html'));
});

// ─── Start server ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ RuangTemu backend berjalan di http://localhost:${PORT}`);
  console.log(`   → Frontend : http://localhost:${PORT}`);
  console.log(`   → API      : http://localhost:${PORT}/api/status`);
});
