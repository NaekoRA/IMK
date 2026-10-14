'use strict';

const rooms = [];
let schedules = [];          // event konkret hari ini dari API
let reservations = [];       // reservasi lokal yang baru dibuat (sebelum reload)
let publicReservations = []; // semua reservasi aktif hari ini dari semua user
let allWeeklySchedules = []; // semua jadwal mingguan dari DB
let selectedRoomId = null;
let activeTicket = null;
let countdownTimer = null;
let reminderShownFor = [];
const API = '';              // base URL kosong → relative ke server Express
const NAMA_HARI_SINGKAT = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];

// ─────────────────────────────────────────
// Session / Login state
// ─────────────────────────────────────────
let currentNIM  = localStorage.getItem('rt_nim')  || '';
let currentName = localStorage.getItem('rt_nama') || '';

function $(id) { return document.getElementById(id); }
const panel = $('roomPanel');
const overlay = $('overlay');
const bookingDialog = $('bookingDialog');
const bookingOverlay = $('bookingOverlay');
const WIB = 'Asia/Jakarta';
let selectedFacilities = [];
let selectedStatuses = [];
let toastTimer;


// ─────────────────────────────────────────
// Load data dari API
// ─────────────────────────────────────────
async function loadData() {
  try {
    // Muat ruangan
    const resRuangan = await fetch(`${API}/api/ruangan`);
    if (!resRuangan.ok) throw new Error('Gagal memuat data ruangan dari server');
    const dataRuangan = await resRuangan.json();
    rooms.length = 0;
    dataRuangan.forEach(function (r) {
      // Normalisasi boolean agar kompatibel dengan isFacilityAvailable
      rooms.push({
        id        : r.id_ruangan,
        nama      : r.nama,
        kapasitas : String(r.kapasitas),
        ac        : r.ac ? 'Ya' : 'Tidak',
        wifi      : r.wifi ? 'Ya' : 'Tidak',
        proyektor : r.proyektor ? 'Ya' : 'Tidak',
        whiteboard: r.whiteboard ? 'Ya' : 'Tidak',
        foto      : r.foto || '',
      });
    });

    // Muat jadwal hari ini
    const tanggal = localDateValue();
    const resJadwal = await fetch(`${API}/api/jadwal?tanggal=${tanggal}`);
    if (!resJadwal.ok) throw new Error('Gagal memuat jadwal dari server');
    const dataJadwal = await resJadwal.json();
    schedules = dataJadwal.map(function (j) {
      return {
        id_ruangan  : j.id_ruangan,
        jenis       : j.jenis,
        keterangan  : j.keterangan,
        start       : new Date(j.mulai),
        end         : new Date(j.selesai),
        source      : 'db',
      };
    });

    // Muat semua jadwal mingguan (untuk tampilan per ruangan)
    const resAllJadwal = await fetch(`${API}/api/jadwal/semua`);
    if (resAllJadwal.ok) {
      allWeeklySchedules = await resAllJadwal.json();
    }

    // Muat reservasi publik hari ini (semua user) → jadwal terlihat semua orang
    const resPub = await fetch(`${API}/api/reservasi/publik?tanggal=${tanggal}`);
    if (resPub.ok) {
      const dataPub = await resPub.json();
      publicReservations = dataPub.map(function (rv) {
        // MySQL2 mengembalikan DATE sebagai objek Date, bisa juga string
        const rawTgl = rv.tanggal;
        let tglStr;
        if (typeof rawTgl === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawTgl)) {
          tglStr = rawTgl;
        } else {
          // Paksa ke YYYY-MM-DD pakai WIB offset
          const d = new Date(rawTgl);
          tglStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        }
        return {
          roomId : rv.id_ruangan,
          start  : new Date(`${tglStr}T${String(rv.jam_mulai).substring(0,5)}+07:00`),
          end    : new Date(`${tglStr}T${String(rv.jam_selesai).substring(0,5)}+07:00`),
          purpose: rv.tujuan || '',
          code   : rv.kode,
          status : rv.status,
          nama_pemesan: rv.nama_pemesan || rv.nim_pemesan || '',
        };
      });
    }

    // Muat reservasi aktif hari ini dari DB
    const resReservasi = await fetch(`${API}/api/reservasi?tanggal=${tanggal}`);
    if (resReservasi.ok) {
      const dataReservasi = await resReservasi.json();
      // Masukkan ke array reservations (format sama dengan lokal)
      dataReservasi.forEach(function (rv) {
        if (rv.status === 'menunggu' || rv.status === 'berlangsung') {
          const rawTgl = rv.tanggal;
          let tglStr;
          if (typeof rawTgl === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawTgl)) {
            tglStr = rawTgl;
          } else {
            const d = new Date(rawTgl);
            tglStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
          }
          reservations.push({
            roomId : rv.id_ruangan,
            start  : new Date(`${tglStr}T${String(rv.jam_mulai).substring(0,5)}+07:00`),
            end    : new Date(`${tglStr}T${String(rv.jam_selesai).substring(0,5)}+07:00`),
            purpose: rv.tujuan || '',
            code   : rv.kode,
            _fromDb: true,
          });
        }
      });
    }

    renderRooms();
    updateLiveStatus();
    updateDateTime();
    setInterval(function () { updateLiveStatus(); updateDateTime(); }, 15000);
  } catch (err) {
    console.error(err);
    showToast('❌ ' + err.message + ' — pastikan server backend berjalan.');
  }
}

// ─────────────────────────────────────────
// Utility
// ─────────────────────────────────────────
function roomById(id) {
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i].id === id) return rooms[i];
  }
  return null;
}
function now() { return new Date(); }
function overlaps(start, end, otherStart, otherEnd) { return start < otherEnd && end > otherStart; }

function roomEvents(roomId, dateStr) {
  const startOfDay = new Date(`${dateStr}T00:00:00+07:00`);
  const endOfDay   = new Date(`${dateStr}T23:59:59.999+07:00`);
  const events = [];
  const addedCodes = new Set();

  schedules.forEach(function (s) {
    if (s.id_ruangan === roomId && overlaps(s.start, s.end, startOfDay, endOfDay)) {
      events.push({ start: s.start, end: s.end, type: s.jenis, title: s.keterangan, source: 'db' });
    }
  });

  // Reservasi publik (semua user, semua yang sudah pesan hari ini)
  publicReservations.forEach(function (rv) {
    if (rv.roomId === roomId && overlaps(rv.start, rv.end, startOfDay, endOfDay)) {
      if (!addedCodes.has(rv.code)) {
        addedCodes.add(rv.code);
        events.push({ start: rv.start, end: rv.end, type: 'Reservasi', title: rv.purpose || 'Reservasi', source: 'reservation', id: rv.code, pemesan: rv.nama_pemesan, status: rv.status });
      }
    }
  });

  // Reservasi lokal yang baru dibuat (sebelum reload API)
  reservations.forEach(function (rv) {
    if (rv.roomId === roomId && overlaps(rv.start, rv.end, startOfDay, endOfDay)) {
      if (!addedCodes.has(rv.code)) {
        addedCodes.add(rv.code);
        events.push({ start: rv.start, end: rv.end, type: 'Reservasi', title: rv.purpose, source: 'reservation', id: rv.code });
      }
    }
  });

  events.sort(function (a, b) { return a.start - b.start; });
  return events;
}

function currentEvent(roomId) {
  const t = now();
  const events = roomEvents(roomId, localDateValue());
  for (let i = 0; i < events.length; i++) {
    if (events[i].start <= t && t < events[i].end) return events[i];
  }
  return null;
}
function roomStatus(roomId) { return currentEvent(roomId) ? 'penuh' : 'tersedia'; }

function localDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = {};
  parts.forEach(function (part) { values[part.type] = part.value; });
  return `${values.year}-${values.month}-${values.day}`;
}
function timeLabel(date) {
  if (!date || isNaN(new Date(date))) return '—';
  return new Intl.DateTimeFormat('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace('.', ':');
}
function dateLabel(date) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
function dateTimeLabel(date) { return `${dateLabel(date)} · ${timeLabel(date)} WIB`; }
function isFacilityAvailable(room, key) {
  return ['ya', 'yes', '1', 1, true].includes(
    typeof room[key] === 'string' ? room[key].toLowerCase() : room[key]
  );
}

// ─────────────────────────────────────────
// Status & render
// ─────────────────────────────────────────
function updateLiveStatus() {
  document.querySelectorAll('.room').forEach(function (button) {
    const room = roomById(button.dataset.room);
    if (!room) return;
    const status = roomStatus(room.id);
    button.classList.toggle('full', status === 'penuh');
    button.classList.toggle('selected', selectedRoomId === room.id);
    button.title = `${room.nama} · ${status === 'penuh' ? 'Sedang digunakan' : 'Tersedia sekarang'}`;
    button.setAttribute('aria-label', button.title);
  });
  let available = 0;
  rooms.forEach(function (room) { if (roomStatus(room.id) === 'tersedia') available++; });
  $('availableCount').textContent = available;
  renderRooms();
  if (selectedRoomId && panel.classList.contains('active')) refreshRoomPanel(selectedRoomId);
}
function updateDateTime() { $('mapDateTime').textContent = `${dateLabel(now())} · ${timeLabel(now())} WIB`; }

function roomMatchesFilters(room) {
  const query = $('searchInput').value.trim().toLowerCase();
  const roomText = (room.id + ' ' + room.nama).toLowerCase();
  if (query && roomText.indexOf(query) === -1) return false;
  for (let i = 0; i < selectedFacilities.length; i++) {
    if (!isFacilityAvailable(room, selectedFacilities[i])) return false;
  }
  if (selectedStatuses.length > 0 && selectedStatuses.indexOf(roomStatus(room.id)) === -1) return false;
  return true;
}

function getWeeklyScheduleForRoom(roomId) {
  return allWeeklySchedules.filter(function (j) { return j.id_ruangan === roomId; });
}

function formatJam(timeStr) {
  // "08:00:00" → "08:00"
  if (!timeStr) return '';
  return String(timeStr).substring(0, 5);
}

function buildMiniScheduleHTML(roomId) {
  const jadwalRoom = getWeeklyScheduleForRoom(roomId);
  const todayStr = localDateValue();

  // Ambil reservasi hari ini untuk ruangan ini
  const todayReservations = publicReservations.filter(function (rv) {
    return rv.roomId === roomId;
  });
  // Tambah juga dari reservations lokal
  reservations.forEach(function (rv) {
    if (rv.roomId === roomId) {
      if (!todayReservations.find(function(r){ return r.code === rv.code; })) {
        todayReservations.push(rv);
      }
    }
  });

  if (!jadwalRoom.length && !todayReservations.length) {
    return '<div class="mini-schedule-empty">Belum ada jadwal tetap</div>';
  }

  let html = '<div class="mini-schedule">';

  // ── Reservasi aktif hari ini ──
  if (todayReservations.length) {
    html += '<div class="mini-schedule-title">📋 Pesanan Hari Ini</div>';
    html += '<div class="mini-reservasi-list">';
    todayReservations.forEach(function (rv) {
      let jamMulai = '—', jamSelesai = '—';
      try {
        if (rv.start instanceof Date && !isNaN(rv.start)) jamMulai = timeLabel(rv.start);
        if (rv.end   instanceof Date && !isNaN(rv.end))   jamSelesai = timeLabel(rv.end);
      } catch (e) { /* biarkan fallback '—' */ }
      const statusClass = rv.status === 'berlangsung' ? 'rv-berlangsung' : 'rv-menunggu';
      html += '<div class="mini-rv-entry ' + statusClass + '">';
      html += '<span class="mini-rv-time">' + jamMulai + '–' + jamSelesai + '</span>';
      html += '<span class="mini-rv-info">';
      if (rv.purpose) html += escapeHTML(rv.purpose);
      if (rv.nama_pemesan) html += '<small> · ' + escapeHTML(rv.nama_pemesan) + '</small>';
      html += '</span>';
      html += '<span class="mini-rv-badge ' + statusClass + '">' + (rv.status === 'berlangsung' ? '🔵 Berlangsung' : '🟡 Menunggu') + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }


  // ── Jadwal Mingguan tetap ──
  if (jadwalRoom.length) {
    // Group by hari_ke
    const grouped = {};
    jadwalRoom.forEach(function (j) {
      if (!grouped[j.hari_ke]) grouped[j.hari_ke] = [];
      grouped[j.hari_ke].push(j);
    });

    html += '<div class="mini-schedule-title">📅 Jadwal Mingguan</div>';
    html += '<div class="mini-schedule-grid">';

    // Iterate 1=Senin to 7=Minggu
    for (let h = 1; h <= 7; h++) {
      const hariLabel = NAMA_HARI_SINGKAT[h - 1];
      const entries = grouped[h] || [];
      html += '<div class="mini-sched-day">';
      html += '<span class="mini-sched-hari' + (entries.length ? ' has-class' : '') + '">' + hariLabel + '</span>';
      if (entries.length) {
        html += '<div class="mini-sched-entries">';
        entries.forEach(function (e) {
          html += '<div class="mini-sched-entry">';
          html += '<span class="mini-sched-time">' + formatJam(e.jam_mulai) + '–' + formatJam(e.jam_selesai) + '</span>';
          html += '<span class="mini-sched-name">' + escapeHTML(e.nama_kelas) + '</span>';
          html += '</div>';
        });
        html += '</div>';
      } else {
        html += '<div class="mini-sched-free">Kosong</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderRooms() {
  const filtered = rooms.filter(function (room) { return roomMatchesFilters(room); });
  $('roomGrid').innerHTML = '';
  filtered.forEach(function (room) {
    const status = roomStatus(room.id);
    const card = document.createElement('div');
    card.className = 'room-card-wrapper';
    card.innerHTML = 
      '<button class="room-card" type="button">' +
        '<span class="card-room-icon">⌂</span>' +
        '<span class="card-main">' +
          '<strong>' + escapeHTML(room.id) + '</strong>' +
          '<small>' + escapeHTML(room.nama) + ' · ' + escapeHTML(room.kapasitas) + ' orang</small>' +
        '</span>' +
        '<span class="mini-status ' + (status === 'penuh' ? 'occupied' : '') + '">' +
          '<i></i>' + (status === 'penuh' ? 'Digunakan' : 'Tersedia') +
        '</span>' +
        '<span class="card-arrow">↗</span>' +
      '</button>' +
      buildMiniScheduleHTML(room.id);
    card.querySelector('.room-card').addEventListener('click', function () { openRoom(room.id); });
    $('roomGrid').appendChild(card);
  });

  document.querySelectorAll('.room').forEach(function (button) {
    const room = roomById(button.dataset.room);
    if (!room) return;
    const matches = roomMatchesFilters(room);
    button.classList.toggle('filtered-out', !matches);
    button.disabled = !matches;
    if (!matches) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  });

  const activeFilterCount = selectedFacilities.length + selectedStatuses.length;
  $('filterCount').textContent = activeFilterCount;
  $('filterCount').classList.toggle('hidden', activeFilterCount === 0);
  $('resultCount').textContent = `${filtered.length} ruangan`;
  $('emptyState').classList.toggle('hidden', filtered.length > 0);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ─────────────────────────────────────────
// Panel detail ruangan
// ─────────────────────────────────────────
function openRoom(id) {
  const room = roomById(id);
  if (!room) return;
  selectedRoomId = id;
  document.querySelectorAll('.room').forEach(function (button) {
    button.classList.toggle('selected', button.dataset.room === id);
  });
  refreshRoomPanel(id);
  panel.classList.add('active'); overlay.classList.add('active');
  panel.setAttribute('aria-hidden', 'false');
}

function refreshRoomPanel(id) {
  const room = roomById(id); if (!room) return;
  $('roomCode').textContent = room.id;
  $('roomName').textContent = room.nama;
  $('roomCapacity').textContent = `Kapasitas ${room.kapasitas} orang`;
  const image = $('roomImage');
  image.onerror = function () { image.onerror = null; image.src = makePlaceholder(room.id); };
  image.src = `assets/${room.foto}`; image.alt = `Foto ${room.nama}`;
  const status = roomStatus(id);
  const event = currentEvent(id);
  $('roomStatus').textContent = status === 'penuh' ? 'Sedang digunakan' : 'Tersedia sekarang';
  $('roomStatus').className = `status-badge ${status === 'penuh' ? 'full' : ''}`;
  $('roomScheduleSummary').textContent = event ? `Selesai ${timeLabel(event.end)}` : 'Bisa dipesan';
  $('facilities').innerHTML = '';
  const facilityList = [['AC','ac'],['WiFi','wifi'],['Proyektor','proyektor'],['Whiteboard','whiteboard']];
  facilityList.forEach(function (fac) {
    const enabled = isFacilityAvailable(room, fac[1]);
    const item = document.createElement('div');
    item.className = 'facility' + (enabled ? '' : ' off');
    item.innerHTML = `<span>${enabled ? '✓' : '×'}</span>${fac[0]}`;
    $('facilities').appendChild(item);
  });
  renderSchedule(id);
  $('bookingBtn').disabled = false;
  $('bookingBtn').innerHTML = status === 'penuh'
    ? 'Lihat jadwal & pesan nanti <span>→</span>'
    : 'Pesan ruangan <span>→</span>';
}

function makePlaceholder(roomId) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#e7eee9"/><circle cx="400" cy="190" r="60" fill="#d2e1d6"/><path d="M290 330h220v-95H290z" fill="#b6cdbd"/><text x="400" y="410" font-family="Arial,sans-serif" font-size="32" fill="#456b59" text-anchor="middle">${roomId} · RuangTemu</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderSchedule(roomId) {
  const events = roomEvents(roomId, localDateValue());
  const nowDate = now();
  const upcoming = events.filter(function (e) { return e.end > nowDate; });
  $('scheduleList').innerHTML = '';
  if (!upcoming.length) {
    $('scheduleList').innerHTML = '<div class="schedule-empty"><span>✓</span><div><strong>Belum ada jadwal berikutnya</strong><small>Periksa waktu yang diinginkan pada formulir reservasi.</small></div></div>';
    return;
  }
  upcoming.forEach(function (event) {
    const ongoing = event.start <= nowDate && nowDate < event.end;
    const isReservasi = event.source === 'reservation';
    const item = document.createElement('div');
    item.className = 'schedule-item' + (ongoing ? ' is-current' : '') + (isReservasi ? ' is-reservasi' : '');
    const pemesanInfo = isReservasi && event.pemesan ? ` · ${escapeHTML(event.pemesan)}` : '';
    const statusLabel = isReservasi
      ? (ongoing ? '🔵 Berlangsung' : '🟡 Menunggu')
      : (ongoing ? 'Berjalan' : 'Terjadwal');
    const indicatorClass = 'schedule-indicator' + (ongoing ? ' active' : '') + (isReservasi ? ' reservasi-indicator' : '');
    item.innerHTML =
      `<span class="schedule-time">${timeLabel(event.start)}<small>${timeLabel(event.end)}</small></span>` +
      `<span class="schedule-info"><strong>${escapeHTML(event.title)}</strong><small>${escapeHTML(event.type)}${pemesanInfo}${ongoing ? ' · Berlangsung' : ''}</small></span>` +
      `<span class="${indicatorClass}">${statusLabel}</span>`;
    $('scheduleList').appendChild(item);
  });
}

function closeRoom() {
  panel.classList.remove('active'); overlay.classList.remove('active');
  panel.setAttribute('aria-hidden', 'true');
}

// ─────────────────────────────────────────
// Booking / Reservasi
// ─────────────────────────────────────────
function openBooking() {
  if (!selectedRoomId) return;
  const room = roomById(selectedRoomId);
  $('bookingRoomLabel').textContent = `${room.id} · ${room.nama}`;
  $('bookingDate').value = localDateValue();
  $('bookingDate').min   = localDateValue();
  // ── AUTO-FILL NIM dari sesi yang aktif ──
  if (currentNIM && !$('ownerNim').value) {
    $('ownerNim').value = currentNIM;
    lookupNim($('ownerNim'), 'nimPemesanInfo');
  }
  populateStartTimes();
  checkBookingAvailability();
  bookingDialog.classList.add('active');
  bookingOverlay.classList.add('active');
  bookingDialog.setAttribute('aria-hidden', 'false');
}

function closeBooking() {
  bookingDialog.classList.remove('active');
  bookingOverlay.classList.remove('active');
  bookingDialog.setAttribute('aria-hidden', 'true');
}

function populateStartTimes() {
  const select = $('startTime');
  const previous = select.value;
  select.innerHTML = '';
  for (let hour = 7; hour <= 20; hour++) {
    // Tambahkan :00 dan :30
    ['00', '30'].forEach(function(min) {
      if (hour === 20 && min === '30') return; // batas 20:00
      const value = `${String(hour).padStart(2, '0')}:${min}`;
      const option = document.createElement('option');
      option.value = value; option.textContent = value;
      select.appendChild(option);
    });
  }
  let exists = false;
  for (let i = 0; i < select.options.length; i++) { if (select.options[i].value === previous) exists = true; }
  if (exists) select.value = previous;
}

function getBookingRange() {
  const date = $('bookingDate').value;
  const startTime = $('startTime').value;
  const duration  = Number($('duration').value || 1);
  if (!date || !startTime) return null;
  const start = new Date(`${date}T${startTime}:00+07:00`);
  const end   = new Date(start.getTime() + duration * 60 * 60 * 1000);
  return { start, end, date, duration };
}

function findConflict(roomId, start, end) {
  const t = now();
  if (start <= t) return { title: 'Waktu mulai harus setelah waktu sekarang', start, end };
  const events = roomEvents(roomId, localDateValue(start));
  for (let i = 0; i < events.length; i++) {
    if (overlaps(start, end, events[i].start, events[i].end)) return events[i];
  }
  return null;
}

function checkBookingAvailability() {
  if (!selectedRoomId) return false;
  const range = getBookingRange();
  if (!range) {
    $('availabilityMessage').textContent = 'Pilih tanggal dan waktu untuk memeriksa jadwal.';
    $('confirmBooking').disabled = true;
    return false;
  }

  // Hitung slot bersamaan dari publicReservations
  const MAX_BERSAMAAN = 4;
  let slotTerpakai = 0;
  publicReservations.forEach(function (rv) {
    if (overlaps(rv.start, rv.end, range.start, range.end)) slotTerpakai++;
  });
  reservations.forEach(function (rv) {
    const rvStart = rv.start, rvEnd = rv.end;
    if (overlaps(rvStart, rvEnd, range.start, range.end)) {
      if (!publicReservations.find(function(p){ return p.code === rv.code; })) slotTerpakai++;
    }
  });
  const slotTersisa = MAX_BERSAMAAN - slotTerpakai;
  const slotInfo = slotTerpakai >= MAX_BERSAMAAN
    ? '⛔ Slot jam ini sudah penuh (maks 4 pesanan bersamaan).'
    : `🟢 Slot tersedia: ${slotTersisa} dari ${MAX_BERSAMAAN}`;

  // Cek kapasitas ruangan
  const room = roomById(selectedRoomId);
  const friendNimsRaw = $('friendNims') ? $('friendNims').value.split(/[\s,;]+/).filter(function(n){ return n.trim(); }) : [];
  const totalPeserta = 1 + friendNimsRaw.length;
  const kapasitas = room ? Number(room.kapasitas) : 0;
  if (kapasitas > 0 && totalPeserta > kapasitas) {
    $('availabilityMessage').innerHTML = `⛔ Jumlah peserta (${totalPeserta}) melebihi kapasitas ruangan (${kapasitas} orang). Kurangi anggota.`;
    $('availabilityMessage').className = 'availability-message error';
    $('confirmBooking').disabled = true;
    return false;
  }

  if (slotTerpakai >= MAX_BERSAMAAN) {
    $('availabilityMessage').innerHTML = `${slotInfo} Pilih waktu lain.`;
    $('availabilityMessage').className = 'availability-message error';
    $('confirmBooking').disabled = true;
    return false;
  }

  const conflict = findConflict(selectedRoomId, range.start, range.end);
  if (conflict) {
    const title = conflict.title || 'Jadwal sudah terisi';
    $('availabilityMessage').innerHTML = `${title}${conflict.start ? ` · ${timeLabel(conflict.start)}–${timeLabel(conflict.end)} WIB` : ''}. Silakan pilih waktu lain.<br><small>${slotInfo}</small>`;
    $('availabilityMessage').className = 'availability-message error';
    $('confirmBooking').disabled = true;
    return false;
  }
  $('availabilityMessage').innerHTML = `Waktu tersedia: ${dateTimeLabel(range.start)}–${timeLabel(range.end)} WIB.<br><small>${slotInfo}</small>`;
  $('availabilityMessage').className = 'availability-message success';
  $('confirmBooking').disabled = false;
  return true;
}

// ─────────────────────────────────────────
// NIM lookup — auto-fill nama dari database
// ─────────────────────────────────────────
let nimLookupTimer;
async function lookupNim(nimInput, targetSpanId) {
  clearTimeout(nimLookupTimer);
  const nim = nimInput.value.trim();
  const span = $(targetSpanId);
  if (!span) return;
  if (!/^[0-9]{8,15}$/.test(nim)) { span.textContent = ''; return; }
  nimLookupTimer = setTimeout(async function () {
    try {
      const res = await fetch(`${API}/api/pengguna/${nim}`);
      if (res.ok) {
        const data = await res.json();
        span.textContent = `✓ ${data.nama} · ${data.kelas}`;
        span.style.color = '#277448';
      } else {
        span.textContent = 'NIM tidak terdaftar';
        span.style.color = '#aa403a';
      }
    } catch { span.textContent = ''; }
  }, 500);
}

// ─────────────────────────────────────────
// Submit booking → POST ke API
// ─────────────────────────────────────────
async function submitBooking(event) {
  event.preventDefault();
  if (!checkBookingAvailability()) return;
  const range      = getBookingRange();
  const ownerNim   = $('ownerNim').value.trim();
  if (!/^[0-9]{8,15}$/.test(ownerNim)) { showToast('NIM harus berisi 8–15 digit angka.'); return; }

  const friendNimsRaw = $('friendNims').value.split(/[\s,;]+/);
  const friendNims = [];
  friendNimsRaw.forEach(function (n) { if (n.trim()) friendNims.push(n.trim()); });
  for (let i = 0; i < friendNims.length; i++) {
    if (!/^[0-9]{8,15}$/.test(friendNims[i])) { showToast('Periksa NIM teman: gunakan 8–15 digit angka.'); return; }
  }

  // Hitung jam WIB secara akurat
  function toWIBHHMM(date) {
    const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const h = wib.getUTCHours();
    const m = wib.getUTCMinutes();
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  const jamMulai   = toWIBHHMM(range.start);
  const jamSelesai = toWIBHHMM(range.end);

  const payload = {
    id_ruangan : selectedRoomId,
    nim_pemesan: ownerNim,
    nim_anggota: friendNims.join(', ') || null,
    tujuan     : $('purpose').value.trim(),
    tanggal    : range.date,
    jam_mulai  : jamMulai,
    jam_selesai: jamSelesai,
  };

  try {
    $('confirmBooking').disabled = true;
    $('confirmBooking').textContent = 'Menyimpan…';

    const res = await fetch(`${API}/api/reservasi`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast('❌ ' + (data.pesan || 'Gagal membuat reservasi'));
      $('confirmBooking').disabled = false;
      $('confirmBooking').innerHTML = 'Buat tiket <span>→</span>';
      return;
    }

    // Simpan ke reservations lokal agar langsung kelihatan di UI
    const lokal = {
      roomId : selectedRoomId,
      start  : range.start,
      end    : range.end,
      purpose: payload.tujuan,
      code   : data.kode,
    };
    reservations.push(lokal);
    activeTicket = {
      code      : data.kode,
      roomId    : selectedRoomId,
      start     : range.start,
      end       : range.end,
      purpose   : payload.tujuan,
      ownerNim,
      friendNims,
    };

    closeBooking(); closeRoom();
    renderTicket(activeTicket);
    updateLiveStatus();
    $('ticketDialog').classList.add('active');
    $('ticketDialog').setAttribute('aria-hidden', 'false');
    startCountdown();

    $('confirmBooking').disabled = false;
    $('confirmBooking').innerHTML = 'Buat tiket <span>→</span>';
  } catch (err) {
    showToast('❌ Tidak bisa terhubung ke server. Pastikan backend berjalan.');
    $('confirmBooking').disabled = false;
    $('confirmBooking').innerHTML = 'Buat tiket <span>→</span>';
  }
}

// ─────────────────────────────────────────
// Tiket
// ─────────────────────────────────────────
function renderTicket(ticket) {
  const room = roomById(ticket.roomId);
  $('ticketCode').textContent = ticket.code;
  $('ticketDetails').innerHTML =
    `<div><small>RUANGAN</small><strong>${escapeHTML(room.id)} · ${escapeHTML(room.nama)}</strong></div>` +
    `<div><small>TANGGAL</small><strong>${dateLabel(ticket.start)}</strong></div>` +
    `<div><small>WAKTU</small><strong>${timeLabel(ticket.start)}–${timeLabel(ticket.end)} WIB</strong></div>` +
    `<div><small>TUJUAN</small><strong>${escapeHTML(ticket.purpose)}</strong></div>` +
    `<div><small>PEMESAN (NIM)</small><strong>${escapeHTML(ticket.ownerNim)}</strong></div>` +
    `<div><small>ANGGOTA</small><strong>${ticket.friendNims.length ? ticket.friendNims.map(escapeHTML).join(', ') : 'Tidak ada anggota tambahan'}</strong></div>`;

  // ── QR Code nyata via qrcode.js ──
  const qrEl = $('qrCode');
  qrEl.innerHTML = ''; // bersihkan QR sebelumnya
  const qrData = `RUANGTEMU|${ticket.code}|${room.id}|${ticket.ownerNim}`;
  try {
    new QRCode(qrEl, {
      text      : qrData,
      width     : 160,
      height    : 160,
      colorDark : '#123b32',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (e) {
    qrEl.textContent = ticket.code; // fallback teks jika CDN gagal load
  }
}


function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  function tick() {
    if (!activeTicket) return;
    const remaining = activeTicket.end.getTime() - Date.now();
    if (remaining <= 0) {
      $('ticketCountdown').textContent = 'Waktu selesai';
      clearInterval(countdownTimer);
      // Tandai selesai di server
      fetch(`${API}/api/reservasi/${activeTicket.code}/selesai`, { method: 'PATCH' }).catch(() => {});
      return;
    }
    const totalMinutes = Math.floor(remaining / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const seconds = Math.floor((remaining % 60000) / 1000);
    $('ticketCountdown').textContent = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    if (remaining <= 15 * 60 * 1000 && reminderShownFor.indexOf(activeTicket.code) === -1) {
      reminderShownFor.push(activeTicket.code);
      showToast('⏰ Pengingat: waktu peminjaman tersisa 15 menit.');
    }
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function closeTicket() {
  $('ticketDialog').classList.remove('active');
  $('ticketDialog').setAttribute('aria-hidden', 'true');
  if (countdownTimer) clearInterval(countdownTimer);
  activeTicket = null;
  updateLiveStatus();
}

function shareTicket() {
  if (!activeTicket) return;
  const room = roomById(activeTicket.roomId);
  const text = `Tiket RuangTemu\nKode: ${activeTicket.code}\nRuangan: ${room.id} - ${room.nama}\nTanggal: ${dateLabel(activeTicket.start)}\nWaktu: ${timeLabel(activeTicket.start)}-${timeLabel(activeTicket.end)} WIB\nTujuan: ${activeTicket.purpose}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

// ─────────────────────────────────────────
// Toast
// ─────────────────────────────────────────
function showToast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 4200);
}

// ─────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────
$('searchInput').addEventListener('input', renderRooms);

function openFilter() {
  document.querySelectorAll('input[name="facility"]').forEach(function (input) {
    input.checked = selectedFacilities.indexOf(input.value) !== -1;
  });
  document.querySelectorAll('input[name="roomStatus"]').forEach(function (input) {
    input.checked = selectedStatuses.indexOf(input.value) !== -1;
  });
  $('filterDialog').classList.add('active');
  $('filterOverlay').classList.add('active');
  $('filterDialog').setAttribute('aria-hidden', 'false');
}
function closeFilter() {
  $('filterDialog').classList.remove('active');
  $('filterOverlay').classList.remove('active');
  $('filterDialog').setAttribute('aria-hidden', 'true');
}
function applyFilters() {
  selectedFacilities = [];
  selectedStatuses   = [];
  document.querySelectorAll('input[name="facility"]:checked').forEach(function (input) {
    selectedFacilities.push(input.value);
  });
  document.querySelectorAll('input[name="roomStatus"]:checked').forEach(function (input) {
    selectedStatuses.push(input.value);
  });
  closeFilter();
  renderRooms();
}
function clearFilters() {
  selectedFacilities = [];
  selectedStatuses   = [];
  document.querySelectorAll('.filter-options input').forEach(function (input) { input.checked = false; });
  renderRooms();
}

$('openFilter').addEventListener('click', openFilter);
$('filterClose').addEventListener('click', closeFilter);
$('filterOverlay').addEventListener('click', closeFilter);
$('applyFilters').addEventListener('click', applyFilters);
$('clearFilters').addEventListener('click', clearFilters);

document.querySelectorAll('.room').forEach(function (button) {
  button.addEventListener('click', function () { if (!button.disabled) openRoom(button.dataset.room); });
});

$('closeBtn').addEventListener('click', closeRoom);
overlay.addEventListener('click', closeRoom);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeRoom(); closeBooking(); closeTicket(); closeFilter(); closeLoginDialog(); closeMyTickets(); }
});

$('bookingBtn').addEventListener('click', openBooking);
$('bookingClose').addEventListener('click', closeBooking);
bookingOverlay.addEventListener('click', closeBooking);
$('bookingDate').addEventListener('change', function () { populateStartTimes(); checkBookingAvailability(); });
['startTime', 'duration'].forEach(function (id) { $(id).addEventListener('change', checkBookingAvailability); });
$('bookingForm').addEventListener('submit', submitBooking);

// NIM lookup
$('ownerNim').addEventListener('input', function () { lookupNim($('ownerNim'), 'nimPemesanInfo'); });
// Cek kapasitas dan slot saat jumlah anggota berubah
if ($('friendNims')) { $('friendNims').addEventListener('input', function () { checkBookingAvailability(); }); }

$('ticketClose').addEventListener('click', closeTicket);
$('finishTicket').addEventListener('click', closeTicket);
$('shareTicket').addEventListener('click', shareTicket);

// ─────────────────────────────────────────
// Session / Login
// ─────────────────────────────────────────
function renderSessionUI() {
  const loginBtn  = $('sessionLoginBtn');
  const userBlock = $('sessionUser');
  const nimLabel  = $('sessionNimLabel');
  if (currentNIM) {
    loginBtn.classList.add('hidden');
    userBlock.classList.remove('hidden');
    nimLabel.textContent = currentName ? `${currentName} (${currentNIM})` : currentNIM;
  } else {
    loginBtn.classList.remove('hidden');
    userBlock.classList.add('hidden');
  }
}

function openLoginDialog() {
  $('loginDialog').classList.add('active');
  $('loginOverlay').classList.add('active');
  $('loginDialog').setAttribute('aria-hidden', 'false');
  $('loginNimInput').value = currentNIM || '';
  $('loginNimInfo').textContent = '';
  setTimeout(function () { $('loginNimInput').focus(); }, 100);
}

function closeLoginDialog() {
  $('loginDialog').classList.remove('active');
  $('loginOverlay').classList.remove('active');
  $('loginDialog').setAttribute('aria-hidden', 'true');
}

async function submitLogin() {
  const nim = $('loginNimInput').value.trim();
  if (!/^[0-9]{8,15}$/.test(nim)) {
    $('loginNimInfo').textContent = '⚠ NIM harus 8–15 digit angka';
    $('loginNimInfo').style.color = '#aa403a';
    return;
  }
  $('loginNimInfo').textContent = 'Memeriksa…';
  $('loginNimInfo').style.color = '#666';
  try {
    const res = await fetch(`${API}/api/pengguna/${nim}`);
    if (res.ok) {
      const data = await res.json();
      currentNIM  = nim;
      currentName = data.nama || '';
      localStorage.setItem('rt_nim', currentNIM);
      localStorage.setItem('rt_nama', currentName);
      renderSessionUI();
      closeLoginDialog();
      showToast(`✓ Selamat datang, ${currentName || currentNIM}!`);
    } else {
      $('loginNimInfo').textContent = '✗ NIM tidak ditemukan di database';
      $('loginNimInfo').style.color = '#aa403a';
    }
  } catch {
    $('loginNimInfo').textContent = '✗ Tidak bisa terhubung ke server';
    $('loginNimInfo').style.color = '#aa403a';
  }
}

// Enter key on NIM input
$('loginNimInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); submitLogin(); }
});

function logoutSession() {
  currentNIM  = '';
  currentName = '';
  localStorage.removeItem('rt_nim');
  localStorage.removeItem('rt_nama');
  renderSessionUI();
  showToast('Sesi diakhiri. Sampai jumpa!');
}




// ─────────────────────────────────────────
// Tab "Tiket Saya"
// ─────────────────────────────────────────
let myTicketsQrInstances = []; // simpan instance agar bisa di-clear

async function openMyTickets() {
  if (!currentNIM) {
    openLoginDialog();
    return;
  }
  $('myTicketsDialog').classList.add('active');
  $('myTicketsOverlay').classList.add('active');
  $('myTicketsDialog').setAttribute('aria-hidden', 'false');
  $('myTicketsNimLabel').textContent = `NIM: ${currentNIM}${currentName ? ' · ' + currentName : ''}`;
  $('myTicketsList').innerHTML = '<p class="muted" style="text-align:center;padding:32px 0;">Memuat tiket…</p>';
  myTicketsQrInstances = [];

  try {
    const res = await fetch(`${API}/api/reservasi/nim/${currentNIM}`);
    if (!res.ok) throw new Error('Gagal memuat tiket');
    const data = await res.json();
    renderMyTickets(data);
  } catch (err) {
    $('myTicketsList').innerHTML = `<p class="muted" style="text-align:center;padding:32px 0;">❌ ${err.message}</p>`;
  }
}

function closeMyTickets() {
  $('myTicketsDialog').classList.remove('active');
  $('myTicketsOverlay').classList.remove('active');
  $('myTicketsDialog').setAttribute('aria-hidden', 'true');
}

function statusBadgeHTML(status) {
  const map = {
    menunggu    : ['#e8a020', 'Menunggu'],
    berlangsung : ['#277448', 'Berlangsung'],
    selesai     : ['#5a7a6a', 'Selesai'],
    dibatalkan  : ['#aa403a', 'Dibatalkan'],
    kadaluarsa  : ['#888', 'Kadaluarsa'],
  };
  const [color, label] = map[status] || ['#888', status];
  return `<span class="my-ticket-status" style="background:${color}15;color:${color};border:1px solid ${color}40;">${label}</span>`;
}

function renderMyTickets(tickets) {
  const list = $('myTicketsList');
  if (!tickets.length) {
    list.innerHTML = '<p class="muted" style="text-align:center;padding:40px 0;">Belum ada tiket. Buat reservasi pertamamu!</p>';
    return;
  }

  list.innerHTML = '';
  tickets.forEach(function (t, idx) {
    const card = document.createElement('div');
    card.className = 'my-ticket-card';

    const startStr = t.jam_mulai ? t.jam_mulai.substring(0,5) : '—';
    const endStr   = t.jam_selesai ? t.jam_selesai.substring(0,5) : '—';
    // MySQL DATE field dikirim sebagai ISO datetime string oleh mysql2
    // → parse langsung pakai new Date() lalu format ke WIB
    let dateStr = '—';
    if (t.tanggal) {
      try {
        // Jika sudah YYYY-MM-DD, tambahkan offset WIB supaya tidak off-by-one
        const raw = String(t.tanggal);
        const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
          ? new Date(raw + 'T12:00:00+07:00')
          : new Date(raw);
        if (!isNaN(d)) {
          dateStr = d.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: 'numeric', month: 'short', year: 'numeric'
          });
        }
      } catch (e) { dateStr = t.tanggal; }
    }

    const qrContainerId = `myqr_${idx}`;
    card.innerHTML =
      `<div class="my-ticket-head">` +
        `<div>` +
          `<span class="my-ticket-kode">${escapeHTML(t.kode)}</span>` +
          statusBadgeHTML(t.status) +
        `</div>` +
        `<div class="my-ticket-room">${escapeHTML(t.id_ruangan)} · ${escapeHTML(t.nama_ruangan || '')}</div>` +
      `</div>` +
      `<div class="my-ticket-body">` +
        `<div class="my-ticket-qr" id="${qrContainerId}"></div>` +
        `<div class="my-ticket-info">` +
          `<div><small>TANGGAL</small><strong>${dateStr}</strong></div>` +
          `<div><small>WAKTU</small><strong>${startStr}–${endStr} WIB</strong></div>` +
          `<div><small>TUJUAN</small><strong>${escapeHTML(t.tujuan || '—')}</strong></div>` +
          `<div><small>PEMESAN</small><strong>${escapeHTML(t.nim_pemesan)}</strong></div>` +
          (t.nim_anggota ? `<div><small>ANGGOTA</small><strong>${escapeHTML(t.nim_anggota)}</strong></div>` : '') +
        `</div>` +
      `</div>`;

    list.appendChild(card);

    // Generate QR per tiket
    try {
      const qrData = `RUANGTEMU|${t.kode}|${t.id_ruangan}|${t.nim_pemesan}`;
      new QRCode(document.getElementById(qrContainerId), {
        text        : qrData,
        width       : 100,
        height      : 100,
        colorDark   : '#123b32',
        colorLight  : '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (e) {
      document.getElementById(qrContainerId).textContent = t.kode;
    }
  });
}

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────
renderSessionUI();
loadData();

