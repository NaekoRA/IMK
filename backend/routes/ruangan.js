// routes/ruangan.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/ruangan — semua ruangan
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ruangan ORDER BY id_ruangan');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil data ruangan', error: err.message });
  }
});

// GET /api/ruangan/:id — detail satu ruangan
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM ruangan WHERE id_ruangan = ?',
      [req.params.id.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ pesan: 'Ruangan tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil data ruangan', error: err.message });
  }
});

module.exports = router;
