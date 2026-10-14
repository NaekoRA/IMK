// routes/reservasi.js
// Tabel reservasi mencakup seluruh siklus hidup tiket:
//   menunggu → berlangsung → selesai
//                          ↘ dibatalkan / kadaluarsa
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─────────────────────────────────────────
// Helper: buat kode reservasi unik RT-XXXXXX
// ─────────────────────────────────────────
function buatKode() {
  return `RT-${String(Date.now()).slice(-6)}`;
}

// ─────────────────────────────────────────
// GET /api/reservasi — semua reservasi
// ?status=berlangsung|menunggu|selesai|...
// ?tanggal=YYYY-MM-DD
// ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT r.*, ru.nama AS nama_ruangan,
             p.nama AS nama_pemesan
      FROM reservasi r
      LEFT JOIN ruangan ru ON r.id_ruangan  = ru.id_ruangan
      LEFT JOIN pengguna p ON r.nim_pemesan = p.nim
    `;
    const params = [];
    const kondisi = [];

    if (req.query.status) {
      kondisi.push('r.status = ?');
      params.push(req.query.status);
    }
    if (req.query.tanggal) {
      kondisi.push('r.tanggal = ?');
      params.push(req.query.tanggal);
    }
    if (kondisi.length) sql += ' WHERE ' + kondisi.join(' AND ');
    sql += ' ORDER BY r.tanggal DESC, r.jam_mulai DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil reservasi', error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/reservasi/publik
// Semua reservasi aktif (menunggu/berlangsung) — dapat dilihat semua orang
// ?tanggal=YYYY-MM-DD  (opsional, default: hari ini WIB)
// ─────────────────────────────────────────
router.get('/publik', async (req, res) => {
  try {
    const tanggal = req.query.tanggal ||
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const [rows] = await db.query(`
      SELECT r.kode, r.id_ruangan, ru.nama AS nama_ruangan,
             r.tujuan, r.tanggal, r.jam_mulai, r.jam_selesai,
             r.status, r.nim_pemesan, p.nama AS nama_pemesan,
             r.nim_anggota
      FROM reservasi r
      LEFT JOIN ruangan ru ON r.id_ruangan  = ru.id_ruangan
      LEFT JOIN pengguna p ON r.nim_pemesan = p.nim
      WHERE r.tanggal = ?
        AND r.status IN ('menunggu','berlangsung')
      ORDER BY r.id_ruangan, r.jam_mulai
    `, [tanggal]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil reservasi publik', error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/reservasi/berlangsung
// Tiket yang sedang aktif sekarang (status=berlangsung)
// ─────────────────────────────────────────
router.get('/berlangsung', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, ru.nama AS nama_ruangan,
             p.nama AS nama_pemesan
      FROM reservasi r
      LEFT JOIN ruangan ru ON r.id_ruangan  = ru.id_ruangan
      LEFT JOIN pengguna p ON r.nim_pemesan = p.nim
      WHERE r.status = 'berlangsung'
      ORDER BY r.jam_mulai
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil tiket berlangsung', error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/reservasi/nim/:nim
// Semua tiket milik satu NIM (untuk tab "Tiket Saya")
// ─────────────────────────────────────────
router.get('/nim/:nim', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, ru.nama AS nama_ruangan,
             p.nama AS nama_pemesan
      FROM reservasi r
      LEFT JOIN ruangan ru ON r.id_ruangan  = ru.id_ruangan
      LEFT JOIN pengguna p ON r.nim_pemesan = p.nim
      WHERE r.nim_pemesan = ?
         OR r.nim_anggota LIKE CONCAT('%', ?, '%')
      ORDER BY r.tanggal DESC, r.jam_mulai DESC
      LIMIT 50
    `, [req.params.nim, req.params.nim]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil tiket', error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/reservasi/:kode — detail satu reservasi
// ─────────────────────────────────────────
router.get('/:kode', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, ru.nama AS nama_ruangan,
             p.nama AS nama_pemesan
      FROM reservasi r
      LEFT JOIN ruangan ru ON r.id_ruangan  = ru.id_ruangan
      LEFT JOIN pengguna p ON r.nim_pemesan = p.nim
      WHERE r.kode = ?
    `, [req.params.kode]);
    if (!rows.length) return res.status(404).json({ pesan: 'Reservasi tidak ditemukan' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal mengambil reservasi', error: err.message });
  }
});

// ─────────────────────────────────────────
// POST /api/reservasi — buat reservasi baru
// Body: { id_ruangan, nim_pemesan, nim_anggota, tujuan, tanggal, jam_mulai, jam_selesai }
// ─────────────────────────────────────────
router.post('/', async (req, res) => {
  const { id_ruangan, nim_pemesan, nim_anggota, tujuan, tanggal, jam_mulai, jam_selesai } = req.body;

  if (!id_ruangan || !nim_pemesan || !tanggal || !jam_mulai || !jam_selesai) {
    return res.status(400).json({ pesan: 'Field wajib: id_ruangan, nim_pemesan, tanggal, jam_mulai, jam_selesai' });
  }

  try {
    // ── Ambil data kapasitas ruangan ──
    const [ruanganRows] = await db.query(
      'SELECT kapasitas FROM ruangan WHERE id_ruangan = ?',
      [id_ruangan.toUpperCase()]
    );
    if (!ruanganRows.length) {
      return res.status(404).json({ pesan: 'Ruangan tidak ditemukan' });
    }
    const kapasitas = ruanganRows[0].kapasitas;

    // ── Cek jumlah peserta (pemesan + anggota) ≤ kapasitas ──
    const jumlahAnggota = nim_anggota
      ? nim_anggota.split(/[,\s]+/).filter(Boolean).length
      : 0;
    const totalPeserta = 1 + jumlahAnggota; // pemesan + anggota
    if (totalPeserta > kapasitas) {
      return res.status(409).json({
        pesan: `Jumlah peserta (${totalPeserta}) melebihi kapasitas ruangan (${kapasitas} orang)`
      });
    }

    // ── Cek konflik dengan reservasi aktif / menunggu ──
    const [konflik] = await db.query(`
      SELECT kode FROM reservasi
      WHERE id_ruangan = ?
        AND tanggal    = ?
        AND status IN ('menunggu','berlangsung')
        AND jam_mulai  < ?
        AND jam_selesai > ?
    `, [id_ruangan.toUpperCase(), tanggal, jam_selesai, jam_mulai]);

    if (konflik.length) {
      return res.status(409).json({
        pesan: `Ruangan sudah dipesan pada waktu tersebut (kode: ${konflik[0].kode})`
      });
    }

    // ── Cek batas maksimal 4 reservasi bersamaan (semua ruangan, jam sama) ──
    const [slotPenuh] = await db.query(`
      SELECT COUNT(*) AS jumlah FROM reservasi
      WHERE tanggal    = ?
        AND status IN ('menunggu','berlangsung')
        AND jam_mulai  < ?
        AND jam_selesai > ?
    `, [tanggal, jam_selesai, jam_mulai]);

    const MAX_BERSAMAAN = 4;
    if (slotPenuh[0].jumlah >= MAX_BERSAMAAN) {
      return res.status(409).json({
        pesan: `Slot waktu ini sudah penuh (maks ${MAX_BERSAMAAN} pesanan bersamaan di seluruh ruangan). Pilih waktu lain.`
      });
    }

    // ── Cek konflik dengan jadwal kuliah ──
    const tgl = new Date(`${tanggal}T00:00:00+07:00`);
    const hariJs = tgl.getDay();
    const hariKe = hariJs === 0 ? 7 : hariJs;

    const [jadwalBentrok] = await db.query(`
      SELECT nama_kelas FROM jadwal
      WHERE id_ruangan  = ?
        AND hari_ke     = ?
        AND jam_mulai   < ?
        AND jam_selesai > ?
    `, [id_ruangan.toUpperCase(), hariKe, jam_selesai, jam_mulai]);

    if (jadwalBentrok.length) {
      return res.status(409).json({
        pesan: `Bentrok dengan jadwal kuliah: ${jadwalBentrok[0].nama_kelas}`
      });
    }

    const kode = buatKode();
    await db.query(`
      INSERT INTO reservasi
        (kode, id_ruangan, nim_pemesan, nim_anggota, tujuan, tanggal, jam_mulai, jam_selesai)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      kode,
      id_ruangan.toUpperCase(),
      nim_pemesan,
      nim_anggota || null,
      tujuan || null,
      tanggal,
      jam_mulai,
      jam_selesai,
    ]);

    res.status(201).json({ pesan: 'Reservasi berhasil dibuat', kode });
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal membuat reservasi', error: err.message });
  }
});

// ─────────────────────────────────────────
// PATCH /api/reservasi/:kode/checkin
// Ubah status jadi 'berlangsung' (tiket aktif)
// ─────────────────────────────────────────
router.patch('/:kode/checkin', async (req, res) => {
  try {
    const [result] = await db.query(`
      UPDATE reservasi
      SET status = 'berlangsung', waktu_check_in = NOW()
      WHERE kode = ? AND status = 'menunggu'
    `, [req.params.kode]);

    if (!result.affectedRows) {
      return res.status(404).json({ pesan: 'Reservasi tidak ditemukan atau statusnya bukan menunggu' });
    }
    res.json({ pesan: 'Check-in berhasil, tiket sekarang berlangsung' });
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal check-in', error: err.message });
  }
});

// ─────────────────────────────────────────
// PATCH /api/reservasi/:kode/selesai
// Tandai tiket selesai
// ─────────────────────────────────────────
router.patch('/:kode/selesai', async (req, res) => {
  try {
    const [result] = await db.query(`
      UPDATE reservasi
      SET status = 'selesai', waktu_selesai = NOW()
      WHERE kode = ? AND status IN ('menunggu','berlangsung')
    `, [req.params.kode]);

    if (!result.affectedRows) {
      return res.status(404).json({ pesan: 'Reservasi tidak ditemukan atau sudah selesai' });
    }
    res.json({ pesan: 'Tiket berhasil ditandai selesai' });
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal menyelesaikan tiket', error: err.message });
  }
});

// ─────────────────────────────────────────
// PATCH /api/reservasi/:kode/batal
// Batalkan reservasi
// ─────────────────────────────────────────
router.patch('/:kode/batal', async (req, res) => {
  try {
    const [result] = await db.query(`
      UPDATE reservasi
      SET status = 'dibatalkan'
      WHERE kode = ? AND status = 'menunggu'
    `, [req.params.kode]);

    if (!result.affectedRows) {
      return res.status(404).json({ pesan: 'Reservasi tidak ditemukan atau tidak bisa dibatalkan' });
    }
    res.json({ pesan: 'Reservasi berhasil dibatalkan' });
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal membatalkan reservasi', error: err.message });
  }
});

// ─────────────────────────────────────────
// DELETE /api/reservasi/:kode — hapus reservasi (admin)
// ─────────────────────────────────────────
router.delete('/:kode', async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM reservasi WHERE kode = ?',
      [req.params.kode]
    );
    if (!result.affectedRows) return res.status(404).json({ pesan: 'Reservasi tidak ditemukan' });
    res.json({ pesan: 'Reservasi berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ pesan: 'Gagal menghapus reservasi', error: err.message });
  }
});

module.exports = router;
