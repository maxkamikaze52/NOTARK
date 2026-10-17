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
// Pencil = graphite, not ink. The stroke is drawn as a soft core plus a few thin, slightly
// wandering passes, then the whole thing is knocked back with a grain mask (speckle + paper
// tooth) so it breaks up like a real pencil on paper instead of a clean vector line.
const GRAIN = 128, grainCache = new Map();
function pencilGrain(seed) {
const key = seed + '|' + paperColor();
let g = grainCache.get(key);
if (g) return g;
const cv = document.createElement('canvas');
cv.width = cv.height = GRAIN;
const x = cv.getContext('2d'), img = x.createImageData(GRAIN, GRAIN), d = img.data;
for (let i = 0; i < GRAIN * GRAIN; i++) {
const px = i % GRAIN, py = (i / GRAIN) | 0;
// fine speckle + a coarser "tooth" so the grain has structure, not just TV static
const speck = vnoise(seed + 11, px * .9 + py * 1.7) * .5 + .5;
const tooth = vnoise(seed + 29, px * .22 + py * .31) * .5 + .5;
const v = Math.max(0, Math.min(255, 255 * (.35 + .65 * (speck * .55 + tooth * .45))));
d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
d[i * 4 + 3] = 255;
}
x.putImageData(img, 0, 0);
if (grainCache.size > 24) grainCache.clear();
grainCache.set(key, cv);
return cv;
}
function paintPencil(c, pts, st, def, baseW, alpha) {
const n = pts.length, seed = (st.seed || 7) | 0;
if (n < 3 && Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y) < Math.max(baseW * .5, .5)) {
c.fillStyle = c.strokeStyle;
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
const WAVE = 9, passes = [[1, .5, .05], [.62, .3, .22], [.62, .3, .22], [.4, .18, .34]];
const grain = pencilGrain(seed);
const drawPasses = () => {
for (let k = 0; k < passes.length; k++) {
const [wm, am, jm] = passes[k], amp = def.jitter ? baseW * jm : 0;
c.globalAlpha = alpha * am;
c.lineWidth = baseW * wm;
const q = pts.map((pt, i) => amp ? { x: pt.x + amp * vnoise(seed + 977 * k, arc[i] / WAVE), y: pt.y + amp * vnoise(seed + 331 * k + 17, arc[i] / WAVE) } : pt);
c.beginPath();
c.moveTo(q[0].x, q[0].y);
if (n < 3) {
for (let i = 1; i < n; i++)
c.lineTo(q[i].x, q[i].y);
}
else {
for (let i = 1; i < n - 1; i++)
c.quadraticCurveTo(q[i].x, q[i].y, (q[i].x + q[i + 1].x) / 2, (q[i].y + q[i + 1].y) / 2);
c.lineTo(q[n - 1].x, q[n - 1].y);
}
c.stroke();
}
};
// grain mask: draw the graphite, then keep only the parts the paper "catches"
const pat = typeof c.createPattern === 'function' ? c.createPattern(grain, 'repeat') : null;
if (pat) {
c.save();
c.globalCompositeOperation = 'destination-out';
drawPasses();
c.globalCompositeOperation = 'destination-in';
if (pat.setTransform) pat.setTransform(new DOMMatrix([1, 0, 0, 1, (seed % 97) * 3, (seed % 53) * 5]));
c.globalAlpha = 1;
c.fillStyle = pat;
c.fillRect(-1e5, -1e5, 2e5, 2e5);
c.restore();
} else {
drawPasses();
}
c.globalAlpha = 1;
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
const a = pts[L.i - 1], b = pts[L.i];
lvx.beginPath();
lvx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
for (let i = L.i; i <= n - 2; i++) {
const c0 = pts[i], d = pts[i + 1];
lvx.quadraticCurveTo(c0.x, c0.y, (c0.x + d.x) / 2, (c0.y + d.y) / 2);
}
lvx.stroke();
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
const tau = Math.min(Math.pow(smoothR / 25, 1.5) * .35, L.st.penType === 'pencil' ? .012 : 1);
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
const last = L.st.pts[L.st.pts.length - 1];
const gap = Math.hypot(f.x - last.x, f.y - last.y);
// Keep ONE point per real movement (>= ~1.2 screen px apart) instead of filling the gap with
// straight-line points. Filling the gap made the path a polygon with a corner at every pen
// sample, and the curve smoothing in paintStroke can't round corners that sit on a straight chord.
if (gap >= 1.2 / sc)
L.st.pts.push({ x: f.x, y: f.y });
}
// Speed-adaptive low-pass ("One Euro" filter): heavy smoothing when the pen moves slowly
// (that is where hand/sensor jitter shows), almost none when it moves fast (so no lag).
// Tune: lower EURO_MINCUT = smoother slow lines; higher EURO_BETA = less lag on fast lines.
const EURO_MINCUT = 1.2, EURO_BETA = 0.1, EURO_DCUT = 10;
function euroAlpha(cut, dt) { return 1 / (1 + (1 / (2 * Math.PI * cut)) / dt); }
function euroFilter(L, q, t) {
  const sc = canvas._scale || 1;
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
  const cut = EURO_MINCUT + EURO_BETA * Math.hypot(s.dx, s.dy), a = euroAlpha(cut, dt);
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
if (Math.hypot(L.raw.x - lp.x, L.raw.y - lp.y) > .05)
st.pts.push({ x: L.raw.x, y: L.raw.y });
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
const st = { tool: isPen ? 'pen' : tool, penType: isPen ? tool : 'pen', shapeType, color, size: (TOOL_PX[tool] || 4) / widthMul(tool), opacity: highlighterOpacity, dash: dashType, seed: (Math.random() * 1e9) | 0, pts: [pt] };
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
