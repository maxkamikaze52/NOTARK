/* ==========================================================================
   NOTARK INK MODES — taken from Rnote and Xournal++
   --------------------------------------------------------------------------
   Both of these are better than what Notark had, in specific, copyable ways:

   1. PRESSURE CURVES  — Rnote (crates/rnote-compose/src/style/mod.rs,
      `enum PressureCurve` + `apply()`): width = stroke_width * f(pressure),
      where f is one of Const / Linear / Sqrt / Cbrt / Pow2 / Pow3. Notark
      multiplied width by pressure linearly and nothing else. Rnote lets the
      user pick the response curve, which is what makes a fountain pen feel
      like a fountain pen and a pencil feel like a pencil. Rnote is GPL-3.0,
      so this is the published response set re-implemented, not their code.

   2. TEXTURED / DOT GRAIN — Rnote (style/textured/mod.rs,
      `compose_textured_line_path`): a textured stroke is NOT a filled shape
      with noise on it; it is a distribution of individual little rotated
      ellipses ("dots") scattered across the stroke's width:
          n_dots  = area * 0.1 * density
          rx, ry  = base radii * (1 + width * STROKE_WIDTH_RADII_WEIGHT)
                    each randomized 0.8..1.25
          rot     = direction of the line + random(-pi/8..pi/8)
      That is why Rnote's textured brush looks like real paper grain at every
      zoom level: the dots are geometry, not a bitmap mask. This is strictly
      better than our grain-mask approach for sharp strokes.

   3. STROKE STABILIZERS — Xournal++ (src/core/control/tools/StrokeStabilizer):
      deadzone (ignore movement inside a radius), inertia (drag/mass spring),
      gaussian averaging, and *cusp detection* (if the direction reverses more
      than 90 degrees, flush the buffer so a hard corner is not rounded off).
      Notark has one exponential smoother and no cusp handling, so corners get
      eaten. The deadzone + cusp rule is the cheap, high-value part.

   Everything here is opt-in per tool and off by default, so nothing changes
   for existing notes.
   ========================================================================== */

/* ---------- 1. Rnote pressure curves ---------- */

const PRESSURE_CURVES = {
  const: () => 1,
  linear: p => p,
  sqrt: p => Math.sqrt(p),
  cbrt: p => Math.cbrt(p),
  pow2: p => p * p,
  pow3: p => p * p * p,
};

/** Rnote's PressureCurve::apply(0..1) for a stroke. */
function pressureWidth(st, pressure) {
  const f = PRESSURE_CURVES[st && st.pcurve] || PRESSURE_CURVES.linear;
  const p = pressure == null ? 1 : Math.max(0, Math.min(1, pressure));
  return f(p);
}

/* ---------- 2. Rnote textured dots ---------- */

const TEXTURED_RADII = [.62, .34];       // Rnote's DOTS_RADII_DEFAULT, in px per unit width
const TEXTURED_WIDTH_WEIGHT = .09;       // STROKE_WIDTH_RADII_WEIGHT
const TEXTURED_DENSITY = 1.9;            // dots per unit area multiplier (Rnote uses `density`)

let _dotSeed = 1;
function dotRand() {                       // deterministic PCG-ish, like Rnote seeding the RNG
  _dotSeed = (_dotSeed * 1664525 + 1013904223) >>> 0;
  return _dotSeed / 4294967296;
}
function dotRange(a, b) { return a + (b - a) * dotRand(); }

/**
 * Draw one textured stroke as scattered rotated ellipses, following Rnote's
 * compose_textured_line_path: the dots are distributed across a rectangle of
 * the stroke's width along each segment, radially randomized, and rotated with
 * the segment.
 */
function paintTextured(c, pts, st, baseW, alpha, k) {
  const n = pts.length;
  if (n < 2) return;
  const col = inkFor(st.color);
  const seed = (st.seed || 7) | 0;
  const radii = [
    TEXTURED_RADII[0] * (1 + baseW * TEXTURED_WIDTH_WEIGHT),
    TEXTURED_RADII[1] * (1 + baseW * TEXTURED_WIDTH_WEIGHT),
  ];
  const wv = (st.wv && st.wv.length === n) ? st.wv : null;
  c.save();
  c.fillStyle = col;
  c.globalAlpha = alpha;
  _dotSeed = seed >>> 0;
  const minStep = Math.max(1.1, baseW * .34);   // sample spacing along the path
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const w = baseW * (wv ? pressureWidth(st, wv[i]) : 1);
    const half = Math.max(.35, w * .5);
    // area of the segment's band, exactly Rnote's `area` for a line
    const area = 2 * half * len;
    let count = Math.round(area * .1 * TEXTURED_DENSITY);
    if (count < 1) count = 1;
    if (count > 220) count = 220;               // guard: a fast flick must not spray
    const ux = dx / len, uy = dy / len;         // along
    const px = -uy, py = ux;                    // across
    const ang = Math.atan2(dy, dx);
    for (let d = 0; d < count; d++) {
      const t = dotRand();
      const s = dotRand() * 2 - 1;
      const cx = a.x + ux * len * t + px * s * half;
      const cy = a.y + uy * len * t + py * s * half;
      const rx = radii[0] * dotRange(.8, 1.25);
      const ry = radii[1] * dotRange(.8, 1.25);
      const rot = ang + dotRange(-Math.PI / 8, Math.PI / 8);
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, rot, 0, 6.2832);
      c.fill();
    }
  }
  c.restore();
}
/* ---------- 3. Xournal++ deadzone + cusp stabilizer ---------- */

/**
 * Wraps the raw pointer position. Notark's `stepLive` runs an exponential
 * filter, which rounds off sharp corners. Xournal++ handles this by ignoring
 * movement inside a deadzone and by detecting a cusp (direction reversal over
 * 90 degrees) and flushing through it.
 */
function makeStabilizer(opts) {
  // radius default 0: a deadzone larger than the user's slowest handwriting
  // stalls the stroke instead of steadying it.
  const radius = opts && opts.radius != null ? opts.radius : 0;
  const cusp = !opts || opts.cusp !== false;
  let lastLive = null, lastDir = { x: 0, y: 0 };
  return function filter(x, y) {
    if (!lastLive) {
      lastLive = { x, y };
      return { x, y, cusp: false };
    }
    const mx = x - lastLive.x, my = y - lastLive.y;
    const norm = Math.hypot(mx, my);
    if (norm < radius) return { x: lastLive.x, y: lastLive.y, cusp: false, skip: true };
    // cusp: compare against the PREVIOUS direction (as Xournal++ does with
    // lastLiveDirection) before overwriting it, or a reversal never registers.
    const dot = mx * lastDir.x + my * lastDir.y;
    const hadDir = !!(lastDir.x || lastDir.y);
    const isCusp = cusp && hadDir && dot < 0;
    lastLive = { x, y };
    lastDir = { x: mx / norm, y: my / norm };
    return { x, y, cusp: !!isCusp };
  };
}

let TEXTURED_ON = localStorage.getItem('notark.textured') === '1';
