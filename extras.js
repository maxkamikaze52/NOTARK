"use strict";
const ldS = (k, d) => { try {
return JSON.parse(localStorage.getItem(k)) || d;
}
catch (e) {
return d;
} };
let S = Object.assign({ view: 'single', fit: 'screen', rail: innerWidth > 700, gap: 14, ruler: 'cm', scope: 'page', quality: 2 }, ldS('notark.settings', {}));
const saveS = () => localStorage.setItem('notark.settings', JSON.stringify(S));
let selText = null, dragT = null, clip = null, pens = ldS('notark.pens', []);
const savePens = () => localStorage.setItem('notark.pens', JSON.stringify(pens));
const PANEL_TOOLS = ['pen', 'pencil', 'marker', 'highlighter', 'shape', 'text', 'eraser'];
const DRAW_TOOLS = ['pen', 'pencil', 'marker', 'highlighter', 'shape'];
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls)
e.className = cls; if (txt != null)
e.textContent = txt; return e; };
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
function makeQueue() {
let q = [], raf = 0;
const run = () => { raf = 0; const t0 = performance.now(); while (q.length && performance.now() - t0 < 8) {
try {
q.shift()();
}
catch (e) { }
} if (q.length)
raf = requestAnimationFrame(run); };
return { add(fn, first) { first ? q.unshift(fn) : q.push(fn); if (!raf)
raf = requestAnimationFrame(run); }, clear() { q = []; } };
}
const railQ = makeQueue(), pq = makeQueue();
function openSheet(title, build) {
let s = $('#xSheet');
if (!s) {
s = mk('div', 'sheet');
s.id = 'xSheet';
s.innerHTML = '<div class="sheet-card"><div class="sheet-head"><span></span><button class="icon-btn"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="xbody"></div></div>';
document.body.appendChild(s);
s.onclick = e => { if (e.target === s)
s.classList.remove('show'); };
s.querySelector('.icon-btn').onclick = () => s.classList.remove('show');
}
s.querySelector('.sheet-head span').textContent = title;
const b = s.querySelector('.xbody');
b.innerHTML = '';
build(b);
s.classList.add('show');
}
const closeSheet = () => $('#xSheet') && $('#xSheet').classList.remove('show');
const _rt = renderTexts;
renderTexts = function () {
const p = cur.pages[page], L = $('#textLayer');
if (!p.texts.length) {
if (L.firstChild)
L.innerHTML = '';
return;
}
if (drawing || moving || lassoPath)
return;
_rt();
const hand = tool === 'hand';
L.querySelectorAll('.tbox').forEach(el => {
const t = p.texts.find(x => x.id === el.dataset.id);
el.contentEditable = hand ? 'false' : 'true';
el.style.touchAction = hand ? 'none' : '';
if (!hand)
return;
el.style.cursor = 'grab';
el.classList.toggle('picked', t === selText);
if (t === selText) {
const x = mk('b', 'tdel', '×');
x.onpointerdown = e => e.stopPropagation();
x.onclick = e => { e.stopPropagation(); delText(); };
el.appendChild(x);
}
el.onpointerdown = e => {
if (e.target.classList.contains('tdel'))
return;
e.preventDefault();
selText = t;
dragT = { t, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
renderTexts();
const n = document.querySelector('.tbox[data-id="' + t.id + '"]');
dragT.l = parseFloat(n.style.left);
dragT.t0 = parseFloat(n.style.top);
};
});
};
function delText() {
if (!selText || !cur)
return;
const p = cur.pages[page];
p.texts = p.texts.filter(x => x !== selText);
selText = null;
renderTexts();
touch();
}
window.addEventListener('pointermove', e => {
if (!dragT)
return;
let n = dragT.n;
if (!n || !n.isConnected)
n = dragT.n = document.querySelector('.tbox[data-id="' + dragT.t.id + '"]');
if (!n)
return;
dragT.dx = e.clientX - dragT.sx;
dragT.dy = e.clientY - dragT.sy;
n.style.transform = 'translate(' + dragT.dx + 'px,' + dragT.dy + 'px)';
});
window.addEventListener('pointerup', () => {
if (!dragT)
return;
if (dragT.dx || dragT.dy) {
dragT.t.x += dragT.dx / canvas._scale;
dragT.t.y += dragT.dy / canvas._scale;
touch();
}
dragT = null;
if (cur)
renderTexts();
});
document.addEventListener('keydown', e => {
if (tool === 'hand' && selText && (e.key === 'Backspace' || e.key === 'Delete')) {
e.preventDefault();
delText();
}
});
const _st = setTool;
setTool = function (t) {
if (t === 'hand' && tool === 'hand')
return;
const same = tool === t;
if (t !== 'hand')
selText = null;
_st(t);
if (same)
return;
const show = PANEL_TOOLS.includes(t);
$('#stylePanel').classList.toggle('show', show);
if (show)
buildStylePanel();
};
const _rc = resizeCanvas;
resizeCanvas = function () {
_rc();
const wrap = $('#canvasWrap'), p = cur.pages[page];
if (S.fit === 'screen' && (S.zoom || 1) === 1) {
wrap.classList.remove('scrollfit');
return;
}
const cs = getComputedStyle(wrap), aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;
const ah = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 24;
const s = (S.fit === 'width' ? Math.max(.2, aw / p.w) : S.fit === 'actual' ? 1 : canvas._scale) * (S.zoom || 1);
canvas.style.width = (p.w * s) + 'px';
canvas.style.height = (p.h * s) + 'px';
canvas._scale = s;
wrap.classList.toggle('scrollfit', !(p.w * s <= aw && p.h * s <= ah));
sizeLaser(p);
};
const _bsp = buildStylePanel;
buildStylePanel = function () {
_bsp();
const pn = $('#stylePanel');
let dr = $('#dashRow');
if (!dr) {
dr = mk('div', 'pen-types');
dr.id = 'dashRow';
dr.style.flexWrap = 'wrap';
pn.insertBefore(dr, $('#sizes'));
}
let pr = $('#penRow');
if (!pr) {
pr = mk('div', 'penrow');
pr.id = 'penRow';
pn.insertBefore(pr, pn.firstChild);
}
const draw = DRAW_TOOLS.includes(tool);
let sr = $('#smRow');
if (!sr) {
sr = mk('div', 'size-row');
sr.id = 'smRow';
sr.innerHTML = '<span>Smooth</span><input type="range" min="0" max="100" step="1"><span class="size-val"></span>';
pn.insertBefore(sr, $('#sizes'));
const inp = sr.querySelector('input'), val = sr.querySelector('.size-val');
inp.oninput = () => { smoothR = +inp.value * .25; val.textContent = inp.value + '%'; try {
localStorage.setItem('notark.smooth', smoothR);
}
catch (e) { } };
}
sr.style.display = (draw && tool !== 'shape') ? 'flex' : 'none';
const sv0 = Math.round(smoothR / .25);
sr.querySelector('input').value = sv0;
sr.querySelector('.size-val').textContent = sv0 + '%';
dr.style.display = pr.style.display = draw ? 'flex' : 'none';
if (!draw) {
positionPanel();
return;
}
dr.innerHTML = '';
DASHES.forEach(([id, d]) => {
const b = mk('button', 'sh' + (id === dashType ? ' on' : ''));
b.title = id;
b.innerHTML = '<svg viewBox="0 0 40 8" style="width:40px;height:8px"><line x1="3" y1="4" x2="37" y2="4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="' + (d.length ? d.map(v => Math.max(v, .01) * 3).join(' ') : '') + '"/></svg>';
b.onclick = () => { dashType = id; buildStylePanel(); };
dr.appendChild(b);
});
pr.innerHTML = '';
pens.forEach(pn2 => {
const b = mk('button', 'pendot' + (pn2.base === tool && pn2.color.toLowerCase() === color.toLowerCase() ? ' on' : ''));
b.style.background = pn2.color;
b.title = pn2.base + ' · tap to use · hold to remove';
let tm;
b.onpointerdown = () => { tm = setTimeout(() => { tm = 'x'; if (confirm('Remove this pen?')) {
pens = pens.filter(x => x !== pn2);
savePens();
buildStylePanel();
} }, 600); };
b.onpointerup = b.onpointerleave = () => { if (tm !== 'x')
clearTimeout(tm); };
b.onclick = () => { if (tm === 'x') {
tm = null;
return;
} usePen(pn2); };
pr.appendChild(b);
});
const add = mk('button', 'sw add', '+');
add.title = 'Save current settings as a new pen';
add.onclick = addPen;
pr.appendChild(add);
positionPanel();
};
function addPen() {
if (!DRAW_TOOLS.includes(tool) || tool === 'shape')
return toast('Pick a pen, pencil, marker or highlighter');
pens.push({ base: tool, color, size: TOOL_PX[tool], dash: dashType });
savePens();
toast('Pen saved');
buildStylePanel();
}
function usePen(p) {
if (tool !== p.base)
setTool(p.base);
TOOL_PX[p.base] = p.size;
dashType = p.dash || 'solid';
color = p.color;
$('#stylePanel').classList.add('show');
buildStylePanel();
}
function paintPage(x, p) {
drawPaper(x, p.w, p.h, p.paper || cur.paper);
for (const st of p.strokes)
paintStroke(x, st);
for (const t of p.texts) {
x.fillStyle = inkFor(t.color);
x.font = t.size + 'px ' + fontCss(t.font);
t.text.split('\n').forEach((ln, i) => x.fillText(ln, t.x, t.y + t.size + i * t.size * 1.35));
}
}
function pageCanvas(p, k) {
const c = document.createElement('canvas');
c.width = Math.round(p.w * k);
c.height = Math.round(p.h * k);
const x = c.getContext('2d');
x.scale(k, k);
paintPage(x, p);
return c;
}
function thumbInto(cv, p, w) {
const x = cv.getContext('2d'), k = w / p.w;
x.save();
x.setTransform(1, 0, 0, 1, 0, 0);
x.clearRect(0, 0, cv.width, cv.height);
x.setTransform(k, 0, 0, k, 0, 0);
paintPage(x, p);
x.restore();
}
function jpegBytes(c, q) {
const u = c.toDataURL('image/jpeg', q || .9), bin = atob(u.slice(u.indexOf(',') + 1)), out = new Uint8Array(bin.length);
for (let i = 0; i < bin.length; i++)
out[i] = bin.charCodeAt(i);
c.width = c.height = 0;
return out;
}
function jpegUrl(p, k, qu) { const c = pageCanvas(p, k), u = c.toDataURL('image/jpeg', qu); c.width = c.height = 0; return u; }
const tplCache = new Map();
function tplThumb(t, cv) {
const key = t.id + '|' + (t.name || '') + '|' + paperColor() + '|' + (t.src ? (getImg(t.src).complete ? 1 : 0) : '');
let hit = tplCache.get(t.id);
if (!hit || hit.key !== key) {
const c = document.createElement('canvas');
c.width = 200;
c.height = 280;
const x = c.getContext('2d');
x.scale(.2, .2);
drawPaper(x, 1000, 1400, t.id);
hit = { key, c };
tplCache.set(t.id, hit);
}
cv.width = 200;
cv.height = 280;
cv.getContext('2d').drawImage(hit.c, 0, 0);
}
function makePDF() {
const enc = new TextEncoder(), parts = [], offs = [];
let len = 0;
const push = b => { if (typeof b === 'string')
b = enc.encode(b); parts.push(b); len += b.length; };
const o = (id, ...bs) => { offs[id] = len; push(id + ' 0 obj\n'); bs.forEach(push); push('\nendobj\n'); };
const n = cur.pages.length, total = 3 + 3 * n, pt = v => (v / PXMM * 72 / 25.4).toFixed(2);
push('%PDF-1.4\n');
o(1, '<</Type/Catalog/Pages 2 0 R>>');
o(2, '<</Type/Pages/Count ' + n + '/Kids[' + cur.pages.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + ']>>');
cur.pages.forEach((p, i) => {
const c = pageCanvas(p, Math.max(2, Q)), cw = c.width, chh = c.height, jpg = jpegBytes(c);
const W = pt(p.w), h = pt(p.h), cs = 'q ' + W + ' 0 0 ' + h + ' 0 0 cm /Im Do Q';
o(3 + 3 * i, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + W + ' ' + h + ']/Contents ' + (4 + 3 * i) + ' 0 R/Resources<</XObject<</Im ' + (5 + 3 * i) + ' 0 R>>>>>>');
o(4 + 3 * i, '<</Length ' + cs.length + '>>\nstream\n' + cs + '\nendstream');
o(5 + 3 * i, '<</Type/XObject/Subtype/Image/Width ' + cw + '/Height ' + chh + '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + jpg.length + '>>\nstream\n', jpg, '\nendstream');
});
const xr = len;
push('xref\n0 ' + total + '\n0000000000 65535 f \n');
for (let id = 1; id < total; id++)
push(String(offs[id]).padStart(10, '0') + ' 00000 n \n');
push('trailer\n<</Size ' + total + '/Root 1 0 R>>\nstartxref\n' + xr + '\n%%EOF');
return new Blob(parts, { type: 'application/pdf' });
}
function openExport() {
if (!cur)
return;
const nm = cur.title || 'note', p = cur.pages[page];
const items = [
['PNG image (this page)', () => { const c = pageCanvas(p, 2); c.toBlob(b => { dl(b, nm + '.png'); c.width = c.height = 0; }); }],
['JPG image (this page)', () => { const c = pageCanvas(p, 2); c.toBlob(b => { dl(b, nm + '.jpg'); c.width = c.height = 0; }, 'image/jpeg', .92); }],
['PDF (all pages)', () => dl(makePDF(), nm + '.pdf')],
['Word document .doc (all pages)', () => dl(new Blob(['<html><body>' + cur.pages.map(q => '<p><img width="600" src="' + jpegUrl(q, .8, .85) + '"></p>').join('') + '</body></html>'], { type: 'application/msword' }), nm + '.doc')],
['Plain text .txt (typed text only)', () => dl(new Blob([cur.pages.map((q, i) => '--- Page ' + (i + 1) + ' ---\n' + q.texts.map(t => t.text).join('\n')).join('\n\n')], { type: 'text/plain' }), nm + '.txt')],
['Notark file .notark (editable)', saveToFile],
];
openSheet('Send / export as…', b => items.forEach(([l, fn]) => { const x = mk('button', 'xbtn', l); x.onclick = () => { closeSheet(); fn(); }; b.appendChild(x); }));
}
function pageOp(i, op) {
const pgs = cur.pages, cl = o => JSON.parse(JSON.stringify(o));
if (op === 'dup')
pgs.splice(i + 1, 0, cl(pgs[i]));
else if (op === 'copy') {
clip = cl(pgs[i]);
return toast('Page copied');
}
else if (op === 'cut') {
clip = cl(pgs[i]);
if (pgs.length > 1)
pgs.splice(i, 1);
else
pgs[0] = newPage();
}
else if (op === 'paste') {
if (!clip)
return toast('Nothing copied yet');
pgs.splice(i + 1, 0, ...(Array.isArray(clip) ? clip : [clip]).map(cl));
}
else if (op === 'clear') {
if (!confirm('Clear everything on page ' + (i + 1) + '?'))
return;
pgs[i].strokes = [];
pgs[i].texts = [];
}
else if (op === 'del') {
if (pgs.length < 2)
return toast('A note needs at least one page');
if (!confirm('Delete page ' + (i + 1) + '?'))
return;
pgs.splice(i, 1);
}
else if (op === 'up' && i > 0)
[pgs[i - 1], pgs[i]] = [pgs[i], pgs[i - 1]];
else if (op === 'down' && i < pgs.length - 1)
[pgs[i + 1], pgs[i]] = [pgs[i], pgs[i + 1]];
slotCache = new Map();
page = Math.min(page, pgs.length - 1);
undoStack = [];
redoStack = [];
selected = [];
selText = null;
resizeCanvas();
renderPage();
updatePageLabel();
touch();
refreshRail(true);
if ($('#xSheet') && $('#xSheet').classList.contains('show'))
openPages();
}
let selPages = new Set();
function bulk(op) {
const idx = [...selPages].sort((a, b) => a - b), pgs = cur.pages, cl = o => JSON.parse(JSON.stringify(o));
if (!idx.length)
return;
const keep = pgs[page], old = page, n = idx.length;
if (op === 'copy') {
clip = idx.map(i => cl(pgs[i]));
return toast('Copied ' + n + (n > 1 ? ' pages' : ' page'));
}
if (op === 'clear') {
if (!confirm('Clear ' + n + ' page(s)?'))
return;
idx.forEach(i => { pgs[i].strokes = []; pgs[i].texts = []; });
}
if (op === 'dup')
[...idx].reverse().forEach(i => pgs.splice(i + 1, 0, cl(pgs[i])));
if (op === 'cut' || op === 'del') {
if (op === 'del') {
if (n >= pgs.length)
return toast('A note needs at least one page');
if (!confirm('Delete ' + n + ' page(s)?'))
return;
}
else
clip = idx.map(i => cl(pgs[i]));
[...idx].reverse().forEach(i => pgs.splice(i, 1));
if (!pgs.length)
pgs.push(newPage());
}
slotCache = new Map();
page = pgs.indexOf(keep);
if (page < 0)
page = Math.min(old, pgs.length - 1);
undoStack = [];
redoStack = [];
selected = [];
selText = null;
resizeCanvas();
renderPage();
updatePageLabel();
touch();
refreshRail(true);
openPages();
}
function openPages() {
if (!cur)
return;
$('#stylePanel').classList.remove('show');
selPages = new Set();
openSheet('Pages · ' + cur.pages.length, b => {
pq.clear();
const bar = mk('div', 'xrow');
b.appendChild(bar);
const g = mk('div', 'pg-grid');
b.appendChild(g);
const upd = () => {
bar.innerHTML = '';
bar.appendChild(mk('b', '', selPages.size ? selPages.size + ' selected' : 'Tap a page number to select pages'));
if (selPages.size)
[['dup', 'Duplicate'], ['copy', 'Copy'], ['cut', 'Cut'], ['clear', 'Clear'], ['del', 'Delete']].forEach(([op, l]) => { const x = mk('button', 'sh', l); x.onclick = () => bulk(op); bar.appendChild(x); });
const all = mk('button', 'sh', selPages.size === cur.pages.length ? 'Select none' : 'Select all');
all.onclick = () => { const on = selPages.size !== cur.pages.length; selPages = new Set(on ? cur.pages.map((_, i) => i) : []); g.querySelectorAll('.pgnum').forEach(n => n.classList.toggle('on', on)); upd(); };
bar.appendChild(all);
};
cur.pages.forEach((p, i) => {
const card = mk('div', 'pg-card'), th = mk('div', 'pg-th' + (i === page ? ' cur' : '')), cv = mk('canvas');
th.appendChild(cv);
cv.width = 440;
cv.height = Math.round(440 * p.h / p.w);
th.style.aspectRatio = p.w + '/' + p.h;
pq.add(() => { if (cur && cv.isConnected)
thumbInto(cv, p, 440); });
th.onclick = () => { closeSheet(); showPage(i); };
const nb = mk('button', 'pgnum', String(i + 1));
nb.title = 'Select page';
nb.onclick = () => { if (selPages.has(i))
selPages.delete(i);
else
selPages.add(i); nb.classList.toggle('on', selPages.has(i)); upd(); };
const m = mk('div', 'pg-meta');
m.appendChild(mk('span', '', 'Page ' + (i + 1)));
const mb = mk('button', 'mbtn', '⋯');
mb.onclick = () => pageMenu(i, mb);
m.appendChild(mb);
card.append(th, nb, m);
g.appendChild(card);
});
upd();
});
}
(function () {
const hand = mk('button', 'tool');
hand.dataset.tool = 'hand';
hand.title = 'Hand: select text boxes';
hand.innerHTML = '<svg viewBox="0 0 24 24" class="ic-fill"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10h.5V4.5a1.5 1.5 0 0 1 3 0V10h.5V6.5a1.5 1.5 0 0 1 3 0V15c0 4-2.5 6.5-6 6.5-3 0-4.5-1.5-6-4l-2-3.2a1.4 1.4 0 0 1 2.3-1.5L9 14z"/></svg>';
hand.onclick = () => setTool('hand');
$('#toolbar .tool[data-tool="lasso"]').before(hand);
const gear = mk('button', 'tool');
gear.title = 'Settings';
gear.innerHTML = '<svg viewBox="0 0 24 24" class="ic-fill"><path d="M10.5 2.5h3l.5 2.4 1.6.9 2.3-.8 1.5 2.6-1.8 1.6v1.8l1.8 1.6-1.5 2.6-2.3-.8-1.6.9-.5 2.4h-3l-.5-2.4-1.6-.9-2.3.8-1.5-2.6 1.8-1.6V10.2L4.6 8.6l1.5-2.6 2.3.8 1.6-.9z"/><circle cx="12" cy="12" r="2.6" class="ic-dark"/></svg>';
gear.onclick = openSettings;
$('#libBtn').after(gear);
const pb = mk('button', 'pg');
pb.title = 'All pages';
pb.innerHTML = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>';
pb.onclick = openPages;
$('#addPage').after(pb);
$('#pageLabel').style.cursor = 'pointer';
$('#pageLabel').onclick = openPages;
$('#shareBtn').onclick = openExport;
$('#shareBtn').title = 'Send / export';
})();
const rail = mk('div');
rail.id = 'rail';
$('#editor').appendChild(rail);
let railT;
function applyRail() {
$('#editor').classList.toggle('side', !!S.rail);
rail.style.top = headerBottom() + 'px';
drawRail();
if (cur)
layoutBar();
}
const _on0 = openNote;
openNote = function (id) { _on0(id); applyRail(); };
const _ul0 = updatePageLabel;
updatePageLabel = function () { _ul0(); refreshRail(); };
const _tc0 = touch;
touch = function () { _tc0(); refreshRail(); };
function pageMenu(i, anchor) {
document.querySelectorAll('.pmenu').forEach(x => x.remove());
const m = mk('div', 'pmenu'), r = anchor.getBoundingClientRect();
[['dup', '📄', 'Duplicate'], ['copy', '📋', 'Copy'], ['cut', '✂️', 'Cut'], ['paste', '📥', 'Paste after'], ['clear', '🧽', 'Clear page'], ['up', '⬆️', 'Move up'], ['down', '⬇️', 'Move down'], ['del', '🗑️', 'Delete']].forEach(([op, ic, l]) => {
const b = mk('button', '', l);
b.onclick = () => { m.remove(); pageOp(i, op); };
m.appendChild(b);
});
document.body.appendChild(m);
m.style.left = Math.max(8, Math.min(r.left - m.offsetWidth - 8, innerWidth - m.offsetWidth - 8)) + 'px';
m.style.top = Math.max(8, Math.min(r.top, innerHeight - m.offsetHeight - 10)) + 'px';
setTimeout(() => document.addEventListener('pointerdown', function f(e) { if (!m.contains(e.target)) {
m.remove();
document.removeEventListener('pointerdown', f);
} }), 0);
}
function opts(b, title, list, get, set, again) {
const c = mk('div', 'scard');
c.appendChild(mk('h4', '', title));
const g = mk('div', 'sopts');
list.forEach(([v, l]) => { const x = mk('button', 'opt' + (get() === v ? ' on' : '')); x.innerHTML = '<span>' + l + '</span>'; x.onclick = () => { set(v); (again || openSettings)(); }; g.appendChild(x); });
c.appendChild(g);
b.appendChild(c);
return g;
}
function openSettings() {
openSheet('Settings', b => {
opts(b, 'View', [['single', 'One page at a time'], ['scroll', 'Scroll through all pages']], () => S.view, v => { S.view = v; saveS(); if (cur) {
resizeCanvas();
renderPage();
scrollToPage(page);
} });
opts(b, 'Fit', [['screen', 'Fit page'], ['width', 'Fit width'], ['actual', 'Actual size']], () => S.fit, v => { S.fit = v; saveS(); if (cur) {
resizeCanvas();
renderPage();
} });
opts(b, 'Zoom', [[.1, '10%'], [.25, '25%'], [.5, '50%'], [.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%'], [2, '200%'], [4, '400%'], [8, '800%']], () => S.zoom || 1, v => { S.zoom = v; saveS(); if (cur) {
resizeCanvas();
renderPage();
} });
opts(b, 'Pages panel', [[true, 'On the side'], [false, 'Hidden']], () => !!S.rail, v => { S.rail = v; saveS(); applyRail(); });
if (cur)
pageSizeCard(b);
if (cur)
qualityCard(b);
gapCard(b);
opts(b, 'Ruler (printed size)', [['cm', 'Centimetres'], ['in', 'Inches'], ['off', 'Off']], () => S.ruler, v => { S.ruler = v; saveS(); if (cur) {
resizeCanvas();
renderPage();
} });
appearanceCard(b, openSettings);
const g = opts(b, 'My pens', [], () => 0, () => { });
pens.forEach(p => { const d = mk('button', 'opt'); d.innerHTML = '<span><b style="color:' + p.color + '">●</b> ' + p.base + ' ' + p.size + 'px · remove</span>'; d.onclick = () => { pens = pens.filter(x => x !== p); savePens(); openSettings(); }; g.appendChild(d); });
const add = mk('button', 'opt');
add.innerHTML = '<span>+ Save current pen</span>';
add.onclick = () => { addPen(); openSettings(); };
g.appendChild(add);
});
}
(function () {
const rb = mk('button', 'icon-btn');
rb.title = 'Pages panel';
rb.innerHTML = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="16" rx="1.5"/><rect x="13" y="4" width="7" height="16" rx="1.5"/></svg>';
rb.onclick = () => { S.rail = !S.rail; saveS(); applyRail(); };
$('#paperBtn').before(rb);
})();
const FF = '-apple-system,"Helvetica Neue",Arial,sans-serif';
const TPL = [
{ id: 'blank', name: 'Blank' }, { id: 'lined', name: 'Lined' }, { id: 'grid', name: 'Grid' }, { id: 'dots', name: 'Dots' },
{ id: 'sand', name: 'Sand ruled', bg: ['#f1e1bd', '#2a2418'], ln: ['#d3b983', '#4b3f28'], kind: 'lined' },
{ id: 'bluegrid', name: 'Blue grid', bg: ['#e5eff9', '#151f2b'], ln: ['#b7cfe8', '#2b3f57'], kind: 'grid' },
{ id: 'cornell', name: 'Cornell notes', draw: (c, w, h, T) => { for (let y = 170; y < h - 250; y += 50) {
c.moveTo(0, y);
c.lineTo(w, y);
} c.moveTo(300, 110); c.lineTo(300, h - 250); c.moveTo(0, 110); c.lineTo(w, 110); c.moveTo(0, h - 250); c.lineTo(w, h - 250); T('Cues', 50, 80); T('Notes', 340, 80); T('Summary', 50, h - 205); } },
{ id: 'planner', name: 'Daily planner', draw: (c, w, h, T) => {
T('Daily planner', 60, 100, 52);
T('Date:', w - 420, 100);
c.moveTo(w - 310, 104);
c.lineTo(w - 60, 104);
for (let i = 0; i < 14; i++) {
const y = 210 + i * 72;
T(((6 + i) % 12 || 12) + (6 + i < 12 ? ' am' : ' pm'), 60, y - 14, 26);
c.moveTo(190, y);
c.lineTo(w * .62, y);
}
T('Priorities', w * .62 + 40, 190);
for (let i = 0; i < 4; i++) {
const y = 260 + i * 64;
c.moveTo(w * .62 + 40, y);
c.lineTo(w - 60, y);
}
T('Notes', w * .62 + 40, 590);
for (let y = 660; y < 1100; y += 64) {
c.moveTo(w * .62 + 40, y);
c.lineTo(w - 60, y);
}
} },
{ id: 'todo', name: 'To-do list', draw: (c, w, h, T) => { T('To-do', 60, 100, 52); for (let y = 190; y < h - 60; y += 70) {
c.rect(60, y - 34, 34, 34);
c.moveTo(120, y);
c.lineTo(w - 60, y);
} } },
{ id: 'review', name: 'Book review', draw: (c, w, h, T) => { T('Book review', 60, 100, 52); ['Title', 'Author', 'Started', 'Finished', 'Rating'].forEach((l, i) => { const y = 200 + i * 80; T(l, 60, y - 12); c.moveTo(220, y); c.lineTo(w - 60, y); }); T('My thoughts', 60, 640); for (let y = 700; y < h - 60; y += 50) {
c.moveTo(60, y);
c.lineTo(w - 60, y);
} } },
];
let customTpl = ldS('notark.tpl', []), tplMode = 'add';
const _dp0 = drawPaper;
drawPaper = function (c, w, h, kind) {
const ct = customTpl.find(x => x.id === kind);
if (ct && ct.grid)
return drawGridTpl(c, w, h, ct.grid);
if (ct) {
c.setLineDash([]);
c.fillStyle = paperColor();
c.fillRect(0, 0, w, h);
const im = getImg(ct.src);
if (im.complete && im.naturalWidth) {
const s = Math.max(w / im.naturalWidth, h / im.naturalHeight), iw = im.naturalWidth * s, ih = im.naturalHeight * s;
c.drawImage(im, (w - iw) / 2, (h - ih) / 2, iw, ih);
}
return;
}
const t = TPL.find(x => x.id === kind);
if (!t || (!t.draw && !t.kind))
return _dp0(c, w, h, kind);
const dk = paperColor() !== '#ffffff', k = dk ? 1 : 0, ln = (t.ln || ['#d3d9e6', '#3a3a3c'])[k], tx = dk ? '#8e8e93' : '#6b7280';
c.setLineDash([]);
c.fillStyle = t.bg ? t.bg[k] : paperColor();
c.fillRect(0, 0, w, h);
c.strokeStyle = ln;
c.lineWidth = 1.4;
c.beginPath();
if (t.kind === 'lined') {
for (let y = 75; y < h; y += 50) {
c.moveTo(0, y);
c.lineTo(w, y);
}
}
else if (t.kind === 'grid') {
for (let y = 50; y < h; y += 50) {
c.moveTo(0, y);
c.lineTo(w, y);
}
for (let x = 50; x < w; x += 50) {
c.moveTo(x, 0);
c.lineTo(x, h);
}
}
else
t.draw(c, w, h, (s, x, y, z) => { c.fillStyle = tx; c.font = '600 ' + (z || 28) + 'px ' + FF; c.fillText(s, x, y); });
c.stroke();
};
function openTemplates(mode) {
if (!cur)
return;
tplMode = mode || tplMode;
$('#stylePanel').classList.remove('show');
openSheet('Templates', b => {
const sg = mk('div', 'xrow');
[['add', 'New page'], ['change', 'This page']].forEach(([m, l]) => { const x = mk('button', 'sh' + (tplMode === m ? ' on' : ''), l); x.onclick = () => openTemplates(m); sg.appendChild(x); });
b.appendChild(sg);
const grid = mk('div', 'tpl-grid');
b.appendChild(grid), curId = cur.pages[page].paper || cur.paper || 'blank';
const use = id => { closeSheet(); if (tplMode === 'add') {
cur.pages.push(Object.assign(newPage(), { paper: id }));
showPage(cur.pages.length - 1);
}
else {
cur.pages[page].paper = id;
resizeCanvas();
renderPage();
} touch(); refreshRail(true); };
[...TPL, ...customTpl].forEach(t => {
const c = mk('button', 'tpl' + (curId === t.id ? ' on' : '')), cv = mk('canvas');
tplThumb(t, cv);
c.append(cv, mk('span', '', t.name));
c.onclick = () => use(t.id);
grid.appendChild(c);
if (customTpl.includes(t)) {
let tm;
c.onpointerdown = () => { tm = setTimeout(() => { tm = 'x'; if (confirm('Delete template “' + t.name + '”?')) {
customTpl = customTpl.filter(z => z !== t);
try {
localStorage.setItem('notark.tpl', JSON.stringify(customTpl));
}
catch (e) { }
openTemplates();
} }, 700); };
c.onpointerup = c.onpointerleave = () => { if (tm !== 'x')
clearTimeout(tm); };
c.onclick = () => { if (tm === 'x') {
tm = null;
return;
} use(t.id); };
}
});
const ad = mk('button', 'tpl addt');
ad.innerHTML = '<b>+</b><span>From image</span>';
ad.onclick = () => $('#tplInput').click();
grid.appendChild(ad);
const gm = mk('button', 'tpl addt');
gm.innerHTML = '<b>▦</b><span>Grid maker</span>';
gm.onclick = openGridMaker;
grid.appendChild(gm);
});
}
var curId;
const tin = mk('input');
tin.type = 'file';
tin.accept = 'image/*';
tin.id = 'tplInput';
tin.style.display = 'none';
document.body.appendChild(tin);
tin.onchange = () => {
const f = tin.files[0];
tin.value = '';
if (!f)
return;
const fr = new FileReader();
fr.onload = () => {
const im = new Image();
im.onload = () => {
const k = Math.min(1, 1400 / Math.max(im.width, im.height)), c = document.createElement('canvas');
c.width = im.width * k;
c.height = im.height * k;
c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
const src = c.toDataURL('image/jpeg', .8), id = 'c' + uid();
const ni = new Image();
ni.src = src;
imgCache.set(src, ni);
customTpl.push({ id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Custom', src });
try {
localStorage.setItem('notark.tpl', JSON.stringify(customTpl));
}
catch (e) {
toast('Storage is full');
}
ni.onload = () => openTemplates();
};
im.src = fr.result;
};
fr.readAsDataURL(f);
};
$('#paperBtn').onclick = () => openTemplates('add');
$('#paperBtn').title = 'Templates';
$('#addPage').onclick = () => addPage();
function scrollToPage(i) { if (S.view !== 'scroll')
return; const sl = $('#canvasWrap').querySelector('.slot[data-i="' + i + '"]'); if (sl)
sl.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
function showPage(i) { page = i; selected = []; selText = null; resizeCanvas(); renderPage(); updatePageLabel(); scrollToPage(i); }
goPage = function (d) { const np = page + d; if (np < 0 || np >= cur.pages.length)
return; showPage(np); };
const _ap0 = addPage;
addPage = function () { const t = cur.pages[page].paper; _ap0(); if (t) {
cur.pages[page].paper = t;
renderPage();
} scrollToPage(page); };
const _rcFit = resizeCanvas;
function leaveCont() { const w = $('#canvasWrap'); if (!w.classList.contains('cont'))
return; w.classList.remove('cont'); w.querySelectorAll('.slot').forEach(x => x.remove()); w.insertBefore(canvas, $('#textLayer')); }
// Keep preview canvases only for pages near the one being viewed, so a long
// notebook doesn't hold every page's bitmap in memory at once.
const SLOT_KEEP = 5;
function pruneSlotCache() {
if (!cur)
return;
const lo = page - SLOT_KEEP, hi = page + SLOT_KEEP;
for (const [q, v] of slotCache) {
const i = cur.pages.indexOf(q);
if (i < 0 || i < lo || i > hi) {
if (v && v.cv) {
v.cv.width = v.cv.height = 0;
}
slotCache.delete(q);
}
}
}
resizeCanvas = function () {
if (S.view !== 'scroll') {
leaveCont();
return _rcFit();
}
const wrap = $('#canvasWrap'), p = cur.pages[page];
pickQ(p);
wrap.classList.add('cont');
wrap.classList.remove('scrollfit');
const cs = getComputedStyle(wrap), aw = Math.max(200, wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 28), ah = Math.max(200, wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 28), base = S.fit === 'width' ? aw / p.w : S.fit === 'actual' ? 1 : Math.min(aw / p.w, ah / p.h), s = Math.max(.15, base * (S.zoom || 1)), dpr = Math.min(devicePixelRatio || 1, 2);
wrap.querySelectorAll('.slot').forEach(x => { if (x.contains(canvas))
wrap.appendChild(canvas); x.remove(); });
cur.pages.forEach((q, i) => {
const sl = mk('div', 'slot');
sl.dataset.i = i;
sl.style.width = (q.w * s) + 'px';
sl.style.height = (q.h * s) + 'px';
if (i === page) {
slotCache.delete(q);
sl.appendChild(canvas);
canvas.width = Math.round(q.w * Q);
canvas.height = Math.round(q.h * Q);
canvas.style.width = (q.w * s) + 'px';
canvas.style.height = (q.h * s) + 'px';
canvas._scale = s;
}
else {
const k = s * dpr, kind = q.paper || cur.paper, key = [k, q.w, q.h, kind, paperColor(), paperSig(kind)].join('|'), hit = slotCache.get(q);
let sc;
if (hit && hit.key === key)
sc = hit.cv;
else {
sc = mk('canvas', 'sp');
sc.width = Math.round(q.w * k);
sc.height = Math.round(q.h * k);
const x = sc.getContext('2d');
x.setTransform(k, 0, 0, k, 0, 0);
paintPage(x, q);
if (!q.strokes.some(st => st.tool === 'image' && !getImg(st.src).complete))
slotCache.set(q, { key, cv: sc });
}
sl.appendChild(sc);
}
wrap.appendChild(sl);
});
pruneSlotCache();
sizeLaser(p);
};
$('#canvasWrap').addEventListener('pointerdown', e => {
if (S.view !== 'scroll' || !cur || e.pointerType === 'touch' || e.target === canvas)
return;
const sl = e.target.closest && e.target.closest('.slot');
if (!sl || +sl.dataset.i === page)
return;
e.preventDefault();
e.stopPropagation();
page = +sl.dataset.i;
selected = [];
selText = null;
resizeCanvas();
renderPage();
updatePageLabel();
canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: true, button: 0, buttons: 1, pressure: e.pressure || .5 }));
}, true);
let rdDone = false;
function refreshRail(full) {
clearTimeout(railT);
railT = setTimeout(() => {
if (!cur || !S.rail)
return;
const ts = rail.querySelectorAll('.rt');
if (full === true || ts.length !== cur.pages.length)
return drawRail();
ts.forEach((t, i) => t.classList.toggle('cur', i === page));
const p = cur.pages[page], cv = ts[page].querySelector('canvas');
thumbInto(cv, p, 240);
}, full === true ? 0 : 400);
}
function drawRail() {
railQ.clear();
rail.innerHTML = '';
if (!cur || !S.rail)
return;
cur.pages.forEach((p, i) => {
const t = mk('div', 'rt' + (i === page ? ' cur' : '')), th = mk('div', 'rth'), cv = mk('canvas');
cv.width = 240;
cv.height = Math.round(240 * p.h / p.w);
railQ.add(() => { if (cur && cv.isConnected)
thumbInto(cv, p, 240); }, i === page);
th.appendChild(cv);
th.onpointerdown = e => railDrag(e, i, t);
th.onclick = () => { if (!rdDone)
showPage(i); };
const mb = mk('button', 'mbtn', '⋯');
mb.onclick = e => { e.stopPropagation(); pageMenu(i, mb); };
t.append(th, mk('span', 'rn', String(i + 1)), mb);
rail.appendChild(t);
});
const a = mk('button', 'radd', '+');
a.title = 'New page from a template';
a.onclick = () => openTemplates('add');
rail.appendChild(a);
}
function railDrag(e, i, tile) {
if (e.button)
return;
const sy = e.clientY, tiles = [...rail.querySelectorAll('.rt')], others = tiles.filter((_, k) => k !== i);
let on = false, to = i, mids = null, st0 = 0, marked = false;
const mv = ev => {
if (!on) {
if (Math.abs(ev.clientY - sy) < 8)
return;
on = true;
tile.classList.add('lift');
}
tile.style.transform = 'translateY(' + (ev.clientY - sy) + 'px)';
if (!mids) {
mids = others.map(t => { const r = t.getBoundingClientRect(); return r.top + r.height / 2; });
st0 = rail.scrollTop;
}
const nt = mids.filter(m => ev.clientY > m - (rail.scrollTop - st0)).length;
if (nt !== to || !marked) {
to = nt;
marked = true;
tiles.forEach(t => t.classList.remove('dropb'));
if (to < others.length)
others[to].classList.add('dropb');
}
};
const up = () => {
removeEventListener('pointermove', mv);
removeEventListener('pointerup', up);
removeEventListener('pointercancel', up);
tile.classList.remove('lift');
tile.style.transform = '';
tiles.forEach(t => t.classList.remove('dropb'));
if (on) {
rdDone = true;
setTimeout(() => rdDone = false, 60);
if (to !== i)
movePage(i, to);
}
};
addEventListener('pointermove', mv);
addEventListener('pointerup', up);
addEventListener('pointercancel', up);
}
function movePage(i, to) {
const pgs = cur.pages, keep = pgs[page], [m] = pgs.splice(i, 1);
pgs.splice(to, 0, m);
page = pgs.indexOf(keep);
undoStack = [];
redoStack = [];
selected = [];
resizeCanvas();
renderPage();
updatePageLabel();
touch();
refreshRail(true);
}
function zoomBy(f, mx, my) {
if (!cur)
return;
if (mx == null) {
const r = $('#canvasWrap').getBoundingClientRect();
mx = r.left + r.width / 2;
my = r.top + r.height / 2;
}
let z = clampZ((S.zoom || 1) * f);
commitZoom(z, anchorAt(mx, my), mx, my);
}
(function () {
const zo = mk('button', 'pg', '−'), zi = mk('button', 'pg', '+');
zo.title = 'Zoom out';
zi.title = 'Zoom in';
[zo, zi].forEach(b => { b.style.fontSize = '20px'; b.style.fontWeight = '700'; });
zo.onclick = () => zoomBy(1 / 1.2);
zi.onclick = () => zoomBy(1.2);
const pb = document.querySelector('.pagebar');
pb.append(zo, zi);
let wTimer = 0;
$('#canvasWrap').addEventListener('wheel', e => {
if (!(e.ctrlKey || e.metaKey) || !cur)
return;
e.preventDefault();
if (fingers.size || (pinch && !pinch.wheel))
return;
if (!pinch) {
startPinch({ x: e.clientX, y: e.clientY });
pinch.wheel = true;
}
pinch.z = clampZ(pinch.z * Math.exp(-e.deltaY * .01));
if (!pinch.raf)
pinch.raf = requestAnimationFrame(paintPinch);
clearTimeout(wTimer);
wTimer = setTimeout(() => { if (pinch && pinch.wheel)
endPinch(); }, 140);
}, { passive: false });
// Trackpad / mouse-wheel panning: sideways (or up/down) when that axis has no scroll range.
$('#canvasWrap').addEventListener('wheel', e => {
if (e.ctrlKey || e.metaKey || !cur || pinch)
return;
const c = canScroll(), w = $('#canvasWrap');
if (c.x && c.y)
return;
e.preventDefault();
if (c.x)
w.scrollLeft += e.deltaX;
else
panOff.x -= e.deltaX;
if (c.y)
w.scrollTop += e.deltaY;
else
panOff.y -= e.deltaY;
applyPanOffset();
clampPanOff();
}, { passive: false });
})();
const PXMM = 1000 / 210;
const PSIZES = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['B5', 176, 250], ['Letter', 215.9, 279.4], ['Legal', 215.9, 355.6]];
function sizeName(p) {
for (const [n, w, h] of PSIZES) {
const a = Math.round(w * PXMM), b = Math.round(h * PXMM);
if (Math.abs(p.w - a) <= 2 && Math.abs(p.h - b) <= 2)
return n + ' portrait';
if (Math.abs(p.w - b) <= 2 && Math.abs(p.h - a) <= 2)
return n + ' landscape';
}
return 'Custom';
}
const defPg = () => S.defSize || { w: 1000, h: 1414 };
const sizeTargets = () => S.scope === 'all' ? cur.pages : [cur.pages[page]];
function afterSize() { resizeCanvas(); renderPage(); updatePageLabel(); touch(); refreshRail(true); }
function applySize(w, h) {
if (S.scope === 'new') {
const land = defPg().w > defPg().h;
S.defSize = land ? { w: Math.round(h * PXMM), h: Math.round(w * PXMM) } : { w: Math.round(w * PXMM), h: Math.round(h * PXMM) };
saveS();
return toast('New notes will use this size');
}
if (!cur)
return;
sizeTargets().forEach(q => { const land = q.w > q.h; q.w = Math.round((land ? h : w) * PXMM); q.h = Math.round((land ? w : h) * PXMM); });
afterSize();
}
function rotateTo(o) {
const fix = q => { const lo = Math.max(q.w, q.h), sh = Math.min(q.w, q.h); q.w = o === 'landscape' ? lo : sh; q.h = o === 'landscape' ? sh : lo; };
if (S.scope === 'new') {
const d = Object.assign({}, defPg());
fix(d);
S.defSize = d;
saveS();
return;
}
if (!cur)
return;
sizeTargets().forEach(fix);
afterSize();
}
function pageSizeCard(b) {
const c = mk('div', 'scard'), cp = cur.pages[page], d = S.scope === 'new' ? defPg() : cp;
c.appendChild(mk('h4', '', 'Page size'));
const info = mk('div', 'xrow');
info.appendChild(mk('b', '', 'Current page: ' + sizeName(cp) + ' · ' + Math.round(cp.w / PXMM) + ' × ' + Math.round(cp.h / PXMM) + ' mm'));
info.appendChild(mk('b', '', 'Your writing keeps its printed size when the page size changes.'));
c.appendChild(info);
const row = (list, get, set) => { const g = mk('div', 'sopts'); list.forEach(([v, l]) => { const bt = mk('button', 'opt' + (get() === v ? ' on' : ''), l); bt.onclick = () => { set(v); openSettings(); }; g.appendChild(bt); }); c.appendChild(g); };
row([['page', 'This page'], ['all', 'All pages'], ['new', 'New notes']], () => S.scope, v => { S.scope = v; saveS(); });
row([['portrait', 'Portrait'], ['landscape', 'Landscape']], () => d.w > d.h ? 'landscape' : 'portrait', rotateTo);
row(PSIZES.map(([n, w, h]) => [n, n + ' ' + Math.round(w) + '×' + Math.round(h)]), () => null, v => { const s = PSIZES.find(z => v.startsWith(z[0] + ' ')); applySize(s[1], s[2]); });
b.appendChild(c);
}
// ---- drawing quality + storage readout -------------------------------------
const Q_LABELS = { 1: 'Low', 2: 'Standard', 3: 'High', 4: 'Maximum' };
function fmtBytes(n) {
if (n < 1024) return n + ' B';
if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
return (n / 1048576).toFixed(2) + ' MB';
}
function pageBytes(p) {                       // rough size of one page's stroke data
try { return new Blob([JSON.stringify(p)]).size; } catch (e) { return JSON.stringify(p).length; }
}
function storageInfo() {
let total = 0;
try { for (const k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) total += (localStorage[k] || '').length * 2; } catch (e) {}
const pages = cur.pages.length, bytes = pageBytes(cur);
const q = Q, cw = Math.round(cur.w * q), ch = Math.round(cur.h * q);
const mb = (cw * ch * 4) / 1048576;           // RGBA canvas memory
return { total, pages, bytes, q, cw, ch, mb };
}
function qualityCard(b) {
const c = mk('div', 'scard');
c.appendChild(mk('h4', '', 'Drawing quality'));
const r = mk('div', 'size-row'), inp = mk('input'), val = mk('span', 'size-val');
const info = mk('div', 'xrow');
const refresh = () => {
const s = storageInfo();
val.textContent = Q_LABELS[S.quality || 2] + ' · ' + s.q.toFixed(2) + '×';
info.innerHTML = '';
info.appendChild(mk('b', '', 'Canvas: ' + s.cw + ' × ' + s.ch + ' px  (' + s.mb.toFixed(1) + ' MB in memory)'));
info.appendChild(mk('b', '', 'This page: ' + fmtBytes(s.bytes) + '  ·  ' + s.pages + ' page' + (s.pages === 1 ? '' : 's') + '  ·  ' + fmtBytes(s.total) + ' used in this browser'));
info.appendChild(mk('b', '', 'Higher quality = finer lines and smaller strokes. Print size never changes.'));
};
inp.type = 'range';
inp.min = 1;
inp.max = 4;
inp.step = 1;
inp.value = S.quality || 2;
inp.oninput = () => { S.quality = +inp.value; refresh(); };
inp.onchange = () => { saveS(); afterSize(); };
r.append(inp, val);
c.appendChild(r);
c.appendChild(info);
refresh();
b.appendChild(c);
}
function applyGap() { $('#canvasWrap').style.setProperty('--pgap', (S.gap == null ? 14 : S.gap) + 'px'); }
function gapCard(b) {
const c = mk('div', 'scard'), r = mk('div', 'size-row'), inp = mk('input'), val = mk('span', 'size-val', (S.gap == null ? 14 : S.gap) + ' px');
c.appendChild(mk('h4', '', 'Space between pages (scroll view)'));
inp.type = 'range';
inp.min = 0;
inp.max = 100;
inp.step = 2;
inp.value = S.gap == null ? 14 : S.gap;
inp.oninput = () => { S.gap = +inp.value; val.textContent = S.gap + ' px'; applyGap(); };
inp.onchange = () => saveS();
r.append(inp, val);
c.appendChild(r);
b.appendChild(c);
}
function appearanceCard(b, again) { opts(b, 'Appearance', [['auto', 'Auto (follow iPad)'], ['light', 'Light'], ['dark', 'Dark']], () => themePref, v => setTheme(v), again); }
function openAppearance() { openSheet('Appearance', b => appearanceCard(b, openAppearance)); }
$('#themeBtn').onclick = openAppearance;
applyGap();
const RULER_T = 20;
var rulerKey = '';
function drawRuler() {
const top = document.getElementById('rulerTop'), left = document.getElementById('rulerLeft');
if (!top || !left)
return;
const mode = S.ruler;
const on = mode && mode !== 'off' && cur;
top.style.display = left.style.display = on ? 'block' : 'none';
if (!on)
return;
const p = cur.pages[page];
const sc = canvas._scale || 1;
const dpr = Math.min(devicePixelRatio || 1, 3);
const dk = document.body.classList.contains('dark');   // ruler follows the app theme, NOT the page invert
const inch = mode === 'in';
const subs = inch ? 8 : 10, mid = subs / 2;
const step = (inch ? 25.4 : 10) * PXMM / subs;
const ks = inch ? [1, 2, 4, 8] : [1, 5, 10];
const k = ks.find(v => step * v * sc >= 4) || ks[ks.length - 1];
let every = 1;
while (step * subs * every * sc < 26)
every++;
const fg = dk ? '#8b9ab8' : '#5b6b88';
const bg = dk ? '#0b1220' : '#e7edf8';
const edge = dk ? '#1e2a42' : '#c9d5e8';
const w = p.w * sc, h = p.h * sc;
const wrap = document.getElementById('canvasWrap');
const pr = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
const px = pr.left - wr.left + wrap.scrollLeft - panOff.x;
const py = pr.top - wr.top + wrap.scrollTop - panOff.y;
top.style.left = px + 'px';
top.style.top = (py - RULER_T - 2) + 'px';
left.style.left = (px - RULER_T - 2) + 'px';
left.style.top = py + 'px';
const rkey = [mode, w, h, dpr, dk, k, every].join('|');
if (rkey === rulerKey)
return;
rulerKey = rkey;
top.width = Math.round(w * dpr);
top.height = Math.round(RULER_T * dpr);
top.style.width = w + 'px';
top.style.height = RULER_T + 'px';
const tc = top.getContext('2d');
tc.setTransform(dpr, 0, 0, dpr, 0, 0);
tc.fillStyle = bg;
tc.fillRect(0, 0, w, RULER_T);
tc.strokeStyle = edge;
tc.lineWidth = 1;
tc.beginPath();
tc.moveTo(0, RULER_T - .5);
tc.lineTo(w, RULER_T - .5);
tc.stroke();
tc.strokeStyle = fg;
tc.fillStyle = fg;
tc.lineWidth = 1;
tc.lineCap = 'butt';
tc.font = '600 9px -apple-system,Helvetica,Arial,sans-serif';
tc.beginPath();
for (let i = 0;; i += k) {
const v = i * step * sc;
if (v > w)
break;
const len = RULER_T * (i % subs === 0 ? .62 : i % mid === 0 ? .45 : .28);
tc.moveTo(v + .5, RULER_T);
tc.lineTo(v + .5, RULER_T - len);
}
tc.stroke();
for (let n = every;; n += every) {
const v = n * subs * step * sc;
if (v > w)
break;
tc.fillText(String(n), v + 3, 9);
}
tc.fillText(inch ? 'in' : 'cm', 3, 13);
left.width = Math.round(RULER_T * dpr);
left.height = Math.round(h * dpr);
left.style.width = RULER_T + 'px';
left.style.height = h + 'px';
const lc = left.getContext('2d');
lc.setTransform(dpr, 0, 0, dpr, 0, 0);
lc.fillStyle = bg;
lc.fillRect(0, 0, RULER_T, h);
lc.strokeStyle = edge;
lc.lineWidth = 1;
lc.beginPath();
lc.moveTo(RULER_T - .5, 0);
lc.lineTo(RULER_T - .5, h);
lc.stroke();
lc.strokeStyle = fg;
lc.fillStyle = fg;
lc.lineWidth = 1;
lc.lineCap = 'butt';
lc.font = '600 9px -apple-system,Helvetica,Arial,sans-serif';
lc.beginPath();
for (let i = 0;; i += k) {
const v = i * step * sc;
if (v > h)
break;
const len = RULER_T * (i % subs === 0 ? .62 : i % mid === 0 ? .45 : .28);
lc.moveTo(RULER_T, v + .5);
lc.lineTo(RULER_T - len, v + .5);
}
lc.stroke();
for (let n = every;; n += every) {
const v = n * subs * step * sc;
if (v > h)
break;
lc.save();
lc.translate(9, v + 3);
lc.rotate(-Math.PI / 2);
lc.fillText(String(n), 0, 0);
lc.restore();
}
lc.save();
lc.translate(13, 3);
lc.rotate(-Math.PI / 2);
lc.fillText(inch ? 'in' : 'cm', 0, 0);
lc.restore();
}
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => { const p = hx(a), q = hx(b); return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function drawGridTpl(c, w, h, g) {
const dk = paperColor() !== '#ffffff', bg = dk ? mixHex(g.bg, '#000000', .88) : g.bg, ln = dk ? mixHex(g.line, bg, .72) : g.line;
const s = Math.max(4, g.mm * PXMM), N = g.every || 0;
c.setLineDash([]);
c.fillStyle = bg;
c.fillRect(0, 0, w, h);
c.strokeStyle = ln;
c.fillStyle = ln;
c.lineCap = 'butt';
if (g.type === 'dots') {
const r = Math.max(.7, g.wt * .9);
for (let pass = 0; pass < (N ? 2 : 1); pass++) {
const rr = pass ? r * 1.7 : r;
c.beginPath();
for (let j = 1; j * s < h; j++)
for (let i = 1; i * s < w; i++) {
if (!!(N && i % N === 0 && j % N === 0) !== !!pass)
continue;
c.moveTo(i * s + rr, j * s);
c.arc(i * s, j * s, rr, 0, 7);
}
c.fill();
}
return;
}
for (let pass = 0; pass < 2; pass++) {
c.lineWidth = pass ? g.wt * 2 : g.wt;
c.beginPath();
for (let j = 1; j * s < h; j++)
if (!!(N && j % N === 0) === !!pass) {
c.moveTo(0, j * s);
c.lineTo(w, j * s);
}
if (g.type === 'grid')
for (let i = 1; i * s < w; i++)
if (!!(N && i % N === 0) === !!pass) {
c.moveTo(i * s, 0);
c.lineTo(i * s, h);
}
c.stroke();
}
}
function openGridMaker() {
const g = { type: 'grid', mm: 5, wt: 1, every: 5, line: '#b7c4d8', bg: '#ffffff' };
openSheet('Grid maker', b => {
const cv = mk('canvas');
cv.width = 300;
cv.height = 420;
cv.style.cssText = 'width:150px;display:block;margin:0 auto 12px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.3)';
const redraw = () => { const q = cv.getContext('2d'); q.setTransform(.3, 0, 0, .3, 0, 0); drawGridTpl(q, 1000, 1400, g); };
b.appendChild(cv);
const card = t => { const k = mk('div', 'scard'); k.appendChild(mk('h4', '', t)); b.appendChild(k); return k; };
const seg = (t, list, key) => { const k = card(t), gg = mk('div', 'sopts'); list.forEach(([v, l]) => { const o = mk('button', 'opt' + (g[key] === v ? ' on' : ''), l); o.onclick = () => { g[key] = v; [...gg.children].forEach(z => z.classList.toggle('on', z === o)); redraw(); }; gg.appendChild(o); }); k.appendChild(gg); };
const sld = (t, key, min, max, step, unit) => {
const k = card(t), r = mk('div', 'size-row'), i = mk('input'), v = mk('span', 'size-val', g[key] + ' ' + unit);
i.type = 'range';
i.min = min;
i.max = max;
i.step = step;
i.value = g[key];
i.oninput = () => { g[key] = +i.value; v.textContent = g[key] + ' ' + unit; redraw(); };
r.append(i, v);
k.appendChild(r);
};
const col = (t, key) => { const k = card(t), i = mk('input'); i.type = 'color'; i.value = g[key]; i.style.cssText = 'width:100%;height:40px;border:0;background:none'; i.oninput = () => { g[key] = i.value; redraw(); }; k.appendChild(i); };
seg('Style', [['grid', 'Grid'], ['lines', 'Lines'], ['dots', 'Dots']], 'type');
sld('Spacing', 'mm', 1, 30, .5, 'mm');
sld('Line weight', 'wt', .2, 3, .1, 'px');
seg('Bolder line every', [[0, 'Never'], [2, '2'], [4, '4'], [5, '5'], [10, '10']], 'every');
col('Line colour', 'line');
col('Paper colour', 'bg');
const nm = mk('input');
nm.placeholder = 'Template name';
nm.style.cssText = 'width:100%;padding:12px;border-radius:12px;border:1.5px solid var(--bd);background:var(--card);color:var(--ink);font:inherit;margin:4px 0 8px;-webkit-user-select:text;user-select:text';
b.appendChild(nm);
const sv = mk('button', 'xbtn', 'Save template');
sv.onclick = () => {
customTpl.push({ id: 'g' + uid(), name: (nm.value.trim() || 'Grid ' + g.mm + ' mm').slice(0, 18), grid: Object.assign({}, g) });
try {
localStorage.setItem('notark.tpl', JSON.stringify(customTpl));
}
catch (e) {
toast('Storage is full');
}
openTemplates();
};
b.appendChild(sv);
redraw();
});
}
{
// Free pan: when a page is bigger than the view, pad the scroll area so the page
// can be dragged anywhere (until only FREE_KEEP px of it is left on screen).
const FREE_KEEP = 0;
function applyFreePan() {
const wrap = $('#canvasWrap');
if (!wrap || !cur)
return;
const cont = wrap.classList.contains('cont');
const els = cont ? [...wrap.querySelectorAll('.slot')] : [canvas];
if (!els.length)
return;
const first = els[0], before = first.getBoundingClientRect();
const cs = getComputedStyle(wrap);
const vw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
const vh = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
let maxW = 0, totH = 0;
for (const el of els) {
const r = el.getBoundingClientRect();
maxW = Math.max(maxW, r.width);
totH += r.height;
}
const freeX = true, freeY = (cont ? totH : before.height) > vh + 1;
wrap.classList.toggle('free-x', freeX);
wrap.classList.toggle('free-y', freeY);
wrap.classList.toggle('free', freeX || freeY);
wrap.style.setProperty('--fx', (freeX ? Math.max(0, vw - FREE_KEEP) : 0) + 'px');
wrap.style.setProperty('--fy', (freeY ? Math.max(0, vh - FREE_KEEP) : 0) + 'px');
wrap.style.setProperty('--cw', (freeX ? maxW : 0) + 'px');
const after = first.getBoundingClientRect();
// keep the page where it was on screen when the padding changes
wrap.scrollLeft += after.left - before.left;
wrap.scrollTop += after.top - before.top;
sizeLaser(cur.pages[page]);
drawRuler();
}
// Finger drags that start on the empty padding (off the page) pan too.
$('#canvasWrap').addEventListener('pointerdown', e => {
const onOtherPage = e.target !== canvas && e.target.closest && e.target.closest('.slot');
if (!cur || e.pointerType !== 'touch' || (e.target !== $('#canvasWrap') && !onOtherPage) || live || drawing)
return;
e.preventDefault();
fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
if (fingers.size === 1)
startPan(e);
else if (fingers.size === 2)
startPinch();
});
const _rcCentre = resizeCanvas;
let _vk = '';
resizeCanvas = function () {
// While zoomed, a resize rebuilds the canvas at fit size first, which makes the browser
// clamp the scroll position to the left edge. Remember what is in the middle of the view
// and put it back afterwards.
const live = cur && $('#editor').classList.contains('active');
const key = cur ? cur.id + ':' + page : '';
let a = null, mx = 0, my = 0;
if (live && !pinch && !zcommit && (S.zoom || 1) !== 1 && key === _vk) {
const r = $('#canvasWrap').getBoundingClientRect();
mx = r.left + r.width / 2;
my = r.top + r.height / 2;
a = anchorAt(mx, my);
}
_rcCentre.apply(this, arguments);
if (live) {
applyFreePan();
centerFit();
if (!a && key !== _vk) {
const wr = $('#canvasWrap'), w = wr.getBoundingClientRect(), b = boxOf();
wr.scrollLeft += (b.left + b.right) / 2 - (w.left + w.width / 2);
}
if (a)
reanchor(a, mx, my, true);
_vk = key;
}
};
}