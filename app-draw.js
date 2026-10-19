"use strict";
const opfsOK = !!(navigator.storage && navigator.storage.getDirectory);
let opfsRoot = null, opfsBusy = false, opfsPending = false;
const opfsStamp = new Map();
async function opfsDir() {
if (opfsRoot)
return opfsRoot;
opfsRoot = await navigator.storage.getDirectory();
return opfsRoot;
}
async function opfsSaveAll() {
if (!opfsOK)
return;
if (opfsBusy) {
opfsPending = true;
return;
}
opfsBusy = true;
try {
const root = await opfsDir();
const dir = await root.getDirectoryHandle('notes', { create: true });
const keep = new Set();
for (const n of notes) {
const name = safeName(n.title) + ' ' + n.id.slice(-6) + '.notark';
keep.add(name);
const sig = n.updated + '|' + (n.folder || '') + '|' + n.pages.length + '|' + n.pages.reduce((a, p) => a + p.strokes.length + (p.texts || []).length, 0);
if (opfsStamp.get(name) === sig)
continue;
const fh = await dir.getFileHandle(name, { create: true });
const w = await fh.createWritable();
await w.write(JSON.stringify({ app: 'Notark', version: 1, note: n }));
await w.close();
opfsStamp.set(name, sig);
}
for await (const [name] of dir.entries()) {
if (name.endsWith('.notark') && !keep.has(name)) {
try {
await dir.removeEntry(name);
}
catch (_) { }
}
}
localStorage.setItem('notark.opfsAt', String(Date.now()));
}
catch (e) {
console.warn('OPFS snapshot failed', e);
}
finally {
opfsBusy = false;
if (opfsPending) {
opfsPending = false;
opfsSaveAll();
}
}
}
const NAG_MS = 3 * 24 * 60 * 60 * 1000;
function lastBackup() { return parseInt(localStorage.getItem('notark.backupAt') || '0', 10) || 0; }
function maybeNagBackup() {
if (!notes.length)
return;
if (Date.now() - lastBackup() < NAG_MS)
return;
if (sessionStorage.getItem('notark.nagSnooze') === '1')
return;
const el = $('#backupNag');
if (el)
el.classList.add('show');
}
function snoozeNag() { sessionStorage.setItem('notark.nagSnooze', '1'); const el = $('#backupNag'); if (el)
el.classList.remove('show'); }
function exportAll() {
const bundle = { app: 'Notark', version: 1, exported: Date.now(), folders, notes };
const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'Notark backup ' + new Date().toISOString().slice(0, 10) + '.notark';
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(() => URL.revokeObjectURL(a.href), 4000);
localStorage.setItem('notark.backupAt', String(Date.now()));
const el = $('#backupNag');
if (el)
el.classList.remove('show');
toast('Backup exported');
}
const canvas = $('#paper');
const ctx = canvas.getContext('2d');
const _el = {};
const byId = id => _el[id] || (_el[id] = document.getElementById(id));
let slotCache = new Map();
function resizeCanvas() {
pickQ(cur.pages[page]);
const wrap = byId('canvasWrap');
const pad = 24, cs = getComputedStyle(wrap);
const availW = Math.max(100, wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - pad * 2);
const availH = Math.max(100, wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - pad * 2);
const p = cur.pages[page];
const s = Math.min(availW / p.w, availH / p.h);
canvas.width = Math.round(p.w * Q);
canvas.height = Math.round(p.h * Q);
canvas.style.width = (p.w * s) + 'px';
canvas.style.height = (p.h * s) + 'px';
canvas._scale = s;
sizeLaser(p);
if (typeof resetPanOffset === 'function')
resetPanOffset();
syncPage();
}
function syncPage() {
if (!cur)
return;
const p = cur.pages[page];
pickQ(p);
if (canvas.width !== Math.round(p.w * Q) || canvas.height !== Math.round(p.h * Q)) {
canvas.width = Math.round(p.w * Q);
canvas.height = Math.round(p.h * Q);
canvas.style.width = (p.w * canvas._scale) + 'px';
canvas.style.height = (p.h * canvas._scale) + 'px';
sizeLaser(p);
}
renderPage();
updatePageLabel();
}
const paperCache = { cv: null, key: '' };
function paperSig(kind) {
if (typeof customTpl === 'undefined')
return '';
const ct = customTpl.find(x => x.id === kind);
if (!ct)
return '';
if (ct.src)
return getImg(ct.src).complete ? 'L' : 'N';
return ct.grid ? JSON.stringify(ct.grid) : '';
}
function paintPaper(c, p, cached) {
const kind = p.paper || cur.paper;
if (!cached || !kind || kind === 'blank') {
drawPaper(c, p.w, p.h, kind);
return;
}
const key = [kind, p.w, p.h, Q, paperColor(), paperSig(kind)].join('|');
if (paperCache.key !== key) {
const cv = paperCache.cv || (paperCache.cv = document.createElement('canvas'));
cv.width = Math.round(p.w * Q);
cv.height = Math.round(p.h * Q);
const x = cv.getContext('2d');
x.setTransform(Q, 0, 0, Q, 0, 0);
drawPaper(x, p.w, p.h, kind);
paperCache.key = key;
}
c.save();
c.setTransform(1, 0, 0, 1, 0, 0);
c.drawImage(paperCache.cv, 0, 0);
c.restore();
}
function paintScene(ctx, p, base) {
paintPaper(ctx, p, base);
for (const st of p.strokes)
paintStroke(ctx, st);
if (selected.length && tool === 'lasso') {
const b = selBox();
ctx.save();
ctx.strokeStyle = '#ff9500';
ctx.lineWidth = 2;
ctx.setLineDash([6, 5]);
ctx.strokeRect(b.x0 - 8, b.y0 - 8, b.x1 - b.x0 + 16, b.y1 - b.y0 + 16);
ctx.restore();
}
if (selected.length === 1 && selected[0].tool === 'image' && tool === 'lasso') {
const b = selBox(), r = 11 / canvas._scale;
ctx.save();
ctx.fillStyle = '#ff9500';
ctx.strokeStyle = '#fff';
ctx.lineWidth = 2 / canvas._scale;
ctx.beginPath();
ctx.arc(b.x1 + 8, b.y1 + 8, r, 0, 7);
ctx.fill();
ctx.stroke();
ctx.restore();
}
}
let rpRaf = 0, rpAfter = null, shownPage = null, shownPaper = '';
function renderPage() {
if (rpRaf) {
cancelAnimationFrame(rpRaf);
rpRaf = 0;
rpAfter = null;
}
if (!cur || !cur.pages || !cur.pages[page]) return;
const p = cur.pages[page];
ctx.setTransform(Q, 0, 0, Q, 0, 0);
paintScene(ctx, p, true);
shownPage = p;
shownPaper = paperColor();
canvas.style.background = shownPaper;
byId('selBar').style.display = (selected.length && tool === 'lasso') ? 'flex' : 'none';
renderTexts();
if (typeof sizeLaser === 'function')
sizeLaser(p);
if (typeof drawRuler === 'function')
drawRuler();
renderDetail();
}
function renderSoon(after) {
if (after)
rpAfter = after;
if (rpRaf)
return;
rpRaf = requestAnimationFrame(() => { rpRaf = 0; const f = rpAfter; rpAfter = null; if (!cur)
return; renderPage(); if (f)
f(); });
}
function syncPageIfNeeded() {
if (!cur)
return;
const p = cur.pages[page];
pickQ(p);
if (shownPage === p && shownPaper === paperColor() && canvas.width === Math.round(p.w * Q) && canvas.height === Math.round(p.h * Q))
return;
syncPage();
}
let paperFlip = localStorage.getItem('notark.paperflip') === '1';   // true = page is the opposite of the app theme
function paperColor() { return (document.body.classList.contains('dark') !== paperFlip) ? '#1c1c1e' : '#ffffff'; }
const inkCache = new Map();
function inkFor(hex) {
if (!hex || hex[0] !== '#')
return hex;
const dark = paperColor() !== '#ffffff', key = hex + dark;
let v = inkCache.get(key);
if (v)
return v;
const m = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16), l = (.299 * r + .587 * g + .114 * b) / 255;
v = (Math.max(r, g, b) - Math.min(r, g, b) < 50 && ((dark && l < .3) || (!dark && l > .7))) ? invertHex(hex) : hex;
inkCache.set(key, v);
return v;
}
function chaikin(pts, iterations) {
let out = pts;
for (let it = 0; it < iterations; it++) {
if (out.length < 3)
break;
const next = [out[0]];
for (let i = 0; i < out.length - 1; i++) {
const a = out[i], b = out[i + 1];
next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
}
next.push(out[out.length - 1]);
out = next;
}
return out;
}
function smoothPoints(pts, passes) {
let out = pts.map(p => ({ x: p.x, y: p.y }));
for (let k = 0; k < passes; k++) {
const next = out.map(p => ({ x: p.x, y: p.y }));
for (let i = 1; i < out.length - 1; i++) {
next[i].x = (out[i - 1].x + out[i].x * 2 + out[i + 1].x) / 4;
next[i].y = (out[i - 1].y + out[i].y * 2 + out[i + 1].y) / 4;
}
out = next;
}
return out;
}
function flowPoints(pts, passes) {
if (pts.length < 3)
return pts;
const out = smoothPoints(pts, passes);
out[0] = { x: pts[0].x, y: pts[0].y };
out[out.length - 1] = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
return out;
}
// smooth 1-D value noise in [-1, 1] (stable for a given seed, no per-point randomness)
function vnoise(seed, x) {
const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
const h = k => { let v = Math.imul((k ^ seed) | 0, 0x45d9f3b) >>> 0; v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d) >>> 0; v ^= v >>> 12; return ((v >>> 0) / 4294967296) * 2 - 1; };
return h(i) * (1 - u) + h(i + 1) * u;
}
// ---------------------------------------------------------------------------------------------
// Tool textures. Pencil and marker are drawn into a scratch canvas (so they can be masked and
// blended as ONE shape) and then composited onto the page. Never mask on the page canvas itself:
// 'destination-in' there wipes everything that is already drawn.
// ---------------------------------------------------------------------------------------------
const scratch = { cv: null, g: null, cv2: null, g2: null };
const SCRATCH_MAX = 4096;
function withScratch(c, pts, pad, draw, blend, alpha) {
let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
for (const q of pts) {
if (q.x < x0) x0 = q.x;
if (q.x > x1) x1 = q.x;
if (q.y < y0) y0 = q.y;
if (q.y > y1) y1 = q.y;
}
x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
const m = c.getTransform ? c.getTransform() : null;
const aligned = m && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && Math.abs(m.a - m.d) < 1e-9 && m.a > 0;
// snap the scratch origin to the device pixel grid so compositing doesn't resample (and blur) the result
if (aligned) {
x0 = (Math.floor(m.a * x0 + m.e) - m.e) / m.a;
y0 = (Math.floor(m.d * y0 + m.f) - m.f) / m.d;
}
const bw = x1 - x0, bh = y1 - y0;
const k = Math.min(m ? Math.hypot(m.a, m.b) : 1, SCRATCH_MAX / Math.max(bw, bh, 1));
const W = Math.max(1, Math.ceil(bw * k)), H = Math.max(1, Math.ceil(bh * k));
if (!scratch.cv) {
scratch.cv = document.createElement('canvas'); scratch.g = scratch.cv.getContext('2d');
scratch.cv2 = document.createElement('canvas'); scratch.g2 = scratch.cv2.getContext('2d');
}
const cv = scratch.cv, g = scratch.g;
if (cv.width < W) cv.width = W;
if (cv.height < H) cv.height = H;
const prep = (gx) => {
gx.setTransform(1, 0, 0, 1, 0, 0);
gx.globalAlpha = 1;
gx.globalCompositeOperation = 'source-over';
gx.clearRect(0, 0, W, H);
gx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
gx.lineCap = gx.lineJoin = 'round';
};
prep(g);
// a second, throw-away layer (used by the pencil to mask each pass separately)
const layer = () => {
if (scratch.cv2.width < W) scratch.cv2.width = W;
if (scratch.cv2.height < H) scratch.cv2.height = H;
prep(scratch.g2);
return scratch.g2;
};
draw(g, k, x0, y0, W, H, layer);
g.setTransform(1, 0, 0, 1, 0, 0);
g.globalAlpha = 1;
g.globalCompositeOperation = 'source-over';
c.save();
c.globalAlpha = alpha;
c.globalCompositeOperation = blend;
c.drawImage(cv, 0, 0, W, H, x0, y0, W / k, H / k);
c.restore();
}
// Per-point width factors (st.wv, one per st.pts entry) become widths along the densified curve.
function interpW(pts, wv, cv) {
if (!wv || wv.length !== pts.length || pts.length < 2 || !cv.length) return null;
const A = [0], C = [0];
for (let i = 1; i < pts.length; i++) A[i] = A[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
for (let j = 1; j < cv.length; j++) C[j] = C[j - 1] + Math.hypot(cv[j].x - cv[j - 1].x, cv[j].y - cv[j - 1].y);
const At = A[A.length - 1] || 1, Ct = C[C.length - 1] || 1, out = new Array(cv.length);
let i = 0;
for (let j = 0; j < cv.length; j++) {
const s = C[j] / Ct * At;
while (i < A.length - 2 && A[i + 1] < s) i++;
const span = A[i + 1] - A[i], t = span > 1e-9 ? Math.min(1, Math.max(0, (s - A[i]) / span)) : 0;
out[j] = wv[i] + (wv[i + 1] - wv[i]) * t;
}
return out;
}
// Fast movement = thinner line, slow movement = true size. sp is in screen px / second.
function speedWidth(st, sp) {
if (sp == null) return 1;
const minW = st.penType === 'pencil' ? .5 : st.penType === 'marker' ? .68 : .6;
const t = Math.min(1, Math.max(0, (sp - 120) / 1000)), e = t * t * (3 - 2 * t);
return 1 - (1 - minW) * e;
}
// Stroke a smoothed path whose width changes along it: one round-capped segment per point.
function strokeVar(g, q, wfn) {
const n = q.length;
if (n < 3) {
g.lineWidth = wfn(0);
g.beginPath();
q.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
if (n === 1) g.lineTo(q[0].x + .1, q[0].y + .1);
g.stroke();
return;
}
let P = q[0];
for (let i = 1; i < n - 1; i++) {
const E = { x: (q[i].x + q[i + 1].x) / 2, y: (q[i].y + q[i + 1].y) / 2 };
g.lineWidth = wfn(i);
g.beginPath();
g.moveTo(P.x, P.y);
g.quadraticCurveTo(q[i].x, q[i].y, E.x, E.y);
g.stroke();
P = E;
}
g.lineWidth = wfn(n - 1);
g.beginPath();
g.moveTo(P.x, P.y);
g.lineTo(q[n - 1].x, q[n - 1].y);
g.stroke();
}
// ---- pencil: graphite that only catches the raised fibres of the paper ----
const GRAIN = 128, grainTiles = {};
// Real paper tooth (Texturelabs Paper 120M), 256x256 seamless grayscale tile. Sampled by pencilGrain
// once decoded; until then the synthetic noise below is used.
const PAPER_SRC = 'data:image/png;base64,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';
let paperImg = null, paperPx = null;
function paperTile() {
if (paperPx) return paperPx;
if (!paperImg) {
paperImg = new Image();
paperImg.onload = () => {
const cv = document.createElement('canvas');
cv.width = cv.height = paperImg.width;
const x = cv.getContext('2d');
x.drawImage(paperImg, 0, 0);
paperPx = x.getImageData(0, 0, cv.width, cv.height);
for (const k in grainTiles) delete grainTiles[k];
if (typeof renderPage === 'function') renderPage();
if (typeof buildStylePanel === 'function' && document.getElementById('pencilRow') && document.getElementById('pencilRow').style.display !== 'none') buildStylePanel();
};
paperImg.src = PAPER_SRC;
}
return paperPx;
}
function h2(ix, iy, seed) {
let v = Math.imul(((ix * 374761393) ^ (iy * 668265263) ^ seed) | 0, 0x45d9f3b) >>> 0;
v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d) >>> 0;
return ((v ^ (v >>> 12)) >>> 0) / 4294967296;
}
function toothNoise(px, py, cell, seed) {
const n = GRAIN / cell, fx = px / cell, fy = py / cell, ix = Math.floor(fx), iy = Math.floor(fy);
const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
const a = h2(ix % n, iy % n, seed), b = h2((ix + 1) % n, iy % n, seed), c = h2(ix % n, (iy + 1) % n, seed), d = h2((ix + 1) % n, (iy + 1) % n, seed);
return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
}
// Soft, tile-able coverage mask. `cut` = how much of the paper catches graphite (low = dense, high = sparse).
// The alpha ramps smoothly instead of switching on/off, so it stays smooth when scaled up (no pixel blocks).
function pencilGrain(cut) {
if (grainTiles[cut]) return grainTiles[cut];
const cv = document.createElement('canvas');
cv.width = cv.height = GRAIN;
const x = cv.getContext('2d'), img = x.createImageData(GRAIN, GRAIN), d = img.data;
const paper = paperTile(), pw = paper ? paper.width : 0, pd = paper ? paper.data : null;
for (let i = 0; i < GRAIN * GRAIN; i++) {
const px = i % GRAIN, py = (i / GRAIN) | 0;
const v = pd
? pd[(((py * pw / GRAIN) | 0) * pw + ((px * pw / GRAIN) | 0)) * 4] / 255
: h2(px, py, 3) * .38 + toothNoise(px, py, 4, 5) * .32 + toothNoise(px, py, 16, 8) * .30;
let t = (v - (cut - .14)) / .28;
t = t < 0 ? 0 : t > 1 ? 1 : t;
d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
d[i * 4 + 3] = Math.round(255 * t * t * (3 - 2 * t));
}
x.putImageData(img, 0, 0);
grainTiles[cut] = cv;
return cv;
}
// ---- Pencil styles. One entry per look; the picker in the style panel lists these.
// passes = [width, alpha, wander, grain cut, edge wobble] (higher "grain cut" = sparser, speckier edge)
// T = grain scale (bigger = coarser paper tooth), a = opacity, w = width, taper = how much the ends fade (0 = none).
// 'hb' is exactly the look strokes had before styles existed, so old strokes are unchanged.
const PENCIL_STYLES = [
{ id: 'hb', label: 'HB', passes: [[.75, .95, .04, .02, .08], [1.1, .8, .12, .06, .15], [1.5, .6, .3, .12, .3], [1.3, .45, .5, .18, .3], [1.7, .28, .62, .24, .38]], T: 1.6, a: 1, w: 1, taper: 1 },
{ id: 'soft', label: '6B Soft', passes: [[.85, 1, .05, 0, .1], [1.25, .9, .15, .03, .18], [1.7, .75, .35, .08, .3], [1.5, .55, .5, .14, .32], [1.95, .35, .62, .2, .4]], T: 1.35, a: 1, w: 1.15, taper: .7 },
{ id: 'hard', label: '2H Hard', passes: [[.55, .85, .02, .1, .05], [.8, .55, .06, .18, .1], [1, .35, .12, .26, .16]], T: 1.9, a: .9, w: .8, taper: 1.2 },
{ id: 'charcoal', label: 'Charcoal', passes: [[1, .9, .1, .1, .2], [1.6, .7, .4, .25, .45], [2.2, .5, .7, .38, .6], [2.6, .3, .9, .48, .7]], T: 2.4, a: 1, w: 1.3, taper: .5 },
{ id: 'mech', label: 'Mechanical', passes: [[.6, 1, 0, 0, .02], [.9, .5, .04, .08, .05]], T: 1.2, a: 1, w: .85, taper: 0 }
];
const pencilStyleOf = st => PENCIL_STYLES.find(x => x.id === st.pstyle) || PENCIL_STYLES[0];
let pencilStyle = 'hb';
try { const v = localStorage.getItem('notark.pencilStyle'); if (PENCIL_STYLES.some(x => x.id === v)) pencilStyle = v; } catch (e) { }
// Graphite is built from layered passes. The core is dense; the outer passes are wider, wobble along
// the stroke and are masked with a SPARSE grain, so the silhouette breaks up into specks like real
// pencil instead of ending in a clean vector edge. Fast movement thins it; the ends taper off.
function paintPencil(c, pts, st, def, baseW, alpha) {
const n = pts.length, seed = (st.seed || 7) | 0, col = c.strokeStyle, S = pencilStyleOf(st);
if (n < 3 && Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y) < Math.max(baseW * .5, .5)) {
c.fillStyle = col;
c.globalAlpha = alpha * .55;
c.beginPath();
c.arc((pts[0].x + pts[n - 1].x) / 2, (pts[0].y + pts[n - 1].y) / 2, baseW / 2, 0, 7);
c.fill();
c.globalAlpha = 1;
c.setLineDash([]);
return;
}
const arc = new Array(n);
arc[0] = 0;
for (let i = 1; i < n; i++)
arc[i] = arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
const total = arc[n - 1], wvv = (st.wv && st.wv.length === n) ? st.wv : null, wf = new Array(n);
for (let i = 0; i < n; i++) {
let w = wvv ? wvv[i] : 1;
if (!st.dense) {
w *= 1 - (1 - Math.min(1, .7 + .3 * Math.min(1, arc[i] / (baseW * 2.5)))) * S.taper;
w *= 1 - (1 - Math.min(1, .4 + .6 * Math.min(1, (total - arc[i]) / (baseW * 5)))) * S.taper;
}
wf[i] = w;
}
const WAVE = 7, T = S.T;
// [width, alpha, wander, grain cut, edge wobble]
const passes = S.passes, bw = baseW * S.w;
const padW = bw * Math.max(...passes.map(q => q[0] * (1 + q[4]) / 2 + q[2])) + 3;
withScratch(c, pts, padW, (g, k, x0, y0, W, H, layer) => {
for (let p = 0; p < passes.length; p++) {
const [wm, am, jm, cut, wob] = passes[p], amp = bw * jm, g2 = layer();
g2.strokeStyle = '#000';
g2.strokeStyle = col;
const q = pts.map((pt, i) => ({ x: pt.x + amp * vnoise(seed + 977 * p, arc[i] / WAVE), y: pt.y + amp * vnoise(seed + 331 * p + 17, arc[i] / WAVE) }));
strokeVar(g2, q, i => Math.max(.3, bw * wm * wf[i] * (1 + wob * vnoise(seed + 55 * p, arc[i] / 2.5))));
const pat = g2.createPattern(pencilGrain(cut), 'repeat');
if (pat && pat.setTransform) {
// the grain is a coverage mask: the pattern must be OPAQUE where graphite lands, so the
// destination-in fill keeps the stroke there. (A transparent pattern erased the whole pass.)
// The pattern is in device space, so the fill runs with an identity transform.
const m = new DOMMatrix([T * k, 0, 0, T * k, -x0 * k + p * 37, -y0 * k + p * 23]);
pat.setTransform(m);
g2.setTransform(1, 0, 0, 1, 0, 0);
g2.globalCompositeOperation = 'destination-in';
g2.fillStyle = pat;
g2.fillRect(0, 0, W, H);
g2.globalCompositeOperation = 'source-over';
g2.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
}
g.globalAlpha = Math.min(1, am * S.a);
g.setTransform(1, 0, 0, 1, 0, 0);
g.drawImage(scratch.cv2, 0, 0, W, H, 0, 0, W, H);
g.globalAlpha = 1;
}
}, 'source-over', alpha);
c.setLineDash([]);
}
// ---- finishes: how the ink sits on the paper. 'normal' is the plain stroke; the others paint the
// stroke into a scratch layer and then shade it (glossy highlight, metallic sheen, dry grain, ...).
const FINISHES = ['normal', 'glossy', 'metallic', 'dry', 'matte', 'neon'];
function finishOf(st) { return FINISHES.includes(st.finish) ? st.finish : 'normal'; }
function shadeFinish(g, fin, x0, y0, W, H, k, seed) {
const X = (x) => x0 + x / k, Y = (y) => y0 + y / k;
g.setTransform(1, 0, 0, 1, 0, 0);
g.globalCompositeOperation = 'source-atop';
if (fin === 'glossy') {
const gr = g.createLinearGradient(0, 0, 0, H);
gr.addColorStop(0, 'rgba(255,255,255,.55)');
gr.addColorStop(.45, 'rgba(255,255,255,.06)');
gr.addColorStop(1, 'rgba(0,0,0,.22)');
g.fillStyle = gr;
g.fillRect(0, 0, W, H);
} else if (fin === 'metallic') {
const gr = g.createLinearGradient(0, 0, W, H);
gr.addColorStop(0, 'rgba(255,255,255,.6)');
gr.addColorStop(.3, 'rgba(255,255,255,.05)');
gr.addColorStop(.5, 'rgba(0,0,0,.3)');
gr.addColorStop(.7, 'rgba(255,255,255,.35)');
gr.addColorStop(1, 'rgba(0,0,0,.25)');
g.fillStyle = gr;
g.fillRect(0, 0, W, H);
} else if (fin === 'dry') {
const pat = g.createPattern(pencilGrain(.3), 'repeat');
if (pat && pat.setTransform) {
pat.setTransform(new DOMMatrix([1.6 * k, 0, 0, 1.6 * k, -x0 * k, -y0 * k]));
g.globalCompositeOperation = 'destination-out';
g.fillStyle = pat;
g.fillRect(0, 0, W, H);
g.globalCompositeOperation = 'source-atop';
}
g.fillStyle = 'rgba(255,255,255,.12)';
g.fillRect(0, 0, W, H);
} else if (fin === 'matte') {
g.fillStyle = 'rgba(255,255,255,.16)';
g.fillRect(0, 0, W, H);
} else if (fin === 'neon') {
// bright core + soft glow in the ink's own colour (built from the stroke itself, never a filled box)
const t = scratch.cv2, tg = scratch.g2;
if (t.width < W) t.width = W;
if (t.height < H) t.height = H;
tg.setTransform(1, 0, 0, 1, 0, 0);
tg.globalAlpha = 1;
tg.globalCompositeOperation = 'source-over';
tg.clearRect(0, 0, W, H);
tg.drawImage(g.canvas, 0, 0, W, H, 0, 0, W, H);
g.fillStyle = 'rgba(255,255,255,.55)';
g.fillRect(0, 0, W, H);
g.globalCompositeOperation = 'destination-over';
g.globalAlpha = .1;
for (const r of [Math.max(2, 3.6 * k), Math.max(1.2, 2 * k)])
for (let a = 0; a < 12; a++)
g.drawImage(t, 0, 0, W, H, Math.cos(a * Math.PI / 6) * r, Math.sin(a * Math.PI / 6) * r, W, H);
g.globalAlpha = 1;
}
g.globalCompositeOperation = 'source-over';
}
function paintFinished(c, st, baseW, alpha, draw) {
const fin = finishOf(st);
if (fin === 'normal') {
draw(c, alpha);
return;
}
withScratch(c, st.pts, baseW * 2 + 8, (g, k, x0, y0, W, H) => {
draw(g, 1);
shadeFinish(g, fin, x0, y0, W, H, k, st.seed);
}, 'source-over', fin === 'neon' ? Math.min(1, alpha + .15) : alpha);
}
// ---- pen styles: the same layered-pass idea as the pencil, but for ink. Each style is a list of
// passes [width, alpha, wander, grain cut, edge wobble]; every pass is drawn on its own layer and
// masked with a grain tile, then composited once, so a stroke never darkens where it overlaps
// itself. The pencil is untouched: it keeps its own PENCIL_STYLES and paintPencil.
const PEN_STYLES = [
{ id: 'ball', label: 'Ballpoint', passes: [[.7, 1, .02, 0, .04], [1, .55, .06, .05, .08]], T: 1.3, a: 1, w: 1, taper: .35 },
{ id: 'gel', label: 'Gel', passes: [[.85, 1, .01, 0, .02], [1.15, .45, .04, 0, .05]], T: 1.1, a: 1, w: 1.05, taper: .2 },
{ id: 'fountain', label: 'Fountain', passes: [[.6, 1, .02, 0, .03], [1.05, .7, .05, 0, .06], [1.5, .35, .1, .04, .12]], T: 1.4, a: 1, w: 1.1, taper: 1.1 },
{ id: 'fineliner', label: 'Fineliner', passes: [[.8, 1, 0, 0, .02], [1, .5, .02, .04, .04]], T: 1.2, a: 1, w: .9, taper: 0 },
{ id: 'brush', label: 'Brush', passes: [[.7, 1, .06, 0, .1], [1.1, .75, .16, .03, .2], [1.5, .5, .3, .08, .3], [1.9, .3, .45, .14, .4]], T: 1.5, a: 1, w: 1.25, taper: 1.4 },
{ id: 'sketch', label: 'Sketch', passes: [[.6, .9, .05, .06, .1], [1, .6, .14, .14, .2], [1.4, .4, .28, .22, .3]], T: 1.7, a: 1, w: 1, taper: .8 }
];
const penStyleOf = st => PEN_STYLES.find(x => x.id === st.pstyle) || PEN_STYLES[0];
let penStyle = 'ball';
try { const v = localStorage.getItem('notark.penStyle'); if (PEN_STYLES.some(x => x.id === v)) penStyle = v; } catch (e) { }
function paintPen(c, pts, st, def, baseW, alpha) {
const n = pts.length, seed = (st.seed || 7) | 0, col = c.strokeStyle, S = penStyleOf(st);
if (n < 3 && Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y) < Math.max(baseW * .5, .5)) {
c.fillStyle = col;
c.globalAlpha = alpha * .9;
c.beginPath();
c.arc((pts[0].x + pts[n - 1].x) / 2, (pts[0].y + pts[n - 1].y) / 2, baseW / 2, 0, 7);
c.fill();
c.globalAlpha = 1;
c.setLineDash([]);
return;
}
const arc = new Array(n);
arc[0] = 0;
for (let i = 1; i < n; i++)
arc[i] = arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
const total = arc[n - 1], wvv = (st.wv && st.wv.length === n) ? st.wv : null, wf = new Array(n);
for (let i = 0; i < n; i++) {
let w = wvv ? wvv[i] : 1;
if (!st.dense) {
w *= 1 - (1 - Math.min(1, .7 + .3 * Math.min(1, arc[i] / (baseW * 2.5)))) * S.taper;
w *= 1 - (1 - Math.min(1, .4 + .6 * Math.min(1, (total - arc[i]) / (baseW * 5)))) * S.taper;
}
wf[i] = w;
}
const WAVE = 7, T = S.T, passes = S.passes, bw = baseW * S.w;
const padW = bw * Math.max(...passes.map(q => q[0] * (1 + q[4]) / 2 + q[2])) + 3;
withScratch(c, pts, padW, (g, k, x0, y0, W, H, layer) => {
for (let p = 0; p < passes.length; p++) {
const [wm, am, jm, cut, wob] = passes[p], amp = bw * jm, g2 = layer();
g2.strokeStyle = col;
const q = pts.map((pt, i) => ({ x: pt.x + amp * vnoise(seed + 977 * p, arc[i] / WAVE), y: pt.y + amp * vnoise(seed + 331 * p + 17, arc[i] / WAVE) }));
strokeVar(g2, q, i => Math.max(.3, bw * wm * wf[i] * (1 + wob * vnoise(seed + 55 * p, arc[i] / 2.5))));
const pat = g2.createPattern(pencilGrain(cut), 'repeat');
if (pat && pat.setTransform) {
const m = new DOMMatrix([T * k, 0, 0, T * k, -x0 * k + p * 37, -y0 * k + p * 23]);
pat.setTransform(m);
g2.setTransform(1, 0, 0, 1, 0, 0);
g2.globalCompositeOperation = 'destination-in';
g2.fillStyle = pat;
g2.fillRect(0, 0, W, H);
g2.globalCompositeOperation = 'source-over';
g2.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
}
g.globalAlpha = Math.min(1, am * S.a);
g.setTransform(1, 0, 0, 1, 0, 0);
g.drawImage(scratch.cv2, 0, 0, W, H, 0, 0, W, H);
g.globalAlpha = 1;
}
}, 'source-over', alpha);
c.setLineDash([]);
}
// ---- marker: chisel felt tip. Width depends on the direction you move relative to the nib,
// ink is laid down as one flat shape (no darker self-overlap), pools at the start and end of a
// stroke, and builds up (multiply) where separate strokes cross. ----
function paintMarker(c, pts, st, def, baseW, alpha) {
const col = c.strokeStyle, seed = (st.seed || 7) | 0;
const L = baseW * 1.7, T = baseW * .5, A = -.72;
const ux = Math.cos(A) * L / 2, uy = Math.sin(A) * L / 2, vx = -Math.sin(A) * T / 2, vy = Math.cos(A) * T / 2;
const path = pts.length < 3
? densify(pts.length > 1 ? pts : [pts[0], { x: pts[0].x + .01, y: pts[0].y }], 1.5)
: curvePts(pts, Math.max(1, T * .4));
const wd = pts.length < 3 ? null : interpW(pts, st.wv, path);
const rect = (g, p, f) => {
const a = ux * f, b = uy * f, e = vx * f, h = vy * f;
g.moveTo(p.x - a - e, p.y - b - h);
g.lineTo(p.x + a - e, p.y + b - h);
g.lineTo(p.x + a + e, p.y + b + h);
g.lineTo(p.x - a + e, p.y - b + h);
g.closePath();
};
const blend = paperColor() !== '#ffffff' ? 'source-over' : 'multiply';
withScratch(c, path, L, (g) => {
g.fillStyle = col;
g.beginPath();
path.forEach((p, i) => rect(g, p, wd ? wd[i] : 1));
g.fill();
// faint bristle streaks along the stroke, parallel to the nib
g.globalCompositeOperation = 'destination-out';
g.strokeStyle = '#000';
g.lineWidth = Math.max(.6, baseW * .06);
const offs = [-.62, -.22, .2, .58];
for (let s = 0; s < offs.length; s++) {
g.globalAlpha = .1 + .08 * (h2(s, seed & 255, 9));
g.beginPath();
path.forEach((p, i) => { const f = wd ? wd[i] : 1, X = p.x + ux * offs[s] * f, Y = p.y + uy * offs[s] * f; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
g.stroke();
}
}, blend, alpha);
// ink pools where the nib touches down and lifts off
c.save();
c.globalAlpha = alpha * .3;
c.globalCompositeOperation = blend;
c.fillStyle = col;
c.beginPath();
rect(c, path[0], wd ? wd[0] : 1);
rect(c, path[path.length - 1], wd ? wd[wd.length - 1] : 1);
c.fill();
c.restore();
c.setLineDash([]);
}
function paintStroke(c, st) {
if (st.tool === 'image') {
const im = getImg(st.src), a = st.pts[0], b = st.pts[1];
if (im.complete && im.naturalWidth) {
c.save();
c.globalAlpha = 1;
c.drawImage(im, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
c.restore();
}
return;
}
const raw = st.pts;
if (!raw.length)
return;
const type = st.penType || 'pen';
const def = PEN_TYPES.find(t => t.id === type) || PEN_TYPES[0];
const isHL = st.tool === 'highlighter';
const alpha0 = isHL ? (st.opacity != null ? st.opacity : .35) : def.alpha;
const alpha = eraseMark.has(st) ? Math.max(.12, alpha0 * .25) : alpha0;
const baseW = st.size * (isHL ? 3 : def.widthMul);
c.strokeStyle = inkFor(st.color);
c.lineCap = (isHL || def.flat) ? 'butt' : 'round';
c.lineJoin = 'round';
applyDash(c, st, baseW);
c.globalAlpha = alpha;
if (finishOf(st) !== 'normal' && st.tool !== 'shape' && type !== 'pencil' && !(type === 'marker' && !isHL) && !(type === 'pen' && !isHL)) {
paintFinished(c, st, baseW, alpha, (g, a) => {
g.strokeStyle = c.strokeStyle;
g.lineCap = c.lineCap;
g.lineJoin = c.lineJoin;
g.setLineDash(c.getLineDash());
g.lineCap = 'round';
g.globalAlpha = a;
strokeVar(g, raw, () => baseW);
g.globalAlpha = 1;
});
c.globalAlpha = 1;
c.setLineDash([]);
return;
}
if (st.tool === 'shape') {
drawShape(c, st, baseW);
c.globalAlpha = 1;
return;
}
const pts = raw;
if (type === 'pencil') {
paintPencil(c, pts, st, def, baseW, alpha);
return;
}
if (type === 'marker' && !isHL) {
paintMarker(c, pts, st, def, baseW, alpha);
return;
}
if (type === 'pen' && !isHL) {
if (finishOf(st) !== 'normal')
paintFinished(c, st, baseW, alpha, (g, a) => { g.strokeStyle = c.strokeStyle; paintPen(g, pts, st, def, baseW, a); });
else
paintPen(c, pts, st, def, baseW, alpha);
return;
}
if (pts.length < 3 && Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) < Math.max(baseW * .5, .5)) {
// a tap / dot: draw a filled circle (more reliable than a zero-length round-capped line)
c.fillStyle = c.strokeStyle;
c.globalAlpha = alpha;
c.beginPath();
c.arc((pts[0].x + pts[pts.length - 1].x) / 2, (pts[0].y + pts[pts.length - 1].y) / 2, baseW / 2, 0, 7);
c.fill();
c.globalAlpha = 1;
c.setLineDash([]);
return;
}
c.lineWidth = baseW;
if (st.tool === 'pen' && type === 'pen' && pts.length >= 3 && st.wv && st.wv.length === pts.length && (!st.dash || st.dash === 'solid') && !eraseMark.has(st)) {
c.globalAlpha = 1;
strokeVar(c, pts, i => baseW * st.wv[i]);
c.setLineDash([]);
return;
}
if (pts.length < 3 && Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) < baseW)
c.lineCap = 'round';      // a dot / tiny tap must be visible even for flat-capped pens
c.beginPath();
if (pts.length < 3) {
pts.forEach((pt, i) => i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y));
}
else {
c.moveTo(pts[0].x, pts[0].y);
for (let i = 1; i < pts.length - 1; i++) {
const a = pts[i], b = pts[i + 1];
c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
}
const last = pts[pts.length - 1];
c.lineTo(last.x, last.y);
}
if (pts.length === 1)
c.lineTo(pts[0].x + .1, pts[0].y + .1);
c.stroke();
c.globalAlpha = 1;
c.setLineDash([]);
}
function drawShape(c, st, w) {
const a = st.pts[0], b = st.pts[st.pts.length - 1];
c.lineWidth = w;
c.beginPath();
if (st.shapeType === 'poly') {
st.pts.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y));
c.closePath();
}
else if (st.shapeType === 'line') {
c.moveTo(a.x, a.y);
c.lineTo(b.x, b.y);
}
else if (st.shapeType === 'arrow') {
c.moveTo(a.x, a.y);
c.lineTo(b.x, b.y);
const ang = Math.atan2(b.y - a.y, b.x - a.x), h = Math.max(10, w * 3.5);
c.moveTo(b.x, b.y);
c.lineTo(b.x - h * Math.cos(ang - .4), b.y - h * Math.sin(ang - .4));
c.moveTo(b.x, b.y);
c.lineTo(b.x - h * Math.cos(ang + .4), b.y - h * Math.sin(ang + .4));
}
else if (st.shapeType === 'rect') {
c.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}
else if (st.shapeType === 'triangle') {
c.moveTo((a.x + b.x) / 2, a.y);
c.lineTo(b.x, b.y);
c.lineTo(a.x, b.y);
c.closePath();
}
else if (st.shapeType === 'diamond') {
const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
c.moveTo(mx, a.y);
c.lineTo(b.x, my);
c.lineTo(mx, b.y);
c.lineTo(a.x, my);
c.closePath();
}
else if (st.shapeType === 'ellipse') {
c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
}
c.stroke();
}
function renderTexts() {
const layer = byId('textLayer'), wrap = byId('canvasWrap');
layer.textContent = '';
const p = cur.pages[page];
const s = canvas._scale;
const rect = canvas.getBoundingClientRect();
const wrapRect = wrap.getBoundingClientRect();
const ox = rect.left - wrapRect.left + wrap.scrollLeft, oy = rect.top - wrapRect.top + wrap.scrollTop;
const frag = document.createDocumentFragment();
for (const t of p.texts) {
const el = document.createElement('div');
el.className = 'tbox';
el.contentEditable = 'true';
el.textContent = t.text;
el.style.left = (ox + t.x * s) + 'px';
el.style.top = (oy + t.y * s) + 'px';
el.style.fontSize = (t.size * s) + 'px';
el.style.color = inkFor(t.color);
el.style.fontFamily = fontCss(t.font);
el.dataset.id = t.id;
el.addEventListener('focus', () => { lastText = t; });
el.addEventListener('input', () => { t.text = el.textContent; touch(); });
el.addEventListener('blur', () => { if (!el.textContent.trim()) {
p.texts = p.texts.filter(x => x.id !== t.id);
renderTexts();
} });
frag.appendChild(el);
}
layer.appendChild(frag);
}
function pos(e, r) {
r = r || canvas.getBoundingClientRect();
return { x: (e.clientX - r.left) / canvas._scale, y: (e.clientY - r.top) / canvas._scale };
}
let pan = null, pinch = null, glide = 0;
let lastPen = 0;
for (const t of ['pointerdown', 'pointermove', 'pointerup'])
addEventListener(t, e => { if (e.pointerType === 'pen')
lastPen = performance.now(); }, true);
const fingers = new Map();
const wrapEl = () => byId('canvasWrap');
wrapEl().style.touchAction = 'none';
canvas.style.touchAction = 'none';
for (const g of ['gesturestart', 'gesturechange', 'gestureend'])
document.addEventListener(g, e => e.preventDefault());
const ZMIN = .25, ZMAX = 16;
const clampZ = z => Math.min(ZMAX, Math.max(ZMIN, z));
function stopGlide() { if (glide) {
cancelAnimationFrame(glide);
glide = 0;
} }
function startGlide(vx, vy) {
stopGlide();
if (Math.hypot(vx, vy) < .15)
return;
const wrap = wrapEl();
let last = performance.now();
const step = now => {
const dt = Math.min(48, now - last);
last = now;
const f = Math.pow(.94, dt / 16);
vx *= f;
vy *= f;
const sl = wrap.scrollLeft, st = wrap.scrollTop;
if (canScroll().x)
wrap.scrollLeft = sl - vx * dt;
wrap.scrollTop = st - vy * dt;
const moved = wrap.scrollLeft !== sl || wrap.scrollTop !== st;
glide = (moved && Math.hypot(vx, vy) > .02) ? requestAnimationFrame(step) : 0;
};
glide = requestAnimationFrame(step);
}
function startPan(e) {
stopGlide();
e.preventDefault();
try {
try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
}
catch (_) { }
pan = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: performance.now(), sc: false };
canvas.addEventListener('pointerup', endPan);
canvas.addEventListener('pointercancel', endPan);
}
const panOff = { x: 0, y: 0 };
let panRaf = 0;
function applyPanOffset() {
if (panRaf) {
cancelAnimationFrame(panRaf);
panRaf = 0;
}
const t = (panOff.x || panOff.y) ? `translate(${panOff.x}px, ${panOff.y}px)` : '';
const wrap = wrapEl(), cont = wrap.classList.contains('cont');
canvas.style.transform = cont ? '' : t;
if (cont)
for (const el of wrap.querySelectorAll('.slot'))
el.style.transform = t;
for (const id of ['textLayer', 'laser', 'rulerTop', 'rulerLeft']) {
const el = byId(id);
if (el)
el.style.transform = t;
}
}
function flushPan() { applyPanOffset(); clampPanOff(); }
function boxOf() {
const wrap = wrapEl(), slots = wrap.classList.contains('cont') ? [...wrap.querySelectorAll('.slot')] : [];
const els = slots.length ? slots : [canvas];
let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
for (const e of els) {
const q = e.getBoundingClientRect();
l = Math.min(l, q.left);
t = Math.min(t, q.top);
r = Math.max(r, q.right);
b = Math.max(b, q.bottom);
}
return { left: l, top: t, right: r, bottom: b };
}
const canScroll = () => { const w = wrapEl(); return { x: w.scrollWidth > w.clientWidth + 1, y: w.scrollHeight > w.clientHeight + 1 }; };
function clampPanOff() {
return; // no limit: the page can be dragged anywhere, even fully off screen
const w = wrapEl().getBoundingClientRect(), b = boxOf(), c = canScroll(), M = 24;
let ch = false;
if (!c.x) {
if (b.right < w.left + M) {
panOff.x += w.left + M - b.right;
ch = true;
}
else if (b.left > w.right - M) {
panOff.x -= b.left - (w.right - M);
ch = true;
}
}
if (!c.y) {
if (b.bottom < w.top + M) {
panOff.y += w.top + M - b.bottom;
ch = true;
}
else if (b.top > w.bottom - M) {
panOff.y -= b.top - (w.bottom - M);
ch = true;
}
}
if (ch)
applyPanOffset();
}
function centerFit() {
resetPanOffset();
const w = wrapEl().getBoundingClientRect(), b = boxOf(), c = canScroll();
if (w.width < 2 || w.height < 2)
return;
if (!c.x)
panOff.x = (w.left + w.width / 2) - (b.left + b.right) / 2;
if (!c.y)
panOff.y = (w.top + w.height / 2) - (b.top + b.bottom) / 2;
applyPanOffset();
}
function resetPanOffset() { panOff.x = 0; panOff.y = 0; applyPanOffset(); }
function panMove(e) {
if (!pan || e.pointerId !== pan.id)
return;
const wrap = wrapEl(), now = performance.now(), dt = Math.max(1, now - pan.t);
const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
pan.x = e.clientX;
pan.y = e.clientY;
pan.t = now;
pan.vx = pan.vx * .6 + (dx / dt) * .4;
pan.vy = pan.vy * .6 + (dy / dt) * .4;
const c = canScroll();
if (c.x)
wrap.scrollLeft -= dx;
else
panOff.x += dx;
if (c.y)
wrap.scrollTop -= dy;
else
panOff.y += dy;
if (c.x || c.y)
pan.sc = true;
if ((!c.x || !c.y) && !panRaf)
panRaf = requestAnimationFrame(flushPan);
}
function endPan(e) {
if (pan && e && e.pointerId !== pan.id)
return;
canvas.removeEventListener('pointerup', endPan);
canvas.removeEventListener('pointercancel', endPan);
const p = pan;
pan = null;
if (p && p.sc && !pinch && performance.now() - p.t < 90)
startGlide(p.vx, p.vy);
}
function endTouch(e) {
if (e.pointerType !== 'touch')
return;
fingers.delete(e.pointerId);
if (fingers.size < 2)
endPinch();
if (fingers.size === 0)
endPan(e);
if (moving || resizing || (tool === 'lasso' && lassoPath))
endDraw(e);
}
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);
function anchorAt(mx, my) {
const wrap = wrapEl();
let el = canvas, idx = null;
if (wrap.classList.contains('cont')) {
let best = Infinity;
for (const s of wrap.querySelectorAll('.slot')) {
const r = s.getBoundingClientRect(), d = my < r.top ? r.top - my : my > r.bottom ? my - r.bottom : 0;
if (d < best) {
best = d;
el = s;
idx = +s.dataset.i;
}
}
}
const r = el.getBoundingClientRect();
return { idx, fx: (mx - r.left) / Math.max(1, r.width), fy: (my - r.top) / Math.max(1, r.height) };
}
function reanchor(a, nx, ny, allowOff) {
const wrap = wrapEl(), cont = wrap.classList.contains('cont');
const el = (a.idx != null && wrap.querySelector('.slot[data-i="' + a.idx + '"]')) || canvas;
let r = el.getBoundingClientRect();
if (canScroll().x)
wrap.scrollLeft += (r.left + a.fx * r.width) - nx;
wrap.scrollTop += (r.top + a.fy * r.height) - ny;
if (allowOff) {
r = el.getBoundingClientRect();
const c = canScroll();
if (!c.x)
panOff.x += nx - (r.left + a.fx * r.width);
if (!c.y)
panOff.y += ny - (r.top + a.fy * r.height);
if (!c.x || !c.y) {
applyPanOffset();
clampPanOff();
}
zlock = { a, nx, ny, until: performance.now() + 600 };
settleAnchor(a, nx, ny, true);
}
}
let zlock = null, zfix = false, zcommit = false;
function settleAnchor(a, nx, ny, again) {
const wrap = wrapEl(), el = (a.idx != null && wrap.querySelector('.slot[data-i="' + a.idx + '"]')) || canvas;
const r = el.getBoundingClientRect(), c = canScroll();
const dx = (r.left + a.fx * r.width) - nx, dy = (r.top + a.fy * r.height) - ny;
zfix = true;
if (Math.abs(dx) > 1) {
if (c.x)
wrap.scrollLeft += dx;
else
panOff.x -= dx;
}
if (Math.abs(dy) > 1) {
if (c.y)
wrap.scrollTop += dy;
else
panOff.y -= dy;
}
zfix = false;
applyPanOffset();
if (again)
requestAnimationFrame(() => { if (!pinch && !pan)
settleAnchor(a, nx, ny, false); });
}
// If the browser resets the scroll position after a zoom (it clamps it while the page is
// rebuilt), put the spot you zoomed on back under your fingers.
wrapEl().addEventListener('scroll', () => {
if (zfix || !zlock || pinch || pan || glide || performance.now() > zlock.until)
return;
settleAnchor(zlock.a, zlock.nx, zlock.ny, false);
}, { passive: true });
function commitZoom(z, anchor, nx, ny) {
if (!cur)
return;
S.zoom = z;
saveS();
resetPanOffset();
zcommit = true;
try { resizeCanvas(); } finally { zcommit = false; }
reanchor(anchor, nx, ny, true);
renderPage();
}
function setZoom(s) {
if (!cur)
return;
const w = wrapEl().getBoundingClientRect(), mx = w.left + w.width / 2, my = w.top + w.height / 2;
commitZoom(clampZ((S.zoom || 1) * s / (canvas._scale || 1)), anchorAt(mx, my), mx, my);
}
const PINCH_HIDE = () => [byId('laser'), detCv];
function startPinch(pt) {
stopGlide();
if (panRaf)
flushPan();
let mx, my, d = 1;
if (pt) { mx = pt.x; my = pt.y; }
else {
const [a, b] = [...fingers.values()];
mx = (a.x + b.x) / 2; my = (a.y + b.y) / 2;
d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
}
const wrap = wrapEl();
const els = [...wrap.children].filter(el => el.matches('.slot, #paper, #textLayer, #rulerTop, #rulerLeft')).map(el => {
const r = el.getBoundingClientRect();
return { el, pre: el.style.transform, ox: mx - r.left, oy: my - r.top };
});
for (const o of els) {
o.el.style.transformOrigin = o.ox + 'px ' + o.oy + 'px';
o.el.style.willChange = 'transform';
}
for (const el of PINCH_HIDE())
if (el)
el.style.visibility = 'hidden';
const z0 = S.zoom || 1;
pinch = { d, z0, z: z0, mx, my, nx: mx, ny: my, els, raf: 0, anchor: anchorAt(mx, my) };
pan = null;
}
function pinchMove() {
if (!pinch || fingers.size < 2)
return;
const [a, b] = [...fingers.values()];
const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
pinch.z = clampZ(pinch.z0 * d / pinch.d);
pinch.nx = (a.x + b.x) / 2;
pinch.ny = (a.y + b.y) / 2;
if (!pinch.raf)
pinch.raf = requestAnimationFrame(paintPinch);
}
function paintPinch() {
const p = pinch;
if (!p)
return;
p.raf = 0;
const k = p.z / p.z0, tx = p.nx - p.mx, ty = p.ny - p.my;
for (const o of p.els)
o.el.style.transform = `${o.pre} translate(${tx}px, ${ty}px) scale(${k})`;
}
function endPinch() {
const p = pinch;
pinch = null;
if (p) {
if (p.raf)
cancelAnimationFrame(p.raf);
for (const o of p.els) {
o.el.style.transform = o.pre;
o.el.style.transformOrigin = '';
o.el.style.willChange = '';
}
for (const el of PINCH_HIDE())
if (el)
el.style.visibility = '';
if (p.z !== p.z0 || Math.hypot(p.nx - p.mx, p.ny - p.my) > 1) {
commitZoom(p.z, p.anchor, p.nx, p.ny);
}
else
renderDetail();
}
if (fingers.size === 1) {
const [id, f] = [...fingers.entries()][0];
pan = { id, x: f.x, y: f.y, vx: 0, vy: 0, t: performance.now(), sc: false };
}
}
let smoothR = parseFloat(localStorage.getItem('notark.smooth'));
if (isNaN(smoothR))
smoothR = 1;
const liveCv = document.createElement('canvas');
liveCv.className = 'laser';
liveCv.id = 'live';
liveCv.style.display = 'none';
$('#canvasWrap').insertBefore(liveCv, $('#laser'));
const lvx = liveCv.getContext('2d');
let live = null, activeId = null, liveRaf = 0, liveD = null;
const detCv = document.createElement('canvas'), dctx = detCv.getContext('2d');
detCv.className = 'laser';
detCv.style.cssText = 'position:fixed;display:none;z-index:2';
$('#canvasWrap').appendChild(detCv);
function detailWin() {
if (!cur || !byId('editor').classList.contains('active'))
return null;
const sc = canvas._scale || 1, dpr = Math.min(devicePixelRatio || 1, 3);
if (sc * dpr <= Q * 1.2)
return null;
const r = canvas.getBoundingClientRect(), w = byId('canvasWrap').getBoundingClientRect();
const ix = Math.max(r.left, w.left), iy = Math.max(r.top, w.top), ax = Math.min(r.right, w.right), ay = Math.min(r.bottom, w.bottom);
if (ax - ix < 2 || ay - iy < 2)
return null;
return { ix, iy, w: ax - ix, h: ay - iy, k: sc * dpr, tx: (r.left - ix) * dpr, ty: (r.top - iy) * dpr, dpr };
}
function renderDetail() {
const d = detailWin();
if (!d) {
detCv.style.display = 'none';
return;
}
const W = Math.round(d.w * d.dpr), H = Math.round(d.h * d.dpr);
if (detCv.width !== W)
detCv.width = W;
if (detCv.height !== H)
detCv.height = H;
Object.assign(detCv.style, { display: 'block', left: d.ix + 'px', top: d.iy + 'px', width: d.w + 'px', height: d.h + 'px' });
dctx.setTransform(d.k, 0, 0, d.k, d.tx, d.ty);
paintScene(dctx, cur.pages[page]);
}
let detT = 0;
$('#canvasWrap').addEventListener('scroll', () => { if (detCv.style.display !== 'none')
detCv.style.display = 'none'; clearTimeout(detT); detT = setTimeout(() => { if (cur)
renderDetail(); }, 90); }, { passive: true });
function liveBegin() {
const p = cur.pages[page];
liveD = detailWin();
if (liveD) {
const d = liveD, W = Math.round(d.w * d.dpr), H = Math.round(d.h * d.dpr);
if (liveCv.width !== W)
liveCv.width = W;
if (liveCv.height !== H)
liveCv.height = H;
lvx.setTransform(1, 0, 0, 1, 0, 0);
lvx.clearRect(0, 0, W, H);
Object.assign(liveCv.style, { display: 'block', position: 'fixed', left: d.ix + 'px', top: d.iy + 'px', width: d.w + 'px', height: d.h + 'px' });
return;
}
const w = Math.round(p.w * Q), h = Math.round(p.h * Q);
if (liveCv.width !== w)
liveCv.width = w;
if (liveCv.height !== h)
liveCv.height = h;
lvx.setTransform(1, 0, 0, 1, 0, 0);
lvx.clearRect(0, 0, w, h);
const wr = byId('canvasWrap'), r = canvas.getBoundingClientRect(), wrr = wr.getBoundingClientRect();
Object.assign(liveCv.style, { display: 'block', position: 'absolute', width: r.width + 'px', height: r.height + 'px',
left: (r.left - wrr.left + wr.scrollLeft) + 'px', top: (r.top - wrr.top + wr.scrollTop) + 'px' });
}
function incOK(st) {
if (st.tool !== 'pen' || (st.penType || 'pen') !== 'pen')
return false;
const def = PEN_TYPES.find(t => t.id === 'pen') || PEN_TYPES[0];
return def.alpha >= .999 && !def.flat && (!st.dash || st.dash === 'solid') && !eraseMark.has(st);
}
function liveInc(L) {
const st = L.st;
if (L.full)
return false;
if (L.inc === undefined)
L.inc = incOK(st);
if (!L.inc || (snapPreview && snapPreview.stroke === st)) {
L.full = true;
return false;
}
const pts = st.pts, n = pts.length;
if (n < 3)
return false;
if (L.i === undefined) {
lvx.setTransform(1, 0, 0, 1, 0, 0);
lvx.clearRect(0, 0, liveCv.width, liveCv.height);
if (liveD)
lvx.setTransform(liveD.k, 0, 0, liveD.k, liveD.tx, liveD.ty);
else
lvx.setTransform(Q, 0, 0, Q, 0, 0);
paintStroke(lvx, st);
L.i = n - 1;
return true;
}
if (n - 2 >= L.i) {
if (liveD)
lvx.setTransform(liveD.k, 0, 0, liveD.k, liveD.tx, liveD.ty);
else
lvx.setTransform(Q, 0, 0, Q, 0, 0);
const a = pts[L.i - 1], b = pts[L.i], wv = (st.wv && st.wv.length === n) ? st.wv : null;
let P = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
for (let i = L.i; i <= n - 2; i++) {
const c0 = pts[i], d = pts[i + 1], E = { x: (c0.x + d.x) / 2, y: (c0.y + d.y) / 2 };
lvx.lineWidth = wv ? st.size * wv[i] : st.size;
lvx.beginPath();
lvx.moveTo(P.x, P.y);
lvx.quadraticCurveTo(c0.x, c0.y, E.x, E.y);
lvx.stroke();
P = E;
}
L.i = n - 1;
}
return true;
}
function liveFrame() {
liveRaf = 0;
if (!live)
return;
if (live.st.tool !== 'shape') {
stepLive(live, performance.now());
if (dist(live.f, live.raw) > .2 / (canvas._scale || 1))
liveKick();
}
if (liveInc(live))
return;
lvx.setTransform(1, 0, 0, 1, 0, 0);
lvx.clearRect(0, 0, liveCv.width, liveCv.height);
if (liveD)
lvx.setTransform(liveD.k, 0, 0, liveD.k, liveD.tx, liveD.ty);
else
lvx.setTransform(Q, 0, 0, Q, 0, 0);
paintStroke(lvx, live.st);
if (snapPreview && snapPreview.stroke === live.st)
drawSnapGhost(lvx, live.st, snapPreview.res);
}
function liveKick() { if (!liveRaf)
liveRaf = requestAnimationFrame(liveFrame); }
function liveEnd() { cancelAnimationFrame(liveRaf); liveRaf = 0; liveCv.style.display = 'none'; }
function resetLive() { live = null; activeId = null; liveEnd(); }
function drawSnapGhost(c, st, r) {
c.save();
c.globalAlpha = .35;
c.strokeStyle = inkFor(st.color);
c.lineWidth = st.size * widthMul(st.tool === 'highlighter' ? 'highlighter' : (st.penType || 'pen'));
c.lineCap = 'round';
c.lineJoin = 'round';
c.beginPath();
if (r.kind === 'line') {
c.moveTo(r.pts[0].x, r.pts[0].y);
c.lineTo(r.pts[1].x, r.pts[1].y);
}
else if (r.kind === 'ellipse') {
const [a, b] = r.pts;
c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 7);
}
else {
r.pts.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y));
c.closePath();
}
c.stroke();
c.restore();
}
function stepLive(L, now) {
const f = L.f, v = L.v, sc = canvas._scale || 1;
// the pencil should feel like it is scratching the page: barely any lag, so the graphite
// lands under the nib instead of trailing behind it
const tau = Math.pow(Math.min(1, smoothR / 25), 1.5) * .05 * feelOf(L.st);   // 100% = ~50 ms of lag on the pen (was 350 ms)
const dt = Math.min(.1, Math.max(0, (now - L.t) / 1000));
L.t = Math.max(L.t, now);
if (tau < .01) {
f.x = L.raw.x;
f.y = L.raw.y;
v.x = v.y = 0;
}
else if (dt > 0) {
const w = 1 / tau, n = Math.ceil(dt / Math.min(.004, tau / 8)), h = dt / n;
for (let i = 0; i < n; i++) {
v.x += (w * w * (L.raw.x - f.x) - 2 * w * v.x) * h;
v.y += (w * w * (L.raw.y - f.y) - 2 * w * v.y) * h;
f.x += v.x * h;
f.y += v.y * h;
}
}
if (L.st.tool === 'pen') {
if (!L.pf) {
L.pf = { x: f.x, y: f.y };
L.acc = 0; L.accT = 0; L.w = 1; L.sp = null;
if (!L.st.wv) L.st.wv = [1];
}
L.acc += Math.hypot(f.x - L.pf.x, f.y - L.pf.y);
L.pf.x = f.x; L.pf.y = f.y;
L.accT += dt;
if (L.accT >= .008) {
const v = L.acc * sc / L.accT;
L.sp = L.sp == null ? v : L.sp * .6 + v * .4;
L.acc = L.accT = 0;
}
}
const last = L.st.pts[L.st.pts.length - 1];
const gap = Math.hypot(f.x - last.x, f.y - last.y);
// Keep ONE point per real movement (>= ~1.2 screen px apart) instead of filling the gap with
// straight-line points. Filling the gap made the path a polygon with a corner at every pen
// sample, and the curve smoothing in paintStroke can't round corners that sit on a straight chord.
if (gap >= 1.2 / sc) {
L.st.pts.push({ x: f.x, y: f.y });
if (L.st.wv) {
L.w += (speedWidth(L.st, L.sp) - L.w) * .35;
L.st.wv.push(Math.round(L.w * 100) / 100);
}
}
}
// Speed-adaptive low-pass ("One Euro" filter): heavy smoothing when the pen moves slowly
// (that is where hand/sensor jitter shows), almost none when it moves fast (so no lag).
// Tune: lower EURO_MINCUT = smoother slow lines; higher EURO_BETA = less lag on fast lines.
const EURO_DCUT = 10;
// How much each tool is smoothed relative to the pen: pencil stays tight to the nib, marker flows.
function feelOf(st) { const t = st.penType; return t === 'pencil' ? .25 : t === 'marker' ? 1.5 : 1; }
function euroParams(st) {
  const u = Math.min(1, Math.min(1, smoothR / 25) * (st.penType === 'pencil' ? .3 : st.penType === 'marker' ? 1.25 : 1));
  // u = 0: filter off.  u = 1: strong smoothing of slow movement, but fast strokes still follow the nib
  return { off: u < .02, cut: 60 * Math.pow(.03, u), beta: .12 * Math.pow(.2, u) };
}
function euroAlpha(cut, dt) { return 1 / (1 + (1 / (2 * Math.PI * cut)) / dt); }
function euroFilter(L, q, t) {
  const sc = canvas._scale || 1;
  const P = euroParams(L.st);
  if (P.off) return { x: q.x, y: q.y };
  let s = L.eu;
  if (!s) {
    L.eu = { x: q.x, y: q.y, rx: q.x, ry: q.y, dx: 0, dy: 0, t };
    return { x: q.x, y: q.y };
  }
  let dt = (t - s.t) / 1000;
  if (!(dt > 0.001)) dt = 1 / 240;      // equal / out-of-order timestamps: assume a nominal pen sample rate
  if (dt > 0.1) dt = 0.1;
  const ad = euroAlpha(EURO_DCUT, dt);
  s.dx += ad * (((q.x - s.rx) / dt) * sc - s.dx);
  s.dy += ad * (((q.y - s.ry) / dt) * sc - s.dy);
  const cut = P.cut + P.beta * Math.hypot(s.dx, s.dy), a = euroAlpha(cut, dt);
  s.x += a * (q.x - s.x);
  s.y += a * (q.y - s.y);
  s.rx = q.x; s.ry = q.y; s.t = Math.max(s.t, t);
  return { x: s.x, y: s.y };
}
function addPoint(L, q, t) {
  const now = t || performance.now();
  L.raw = euroFilter(L, q, now);
  stepLive(L, now);
}
function paintDone(st) {
if (!cur)
return;
ctx.setTransform(Q, 0, 0, Q, 0, 0);
paintStroke(ctx, st);
byId('selBar').style.display = 'none';
renderTexts();
const d = detailWin();
if (!d) {
detCv.style.display = 'none';
return;
}
if (detCv.style.display !== 'none' && detCv.width === Math.round(d.w * d.dpr) && detCv.height === Math.round(d.h * d.dpr)
&& detCv.style.left === d.ix + 'px' && detCv.style.top === d.iy + 'px') {
dctx.save();
dctx.setTransform(d.k, 0, 0, d.k, d.tx, d.ty);
paintStroke(dctx, st);
dctx.restore();
}
else
renderDetail();
}
function finishLive() {
const L = live;
if (!L)
return;
live = null;
clearTimeout(holdTimer);
holdCheck = null;
const st = L.st, p = cur && cur.pages[L.page];
if (!p) {
snapPreview = null;
liveEnd();
return;
}
if (st.tool !== 'shape') {
for (let k = 0; k < 600 && dist(L.f, L.raw) > .3 / (canvas._scale || 1); k++)
stepLive(L, L.t + 8);
const lp = st.pts[st.pts.length - 1];
if (Math.hypot(L.raw.x - lp.x, L.raw.y - lp.y) > .05) {
st.pts.push({ x: L.raw.x, y: L.raw.y });
if (st.wv) st.wv.push(Math.round((L.w == null ? 1 : L.w) * 100) / 100);
}
}
let snapped = false;
if (snapPreview && snapPreview.stroke === st) {
applySnap(st, snapPreview.res);
snapped = true;
}
snapPreview = null;
st.baked = true;
p.strokes.push(st);
undoStack.push({ type: 'add', page: L.page, stroke: st });
redoStack = [];
if (L.page === page)
paintDone(st);
liveEnd();
touch();
if (snapped) {
try {
navigator.vibrate && navigator.vibrate(8);
}
catch (_) { }
}
}
canvas.addEventListener('pointerdown', e => {
if (!cur)
return;
if (e.pointerType === 'touch') {
if (live || drawing || performance.now() - lastPen < 600) {
e.preventDefault();
return;
}
if (tool === 'lasso') {
const pt = pos(e);
if (selected.length === 1 && selected[0].tool === 'image') {
const hp = selected[0].pts[1];
if (Math.hypot(pt.x - (hp.x + 8), pt.y - (hp.y + 8)) < 26 / canvas._scale) {
e.preventDefault();
try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
activeId = e.pointerId;
resizing = { img: selected[0], snap: selected[0].pts.map(q => ({ ...q })) };
return;
}
}
if (selected.length && inSel(pt)) {
e.preventDefault();
try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
activeId = e.pointerId;
moving = { from: pt, snap: selected.map(s => s.pts.map(q => ({ ...q }))) };
return;
}
e.preventDefault();
try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
activeId = e.pointerId;
lassoPath = [pt];
selected = [];
renderPage();
return;
}
fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
if (fingers.size === 1)
startPan(e);
else if (fingers.size === 2)
startPinch();
return;
}
e.preventDefault();
if (pan)
endPan({ pointerId: pan.id });
fingers.clear();
pinch = null;
if (drawing || live || moving || resizing || lassoPath || laserTrail)
endDraw();
endLaser();
try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
activeId = e.pointerId;
syncPageIfNeeded();
const p = cur.pages[page];
const pt = pos(e);
if (tool === 'eraser') {
drawing = true;
eraseSnap = p.strokes.slice();
lastErase = pt;
eraseAt(pt, pt);
return;
}
if (tool === 'text') {
addText(pt);
return;
}
if (tool === 'hand') {
selText = null;
renderTexts();
return;
}
if (tool === 'laser') {
const tr = { id: e.pointerId, pts: [{ x: pt.x, y: pt.y, t: performance.now() }], active: true };
laserTrails.push(tr);
laserTrail = tr;
laserKick();
return;
}
if (tool === 'lasso') {
if (selected.length === 1 && selected[0].tool === 'image') {
const hp = selected[0].pts[1];
if (Math.hypot(pt.x - (hp.x + 8), pt.y - (hp.y + 8)) < 26 / canvas._scale) {
resizing = { img: selected[0], snap: selected[0].pts.map(q => ({ ...q })) };
return;
}
}
if (selected.length && inSel(pt)) {
moving = { from: pt, snap: selected.map(s => s.pts.map(q => ({ ...q }))) };
return;
}
lassoPath = [pt];
selected = [];
renderPage();
return;
}
drawing = true;
const isPen = (tool === 'pen' || tool === 'pencil' || tool === 'marker');
const st = { tool: isPen ? 'pen' : tool, penType: isPen ? tool : 'pen', pstyle: tool === 'pencil' ? pencilStyle : tool === 'pen' ? penStyle : undefined, shapeType, color, finish: finishOf({ finish: inkFinish }), size: (TOOL_PX[tool] || 4) / widthMul(tool), opacity: highlighterOpacity, dash: dashType, seed: (Math.random() * 1e9) | 0, pts: [pt] };
live = { st, id: e.pointerId, page, raw: pt, f: { x: pt.x, y: pt.y }, v: { x: 0, y: 0 }, t: performance.now() };
liveBegin();
liveKick();
});
canvas.addEventListener('pointermove', e => {
if (!cur)
return;
if (e.pointerType === 'touch') {
if (!fingers.has(e.pointerId))
return;
fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
if (fingers.size < 2 && (moving || (tool === 'lasso' && lassoPath))) {
e.preventDefault();
if (moving) {
const q = pos(e), dx = q.x - moving.from.x, dy = q.y - moving.from.y;
selected.forEach((s, i) => s.pts = moving.snap[i].map(o => ({ x: o.x + dx, y: o.y + dy })));
renderSoon();
return;
}
if (selectMode === 'rect') {
const a = lassoPath[0], b = pos(e);
lassoPath = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}
else
lassoPath.push(pos(e));
renderSoon(drawLasso);
return;
}
e.preventDefault();
if (fingers.size >= 2)
pinchMove();
else
panMove(e);
return;
}
if (laserTrail) {
e.preventDefault();
if (e.pointerId !== laserTrail.id)
return;
const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
const rc = canvas.getBoundingClientRect();
for (const ev of (evs.length ? evs : [e])) {
const q = pos(ev, rc);
laserTrail.pts.push({ x: q.x, y: q.y, t: performance.now() });
}
laserKick();
return;
}
if (resizing) {
e.preventDefault();
const q = pos(e), s0 = resizing.snap[0], s1 = resizing.snap[1];
const w = Math.max(40, q.x - 8 - s0.x);
resizing.img.pts = [{ ...s0 }, { x: s0.x + w, y: s0.y + w * (s1.y - s0.y) / (s1.x - s0.x) }];
renderSoon();
return;
}
if (moving) {
e.preventDefault();
const q = pos(e), dx = q.x - moving.from.x, dy = q.y - moving.from.y;
selected.forEach((s, i) => s.pts = moving.snap[i].map(o => ({ x: o.x + dx, y: o.y + dy })));
renderSoon();
return;
}
if (tool === 'lasso' && lassoPath) {
e.preventDefault();
if (selectMode === 'rect') {
const a = lassoPath[0], b = pos(e);
lassoPath = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}
else
lassoPath.push(pos(e));
renderSoon(drawLasso);
return;
}
if (!drawing)
return;
e.preventDefault();
if (tool === 'eraser') {
const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
const rc = canvas.getBoundingClientRect();
for (const ev of (evs.length ? evs : [e])) {
const q = pos(ev, rc);
eraseAt(lastErase, q);
lastErase = q;
}
return;
}
if (!live)
return;
const st = live.st;
if (st.tool === 'shape') {
st.pts[1] = pos(e);
liveKick();
return;
}
const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
const rc = canvas.getBoundingClientRect();
for (const ev of (evs.length ? evs : [e]))
addPoint(live, pos(ev, rc), ev.timeStamp);
if (shapeSnap && ['pen', 'highlighter'].includes(st.tool) && st.pts.length >= 8) {
const tail = st.pts[st.pts.length - 1];
if (snapPreview && snapPreview.stroke === st) {
snapPreview = null;
holdCheck = null;
clearTimeout(holdTimer);
}
if (!holdCheck || Math.hypot(tail.x - holdCheck.x, tail.y - holdCheck.y) > 6) {
holdCheck = { x: tail.x, y: tail.y, t: performance.now(), stroke: st };
clearTimeout(holdTimer);
holdTimer = setTimeout(() => {
if (!live || live.st !== st || !holdCheck || holdCheck.stroke !== st)
return;
const r = recognizeShape(st.pts, st.tool === 'highlighter');
if (r) {
snapPreview = { stroke: st, res: r };
liveKick();
}
}, 420);
}
}
liveKick();
});
function endDraw(e) {
if (e) {
if (e.pointerType === 'touch') {
if (!(moving || resizing || (tool === 'lasso' && lassoPath)))
return;
if (activeId !== null && e.pointerId !== activeId)
return;
}
else if (activeId !== null && e.pointerId !== activeId)
return;
}
if (e && e.type === 'pointerup' && live && e.pointerId === live.id) {
// Very fast flicks (the tail of a "y") can go down -> up with NO pointermove in between.
// The pointerup carries the real end position, so use it or the stroke collapses to nothing.
const q = pos(e);
if (live.st.tool === 'shape')
live.st.pts[1] = q;
else
live.raw = q;      // unfiltered: the stroke must end exactly where the pen lifted
}
activeId = null;
if (laserTrail) {
endLaser();
return;
}
if (resizing) {
const r = resizing;
resizing = null;
undoStack.push({ type: 'move', page, items: [{ s: r.img, before: r.snap, after: r.img.pts.map(q => ({ ...q })) }] });
redoStack = [];
touch();
return;
}
if (moving) {
const m = moving;
moving = null;
const items = selected.map((s, i) => ({ s, before: m.snap[i], after: s.pts.map(q => ({ ...q })) }));
if (items.some(it => it.after[0].x !== it.before[0].x || it.after[0].y !== it.before[0].y)) {
undoStack.push({ type: 'move', page, items });
redoStack = [];
}
touch();
return;
}
if (tool === 'eraser' && eraseMark.size && cur) {
const pp = cur.pages[page];
pp.strokes = pp.strokes.filter(s => !eraseMark.has(s));
eraseMark.clear();
renderPage();
}
if (tool === 'eraser' && eraseSnap && cur) {
const p = cur.pages[page];
if (p.strokes.length !== eraseSnap.length || p.strokes.some((s, i) => s !== eraseSnap[i])) {
undoStack.push({ type: 'snap', page, before: eraseSnap, after: p.strokes.slice() });
redoStack = [];
touch();
}
eraseSnap = null;
}
if (tool === 'lasso' && lassoPath) {
finishLasso();
return;
}
drawing = false;
if (live)
finishLive();
}
canvas.addEventListener('pointerup', endDraw);
canvas.addEventListener('pointercancel', endDraw);
function drawLasso() {
if (!lassoPath || lassoPath.length < 2)
return;
lassoOn(ctx);
const d = detailWin();
if (d && detCv.style.display !== 'none') {
dctx.save();
dctx.setTransform(d.k, 0, 0, d.k, d.tx, d.ty);
lassoOn(dctx);
dctx.restore();
}
}
function lassoOn(ctx) {
ctx.save();
ctx.setLineDash([6, 5]);
ctx.strokeStyle = '#ff9500';
ctx.lineWidth = 1.5;
ctx.beginPath();
lassoPath.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
ctx.closePath();
ctx.stroke();
ctx.restore();
}
function pointInPoly(pt, poly) {
let inside = false;
for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi))
inside = !inside;
}
return inside;
}
function finishLasso() {
const p = cur.pages[page];
const lx = lassoPath.map(q => q.x), ly = lassoPath.map(q => q.y);
const tiny = Math.hypot(Math.max(...lx) - Math.min(...lx), Math.max(...ly) - Math.min(...ly)) < 10 / canvas._scale;
if (tiny) {
const hh = hitAt(lassoPath[0]);
selected = hh ? [hh] : [];
}
else
selected = p.strokes.filter(st => inLasso(st));
lassoPath = null;
renderPage();
if (selected.length) {
ctx.save();
ctx.strokeStyle = '#ff9500';
ctx.lineWidth = 1.5;
ctx.setLineDash([5, 4]);
for (const st of selected) {
const xs = st.pts.map(q => q.x), ys = st.pts.map(q => q.y);
ctx.strokeRect(Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) - Math.min(...xs) + 12, Math.max(...ys) - Math.min(...ys) + 12);
}
ctx.restore();
}
}
function distToSeg(q, a, b) {
const dx = b.x - a.x, dy = b.y - a.y;
const len2 = dx * dx + dy * dy;
if (len2 === 0)
return Math.hypot(q.x - a.x, q.y - a.y);
let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2;
t = Math.max(0, Math.min(1, t));
return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}
function addText(pt) {
const p = cur.pages[page];
const t = { id: uid(), x: pt.x, y: pt.y, text: '', size: textSize, font: textFont, color };
p.texts.push(t);
renderTexts();
touch();
const el = document.querySelector(`.tbox[data-id="${t.id}"]`);
if (el)
el.focus();
}
function undo() {
const a = undoStack.pop();
if (!a || !cur)
return;
const p = cur.pages[a.page];
slotCache.delete(p);
if (a.type === 'add') {
p.strokes = p.strokes.filter(s => s !== a.stroke);
redoStack.push(a);
}
if (a.type === 'snap') {
p.strokes = a.before.slice();
redoStack.push(a);
}
if (a.type === 'move') {
a.items.forEach(it => { it.s.pts = it.before.map(q => ({ ...q })); });
redoStack.push(a);
}
if (a.type === 'erase') {
if (a.added)
p.strokes = p.strokes.filter(s => !a.added.includes(s));
p.strokes.push(...a.strokes);
redoStack.push(a);
}
if (a.page === page)
renderPage();
touch();
}
function redo() {
const a = redoStack.pop();
if (!a || !cur)
return;
const p = cur.pages[a.page];
slotCache.delete(p);
if (a.type === 'add') {
p.strokes.push(a.stroke);
undoStack.push(a);
}
if (a.type === 'snap') {
p.strokes = a.after.slice();
undoStack.push(a);
}
if (a.type === 'move') {
a.items.forEach(it => { it.s.pts = it.after.map(q => ({ ...q })); });
undoStack.push(a);
}
if (a.type === 'erase') {
p.strokes = p.strokes.filter(s => !a.strokes.includes(s));
if (a.added)
p.strokes.push(...a.added);
undoStack.push(a);
}
if (a.page === page)
renderPage();
touch();
}
setTimeout(() => { try { toast('Drawing engine v2 loaded'); } catch (_) { } }, 900);

// Tapping / clicking anywhere outside the style panel (colors, line type, size) closes it.
// The tap that closes it is swallowed, so dismissing the panel never leaves a stray dot.
document.addEventListener('pointerdown', e => {
  const sp = document.getElementById('stylePanel');
  if (!sp || !sp.classList.contains('show'))
    return;
  if (e.target.closest && e.target.closest('#stylePanel, #bottomBar, #libSheet, #askSheet'))
    return;
  sp.classList.remove('show');
  colorEdit = colorDel = null;
  e.stopPropagation();
  e.preventDefault();
}, true);
