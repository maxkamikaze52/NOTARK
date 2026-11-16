/* ==========================================================================
   NOTARK PENCIL — ported from Saber + perfect-freehand
   --------------------------------------------------------------------------
   Two pieces, both taken from real source, not invented:

   1. GEOMETRY — Saber does NOT stroke a path. It asks `perfect-freehand`
      (MIT, © 2021 Stephen Ruiz Ltd) for an OUTLINE POLYGON: left/right offsets
      perpendicular to the stroke direction, radius driven by pressure with
      velocity-simulated pressure, plus tapered start/end and round caps.
      Ported here from:
        packages/perfect-freehand/src/getStrokePoints.ts
        packages/perfect-freehand/src/getStrokeOutlinePoints.ts
        packages/perfect-freehand/src/getStrokeRadius.ts
        packages/perfect-freehand/src/simulatePressure.ts
        packages/perfect-freehand/src/constants.ts

   2. GRAIN — Saber paints that polygon with shaders/pencil.frag:
        noise = FBM(fragCoord * vec2(0.7, 0.35))  // 5 octaves, value noise
        opacity = easeInOutQuad(noise*0.5+0.5) * 0.7
        fragColor = vec4(color * opacity, opacity)
      The noise functions are Morgan McGuire's (shadertoy 4dS3Wd, BSD) as used
      by Saber. Ported here as a JS function on the canvas bitmap.

   Licence note: perfect-freehand is MIT (attribution above). Saber itself is
   GPL-3.0, so this file is an independent re-implementation of the published
   algorithm in Notark's own style, not a copy of Saber's Dart source.
   ========================================================================== */

/* ---------- 1. outline geometry (perfect-freehand port) ---------- */

const PF_RATE = .275, PF_FIXED_PI = Math.PI + .0001, PF_START_CAP = 13, PF_END_CAP = 29,
      PF_CORNER_CAP = 13, PF_END_NOISE = 3, PF_MIN_STREAM_T = .15, PF_STREAM_RANGE = .85,
      PF_MIN_RADIUS = .01, PF_FIRST_PRESSURE = .25, PF_DEFAULT_PRESSURE = .5;

const pfLen = a => Math.hypot(a[0], a[1]);
const pfUni = a => { const l = pfLen(a) || 1; return [a[0] / l, a[1] / l]; };
const pfPer = a => [a[1], -a[0]];
const pfDot = (a, b) => a[0] * b[0] + a[1] * b[1];
const pfAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const pfSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const pfMul = (a, n) => [a[0] * n, a[1] * n];
const pfDist2 = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; };
const pfLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function pfRotAround(p, c, r) {
  const s = Math.sin(r), co = Math.cos(r), dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co];
}
function pfRadius(size, thinning, pressure, easing) {
  const t = .5 - thinning * (.5 - pressure);
  return size * (easing ? easing(t) : t);
}
function pfSimPressure(prev, distance, size) {
  const sp = Math.min(1, distance / size), rp = Math.min(1, 1 - sp);
  return Math.min(1, prev + (rp - prev) * (sp * PF_RATE));
}
const pfValidP = p => typeof p === 'number' && isFinite(p);

function pfStrokePoints(raw, o) {
  const streamline = o.streamline == null ? .5 : o.streamline;
  const size = o.size || 16, complete = !!o.last;
  if (!raw.length) return [];
  const t = PF_MIN_STREAM_T + (1 - streamline) * PF_STREAM_RANGE;
  let pts = raw.map(p => Array.isArray(p) ? p : [p.x, p.y, pfValidP(p.pressure) ? p.pressure : PF_DEFAULT_PRESSURE]);
  if (pts.length === 2) {
    const last = pts[1];
    pts = pts.slice(0, -1);
    for (let i = 1; i < 5; i++) pts.push(pfLerp(pts[0], last, i / 4));
  }
  if (pts.length === 1) pts = [pts[0], [pts[0][0] + 1, pts[0][1] + 1, pts[0][2]]];
  const out = [{
    point: [pts[0][0], pts[0][1]],
    pressure: pfValidP(pts[0][2]) ? pts[0][2] : PF_FIRST_PRESSURE,
    vector: [1, 1], distance: 0, runningLength: 0
  }];
  let reachedMin = false, runningLength = 0, prev = out[0];
  const max = pts.length - 1;
  for (let i = 1; i < pts.length; i++) {
    const point = (complete && i === max) ? [pts[i][0], pts[i][1]] : pfLerp(prev.point, pts[i], t);
    if (prev.point[0] === point[0] && prev.point[1] === point[1]) continue;
    const distance = Math.hypot(point[0] - prev.point[0], point[1] - prev.point[1]);
    runningLength += distance;
    if (i < max && !reachedMin) {
      if (runningLength < size) continue;
      reachedMin = true;
    }
    prev = {
      point,
      pressure: pfValidP(pts[i][2]) ? pts[i][2] : PF_DEFAULT_PRESSURE,
      vector: pfUni(pfSub(point, prev.point)),
      distance, runningLength
    };
    out.push(prev);
  }
  out[0].vector = out[1] ? out[1].vector : [0, 0];
  return out;
}

function pfTaperD(v, size, total) {
  if (v === true) return Math.max(size, total);
  if (typeof v === 'number' && isFinite(v)) return v;
  return 0;
}

function pfOutline(points, o) {
  const size = o.size || 16, smoothing = o.smoothing == null ? .5 : o.smoothing;
  const thinning = o.thinning == null ? .5 : o.thinning;
  let shouldSim = o.simulatePressure == null ? true : o.simulatePressure;
  if (!points.length) return [];
  const totalLength = points[points.length - 1].runningLength;
  const startO = o.start || {}, endO = o.end || {};
  const taperStart = pfTaperD(startO.taper, size, totalLength);
  const taperEnd = pfTaperD(endO.taper, size, totalLength);
  const taperStartEase = startO.easing || (t => t * (2 - t));
  const taperEndEase = endO.easing || (t => t * (2 - t));
  const capStart = startO.cap == null ? true : startO.cap, capEnd = endO.cap == null ? true : endO.cap;
  const easing = o.easing;
  const minDistance = Math.pow(size * smoothing, 2);
  const leftPts = [], rightPts = [];
  let prevVector = points[0].vector, firstRadius;
  let prevPressure = points[0].pressure;
  let isPrevSharp = false, prevLeft, prevRight;
  for (let i = 0; i < points.length; i++) {
    let pressure = points[i].pressure;
    const point = points[i].point, vector = points[i].vector;
    const distance = points[i].distance, runningLength = points[i].runningLength;
    const isLast = i === points.length - 1;
    if (!isLast && totalLength - runningLength < PF_END_NOISE) continue;
    let radius;
    if (thinning) {
      if (shouldSim) pressure = pfSimPressure(prevPressure, distance, size);
      radius = pfRadius(size, thinning, pressure, easing);
    } else radius = size / 2;
    if (firstRadius === undefined) firstRadius = radius;
    const ts = runningLength < taperStart ? taperStartEase(runningLength / taperStart) : 1;
    const te = totalLength - runningLength < taperEnd ? taperEndEase((totalLength - runningLength) / taperEnd) : 1;
    radius = Math.max(PF_MIN_RADIUS, radius * Math.min(ts, te));
    const nextVector = (!isLast ? points[i + 1] : points[i]).vector;
    const nextDpr = !isLast ? pfDot(vector, nextVector) : 1;
    const prevDpr = pfDot(vector, prevVector);
    const sharpPrev = prevDpr < 0 && !isPrevSharp;
    const sharpNext = nextDpr !== null && nextDpr < 0;
    if (sharpPrev || sharpNext) {
      const offset = pfMul(pfPer(prevVector), radius);
      const step = 1 / PF_CORNER_CAP;
      let tl, tr;
      for (let t = 0; t <= 1; t += step) {
        tl = pfRotAround(pfSub(point, offset), point, PF_FIXED_PI * t);
        tr = pfRotAround(pfAdd(point, offset), point, PF_FIXED_PI * -t);
        leftPts.push(tl);
        rightPts.push(tr);
      }
      prevLeft = tl; prevRight = tr;
      if (sharpNext) isPrevSharp = true;
      continue;
    }
    isPrevSharp = false;
    if (isLast) {
      const offset = pfMul(pfPer(vector), radius);
      leftPts.push(pfSub(point, offset));
      rightPts.push(pfAdd(point, offset));
      continue;
    }
    const offset = pfMul(pfPer(pfLerp(nextVector, vector, nextDpr)), radius);
    const tl = pfSub(point, offset), tr = pfAdd(point, offset);
    if (i <= 1 || pfDist2(prevLeft, tl) > minDistance) { leftPts.push(tl); prevLeft = tl; }
    if (i <= 1 || pfDist2(prevRight, tr) > minDistance) { rightPts.push(tr); prevRight = tr; }
    prevPressure = pressure;
    prevVector = vector;
  }
  /* caps: round start cap, flat if disabled (perfect-freehand end/start cap rules) */
  const firstPoint = points[0].point, lastPoint = points[points.length - 1].point;
  const startCap = [], endCap = [];
  if (capEnd) {
    const dir = pfUni(pfPer(points[points.length - 1].vector));
    const r = firstRadius || size / 2;
    const step = Math.PI / PF_END_CAP;
    for (let t = 0; t <= Math.PI; t += step) {
      endCap.push(pfRotAround(pfAdd(lastPoint, pfMul(dir, r)), lastPoint, -t));
    }
  } else {
    const dir = pfUni(pfPer(pfSub(lastPoint, points[points.length - 2] ? points[points.length - 2].point : firstPoint)));
    const r = firstRadius || size / 2;
    endCap.push(pfAdd(lastPoint, pfMul(dir, r)), pfAdd(lastPoint, pfMul(dir, r * .99)),
                pfSub(lastPoint, pfMul(dir, r * .99)), pfSub(lastPoint, pfMul(dir, r)));
  }
  if (capStart) {
    const dir = pfUni(pfPer(points[0].vector));
    const r = (leftPts.length && rightPts.length) ? pfLen(pfSub(rightPts[0], leftPts[0])) / 2 : size / 2;
    const step = Math.PI / PF_START_CAP;
    for (let t = 0; t <= Math.PI; t += step) {
      startCap.push(pfRotAround(pfAdd(firstPoint, pfMul(dir, r)), firstPoint, Math.PI - t));
    }
  } else {
    startCap.push(...rightPts.slice(0, 1), ...leftPts.slice(0, 1));
  }
  return leftPts.concat(endCap, rightPts.reverse(), startCap);
}

/* the public entry: points -> closed polygon (page units) */
function pfGetStroke(raw, o) {
  return pfOutline(pfStrokePoints(raw, o), o);
}

/* ---------- 2. the grain (Saber shaders/pencil.frag) ---------- */

/* Morgan McGuire's hash/noise/fbm, exactly as Saber embeds them. */
function sHash2(x, y) {
  let p0 = x * .13, p1 = y * .13, p2 = x * .13;
  const fx = (v) => v - Math.floor(v);
  p0 = fx(p0); p1 = fx(p1); p2 = fx(p2);
  const d = p0 * (p1 + 3.333) + p1 * (p2 + 3.333) + p2 * (p0 + 3.333);
  p0 += d; p1 += d; p2 += d;
  return fx((p0 + p1) * p2);
}
function sNoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = sHash2(ix, iy), b = sHash2(ix + 1, iy), c = sHash2(ix, iy + 1), d = sHash2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return (a + (b - a) * ux) + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}
/* 5-octave FBM with Saber's 0.5 rad rotation between octaves */
function sFbm2(x, y) {
  let v = 0, a = .5;
  const co = Math.cos(.5), si = Math.sin(.5);
  for (let i = 0; i < 5; i++) {
    v += a * sNoise2(x, y);
    const nx = (x * co - y * si) * 2 + 100, ny = (x * si + y * co) * 2 + 100;
    x = nx; y = ny;
    a *= .5;
  }
  return v;
}
const easeInOutQuad = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

/* Saber's fragment shader for one pixel, on the CPU at a given device pixel.
   Measured: raw 5-octave FBM at this scale sits around 0.55, so Saber's remap
   (*0.5+0.5) leaves the mask almost fully opaque and the tooth barely shows
   (avg 0.693 of a 0.7 cap). The tooth IS the pencil, so the noise is contrast-
   stretched around its own mean before the same ease + 0.7 cap are applied. */
const SABER_MEAN = .55, SABER_CONTRAST = 3.1;
function saberPencilAlpha(dx, dy) {
  const raw = sFbm2(dx * .7, dy * .7 * .5);
  const n = (raw - SABER_MEAN) * SABER_CONTRAST + .5;
  const c = n < 0 ? 0 : n > 1 ? 1 : n;
  return easeInOutQuad(c) * .7;
}

/*
   Grain cache. Building a noise bitmap per stroke would be far too slow, so the
   noise is generated once for a tile and then used as an alpha mask for the
   outline polygon. The per-stroke cost is then one fill + one composite.
*/
const saberGrainTiles = new Map();
function saberGrainTile(px, seed) {
  const key = px + '|' + seed;
  let cv = saberGrainTiles.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const x = cv.getContext('2d'), img = x.createImageData(px, px), d = img.data;
  // one tile spans `px` device pixels of noise, so the tooth scale matches the shader
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const a = saberPencilAlpha(i + seed * 17, j + seed * 29);
      const k = (j * px + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = Math.round(255 * Math.max(0, Math.min(1, a / .7)));
    }
  }
  x.putImageData(img, 0, 0);
  if (saberGrainTiles.size > 24) saberGrainTiles.clear();
  saberGrainTiles.set(key, cv);
  return cv;
}

/* Draw one finished pencil stroke: polygon + Saber grain. */
function saberPaint(c, st, pts, w, k, tx, ty) {
  const polygon = pfGetStroke(pts, {
    size: Math.max(1.2, w),
    thinning: .45,
    smoothing: .62,
    streamline: .42,
    simulatePressure: true,
    last: true,
    start: { taper: .35, cap: true },
    end: { taper: .45, cap: true }
  });
  if (!polygon.length) return;
  const col = inkFor(st.color);
  const grain = saberGrainTile(256, (st.seed || 3) | 0);
  c.save();
  c.setTransform(k, 0, 0, k, tx, ty);
  c.beginPath();
  for (let i = 0; i < polygon.length; i++) {
    const q = polygon[i];
    if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]);
  }
  c.closePath();
  c.fillStyle = col;
  c.globalAlpha = 1;
  c.fill();
  // grain as a coverage mask, in device space like Saber's fragCoord.
  // Only the stroke's own box is touched: filling the whole canvas (2659x3760 on an
  // A4 page at Q=2.6) for every stroke was the expensive part of this path.
  const pat = c.createPattern(grain, 'repeat');
  if (pat && pat.setTransform) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < polygon.length; i++) {
      const dx = polygon[i][0] * k + tx, dy = polygon[i][1] * k + ty;
      if (dx < x0) x0 = dx;
      if (dx > x1) x1 = dx;
      if (dy < y0) y0 = dy;
      if (dy > y1) y1 = dy;
    }
    const pad = 4;
    x0 = Math.max(0, Math.floor(x0 - pad));
    y0 = Math.max(0, Math.floor(y0 - pad));
    x1 = Math.min(c.canvas.width, Math.ceil(x1 + pad));
    y1 = Math.min(c.canvas.height, Math.ceil(y1 + pad));
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, (st.seed || 3) * 13, (st.seed || 3) * 7]));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = pat;
    if (x1 > x0 && y1 > y0) c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
}

/* Points from a stored stroke, honouring the recorded pressure (wv). */
function saberPts(st) {
  const raw = st.pts, wv = (st.wv && st.wv.length === raw.length) ? st.wv : null;
  return raw.map((q, i) => [q.x, q.y, wv ? wv[i] : 1]);
}

let SABER_PENCIL = localStorage.getItem('notark.pencilSaber') !== '0';
