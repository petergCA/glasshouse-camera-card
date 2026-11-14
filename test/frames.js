/* Synthetic "camera frames" for the harness: simple painted scenes rendered to JPEG data URLs on a
 * canvas, with sensor grain, vignette and an on-screen timestamp, so the card can be judged against
 * something that looks like real camera footage. Generic, made-up scenes only. */
(function (root) {
  'use strict';
  const W = 960, H = 540;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    const c = document.createElement('canvas'); c.width = c.height = 192;
    const g = c.getContext('2d'); const d = g.createImageData(192, 192); const r = rng(7);
    for (let i = 0; i < d.data.length; i += 4) { const v = 110 + r() * 145; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); grainTile = c; return c;
  }

  const lin = (g, x0, y0, x1, y1, stops) => { const l = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => l.addColorStop(o, c)); return l; };
  const rad = (g, x, y, r0, r1, stops) => { const l = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => l.addColorStop(o, c)); return l; };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function poly(g, pts, fill) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); }
  function blob(g, x, y, r, fill, rnd, n) {
    g.fillStyle = fill;
    for (let i = 0; i < (n || 9); i++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * r * 1.6, y + (rnd() - 0.5) * r * 0.9, r * (0.45 + rnd() * 0.5), 0, 7); g.fill(); }
  }
  function person(g, x, y, s, body, rim) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = body;
    g.beginPath(); g.arc(0, -150, 22, 0, 7); g.fill();
    rr(g, -42, -124, 84, 120, 30); g.fill();
    rr(g, -34, -20, 30, 120, 12); g.fill(); rr(g, 4, -20, 30, 120, 12); g.fill();
    g.strokeStyle = rim; g.lineWidth = 3; g.globalAlpha = 0.55;
    g.beginPath(); g.arc(0, -150, 22, -1.2, 0.6); g.stroke();
    g.beginPath(); g.moveTo(40, -100); g.lineTo(40, -10); g.stroke();
    g.restore();
  }

  const SCENES = {
    front_door(g, r, t) {
      g.fillStyle = lin(g, 0, 0, 0, H, [[0, '#2a3242'], [0.62, '#3a3e48'], [1, '#2b2a2c']]); g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
      for (let y = 18; y < 360; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      // door + frame
      g.fillStyle = '#d9d2c4'; g.fillRect(286, 60, 212, 312);
      g.fillStyle = lin(g, 300, 0, 484, 0, [[0, '#3b2a22'], [1, '#4c362b']]); g.fillRect(300, 72, 184, 300);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
      [[318, 92, 66, 110], [400, 92, 66, 110], [318, 222, 66, 128], [400, 222, 66, 128]].forEach(([x, y, w, h]) => g.strokeRect(x, y, w, h));
      g.fillStyle = '#c9a85b'; g.beginPath(); g.arc(468, 232, 6, 0, 7); g.fill();
      // lantern glow
      g.fillStyle = rad(g, 560, 150, 4, 230, [[0, 'rgba(255,196,120,0.75)'], [0.25, 'rgba(255,170,90,0.25)'], [1, 'rgba(255,170,90,0)']]); g.fillRect(0, 0, W, H);
      g.fillStyle = '#1d1a18'; rr(g, 548, 122, 24, 48, 4); g.fill();
      g.fillStyle = '#ffd796'; rr(g, 553, 130, 14, 30, 2); g.fill();
      // porch floor
      poly(g, [[0, 372], [W, 372], [W, H], [0, H]], lin(g, 0, 372, 0, H, [[0, '#4a3a30'], [1, '#2b221d']]));
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
      for (let i = -10; i < 20; i++) { g.beginPath(); g.moveTo(480 + i * 18, 372); g.lineTo(480 + i * 90, H); g.stroke(); }
      poly(g, [[320, 386], [470, 386], [500, 430], [290, 430]], '#5a4e3c');
      // planter
      g.fillStyle = '#5b4a3c'; rr(g, 140, 300, 90, 80, 8); g.fill();
      blob(g, 185, 270, 60, '#24402c', r, 10); blob(g, 185, 262, 40, '#2f5538', r, 6);
      // visitor
      person(g, 640 + Math.sin(t / 3000) * 6, 470, 1.75, '#151a24', '#ffcf8a');
    },
    driveway(g, r, t) {
      g.fillStyle = lin(g, 0, 0, 0, 230, [[0, '#8fb6d9'], [1, '#d7e3ea']]); g.fillRect(0, 0, W, 240);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      const cx = (t / 400) % (W + 300) - 150; [[cx, 60, 70], [cx + 60, 50, 50], [cx + 110, 66, 46]].forEach(([x, y, s]) => { g.beginPath(); g.ellipse(x, y, s, s * 0.45, 0, 0, 7); g.fill(); });
      for (let i = 0; i < 14; i++) blob(g, i * 75 + r() * 30, 200 + r() * 20, 50 + r() * 30, i % 2 ? '#3f6a3f' : '#4b7a44', r, 7);
      poly(g, [[0, 230], [W, 230], [W, H], [0, H]], lin(g, 0, 230, 0, H, [[0, '#5f8f4c'], [1, '#3f6e35']]));
      g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 12; i++) g.fillRect(0, 240 + i * 28, W, 12);
      // house + garage door
      g.fillStyle = '#c9c2b6'; g.fillRect(0, 70, 330, 220);
      poly(g, [[-20, 80], [180, -10], [360, 80]], '#4b4f57');
      g.fillStyle = '#ece8e1'; g.fillRect(40, 140, 250, 150);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; for (let y = 170; y < 290; y += 30) { g.beginPath(); g.moveTo(40, y); g.lineTo(290, y); g.stroke(); }
      // driveway
      poly(g, [[60, 292], [330, 292], [820, H], [-120, H]], lin(g, 0, 292, 0, H, [[0, '#b9b6b0'], [1, '#8e8b86']]));
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(200, 292); g.lineTo(350, H); g.stroke();
      // car
      g.save(); g.translate(330, 330);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(160, 150, 230, 26, 0, 0, 7); g.fill();
      g.fillStyle = lin(g, 0, 20, 0, 150, [[0, '#2f4b6e'], [1, '#1b2c44']]); rr(g, -40, 60, 400, 84, 28); g.fill();
      g.fillStyle = '#25405f'; poly(g, [[40, 64], [100, 10], [250, 10], [320, 64]], '#25405f');
      g.fillStyle = '#9fb7cc'; poly(g, [[62, 60], [108, 20], [170, 20], [170, 60]], 'rgba(170,195,215,0.85)');
      poly(g, [[180, 60], [180, 20], [244, 20], [292, 60]], 'rgba(170,195,215,0.85)');
      g.fillStyle = '#111'; [[40, 144], [280, 144]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 30, 0, 7); g.fill(); });
      g.fillStyle = '#8a8f96'; [[40, 144], [280, 144]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill(); });
      g.fillStyle = '#ffe9b0'; rr(g, 340, 84, 18, 12, 4); g.fill();
      g.restore();
    },
    backyard(g, r) {
      g.fillStyle = lin(g, 0, 0, 0, 200, [[0, '#a9b4bf'], [1, '#cfd5da']]); g.fillRect(0, 0, W, 200);
      for (let i = 0; i < 9; i++) blob(g, i * 120 + r() * 40, 120 + r() * 40, 80 + r() * 40, i % 2 ? '#2f4a33' : '#3a5a3c', r, 9);
      // fence
      g.fillStyle = '#8a6a4c'; g.fillRect(0, 170, W, 120);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, 170); g.lineTo(x, 290); g.stroke(); }
      g.fillStyle = '#6d5139'; g.fillRect(0, 196, W, 8); g.fillRect(0, 262, W, 8);
      // lawn
      poly(g, [[0, 290], [W, 290], [W, H], [0, H]], lin(g, 0, 290, 0, H, [[0, '#6f9a52'], [1, '#4c7a3a']]));
      g.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 8; i++) poly(g, [[i * 160 - 80, 290], [i * 160, 290], [i * 260 - 100, H], [i * 260 - 230, H]], 'rgba(255,255,255,0.05)');
      // patio + table + umbrella
      poly(g, [[520, 380], [W, 360], [W, H], [440, H]], '#a39e95');
      g.strokeStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(480 + i * 70, 375); g.lineTo(450 + i * 90, H); g.stroke(); }
      g.fillStyle = '#e8e2d6'; g.beginPath(); g.ellipse(720, 420, 90, 22, 0, 0, 7); g.fill();
      g.fillStyle = '#3a3a3a'; g.fillRect(716, 230, 8, 190);
      poly(g, [[560, 250], [720, 190], [880, 250]], '#c4553f');
      poly(g, [[560, 250], [720, 190], [640, 252]], '#a9452f');
      g.fillStyle = '#2b2b2b'; [[640, 440], [800, 440]].forEach(([x, y]) => { rr(g, x - 20, y - 50, 40, 70, 6); g.fill(); });
    },
    garage(g, r) {
      g.fillStyle = lin(g, 0, 0, 0, 330, [[0, '#c8c5bd'], [1, '#a9a69f']]); g.fillRect(0, 0, W, 330);
      g.fillStyle = rad(g, 480, 0, 10, 520, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, W, 330);
      g.fillStyle = '#f7fbff'; rr(g, 330, 14, 300, 10, 5); g.fill();
      // shelves
      g.fillStyle = '#5a5f66'; [80, 300].forEach((x) => { g.fillRect(x, 70, 6, 250); g.fillRect(x + 214, 70, 6, 250); });
      for (const x of [80, 300]) for (const y of [110, 190, 270]) {
        g.fillStyle = '#6b7178'; g.fillRect(x, y, 220, 6);
        let bx = x + 8; while (bx < x + 200) { const w = 30 + r() * 40, hh = 30 + r() * 40; g.fillStyle = ['#b98a54', '#3f6fb5', '#c6c1b4', '#9a3b31', '#4f8a5b'][Math.floor(r() * 5)]; g.fillRect(bx, y - hh, Math.min(w, x + 214 - bx), hh); bx += w + 6; }
      }
      // workbench + pegboard
      g.fillStyle = '#d6c4a0'; g.fillRect(580, 90, 300, 150);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 590; x < 870; x += 16) for (let y = 100; y < 230; y += 16) g.fillRect(x, y, 3, 3);
      g.fillStyle = '#7a5a3a'; g.fillRect(560, 240, 340, 22); g.fillRect(575, 262, 14, 70); g.fillRect(870, 262, 14, 70);
      // floor
      poly(g, [[0, 330], [W, 330], [W, H], [0, H]], lin(g, 0, 330, 0, H, [[0, '#8b8e91'], [1, '#5f6266']]));
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(480, 400, 220, 30, 0, 0, 7); g.fill();
      // bike
      g.strokeStyle = '#1f2326'; g.lineWidth = 6; [[160, 450], [330, 450]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 58, 0, 7); g.stroke(); });
      g.strokeStyle = '#c0392b'; g.lineWidth = 7; g.beginPath(); g.moveTo(160, 450); g.lineTo(230, 380); g.lineTo(310, 380); g.lineTo(330, 450); g.moveTo(230, 380); g.lineTo(250, 450); g.lineTo(160, 450); g.stroke();
    },
    nursery(g, r) {
      g.fillStyle = lin(g, 0, 0, 0, H, [[0, '#3a3a3a'], [1, '#202020']]); g.fillRect(0, 0, W, H);
      g.fillStyle = rad(g, 470, 300, 10, 520, [[0, 'rgba(230,230,230,0.42)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(0, 0, W, H);
      poly(g, [[0, 360], [W, 360], [W, H], [0, H]], '#2a2a2a');
      g.fillStyle = '#4a4a4a'; g.beginPath(); g.ellipse(470, 450, 300, 60, 0, 0, 7); g.fill();
      // crib
      g.fillStyle = '#bdbdbd'; g.fillRect(250, 210, 440, 14); g.fillRect(250, 380, 440, 14); g.fillRect(250, 190, 16, 250); g.fillRect(674, 190, 16, 250);
      g.fillStyle = '#d8d8d8'; g.fillRect(266, 330, 408, 50);
      g.fillStyle = '#9a9a9a'; for (let x = 286; x < 670; x += 26) g.fillRect(x, 224, 8, 156);
      g.fillStyle = '#efefef'; g.beginPath(); g.ellipse(400, 318, 60, 26, 0, 0, 7); g.fill();
      // mobile
      g.strokeStyle = '#8a8a8a'; g.lineWidth = 3; g.beginPath(); g.moveTo(470, 40); g.lineTo(470, 110); g.moveTo(400, 110); g.lineTo(540, 110); g.stroke();
      g.fillStyle = '#cfcfcf'; [[400, 140], [470, 150], [540, 140]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); });
      g.fillStyle = '#5a5a5a'; rr(g, 60, 120, 120, 180, 6); g.fill(); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(70, 130, 100, 160);
    },
    side_gate(g, r) {
      g.fillStyle = '#262626'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#4a4a4a'; for (let x = 300; x < 660; x += 30) g.fillRect(x, 120, 26, 300);
      poly(g, [[380, 420], [580, 420], [760, H], [200, H]], '#5c5c5c');
      for (let i = 0; i < 6; i++) blob(g, i < 3 ? 120 + i * 50 : 760 + (i - 3) * 60, 380, 70, '#3a3a3a', r, 8);
    },
  };

  /** Render a scene to a JPEG data URL. opts: { t: ms timestamp, osd: draw a timestamp, ir: grayscale } */
  function frame(scene, opts) {
    const o = opts || {};
    const t = o.t || Date.now();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = rng(scene.length * 997);
    (SCENES[scene] || SCENES.side_gate)(g, r, t);
    if (o.ir) {
      const d = g.getImageData(0, 0, W, H);
      for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11; d.data[i] = v * 0.96; d.data[i + 1] = v; d.data[i + 2] = v * 0.98; }
      g.putImageData(d, 0, 0);
    }
    // lens: grain, vignette, slight haze
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = o.ir ? 0.5 : 0.28;
    g.fillStyle = g.createPattern(grain(), 'repeat'); g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = rad(g, W / 2, H / 2, H * 0.35, W * 0.72, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.55)']]); g.fillRect(0, 0, W, H);
    // OSD timestamp (top-left of the frame, as most cameras do)
    if (o.osd) {
      const d = new Date(t);
      const p = (n) => String(n).padStart(2, '0');
      const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      g.font = '600 17px ui-monospace, Menlo, monospace'; g.textBaseline = 'bottom';
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(ts, W - 236 + 1, H - 16 + 1);
      g.fillStyle = 'rgba(255,255,255,0.82)'; g.fillText(ts, W - 236, H - 16);
    }
    return c.toDataURL('image/jpeg', 0.86);
  }

  root.GHFrames = { frame, scenes: Object.keys(SCENES) };
})(window);
