// routes/jadwal.js
// Jadwal bersifat mingguan berulang.
// API mengkonversi hari_ke -> tanggal konkret berdasarkan ?tanggal=YYYY-MM-DD
const express = require('express');
const router  = express.Router();
const db      = require('../db');

const NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

/**
 * Konversi baris jadwal mingguan menjadi event konkret pada tanggal tertentu.
 * hari_ke: 1=Senin … 7=Minggu  (sesuai ISO, Minggu=7 atau 0 tergantung sistem)
 * Date.getDay(): 0=Minggu, 1=Senin, … 6=Sabtu
 */
function jadwalKeEvent(jadwal, tanggalStr) {
  // tanggalStr: 'YYYY-MM-DD'
  const tgl = new Date(`${tanggalStr}T00:00:00+07:00`);
  // getDay() → 0=Minggu, kita map hari_ke 1=Senin→1, 7=Minggu→0
  const hariTarget = jadwal.hari_ke === 7 ? 0 : jadwal.hari_ke;
  if (tgl.getDay() !== hariTarget) return null;

  const mulai   = new Date(`${tanggalStr}T${jadwal.jam_mulai}+07:00`);
  const selesai = new Date(`${tanggalStr}T${jadwal.jam_selesai}+07:00`);

  return {
    id_jadwal   : jadwal.id,
    id_ruangan  : jadwal.id_ruangan,
    jenis       : jadwal.jenis,
    keterangan  : jadwal.nama_kelas,
    hari        : NAMA_HARI[hariTarget],
    mulai       : mulai.toISOString(),
    selesai     : selesai.toISOString(),
  };
}

// GET /api/jadwal?tanggal=YYYY-MM-DD
// Mengembalikan semua jadwal yang aktif di tanggal tertentu
router.get('/', async (req, res) => {
  try {
    const tanggal = req.query.tanggal || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const tgl = new Date(`${tanggal}T00:00:00+07:00`);
    const hariJs = tgl.getDay(); // 0=Minggu … 6=Sabtu
    // map ke hari_ke kita: 1=Senin … 7=Minggu
    const hariKe = hariJs === 0 ? 7 : hariJs;

    const [rows] = await db.query(
      'SELECT * FROM jadwal WHERE hari_ke = ? ORDER BY jam_mulai',
      [hariKe]
    );

    const events = rows
      .map(j => jadwalKeEvent(j, tanggal))
      .filter(Boolean);

    res.json(events);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil jadwal', error: err.message });
  }
});

// GET /api/jadwal/ruangan/:id?tanggal=YYYY-MM-DD
router.get('/ruangan/:id', async (req, res) => {
  try {
    const tanggal = req.query.tanggal || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const tgl = new Date(`${tanggal}T00:00:00+07:00`);
    const hariJs = tgl.getDay();
    const hariKe = hariJs === 0 ? 7 : hariJs;

    const [rows] = await db.query(
      'SELECT * FROM jadwal WHERE id_ruangan = ? AND hari_ke = ? ORDER BY jam_mulai',
      [req.params.id.toUpperCase(), hariKe]
    );

    const events = rows
      .map(j => jadwalKeEvent(j, tanggal))
      .filter(Boolean);

    res.json(events);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil jadwal ruangan', error: err.message });
  }
});

// GET /api/jadwal/semua — semua jadwal mentah (semua hari)
router.get('/semua', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT j.*, r.nama AS nama_ruangan
       FROM jadwal j JOIN ruangan r ON j.id_ruangan = r.id_ruangan
       ORDER BY j.hari_ke, j.jam_mulai`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil semua jadwal', error: err.message });
  }
});

module.exports = router;
