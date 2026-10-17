"use strict";
(() => {
const lib = $('#library'), side = $('#libSide');
const gridEl = $('#noteGrid'), titleEl = $('.lib-title'), countEl = $('#noteCount'), emptyEl = $('#emptyState'), chipEl = $('#newFolderChip'), foldersBox = $('#sideFolders'), sortSeg = $('#sortSeg'), newMenu = $('#sideNewMenu');
const TITLES = { all: 'Your notes', recent: 'Recent', templates: 'Templates' };
let view = 'all';
const wide = () => innerWidth >= 700;
let open = false;
try {
open = wide() && localStorage.getItem('notark.side') !== '0';
}
catch (e) {
open = wide();
}
function setOpen(v, remember) {
open = v;
lib.classList.toggle('side-open', v);
if (remember !== false && wide())
try {
localStorage.setItem('notark.side', v ? '1' : '0');
}
catch (e) { }
}
const closeIfNarrow = () => { if (!wide())
setOpen(false, false); };
const tplGrid = document.createElement('div');
tplGrid.id = 'tplGrid';
gridEl.after(tplGrid);
let tplSig = '';
function drawTemplates() {
const all = (typeof TPL !== 'undefined' ? TPL : [{ id: 'blank', name: 'Blank' }]).concat(typeof customTpl !== 'undefined' ? customTpl : []);
const sig = all.map(t => t.id + ':' + t.name + (t.src && typeof getImg === 'function' ? (getImg(t.src).complete ? '1' : '0') : '')).join('|')
+ '|' + (typeof paperColor === 'function' ? paperColor() : '');
if (sig === tplSig && tplGrid.firstChild)
return;
tplSig = sig;
tplGrid.textContent = '';
const frag = document.createDocumentFragment();
for (const t of all) {
const b = document.createElement('button');
b.className = 'tpl-card';
const cv = document.createElement('canvas');
if (typeof tplThumb === 'function')
tplThumb(t, cv);
else {
cv.width = 200;
cv.height = 280;
const x = cv.getContext('2d');
x.scale(.2, .2);
drawPaper(x, 1000, 1400, t.id);
}
const sp = document.createElement('span');
sp.textContent = t.name;
b.append(cv, sp);
b.onclick = () => newNoteWith(t.id);
frag.appendChild(b);
}
tplGrid.appendChild(frag);
}
function newNoteWith(paper) {
const n = { id: uid(), title: '', created: Date.now(), updated: Date.now(), pages: [Object.assign(newPage(), { paper })], folder: folder || '', paper };
notes.push(n);
dirty.add(n.id);
save();
openNote(n.id);
}
function renderSideFolders() {
const box = foldersBox;
box.textContent = '';
const frag = document.createDocumentFragment();
for (const f of folders) {
const b = document.createElement('button');
b.className = 'side-folder' + (view === 'all' && folder === f ? ' on' : '');
b.textContent = f;
b.onclick = () => { view = 'all'; folder = f; closeIfNarrow(); renderFolders(); renderLibrary(); };
frag.appendChild(b);
}
const nf = document.createElement('button');
nf.className = 'side-folder';
nf.textContent = '+ New folder';
nf.onclick = () => { view = 'all'; closeIfNarrow(); newFolder(); };
frag.appendChild(nf);
box.appendChild(frag);
}
function folderCard(f, counts) {
const cnt = counts.get(f) || 0;
const card = document.createElement('div');
card.className = 'folder-card';
card.innerHTML = `
<div class="folder-shape"><div class="folder-tab"></div><div class="folder-body"><div class="folder-count">${cnt} ${cnt === 1 ? 'note' : 'notes'}</div></div></div>
<div class="note-meta"><div class="note-name">${escapeHtml(f)}</div><div class="note-date">Folder</div></div>
<button class="del" title="Delete folder"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
const go = () => { folder = f; renderFolders(); renderLibrary(); };
card.querySelector('.folder-shape').onclick = go;
card.querySelector('.note-name').onclick = go;
card.querySelector('.del').onclick = e => { e.stopPropagation(); deleteFolder(f); };
return card;
}
function noteCard(n) {
const card = document.createElement('div');
card.className = 'note-card';
card.innerHTML = `
<div class="thumb"><canvas></canvas></div>
<div class="note-meta"><div class="note-name">${escapeHtml(n.title || 'Untitled')}</div><div class="note-date">${fmtDate(n.updated)}</div></div>
<button class="mv" title="Move to folder"><svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v9H3z"/></svg></button>
<button class="del" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
card.querySelector('.thumb').onclick = () => openNote(n.id);
card.querySelector('.mv').onclick = e => { e.stopPropagation(); moveNote(n.id); };
card.querySelector('.del').onclick = e => { e.stopPropagation(); deleteNote(n.id); };
return card;
}
const thumbCache = new Map();
const thumbKey = n => n.id + '|' + n.updated + '|' + n.pages.length + '|' + (typeof paperColor === 'function' ? paperColor() : '');
const imgPending = n => typeof getImg === 'function' && n.pages.some(p => p.strokes.some(s => s.tool === 'image' && !getImg(s.src).complete));
function blitThumb(cv, hit) {
cv.width = hit.cv.width;
cv.height = hit.cv.height;
cv.style.cssText = hit.css;
cv.getContext('2d').drawImage(hit.cv, 0, 0);
}
function paintThumb(cv, n) {
const key = thumbKey(n), hit = thumbCache.get(n.id);
if (hit && hit.key === key) {
blitThumb(cv, hit);
return;
}
drawThumb(cv, n);
if (imgPending(n))
return;
const cp = document.createElement('canvas');
cp.width = cv.width;
cp.height = cv.height;
cp.getContext('2d').drawImage(cv, 0, 0);
thumbCache.delete(n.id);
thumbCache.set(n.id, { key, cv: cp, css: cv.style.cssText });
if (thumbCache.size > 80)
thumbCache.delete(thumbCache.keys().next().value);
}
let tq = [], tRaf = 0;
const pump = () => { tRaf = 0; const t0 = performance.now(); while (tq.length && performance.now() - t0 < 10) {
try {
tq.shift()();
}
catch (e) { }
} if (tq.length)
tRaf = requestAnimationFrame(pump); };
const lazy = new Map();
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
for (const e of es) {
if (!e.isIntersecting)
continue;
io.unobserve(e.target);
const f = lazy.get(e.target);
lazy.delete(e.target);
if (f) {
tq.push(f);
if (!tRaf)
tRaf = requestAnimationFrame(pump);
}
}
}, { rootMargin: '400px' }) : null;
function queueThumb(card, n) {
const cv = card.querySelector('canvas'), hit = thumbCache.get(n.id);
if (hit && hit.key === thumbKey(n)) {
blitThumb(cv, hit);
return;
}
if (!io) {
paintThumb(cv, n);
return;
}
lazy.set(card, () => { if (cv.isConnected)
paintThumb(cv, n); });
io.observe(card);
}
renderLibrary = function () {
lib.classList.remove('v-all', 'v-recent', 'v-templates');
lib.classList.add('v-' + view);
titleEl.textContent = view === 'all' && folder !== null ? folder : TITLES[view];
side.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === view && !(view === 'all' && folder !== null)));
renderSideFolders();
chipEl.style.display = (view === 'all' && folder === null) ? '' : 'none';
if (view === 'templates') {
drawTemplates();
return;
}
gridEl.textContent = '';
if (io) {
io.disconnect();
lazy.clear();
}
tq = [];
const sort = sortSeg.querySelector('.on').dataset.sort;
let list;
if (view === 'recent')
list = [...notes].sort((a, b) => b.updated - a.updated).slice(0, 30);
else
list = notes.filter(n => folder === null ? true : (n.folder || '') === folder).sort((a, b) => sort === 'name'
? (a.title || 'Untitled').localeCompare(b.title || 'Untitled') : b.updated - a.updated);
countEl.textContent = view === 'recent' ? 'Last edited' : notes.length + (notes.length === 1 ? ' note' : ' notes');
emptyEl.classList.toggle('show', notes.length === 0);
const frag = document.createDocumentFragment();
if (view === 'all' && folder === null) {
const counts = new Map();
for (const n of notes) {
const k = n.folder || '';
counts.set(k, (counts.get(k) || 0) + 1);
}
for (const f of folders)
frag.appendChild(folderCard(f, counts));
}
const cards = [];
for (const n of list) {
const c = noteCard(n);
frag.appendChild(c);
cards.push([c, n]);
}
gridEl.appendChild(frag);
for (const [c, n] of cards)
queueThumb(c, n);
};
side.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
view = b.dataset.view;
if (view === 'all')
folder = null;
closeIfNarrow();
renderFolders();
renderLibrary();
});
$('#sideNew').onclick = () => newMenu.classList.toggle('show');
newMenu.addEventListener('click', e => {
const b = e.target.closest('button');
if (!b)
return;
const k = b.dataset.new;
closeIfNarrow();
if (k === 'note')
newNote();
else if (k === 'template') {
view = 'templates';
renderFolders();
renderLibrary();
}
else if (k === 'folder') {
view = 'all';
newFolder();
}
else if (k === 'open')
$('#openBtn').click();
});
chipEl.onclick = () => newFolder();
$('#sideToggle').onclick = () => setOpen(!open);
$('#sideClose').onclick = () => setOpen(false);
$('#sideScrim').onclick = () => setOpen(false, false);
setOpen(open, false);
renderFolders();
renderLibrary();
})();