-- ====================================================
-- RuangTemu UNESA — Script Database
-- Jalankan: mysql -u root < ruangtemu.sql
-- ====================================================

-- CREATE DATABASE IF NOT EXISTS ruangtemu_db
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE sql12838866;

-- ─────────────────────────────────────────
-- 1. Tabel ruangan
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ruangan (
  id_ruangan  VARCHAR(10)  PRIMARY KEY,
  nama        VARCHAR(100) NOT NULL,
  kapasitas   INT          NOT NULL DEFAULT 30,
  ac          TINYINT(1)   NOT NULL DEFAULT 0,
  wifi        TINYINT(1)   NOT NULL DEFAULT 0,
  proyektor   TINYINT(1)   NOT NULL DEFAULT 0,
  whiteboard  TINYINT(1)   NOT NULL DEFAULT 0,
  foto        VARCHAR(200)
);

-- ─────────────────────────────────────────
-- 2. Tabel pengguna
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pengguna (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nama        VARCHAR(100) NOT NULL,
  nim         VARCHAR(20)  NOT NULL UNIQUE,
  kelas       VARCHAR(30)  NOT NULL,
  dibuat_pada TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- 3. Tabel jadwal (berulang setiap minggu)
--    hari_ke: 1=Senin, 2=Selasa, 3=Rabu,
--             4=Kamis, 5=Jumat, 6=Sabtu, 7=Minggu
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jadwal (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  id_ruangan  VARCHAR(10)  NOT NULL,
  hari_ke     TINYINT      NOT NULL COMMENT '1=Senin ... 7=Minggu',
  jam_mulai   TIME         NOT NULL,
  jam_selesai TIME         NOT NULL,
  jenis       VARCHAR(50)  NOT NULL DEFAULT 'Kelas',
  nama_kelas  VARCHAR(150) NOT NULL,
  FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan) ON DELETE CASCADE
);

-- ─────────────────────────────────────────
-- 4. Tabel reservasi (termasuk info tiket)
--    status:
--      'menunggu'    = sudah dipesan, belum dimulai
--      'berlangsung' = tiket aktif / sedang digunakan
--      'selesai'     = sudah berakhir
--      'dibatalkan'  = dibatalkan user
--      'kadaluarsa'  = melewati waktu tanpa check-in
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservasi (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  kode            VARCHAR(20)  NOT NULL UNIQUE,
  id_ruangan      VARCHAR(10)  NOT NULL,
  nim_pemesan     VARCHAR(20)  NOT NULL,
  nim_anggota     TEXT,
  tujuan          VARCHAR(200),
  tanggal         DATE         NOT NULL,
  jam_mulai       TIME         NOT NULL,
  jam_selesai     TIME         NOT NULL,
  status          ENUM(
                    'menunggu',
                    'berlangsung',
                    'selesai',
                    'dibatalkan',
                    'kadaluarsa'
                  )            NOT NULL DEFAULT 'menunggu',
  waktu_check_in  TIMESTAMP    NULL DEFAULT NULL,
  waktu_selesai   TIMESTAMP    NULL DEFAULT NULL,
  dibuat_pada     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ruangan) REFERENCES ruangan(id_ruangan)
);

-- ====================================================
-- DATA AWAL
-- ====================================================

-- Ruangan
INSERT INTO ruangan VALUES
  ('B301','Ruang B301',30,1,1,1,1,'b301.jpg'),
  ('B302','Ruang B302',25,1,1,0,1,'b302.jpg'),
  ('B303','Ruang B303',40,1,1,1,1,'b303.jpg'),
  ('B304','Ruang B304',30,1,1,0,1,'b304.jpg'),
  ('B305','Ruang B305',35,1,1,1,1,'b305.jpg'),
  ('B306','Ruang B306',20,1,1,0,1,'b306.jpg'),
  ('B307','Ruang B307',20,1,1,1,0,'b307.jpg'),
  ('B308','Ruang B308',30,1,1,1,1,'b308.jpg'),
  ('B309','Ruang B309',25,1,1,0,1,'b309.jpg'),
  ('B310','Ruang B310',40,1,1,1,1,'b310.jpg'),
  ('B311','Ruang B311',30,1,1,1,1,'b311.jpg'),
  ('B312','Ruang B312',35,1,1,0,1,'b312.jpg');

-- Pengguna contoh
INSERT INTO pengguna (nama, nim, kelas) VALUES
  ('Aditya Nugraha',      '23031000001', '3SI1'),
  ('Bintang Saputra',     '23031000002', '3SI1'),
  ('Citra Rahmawati',     '23031000003', '3SI2'),
  ('Dian Kusuma',         '23031000004', '3SI2'),
  ('Eka Prasetyo',        '23031000005', '3SI3'),
  ('Farah Maulida',       '23031000006', '3SI3'),
  ('Gilang Ramadhan',     '23031000007', '4SI1'),
  ('Hana Fitriani',       '23031000008', '4SI1'),
  ('Ivan Prasetya',       '23031000009', '4SI2'),
  ('Julia Andriani',      '23031000010', '4SI2');

-- Jadwal mingguan (hari_ke: 1=Senin...5=Jumat)
INSERT INTO jadwal (id_ruangan, hari_ke, jam_mulai, jam_selesai, jenis, nama_kelas) VALUES
  -- Senin
  ('B301',1,'08:00','10:00','Kelas','Kuliah Pengantar Sistem Informasi (3SI1)'),
  ('B302',1,'13:00','15:00','Kelas','Kuliah Metode Penelitian (3SI2)'),
  ('B303',1,'09:00','12:00','Kelas','Kuliah Pemrograman Web (3SI3)'),
  ('B308',1,'13:00','16:00','Kelas','Kuliah Rekayasa Perangkat Lunak (4SI1)'),
  -- Selasa
  ('B304',2,'15:00','17:00','Kelas','Kuliah Interaksi Manusia dan Komputer (3SI1)'),
  ('B305',2,'10:00','12:00','Kelas','Kuliah Basis Data (3SI2)'),
  ('B309',2,'08:00','10:00','Kelas','Kuliah Statistika (4SI1)'),
  -- Rabu
  ('B306',3,'08:00','09:00','Kelas','Kuliah Matematika Diskrit (3SI1)'),
  ('B307',3,'10:00','12:00','Kelas','Kuliah Jaringan Komputer (3SI3)'),
  ('B310',3,'14:00','16:00','Kelas','Kuliah Kecerdasan Buatan (4SI2)'),
  -- Kamis
  ('B311',4,'11:00','13:00','Kelas','Kuliah Desain Antarmuka (3SI2)'),
  -- Jumat
  ('B312',5,'16:00','18:00','Kelas','Kuliah Sistem Operasi (4SI1)');
