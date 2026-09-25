// "Considered." — a 15 second, single-take motion piece.
// One point becomes a ring, an icon, a field of pixels, and finally the full stop
// of a sentence, then returns to where it started. Loops seamlessly.
//
// Everything is authored in a 1920×1080 design space, origin at frame centre,
// and evaluated as a pure function of time so it can be super-sampled for motion blur.

(function () {
  const W0 = 1920, H0 = 1080;
  const WHITE = '#F5F5F7';
  const SECONDARY = '#86868B';

  const DOT_R = 13;
  const R_OUT = 196, R_IN = 184;
  const COLS = 13, ROWS = 7, TILE = 84, PITCH = 108, TH = TILE / 2;
  const CC = 6, CR = 3; // centre tile

  const HEAD_SIZE = 184;
  const HEAD_FONT = `600 ${HEAD_SIZE}px InterDisplay`;
  const HEAD_TRACK = -0.022 * HEAD_SIZE;
  const SUB_SIZE = 36;
  const SUB_FONT = `400 ${SUB_SIZE}px InterText`;
  const WORD = 'Considered';
  const SUBLINE = 'Down to the last pixel.';

  // ── Timeline (seconds) ────────────────────────────────────────────────
  const TL = {
    dotIn: 0.28,
    anticA: 1.00, anticB: 1.30,
    expand: 1.30,
    sweepA: 1.92, sweepB: 2.78,
    fill: 2.74,
    morph: 3.36,
    sheenA: 4.18, sheenB: 4.92,
    grid: 4.95,
    press: 6.26, release: 6.40,
    collapse: 7.42,
    launchPrep: 8.50, launch: 8.64, land: 9.40,
    type: 8.78,
    sub: 9.95,
    outSub: 12.45, outType: 12.55,
    retPrep: 13.02, retA: 13.14, retB: 13.92,
    whiteA: 13.40, whiteB: 13.95,
    endA: 14.22, endB: 14.66,
  };

  // ── Math ──────────────────────────────────────────────────────────────
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  // SwiftUI-style spring: response = undamped period, damping = damping fraction.
  function spring(t, response = 0.55, damping = 0.825) {
    if (t <= 0) return 0;
    const w = (2 * Math.PI) / response;
    if (damping >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
    const wd = w * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
  }

  // Unit impulse response of a damped oscillator, normalised so the first lobe peaks at 1.
  function impulse(t, period, damping) {
    if (t <= 0) return 0;
    const w = (2 * Math.PI) / period;
    const wd = w * Math.sqrt(1 - damping * damping);
    const tp = Math.atan(wd / (damping * w)) / wd;
    const peak = Math.exp(-damping * w * tp) * Math.sin(wd * tp);
    return (Math.exp(-damping * w * t) * Math.sin(wd * t)) / peak;
  }

  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x, d = dx(t);
        if (Math.abs(e) < 1e-6) break;
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1;
      for (let i = 0; i < 20 && Math.abs(sx(t) - x) > 1e-6; i++) {
        if (sx(t) < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }
  const easeInOut = bezier(0.65, 0, 0.35, 1);
  const easeOut = bezier(0.16, 1, 0.3, 1);
  const easeIn = bezier(0.55, 0, 0.8, 0.2);
  const drain = bezier(0.62, 0, 0.22, 1);
  const inBack = bezier(0.5, -0.45, 0.75, 0.05);

  function hash(i) {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ── Colour: OKLab mesh field ──────────────────────────────────────────
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const toSrgb = (x) => { x = clamp(x); return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055); };
  function hexToLab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = toLin((n >> 16) & 255), g = toLin((n >> 8) & 255), b = toLin(n & 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function labToRgb(L, a, b, out, o) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    out[o] = toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    out[o + 1] = toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    out[o + 2] = toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    out[o + 3] = 255;
  }

  // Apple system colours (dark appearance), laid out on a diagonal so that
  // only hue-neighbours ever meet.
  const BLOBS = [
    { c: '#64D2FF', x: -1.02, y: -0.52, r: 0.16, w: 0.31, p: 0.3 },
    { c: '#0A84FF', x: -0.55, y: -0.05, r: 0.20, w: -0.27, p: 1.7 },
    { c: '#5E5CE6', x: -0.08, y: 0.42, r: 0.18, w: 0.34, p: 2.9 },
    { c: '#BF5AF2', x: 0.12, y: -0.36, r: 0.20, w: -0.29, p: 4.1 },
    { c: '#FF375F', x: 0.60, y: 0.16, r: 0.18, w: 0.33, p: 5.3 },
    { c: '#FF9F0A', x: 1.02, y: 0.58, r: 0.14, w: -0.30, p: 0.9 },
  ].map((b) => {
    const lab = hexToLab(b.c);
    return { ...b, lab, C: Math.hypot(lab[1], lab[2]) };
  });
  const SIGMA2 = 0.5 * 0.5;

  const FTW = 256, FTH = 144, FUX = 2.0, FUY = 1.125;

  function makeField() {
    const canvas = document.createElement('canvas');
    canvas.width = FTW; canvas.height = FTH;
    const fctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = fctx.createImageData(FTW, FTH);
    return { canvas, fctx, img };
  }

  function updateField(field, t) {
    const d = field.img.data;
    const rot = 0.18 * Math.sin(t * 0.21);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const bx = [], by = [];
    for (const b of BLOBS) {
      const x = b.x + b.r * Math.cos(b.w * t * 2.2 + b.p);
      const y = b.y + b.r * Math.sin(b.w * t * 2.6 + b.p);
      bx.push(x * cr - y * sr); by.push(x * sr + y * cr);
    }
    let o = 0;
    for (let j = 0; j < FTH; j++) {
      const v = ((j + 0.5) / FTH) * 2 * FUY - FUY;
      for (let i = 0; i < FTW; i++) {
        const u = ((i + 0.5) / FTW) * 2 * FUX - FUX;
        let sw = 1e-6, L = 0, A = 0, B = 0, C = 0;
        for (let k = 0; k < BLOBS.length; k++) {
          const dx = u - bx[k], dy = v - by[k];
          const w = Math.exp(-(dx * dx + dy * dy) / SIGMA2) + 1e-5;
          const lab = BLOBS[k].lab;
          sw += w; L += w * lab[0]; A += w * lab[1]; B += w * lab[2]; C += w * BLOBS[k].C;
        }
        L /= sw; A /= sw; B /= sw; C /= sw;
        // Keep chroma from collapsing through the middle of the mix.
        const c0 = Math.hypot(A, B) + 1e-6;
        const k = (C * 0.96) / c0;
        L += -0.035 * v; // light from above
        labToRgb(L, A * k, B * k, d, o);
        o += 4;
      }
    }
    field.fctx.putImageData(field.img, 0, 0);
  }

  // Draw the field so that u=±1 lands at ±extent design px from the origin.
  function paintField(c, field, extent, alpha = 1) {
    c.save();
    c.globalAlpha *= alpha;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(field.canvas, -FUX * extent, -FUY * extent, 2 * FUX * extent, 2 * FUY * extent);
    c.restore();
  }

  // ── Geometry ──────────────────────────────────────────────────────────
  function superellipse(p, cx, cy, a, n, rot, seg) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const e = 2 / n;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const x = a * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = a * Math.sign(s) * Math.pow(Math.abs(s), e);
      const X = cx + x * cr - y * sr, Y = cy + x * sr + y * cr;
      if (i === 0) p.moveTo(X, Y); else p.lineTo(X, Y);
    }
    p.closePath();
  }

  function tileHighlight(c, x, y, a, rot, n, alpha) {
    if (alpha <= 0.002) return;
    c.save();
    const p = new Path2D();
    superellipse(p, x, y, a, n, rot, 48);
    c.clip(p);
    const g = c.createLinearGradient(x, y - a, x, y + a * 0.2);
    g.addColorStop(0, `rgba(255,255,255,${0.16 * alpha})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - a, y - a, 2 * a, 2 * a);
    c.restore();
  }

  // ── Typography layout (measured once) ─────────────────────────────────
  let layout = null;
  function measure(ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = HEAD_FONT;
    ctx.letterSpacing = `${HEAD_TRACK}px`;
    ctx.fontKerning = 'normal';
    const xs = [];
    for (let i = 0; i <= WORD.length; i++) xs.push(ctx.measureText(WORD.slice(0, i)).width);
    const wordW = xs[WORD.length] - HEAD_TRACK; // drop trailing tracking
    const capH = 0.7275 * HEAD_SIZE;
    const gap = 0.018 * HEAD_SIZE;
    const total = wordW + gap + 2 * DOT_R;
    const left = -total / 2;
    const subGap = 86;
    const baseline = (capH - subGap) / 2 + 6;
    ctx.restore();
    layout = {
      xs: xs.map((x) => left + x),
      orbX: left + wordW + gap + DOT_R,
      orbY: baseline - DOT_R,
      baseline,
      subY: baseline + subGap,
      capH,
    };
  }

  // ── Tiles ─────────────────────────────────────────────────────────────
  const TILES = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c - CC) * PITCH, y = (r - CR) * PITCH;
      const dist = Math.hypot(c - CC, r - CR);
      TILES.push({ x, y, dist, centre: c === CC && r === CR, h: hash(r * COLS + c) });
    }
  }
  const MAX_DIST = Math.max(...TILES.map((t) => t.dist));
  const COL_DUR = 0.56, COL_STAG = 0.05;
  const LAST_ARRIVE = TL.collapse + MAX_DIST * COL_STAG + COL_DUR;

  // ── State ─────────────────────────────────────────────────────────────
  function whiteDisc(t) {
    if (t < TL.expand) {
      const sc = spring(t - TL.dotIn, 0.5, 0.58);
      const an = easeInOut(prog(t, TL.anticA, TL.anticB));
      return { ro: DOT_R * sc * (1 - 0.2 * an), ri: 0 };
    }
    const ro = lerp(DOT_R * 0.8, R_OUT, spring(t - TL.expand, 0.62, 0.7));
    let ri = lerp(0, R_IN, spring(t - TL.expand - 0.045, 0.8, 0.8));
    ri = Math.max(0, Math.min(ri, ro - 1.5));
    return { ro, ri };
  }

  function orbState(t) {
    const L = layout;
    let x = 0, y = 0, sx = 1, sy = 1;
    // pre-launch squash (anchored at the bottom of the orb)
    const prep = easeOut(prog(t, TL.launchPrep, TL.launch)) * (1 - prog(t, TL.launch, TL.launch + 0.06));
    sy -= 0.2 * prep; sx += 0.14 * prep;
    if (t >= TL.launch) {
      const u = prog(t, TL.launch, TL.land);
      x = L.orbX * u;
      y = lerp(0, L.orbY, u) - 118 * 4 * u * (1 - u);
      // stretch along the arc while airborne
      const air = Math.sin(Math.PI * u);
      sx *= 1 + 0.04 * air; sy *= 1 + 0.04 * air;
    }
    if (t >= TL.land) {
      const k = impulse(t - TL.land, 0.3, 0.32);
      sy *= 1 - 0.24 * k; sx *= 1 + 0.18 * k;
    }
    // return home
    const rp = easeOut(prog(t, TL.retPrep, TL.retA)) * (1 - prog(t, TL.retA, TL.retA + 0.08));
    sy -= 0.16 * rp; sx += 0.12 * rp;
    if (t >= TL.retA) {
      const u = easeInOut(prog(t, TL.retA, TL.retB));
      x = lerp(L.orbX, 0, u);
      y = lerp(L.orbY, 0, u) - 84 * Math.sin(Math.PI * u);
    }
    if (t >= TL.retB) {
      const k = impulse(t - TL.retB, 0.34, 0.4);
      sx *= 1 + 0.05 * k; sy *= 1 + 0.05 * k;
    }
    return { x, y, sx, sy };
  }

  // ── Render ────────────────────────────────────────────────────────────
  function render(env, t) {
    const { ctx, cctx, gctx, gcanvas, ccanvas, W, H, field } = env;
    if (!layout) measure(ctx);
    const s = W / W0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, W / 2, H / 2);
    cctx.setTransform(s, 0, 0, s, W / 2, H / 2);

    updateField(field, t);
    let glow = 0.5;

    // 1 · Point → ring → disc → icon ────────────────────────────────────
    if (t < TL.grid + 0.9) {
      const { ro, ri } = whiteDisc(t);
      const sweep = Math.PI * 2 * easeInOut(prog(t, TL.sweepA, TL.sweepB));
      const a0 = -Math.PI / 2;

      // white part (only where colour has not arrived yet)
      if (t < TL.sweepB && ro > 0.01) {
        const p = new Path2D();
        if (sweep <= 0) {
          p.arc(0, 0, ro, 0, Math.PI * 2);
          if (ri > 0.3) { p.moveTo(ri, 0); p.arc(0, 0, ri, 0, Math.PI * 2, true); }
          ctx.fillStyle = WHITE;
          ctx.fill(p, 'evenodd');
        } else {
          ctx.save();
          const w = new Path2D();
          w.moveTo(0, 0);
          w.arc(0, 0, ro + 4, a0 + sweep, a0 + Math.PI * 2);
          w.closePath();
          ctx.clip(w);
          p.arc(0, 0, ro, 0, Math.PI * 2);
          p.moveTo(ri, 0); p.arc(0, 0, ri, 0, Math.PI * 2, true);
          ctx.fillStyle = WHITE;
          ctx.fill(p, 'evenodd');
          ctx.restore();
        }
      }

      // coloured part
      if (sweep > 0) {
        const m = spring(t - TL.morph, 0.72, 0.74);
        const n = 2 + 3 * m;
        const a = iconSize(t, ro);
        const rot = -Math.PI / 4 * (1 - spring(t - TL.morph, 0.95, 0.66));
        const g = spring(t - TL.grid, 0.58, 0.86);
        const riFill = t < TL.fill ? ri : ri * (1 - spring(t - TL.fill, 0.64, 1));

        cctx.save();
        if (sweep < Math.PI * 2 - 1e-4) {
          const w = new Path2D();
          // overlap the white by a hair on both edges so no anti-aliased seam survives
          const ov = Math.min(0.02, sweep);
          w.moveTo(0, 0);
          w.arc(0, 0, ro + 4, a0 - ov, a0 + sweep + ov);
          w.closePath();
          cctx.clip(w);
        }
        const p = new Path2D();
        superellipse(p, 0, 0, a, n, rot, 180);
        if (riFill > 0.3) { p.moveTo(riFill, 0); p.arc(0, 0, riFill, 0, Math.PI * 2, true); }
        cctx.clip(p, 'evenodd');
        // extent: the whole field lives inside the shape; hand-off to the grid is continuous
        paintField(cctx, field, fieldExtent(t));

        // glass: soft top-left light + sheen sweep, only once the icon has form
        const lit = clamp(m) * (1 - g);
        if (lit > 0.001) {
          const hl = cctx.createRadialGradient(-0.45 * a, -0.6 * a, 0, -0.45 * a, -0.6 * a, 1.5 * a);
          hl.addColorStop(0, `rgba(255,255,255,${0.26 * lit})`);
          hl.addColorStop(0.55, `rgba(255,255,255,${0.05 * lit})`);
          hl.addColorStop(1, 'rgba(255,255,255,0)');
          cctx.fillStyle = hl;
          cctx.fillRect(-a * 1.2, -a * 1.2, a * 2.4, a * 2.4);
          const sp = prog(t, TL.sheenA, TL.sheenB);
          if (sp > 0 && sp < 1) {
            const e = easeInOut(sp);
            const bx = lerp(-2.2 * a, 2.2 * a, e);
            cctx.save();
            cctx.rotate(-0.38);
            const sg = cctx.createLinearGradient(bx - 0.45 * a, 0, bx + 0.45 * a, 0);
            const pk = 0.34 * Math.sin(Math.PI * sp) * lit;
            sg.addColorStop(0, 'rgba(255,255,255,0)');
            sg.addColorStop(0.5, `rgba(255,255,255,${pk})`);
            sg.addColorStop(1, 'rgba(255,255,255,0)');
            cctx.fillStyle = sg;
            cctx.fillRect(-3 * a, -3 * a, 6 * a, 6 * a);
            cctx.restore();
          }
        }
        cctx.restore();
      }
    }

    // 2 · Pixels ───────────────────────────────────────────────────────
    if (t >= TL.grid && t < LAST_ARRIVE + 0.02) {
      const ts = tileStates(t);
      const ext = fieldExtent(t, ts);
      const p = new Path2D();
      for (const q of ts) if (q.a > 0.05) superellipse(p, q.x, q.y, q.a, q.n, q.rot, 48);
      cctx.save();
      cctx.clip(p);
      paintField(cctx, field, ext);
      cctx.restore();
      for (const q of ts) {
        if (q.a <= 0.05) continue;
        tileHighlight(cctx, q.x, q.y, q.a, q.rot, q.n, q.hl);
        if (q.flash > 0.003) {
          const fp = new Path2D();
          superellipse(fp, q.x, q.y, q.a, q.n, q.rot, 48);
          cctx.fillStyle = `rgba(255,255,255,${q.flash})`;
          cctx.fill(fp);
        }
      }
      glow = 0.42;
    }

    // 3 · The full stop ────────────────────────────────────────────────
    if (t >= TL.collapse + 0.3) {
      const eC = drain(prog(t, TL.collapse, TL.collapse + COL_DUR));
      if (eC >= 1) {
        // swallow pulse as tiles arrive, then release
        let grow = 0;
        for (const q of TILES) {
          if (q.centre) continue;
          const d = TL.collapse + q.dist * COL_STAG;
          grow += smooth(0.75, 1, drain(prog(t, d, d + COL_DUR)));
        }
        grow /= TILES.length - 1;
        const rel = spring(t - LAST_ARRIVE, 0.44, 0.48);
        const pulse = 1 + 0.55 * grow * (1 - rel);

        const o = orbState(t);
        const end = prog(t, TL.endA, TL.endB);
        const endScale = 1 - inBack(end);
        const r = DOT_R * pulse * endScale;
        if (r > 0.02) {
          const wf = easeInOut(prog(t, TL.whiteA, TL.whiteB));
          cctx.save();
          cctx.translate(o.x, o.y + DOT_R);
          cctx.scale(o.sx, o.sy);
          cctx.translate(0, -DOT_R);
          const p = new Path2D();
          p.arc(0, 0, r, 0, Math.PI * 2);
          cctx.save();
          cctx.clip(p);
          if (wf < 1) paintField(cctx, field, t < LAST_ARRIVE + 0.02 ? Math.max(r * 1.05, fieldExtent(t)) : r * 1.05, 1);
          if (wf > 0) { cctx.fillStyle = WHITE; cctx.globalAlpha = wf; cctx.fillRect(-r - 2, -r - 2, 2 * r + 4, 2 * r + 4); }
          cctx.restore();
          cctx.restore();
        }
        if (t > LAST_ARRIVE) glow += 0.9 * Math.exp(-(t - LAST_ARRIVE) / 0.22);
        if (t > TL.land) glow += 0.5 * Math.exp(-(t - TL.land) / 0.28);
        glow *= 1 + 0.9 * (1 - prog(t, TL.whiteA, TL.whiteB)) * prog(t, LAST_ARRIVE, LAST_ARRIVE + 0.3);
      }
    }

    // Type ─────────────────────────────────────────────────────────────
    if (t >= TL.type && t < TL.outType + 1.2) {
      const L = layout;
      ctx.save();
      ctx.font = HEAD_FONT;
      ctx.letterSpacing = `${HEAD_TRACK}px`;
      ctx.fontKerning = 'normal';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = WHITE;
      const clip = new Path2D();
      clip.rect(-W0, -H0, 2 * W0, H0 + L.baseline + 0.035 * HEAD_SIZE);
      ctx.clip(clip);
      const drop = 0.84 * HEAD_SIZE;
      for (let i = 0; i < WORD.length; i++) {
        const tin = t - (TL.type + i * 0.034);
        if (tin <= 0) continue;
        const rise = spring(tin, 0.6, 0.86);
        let oy = (1 - rise) * drop;
        let al = easeOut(clamp(tin / 0.24));
        const tout = prog(t, TL.outType + i * 0.026, TL.outType + i * 0.026 + 0.44);
        if (tout > 0) { const f = easeIn(tout); oy += f * drop; al *= 1 - smooth(0.4, 1, f); }
        if (al <= 0.001) continue;
        ctx.globalAlpha = al;
        ctx.fillText(WORD[i], L.xs[i], L.baseline + oy);
      }
      ctx.restore();

      const si = easeOut(prog(t, TL.sub, TL.sub + 1.0));
      const so = easeIn(prog(t, TL.outSub, TL.outSub + 0.36));
      const sa = si * (1 - so);
      if (sa > 0.001) {
        ctx.save();
        ctx.font = SUB_FONT;
        ctx.letterSpacing = `${0.004 * SUB_SIZE}px`;
        ctx.textAlign = 'center';
        ctx.fillStyle = SECONDARY;
        ctx.globalAlpha = sa;
        ctx.fillText(SUBLINE, 0, L.subY + (1 - si) * 16 - so * 6);
        ctx.restore();
      }
    }

    // Composite: glow (screen-space, quarter res) then colour on top ──────
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, gcanvas.width, gcanvas.height);
    gctx.filter = `blur(${(15 * gcanvas.width) / W0}px)`;
    gctx.drawImage(ccanvas, 0, 0, gcanvas.width, gcanvas.height);
    gctx.filter = 'none';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(glow, 0, 1.6) * 0.62;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(gcanvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(ccanvas, 0, 0);
  }

  function tileStates(t) {
    const out = [];
    const press = t < TL.press ? 0 : t < TL.release ? easeOut(prog(t, TL.press, TL.release)) : 1 - spring(t - TL.release, 0.42, 0.5);
    for (const q of TILES) {
      let x = q.x, y = q.y, a, sc = 1, flash = 0, hl = 1, ap = 1;
      if (q.centre) {
        a = TH; // the icon itself is drawn by the icon pass until it hands over
        sc = 1 - 0.16 * press;
        if (t < TL.grid + 0.9) a = 0; // icon pass owns it
      } else {
        const d = TL.grid + 0.14 + q.dist * 0.055 + (q.h - 0.5) * 0.03;
        const s = spring(t - d, 0.5, 0.6);
        a = TH * s;
        const k = 0.86 + 0.14 * Math.min(1, s);
        x *= k; y *= k;
        hl = clamp(s);
        ap = clamp(s);
      }
      // ripple
      const tr = t - TL.release;
      if (tr > 0) {
        const amp = 1 / (1 + 0.07 * q.dist);
        const xw = 8.6 * tr - q.dist;
        const k1 = Math.exp(-(xw * xw) / 0.5);
        const k2 = Math.exp(-((xw - 1.5) ** 2) / 0.9);
        if (!q.centre) sc *= 1 - 0.3 * k1 * amp + 0.07 * k2 * amp;
        const push = 11 * Math.exp(-((xw - 0.6) ** 2) / 0.5) * amp;
        if (q.dist > 0) { x += (q.x / (q.dist * PITCH)) * push; y += (q.y / (q.dist * PITCH)) * push; }
        flash = 0.3 * Math.exp(-((xw - 0.2) ** 2) / 0.35) * amp;
      }
      // collapse — swirl down the drain, inner tiles first
      let n = 5, rot = 0;
      const cd = TL.collapse + q.dist * COL_STAG;
      const e = drain(prog(t, cd, cd + COL_DUR));
      if (e > 0) {
        const th = 1.05 * e;
        const px = x * (1 - e), py = y * (1 - e);
        x = px * Math.cos(th) - py * Math.sin(th);
        y = px * Math.sin(th) + py * Math.cos(th);
        a = lerp(a * sc, DOT_R, e); sc = 1;
        n = lerp(5, 2, e);
        rot = th;
        flash *= 1 - e;
        if (e >= 1) a = 0; // merged (the centre is carried on by the orb pass)
      }
      out.push({ x, y, a: a * sc, n, rot, flash, hl: hl * (1 - e), ap });
    }
    return out;
  }

  // How far the colour field is stretched: it always spans exactly the visible
  // content, so ring → icon → pixels → orb read as one continuous surface.
  function iconSize(t, ro) {
    const m = spring(t - TL.morph, 0.72, 0.74);
    const g = spring(t - TL.grid, 0.58, 0.86);
    return lerp(lerp(ro, 178, clamp(m, 0, 1.2)), TH, g);
  }
  function fieldExtent(t, ts) {
    if (t < TL.grid) return Math.max(iconSize(t, whiteDisc(t).ro), 60) * 1.06;
    ts = ts || tileStates(t);
    let ext = 0;
    for (const q of ts) if (q.a > 0) ext = Math.max(ext, (Math.hypot(q.x, q.y) + q.a) * q.ap);
    if (t < TL.grid + 0.9) ext = Math.max(ext, iconSize(t, R_OUT) * 1.06);
    return Math.max(ext, DOT_R * 1.05);
  }

  window.Scene = { render, W0, H0, DURATION: 15, makeField, TL };
})();
