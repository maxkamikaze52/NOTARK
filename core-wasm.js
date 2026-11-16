/* ==========================================================================
   notark-core bridge — Rust/WASM hot paths for Notark.
   --------------------------------------------------------------------------
   The module (rust-core/src/lib.rs) is built with:
       cargo build --release --target wasm32-unknown-unknown
   and served as notark-core.wasm next to this file. No wasm-bindgen: the ABI is
   hand-written, so there is no glue to rebuild and nothing to install.

   Everything here FAILS OPEN. If the fetch fails, if WASM is unavailable, or if
   anything throws, the JS implementations in app-draw.js / pencil-saber.js run
   instead. Rust is an accelerator, never a requirement.
   ========================================================================== */

const NotarkCore = {
  ready: false,
  mod: null,
  mem: null,
  base: 0,
  info: 'not loaded',
};

/* scratch() returns an absolute address in linear memory already. */
function coreFloat(addr, n) {
  return new Float32Array(NotarkCore.mem.buffer, addr, n);
}
function coreBytes(addr, n) {
  return new Uint8Array(NotarkCore.mem.buffer, addr, n);
}
/* alloc(bytes) returns an absolute address in linear memory. */
function coreAlloc(bytes) {
  return NotarkCore.mod.alloc(bytes) >>> 0;
}

async function coreInit(url) {
  if (NotarkCore.ready) return true;
  if (typeof WebAssembly === 'undefined') {
    NotarkCore.info = 'no WebAssembly in this browser';
    return false;
  }
  try {
    const res = await fetch(url || 'notark-core.wasm', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const bytes = await res.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const mod = instance.exports;
    // `heap_base` returns a pointer into the module's linear memory
    NotarkCore.mod = mod;
    NotarkCore.mem = mod.memory;
    NotarkCore.base = 0;
    NotarkCore.ver = mod.version ? mod.version() : 0;
    NotarkCore.ready = true;
    NotarkCore.info = 'wasm v' + NotarkCore.ver + ', ' + Math.round(bytes.byteLength / 1024) + ' KB';
  } catch (e) {
    NotarkCore.ready = false;
    NotarkCore.info = 'unavailable: ' + e.message;
  }
  return NotarkCore.ready;
}

/* ---- bbox: [minX, minY, maxX, maxY] for n (x,y) pairs ---- */
function coreBBox(pts, n) {
  const M = NotarkCore.mod;
  const inOff = coreAlloc(n * 8);
  const outOff = coreAlloc(16);
  const fb = coreFloat(inOff, n * 2);
  for (let i = 0; i < n; i++) {
    fb[i * 2] = pts[i].x;
    fb[i * 2 + 1] = pts[i].y;
  }
  M.bbox(inOff, n, outOff);
  const o = coreFloat(outOff, 4);
  return { x0: o[0], y0: o[1], x1: o[2], y1: o[3] };
}

/* ---- RDP: returns a Uint8Array of keep-flags, or null ---- */
function coreRDP(pts, n, eps2) {
  const M = NotarkCore.mod;
  const inOff = coreAlloc(n * 8);
  const fb = coreFloat(inOff, n * 2);
  for (let i = 0; i < n; i++) {
    fb[i * 2] = pts[i].x;
    fb[i * 2 + 1] = pts[i].y;
  }
  const flagOff = coreAlloc(n + 4);
  const kept = M.rdp(inOff, n, eps2, flagOff);
  if (!kept) return null;
  const flags = new Uint8Array(n);
  flags.set(coreBytes(flagOff, n));
  return flags;
}

/* ---- pencil grain tile: 8-bit alpha into a canvas ---- */
function corePencilTile(px, seed, canvas, ctx) {
  const M = NotarkCore.mod;
  const off = coreAlloc(px * px + 4);
  M.pencil_mask(px, px, seed, off);
  const alpha = coreBytes(off, px * px);
  const img = ctx.createImageData(px, px);
  const d = img.data;
  for (let i = 0, j = 0; i < px * px; i++, j += 4) {
    d[j] = d[j + 1] = d[j + 2] = 255;
    d[j + 3] = alpha[i];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

window.NotarkCore = NotarkCore;
window.coreInit = coreInit;
window.coreBBox = coreBBox;
window.coreRDP = coreRDP;
window.corePencilTile = corePencilTile;
