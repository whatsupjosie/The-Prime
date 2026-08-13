// Bar scene: simple 2.5D walk + interact to launch Liar\'s Dice

import { AudioBus, loadSfx, playLoop, duckMusic } from '/static/audio.js';

const SFX = {
  bar_bgm_soft: '/assets/audio/bar/loop_warm.mp3',
  dice_shake: '/assets/audio/foley/dice_shake_cup.wav',
  dice_tap: '/assets/audio/foley/dice_on_wood.wav',
  bang_glass: '/assets/audio/foley/glass_bang.wav'
};
loadSfx(SFX);

const root = document.getElementById('bar-root');
const world = document.createElement('div');
world.style.position = 'absolute';
world.style.inset = '0';
root.appendChild(world);

// Overlay UI for menus
const ui = document.createElement('div');
ui.id = 'bar-ui';
ui.style.position = 'absolute';
ui.style.left = '0';
ui.style.top = '0';
ui.style.right = '0';
ui.style.bottom = '0';
ui.style.display = 'none';
ui.style.alignItems = 'center';
ui.style.justifyContent = 'center';
ui.style.background = 'rgba(0,0,0,0.45)';
root.appendChild(ui);

function hideUI(){ ui.style.display = 'none'; ui.innerHTML = ''; }
function showMenu(title, items){
  ui.innerHTML = '';
  const panel = document.createElement('div');
  panel.style.minWidth = '280px';
  panel.style.maxWidth = '92vw';
  panel.style.background = 'linear-gradient(145deg, rgba(20,22,30,0.96), rgba(12,14,20,0.98))';
  panel.style.border = '1px solid rgba(255,255,255,0.14)';
  panel.style.borderRadius = '12px';
  panel.style.boxShadow = '0 6px 26px rgba(0,0,0,0.45)';
  panel.style.padding = '12px';
  const h = document.createElement('div'); h.textContent = title || 'Menu';
  h.style.font = '700 16px system-ui,Segoe UI,Roboto,Helvetica,Arial'; h.style.color = '#e8f0ff'; h.style.margin = '4px 2px 10px';
  panel.appendChild(h);
  (items||[]).forEach(it => {
    const b = document.createElement('button');
    b.textContent = it.label || 'Option';
    b.style.display = 'block'; b.style.width = '100%'; b.style.margin = '6px 0'; b.style.padding = '8px 10px'; b.style.borderRadius = '8px';
    b.style.background = '#1e2533'; b.style.color = '#f6fbff'; b.style.border = '1px solid rgba(255,255,255,0.12)';
    b.addEventListener('click', ()=> { try { it.onClick && it.onClick(); } finally { if (!it.stayOpen) hideUI(); } });
    panel.appendChild(b);
  });
  const close = document.createElement('button'); close.textContent = 'Close'; close.style.marginTop = '8px'; close.addEventListener('click', hideUI);
  panel.appendChild(close);
  ui.appendChild(panel);
  ui.style.display = 'flex';
}
function showInfo(text){ showMenu('Info', [{ label: text, onClick: ()=>{}, stayOpen: false }]); }

// Area and player position in a simple plane
// Areas: entry (foyer), bar (left), games (right), corridor (straight), bathrooms (hall), backroom (stage)
let area = 'entry';
const state = { x: 0, y: 140 };
let presenceCount = 0;
let productionState = null;
let wsHub = null;
const speed = 2.4;

// Scene builders per area
function propsForArea(kind){
  switch (kind) {
    case 'entry':
      // Entryway into Josie's Pub
      return [
        { id:'entry-mat',      x: -40,  y:-160, w: 80,  h: 16, color:'#2b2b2b', label:'Welcome' },
        { id:'to-bar',         x: -300, y: -20, w: 70,  h:110, color:'rgba(80,170,200,0.15)', label:'← Bar', hotspot:'bar' },
        { id:'to-games',       x:  240, y: -20, w: 70,  h:110, color:'rgba(200,170,80,0.15)',  label:'→ Gaming Tables', hotspot:'games' },
        { id:'to-corridor',    x:  -10, y: -70, w: 80,  h: 70, color:'rgba(120,200,140,0.16)', label:'↥ Corridor', hotspot:'corridor' },
        { id:'host-stand',     x:  -60, y:  40, w:100,  h: 44, color:'#6b3f22', label:'Host' },
      ];
    case 'bar':
      // Main bar counter on the left
      return [
        { id:'counter',        x: -260, y: -60, w: 200, h: 36, color:'#513018', label:'Bar Counter' },
        { id:'stools-1',       x: -260, y: -20, w: 200, h: 12, color:'#3b2312', label:'Stools' },
        { id:'shelves',        x: -260, y: -120,w: 200, h: 24, color:'#2a2a2a', label:'Shelves' },
        { id:'back-entry',     x:  260, y:  120,w:  70, h: 16, color:'#333', label:'Back to Entry', hotspot:'entry' },
      ];
    case 'games':
      // Right side gaming tables
      return [
        { id:'table-poker',    x: 220, y: -40, w: 110, h: 44, color:'#205c38', label:'Poker Table' },
        { id:'table-dice',     x: 220, y:  30, w: 100, h: 36, color:'#2a6a42', label:"Liar's Dice" },
        { id:'back-entry',     x: 260, y: 130, w:  70, h:  16, color:'#333',   label:'Back to Entry', hotspot:'entry' },
      ];
    case 'corridor':
      // Middle corridor to bathrooms/backroom stage
      return [
        { id:'corridor-run',   x:  -40, y: -100, w: 80,  h: 200, color:'#1a1a1a', label:'Corridor' },
        { id:'back-entry',     x: -180, y:   40, w: 70,  h:  16, color:'#333',   label:'Back to Entry', hotspot:'entry' },
        { id:'to-bath-hall',   x: -140, y:  -10, w: 50,  h:  80, color:'rgba(80,170,200,0.15)', label:'← Bathrooms', hotspot:'bathrooms' },
        { id:'to-backroom',    x:   80, y:  -40, w: 60,  h:  60, color:'rgba(120,200,140,0.16)', label:'↥ Back Room / Stage', hotspot:'backroom' },
      ];
    case 'bathrooms':
      return [
        { id:'bath-tiles',     x: -220, y:-120, w: 480, h: 240, color:'linear-gradient(135deg,#2a2e3a,#1a1e28)', label:'Bathroom Hall' },
        { id:'sink',           x: -120, y: -40, w:  80, h:  30, color:'#888', label:'Sink' },
        { id:'back-corridor',  x:  260, y: 120, w:  70, h:  16, color:'#333', label:'Back to Corridor', hotspot:'corridor' },
      ];
    case 'backroom':
      // Backroom with stage and seating rows
      return [
        { id:'stage',          x: -200, y: -60, w: 420, h: 50, color:'#2b1b15', label:'Stage' },
        { id:'curtain',        x: -200, y:-110, w: 420, h: 20, color:'#5a1d1d', label:'Curtain' },
        { id:'seats-a',        x: -180, y:  10, w: 360, h: 24, color:'#3a2a22', label:'Seats' },
        { id:'seats-b',        x: -180, y:  40, w: 360, h: 24, color:'#3a2a22', label:'Seats' },
        { id:'seats-c',        x: -180, y:  70, w: 360, h: 24, color:'#3a2a22', label:'Seats' },
        { id:'back-corridor',  x:  260, y: 130, w:  70, h:  16, color:'#333',  label:'Back to Corridor', hotspot:'corridor' },
      ];
    default:
      return [];
  }
}

const propsLayer = document.createElement('div');
propsLayer.style.position = 'absolute';
propsLayer.style.left = '50%';
propsLayer.style.top = '50%';
propsLayer.style.transform = 'translate(-50%,-50%)';
world.appendChild(propsLayer);

function clearProps(){ while (propsLayer.firstChild) propsLayer.removeChild(propsLayer.firstChild); }

function mountProps(list){
  list.forEach(function(p){
    const el = document.createElement('div');
    el.id = p.id;
    el.title = p.label || '';
    el.style.position = 'absolute';
    el.style.left = (p.x||0) + 'px';
    el.style.top = (p.y||0) + 'px';
    el.style.width = (p.w||20) + 'px';
    el.style.height = (p.h||20) + 'px';
    el.style.background = p.color || '#444';
    el.style.opacity = '0.92';
    el.style.borderRadius = '8px';
    el.style.outline = '1px solid rgba(255,255,255,.08)';
    if (p.hotspot){ el.style.cursor = 'pointer'; el.addEventListener('click', ()=> switchArea(p.hotspot)); }
    propsLayer.appendChild(el);
  });
}

function switchArea(next){
  area = next;
  // keep player within view
  state.x = 0; state.y = 100;
  renderArea();
}

function renderArea(){
  clearProps();
  const list = propsForArea(area);
  mountProps(list);
  // bind area-specific actions
  try {
    if (area === 'entry'){
      const toBar = document.getElementById('to-bar'); if (toBar) toBar.addEventListener('click', ()=> switchArea('bar'));
      const toGames = document.getElementById('to-games'); if (toGames) toGames.addEventListener('click', ()=> switchArea('games'));
      const toCorr = document.getElementById('to-corridor'); if (toCorr) toCorr.addEventListener('click', ()=> switchArea('corridor'));
      const door = document.getElementById('entry-mat'); if (door) door.addEventListener('click', ()=> { window.location.href = '/outside'; });
    } else if (area === 'bar'){
      const counter = document.getElementById('counter'); if (counter) counter.addEventListener('click', openBartenderMenu);
      const back = document.getElementById('back-entry'); if (back) back.addEventListener('click', ()=> switchArea('entry'));
    } else if (area === 'games'){
      const g1 = document.getElementById('table-poker'); if (g1) g1.addEventListener('click', openGamesMenu);
      const g2 = document.getElementById('table-dice'); if (g2) g2.addEventListener('click', openGamesMenu);
      const back = document.getElementById('back-entry'); if (back) back.addEventListener('click', ()=> switchArea('entry'));
    } else if (area === 'corridor'){
      const toBath = document.getElementById('to-bath-hall'); if (toBath) toBath.addEventListener('click', ()=> switchArea('bathrooms'));
      const toBack = document.getElementById('to-backroom'); if (toBack) toBack.addEventListener('click', ()=> switchArea('backroom'));
      const back = document.getElementById('back-entry'); if (back) back.addEventListener('click', ()=> switchArea('entry'));
    } else if (area === 'bathrooms'){
      const sink = document.getElementById('sink'); if (sink) sink.addEventListener('click', ()=> showInfo('You wash your hands.'));
      const back = document.getElementById('back-corridor'); if (back) back.addEventListener('click', ()=> switchArea('corridor'));
    } else if (area === 'backroom'){
      ['seats-a','seats-b','seats-c'].forEach(id=>{ const s=document.getElementById(id); if (s) s.addEventListener('click', openSeatingMenu); });
      const st = document.getElementById('stage'); if (st) st.addEventListener('click', openStageMenu);
      const back = document.getElementById('back-corridor'); if (back) back.addEventListener('click', ()=> switchArea('corridor'));
    }
  } catch {}
  // backdrop tint per area
  // backdrop tint per area
  const bg = {
    entry: '#0f0c0a',
    bar: '#0e0a08',
    games: '#0e0d09',
    corridor: '#0b0b10',
    bathrooms: '#0c0f14',
    backroom: '#0d0a0a',
  }[area] || '#0f0c0a';
  root.style.background = bg;
  const label = {
    entry: "Entry",
    bar: "Bar",
    games: "Gaming Tables",
    corridor: "Corridor",
    bathrooms: "Bathrooms",
    backroom: "Back Room / Stage",
  }[area] || 'Entry';
  areaBadge.textContent = label;
}

// Player marker (temporary)
const marker = document.createElement('div');
marker.style.position = 'absolute';
marker.style.width = '10px';
marker.style.height = '10px';
marker.style.borderRadius = '6px';
marker.style.background = '#9cf';
marker.style.left = '50%';
marker.style.top = '50%';
marker.style.transform = 'translate(-50%,-50%)';
world.appendChild(marker);

// Neon portraits (optional)
function decoratePortraits(){
  var portraits = [
    { x:-440, y:-220, size:160, names:['/assets/images/portraits/sirp_profile_1.webp','/assets/images/portraits/sirp_profile_1.png'] },
    { x: 420, y:-210, size:180, names:['/assets/images/portraits/sirp_profile_2.webp','/assets/images/portraits/sirp_profile_2.png'] },
    { x:   0, y:-240, size:200, names:['/assets/images/portraits/sirp_profile_3.webp','/assets/images/portraits/sirp_profile_3.png'] }
  ];
  portraits.forEach(function(p){
    var frame = document.createElement('div');
    frame.style.position = 'absolute';
    frame.style.left = p.x + 'px';
    frame.style.top = p.y + 'px';
    frame.style.width = p.size + 'px';
    frame.style.height = p.size + 'px';
    frame.style.borderRadius = '999px';
    frame.style.boxShadow = '0 0 24px rgba(255,215,80,.25) inset, 0 0 48px rgba(255,200,0,.25)';
    frame.style.display = 'grid';
    frame.style.placeItems = 'center';
    frame.style.overflow = 'hidden';
    frame.style.background = 'radial-gradient(50% 50% at 50% 50%, rgba(255,224,128,.10) 0%, rgba(0,0,0,.35) 100%)';
    var img = document.createElement('img');
    img.alt = 'Sir Purphulous';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.filter = 'drop-shadow(0 0 16px rgba(255,220,120,.35))';
    img.style.opacity = '0.95';
    (function tryNext(i){ if(i>=p.names.length){ frame.style.display='none'; return; } img.src=p.names[i]; img.onerror=function(){ tryNext(i+1); }; })(0);
    frame.appendChild(img);
    propsLayer.appendChild(frame);
  });
}

decoratePortraits();
const areaBadge = document.createElement('div');
areaBadge.style.position='absolute';
areaBadge.style.left='12px';
areaBadge.style.top='12px';
areaBadge.style.background='rgba(0,0,0,.5)';
areaBadge.style.color='#fff';
areaBadge.style.padding='4px 8px';
areaBadge.style.borderRadius='8px';
areaBadge.style.font='600 12px system-ui,Segoe UI,Roboto,Helvetica,Arial';
areaBadge.textContent='Entry';
root.appendChild(areaBadge);
renderArea();

// (hint removed; interactions are click-based)

// Movement loop
const keys = new Set();
window.addEventListener('keydown', (e)=> keys.add(e.key.toLowerCase()));
window.addEventListener('keyup',   (e)=> keys.delete(e.key.toLowerCase()));

function loop(){
  var nx = state.x, ny = state.y;
  if (keys.has('w') || keys.has('arrowup'))    ny -= speed;
  if (keys.has('s') || keys.has('arrowdown'))  ny += speed;
  if (keys.has('a') || keys.has('arrowleft'))  nx -= speed;
  if (keys.has('d') || keys.has('arrowright')) nx += speed;
  nx = Math.max(-480, Math.min(480, nx));
  ny = Math.max(-220, Math.min(220, ny));
  if (nx !== state.x || ny !== state.y){
    state.x = nx; state.y = ny;
    marker.style.left = 'calc(50% + ' + nx + 'px)';
    marker.style.top  = 'calc(50% + ' + ny + 'px)';
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// WS presence & production state
try {
  wsHub = new window.WSHub('pub', function (evt) {
    if (!evt || !evt.type) return;
    if (evt.type === 'presence') {
      const users = (evt.payload && evt.payload.users) || [];
      presenceCount = Array.isArray(users) ? users.length : 0;
      crowdChip.textContent = `Crowd: ${presenceCount}`;
    } else if (evt.type === 'production_state') {
      productionState = evt.payload || null;
    }
  });
  wsHub.connect();
} catch {}

// Crowd indicator
const crowdChip = document.createElement('div');
crowdChip.style.position='absolute';
crowdChip.style.right='12px';
crowdChip.style.top='12px';
crowdChip.style.background='rgba(0,0,0,.5)';
crowdChip.style.color='#fff';
crowdChip.style.padding='4px 8px';
crowdChip.style.borderRadius='8px';
crowdChip.style.font='600 12px system-ui,Segoe UI,Roboto,Helvetica,Arial';
crowdChip.textContent='Crowd: 0';
root.appendChild(crowdChip);

function openGamesMenu(){
  showMenu('Gaming Tables', [
    { label: 'Blackjack (soon)', onClick: ()=> showInfo('Blackjack is setting the deck…') },
    { label: "Liar\'s Dice (soon)", onClick: ()=> showInfo("Rattling the dice cup…") },
  ]);
}

function crowdMood(){
  if (presenceCount >= 12) return 'The place erupts in cheers!';
  if (presenceCount >= 5) return 'A good cheer ripples through the room.';
  if (presenceCount >= 2) return 'A couple of folks raise their glasses.';
  return 'It\'s quiet, but the bartender nods appreciatively.';
}

function openBartenderMenu(){
  showMenu('Bartender', [
    { label: 'Talk', onClick: ()=> showInfo('“What\'ll it be?”') },
    { label: 'Order a drink for yourself', onClick: ()=> showInfo('You get a drink. Refreshing.') },
    { label: 'Buy a drink for someone', onClick: ()=> showInfo(presenceCount>1? 'You send a drink down the bar.' : 'There\'s no one else here right now.') },
    { label: 'Buy a round for everyone', onClick: ()=> showInfo(crowdMood()) },
  ]);
}

function openSeatingMenu(){
  const active = !!(productionState && (productionState.on_air === true || productionState.on_air === 'true'));
  if (!active){
    showMenu('Take a Seat', [
      { label: 'Movie Trivia (soon)', onClick: ()=> showInfo('Queuing up trivia…') },
      { label: 'Just watching', onClick: ()=> showInfo('You settle in and watch the room.') },
    ]);
  } else {
    showMenu('Take a Seat', [
      { label: 'Join the show (soon)', onClick: ()=> showInfo('Finding your cue…') },
      { label: 'Just watching', onClick: ()=> showInfo('You settle in and watch the show.') },
    ]);
  }
}

function openStageMenu(){
  showMenu('On Stage', [
    { label: 'Karaoke (soon)', onClick: ()=> showInfo('Warming up the mic…') },
    { label: 'Broadcast (soon)', onClick: ()=> showInfo('Checking camera feeds…') },
    { label: 'Join scheduled event (soon)', onClick: ()=> showInfo('Looking up the schedule…') },
  ]);
}

document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') hideUI(); });

// Ambient music
playLoop('bar_bgm_soft');

// --- 2.5D Scene Manifest loader ---
async function loadSceneManifest(){
  try { const r = await fetch('/assets/bar/bar.scene.json', { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

let MASK_CANVAS = null, MASK_CTX = null, MASK_W = 0, MASK_H = 0;
function setupMask(imgUrl){
  const img = new Image(); img.crossOrigin='anonymous'; img.onload = () => {
    MASK_W = img.naturalWidth; MASK_H = img.naturalHeight;
    MASK_CANVAS = document.createElement('canvas'); MASK_CANVAS.width = MASK_W; MASK_CANVAS.height = MASK_H; MASK_CTX = MASK_CANVAS.getContext('2d');
    MASK_CTX.drawImage(img, 0, 0);
  }; img.src = imgUrl;
}
function isWalkable(x, y){
  if (!MASK_CTX) return true; // no mask => fully walkable
  const sx = Math.round(x + MASK_W/2), sy = Math.round(y + MASK_H/2);
  if (sx < 0 || sy < 0 || sx >= MASK_W || sy >= MASK_H) return false;
  const p = MASK_CTX.getImageData(sx, sy, 1, 1).data; // 0..255
  return (p[3] > 15) && (p[0] + p[1] + p[2] > 300);
}
function addOccluder(p){
  const el = document.createElement(p.img ? 'img' : 'div');
  if (p.img) el.src = p.img; else { el.style.background = 'rgba(0,0,0,0)'; el.style.width=p.w+'px'; el.style.height=p.h+'px'; }
  el.alt = p.id || 'occ'; el.style.position='absolute'; el.style.left = (p.x) + 'px'; el.style.top = (p.y) + 'px';
  el.style.pointerEvents = 'none'; el.style.filter = 'drop-shadow(0 0 16px rgba(255,220,120,.12))'; el.style.zIndex = '20';
  propsLayer.appendChild(el);
}
function addHotspot(h){
  const box = document.createElement('div'); box.style.position='absolute'; box.style.left=h.x+'px'; box.style.top=h.y+'px'; box.style.width=h.w+'px'; box.style.height=h.h+'px';
  box.style.cursor='pointer'; box.title = h.label || h.id; box.style.zIndex='25';
  box.addEventListener('click', () => handleHotspot(h)); propsLayer.appendChild(box);
}
async function initScene2p5(){
  const scene = await loadSceneManifest(); if (!scene) return; // gracefully do nothing when manifest missing
  const bg = document.createElement('img'); bg.src = scene.background.img; bg.alt='bg';
  bg.style.position='absolute'; bg.style.left = scene.background.x + 'px'; bg.style.top = scene.background.y + 'px';
  bg.style.width = (scene.background.w || 1280) + 'px'; bg.style.filter = 'brightness(.98) saturate(1.05)'; bg.style.zIndex = '0';
  propsLayer.appendChild(bg);
  if (scene.pathMask) setupMask(scene.pathMask);
  (scene.occluders||[]).forEach(addOccluder);
  (scene.hotspots||[]).forEach(addHotspot);
}
function handleHotspot(h){ if (h.action === 'wash_hands') { washHands(); } }
function washHands(){
  import('/static/ui/modal.js').then(({showModal}) => {
    const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='10px'; wrap.style.placeItems='center'; wrap.style.minHeight='140px';
    const sink = document.createElement('div'); sink.style.cssText='width:220px;height:110px;border-radius:12px;background:linear-gradient(#dfe5ea,#bfc6cc);box-shadow:inset 0 0 0 2px #b9c0c6,0 10px 28px rgba(0,0,0,.35)';
    const faucet = document.createElement('div'); faucet.style.cssText='width:52px;height:18px;border-radius:9px;background:#9aa3aa;margin-top:-18px;';
    const water = document.createElement('div'); water.style.cssText='width:110px;height:0;border-radius:6px;background:linear-gradient(180deg, rgba(140,220,255,.9), rgba(20,120,220,.7)); transition:height .9s ease;';
    const msg = document.createElement('div'); msg.textContent='Washing…'; sink.appendChild(faucet); sink.appendChild(water); wrap.appendChild(sink); wrap.appendChild(msg);
    const modal = showModal({ title:'Wash Hands', content:wrap, onClose:()=>{} });
    try { AudioBus.play && AudioBus.play('sink_on'); } catch {}
    setTimeout(()=>{ water.style.height='70px'; }, 60);
    setTimeout(()=>{ msg.textContent='All clean.'; try{ AudioBus.play('paper_towel'); }catch{} }, 1400);
    setTimeout(()=>{ try{ AudioBus.play('sink_off'); }catch{}; modal.close(); }, 2100);
  });
}
initScene2p5();

