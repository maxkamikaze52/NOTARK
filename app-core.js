/* ================= Notark - core: globals, storage, library, editor shell ================= */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const STORE = 'notark.notes.v1';

const SIZES = [2,4,7,12];
const PEN_TYPES = [
  { id:'pen',    label:'Pen',    alpha:1,   jitter:0,  widthMul:1,   smooth:2, flat:false },
  { id:'pencil', label:'Pencil', alpha:.85, jitter:1.1,widthMul:.9,  smooth:0, flat:false },
  { id:'marker', label:'Marker', alpha:.45, jitter:0,  widthMul:2.4, smooth:3, flat:true  },
];
const SHAPES = [
  { id:'line',    label:'Line' },
  { id:'arrow',   label:'Arrow' },
  { id:'rect',    label:'Rectangle' },
  { id:'ellipse', label:'Ellipse' },
  { id:'triangle', label:'Triangle' },
  { id:'diamond', label:'Diamond' },
];

let notes = [];
let cur = null;
let page = 0;
let tool = 'pen';          // pen | highlighter | eraser | text | lasso | shape
let eraserMode = 'stroke'; // 'stroke' = whole line, 'pixel' = partial erase
let penType = 'pen';       // pen sub-type
let shapeType = 'line';    // shape sub-type
let highlighterOpacity = .35;
let color = '#1c1c1e';
let size = SIZES[1];
let drawing = false;
let undoStack = [], redoStack = [];
let lassoPath = null;      // in-progress lasso
let selected = [];         // selected strokes
let selectMode = 'lasso';  // select tool: lasso | rect

/* ---------- storage (local cache) ---------- */
// One-time migration: the app was renamed Nota -> Notark, which changed every
// localStorage key from "nota.*" to "notark.*". Copy any old keys across so
// existing notes/settings survive the rename. Runs once, then sets a flag.
function migrateLegacyKeys(){
  try{
    if(localStorage.getItem('notark.migrated')) return;
    const moved = [];
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(!k || !k.startsWith('nota.')) continue;
      const nk = 'notark.' + k.slice(5);
      if(localStorage.getItem(nk) === null){        // never clobber newer data
        localStorage.setItem(nk, localStorage.getItem(k));
        moved.push(k);
      }
    }
    localStorage.setItem('notark.migrated', '1');
    if(moved.length) console.log('Notark: migrated legacy keys ->', moved.join(', '));
  }catch(e){ /* private mode / quota: not fatal */ }
}

function load(){
  migrateLegacyKeys();
  try{ notes = JSON.parse(localStorage.getItem(STORE)) || []; }catch(e){ notes=[]; }
  // migrate: bake the smoothed geometry into every stored stroke once, so the
  // eraser always cuts exactly what is drawn (old strokes were re-smoothed on
  // every paint, so the visible line drifted away from its stored points).
  for(const n of notes) for(const p of (n.pages||[])) for(const st of (p.strokes||[])) bakeStroke(st);
}
// freeze a stroke's final geometry into st.pts (idempotent)
function bakeStroke(st){
  if(!st || st.baked || st.tool==='shape' || !st.pts || st.pts.length<3) return;
  // Apply the "flow" filter exactly once, here, and store the result in the
  // points. Doing it in paintStroke would re-smooth on every repaint and
  // progressively flatten the stroke into a jagged line.
  const def = PEN_TYPES.find(t=>t.id===(st.penType||'pen')) || PEN_TYPES[0];
  st.pts = flowPoints(st.pts, def.smooth);
  st.baked = true;
}
let dirHandle=null, pendingHandle=null, diskTimer=null, folder=null, moving=null, eraseSnap=null, lastErase=null, eraserSize=14;
let folders = JSON.parse(localStorage.getItem('notark.folders')||'[]');
let Q = 2;   // canvas pixels per page unit, picked per page size (see pickQ)
const dirty = new Set(), canDisk = !!window.showDirectoryPicker, ERASER_SIZES=[8,14,26];
// Canvas pixels per page unit. The cap keeps the bitmap under the iPad canvas
// memory limit; the user's quality setting scales that budget up or down.
const Q_BUDGET = { 1: 5e6, 2: 10e6, 3: 20e6, 4: 40e6 };
function qBudget(){ return Q_BUDGET[(S && S.quality) || 2] || 10e6; }
function pickQ(p){ Q = Math.max(1, Math.min(6, Math.sqrt(qBudget()/(p.w*p.h)))); }
const SWATCH = ['#1c1c1e','#ff3b30','#ff9500','#ffcc00','#34c759','#007aff','#af52de','#8e8e93'];
const PAPERS = ['blank','lined','grid','dots'];
let dashType = 'solid';
const DASHES = [['solid',[]],['dotted',[.01,2.2]],['dots',[.01,4]],['dashed',[4,3]],['long',[8,4]],['dashdot',[5,2.5,.01,2.5]]];
function applyDash(c, st, w){
  const d = (DASHES.find(x=>x[0]===(st.dash||'solid')) || DASHES[0])[1], u = Math.max(w, 2);
  c.setLineDash(d.map(v=>v*u));
  if(d.length && d[0] < .1) c.lineCap = 'round';
}
/* saved colors (persisted) */
let savedColors = null;
try{ savedColors = JSON.parse(localStorage.getItem('notark.colors')); }catch(e){}
if(!Array.isArray(savedColors) || !savedColors.length) savedColors = SWATCH.slice();
let colorEdit = null, colorDel = null;   // index being edited / showing the delete badge
const eraseMark = new Set();             // strokes that will be removed when the eraser is lifted
let resizing = null, lastText = null, textSize = 20, textFont = 'sans';
const TOOL_PX = { pen:4, pencil:4, marker:10, highlighter:12, shape:4 };   // final line width in page pixels
const widthMul = t => t==='highlighter' ? 3 : (PEN_TYPES.find(x=>x.id===t)||PEN_TYPES[0]).widthMul;
const FONTS = [
  {id:'sans',   label:'Sans',        css:'-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif'},
  {id:'serif',  label:'Serif',       css:'Georgia,"Times New Roman",serif'},
  {id:'mono',   label:'Mono',        css:'Menlo,Consolas,"Courier New",monospace'},
  {id:'hand',   label:'Handwriting', css:'Noteworthy,"Bradley Hand","Segoe Print","Comic Sans MS",cursive'},
  {id:'marker', label:'Marker',      css:'"Marker Felt","Chalkboard SE","Comic Sans MS",fantasy'},
  {id:'round',  label:'Rounded',     css:'"SF Pro Rounded","Arial Rounded MT Bold","Varela Round",sans-serif'},
];
const fontCss = id => (FONTS.find(f=>f.id===id)||FONTS[0]).css;
const imgCache = new Map();
function getImg(src){
  let im = imgCache.get(src);
  if(!im){
    im = new Image();
    im.onload = ()=>{ thumbs.clear(); if(cur && $('#editor').classList.contains('active')) renderPage(); else renderLibrary(); };
    im.src = src; imgCache.set(src, im);
  }
  return im;
}
let lsT;
function lsWrite(){ try{ localStorage.setItem(STORE, JSON.stringify(notes)); localStorage.setItem('notark.folders', JSON.stringify(folders)); }catch(e){ if(!dirHandle) toast('Browser storage is full — choose a save folder'); } }
const flushNow = ()=>{ clearTimeout(lsT); lsWrite(); };
addEventListener('pagehide', flushNow);
addEventListener('visibilitychange', ()=>{ if(document.hidden) flushNow(); });
function save(){
  clearTimeout(lsT); lsT = setTimeout(lsWrite, 1200);
  clearTimeout(diskTimer); diskTimer = setTimeout(flushDisk, 1200);
}
/* ---- device folder (File System Access API): notes autosave as .notark files, no server ---- */
const idb = (m, ...a) => new Promise((res, rej) => { const r = indexedDB.open('notark',1); r.onupgradeneeded = ()=>r.result.createObjectStore('h');
  r.onsuccess = ()=>{ const q = r.result.transaction('h', m==='get'?'readonly':'readwrite').objectStore('h')[m](...a); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }; r.onerror=()=>rej(r.error); });
const safeName = s => ((s||'Untitled').replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,80)) || 'Untitled';
const subdir = f => f ? dirHandle.getDirectoryHandle(safeName(f), {create:true}) : dirHandle;
function setDiskStatus(msg){
  const el = $('#diskStatus'); if(!el) return;
  el.textContent = msg || (dirHandle ? '● Autosaving to “'+dirHandle.name+'”' : pendingHandle ? 'Tap to reconnect your save folder' : canDisk ? 'Tap to choose a folder on this device for autosave' : 'Saved in this browser (use Chrome/Edge to save to a folder)');
}
async function rmFile(path){ try{ const [a,b] = path.includes('/') ? path.split('/') : [null,path]; await (a ? await dirHandle.getDirectoryHandle(a) : dirHandle).removeEntry(b); }catch(e){} }
async function flushDisk(){
  if(!dirHandle) return;
  for(const id of [...dirty]){
    dirty.delete(id); const n = notes.find(x=>x.id===id); if(!n) continue;
    try{
      const dup = notes.some(o=>o!==n && (o.folder||'')===(n.folder||'') && safeName(o.title)===safeName(n.title));
      const name = safeName(n.title) + (dup ? ' '+n.id.slice(-4) : '') + '.notark';
      const path = (n.folder ? safeName(n.folder)+'/' : '') + name;
      if(n.file && n.file !== path) await rmFile(n.file);
      const fh = await (await subdir(n.folder)).getFileHandle(name, {create:true});
      const w = await fh.createWritable(); await w.write(JSON.stringify({app:'Notark', version:1, note:n})); await w.close();
      n.file = path;
    }catch(e){ console.warn(e); setDiskStatus('Could not save — tap to reconnect folder'); dirHandle=null; return; }
  }
  try{ localStorage.setItem(STORE, JSON.stringify(notes)); }catch(e){} setDiskStatus();
}
async function scanDisk(){
  const read = async (h, f) => { for await (const [name, e] of h.entries()){
    if(e.kind==='directory' && !f){ if(!folders.includes(name)) folders.push(name); await read(e, name); }
    else if(e.kind==='file' && name.endsWith('.notark')){ try{
      const o = JSON.parse(await (await e.getFile()).text()), n = o.note||o; if(!n.pages||!n.id) continue;
      n.folder = f||''; n.file = (f?f+'/':'')+name;
      const i = notes.findIndex(x=>x.id===n.id); if(i<0) notes.push(n); else if((n.updated||0) > notes[i].updated) notes[i] = n;
    }catch(_){} } } };
  await read(dirHandle, '');
  for(const n of notes) for(const p of n.pages) for(const st of (p.strokes||[])) bakeStroke(st);
}
async function connectDisk(){
  if(!canDisk) return alert('This browser cannot save to a folder. Use Chrome or Edge on desktop. Notes still save in the browser, and the Save button downloads a .notark file.');
  try{
    if(pendingHandle && await pendingHandle.requestPermission({mode:'readwrite'})==='granted') dirHandle = pendingHandle;
    else dirHandle = await showDirectoryPicker({mode:'readwrite', id:'notark'});
    pendingHandle = null; await idb('put', dirHandle, 'dir'); await scanDisk();
    notes.forEach(n=>dirty.add(n.id)); save(); renderFolders(); renderLibrary(); setDiskStatus();
  }catch(e){}
}
async function restoreDisk(){
  try{ const h = canDisk && await idb('get','dir');
    if(h){ if(await h.queryPermission({mode:'readwrite'})==='granted'){ dirHandle=h; await scanDisk(); renderFolders(); renderLibrary(); } else pendingHandle=h; } }catch(e){}
  setDiskStatus();
}
/* ---- folders ---- */
/* in-app prompt (window.prompt is blocked in installed PWAs) */
function ask(title, value, cb){
  const sheet = $('#askSheet'), input = $('#askInput');
  $('#askTitle').textContent = title;
  input.value = value || '';
  sheet.classList.add('show');
  setTimeout(()=>{ input.focus(); input.select(); }, 60);
  const done = (ok)=>{
    sheet.classList.remove('show');
    input.onkeydown = null; $('#askOk').onclick = null; $('#askCancel').onclick = null;
    sheet.onclick = null;
    if(ok) cb(input.value.trim());
  };
  $('#askOk').onclick = ()=>done(true);
  $('#askCancel').onclick = ()=>done(false);
  sheet.onclick = (e)=>{ if(e.target === sheet) done(false); };
  input.onkeydown = (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); done(true); }
    if(e.key === 'Escape'){ e.preventDefault(); done(false); }
  };
}
function newFolder(){
  ask('New folder', '', (n)=>{
    if(!n) return;
    if(folders.includes(n)){ toast('A folder called "'+n+'" already exists'); return; }
    folders.push(n); folder = null; save(); renderFolders(); renderLibrary();
    toast('Folder "'+n+'" created');
  });
}
function moveNote(id){
  const n = notes.find(x=>x.id===id);
  ask('Move to folder (blank = none)', n.folder||'', (f)=>{
    n.folder = f; if(n.folder && !folders.includes(n.folder)) folders.push(n.folder);
    n.updated = Date.now(); dirty.add(n.id); save(); renderFolders(); renderLibrary();
  });
}
function drawPaper(c, w, h, kind){
  const dark = paperColor()!=='#ffffff', g = 50;
  c.setLineDash([]); c.fillStyle = paperColor(); c.fillRect(0,0,w,h);
  c.strokeStyle = dark ? '#3a3a3c' : '#d6dce8'; c.fillStyle = c.strokeStyle; c.lineWidth = 1.2;
  if(kind==='lined' || kind==='grid'){ c.beginPath(); for(let y=g*1.5; y<h; y+=g){ c.moveTo(0,y); c.lineTo(w,y); } if(kind==='grid') for(let x=g; x<w; x+=g){ c.moveTo(x,0); c.lineTo(x,h); } c.stroke(); }
  if(kind==='dots') for(let y=g; y<h; y+=g) for(let x=g; x<w; x+=g){ c.beginPath(); c.arc(x,y,2,0,7); c.fill(); }
}
function toast(t){ const d = document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),1400); }
/* ---- eraser helpers ---- */
function densify(pts, step){
  const out = [pts[0]];
  for(let i=1;i<pts.length;i++){ const u=pts[i-1], v=pts[i], n=Math.floor(Math.hypot(v.x-u.x,v.y-u.y)/step);
    for(let k=1;k<=n;k++) out.push({x:u.x+(v.x-u.x)*k/(n+1), y:u.y+(v.y-u.y)*k/(n+1)}); out.push(v); }
  return out;
}
function shapeHit(st, a, b, R){
  const s = st.pts[0], e = st.pts[st.pts.length-1], x0=Math.min(s.x,e.x), x1=Math.max(s.x,e.x), y0=Math.min(s.y,e.y), y1=Math.max(s.y,e.y);
  const P = (x,y)=>({x,y});
  const edges = st.shapeType==='poly' ? st.pts.map((q,i)=>[q, st.pts[(i+1)%st.pts.length]]) : /line|arrow/.test(st.shapeType) ? [[s,e]] : [[P(x0,y0),P(x1,y0)],[P(x1,y0),P(x1,y1)],[P(x1,y1),P(x0,y1)],[P(x0,y1),P(x0,y0)]];
  const n = Math.max(1, Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/4));
  for(let i=0;i<=n;i++){ const q = {x:a.x+(b.x-a.x)*i/n, y:a.y+(b.y-a.y)*i/n}; if(edges.some(([u,v])=>distToSeg(q,u,v) < R+st.size)) return true; }
  return false;
}
/* The drawn line is a quadratic curve through the midpoints of the stored points
   (see paintStroke). To cut a stroke exactly where the eraser touches it, we first
   sample that very curve densely; fragments are then sub-paths of the visible line,
   so the remaining pieces keep their exact shape instead of being re-interpolated. */
function curvePts(pts, step){
  const n = pts.length;
  if(n < 3) return densify(pts, step);
  const out = [{x:pts[0].x, y:pts[0].y}];
  let p0 = pts[0];
  for(let i=1;i<n-1;i++){
    const c = pts[i], e = {x:(c.x+pts[i+1].x)/2, y:(c.y+pts[i+1].y)/2};
    const m = Math.max(1, Math.ceil((Math.hypot(c.x-p0.x, c.y-p0.y) + Math.hypot(e.x-c.x, e.y-c.y)) / step));
    for(let k=1;k<=m;k++){ const t = k/m, u = 1-t;
      out.push({x:u*u*p0.x + 2*u*t*c.x + t*t*e.x, y:u*u*p0.y + 2*u*t*c.y + t*t*e.y}); }
    p0 = e;
  }
  out.push({x:pts[n-1].x, y:pts[n-1].y});
  return densify(out, step);
}
const curveCache = new WeakMap();      // never stored in the note itself
function strokeCurve(st){
  let e = curveCache.get(st);
  if(!e || e.src !== st.pts){
    const cv = st.dense ? st.pts : curvePts(st.pts, 2);
    let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
    for(const q of cv){ if(q.x<x0) x0=q.x; if(q.x>x1) x1=q.x; if(q.y<y0) y0=q.y; if(q.y>y1) y1=q.y; }
    e = {src:st.pts, cv, bb:[x0,y0,x1,y1]}; curveCache.set(st, e);
  }
  return e;
}
let rrRaf = 0;                          // coalesce page repaints to one per frame
function scheduleRender(){
  if(rrRaf) return;
  rrRaf = requestAnimationFrame(()=>{ rrRaf = 0; if(cur && $('#editor').classList.contains('active')) renderPage(); });
}
function eraseAt(a, b){
  const p = cur.pages[page], R = eraserSize, next = []; let changed = false;
  const whole = eraserMode==='stroke';
  const bx0 = Math.min(a.x,b.x)-R, bx1 = Math.max(a.x,b.x)+R, by0 = Math.min(a.y,b.y)-R, by1 = Math.max(a.y,b.y)+R;
  for(const st of p.strokes){
    if(st.tool==='image'){ next.push(st); continue; }          // images are removed with the select tool
    if(st.tool==='shape'){
      if(shapeHit(st,a,b,R)){
        if(whole){ if(!eraseMark.has(st)){ eraseMark.add(st); changed = true; } next.push(st); }
        else changed = true;
      } else next.push(st);
      continue;
    }
    const half = (st.size||4) * widthMul(st.tool==='highlighter' ? 'highlighter' : (st.penType||'pen')) / 2;
    const e = strokeCurve(st), bb = e.bb;
    if(bx1 < bb[0]-half || bx0 > bb[2]+half || by1 < bb[1]-half || by0 > bb[3]+half){ next.push(st); continue; }
    const rad = R + half, hit = q => distToSeg(q, a, b) < rad;
    if(whole){
      if(!eraseMark.has(st) && e.cv.some(hit)){ eraseMark.add(st); changed = true; }
      next.push(st); continue;
    }
    const frags = []; let run = [], cut = false;
    for(const q of e.cv){
      if(hit(q)){ cut = true; if(run.length>1) frags.push(run); run = []; }
      else run.push(q);
    }
    if(!cut){ next.push(st); continue; }
    if(run.length>1) frags.push(run);
    changed = true;
    for(const r of frags) next.push({...st, pts:r, baked:true, dense:true});
  }
  if(changed){ p.strokes = next; scheduleRender(); }
}
/* ---- selection ---- */
function selBox(){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const s of selected) for(const q of s.pts){ x0=Math.min(x0,q.x); y0=Math.min(y0,q.y); x1=Math.max(x1,q.x); y1=Math.max(y1,q.y); } return {x0,y0,x1,y1}; }
function inSel(q){ const b = selBox(); return q.x>b.x0-8 && q.x<b.x1+8 && q.y>b.y0-8 && q.y<b.y1+8; }
function delSel(){
  const p = cur.pages[page], before = p.strokes.slice(); p.strokes = p.strokes.filter(s=>!selected.includes(s));
  undoStack.push({type:'snap', page, before, after:p.strokes.slice()}); redoStack = []; selected = []; renderPage(); touch();
}

function fmtDate(ts){
  const d = new Date(ts), n = new Date();
  const same = d.toDateString() === n.toDateString();
  if(same) return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  return d.toLocaleDateString([], {month:'short', day:'numeric', year: d.getFullYear()!==n.getFullYear()?'numeric':undefined});
}

function deleteFolder(f){
  const cnt = notes.filter(n=>(n.folder||'')===f).length;
  if(!confirm('Delete folder "'+f+'"?'+(cnt?'\n'+cnt+' note(s) inside will move to All.':''))) return;
  notes.forEach(n=>{ if((n.folder||'')===f) n.folder=''; });
  folders = folders.filter(x=>x!==f);
  if(folder===f) folder = null;
  lsWrite(); renderFolders(); renderLibrary();
}
function escapeHtml(s){ return s.replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function deleteNote(id){
  const dn = notes.find(x=>x.id===id);
  if(!dn) return;
  if(!confirm('Delete "'+(dn.title||'Untitled')+'"?\nThis cannot be undone.')) return;
  const file = dn.file;
  notes = notes.filter(n=>n.id!==id); thumbs.delete(id);
  dirty.delete(id);
  lsWrite();                       // write immediately, don't wait for the debounce
  renderLibrary();
  if(file) rmFile(file);           // remove the .notark file on disk too
}
/* new pages copy the size of the page you are on; new notes use the saved default (A4) */
function newPage(){
  const r = cur && cur.pages && cur.pages[page], d = (typeof S!=='undefined' && S.defSize) || {w:1000, h:1414};
  return { w:r?r.w:d.w, h:r?r.h:d.h, strokes:[], texts:[] };
}

/* ---------- editor ---------- */
function openNote(id){
  cur = notes.find(n=>n.id===id); if(!cur) return;
  // follow the note into its folder, so closing it lands where the note lives
  // (and a new note made there stays in that folder) instead of the top level
  if(libView === 'all' && (cur.folder || '') !== (folder || '')){ folder = cur.folder || null; renderFolders(); }
  page = 0;
  undoStack = []; redoStack = [];   // never carry undo history across notes
  selected = []; lassoPath = null; drawing = false;
  $('#noteTitle').value = cur.title;
  $('#library').classList.remove('active');
  $('#editor').classList.add('active');
  clearLaser(); resetLive();
  layoutBar(); updatePageLabel();
}
function closeEditor(){
  if(cur && localStorage.getItem('notark.askSave') === '1') shareNotes([cur], cur.title || 'Note');   // optional "Save to Files" prompt
  opfsSaveAll();                       // silent safety-net snapshot before leaving the note
  $('#editor').classList.remove('active');
  $('#library').classList.add('active');
  cur = null; detCv.style.display = 'none'; clearLaser(); resetLive(); closeLib(); $('#stylePanel').classList.remove('show'); renderLibrary();
  maybeNagBackup();
}

/* ================= library: sidebar views, cards, folders, Files-app saving ================= */
const mkEl = (tag, cls, html) => { const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_MV = '<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v9H3z"/></svg>';
const LIB_TITLES = { all:'Your notes', recent:'Recent', templates:'Templates' };
let libView = 'all', sideOpen = false;
const wideScreen = () => innerWidth >= 700;
function setSide(v, remember = true){
  sideOpen = v; $('#library').classList.toggle('side-open', v);
  if(remember && wideScreen()) localStorage.setItem('notark.side', v ? '1' : '0');
}
setSide(wideScreen() && localStorage.getItem('notark.side') !== '0', false);
function showLib(v, f = null){ libView = v; folder = f; if(!wideScreen()) setSide(false, false); renderFolders(); renderLibrary(); }

/* thumbnails are drawn once per note version and reused, so re-rendering the library (sorting, theme, sidebar) stays instant */
const thumbs = new Map();
function thumbFor(n){
  const pc = paperColor(), t = thumbs.get(n.id);
  if(t && t.u === n.updated && t.pc === pc) return t.cv;
  const W = 300, H = 400, cv = t ? t.cv : document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), p = n.pages[0];
  x.fillStyle = pc; x.fillRect(0, 0, W, H);
  if(p){
    const k = Math.min(W / p.w, H / p.h);
    x.save(); x.scale(k, k); drawPaper(x, p.w, p.h, p.paper || n.paper || 'blank');
    for(const st of p.strokes) paintStroke(x, st);
    x.restore();
  }
  thumbs.set(n.id, { u:n.updated, pc, cv });
  return cv;
}

function folderCard(f){
  const c = notes.filter(n => (n.folder||'') === f).length;
  const card = mkEl('div', 'folder-card',
    `<div class="folder-shape"><div class="folder-tab"></div><div class="folder-body"><div class="folder-count">${c} ${c===1?'note':'notes'}</div></div></div>
     <div class="note-meta"><div class="note-name">${escapeHtml(f)}</div><div class="note-date">Folder</div></div>
     <button class="del" title="Delete folder">${ICON_X}</button>`);
  card.querySelector('.folder-shape').onclick = card.querySelector('.note-name').onclick = () => showLib('all', f);
  card.querySelector('.del').onclick = e => { e.stopPropagation(); deleteFolder(f); };
  return card;
}
function noteCard(n){
  const card = mkEl('div', 'note-card',
    `<div class="thumb"></div>
     <div class="note-meta"><div class="note-name">${escapeHtml(n.title||'Untitled')}</div><div class="note-date">${fmtDate(n.updated)}</div></div>
     <button class="mv" title="Move to folder">${ICON_MV}</button><button class="del" title="Delete">${ICON_X}</button>`);
  const th = card.querySelector('.thumb'); th.appendChild(thumbFor(n)); th.onclick = () => openNote(n.id);
  card.querySelector('.mv').onclick = e => { e.stopPropagation(); moveNote(n.id); };
  card.querySelector('.del').onclick = e => { e.stopPropagation(); deleteNote(n.id); };
  return card;
}
function drawTemplates(){
  const g = $('#tplGrid'); g.innerHTML = '';
  for(const t of [...(typeof TPL !== 'undefined' ? TPL : [{ id:'blank', name:'Blank' }]), ...(typeof customTpl !== 'undefined' ? customTpl : [])]){
    const b = mkEl('button', 'tpl-card', '<canvas width="200" height="280"></canvas><span></span>');
    const x = b.firstChild.getContext('2d'); x.scale(.2, .2); drawPaper(x, 1000, 1400, t.id);
    b.lastChild.textContent = t.name; b.onclick = () => newNoteWith(t.id); g.appendChild(b);
  }
}
function newNoteWith(paper){
  const t = Date.now(), n = { id:uid(), title:'', created:t, updated:t, pages:[{ ...newPage(), paper }], folder:folder || '', paper };
  notes.push(n); dirty.add(n.id); save(); openNote(n.id);
}
const newNote = () => newNoteWith('blank');

function renderFolders(){          // the "back / + Note here" chips shown inside a folder
  const row = $('#folderRow'); row.innerHTML = '';
  row.style.display = folder === null ? 'none' : '';
  if(folder === null) return;
  const back = mkEl('button', 'chip back', '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>' + escapeHtml(folder));
  back.onclick = () => showLib('all');
  const add = mkEl('button', 'chip add', '+ Note here'); add.onclick = newNote;
  row.append(back, add);
}
function renderLibrary(){
  const top = folder === null, sort = $('#sortSeg .on').dataset.sort;
  $('#library').className = $('#library').className.replace(/\bv-\w+/g, '').trim() + ' v-' + libView;
  $('.lib-title').textContent = libView === 'all' && !top ? folder : LIB_TITLES[libView];
  document.querySelectorAll('#libSide [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === libView && !(libView === 'all' && !top)));
  const sf = $('#sideFolders'); sf.innerHTML = '';
  for(const f of folders){
    const b = mkEl('button', 'side-folder' + (libView === 'all' && folder === f ? ' on' : '')); b.textContent = f;
    b.onclick = () => showLib('all', f); sf.appendChild(b);
  }
  const nf = mkEl('button', 'side-folder', '+ New folder'); nf.onclick = () => { showLib('all'); newFolder(); }; sf.appendChild(nf);
  if(libView === 'templates') return drawTemplates();

  const list = libView === 'recent' ? [...notes].sort((a, b) => b.updated - a.updated).slice(0, 30)
    : notes.filter(n => top || (n.folder||'') === folder).sort((a, b) => sort === 'name'
        ? (a.title||'Untitled').localeCompare(b.title||'Untitled') : b.updated - a.updated);
  $('#noteCount').textContent = libView === 'recent' ? 'Last edited' : notes.length + (notes.length === 1 ? ' note' : ' notes');
  $('#emptyState').classList.toggle('show', !notes.length);
  $('#newFolderChip').style.display = libView === 'all' && top ? '' : 'none';
  const grid = $('#noteGrid'); grid.innerHTML = '';
  if(libView === 'all' && top) for(const f of folders) grid.appendChild(folderCard(f));
  for(const n of list) grid.appendChild(noteCard(n));
}

/* ---- saving to the Files app (iOS share sheet -> "Save to Files"; plain download elsewhere) ---- */
async function shareNotes(list, label){
  if(!list.length) return false;
  const used = new Set(), files = list.map(n => {
    let name = safeName(n.title); if(used.has(name)) name += ' ' + n.id.slice(-4); used.add(name);
    return new File([JSON.stringify({ app:'Notark', version:1, note:n })], name + '.notark', { type:'application/json' });
  });
  try{ if(navigator.canShare && navigator.canShare({ files })){ await navigator.share({ files, title:label || 'Notark' }); return true; } }
  catch(e){ if(e && e.name === 'AbortError') return false; }
  if(files.length > 1){ exportAll(); return true; }
  const a = mkEl('a'); a.href = URL.createObjectURL(files[0]); a.download = files[0].name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
function markBackup(){ localStorage.setItem('notark.backupAt', Date.now()); $('#backupNag').classList.remove('show'); sideStatus(); }
async function saveAllToFiles(){ if(await shareNotes(notes, 'Notark notes')) markBackup(); }
async function sideStatus(){
  const el = $('#sideStore'); if(!el) return;
  let p = false; try{ p = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); }catch(e){}
  const lb = typeof lastBackup === 'function' ? lastBackup() : 0;
  el.textContent = (p ? 'Browser storage is protected. ' : 'Safari may clear browser storage if the app goes unused. ') + (lb ? 'Last saved to Files: ' + fmtDate(lb) + '.' : 'Not saved to Files yet.');
}
/* import: many files at once; single notes and "Export all" bundles; the same note keeps whichever copy is newer */
async function importFiles(files){
  let added = 0, updated = 0, kept = 0, bad = 0, last = null, count = 0;
  for(const f of files){
    try{
      const o = JSON.parse(await f.text());
      for(const x of (o.folders || [])) if(x && !folders.includes(x)) folders.push(x);
      for(const n of (Array.isArray(o.notes) ? o.notes : [o.note || o])){
        if(!n || !Array.isArray(n.pages)){ bad++; continue; }
        count++; n.id = n.id || uid(); n.updated = n.updated || Date.now();
        for(const p of n.pages) for(const st of (p.strokes || [])) bakeStroke(st);
        const i = notes.findIndex(x => x.id === n.id);
        if(i < 0){ notes.push(n); added++; } else if(n.updated > (notes[i].updated || 0)){ notes[i] = n; updated++; } else { kept++; continue; }
        dirty.add(n.id); last = n; if(n.folder && !folders.includes(n.folder)) folders.push(n.folder);
      }
    }catch(e){ bad++; }
  }
  thumbs.clear(); save(); renderFolders(); renderLibrary();
  if(files.length === 1 && count === 1 && last) openNote(last.id);
  else toast(added + ' added' + (updated ? ', ' + updated + ' updated' : '') + (kept ? ', ' + kept + ' already up to date' : '') + (bad ? ', ' + bad + ' could not be read' : ''));
}

/* ---- wiring (the sidebar parts run now; the file parts run after every script has loaded so they win over older handlers) ---- */
document.querySelectorAll('#libSide [data-view]').forEach(b => b.onclick = () => showLib(b.dataset.view));
$('#sideToggle').onclick = () => setSide(!sideOpen);
$('#sideClose').onclick = () => setSide(false);
$('#sideScrim').onclick = () => setSide(false, false);
$('#newFolderChip').onclick = () => newFolder();
$('#sideNew').onclick = () => $('#sideNewMenu').classList.toggle('show');
$('#sideNewMenu').onclick = e => {
  const k = e.target.closest('button'); if(!k) return;
  if(!wideScreen()) setSide(false, false);
  ({ note:newNote, template:() => showLib('templates', folder), folder:() => { showLib('all'); newFolder(); }, open:() => $('#fileInput').click() })[k.dataset.new]();
};
$('#sideAsk').checked = localStorage.getItem('notark.askSave') === '1';
$('#sideAsk').onchange = e => localStorage.setItem('notark.askSave', e.target.checked ? '1' : '0');
$('#sideSaveAll').onclick = saveAllToFiles;
$('#sideImport').onclick = () => $('#fileInput').click();
addEventListener('load', () => {
  $('#saveBtn').onclick = () => { if(cur) shareNotes([cur], cur.title || 'Note'); }; $('#saveBtn').title = 'Save to Files';
  $('#nagExport').onclick = saveAllToFiles;
  const old = $('#fileInput'), inp = old.cloneNode(true);        // a clone has none of the older single-file handlers
  inp.multiple = true; inp.removeAttribute('accept'); old.replaceWith(inp);
  inp.onchange = e => { const f = [...e.target.files]; e.target.value = ''; importFiles(f); };
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().then(sideStatus, sideStatus); else sideStatus();
});
