"use strict";
/* ================= Notark safe copy =================
   A second, independent copy of everything, kept in IndexedDB (far bigger and
   more durable than localStorage, which holds ~5 MB and is what Safari clears first).

   - Every change to your notes is mirrored here a moment after it is saved.
   - Templates, saved drawings, pens, colours and settings are mirrored too.
   - On start-up anything missing from (or older in) localStorage is restored from here.
   - Deleted notes go to a trash instead of vanishing, and earlier versions of
     each note are kept, so a slip ("Clear page", delete) can be undone.
   Both are listed under "Recover notes" in the sidebar. */
(() => {
if (!window.indexedDB)
return;
const DB_NAME = 'notark-data';
const HIST_GAP = 30 * 60 * 1000;       // at most one saved version per note per 30 min
const HIST_KEEP = 6;                   // versions kept per note
const KEEP_DAYS = 60;                  // trash / old versions are cleared after this
const LS_KEYS = ['notark.tpl', 'notark.stamps', 'notark.pens', 'notark.colors', 'notark.settings'];

let db = null, ready = false, busy = false, again = false, lastSafe = 0, timer = 0;
const sigs = new Map();                // note id -> signature of what is stored in the safe copy
const lastHist = new Map();
const kvLast = new Map();

const pad = t => String(t).padStart(15, '0');
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('aborted')); });
const sig = n => {
let c = 0;
for (const p of n.pages || [])
c += (p.strokes ? p.strokes.length : 0) + (p.texts ? p.texts.length : 0);
return [n.updated, n.folder || '', n.title || '', (n.pages || []).length, c].join('|');
};
const fix = n => { for (const p of n.pages || [])
for (const st of p.strokes || [])
bakeStroke(st); };

const open = () => new Promise((res, rej) => {
const r = indexedDB.open(DB_NAME, 1);
r.onupgradeneeded = () => {
const d = r.result;
d.createObjectStore('notes', { keyPath: 'id' });
d.createObjectStore('trash', { keyPath: 'id' });
d.createObjectStore('hist');
d.createObjectStore('kv');
};
r.onsuccess = () => res(r.result);
r.onerror = () => rej(r.error);
r.onblocked = () => rej(new Error('IndexedDB blocked'));
});

/* ---- keep the safe copy up to date ---- */
const _lsWrite = lsWrite;
lsWrite = function () { _lsWrite(); schedule(); };
function schedule() { clearTimeout(timer); timer = setTimeout(snapshot, 400); }

async function snapshot() {
if (!db || !ready)
return;
if (busy) {
again = true;
return;
}
busy = true;
try {
const list = notes.slice(), now = Date.now();
const changed = list.filter(n => sigs.get(n.id) !== sig(n));
const alive = new Set(list.map(n => n.id));
const gone = [...sigs.keys()].filter(id => !alive.has(id));
if (changed.length || gone.length) {
const tx = db.transaction(['notes', 'hist', 'trash'], 'readwrite');
const sN = tx.objectStore('notes'), sH = tx.objectStore('hist'), sT = tx.objectStore('trash');
const fin = done(tx), stamp = new Map();
for (const n of changed) {
const g = sN.get(n.id);
g.onsuccess = () => {
const old = g.result;
if (old && now - (lastHist.get(n.id) || 0) > HIST_GAP) {      // keep the previous version before overwriting it
sH.put(old, n.id + '@' + pad(now));
lastHist.set(n.id, now);
const kq = sH.getAllKeys(IDBKeyRange.bound(n.id + '@', n.id + '@\uffff'));
kq.onsuccess = () => { const ks = kq.result; for (const k of ks.slice(0, Math.max(0, ks.length - HIST_KEEP)))
sH.delete(k); };
}
sN.put(n);
stamp.set(n.id, sig(n));
};
}
for (const id of gone) {                                          // deleted notes go to the trash
const g = sN.get(id);
g.onsuccess = () => { if (g.result) {
sT.put(Object.assign({}, g.result, { deletedAt: now }));
sN.delete(id);
} };
}
await fin;
for (const [id, s] of stamp)
sigs.set(id, s);
for (const id of gone)
sigs.delete(id);
}
snapshotKV();
lastSafe = Date.now();
paintStatus();
}
catch (e) {
console.warn('Notark safe copy failed', e);
}
finally {
busy = false;
if (again) {
again = false;
schedule();
}
}
}
function snapshotKV() {
if (!db || !ready)
return;
const put = new Map();
for (const k of LS_KEYS) {
let v = null;
try {
v = localStorage.getItem(k);
}
catch (e) { }
if (v !== null && kvLast.get(k) !== v)
put.set(k, v);
}
const f = JSON.stringify(folders);
if (kvLast.get('folders') !== f)
put.set('folders', f);
if (!put.size)
return;
try {
const tx = db.transaction('kv', 'readwrite'), s = tx.objectStore('kv');
for (const [k, v] of put)
s.put(v, k);
tx.oncomplete = () => { for (const [k, v] of put)
kvLast.set(k, v); };
}
catch (e) { }
}
function paintStatus() {
const el = document.getElementById('sideSafe');
if (!el || !lastSafe)
return;
el.textContent = 'Safe copy: ' + notes.length + (notes.length === 1 ? ' note' : ' notes') + ', updated ' + fmtDate(lastSafe) + '.';
}

/* ---- start-up: clean out old trash, then restore whatever localStorage lost ---- */
async function purge() {
const cutoff = Date.now() - KEEP_DAYS * 864e5;
const tx = db.transaction(['trash', 'hist'], 'readwrite');
const ts = tx.objectStore('trash'), hs = tx.objectStore('hist');
const a = ts.getAll();
a.onsuccess = () => { for (const r of a.result)
if ((r.deletedAt || 0) < cutoff)
ts.delete(r.id); };
const k = hs.getAllKeys();
k.onsuccess = () => { for (const key of k.result) {
const t = parseInt(String(key).split('@')[1], 10);
if (t && t < cutoff)
hs.delete(key);
} };
await done(tx);
}
async function restoreKV() {
const store = () => db.transaction('kv').objectStore('kv');
const keys = await rq(store().getAllKeys());
let need = false;
for (const k of keys) {
const v = await rq(store().get(k));
kvLast.set(k, v);
if (k === 'folders') {
if (localStorage.getItem('notark.folders') === null) {
try {
for (const f of JSON.parse(v))
if (!folders.includes(f))
folders.push(f);
}
catch (e) { }
}
continue;
}
if (LS_KEYS.includes(k) && localStorage.getItem(k) === null) {
try {
localStorage.setItem(k, v);
need = true;
}
catch (e) { }
}
}
// templates, saved drawings and settings are read once at start-up, so reload (once) to pick them up
if (need && !sessionStorage.getItem('notark.kvReload')) {
sessionStorage.setItem('notark.kvReload', '1');
location.reload();
return true;
}
return false;
}
async function recoverNotes() {
const all = await rq(db.transaction('notes').objectStore('notes').getAll());
let added = 0, newer = 0;
for (const r of all) {
if (!r || !r.id || !Array.isArray(r.pages))
continue;
sigs.set(r.id, sig(r));
const i = notes.findIndex(x => x.id === r.id);
if (i < 0) {
fix(r);
notes.push(r);
added++;
}
else if ((r.updated || 0) > (notes[i].updated || 0) && !(cur && cur.id === r.id)) {
fix(r);
notes[i] = r;
newer++;
}
if (r.folder && !folders.includes(r.folder))
folders.push(r.folder);
}
if (added)       // drop the empty "Welcome" note that a wiped start-up creates
notes = notes.filter(n => !(n.title === 'Welcome to Nota' && !sigs.has(n.id) && (n.pages || []).every(p => !(p.strokes && p.strokes.length) && !(p.texts && p.texts.length))));
if (added || newer) {
_lsWrite();
thumbs.clear();
renderFolders();
renderLibrary();
toast('Recovered ' + (added + newer) + (added + newer === 1 ? ' note' : ' notes') + ' from the safe copy');
}
}

/* ---- "Recover notes": deleted notes and earlier versions ---- */
function restore(it) {
const n = JSON.parse(JSON.stringify(it.note));
delete n.deletedAt;
if (it.kind === 'version' || notes.some(x => x.id === n.id)) {     // versions come back as a copy, never over the current note
n.id = uid();
n.title = (n.title || 'Untitled') + ' (restored)';
}
else {
try {
db.transaction('trash', 'readwrite').objectStore('trash').delete(n.id);
}
catch (e) { }
}
n.updated = Date.now();
fix(n);
notes.push(n);
if (n.folder && !folders.includes(n.folder))
folders.push(n.folder);
dirty.add(n.id);
save();
thumbs.clear();
renderFolders();
renderLibrary();
toast('Restored “' + (n.title || 'Untitled') + '”');
}
async function openRecovery() {
if (!db)
return toast('The safe copy is not available in this browser');
const hs = db.transaction('hist').objectStore('hist');
const [tr, hk, hv] = await Promise.all([rq(db.transaction('trash').objectStore('trash').getAll()), rq(hs.getAllKeys()), rq(hs.getAll())]);
const items = [];
for (const n of tr)
items.push({ kind: 'deleted', note: n, at: n.deletedAt || n.updated || 0 });
hv.forEach(n => items.push({ kind: 'version', note: n, at: n.updated || 0 }));
items.sort((a, b) => b.at - a.at);
openSheet('Recover notes', body => {
const info = mk('div', 'xrow');
info.appendChild(mk('b', '', items.length ? 'Tap one to bring it back. Earlier versions come back as a copy.' : 'Nothing to recover yet. Deleted notes and earlier versions of your notes show up here.'));
body.appendChild(info);
for (const it of items.slice(0, 80)) {
const b = mk('button', 'xbtn', (it.note.title || 'Untitled') + '  ·  ' + (it.kind === 'deleted' ? 'deleted ' : 'version from ') + fmtDate(it.at));
b.onclick = () => { closeSheet(); restore(it); };
body.appendChild(b);
}
});
}
const side = document.getElementById('sideImport');
if (side) {
const b = document.createElement('button');
b.className = 'side-item';
b.id = 'sideRecover';
b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>Recover notes';
b.onclick = openRecovery;
side.after(b);
const st = document.getElementById('sideStore');
if (st) {
const n = document.createElement('div');
n.className = 'side-note';
n.id = 'sideSafe';
st.after(n);
}
}

/* flush as soon as the app is backgrounded */
const flush = () => { clearTimeout(timer); snapshot(); snapshotKV(); };
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden)
flush(); });

(async () => {
try {
db = await open();
await purge();
if (await restoreKV())
return;
await recoverNotes();
}
catch (e) {
console.warn('Notark safe copy: restore skipped', e);
}
if (!db)
return;
ready = true;
await snapshot();
setInterval(snapshotKV, 30000);
})();
})();
