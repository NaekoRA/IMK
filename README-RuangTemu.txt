RUANGTEMU UNESA — PROTOTIPE IMK

File:
- denah-figma.html : halaman utama dan popup filter
- style.css        : gaya dan layout responsif dengan aturan CSS yang ditulis per baris
- script.js        : interaksi, filter denah, perhitungan jadwal, reservasi simulasi, dan tiket
- ruangan.csv      : data dasar ruangan dan fasilitas
- jadwal.csv       : jadwal kelas dalam timestamp ISO 8601 dengan offset WIB (+07:00)

Menjalankan:
1. Simpan semua file di folder yang sama.
2. Buka folder menggunakan server lokal, misalnya VS Code Live Server.
3. Buka denah-figma.html melalui alamat server lokal.
   Jangan membuka langsung dengan file:// karena browser dapat memblokir fetch CSV.

Perilaku simulasi:
- Ruangan merah jika waktu saat ini berada di antara kolom mulai dan selesai pada jadwal.csv.
- Reservasi dicek terhadap jadwal kelas dan reservasi lain selama halaman terbuka.
- Filter dibuka melalui popup dan mendukung beberapa fasilitas sekaligus serta pilihan status. Ruangan yang tidak sesuai akan memudar dan tidak dapat dipilih dari denah.
- Slot reservasi dapat dipilih per jam dengan durasi 1–3 jam.
- Area QR pada tiket saat ini hanya menampilkan teks “INI QR”, sesuai tahap prototipe.
- Data reservasi tidak disimpan ke server atau database dan akan hilang saat halaman dimuat ulang.
- Pengingat 15 menit berjalan saat tiket masih terbuka dan halaman aktif.
- SSO tidak digunakan pada versi ini.

Format jadwal.csv:
id_ruangan,jenis,keterangan,mulai,selesai
B301,Kelas,Kuliah contoh,2026-10-12T08:00:00+07:00,2026-10-12T10:00:00+07:00

Timestamp harus mencantumkan offset zona waktu, misalnya +07:00 untuk WIB.
