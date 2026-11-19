/* =====================================================
   1. KONSTANTA & VARIABEL GAME
   ===================================================== */
const $ = s => document.querySelector(s);   // singkatan pencari elemen
const MAXX = 5000;                           // pengali maksimal (bulan)
const RATE = 0.12;                           // kecepatan naiknya pengali

// Format angka ke rupiah, dan pengali ke "1,00x"
const fmt = n => (n < 0 ? '−' : '') + 'Rp' + Math.abs(Math.round(n)).toLocaleString('id-ID');
const fx  = m => m.toFixed(2).replace('.', ',') + 'x';

let bal = 1000000;        // saldo virtual
let state = 'wait';       // fase: 'wait' (hitung mundur) | 'fly' (terbang) | 'crash' (hilang)
let mult = 1;             // pengali saat ini
let crashAt = 2;          // titik astronot akan hilang (ditentukan tiap ronde)
let tg = 0;               // waktu terbang (detik)
let wait = 5;             // sisa hitung mundur
let crT = 0;              // waktu sejak hilang

let bet = 0;              // jumlah taruhan aktif
let placed = false;       // sudah pasang taruhan?
let cashed = false;       // sudah cash out?
let cashM = 0;            // pengali saat cash out
let rem = 0;              // sisa taruhan yang masih terbang
let got = 0;              // total uang yang sudah ditarik di ronde ini
let halfDone = false;     // sudah tarik seteng?

let rounds = 0, staked = 0, net = 0;   // statistik
let hist = [], last = [];              // riwayat & hasil ronde terakhir

let pd = 0;               // progres ketinggian (0 = tanah, 1 = bulan)
let scroll = 0;           // offset gerak bintang
let snd = true, ac = null; // suara

/* =====================================================
   2. SUARA SEDERHANA
   ===================================================== */
function beep(freq, dur, type = 'sine', vol = 0.08) {
  if (!snd) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  } catch (e) { /* abaikan jika audio tidak tersedia */ }
}

$('#snd').onclick = () => {
  snd = !snd;
  $('#snd').textContent = snd ? '🔊' : '🔇';
};

/* =====================================================
   3. LOGIKA RONDE
   ===================================================== */

// Tentukan titik tabrakan secara acak.
// ALPHA makin kecil = astronot makin jarang nabrak di x1-x5 (peluang untung makin besar).
// Dengan 0,6: lolos x2 sekitar 66%, lolos x5 sekitar 38%, lolos x10 sekitar 25%.
const ALPHA = 0.6;
function genCrash() {
  const r = Math.random();
  const c = Math.floor(Math.pow(1 - r, -1 / ALPHA) * 100) / 100;
  return Math.min(MAXX, Math.max(1.1, c));
}

// Fase 1: hitung mundur sebelum terbang
function startWait() {
  state = 'wait';
  wait = 5;
  mult = 1;
  cashed = false;
  crashAt = genCrash();
  hit = false;
  pts = [];
}

// Fase 2: astronot terbang
function startFly() {
  state = 'fly';
  tg = 0;
  mult = 1;
  beep(180, 0.4, 'sawtooth', 0.05);
}

// Fase 3: astronot hilang (atau sampai di bulan)
function endRound() {
  state = 'crash';
  crT = 0;
  mult = crashAt;

  last.unshift(crashAt);
  last = last.slice(0, 12);

  // Taruhan kalah jika belum cash out
  if (placed && !cashed) {
    rounds++;
    net += got - bet;
    addHist(bet, crashAt, got - bet);
    beep(120, 0.5, 'square', 0.06);
  }
  placed = false;
  renderLast();
  stats();
}

// Catat satu baris riwayat (maksimal 8 baris)
function addHist(b, m, r) {
  hist.unshift({ n: rounds, b, m, r });
  hist = hist.slice(0, 8);
  renderHist();
}

// Cash out pada pengali m
// part = 1 -> tarik semua sisa | part = 0.5 -> tarik seteng (sisanya tetap terbang)
function cashOut(m, part = 1) {
  if (!placed || cashed || state !== 'fly') return;
  m = Math.floor(m * 100) / 100;

  const stake = part < 1 ? rem * part : rem;
  const win = stake * m;
  bal += win;
  got += win;
  rem -= stake;
  beep(660, 0.25);
  beep(990, 0.3);

  if (part < 1) {
    halfDone = true;                 // sisanya lanjut terbang
  } else {
    cashed = true;
    cashM = m;
    rounds++;
    net += got - bet;
    addHist(bet, m, got - bet);
  }
  stats();
}

const betVal = () => Math.floor(+$('#amt').value) || 0;
const msg = t => $('#msg').textContent = t;

// Tombol utama: pasang / batalkan / cash out
function mainClick() {
  if (state === 'wait') {
    if (placed) {
      // Batalkan taruhan, saldo dikembalikan
      bal += bet;
      staked -= bet;
      placed = false;
      bet = 0;
      msg('');
    } else {
      const v = betVal();
      if (v < 1000) return msg('Taruhan minimal Rp1.000');
      if (v > bal)  return msg('Saldo tidak cukup');
      bal -= v;
      bet = v;
      staked += v;
      placed = true;
      rem = v;
      got = 0;
      halfDone = false;
      msg('');
      beep(440, 0.15);
    }
  } else if (state === 'fly') {
    cashOut(mult);
  }
  stats();
}

/* =====================================================
   4. TAMPILAN (UI)
   ===================================================== */

// Chip hasil ronde terakhir
function renderLast() {
  $('#last').innerHTML = last
    .map(m => `<span class="pill ${m < 2 ? 'c1' : m < 10 ? 'c2' : 'c3'}">${fx(m)}</span>`)
    .join('');
}

// Tabel riwayat taruhan
function renderHist() {
  if (!hist.length) {
    $('#hist').innerHTML = '<small style="color:var(--mut)">Belum ada taruhan. Pasang taruhan untuk mulai mencatat.</small>';
    return;
  }
  const rows = hist.map(h => `
    <tr>
      <td>${h.n}</td>
      <td>${fmt(h.b)}</td>
      <td>${fx(h.m)}</td>
      <td style="color:${h.r >= 0 ? 'var(--grn)' : 'var(--red)'}">${h.r >= 0 ? '+' : ''}${fmt(h.r)}</td>
    </tr>`).join('');
  $('#hist').innerHTML = `<table>
    <tr><th>#</th><th>Taruhan</th><th>Kali</th><th>Hasil</th></tr>${rows}</table>`;
}

// Saldo & statistik
function stats() {
  $('#bal').textContent = fmt(bal);
  $('#s1').textContent = rounds;
  $('#s2').textContent = fmt(staked);
  const s = $('#s3');
  s.textContent = fmt(net);
  s.style.color = net > 0 ? 'var(--grn)' : net < 0 ? 'var(--red)' : '';
}

// Perbarui angka, label, dan tombol sesuai fase
function ui() {
  const b = $('#main'), m = $('#mult'), l = $('#lbl');

  m.textContent = fx(mult);
  m.style.color =
    state === 'crash' ? (crashAt >= MAXX ? 'var(--gold)' : 'var(--red)') :
    mult >= 10 ? '#fb923c' :
    mult >= 2  ? 'var(--gold)' : '#fff';

  b.className = 'btn';
  b.disabled = false;
  $('#halfout').style.display = (state === 'fly' && placed && !cashed && !halfDone) ? 'block' : 'none';

  if (state === 'wait') {
    l.textContent = `RONDE BERIKUTNYA DALAM ${Math.ceil(wait)}s`;
    l.style.color = '#cbd5ff';
    if (placed) {
      b.textContent = `BATALKAN TARUHAN (${fmt(bet)})`;
      b.classList.add('sec');
    } else {
      b.textContent = `PASANG TARUHAN ${fmt(betVal())}`;
    }

  } else if (state === 'fly') {
    if (placed && !cashed) {
      l.textContent = halfDone ? `SETENG KETARIK +${fmt(got)}` : 'TERBANG!';
      l.style.color = halfDone ? 'var(--grn)' : 'var(--gold)';
      b.textContent = `TARIK EUY WD +${fmt(rem * mult)}`;
      b.classList.add('go');
    } else {
      l.textContent = cashed ? `TARIK EUY WD +${fmt(got)}` : 'TERBANG!';
      l.style.color = cashed ? 'var(--grn)' : 'var(--gold)';
      b.textContent = 'MENUNGGU RONDE BERIKUTNYA';
      b.disabled = true;
    }

  } else {
    const moon = crashAt >= MAXX;
    l.textContent = moon ? 'SAMPAI DI BULAN! 🌕' : 'ASTRONOT NABRAK ASTEROID!';
    l.style.color = moon ? 'var(--gold)' : 'var(--red)';
    b.textContent = 'RONDE SELESAI';
    b.disabled = true;
  }

  // Kunci input saat taruhan sudah dipasang
  ['#amt', '#half', '#dbl', '#max', '#auto'].forEach(s => $(s).disabled = placed);
  document.querySelectorAll('.chip[data-v]').forEach(c => {
    c.disabled = placed;
    c.classList.toggle('on', +c.dataset.v === betVal());
  });
}

/* ---- Event tombol ---- */
$('#main').onclick = mainClick;
$('#halfout').onclick = () => cashOut(mult, 0.5);
document.querySelectorAll('.chip[data-v]').forEach(c => c.onclick = () => $('#amt').value = c.dataset.v);
$('#half').onclick = () => $('#amt').value = Math.max(1000, Math.floor(betVal() / 2));
$('#dbl').onclick  = () => $('#amt').value = Math.min(Math.floor(bal), betVal() * 2);
$('#max').onclick  = () => $('#amt').value = Math.floor(bal);
$('#clr').onclick  = () => { hist = []; renderHist(); };
$('#rst').onclick  = () => {
  if (placed) return;
  bal = 1000000; staked = 0; net = 0; rounds = 0; hist = [];
  renderHist();
  stats();
};

/* =====================================================
   5. KANVAS: LANGIT, BINTANG, BULAN, ASTRONOT
   ===================================================== */
const cv = $('#cv');
const ctx = cv.getContext('2d');
let W = 0, H = 0;

function resize() {
  const d = Math.min(3, devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  W = r.width;
  H = r.height;
  cv.width = W * d;
  cv.height = H * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize);
resize();

// Data dekorasi
const stars  = Array.from({ length: 130 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), p: Math.random() * 6 }));
const clouds = Array.from({ length: 6 },  () => ({ x: Math.random(), y: Math.random() * 0.5, s: 0.6 + Math.random() * 0.8 }));
let shoot = [];                              // bintang jatuh
let cr = { x: 0, y: 0, r: 0, vx: 0, vy: 0 }; // gerak astronot saat hilang

// Campur dua warna RGB sesuai nilai q (0..1)
const mix = (a, b, q) => a.map((v, i) => Math.round(v + (b[i] - v) * q));

// ---------- Pembantu gambar kecil ----------
function heart(cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.6, cy - r * 0.2, cx - r * 0.8, cy - r * 1.3, cx, cy - r * 0.5);
  ctx.bezierCurveTo(cx + r * 0.8, cy - r * 1.3, cx + r * 1.6, cy - r * 0.2, cx, cy + r * 0.9);
  ctx.fill();
}
function sparkle(cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fill();
}

// ---------- Ekspresi wajah di kaca helm ----------
// expr: happy | excited | wink | love | scared | dizzy
function face(expr, t) {
  const blink = (t % 3.6) < 0.14 ? 0.12 : 1;   // kedip tiap 3,6 detik
  const EY = -25;
  ctx.lineCap = 'round';

  // Pipi merona
  ctx.fillStyle = 'rgba(255,120,160,.5)';
  [-11.5, 11.5].forEach(x => { ctx.beginPath(); ctx.ellipse(x, -18.5, 3, 2, 0, 0, 7); ctx.fill(); });

  // Mata bulat (rx, ry = ukuran, ps = ukuran pupil, py = geser pupil)
  const eye = (x, rx, ry, ps, py) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, EY, rx, ry * blink, 0, 0, 7); ctx.fill();
    if (blink > 0.5) {
      ctx.fillStyle = '#16204f';
      ctx.beginPath(); ctx.arc(x, EY + py, rx * ps, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 1, EY + py - 1.4, rx * 0.2, 0, 7); ctx.fill();
    }
  };
  const smile = () => {
    ctx.strokeStyle = '#ff8fb0'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, -21, 4.5, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  };
  const open = () => {
    ctx.fillStyle = '#ff4d73';
    ctx.beginPath(); ctx.arc(0, -20.5, 5, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff9db5';
    ctx.beginPath(); ctx.ellipse(0, -16.8, 2.6, 1.4, 0, 0, 7); ctx.fill();
  };

  if (expr === 'happy') {
    eye(-7, 3.8, 4.6, 0.55, 0.4); eye(7, 3.8, 4.6, 0.55, 0.4); smile();

  } else if (expr === 'excited') {
    eye(-7, 4.3, 5.2, 0.62, -0.4); eye(7, 4.3, 5.2, 0.62, -0.4); open();

  } else if (expr === 'wink') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-7, -24, 3.6, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    eye(7, 3.8, 4.6, 0.55, 0.3); open();

  } else if (expr === 'love') {
    ctx.fillStyle = '#ff4d8d';
    heart(-7, EY, 4.4); heart(7, EY, 4.4); open();

  } else if (expr === 'scared') {
    eye(-7, 4.6, 5.6, 0.32, 0); eye(7, 4.6, 5.6, 0.32, 0);
    ctx.strokeStyle = '#cfd8ff'; ctx.lineWidth = 1.5;           // alis terangkat
    ctx.beginPath(); ctx.moveTo(-11, -32); ctx.lineTo(-4, -34); ctx.moveTo(4, -34); ctx.lineTo(11, -32); ctx.stroke();
    ctx.fillStyle = '#3a0f2a';                                   // mulut gemetar
    ctx.beginPath(); ctx.ellipse(0, -17.5, 2.6, 3 + Math.sin(t * 30) * 0.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9fe7ff';                                   // keringat dingin
    ctx.beginPath(); ctx.moveTo(14.5, -33); ctx.quadraticCurveTo(18, -27, 14.5, -25); ctx.quadraticCurveTo(11, -27, 14.5, -33); ctx.fill();

  } else if (expr === 'dizzy') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;               // mata spiral berputar
    [-7, 7].forEach(x => {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = k * 0.55 + t * 8, r = k * 0.17;
        ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, EY + Math.sin(a) * r);
      }
      ctx.stroke();
    });
    ctx.strokeStyle = '#ff8fb0'; ctx.lineWidth = 1.8;            // mulut bergelombang
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) ctx[i ? 'lineTo' : 'moveTo'](-5 + i, -18 + Math.sin(i + t * 10) * 1.3);
    ctx.stroke();
  }
}

// ---------- Astronot lucu + jetpack ----------
// x,y = posisi | s = skala | rot = putaran | fl = panjang api | al = transparansi
// expr = ekspresi | t = waktu (detik) | arm = sudut lengan (0 = turun, 2,4 = angkat tangan)
function astro(x, y, s, rot, fl, al, expr, t, arm) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.globalAlpha = al;
  ctx.lineJoin = 'round';
  let g;

  // Api jetpack
  if (fl > 0) {
    [-13.5, 13.5].forEach(nx => {
      g = ctx.createLinearGradient(0, 29, 0, 29 + fl);
      g.addColorStop(0, '#fff6bf');
      g.addColorStop(0.3, '#ffb347');
      g.addColorStop(0.7, '#ff6b3d');
      g.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(nx - 5, 29);
      ctx.quadraticCurveTo(nx, 29 + fl * 1.15, nx + 5, 29);
      ctx.fill();
    });
  }

  // Tabung jetpack + lubang api
  g = ctx.createLinearGradient(-20, 0, 20, 0);
  g.addColorStop(0, '#6a7498'); g.addColorStop(0.5, '#a5aed0'); g.addColorStop(1, '#5d678c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(-20, -2, 40, 26, 8); ctx.fill();
  ctx.fillStyle = '#434d70';
  [-18, 9].forEach(nx => { ctx.beginPath(); ctx.roundRect(nx, 22, 9, 7, 2); ctx.fill(); });

  // Kaki + sepatu oranye
  ctx.fillStyle = '#e6eaf7';
  [-10, 1].forEach(lx => { ctx.beginPath(); ctx.roundRect(lx, 22, 9, 12, 4.5); ctx.fill(); });
  ctx.fillStyle = '#ff9d3c';
  [-11, 0].forEach(lx => { ctx.beginPath(); ctx.roundRect(lx, 31, 11, 8, 4); ctx.fill(); });

  // Badan
  g = ctx.createLinearGradient(-14, 0, 14, 0);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d5dbef');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(-14, -2, 28, 27, 10); ctx.fill();
  ctx.fillStyle = '#ff9d3c';                                    // sabuk
  ctx.beginPath(); ctx.roundRect(-14, 18, 28, 4, 2); ctx.fill();
  ctx.fillStyle = '#2b3470';                                    // panel dada
  ctx.beginPath(); ctx.roundRect(-7, 5, 14, 9, 3); ctx.fill();
  ctx.fillStyle = '#ff5d7a'; ctx.beginPath(); ctx.arc(-3, 9.5, 1.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(3, 9.5, 1.6, 0, 7); ctx.fill();

  // Lengan + sarung tangan
  const limb = (side, a) => {
    ctx.save();
    ctx.translate(side * 13, 4);
    ctx.rotate(side < 0 ? a : -a);
    ctx.fillStyle = '#e6eaf7';
    ctx.beginPath(); ctx.roundRect(-4.5, -3, 9, 18, 4.5); ctx.fill();
    ctx.fillStyle = '#ff9d3c';
    ctx.beginPath(); ctx.arc(0, 15, 5, 0, 7); ctx.fill();
    ctx.restore();
  };
  limb(-1, arm); limb(1, arm);

  // Antena
  ctx.strokeStyle = '#aab3d3'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -43); ctx.lineTo(0, -51); ctx.stroke();
  ctx.fillStyle = '#ff5d7a';
  ctx.beginPath(); ctx.arc(0, -53, 3, 0, 7); ctx.fill();

  // Helm besar (kepala imut)
  g = ctx.createRadialGradient(-7, -31, 2, 0, -22, 25);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9d0ea');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, -22, 22, 0, 7); ctx.fill();
  ctx.strokeStyle = '#aab3d3'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ff9d3c';                                    // pelindung telinga
  [-22, 22].forEach(ex => { ctx.beginPath(); ctx.arc(ex, -22, 4.2, 0, 7); ctx.fill(); });

  // Kaca helm
  g = ctx.createLinearGradient(-12, -34, 12, -10);
  g.addColorStop(0, '#2a3a9c'); g.addColorStop(1, '#0b1038');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -22, 16.5, 14, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6f7fe0'; ctx.lineWidth = 1; ctx.stroke();

  // Wajah
  face(expr, t);

  // Kilau kaca
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -22, 13, 1.15 * Math.PI, 1.45 * Math.PI); ctx.stroke();

  // Bintang berputar di kepala saat pusing
  if (expr === 'dizzy') {
    ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * 2.09;
      sparkle(Math.cos(a) * 27, -44 + Math.sin(a) * 6, 4);
    }
  }
  ctx.restore();
}

// Gambar seluruh pemandangan tiap frame
function drawScene(dt) {
  // q = seberapa gelap langit (0 = senja, 1 = angkasa)
  const q = Math.min(1, Math.pow(pd, 0.65) * 1.2);

  // --- Langit ---
  const top = mix([40, 54, 112], [3, 4, 16], q);
  const bot = mix([244, 150, 112], [12, 16, 46], q);
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${top})`);
  g.addColorStop(1, `rgb(${bot})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  scroll += dt * (state === 'fly' ? 40 + pd * 200 : 6);

  // --- Bintang (muncul saat langit makin gelap) ---
  const sa = Math.max(0, (q - 0.12) / 0.55);
  if (sa > 0) {
    stars.forEach(s => {
      const y = (s.y * H + scroll * (0.15 + s.z) + pd * H * 2 * s.z) % H;
      ctx.globalAlpha = sa * (0.55 + 0.45 * Math.sin(tg * 2 + s.p + scroll * 0.01));
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x * W, y, s.z * 1.3 + 0.35, 0, 7);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;

  // --- Bulan (makin besar & mendekat) ---
  const mr = 16 + Math.pow(pd, 3) * 115;
  const mx = W * (0.82 - 0.32 * pd * pd);
  const my = H * 0.2 + Math.pow(pd, 3) * H * 0.1;
  ctx.globalAlpha = 0.45 + 0.55 * q;

  g = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.8);
  g.addColorStop(0, 'rgba(255,244,200,.28)');
  g.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  g = ctx.createLinearGradient(mx - mr, my - mr, mx + mr, my + mr);
  g.addColorStop(0, '#fbf6e2');
  g.addColorStop(1, '#cfc7a8');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();

  // Kawah bulan
  ctx.fillStyle = 'rgba(120,110,90,.25)';
  [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.3], [-0.1, 0.45, 0.16], [0.4, -0.4, 0.12]].forEach(c => {
    ctx.beginPath(); ctx.arc(mx + c[0] * mr, my + c[1] * mr, c[2] * mr, 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1;

  // --- Awan (hilang saat naik) ---
  const ca = Math.max(0, 0.9 - pd * 4);
  if (ca > 0) {
    ctx.fillStyle = `rgba(255,226,214,${ca})`;
    clouds.forEach(c => {
      const x = c.x * W, y = c.y * H * 0.9 + pd * H * 2.2, r = 14 * c.s;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.arc(x + r * 1.1, y - r * 0.4, r * 1.2, 0, 7);
      ctx.arc(x + r * 2.2, y, r, 0, 7);
      ctx.fill();
    });
  }

  // --- Tanah / bukit (turun ke bawah saat naik) ---
  const gy = H * 0.8 + pd * H * 2.4;
  if (gy < H + 80) {
    ctx.fillStyle = `rgb(${mix([30, 86, 86], [8, 24, 36], q)})`;
    ctx.beginPath();
    ctx.moveTo(0, gy - 20);
    ctx.bezierCurveTo(W * 0.3, gy - 75, W * 0.6, gy + 10, W, gy - 40);
    ctx.lineTo(W, H * 4); ctx.lineTo(0, H * 4);
    ctx.fill();

    ctx.fillStyle = `rgb(${mix([36, 118, 74], [10, 34, 40], q)})`;
    ctx.beginPath();
    ctx.moveTo(0, gy + 12);
    ctx.bezierCurveTo(W * 0.35, gy - 32, W * 0.7, gy + 42, W, gy);
    ctx.lineTo(W, H * 4); ctx.lineTo(0, H * 4);
    ctx.fill();
  }

  // --- Bintang jatuh ---
  if (Math.random() < dt * (0.5 + q * 1.3)) {
    const sp = 420 + Math.random() * 320;
    shoot.push({ x: W * (0.3 + Math.random() * 0.8), y: Math.random() * H * 0.55, vx: -sp * 0.85, vy: sp * 0.45, l: 0, m: 0.7 + Math.random() * 0.5 });
  }
  shoot = shoot.filter(s => (s.l += dt) < s.m);
  shoot.forEach(s => {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const a = Math.sin(Math.PI * s.l / s.m) * Math.max(0.4, q);
    const tx = s.x - s.vx * 0.14, ty = s.y - s.vy * 0.14;
    const lg = ctx.createLinearGradient(s.x, s.y, tx, ty);
    lg.addColorStop(0, `rgba(255,255,255,${a})`);
    lg.addColorStop(1, 'rgba(160,190,255,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.8, 0, 7); ctx.fill();
  });

}

/* ---------- Animasi asteroid menabrak astronot ---------- */
const TI = 0.55;                 // detik sampai asteroid mengenai astronot
let hit = false, pts = [];       // sudah tabrakan? + serpihan
const ROCK = Array.from({ length: 11 }, (_, i) => 0.82 + ((i * 37) % 7) / 20);

// Gambar asteroid berapi (dx, dy = arah jatuh)
function asteroid(x, y, r, rot, dx, dy) {
  const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;

  // Ekor api
  const trail = ctx.createLinearGradient(x, y, x - ux * r * 5, y - uy * r * 5);
  trail.addColorStop(0, 'rgba(255,190,80,.95)');
  trail.addColorStop(0.4, 'rgba(255,100,40,.6)');
  trail.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.strokeStyle = trail; ctx.lineWidth = r * 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * r * 5, y - uy * r * 5); ctx.stroke();

  // Cahaya panas
  const gl = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2);
  gl.addColorStop(0, 'rgba(255,170,70,.55)');
  gl.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();

  // Batu
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const rk = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
  rk.addColorStop(0, '#9a8e86'); rk.addColorStop(1, '#3a322d');
  ctx.fillStyle = rk; ctx.strokeStyle = '#241d19'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ROCK.forEach((k, i) => {
    const a = i / ROCK.length * Math.PI * 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * k, Math.sin(a) * r * k);
  });
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(30,24,20,.45)';                         // kawah
  [[-0.3, -0.2, 0.25], [0.3, 0.2, 0.2], [0, 0.5, 0.13]].forEach(c => {
    ctx.beginPath(); ctx.arc(c[0] * r, c[1] * r, c[2] * r, 0, 7); ctx.fill();
  });
  ctx.restore();
}

// Saat asteroid mengenai astronot: ledakan serpihan
function crashFx() {
  if (state !== 'crash' || crashAt >= MAXX || hit || crT < TI) return;
  hit = true;
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 280;
    pts.push({
      x: cr.x, y: cr.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      l: 0, m: 0.5 + Math.random() * 0.7, r: 1.5 + Math.random() * 3.5,
      c: ['#ffb347', '#ff6b3d', '#fff3b0', '#8a7f78'][i % 4]
    });
  }
  beep(90, 0.45, 'sawtooth', 0.1);
}

// Gambar astronot sesuai fase + ekspresinya
function drawActors() {
  const sc = H / 300 * 0.85;
  const t = performance.now() / 1000;
  const bob = Math.sin(t * 2.2) * 4;           // melayang naik-turun
  const moon = crashAt >= MAXX;

  if (state !== 'crash') {
    const fy = (state === 'fly' ? H * 0.56 - pd * H * 0.08 : H * 0.58) + bob;
    const fl = state === 'fly' ? 24 + Math.random() * 14 + pd * 14 : 9 + Math.random() * 4;
    let expr = 'happy', arm = 0.35 + Math.sin(t * 3) * 0.15;
    if (state === 'fly') {
      expr = (cashed || halfDone) ? 'wink' : mult >= 3 ? 'excited' : 'happy';
      arm = 2.3 + Math.sin(t * 9) * 0.25;      // tangan diangkat
    }
    astro(W / 2, fy, sc, Math.sin(tg * 1.3) * 0.07, fl, 1, expr, t, arm);
    cr.x = W / 2; cr.y = fy;

  } else if (moon) {
    astro(W / 2, H * 0.55 + bob, sc, 0, 26 + Math.random() * 10, 1, 'love', t, 2.4 + Math.sin(t * 8) * 0.3);

  } else {
    // Asteroid jatuh dari kiri atas menuju astronot
    const sx = cr.x - 170, sy = cr.y - 266, ty = cr.y - 6;
    const k = crT / TI;
    const ax = sx + (cr.x - sx) * k, ay = sy + (ty - sy) * k;

    if (!hit) {
      // Sebelum kena: ketakutan
      astro(cr.x, cr.y, sc, Math.sin(t * 20) * 0.08, 24 + Math.random() * 14, 1, 'scared', t, 2.8 + Math.sin(t * 18) * 0.3);
    } else {
      // Setelah kena: terpental, pusing, memudar
      const kt = crT - TI;
      astro(cr.x + 230 * kt, cr.y - 40 * kt + 260 * kt * kt, sc * Math.max(0.4, 1 - kt * 0.3),
            9 * kt, 0, Math.max(0, 1 - kt / 1.7), 'dizzy', t, 0.6 + Math.sin(t * 12) * 0.5);
    }
    if (crT < 2) asteroid(ax, ay, 26 * sc, crT * 5, cr.x - sx, ty - sy);
  }
}

// Serpihan, gelombang kejut, dan kilatan putih
function drawFx(dt) {
  pts = pts.filter(p => (p.l += dt) < p.m);
  pts.forEach(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
    ctx.globalAlpha = 1 - p.l / p.m;
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1;
  if (hit) {
    const kt = crT - TI;
    if (kt < 0.45) {
      ctx.strokeStyle = `rgba(255,220,160,${1 - kt / 0.45})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cr.x, cr.y - 6, kt * 360, 0, 7); ctx.stroke();
    }
    if (kt < 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - kt / 0.3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

// Gambar satu frame penuh (dengan layar bergetar saat tabrakan)
function draw(dt) {
  const kt = hit ? crT - TI : 99;
  const shake = kt < 0.4 ? (0.4 - kt) * 20 : 0;
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawScene(dt);
  crashFx();
  drawActors();
  drawFx(dt);
  ctx.restore();
}

/* =====================================================
   6. LOOP UTAMA
   ===================================================== */
let prev = performance.now();

function loop(ts) {
  const dt = Math.min(0.1, (ts - prev) / 1000);
  prev = ts;

  if (state === 'wait') {
    wait -= dt;
    if (wait <= 0) startFly();

  } else if (state === 'fly') {
    tg += dt;
    mult = Math.min(MAXX, Math.exp(RATE * tg));

    // Cash out otomatis
    const a = parseFloat($('#auto').value);
    if (placed && !cashed && a >= 1.01 && a < crashAt && mult >= a) cashOut(a);

    // Astronot hilang / sampai bulan
    if (mult >= crashAt) {
      if (crashAt >= MAXX && placed && !cashed) cashOut(MAXX);
      endRound();
    }

  } else {
    crT += dt;
    if (crT > 3.6) startWait();
  }

  // Ketinggian halus mengikuti pengali (skala logaritma)
  const target = state === 'wait' ? 0 : Math.log(Math.max(1, mult)) / Math.log(MAXX);
  pd += (target - pd) * Math.min(1, dt * (state === 'wait' ? 2.2 : 8));

  draw(dt);
  ui();
  if (state === 'fly' && placed && !cashed) stats();
  requestAnimationFrame(loop);
}

/* =====================================================
   7. MULAI
   ===================================================== */
startWait();
renderHist();
stats();
requestAnimationFrame(loop);