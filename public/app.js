import { db } from './db.js';

const EVENT = 'CBN Exclusive Night';
const RESET_SEC = 10;
const SOUND = true;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const hhmm = t => t ? new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':') : '';
const ic = (name, cls = '') => `<span class="i ${cls}">${name}</span>`;
const vipBadge = `<span class="badge b-vip">${ic('workspace_premium')}VIP</span>`;
const regBadge = `<span class="badge b-reg">Regular</span>`;
const showErr = (el, msg) => { el.hidden = !msg; el.lastElementChild.textContent = msg || ''; };

let guests = [], me = '', view = 'admin', filter = 'all', tier = 'VIP', editingId = null, log = [];
const form = $('guestForm'), F = form.elements;
document.querySelectorAll('.ev').forEach(e => e.textContent = EVENT);

// ---------- data ----------
async function load() {
  const { data, error } = await db.from('guests').select('*').order('created_at', { ascending: false });
  if (error) return showErr($('adminErr'), error.message);
  guests = data; renderAdmin();
}

function toast(msg) {
  clearTimeout(toast.t);
  $('toast').innerHTML = `<div class="toast">${ic('check_circle')}${esc(msg)}</div>`;
  toast.t = setTimeout(() => $('toast').innerHTML = '', 2400);
}

// ---------- admin ----------
function renderAdmin() {
  const total = guests.length, vip = guests.filter(g => g.tier === 'VIP').length, inCount = guests.filter(g => g.checked_in_at).length;
  const S = { total, vip, reg: total - vip, in: inCount };
  document.querySelectorAll('[data-s]').forEach(e => e.textContent = S[e.dataset.s]);
  $('pct').style.width = (total ? Math.round(inCount / total * 100) : 0) + '%';

  const defs = [['all', 'Semua', total], ['vip', 'VIP', vip], ['reg', 'Regular', total - vip], ['in', 'Hadir', inCount], ['out', 'Belum hadir', total - inCount]];
  $('chips').innerHTML = defs.map(([k, l, n]) => `<button class="${filter === k ? 'on' : ''}" data-f="${k}">${l}<small>${n}</small></button>`).join('');

  const tables = [...new Set(guests.map(g => g.table_no).filter(Boolean))].sort().slice(0, 10);
  $('tableChips').innerHTML = tables.map(t => `<button type="button" data-t="${esc(t)}">${esc(t)}</button>`).join('');

  const q = $('q').value.trim().toLowerCase();
  const rows = guests.filter(g =>
    (filter === 'all' || (filter === 'vip' && g.tier === 'VIP') || (filter === 'reg' && g.tier !== 'VIP') || (filter === 'in' && g.checked_in_at) || (filter === 'out' && !g.checked_in_at)) &&
    (!q || [g.name, g.company, g.table_no, g.code].join(' ').toLowerCase().includes(q)));
  $('rows').innerHTML = rows.map(g => `<div class="tr">
    <div class="who"><b>${esc(g.name)}</b><span>${esc(g.company || '—')}</span></div>
    <div>${g.tier === 'VIP' ? vipBadge : regBadge}</div>
    <span class="tbl">${esc(g.table_no || '—')}</span>
    <span class="mono code">${esc(g.code)}</span>
    <div>${g.checked_in_at ? `<span class="badge b-in dot">Hadir ${hhmm(g.checked_in_at)}</span>` : '<span class="out">Belum hadir</span>'}</div>
    <div class="acts">
      <button class="tk" data-ticket="${g.id}" title="Lihat tiket">${ic('confirmation_number')}</button>
      <button data-edit="${g.id}" title="Edit">${ic('edit')}</button>
      <button class="del" data-del="${g.id}" title="Hapus">${ic('delete')}</button>
    </div></div>`).join('') || `<div class="empty"><div class="ibox">${ic('person_search')}</div>
      <b>${total ? 'Tidak ada yang cocok' : 'Belum ada tamu'}</b>
      <span>${total ? 'Coba kata kunci atau filter lain.' : 'Tambahkan tamu pertama lewat formulir di kiri.'}</span></div>`;
  $('rowCount').textContent = `Menampilkan ${rows.length} dari ${total} tamu`;
}

function renderForm() {
  document.querySelectorAll('#tierSeg button').forEach(b => {
    const on = b.dataset.tier === tier;
    b.classList.toggle('on', on);
  });
  $('formTitle').textContent = editingId ? 'Edit tamu' : 'Tambah tamu';
  $('formIcon').textContent = editingId ? 'edit' : 'person_add';
  $('submitBtn').innerHTML = editingId ? `${ic('check')}<span>Simpan perubahan</span>` : `${ic('add')}<span>Simpan tamu</span>`;
  $('cancelEdit').hidden = !editingId;
}

function resetForm() {
  editingId = null; form.reset(); showErr($('formErr')); renderForm();
}

form.onsubmit = async e => {
  e.preventDefault();
  const row = { name: F.name.value.trim(), company: F.company.value.trim() || null, tier, table_no: F.table_no.value.trim().toUpperCase() };
  if (!row.name || !row.table_no) return showErr($('formErr'), !row.name ? 'Nama wajib diisi.' : 'Nomor meja wajib diisi.');
  $('submitBtn').disabled = true;
  const { error } = editingId
    ? await db.from('guests').update(row).eq('id', editingId)
    : await db.from('guests').insert(row);
  $('submitBtn').disabled = false;
  if (error) return showErr($('formErr'), error.code === '42501' ? notAdminMsg() : error.message);
  toast(editingId ? 'Perubahan disimpan' : row.name + ' ditambahkan');
  resetForm(); F.name.focus(); load();
};

$('tierSeg').onclick = e => { const b = e.target.closest('button'); if (b) { tier = b.dataset.tier; renderForm(); } };
$('tableChips').onclick = e => { const b = e.target.closest('button'); if (b) F.table_no.value = b.dataset.t; };
$('cancelEdit').onclick = resetForm;
$('q').oninput = renderAdmin;
$('chips').onclick = e => { const b = e.target.closest('button'); if (b) { filter = b.dataset.f; renderAdmin(); } };

$('rows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const g = guests.find(x => x.id === (b.dataset.ticket || b.dataset.edit || b.dataset.del));
  if (b.dataset.ticket) openTicket(g);
  if (b.dataset.edit) {
    editingId = g.id; tier = g.tier;
    F.name.value = g.name; F.company.value = g.company || ''; F.table_no.value = g.table_no || '';
    showErr($('formErr')); renderForm(); window.scrollTo({ top: 0, behavior: 'smooth' }); F.name.focus();
  }
  if (b.dataset.del && confirm(`Hapus ${g.name} dari daftar tamu?`)) {
    const { error } = await db.from('guests').delete().eq('id', g.id);
    if (error) return toast(error.message);
    if (editingId === g.id) resetForm();
    toast(g.name + ' dihapus'); load();
  }
};

// ---------- barcode & ticket ----------
function barcodeUrl(code) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, { format: 'CODE128', displayValue: false, margin: 0, height: 100, width: 2, lineColor: '#0A1226', background: '#FFFFFF' });
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

function openTicket(g) {
  $('ticket').innerHTML = `<div class="overlay" data-close>
    <div class="ticket-wrap">
      <div class="ticket">
        <div class="t-top">
          <div class="t-brand"><div class="logo">CBN</div><div><small>UNDANGAN</small><b>${esc(EVENT)}</b></div></div>
          <div><div class="t-title">E-Ticket</div><div class="t-sub">Scan barcode ini di layar check-in saat tiba.</div></div>
        </div>
        <div class="t-mid">
          <div class="t-name"><span class="eyebrow">NAMA TAMU</span><b>${esc(g.name)}</b><span>${esc(g.company || 'Tanpa perusahaan')}</span></div>
          <div class="t-boxes">
            <div class="t-meja"><small>MEJA</small><b>${esc(g.table_no || '—')}</b></div>
            <div class="t-status"><small>STATUS</small><b>${g.checked_in_at ? 'Hadir ' + hhmm(g.checked_in_at) : 'Belum hadir'}</b></div>
          </div>
        </div>
        <div class="t-cut"></div>
        <div class="t-code"><img src="${barcodeUrl(g.code)}" alt="Barcode tiket"><span class="mono">${esc(g.code)}</span></div>
      </div>
      <div class="t-acts">
        <button class="dl" data-act="dl">${ic('download')}Download PNG</button>
        <button data-act="sim">${ic('qr_code_scanner')}Uji check-in</button>
        ${g.checked_in_at ? `<button class="soft" data-act="undo">${ic('undo')}Batalkan check-in</button>` : ''}
        <button class="soft" data-close>Tutup</button>
      </div>
    </div></div>`;
  $('ticket').onclick = async e => {
    const t = e.target.closest('[data-act],[data-close]');
    if (!t || (t.classList.contains('overlay') && e.target !== t)) return;
    const act = t.dataset.act;
    if (act === 'dl') return download(g);
    $('ticket').innerHTML = '';
    if (act === 'sim') { setView('checkin'); checkIn(g.code); }
    if (act === 'undo') {
      const { error } = await db.from('guests').update({ checked_in_at: null }).eq('id', g.id);
      toast(error ? error.message : 'Check-in ' + g.name + ' dibatalkan'); load();
    }
  };
}

async function download(g) {
  const W = 900, H = 1400, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); const Fn = "'Plus Jakarta Sans', sans-serif"; const M = "'JetBrains Mono', monospace";
  try { await Promise.all(['500 28px', '700 22px', '800 60px'].map(f => document.fonts.load(`${f} ${Fn}`)).concat(document.fonts.load(`600 30px ${M}`))); } catch {}
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const fit = (t, max, size, weight, fam) => { let s = size; do { x.font = `${weight} ${s}px ${fam}`; s -= 2; } while (x.measureText(t).width > max && s > 20); };
  const table = g.table_no || '—';
  x.fillStyle = '#EAF0FF'; x.fillRect(0, 0, W, H);
  x.save(); rr(40, 40, W - 80, H - 80, 44); x.clip();
  x.fillStyle = '#fff'; x.fillRect(40, 40, W - 80, H - 80);
  const gr = x.createLinearGradient(40, 40, W - 40, 520);
  gr.addColorStop(0, '#4D7DFF'); gr.addColorStop(0.55, '#1D5BFF'); gr.addColorStop(1, '#0F47E0');
  x.fillStyle = gr; x.fillRect(40, 40, W - 80, 480);
  x.restore();
  x.fillStyle = '#fff'; rr(96, 96, 88, 88, 26); x.fill();
  x.fillStyle = '#1D5BFF'; x.font = `800 28px ${Fn}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CBN', 140, 141);
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#DCE6FF'; x.font = `700 20px ${Fn}`; x.fillText('UNDANGAN', 212, 128);
  x.fillStyle = '#fff'; fit(EVENT, 580, 32, 700, Fn); x.fillText(EVENT, 212, 168);
  x.fillStyle = '#fff'; x.font = `800 112px ${Fn}`; x.fillText('E-Ticket', 88, 400);
  x.fillStyle = '#DCE6FF'; x.font = `500 28px ${Fn}`; x.fillText('Scan barcode ini di layar check-in saat tiba.', 96, 460);
  x.fillStyle = '#5B6479'; x.font = `700 22px ${Fn}`; x.fillText('NAMA TAMU', 96, 610);
  x.fillStyle = '#0A1226'; fit(g.name, 708, 60, 800, Fn); x.fillText(g.name, 96, 680);
  if (g.company) { x.fillStyle = '#3A4459'; fit(g.company, 708, 32, 500, Fn); x.fillText(g.company, 96, 730); }
  x.fillStyle = '#EAF0FF'; rr(96, 780, 708, 150, 28); x.fill();
  x.fillStyle = '#0F47E0'; x.font = `700 22px ${Fn}`; x.fillText('MEJA', 132, 834);
  x.fillStyle = '#0A1226'; fit(table, 640, 72, 800, Fn); x.fillText(table, 132, 905);
  x.strokeStyle = '#E3E8F0'; x.lineWidth = 3; x.setLineDash([14, 12]); x.beginPath(); x.moveTo(80, 990); x.lineTo(W - 80, 990); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#EAF0FF'; x.beginPath(); x.arc(40, 990, 30, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(W - 40, 990, 30, 0, Math.PI * 2); x.fill();
  const im = new Image(); await new Promise(r => { im.onload = im.onerror = r; im.src = barcodeUrl(g.code); });
  try { x.drawImage(im, 96, 1050, 708, 210); } catch {}
  x.fillStyle = '#0A1226'; x.font = `600 30px ${M}`; x.textAlign = 'center'; x.fillText(g.code.split('').join(String.fromCharCode(8202)), W / 2, 1310);
  const a = document.createElement('a'); a.download = `Tiket ${g.name} ${g.code}.png`; a.href = c.toDataURL('image/png'); a.click();
  toast('Tiket ' + g.name + ' di-download');
}

// ---------- sound ----------
let ac, master;
function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC();
    const m = ac.createGain(); m.gain.value = 0.55;
    const d = ac.createDelay(); d.delayTime.value = 0.19;
    const fb = ac.createGain(); fb.gain.value = 0.3;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    const wet = ac.createGain(); wet.gain.value = 0.5;
    m.connect(ac.destination); m.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(ac.destination);
    master = m;
  }
  if (ac.state !== 'running') ac.resume().catch(() => {});
  return ac;
}
function tone(f, t, dur, type, g) {
  const o = ac.createOscillator(), v = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + 0.012); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(v); v.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function whoosh(t) {
  const len = ac.sampleRate * 0.9, b = ac.createBuffer(1, len, ac.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource(); s.buffer = b;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + 0.75);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.9);
}
function play(kind) {
  if (!SOUND || !audio()) return;
  const t = ac.currentTime + 0.03;
  if (kind === 'vip') {
    whoosh(t);
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => { tone(f, t + 0.1 + i * 0.085, 0.7, 'triangle', 0.16); tone(f * 2, t + 0.1 + i * 0.085, 0.4, 'sine', 0.04); });
    [1046.5, 1318.51, 1567.98, 2093].forEach(f => tone(f, t + 0.58, 2.2, 'sine', 0.07));
    tone(261.63, t + 0.58, 1.6, 'sine', 0.12);
  } else if (kind === 'regular') {
    tone(783.99, t, 0.6, 'sine', 0.3); tone(1567.98, t, 0.3, 'sine', 0.06);
    tone(1046.5, t + 0.15, 1.0, 'sine', 0.3); tone(2093, t + 0.15, 0.45, 'sine', 0.05);
  } else if (kind === 'again') {
    tone(880, t, 0.18, 'sine', 0.22); tone(880, t + 0.22, 0.28, 'sine', 0.22);
  } else {
    tone(196, t, 0.22, 'square', 0.07); tone(155.56, t + 0.27, 0.36, 'square', 0.07);
  }
}

// ---------- check-in ----------
let busy = false;
async function checkIn(raw) {
  // Accept a bare code or an old QR link (?c=CODE).
  const code = String(raw ?? '').replace(/^.*[?&]c=([^&#]+).*$/, '$1').trim().toUpperCase();
  if (!code || busy) return;
  busy = true; audio();
  const { data, error } = await db.rpc('check_in', { p_code: code });
  busy = false;
  if (error) return toast(error.message);
  const g = data?.[0];
  const r = g ? { status: g.status, code: g.code, guest: g, at: Date.now() } : { status: 'unknown', code, at: Date.now() };
  log = [r, ...log].slice(0, 40);
  play(r.status === 'unknown' ? 'unknown' : r.status === 'again' ? 'again' : g.tier === 'VIP' ? 'vip' : 'regular');
  renderCheckin(); showResult(r);
  if (g) load();
}

function renderCheckin() {
  const r = log[0];
  if (r) {
    const g = r.guest;
    $('last').innerHTML = g ? `<div class="last-guest">
        <div class="who2">
          <div class="badges">${g.tier === 'VIP' ? vipBadge : regBadge}
            ${r.status === 'ok' ? `<span class="badge b-in">${ic('check_circle')}Check-in ${hhmm(r.at)}</span>` : `<span class="badge b-again">${ic('history')}Sudah masuk ${hhmm(g.checked_in_at)}</span>`}</div>
          <span class="nm">${esc(g.name)}</span><span class="co">${esc(g.company || 'Tanpa perusahaan')}</span>
        </div>
        <div class="mejabox"><span>MEJA</span><b>${esc(g.table_no || '—')}</b></div></div>`
      : `<div class="last-unknown">${ic('error')}<div><b>Kode tidak terdaftar</b><span class="mono">${esc(r.code)}</span></div></div>`;
  }
  $('log').innerHTML = log.map(r => {
    const g = r.guest;
    const badge = r.status === 'ok' ? '<span class="badge b-in">Masuk</span>' : r.status === 'again' ? '<span class="badge b-again">Ulang</span>' : '<span class="badge b-no">Ditolak</span>';
    return `<div class="lr"><span class="mono">${hhmm(r.at)}</span>
      <div class="who"><b>${esc(g ? g.name : r.code)}</b><span>${g ? (g.tier === 'VIP' ? 'VIP' : 'Regular') + ' · Meja ' + esc(g.table_no || '—') : 'Tidak terdaftar'}</span></div>${badge}</div>`;
  }).join('') || '<div class="log-empty">Riwayat muncul setelah scan pertama.</div>';
}

let resetT;
function showResult(r) {
  clearTimeout(resetT);
  const g = r.guest, next = `<button class="r-next">${ic('qr_code_scanner')}Scan berikutnya</button>`;
  if (!g) {
    $('result').innerHTML = `<div class="result unk"><div class="unk-ic">${ic('error')}</div><h1>Kode tidak terdaftar</h1>
      <span class="mono unk-code">${esc(r.code)}</span><p>Silakan menuju meja registrasi untuk dibantu panitia.</p>${next}</div>`;
  } else {
    const vip = g.tier === 'VIP';
    $('result').innerHTML = `<div class="result ${vip ? 'vip' : 'reg'}" style="--sec:${RESET_SEC}s">
      ${vip ? '<div class="ring1"></div><div class="ring2"></div>' : '<div class="glow"></div>'}
      <div class="r-top"><div><div class="r-logo">CBN</div><span class="r-ev">${esc(EVENT.toUpperCase())}</span></div><span class="mono r-time">${hhmm(r.at)}</span></div>
      <div class="r-body">
        <div class="r-main">
          <span class="r-pill">${ic(vip ? 'workspace_premium' : 'confirmation_number')}${vip ? 'VIP GUEST' : 'REGULAR GUEST'}</span>
          <span class="r-welcome">SELAMAT DATANG</span>
          <span class="r-name">${esc(g.name)}</span>
          ${g.company ? `<span class="r-co">${ic('apartment')}${esc(g.company)}</span>` : ''}
          ${r.status === 'again' ? `<span class="r-again">${ic('history')}Sudah check-in pukul ${hhmm(g.checked_in_at)}</span>` : ''}
        </div>
        <div class="r-meja"><span>MEJA ANDA</span><b>${esc(g.table_no || '—')}</b></div>
      </div>${next}<div class="r-bar"><div></div></div></div>`;
  }
  resetT = setTimeout(dismiss, RESET_SEC * 1000);
}
function dismiss() { clearTimeout(resetT); $('result').innerHTML = ''; if (view === 'checkin') $('scanInput').focus(); }
$('result').onclick = dismiss;

$('scanForm').onsubmit = e => { e.preventDefault(); const v = $('scanInput').value; $('scanInput').value = ''; checkIn(v); };
addEventListener('keydown', e => { if (e.key === 'Escape') { dismiss(); $('ticket').innerHTML = ''; } });

// ---------- camera ----------
let stream, camT, lastCam, lastCamAt = 0;
async function startCam() {
  const msg = t => { $('camMsg').hidden = !t; $('camMsg').textContent = t; };
  if (!('BarcodeDetector' in window)) return msg('Browser ini belum mendukung scan kamera. Pakai Chrome di Android/Mac, atau scanner USB.');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128'] });
    msg(''); $('cam').hidden = $('camStop').hidden = false; $('camStart').hidden = true;
    const v = $('video'); v.srcObject = stream; v.play().catch(() => {});
    camT = setInterval(async () => {
      if (v.readyState < 2 || busy || $('result').innerHTML) return;
      try {
        const c = (await detector.detect(v))[0]?.rawValue;
        if (c && (c !== lastCam || Date.now() - lastCamAt > 4000)) { lastCam = c; lastCamAt = Date.now(); checkIn(c); }
      } catch {}
    }, 350);
  } catch { msg('Kamera tidak bisa diakses. Cek izin kamera di browser.'); }
}
function stopCam() {
  clearInterval(camT);
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $('cam').hidden = $('camStop').hidden = true; $('camStart').hidden = false;
}
$('camStart').onclick = startCam;
$('camStop').onclick = stopCam;

// ---------- views & auth ----------
function setView(v) {
  view = v;
  $('admin').hidden = v !== 'admin'; $('checkin').hidden = v !== 'checkin';
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'checkin') { audio(); setTimeout(() => $('scanInput').focus(), 60); } else stopCam();
  history.replaceState(null, '', v === 'checkin' ? '?view=checkin' : location.pathname);
  load();
}
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
addEventListener('focus', () => me && load());

const notAdminMsg = () => `${me} belum terdaftar sebagai admin. Jalankan di Supabase SQL Editor: insert into public.admins (email) values ('${me}');`;

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  const { error } = await db.auth.signInWithPassword(Object.fromEntries(new FormData(e.target)));
  showErr($('loginErr'), error && (error.message === 'Invalid login credentials' ? 'Email atau password salah.' : error.message));
};
$('logout').onclick = () => db.auth.signOut();

db.auth.onAuthStateChange((_, session) => {
  me = session?.user.email ?? '';
  $('login').hidden = !!session; $('shell').hidden = !session;
  if (!session) return stopCam();
  setTimeout(async () => {
    const { data } = await db.from('admins').select('email').maybeSingle();
    showErr($('adminErr'), data ? '' : notAdminMsg());
    setView(new URLSearchParams(location.search).get('view') === 'checkin' ? 'checkin' : 'admin');
  });
});
renderForm();
