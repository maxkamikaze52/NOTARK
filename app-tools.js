const _$=(e=>t=>e[t]||(e[t]=$(t)))({}),_tb=document.querySelectorAll(".tool[data-tool]"),_cl=e=>JSON.parse(JSON.stringify(e)),_bbox=e=>{let t=1e9,a=1e9,o=-1e9,n=-1e9;for(const r of e)t=Math.min(t,r.x),a=Math.min(a,r.y),o=Math.max(o,r.x),n=Math.max(n,r.y);return[t,a,o,n]};function _editText(e,t){const a=cur&&cur.pages[page];a&&lastText&&a.texts.includes(lastText)&&(lastText[e]=t,renderTexts(),touch())}function updatePageLabel(){$("#pageLabel").textContent=`${page+1} / ${cur.pages.length}`}function goPage(e){const t=page+e;t<0||t>=cur.pages.length||(page=t,selected=[],clearLaser(),resizeCanvas(),renderPage(),updatePageLabel())}function addPage(){cur.pages.push(newPage()),page=cur.pages.length-1,resizeCanvas(),renderPage(),updatePageLabel(),touch()}function touch(){cur&&(cur.updated=Date.now(),dirty.add(cur.id),save())}let hue=0,sat=0,val=.11;const svCanvas=$("#svCanvas"),svCtx=svCanvas.getContext("2d");function hsvToRgb(e,t,a){e/=360;const o=Math.floor(6*e),n=6*e-o,r=a*(1-t),s=a*(1-n*t),l=a*(1-(1-n)*t);return[[a,l,r],[s,a,r],[r,a,l],[r,s,a],[l,r,a],[a,r,s]][o%6].map(e=>Math.round(255*e))}function rgbToHex(e,t,a){return"#"+[e,t,a].map(e=>e.toString(16).padStart(2,"0")).join("")}function hexToHsv(e){const t=parseInt(e.slice(1,7),16),a=(t>>16&255)/255,o=(t>>8&255)/255,n=(255&t)/255,r=Math.max(a,o,n),s=r-Math.min(a,o,n);let l=0;return s&&(l=60*(r===a?(o-n)/s%6:r===o?(n-a)/s+2:(a-o)/s+4),l<0&&(l+=360)),{h:l,s:r?s/r:0,v:r}}function drawSV(){const e=svCanvas.width,t=svCanvas.height,[a,o,n]=hsvToRgb(hue,1,1),r=svCtx.createLinearGradient(0,0,e,0);r.addColorStop(0,"#fff"),r.addColorStop(1,`rgb(${a},${o},${n})`),svCtx.fillStyle=r,svCtx.fillRect(0,0,e,t);const s=svCtx.createLinearGradient(0,0,0,t);s.addColorStop(0,"rgba(0,0,0,0)"),s.addColorStop(1,"#000"),svCtx.fillStyle=s,svCtx.fillRect(0,0,e,t),updateSVCursor()}function updateSVCursor(){const e=_$("#svCursor").style;e.left=100*sat+"%",e.top=100*(1-val)+"%",e.background=color}function applyColor(){if(color=rgbToHex(...hsvToRgb(hue,sat,val)),_$("#colorPreview").style.background=color,updateSVCursor(),null!==colorEdit&&colorEdit<savedColors.length){savedColors[colorEdit]=color,persistColors();const e=_$("#swatches").querySelector(`[data-i="${colorEdit}"]`);e&&(e.style.background=color)}}function pickFromSV(e){const t=svCanvas.getBoundingClientRect();sat=clamp((e.clientX-t.left)/t.width,0,1),val=1-clamp((e.clientY-t.top)/t.height,0,1),applyColor()}function buildStylePanel(){updateSizeUI();const e=(e,t)=>{const a=$(e);return a&&(a.style.display=t?"flex":"none"),a},t=(t,a,o,n,r)=>{const s=e(t,r);if(s){s.innerHTML="";for(const[e,t,r]of a){const a=document.createElement("button");a.className="sh"+(e===o?" on":""),a.textContent=t,r&&(a.style.fontFamily=r),a.onclick=()=>{n(e),buildStylePanel()},s.appendChild(a)}}};t("#shapeTypes",SHAPES.map(e=>[e.id,e.label]),shapeType,e=>shapeType=e,"shape"===tool),t("#eraserTypes",[["stroke","Erase line"],["pixel","Erase part"]],eraserMode,e=>eraserMode=e,"eraser"===tool),t("#fontTypes",FONTS.map(e=>[e.id,e.label,e.css]),textFont,e=>{textFont=e,_editText("font",e)},"text"===tool),t("#selectTypes",[["lasso","Lasso"],["rect","Rectangle"]],selectMode,e=>selectMode=e,"lasso"===tool);const a=e("#hlOpacity","highlighter"===tool),o=$("#hlRange");if(a&&o&&(o.value=Math.round(100*highlighterOpacity)),renderSwatches(),e("#swatches",!("eraser"===tool||"lasso"===tool||"laser"===tool)),e("#sizes","lasso"!==tool&&"laser"!==tool),e("#snapRow",["pen","pencil","marker","highlighter"].includes(tool))){const e=$("#snapBtn");e.classList.toggle("on",shapeSnap),e.textContent="Snap to shapes: "+(shapeSnap?"on":"off")}e("#laserRow","laser"===tool)&&($("#laserRange").value=laserLife/1e3,$("#laserVal").textContent=laserLife/1e3+" s"),syncPicker(color),positionPanel()}function penIcon(e){const t='<path d="M3.2 20.8l1.1-4.2 9.9-9.9 3.1 3.1-9.9 9.9-4.2 1.1z"/><path d="M15.1 5.8l1.6-1.6a1.6 1.6 0 0 1 2.3 0l.8.8a1.6 1.6 0 0 1 0 2.3l-1.6 1.6-3.1-3.1z"/><path d="M3.2 20.8l1.1-4.2 3.1 3.1-4.2 1.1z" class="ic-dark"/>';return'<svg viewBox="0 0 24 24" class="ic-fill">'+({pen:t,pencil:t+'<path d="M6.5 15.5l2 2M8.5 13.5l2 2" class="ic-stroke"/>',marker:'<path d="M5.5 13.5l6-6 4.5 4.5-6 6H5.5v-4.5z"/><path d="M12.5 6.5l2.2-2.2a1.4 1.4 0 0 1 2 0l2.5 2.5a1.4 1.4 0 0 1 0 2l-2.2 2.2-4.5-4.5z"/><rect x="3" y="19.5" width="18" height="2.2" rx="1.1" class="ic-dark"/>'}[e]||"")+"</svg>"}function setTool(e){colorEdit=colorDel=null,tool!==e?("laser"===tool&&endLaser(),"lasso"===tool&&(selected=[],lassoPath=null,moving=null),tool=e,cur&&renderPage(),_tb.forEach(t=>t.classList.toggle("on",t.dataset.tool===e)),$("#stylePanel").classList.remove("show"),updateCursor()):$("#stylePanel").classList.toggle("show")&&buildStylePanel()}function updateCursor(){canvas.style.cursor="eraser"===tool?"none":"text"===tool?"text":"crosshair"}function exportPNG(){const e=cur.pages[page],t=document.createElement("canvas"),a=t.getContext("2d");t.width=e.w,t.height=e.h,drawPaper(a,e.w,e.h,cur.paper);for(const t of e.strokes)paintStroke(a,t);for(const t of e.texts)a.fillStyle=t.color,a.font=`${t.size}px ${fontCss(t.font)}`,t.text.split("\n").forEach((e,o)=>a.fillText(e,t.x,t.y+t.size+o*t.size*1.35));const o=document.createElement("a");o.download=(cur.title||"note")+".png",o.href=t.toDataURL("image/png"),o.click()}svCanvas.style.touchAction="none",svCanvas.addEventListener("pointerdown",e=>{svCanvas.setPointerCapture(e.pointerId),pickFromSV(e)}),svCanvas.addEventListener("pointermove",e=>{e.buttons&&pickFromSV(e)}),$("#hueSlider").addEventListener("input",e=>{hue=+e.target.value,drawSV(),applyColor()}),$("#newNoteBtn").onclick=newNote,$("#newFolderBtn").onclick=newFolder,$("#openBtn").onclick=()=>$("#fileInput").click(),$("#themeBtn").onclick=toggleTheme,$("#paperBtn").onclick=togglePaper,$("#shareBtn").onclick=exportPNG,$("#undoBtn").onclick=undo,$("#redoBtn").onclick=redo,$("#prevPage").onclick=()=>goPage(-1),$("#nextPage").onclick=()=>goPage(1),$("#addPage").onclick=addPage,$("#hlRange").addEventListener("input",e=>{highlighterOpacity=+e.target.value/100}),$("#noteTitle").addEventListener("input",e=>{cur&&(cur.title=e.target.value,touch())}),_tb.forEach(e=>e.onclick=()=>setTool(e.dataset.tool)),$("#sortSeg").addEventListener("click",e=>{const t=e.target.closest("button");t&&($("#sortSeg .on").classList.remove("on"),t.classList.add("on"),renderLibrary())});let _rz=0;function invertHex(e){let t=e.replace("#","");return 3===t.length&&(t=t.replace(/./g,"$&$&")),rgbToHex(...[0,2,4].map(e=>255-parseInt(t.slice(e,e+2),16)))}function adaptColorsToPaper(){}function togglePaper(){cur&&(cur.paper=PAPERS[(PAPERS.indexOf(cur.paper||"blank")+1)%PAPERS.length],touch(),renderPage(),toast("Paper: "+cur.paper))}addEventListener("resize",()=>{_rz||(_rz=requestAnimationFrame(()=>{_rz=0,cur&&layoutBar()}))}),addEventListener("orientationchange",()=>setTimeout(()=>{cur&&layoutBar()},300)),document.addEventListener("keydown",e=>{const t=e.target,a=(e.key||"").toLowerCase();(e.metaKey||e.ctrlKey)&&"z"===a&&"INPUT"!==t.tagName&&"TEXTAREA"!==t.tagName?(e.preventDefault(),e.shiftKey?redo():undo()):"backspace"!==a&&"delete"!==a||!selected.length||!cur||t.isContentEditable||"INPUT"===t.tagName||(e.preventDefault(),delSel())});let themePref="auto";try{themePref=localStorage.getItem("notark.theme")||"auto"}catch(e){}const sysDark=matchMedia("(prefers-color-scheme: dark)");function applyTheme(e){const t="dark"===themePref||"auto"===themePref&&sysDark.matches,a=document.documentElement;document.body.classList.toggle("dark",t),a.classList.toggle("dark",t),a.style.colorScheme=t?"dark":"light";const o=document.querySelector('meta[name="theme-color"]');o&&(o.content=t?"#070b14":"#eef2f9"),e||(cur&&$("#editor").classList.contains("active")?(resizeCanvas(),renderPage()):renderLibrary(),"function"==typeof refreshRail&&refreshRail(!0))}function setTheme(e){themePref=e;try{localStorage.setItem("notark.theme",e)}catch(e){}applyTheme()}function toggleTheme(){setTheme(document.body.classList.contains("dark")?"light":"dark")}sysDark.addEventListener("change",()=>{"auto"===themePref&&applyTheme()}),load(),applyTheme(!0),0===notes.length&&(notes.push({id:uid(),title:"Welcome to Nota",created:Date.now(),updated:Date.now(),pages:[newPage()]}),save()),renderLibrary(),setTimeout(maybeNagBackup,1200),tool="pen",_tb.forEach(e=>e.classList.toggle("on","pen"===e.dataset.tool)),updateCursor();const ring=$("#ring");let _re=null;function moveRing(e){if("eraser"!==tool||!cur)return ring.style.display="none",void(_re=null);_re||requestAnimationFrame(()=>{const e=_re;if(_re=null,!e||"eraser"!==tool)return;const t=_$("#canvasWrap"),a=t.getBoundingClientRect(),o=2*eraserSize*canvas._scale;Object.assign(ring.style,{display:"block",width:o+"px",height:o+"px",left:e.clientX-a.left+t.scrollLeft+"px",top:e.clientY-a.top+t.scrollTop+"px"})}),_re=e}function persistColors(){try{localStorage.setItem("notark.colors",JSON.stringify(savedColors))}catch(e){}}function syncPicker(e){const t=hexToHsv(e);hue=t.h,sat=t.s,val=t.v,$("#hueSlider").value=hue,color=e,_$("#colorPreview").style.background=e,drawSV()}function renderSwatches(){const e=$("#swatches");e.innerHTML="",savedColors.forEach((t,a)=>{const o=document.createElement("button");o.className="sw"+(t.toLowerCase()===color.toLowerCase()?" on":""),o.style.background=t,o.dataset.i=a,o.title="Tap to use · hold to delete";let n=0,r=!1;const s=()=>{r=!0,colorDel=a,colorEdit=null,renderSwatches()};if(o.onpointerdown=()=>{r=!1,clearTimeout(n),n=setTimeout(s,450)},o.onpointerup=o.onpointerleave=o.onpointercancel=()=>clearTimeout(n),o.oncontextmenu=e=>{e.preventDefault(),s()},o.onclick=()=>{if(r)return void(r=!1);colorDel=null,colorEdit=null,syncPicker(savedColors[a]),renderSwatches()},colorDel===a){const e=document.createElement("span");e.className="x",e.textContent="\u00d7",e.onclick=e=>{e.stopPropagation(),savedColors.splice(a,1),savedColors.length||savedColors.push("#1c1c1e"),colorDel=colorEdit=null,persistColors(),renderSwatches()},o.appendChild(e)}e.appendChild(o)});const a=$("#svWrap");if(a){const e=null!==colorEdit&&"eraser"!==tool&&"lasso"!==tool&&"laser"!==tool;a.style.display=e?"flex":"none",e&&drawSV()}}function sizeCfg(){if("eraser"===tool)return{min:8,max:100,get:()=>2*eraserSize,set:e=>{eraserSize=e/2}};if("text"===tool)return{min:8,max:120,get:()=>textSize,set:e=>{textSize=e,_editText("size",e)}};const[e,t]="highlighter"===tool?[4,200]:"marker"===tool?[1,150]:[.2,100];return{min:e,max:t,step:"highlighter"===tool?1:.1,get:()=>TOOL_PX[tool]||4,set:e=>{TOOL_PX[tool]=e}}}function showSize(e){$("#sizeVal").textContent=(e<10?+(+e).toFixed(1):Math.round(e))+" px";const t=Math.max(2,Math.min(30,e)),a=$("#sizeDot");a.style.width=a.style.height=t+"px"}function updateSizeUI(){const e=sizeCfg(),t=$("#sizeRange");t.step=e.step||1,t.min=e.min,t.max=e.max,t.value=e.get(),showSize(e.get())}function inLasso(e){if("image"===e.tool){const t=e.pts[0],a=e.pts[1];return[t,a,{x:t.x,y:a.y},{x:a.x,y:t.y},{x:(t.x+a.x)/2,y:(t.y+a.y)/2}].some(e=>pointInPoly(e,lassoPath))}return e.pts.some(e=>pointInPoly(e,lassoPath))}function hitAt(e){const t=cur.pages[page],a=12/canvas._scale;for(let o=t.strokes.length-1;o>=0;o--){const n=t.strokes[o],r=n.pts;if("image"!==n.tool){if("shape"!==n.tool){if(1===r.length&&Math.hypot(e.x-r[0].x,e.y-r[0].y)<a)return n;for(let t=1;t<r.length;t++)if(distToSeg(e,r[t-1],r[t])<a+(n.size||4)/2)return n}else if(shapeHit(n,e,e,a))return n}else if(e.x>=Math.min(r[0].x,r[1].x)&&e.x<=Math.max(r[0].x,r[1].x)&&e.y>=Math.min(r[0].y,r[1].y)&&e.y<=Math.max(r[0].y,r[1].y))return n}return null}function insertImages(e){cur&&[...e].forEach(e=>{if(!e.type.startsWith("image/"))return toast("Only images are supported");const t=new Image,a=URL.createObjectURL(e);t.onerror=()=>{URL.revokeObjectURL(a),toast("Could not load that image")},t.onload=()=>{if(!cur)return URL.revokeObjectURL(a);const o=Math.min(1,1600/Math.max(t.width,t.height)),n=Math.round(t.width*o),r=Math.round(t.height*o),s=document.createElement("canvas");s.width=n,s.height=r,s.getContext("2d").drawImage(t,0,0,n,r),URL.revokeObjectURL(a);const l=s.toDataURL("image/png"===e.type?"image/png":"image/jpeg",.85),i=cur.pages[page];let c=Math.min(.6*i.w,n),p=c*r/n;p>.7*i.h&&(p=.7*i.h,c=p*n/r);const d=(i.w-c)/2,h=(i.h-p)/2,g={id:uid(),tool:"image",src:l,color:"#000000",size:1,pts:[{x:d,y:h},{x:d+c,y:h+p}]};i.strokes.push(g),undoStack.push({type:"add",page:page,stroke:g}),redoStack=[],getImg(l),"lasso"!==tool&&setTool("lasso"),selected=[g],renderPage(),touch()},t.src=a})}function togglePaperColor(){paperFlip=!paperFlip;paperCache.key="",slotCache=new Map,inkCache.clear(),thumbs.clear(),rulerKey="";try{paperFlip?localStorage.setItem("notark.paperflip","1"):localStorage.removeItem("notark.paperflip")}catch(e){}cur&&(resizeCanvas(),renderPage()),"function"==typeof refreshRail&&refreshRail(!0);toast(paperFlip?"Page inverted":"Page follows the theme")}canvas.addEventListener("pointermove",moveRing),canvas.addEventListener("pointerleave",()=>{_re=null,ring.style.display="none"}),$("#selDel").onclick=delSel,$("#diskStatus").onclick=connectDisk,renderFolders(),restoreDisk(),$("#stylePanel").addEventListener("click",e=>{null===colorDel||e.target.closest(".sw")||(colorDel=null,renderSwatches())}),$("#sizeRange").addEventListener("input",e=>{const t=+e.target.value;sizeCfg().set(t),showSize(t)}),$("#imageBtn").onclick=()=>{cur&&$("#imgInput").click()},$("#imgInput").addEventListener("change",e=>{insertImages(e.target.files),e.target.value=""}),$("#paperColorBtn").onclick=togglePaperColor;const bar=$("#bottomBar"),grip=$("#barGrip"),snapHint=$("#snapHint"),EDGE_SNAP=64,BAR_M=10;let barDock="bottom",barAlong=.5,barFloat={x:40,y:140},barDrag=null;grip.style.touchAction="none";try{const e=JSON.parse(localStorage.getItem("notark.bar"));e&&(["top","bottom","left","right","float"].includes(e.dock)&&(barDock=e.dock),"number"==typeof e.along&&(barAlong=e.along),e.float&&"number"==typeof e.float.x&&(barFloat=e.float))}catch(e){}const clamp=(e,t,a)=>Math.max(t,Math.min(a,e)),headerBottom=()=>$(".ed-header").getBoundingClientRect().bottom,availW=()=>{const e=$("#rail");return innerWidth-(e&&$("#editor").classList.contains("side")?e.offsetWidth:0)},safeBottom=(()=>{const e=document.createElement("div");e.style.cssText="position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)",document.body.appendChild(e);const t=parseFloat(getComputedStyle(e).paddingBottom)||0;return e.remove(),t})();function layoutBar(){const e=availW(),t=innerHeight,a=BAR_M,o=headerBottom(),n="left"===barDock||"right"===barDock;bar.classList.toggle("vert",n),bar.style.maxWidth=n?"":e-2*a+"px",bar.style.maxHeight=n?t-o-2*a-safeBottom+"px":"";const r=bar.offsetWidth,s=bar.offsetHeight;let l,i;"bottom"===barDock?(l=barAlong*e-r/2,i=t-safeBottom-a-s):"top"===barDock?(l=barAlong*e-r/2,i=o+a):"left"===barDock?(l=a,i=o+barAlong*(t-o)-s/2):"right"===barDock?(l=e-a-r,i=o+barAlong*(t-o)-s/2):(l=barFloat.x,i=barFloat.y),bar.style.left=clamp(l,a,Math.max(a,e-r-a))+"px",bar.style.top=clamp(i,o+a,Math.max(o+a,t-safeBottom-s-a))+"px";const c={top:0,right:0,bottom:0,left:0};barDock in c&&(c[barDock]=(n?r:s)+a+("bottom"===barDock?safeBottom:0)),_$("#canvasWrap").style.padding=`${c.top}px ${c.right}px ${c.bottom}px ${c.left}px`,_$("#selBar").style.top=c.top+14+"px",cur&&(resizeCanvas(),renderPage()),positionPanel()}function positionPanel(){const e=$("#stylePanel");if(!e.classList.contains("show"))return;const t=bar.getBoundingClientRect(),a=e.offsetWidth,o=e.offsetHeight,n=availW(),r=innerHeight,s=10,l=headerBottom();let i,c;"left"===barDock?(i=t.right+s,c=t.top):"right"===barDock?(i=t.left-s-a,c=t.top):"top"===barDock?(i=t.left+t.width/2-a/2,c=t.bottom+s):(i=t.left+t.width/2-a/2,c=t.top-s-o,c<l+s&&(c=t.bottom+s)),e.style.left=clamp(i,s,Math.max(s,n-a-s))+"px",e.style.top=clamp(c,l+s,Math.max(l+s,r-o-s))+"px"}function nearEdge(e,t,a,o){const n={top:t-headerBottom(),bottom:innerHeight-(t+o),left:e,right:availW()-(e+a)};let r=null,s=64;for(const e in n)n[e]<s&&(s=n[e],r=e);return r}function showHint(e){const t=snapHint.style,a=availW(),o=innerHeight,n=headerBottom();t.display=e?"block":"none","top"===e&&Object.assign(t,{left:"14px",top:n+2+"px",width:a-28+"px",height:"5px"}),"bottom"===e&&Object.assign(t,{left:"14px",top:o-7+"px",width:a-28+"px",height:"5px"}),"left"===e&&Object.assign(t,{left:"2px",top:n+14+"px",width:"5px",height:o-n-28+"px"}),"right"===e&&Object.assign(t,{left:a-7+"px",top:n+14+"px",width:"5px",height:o-n-28+"px"})}function endBarDrag(){if(!barDrag)return;const e=bar.getBoundingClientRect(),t=nearEdge(e.left,e.top,e.width,e.height),a=headerBottom();barDrag=null,bar.classList.remove("dragging","ball"),showHint(null),t?(barDock=t,barAlong="top"===t||"bottom"===t?(e.left+e.width/2)/availW():(e.top+e.height/2-a)/(innerHeight-a)):(barDock="float",barFloat={x:e.left,y:e.top}),barAlong=clamp(barAlong,0,1);try{localStorage.setItem("notark.bar",JSON.stringify({dock:barDock,along:barAlong,float:barFloat}))}catch(e){}layoutBar()}grip.addEventListener("pointerdown",e=>{e.preventDefault(),grip.setPointerCapture(e.pointerId),bar.classList.add("dragging","ball"),$("#stylePanel").classList.remove("show");const t=bar.getBoundingClientRect();barDrag={dx:t.width/2,dy:t.height/2,w:t.width,h:t.height},bar.style.left=e.clientX-t.width/2+"px",bar.style.top=e.clientY-t.height/2+"px"}),grip.addEventListener("pointermove",e=>{if(!barDrag)return;const t=clamp(e.clientX-barDrag.dx,0,availW()-barDrag.w),a=clamp(e.clientY-barDrag.dy,headerBottom(),innerHeight-barDrag.h);bar.style.left=t+"px",bar.style.top=a+"px",showHint(nearEdge(t,a,barDrag.w,barDrag.h))}),grip.addEventListener("pointerup",endBarDrag),grip.addEventListener("pointercancel",endBarDrag);const laserCv=$("#laser"),lctx=laserCv.getContext("2d");let laserTrails=[],laserTrail=null,laserRaf=0,laserLife=2500;function sizeLaser(e){const t=Math.round(e.w),a=Math.round(e.h),o=laserCv.style,n=canvas.style,r=canvas.offsetLeft+"px",s=canvas.offsetTop+"px";laserCv.width!==t&&(laserCv.width=t),laserCv.height!==a&&(laserCv.height=a),o.width!==n.width&&(o.width=n.width),o.height!==n.height&&(o.height=n.height),o.left!==r&&(o.left=r),o.top!==s&&(o.top=s)}function endLaser(e){for(const t of laserTrails)!t.active||null!=e&&t.id!==e||(t.active=!1);!laserTrail||null!=e&&laserTrail.id!==e||(laserTrail=null),laserKick()}function clearLaser(){laserTrails=[],laserTrail=null,laserKick()}function laserKick(){laserRaf||(laserRaf=requestAnimationFrame(laserFrame))}function laserFrame(){laserRaf=0;const e=performance.now();if(lctx.setTransform(1,0,0,1,0,0),lctx.clearRect(0,0,laserCv.width,laserCv.height),!cur)return laserTrails=[],void(laserTrail=null);const t=laserCv.width/cur.pages[page].w,a=[["#ff1a1a",.28,30],["#ff3b30",.75,12],["#ff9d96",.9,4]];lctx.setTransform(t,0,0,t,0,0),lctx.lineCap=lctx.lineJoin="round";const o=t=>Math.max(0,Math.min(1,1.6*(1-(e-t)/laserLife))),n=(e,t)=>{lctx.beginPath(),e.forEach((e,t)=>t?lctx.lineTo(e.x,e.y):lctx.moveTo(e.x,e.y)),1===e.length&&lctx.lineTo(e[0].x+.1,e[0].y+.1);for(const[e,o,n]of a)lctx.strokeStyle=e,lctx.globalAlpha=t*o,lctx.lineWidth=n,lctx.stroke()};for(const t of laserTrails){for(t.active&&t!==laserTrail&&(t.active=!1),t.active&&t.pts.length&&(t.pts[t.pts.length-1].t=e);t.pts.length>1&&e-t.pts[0].t>laserLife;)t.pts.shift();let a=[t.pts[0]],r=Math.round(12*o(t.pts[0].t));for(let e=1;e<t.pts.length;e++){const s=Math.round(12*o(t.pts[e].t));s!==r?(r>0&&n(a,r/12),a=[t.pts[e-1],t.pts[e]],r=s):a.push(t.pts[e])}r>0&&n(a,r/12)}lctx.globalAlpha=1,laserTrails=laserTrails.filter(t=>t.pts.length&&e-t.pts[t.pts.length-1].t<laserLife),(laserTrails.length||laserTrail)&&(laserRaf=requestAnimationFrame(laserFrame))}const laserStop=e=>{"touch"!==e.pointerType&&endLaser(e.pointerId)};addEventListener("pointerup",laserStop,!0),addEventListener("pointercancel",laserStop,!0),addEventListener("blur",()=>endLaser()),document.addEventListener("visibilitychange",()=>{document.hidden&&endLaser()}),$("#laserRange").addEventListener("input",e=>{laserLife=1e3*+e.target.value,$("#laserVal").textContent=laserLife/1e3+" s"});let shapeSnap=!0;try{shapeSnap="off"!==localStorage.getItem("notark.snap")}catch(e){}let snapPreview=null,holdCheck=null,holdTimer=0;const dist=(e,t)=>Math.hypot(e.x-t.x,e.y-t.y);function rdp(e,t){if(e.length<3)return e.slice();const a=e[0],o=e[e.length-1];let n=0,r=0;for(let t=1;t<e.length-1;t++){const s=distToSeg(e[t],a,o);s>n&&(n=s,r=t)}return n<=t?[a,o]:rdp(e.slice(0,r+1),t).slice(0,-1).concat(rdp(e.slice(r),t))}function cornerAngle(e,t,a){const o=Math.abs(Math.atan2(e.y-t.y,e.x-t.x)-Math.atan2(a.y-t.y,a.x-t.x));return o>Math.PI?2*Math.PI-o:o}function recognizeShape(e,t){const a=e.length;if(a<8)return null;let o=0;for(let t=1;t<a;t++)o+=dist(e[t-1],e[t]);const n=e[0],r=e[a-1],s=dist(n,r),[l,i,c,p]=_bbox(e),d=c-l,h=p-i,g=Math.hypot(d,h);if(s>=80&&o<1.25*s){let t=0;for(const a of e)t=Math.max(t,distToSeg(a,n,r));if(t<=Math.max(5,.05*s)){const e={x:n.x,y:n.y},t={x:r.x,y:r.y},a=t.x-e.x,o=t.y-e.y;return Math.abs(o)<.06*s?t.y=e.y:Math.abs(a)<.06*s&&(t.x=e.x),{kind:"line",pts:[e,t]}}}if(t)return null;if(o<170||Math.min(d,h)<50||s>.28*o)return null;const u=rdp(e,.07*g);for(u.pop();u.length>3;){let e=-1,t=0;for(let a=0;a<u.length;a++){const o=cornerAngle(u[(a+u.length-1)%u.length],u[a],u[(a+1)%u.length]);o>t&&(t=o,e=a)}if(!(t>2.6))break;u.splice(e,1)}if(3===u.length){const t=[0,1,2].map(e=>cornerAngle(u[(e+2)%3],u[e],u[(e+1)%3]));let o=0;for(const t of e)o+=Math.min(distToSeg(t,u[0],u[1]),distToSeg(t,u[1],u[2]),distToSeg(t,u[2],u[0]));if(t.every(e=>e>.35&&e<2.4)&&o/a<.05*g)return{kind:"triangle",pts:u.map(e=>({x:e.x,y:e.y}))}}const f=(l+c)/2,m=(i+p)/2;let x=d/2,y=h/2,v=0,b=0,S=0;for(const t of e){const e=Math.abs(Math.hypot((t.x-f)/x,(t.y-m)/y)-1);v+=e,b=Math.max(b,e)}for(let t=1;t<a;t++){let a=Math.atan2(e[t].y-m,e[t].x-f)-Math.atan2(e[t-1].y-m,e[t-1].x-f);a>Math.PI&&(a-=2*Math.PI),a<-Math.PI&&(a+=2*Math.PI),S+=a}return v/a<.1&&b<.32&&Math.abs(S)>1.7*Math.PI?(Math.abs(d-h)/Math.max(d,h)<.2&&(x=y=(d+h)/4),{kind:"ellipse",pts:[{x:f-x,y:m-y},{x:f+x,y:m+y}]}):null}function applySnap(e,t){"line"===t.kind||(e.tool="shape",e.shapeType="triangle"===t.kind?"poly":"ellipse"),e.pts=t.pts,e.baked=!0}function snapStroke(e){if(!shapeSnap||!["pen","highlighter"].includes(e.tool))return!1;const t=recognizeShape(e.pts,"highlighter"===e.tool);return!!t&&(applySnap(e,t),!0)}$("#snapBtn").onclick=()=>{shapeSnap=!shapeSnap;try{localStorage.setItem("notark.snap",shapeSnap?"on":"off")}catch(e){}buildStylePanel()};let stamps=[];try{stamps=JSON.parse(localStorage.getItem("notark.stamps"))}catch(e){}function persistStamps(){try{localStorage.setItem("notark.stamps",JSON.stringify(stamps))}catch(e){toast("Browser storage is full")}}Array.isArray(stamps)||(stamps=[]);const lum=e=>{const t=e.replace("#",""),a=3===t.length?t.replace(/./g,"$&$&"):t;return(.299*parseInt(a.slice(0,2),16)+.587*parseInt(a.slice(2,4),16)+.114*parseInt(a.slice(4,6),16))/255},adaptInk=(e,t)=>{const a=lum(e);return t&&a<.3||!t&&a>.7?invertHex(e):e};function saveSelectionToLibrary(){const e=selected.filter(e=>"image"!==e.tool);if(!e.length)return void toast(selected.length?"Images can’t be saved to the library":"Select a drawing first");const[t,a,o,n]=_bbox(e.flatMap(e=>e.pts)),r=e.map(e=>{const o=_cl(e);return delete o._adapted,o.pts=o.pts.map(e=>({x:e.x-t,y:e.y-a})),o});stamps.unshift({id:uid(),name:"Drawing "+(stamps.length+1),w:o-t,h:n-a,strokes:r}),persistStamps(),toast("Saved to library")}function insertStamp(e){if(!cur)return;const t=cur.pages[page],a="#ffffff"!==paperColor(),o=Math.min(1,.7*t.w/Math.max(e.w,1),.7*t.h/Math.max(e.h,1)),n=(t.w-e.w*o)/2,r=(t.h-e.h*o)/2,s=t.strokes.slice(),l=e.strokes.map(e=>({..._cl(e),color:adaptInk(e.color,a),_adapted:a,size:e.size*o,seed:1e9*Math.random()|0,pts:e.pts.map(e=>({x:n+e.x*o,y:r+e.y*o}))}));t.strokes.push(...l),undoStack.push({type:"snap",page:page,before:s,after:t.strokes.slice()}),redoStack=[],closeLib(),"lasso"!==tool&&setTool("lasso"),selected=l,renderPage(),touch()}function drawStampThumb(e,t){const a=e.width=240,o=e.height=240,n=e.getContext("2d"),r="#ffffff"!==paperColor();n.fillStyle=paperColor(),n.fillRect(0,0,a,o);const s=Math.min(3,(a-40)/Math.max(t.w,8),(o-40)/Math.max(t.h,8));n.save(),n.translate((a-t.w*s)/2,(o-t.h*s)/2),n.scale(s,s);for(const e of t.strokes)paintStroke(n,{...e,color:adaptInk(e.color,r)});n.restore()}function renderStamps(){const e=$("#stampGrid");e.innerHTML="",$("#stampEmpty").style.display=stamps.length?"none":"block";for(const t of stamps){const a=document.createElement("div");a.className="stamp",a.innerHTML='<div class="stamp-thumb"><canvas></canvas></div><div class="stamp-name"></div><button class="stamp-del" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';const o=a.querySelector(".stamp-name");o.textContent=t.name,a.querySelector(".stamp-thumb").onclick=()=>insertStamp(t),o.onclick=()=>ask("Rename drawing",t.name,e=>{e&&(t.name=e,persistStamps(),renderStamps())}),a.querySelector(".stamp-del").onclick=()=>{confirm("Remove “"+t.name+"” from the library?")&&(stamps=stamps.filter(e=>e!==t),persistStamps(),renderStamps())},e.appendChild(a),drawStampThumb(a.querySelector("canvas"),t)}}function openLib(){cur&&($("#stylePanel").classList.remove("show"),renderStamps(),$("#libSheet").classList.add("show"))}function closeLib(){const e=$("#libSheet");e&&e.classList.remove("show")}$("#libBtn").onclick=openLib,$("#libClose").onclick=closeLib,$("#libSheet").addEventListener("click",e=>{"libSheet"===e.target.id&&closeLib()}),$("#selSave").onclick=saveSelectionToLibrary,$("#nagLater").onclick=snoozeNag,$("#exportAllBtn").onclick=exportAll;
/* ===== Ruler tool v2 (page-anchored, self-contained) ===== */
(()=>{
const KEY="notark.ruler2",PKEY="notark.rulerpaper",H_MM=24,MIN_MM=50,MAX_MM=1000;
const cl=(v,a,b)=>Math.max(a,Math.min(b,v)),n360=a=>((a%360)+360)%360;
let thickMm=24;try{const v=parseFloat(localStorage.getItem("notark.rulerthickmm"));if(v>=12&&v<=60)thickMm=v}catch(e){}
const MIN_PX=8;
let paperMm=210;try{const v=parseFloat(localStorage.getItem(PKEY));if(v>=50&&v<=2000)paperMm=v}catch(e){}
const S={cx:0,cy:0,len:0,A:0,on:false,init:false};
try{const j=JSON.parse(localStorage.getItem(KEY));if(j&&[j.cx,j.cy,j.len,j.A].every(Number.isFinite)){Object.assign(S,{cx:j.cx,cy:j.cy,len:j.len,A:n360(j.A),init:true})}}catch(e){}
const saveS=()=>{try{localStorage.setItem(KEY,JSON.stringify({cx:S.cx,cy:S.cy,len:S.len,A:S.A}))}catch(e){}};
const curPage=()=>typeof cur!=="undefined"&&cur&&cur.pages?cur.pages[page]:null;
const metrics=()=>{
  const pg=curPage();if(!pg)return null;
  const r=canvas.getBoundingClientRect();if(!r.width)return null;
  const sc=r.width/pg.w,mmU=paperMm/pg.w;
  return{pg,r,sc,mmU,pxmm:sc/mmU};
};
const toP=(m,x,y)=>({x:(x-m.r.left)/m.sc,y:(y-m.r.top)/m.sc});

/* ---- styles ---- */
const st=document.createElement("style");
st.textContent=`
#rulerLayer{position:fixed;left:0;top:0;z-index:10;pointer-events:none;display:none}
#ruler{position:fixed;left:0;top:0;z-index:11;display:none;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;transform-origin:50% 50%}
#ruler:active{cursor:grabbing}
#ruler .rl-rot{position:absolute;width:48px;height:48px;border-radius:50%;cursor:grab;touch-action:none}
#ruler .rl-grip{position:absolute;top:0;bottom:0;width:44px;cursor:ew-resize;touch-action:none}
#rulerPill{position:fixed;z-index:12;display:none;transform:translate(-50%,-50%);align-items:center;gap:10px;padding:7px 8px 7px 14px;border-radius:14px;background:rgba(24,26,33,.82);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);color:#fff;font:500 12px/1 -apple-system,system-ui,sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 6px 20px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.14);pointer-events:none;white-space:nowrap}
#rulerPill b{font-size:17px;font-weight:650;letter-spacing:.2px}
#rulerPill span{opacity:.62}
#rulerPill button{pointer-events:auto;border:0;background:rgba(255,255,255,.14);color:#fff;width:24px;height:24px;border-radius:8px;font-size:13px;padding:0;cursor:pointer}
#rulerCal{position:fixed;z-index:70;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:stretch;gap:12px;padding:20px;border-radius:18px;background:#fff;color:#1c1c1e;box-shadow:0 18px 50px rgba(0,0,0,.4);width:min(320px,calc(100vw - 24px));font:14px/1.4 -apple-system,system-ui,sans-serif}
body.dark #rulerCal{background:#1f2430;color:#eef0f5}
#rulerCal h4{margin:0;font-size:16px}
#rulerCal p{margin:0;opacity:.7;font-size:13px}
#rulerCal .rc-row{display:flex;gap:8px;align-items:center}
#rulerCal input{flex:1;min-width:0;font:600 15px system-ui;padding:8px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit}
#rulerCal input[type=range]{padding:0;border:0}
#rulerCal button{border:0;border-radius:10px;padding:9px 14px;font:600 14px system-ui;background:rgba(128,128,128,.2);color:inherit;cursor:pointer}
#rulerCal button.pri{background:#0a84ff;color:#fff;flex:1}
`;
document.head.appendChild(st);

/* ---- DOM ---- */
const layer=document.createElement("canvas");layer.id="rulerLayer";
const el=document.createElement("div");el.id="ruler";
el.innerHTML='<div class="rl-rot" title="Rotate"></div><div class="rl-grip" title="Drag to resize"></div>';
const rot=el.firstChild,grip=el.lastChild;
const pill=document.createElement("div");pill.id="rulerPill";
pill.innerHTML='<b></b><span></span><button type="button" title="Page size">⚙</button>';
const pAng=pill.children[0],pLen=pill.children[1],calBtn=pill.children[2];
const rotBtn=document.createElement("button");rotBtn.type="button";rotBtn.title="Rotate 45°";rotBtn.textContent="↻";pill.insertBefore(rotBtn,calBtn);
const cal=document.createElement("div");cal.id="rulerCal";
cal.innerHTML='<h4>Ruler settings <small style="opacity:.5;font-weight:500">v7</small></h4><p>How wide is your page in real life? The ruler measures the page, so it grows and shrinks as you zoom.</p><div class="rc-row"><button data-w="210">A4</button><button data-w="215.9">Letter</button><input type="number" step="0.1" min="5" max="200" inputmode="decimal"><span>cm</span></div><div class="rc-row"><span>Width</span><input type="range" id="rlThick" min="12" max="60" step="1"><span id="rlThickV"></span></div><div class="rc-row"><button class="pri" data-a="done">Done</button></div>';
(document.querySelector("#editor")||document.body).append(layer,el,pill);document.body.append(cal);
const widthIn=cal.querySelector("input"),thickIn=cal.querySelector("#rlThick");

/* ---- drawing helpers ---- */
const rr=(g,x,y,w,h,r)=>{r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()};

function edge(g,W,H,top,unitPx,list,ink,fs,tag){
  let d=1,stepU;
  if(unitPx>=5.2){for(const k of list)if(unitPx/k>=5.2)d=k;stepU=1/d}
  else{stepU=1;for(const k of[2,5,10,20,50,100,200,500,1000,2000,5000]){stepU=k;if(k*unitPx>=5.2)break}}
  let L=1;for(const k of[1,2,5,10,20,50,100,200,500,1000,2000,5000,10000]){L=k;if(k*unitPx>=50)break}
  const stepPx=unitPx*stepU,N=Math.floor((W-2)/stepPx+1e-6),dir=top?1:-1,y0=top?-H/2:H/2,maxL=H*.2;
  const lv=[[],[],[],[]];/* major, mid, quarter, minor */
  for(let i=0;i<=N;i++){
    let k=3;
    if(stepU>=1)k=0;
    else if(i%d===0)k=0;
    else if(d%2===0&&i%(d/2)===0)k=1;
    else if(d%4===0&&i%(d/4)===0)k=2;
    lv[k].push(i)
  }
  const fr=[1,.68,.5,.36],lw=[1.7,1.2,1,.9];
  g.strokeStyle=ink;
  for(let k=3;k>=0;k--){
    if(!lv[k].length)continue;
    g.lineWidth=lw[k];g.beginPath();
    for(const i of lv[k]){const x=-W/2+1+i*stepPx;g.moveTo(x,y0);g.lineTo(x,y0+dir*maxL*fr[k])}
    g.stroke();
  }
  /* numerals */
  if(fs<6.5)return;
  g.fillStyle=ink;g.font=`700 ${fs}px ui-rounded,"SF Pro Rounded",-apple-system,system-ui,sans-serif`;g.textBaseline=top?"top":"bottom";
  const ty=y0+dir*(maxL+3);
  for(const i of lv[0]){
    const u=i*stepU;if(u%L!==0)continue;
    const x=-W/2+1+i*stepPx,t=String(u),w=g.measureText(t).width;
    if(u===0){g.textAlign="left";g.fillText(t,x+5,ty);
      g.save();g.globalAlpha=.55;g.font=`500 ${fs*.78}px -apple-system,system-ui,sans-serif`;g.fillText(tag,x+5+w+4,ty+(top?fs*.18:-fs*.04));g.restore()}
    else if(x+w/2<=W/2-4){g.textAlign="center";g.fillText(t,x,ty)}
  }
}

function drawRuler(g,W,H,dark){
  const r=0,ink=dark?"rgba(240,243,250,.95)":"rgba(22,28,42,.92)";
  /* translucent body */
  rr(g,-W/2,-H/2,W,H,r);
  g.fillStyle=dark?"rgba(70,82,112,.46)":"rgba(226,236,255,.52)";g.fill();
  g.save();rr(g,-W/2,-H/2,W,H,r);g.clip();
  /* soft top sheen */
  const sh=g.createLinearGradient(0,-H/2,0,H/2);
  sh.addColorStop(0,dark?"rgba(255,255,255,.12)":"rgba(255,255,255,.55)");sh.addColorStop(.5,"rgba(255,255,255,0)");
  g.fillStyle=sh;g.fillRect(-W/2,-H/2,W,H);
  /* scales */
  const fs=Math.min(22,H*.2);
  edge(g,W,H,true,10*S_pxmm,[1,2,10,20],ink,fs,"cm");
  edge(g,W,H,false,25.4*S_pxmm,[1,2,4,8,16,32],ink,fs,"in");
  g.restore();
  /* hairline border */
  g.lineWidth=1;rr(g,-W/2+.5,-H/2+.5,W-1,H-1,r);g.strokeStyle=dark?"rgba(255,255,255,.38)":"rgba(20,30,60,.38)";g.stroke();
  /* rotate handle */
  const kx=-W/2-24,kr=17;
  g.save();g.shadowColor="rgba(0,0,0,.3)";g.shadowBlur=6;g.beginPath();g.arc(kx,0,kr,0,7);g.fillStyle=dark?"rgba(70,82,112,.95)":"rgba(255,255,255,.98)";g.fill();g.restore();
  g.strokeStyle=dark?"rgba(255,255,255,.7)":"rgba(20,30,60,.6)";g.lineWidth=1.4;g.beginPath();g.arc(kx,0,kr,0,7);g.stroke();
  g.strokeStyle=ink;g.lineWidth=1.6;g.lineCap="round";g.lineJoin="round";
  const ar=kr*.5,e=1.7;g.beginPath();g.arc(kx,0,ar,-2.6,e);g.stroke();
  g.beginPath();g.moveTo(kx+ar*Math.cos(e)-3,ar*Math.sin(e)-1);g.lineTo(kx+ar*Math.cos(e),ar*Math.sin(e));g.lineTo(kx+ar*Math.cos(e)+1.4,ar*Math.sin(e)-3.2);g.stroke();
  /* resize handle */
  const gx=W/2+24,gw=20,gh=34;
  rr(g,gx-gw/2,-gh/2,gw,gh,gw/2);g.fillStyle=dark?"rgba(255,255,255,.16)":"rgba(255,255,255,.8)";g.fill();
  g.strokeStyle=dark?"rgba(255,255,255,.5)":"rgba(20,30,60,.4)";g.lineWidth=1;g.stroke();
  g.strokeStyle=ink;g.lineWidth=1.5;g.beginPath();g.moveTo(gx-2.2,-gh*.24);g.lineTo(gx-2.2,gh*.24);g.moveTo(gx+2.2,-gh*.24);g.lineTo(gx+2.2,gh*.24);g.stroke();
}
let S_pxmm=3.78;

/* ---- render (called every frame the view or ruler changes) ---- */
let lastKey="",raf=0;
function ensureInit(m){
  if(S.init)return;
  S.cx=m.pg.w/2;S.cy=m.pg.h/2;S.len=Math.min(150,paperMm*.8)/m.mmU;S.A=0;S.init=true;
}
function render(m){
  const dark=document.body.classList.contains("dark"),dpr=window.devicePixelRatio||1;
  const cw=Math.round(innerWidth*dpr),ch=Math.round(innerHeight*dpr);
  if(layer.width!==cw||layer.height!==ch){layer.width=cw;layer.height=ch;layer.style.width=innerWidth+"px";layer.style.height=innerHeight+"px"}
  const g=layer.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,innerWidth,innerHeight);
  const W=S.len*m.sc,H=Math.max(MIN_PX,thickMm*m.pxmm),cx=m.r.left+S.cx*m.sc,cy=m.r.top+S.cy*m.sc;
  g.save();g.translate(cx,cy);g.rotate(-S.A*Math.PI/180);S_pxmm=m.pxmm;drawRuler(g,W,H,dark);g.restore();
  /* hit areas */
  const HH=Math.max(H,30);el.style.width=W+"px";el.style.height=HH+"px";el.style.left=cx-W/2+"px";el.style.top=cy-HH/2+"px";el.style.transform=`rotate(${-S.A}deg)`;
  rot.style.left=-24-24+"px";rot.style.top=HH/2-24+"px";
  grip.style.left=W+2+"px";
  /* readout: 0° = horizontal, 90° = vertical */
  let a=Math.round(((S.A%180))*10)/10;if(a>=180)a=0;
  const mm=S.len*m.mmU;
  pAng.textContent=a.toFixed(1)+"°";pLen.textContent=(mm/10).toFixed(1)+" cm";
  const rad=S.A*Math.PI/180;let nx=Math.sin(rad),ny=Math.cos(rad);
  if(ny>1e-9||(Math.abs(ny)<=1e-9&&nx<0)){nx=-nx;ny=-ny}
  const pw=pill.offsetWidth||150,ph=pill.offsetHeight||34,off=H/2+Math.abs(nx)*pw/2+Math.abs(ny)*ph/2+14;
  pill.style.left=cl(cx+nx*off,90,innerWidth-90)+"px";pill.style.top=cl(cy+ny*off,30,innerHeight-30)+"px";
}
const ed=document.querySelector("#editor");
const shown=()=>S.on&&curPage()&&(!ed||ed.classList.contains("active"));
function frame(){
  raf=0;
  if(!shown()){setVis(false);return}
  const m=metrics();
  if(m){
    ensureInit(m);
    const k=[m.r.left,m.r.top,m.r.width,S.cx,S.cy,S.len,S.A,paperMm,thickMm,innerWidth,innerHeight,document.body.classList.contains("dark"),window.devicePixelRatio].join();
    if(k!==lastKey){lastKey=k;render(m)}
    setVis(true);
  }
  raf=requestAnimationFrame(frame);
}
function setVis(v){layer.style.display=el.style.display=v?"block":"none";pill.style.display=v?"flex":"none";if(!v)cal.style.display="none"}
const kick=()=>{lastKey="";if(!raf)raf=requestAnimationFrame(frame)};

/* ---- move (1 pointer) / twist (2 fingers) — everything in page units ---- */
const ptrs=new Map();let g0=null;
function begin(){
  const m=metrics();if(!m)return;
  const a=[...ptrs.values()].map(p=>toP(m,p.x,p.y));
  if(a.length===1)g0={m:"move",dx:S.cx-a[0].x,dy:S.cy-a[0].y};
  else if(a.length>=2){const[p,q]=a;g0={m:"twist",last:Math.atan2(-(q.y-p.y),q.x-p.x),mx:(p.x+q.x)/2,my:(p.y+q.y)/2}}
}
el.addEventListener("pointerdown",e=>{
  e.preventDefault();try{el.setPointerCapture(e.pointerId)}catch(_){}
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});begin();
});
el.addEventListener("pointermove",e=>{
  if(!ptrs.has(e.pointerId))return;
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const m=metrics();if(!m||!g0)return;
  const a=[...ptrs.values()].map(p=>toP(m,p.x,p.y));
  if(a.length===1&&g0.m==="move"){S.cx=a[0].x+g0.dx;S.cy=a[0].y+g0.dy}
  else if(a.length>=2&&g0.m==="twist"){
    const[p,q]=a,ang=Math.atan2(-(q.y-p.y),q.x-p.x),mx=(p.x+q.x)/2,my=(p.y+q.y)/2;
    let d=ang-g0.last;d=((d+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    S.A=n360(S.A+d*180/Math.PI);S.cx+=mx-g0.mx;S.cy+=my-g0.my;g0.last=ang;g0.mx=mx;g0.my=my;
  }
  S.cx=cl(S.cx,0,m.pg.w);S.cy=cl(S.cy,0,m.pg.h);
});
const upPtr=e=>{if(!ptrs.delete(e.pointerId))return;if(ptrs.size)begin();else{g0=null;saveS()}};
el.addEventListener("pointerup",upPtr);el.addEventListener("pointercancel",upPtr);

/* ---- rotate button: tap to turn the ruler to the next 45° ---- */
rotBtn.addEventListener("click",()=>{S.A=n360(Math.round(S.A/45)*45+45)%360;saveS();kick()});
/* ---- rotate (knob, left end, pivots on the centre) ---- */
let rotId=null;
rot.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();rot.setPointerCapture(e.pointerId);rotId=e.pointerId});
rot.addEventListener("pointermove",e=>{
  if(rotId!==e.pointerId)return;const m=metrics();if(!m)return;
  const p=toP(m,e.clientX,e.clientY);
  let a=n360(Math.atan2(-(p.y-S.cy),p.x-S.cx)*180/Math.PI+180);
  for(const t of[0,45,90,135,180,225,270,315,360])if(Math.abs(a-t)<1.5){a=t%360;break}
  S.A=a;
});
const rotEnd=e=>{if(rotId===e.pointerId){rotId=null;saveS()}};
rot.addEventListener("pointerup",rotEnd);rot.addEventListener("pointercancel",rotEnd);

/* ---- resize (grip, right end; left end stays put) ---- */
let rs=null;
grip.addEventListener("pointerdown",e=>{
  e.preventDefault();e.stopPropagation();grip.setPointerCapture(e.pointerId);
  const m=metrics();if(!m)return;
  const r=S.A*Math.PI/180,ux=Math.cos(r),uy=-Math.sin(r),lx=S.cx-ux*S.len/2,ly=S.cy-uy*S.len/2,p=toP(m,e.clientX,e.clientY);
  rs={id:e.pointerId,ux,uy,lx,ly,d0:(p.x-lx)*ux+(p.y-ly)*uy-S.len};
});
grip.addEventListener("pointermove",e=>{
  if(!rs||rs.id!==e.pointerId)return;const m=metrics();if(!m)return;
  const p=toP(m,e.clientX,e.clientY),L=(p.x-rs.lx)*rs.ux+(p.y-rs.ly)*rs.uy-rs.d0;
  S.len=cl(Math.round(L*m.mmU),MIN_MM,MAX_MM)/m.mmU;
  S.cx=rs.lx+rs.ux*S.len/2;S.cy=rs.ly+rs.uy*S.len/2;
});
const rsEnd=e=>{if(rs&&rs.id===e.pointerId){rs=null;saveS()}};
grip.addEventListener("pointerup",rsEnd);grip.addEventListener("pointercancel",rsEnd);


/* ---- straight lines: a stroke drawn along a ruler edge snaps onto it ---- */
let armed=false,nBefore=0;
canvas.addEventListener("pointerdown",()=>{const p=curPage();armed=!!(S.on&&p);nBefore=p?p.strokes.length:0},true);
addEventListener("pointerup",()=>{if(!armed)return;armed=false;setTimeout(snapToEdge,60)},true);
addEventListener("pointercancel",()=>{armed=false},true);
function snapToEdge(){
  const p=curPage(),m=metrics();
  if(!S.on||!p||!m||p.strokes.length!==nBefore+1)return;
  const st=p.strokes[nBefore];
  if(!st||!["pen","pencil","marker","highlighter"].includes(st.tool)||!st.pts||st.pts.length<2)return;
  const r=S.A*Math.PI/180,ux=Math.cos(r),uy=-Math.sin(r),vx=-uy,vy=ux;
  const hh=Math.max(MIN_PX,thickMm*m.pxmm)/2/m.sc,hl=S.len/2,tol=18/m.sc;
  const loc=st.pts.map(q=>{const dx=q.x-S.cx,dy=q.y-S.cy;return{a:dx*ux+dy*uy,d:dx*vx+dy*vy}});
  const side=loc.reduce((t,q)=>t+q.d,0)<0?-1:1;
  let ok=0,inBody=0;
  for(const q of loc){const e=side*q.d-hh;if(e>=-tol*.6&&e<=tol&&q.a>=-hl-tol&&q.a<=hl+tol)ok++;if(Math.abs(q.d)<hh&&q.a>=-hl&&q.a<=hl)inBody++}
  let a0,a1,off;
  if(ok>=loc.length*.9){ /* drawn along the edge */
    a0=cl(loc[0].a,-hl,hl);a1=cl(loc[loc.length-1].a,-hl,hl);
  }else if(inBody>=2){ /* scribbled across the ruler: flatten onto the nearest edge */
    const f=loc[0],inside=Math.abs(f.d)<hh;
    const sd=inside?(loc.reduce((t,q)=>t+q.d,0)<0?-1:1):(f.d<0?-1:1);
    const band=loc.filter(q=>Math.abs(q.d)<=hh+tol&&q.a>=-hl-tol&&q.a<=hl+tol);
    let lo=1e9,hi=-1e9;for(const q of band){lo=Math.min(lo,q.a);hi=Math.max(hi,q.a)}
    lo=cl(lo,-hl,hl);hi=cl(hi,-hl,hl);
    const fwd=band[0].a<=band[band.length-1].a;
    a0=fwd?lo:hi;a1=fwd?hi:lo;
    off=sd*(hh+(st.size||2)/2);
  }else return;
  if(Math.abs(a1-a0)*m.sc<6)return;
  if(off===undefined)off=side*(hh+(st.size||2)/2);
  const pt=a=>({x:S.cx+ux*a+vx*off,y:S.cy+uy*a+vy*off});
  st.pts=[pt(a0),pt(a1)];st.baked=true;
  if(typeof renderPage==="function")renderPage();
  if(typeof touch==="function")touch();
}


/* ---- live edge: a stroke that starts beside the ruler follows its edge like a real straightedge ---- */
let rule=null,synth=false;
const DRAW_TOOLS=["pen","pencil","marker","highlighter"];
function edgeGeom(e){
  const m=metrics();if(!m)return null;
  const p=toP(m,e.clientX,e.clientY),r=S.A*Math.PI/180,ux=Math.cos(r),uy=-Math.sin(r),vx=-uy,vy=ux;
  const dx=p.x-S.cx,dy=p.y-S.cy,a=dx*ux+dy*uy,d=dx*vx+dy*vy;
  const hh=Math.max(MIN_PX,thickMm*m.pxmm)/2/m.sc,hl=S.len/2;
  return{m,ux,uy,vx,vy,a,d,hh,hl};
}
function toEdge(e,side){
  const G=edgeGeom(e);if(!G)return null;
  const w=(typeof TOOL_PX!=="undefined"&&TOOL_PX[tool])||4,off=side*(G.hh+w/2),a=cl(G.a,-G.hl,G.hl);
  const x=S.cx+G.ux*a+G.vx*off,y=S.cy+G.uy*a+G.vy*off;
  return{x:G.m.r.left+x*G.m.sc,y:G.m.r.top+y*G.m.sc};
}
function fire(e,type){
  const q=toEdge(e,rule.side);if(!q)return;
  const ev=new PointerEvent(type,{pointerId:e.pointerId,pointerType:e.pointerType,isPrimary:e.isPrimary,pressure:e.pressure,width:e.width,height:e.height,tiltX:e.tiltX,tiltY:e.tiltY,twist:e.twist,buttons:e.buttons,button:e.button,clientX:q.x,clientY:q.y,screenX:e.screenX,screenY:e.screenY,bubbles:true,cancelable:true,composed:true,view:window});
  Object.defineProperty(ev,"getCoalescedEvents",{value:()=>[ev]});
  synth=true;try{canvas.dispatchEvent(ev)}finally{synth=false}
}
addEventListener("pointerdown",e=>{
  if(synth||rule||!S.on||e.target!==canvas||!DRAW_TOOLS.includes(tool))return;
  if(e.pointerType==="mouse"&&e.button!==0)return;
  const G=edgeGeom(e);if(!G)return;
  const tol=26/G.m.sc,side=G.d<0?-1:1,out=side*G.d-G.hh;
  if(out>tol||out<-tol||G.a<-G.hl-tol||G.a>G.hl+tol)return;
  rule={id:e.pointerId,side};
  e.stopImmediatePropagation();fire(e,"pointerdown");
},true);
let dId=null,dSide=1;
addEventListener("pointerdown",e=>{
  if(synth)return;dId=null;
  if(rule||!S.on||e.target!==canvas||!DRAW_TOOLS.includes(tool))return;
  const G=edgeGeom(e);dId=e.pointerId;dSide=G&&G.d<0?-1:1;
},true);
addEventListener("pointermove",e=>{
  if(synth)return;
  if(!rule&&e.pointerId===dId&&S.on&&DRAW_TOOLS.includes(tool)){
    /* pen reaches the ruler body mid-stroke: stop at the edge and slide along it */
    const G=edgeGeom(e);
    if(G){
      if(Math.abs(G.d)<G.hh&&Math.abs(G.a)<=G.hl)rule={id:e.pointerId,side:dSide};
      else if(Math.abs(G.d)>=G.hh)dSide=G.d<0?-1:1;
    }
  }
  if(!rule||e.pointerId!==rule.id)return;
  e.stopImmediatePropagation();fire(e,"pointermove");
},true);
for(const t of["pointerup","pointercancel"])addEventListener(t,e=>{if(e.pointerId===dId)dId=null},true);
for(const t of["pointerup","pointercancel"])addEventListener(t,e=>{
  if(synth||!rule||e.pointerId!==rule.id)return;
  e.stopImmediatePropagation();fire(e,t);rule=null;
},true);

/* ---- page size setting ---- */
function setPaper(mm){
  const m=metrics(),oldMm=m?S.len*m.mmU:0;
  paperMm=cl(mm,50,2000);try{localStorage.setItem(PKEY,String(paperMm))}catch(e){}
  if(m&&oldMm)S.len=oldMm/(paperMm/m.pg.w); /* keep the ruler's real length */
  widthIn.value=(paperMm/10).toFixed(1);kick();
}
const thickV=cal.querySelector("#rlThickV");
thickIn.addEventListener("input",()=>{thickMm=+thickIn.value;thickV.textContent=thickMm+" mm";try{localStorage.setItem("notark.rulerthickmm",String(thickMm))}catch(e){}kick()});
calBtn.addEventListener("click",e=>{e.stopPropagation();thickIn.value=thickMm;thickV.textContent=thickMm+" mm";widthIn.value=(paperMm/10).toFixed(1);cal.style.display="flex"});
widthIn.addEventListener("change",()=>{const v=parseFloat(widthIn.value);if(v>0)setPaper(v*10)});
cal.addEventListener("click",e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.w)setPaper(+t.dataset.w);else if(t.dataset&&t.dataset.a==="done")cal.style.display="none";
});

/* ---- toolbar button ---- */
const ICON='<svg class="ti" viewBox="0 0 28 52" aria-hidden="true"><rect x="6" y="1.4" width="16" height="50.6" rx="1.6" fill="url(#gMetal)" stroke="#3f4550" stroke-width=".4"/><rect x="7.2" y="2.6" width="13.6" height="49.4" rx=".8" fill="url(#gPearl)"/><rect x="7.2" y="2.6" width="13.6" height="4.2" rx=".8" fill="url(#gGold)"/><circle cx="14" cy="4.7" r="1.4" fill="#2a1f08"/><circle cx="13.6" cy="4.3" r=".5" fill="#fff" opacity=".45"/><rect x="13.1" y="9" width="1.8" height="43" fill="url(#gNavy)"/><rect x="13.4" y="9" width=".5" height="43" fill="#fff" opacity=".4"/><path d="M7.2 9.0h5.2M7.2 10.8h2.2M7.2 12.6h3.6M7.2 14.4h2.2M7.2 16.2h5.2M7.2 18.0h2.2M7.2 19.8h3.6M7.2 21.6h2.2M7.2 23.4h5.2M7.2 25.2h2.2M7.2 27.0h3.6M7.2 28.8h2.2M7.2 30.6h5.2M7.2 32.4h2.2M7.2 34.2h3.6M7.2 36.0h2.2M7.2 37.8h5.2M7.2 39.6h2.2M7.2 41.4h3.6M7.2 43.2h2.2M7.2 45.0h5.2M7.2 46.8h2.2M7.2 48.6h3.6M7.2 50.4h2.2" stroke="#2f3642" stroke-width=".55" fill="none"/><path d="M20.8 9.0h-4.4M20.8 11.3h-2.2M20.8 13.6h-2.2M20.8 15.9h-2.2M20.8 18.2h-4.4M20.8 20.5h-2.2M20.8 22.8h-2.2M20.8 25.1h-2.2M20.8 27.4h-4.4M20.8 29.7h-2.2M20.8 32.0h-2.2M20.8 34.3h-2.2M20.8 36.6h-4.4M20.8 38.9h-2.2M20.8 41.2h-2.2M20.8 43.5h-2.2M20.8 45.8h-4.4M20.8 48.1h-2.2M20.8 50.4h-2.2" stroke="#2f3642" stroke-width=".45" stroke-opacity=".75" fill="none"/><path d="M7.2 13.8h5M7.2 22.8h5M7.2 31.8h5M7.2 40.8h5M7.2 49.8h5" stroke="#c2312f" stroke-width=".7" fill="none"/><rect x="7.6" y="7" width=".9" height="44.5" fill="#fff" opacity=".55"/><path d="M20.8 2.6v49.4" stroke="#4d535e" stroke-opacity=".5" stroke-width=".6"/></svg>';
function makeBtn(){
  const b=document.createElement("button");b.className="tool ins";b.innerHTML=ICON;
  const lib=document.querySelector("#libBtn"),tb=document.querySelector("#toolbar");
  if(lib)lib.after(b);else(tb||document.querySelector("#bottomBar")||document.body).appendChild(b);
  b.id="rulerBtn";b.type="button";b.title="Ruler";b.setAttribute("aria-label","Ruler");return b;
}
const btn=makeBtn();
btn.addEventListener("click",()=>{
  if(!S.on&&!curPage())return;
  S.on=!S.on;btn.classList.toggle("on",S.on);
  const sp=document.querySelector("#stylePanel");sp&&sp.classList.remove("show");
  if(S.on)kick();else{setVis(false);saveS()}
});
if(ed)new MutationObserver(()=>{if(S.on)kick()}).observe(ed,{attributes:true,attributeFilter:["class"]});
})();
