// routes/pengguna.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/pengguna — semua pengguna
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nama, nim, kelas, dibuat_pada FROM pengguna ORDER BY nama'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil data pengguna', error: err.message });
  }
});

// GET /api/pengguna/:nim — cari pengguna by NIM
router.get('/:nim', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nama, nim, kelas, dibuat_pada FROM pengguna WHERE nim = ?',
      [req.params.nim]
    );
    if (!rows.length) return res.status(404).json({ pesan: 'Pengguna tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mencari pengguna', error: err.message });
  }
});

// POST /api/pengguna — tambah pengguna baru
router.post('/', async (req, res) => {
  const { nama, nim, kelas } = req.body;
  if (!nama || !nim || !kelas) {
    return res.status(400).json({ pesan: 'nama, nim, dan kelas wajib diisi' });
  }
  try {
    const [result] = await db.query(
      'INSERT INTO pengguna (nama, nim, kelas) VALUES (?, ?, ?)',
      [nama.trim(), nim.trim(), kelas.trim()]
    );
    res.status(201).json({ pesan: 'Pengguna berhasil ditambahkan', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ pesan: 'NIM sudah terdaftar' });
    }
    res.status(500).json({ pesan: 'Gagal menambahkan pengguna', error: err.message });
  }
});

// PUT /api/pengguna/:nim — update data pengguna
router.put('/:nim', async (req, res) => {
  const { nama, kelas } = req.body;
  if (!nama || !kelas) {
    return res.status(400).json({ pesan: 'nama dan kelas wajib diisi' });
  }
  try {
    const [result] = await db.query(
      'UPDATE pengguna SET nama = ?, kelas = ? WHERE nim = ?',
      [nama.trim(), kelas.trim(), req.params.nim]
    );
    if (!result.affectedRows) return res.status(404).json({ pesan: 'Pengguna tidak ditemukan' });
    res.json({ pesan: 'Data pengguna diperbarui' });
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal memperbarui pengguna', error: err.message });
  }
});

// DELETE /api/pengguna/:nim — hapus pengguna
router.delete('/:nim', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM pengguna WHERE nim = ?',
      [req.params.nim]
    );
    if (!result.affectedRows) return res.status(404).json({ pesan: 'Pengguna tidak ditemukan' });
    res.json({ pesan: 'Pengguna berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal menghapus pengguna', error: err.message });
  }
});

module.exports = router;
