import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CATALOG, RULES } from './catalog.js';

const $ = id => document.getElementById(id);
const MM = 0.001;
const METAL = { white: 0xf7f9fc, black: 0x111111, silver: 0xc3c6c8 };
// floors: texture, repeat (m per tile set), tint, optional porcelain joint grid [w, h] in m
const SHB = { soft: { dx: 0.008, len: 0.12, o: 0.4, f: 20 }, left: { dx: 0.03, len: 0.13, o: 0.43, f: 16 }, right: { dx: -0.03, len: 0.13, o: 0.43, f: 16 }, top: { dx: 0, len: 0.15, o: 0.4, f: 18 }, sharp: { dx: 0.008, len: 0.08, o: 0.5, f: 5 }, none: { o: 0 }, sun: { o: 0 } };
const FLOORS = { oak: ['herringbone_parquet', 2.25, 0xffffff, null, 1, 2.25], lam: ['laminate_light', 3.0, 0xffffff, null, 0, 2.25], lamD: ['wood_floor_worn', 4.5, 0x7d6656, null, 0, 4.2], conc: ['concrete_floor_worn_001', 2.4, 0xdedcd8, [0.6, 0.6], 1, 2.4], marble: ['marble_01', 2.4, 0xffffff, [0.6, 0.6], 1, 2.4], carpet: [null, 1, 0xffffff, null, 0, 1] };
const TYPES = {
  mesh: 'Полка сетчатая', metal: 'Полка металлическая', ldsp: 'Полка ЛДСП',
  basket: 'Корзина стационарная', pull: 'Корзина выдвижная', rail: 'Штанга для вешалок', shoe: 'Полка для обуви', trouser: 'Брючница выдвижная'
};
const DEPTHS = { mesh: [30, 40, 50], metal: [30, 40], ldsp: [30, 40], basket: [30, 40], pull: [30, 40], rail: [30], shoe: [30, 40], trouser: [40] };
const REAL_DEPTH = { mesh: { 30: 306, 40: 406, 50: 506 }, metal: { 30: 327, 40: 427 }, ldsp: { 30: 330, 40: 430 }, basket: { 30: 340, 40: 440 }, pull: { 30: 340, 40: 440 }, rail: { 30: 300 }, shoe: { 30: 306, 40: 406 }, trouser: { 40: 440 } };
// catalog lengths (mm) per element; the section width follows the chosen length
const LENS = { mesh: [463, 603, 903, 1203], metal: [597], ldsp: [446, 587, 887], basket: [603, 903], pull: [563, 863], fine: [535], shoe: [604, 904], trouser: [463, 603], rail: [520, 640, 940, 1240] };
const lensOf = o => o.t === 'pull' && o.v === 'fine' ? LENS.fine : LENS[o.t];
const depthsOf = o => o.t === 'pull' && o.v === 'fine' ? [40] : DEPTHS[o.t];
const secW = mm => nearest([45, 60, 90, 120], mm / 10);
const LAYOUTS = { straight: 'Прямая (одна стена)', L: 'Угловая, угол слева', Lr: 'Угловая, угол справа', U: 'П-образная' };
const CATS = { shelf: 'Полка', rod: 'Штанга', combo: 'Штанга с полкой', basket: 'Корзина', trouser: 'Брючница' };
const rowCat = o => o.g ? 'combo' : catOf(o.t);
const catOf = t => t === 'rail' ? 'rod' : t === 'basket' || t === 'pull' ? 'basket' : t === 'trouser' ? 'trouser' : 'shelf';
const VARS = { shelf: [['mesh', 'Сетчатая'], ['metal', 'Металлическая'], ['ldsp', 'ЛДСП'], ['shoe', 'Для обуви']], rod: [['rail', 'Штанга на кронштейнах']], combo: [['mesh', 'Сетчатая полка + штанга'], ['metal', 'Металлическая полка + штанга'], ['ldsp', 'Полка ЛДСП + штанга']], basket: [['pull|mesh', 'Сетчатая выдвижная'], ['basket|mesh', 'Стационарная']], trouser: [['trouser', 'Выдвижная']] };
const isBasket = t => t === 'basket' || t === 'pull';
const perfOf = o => (o.v || (S.basketStyle === 'plastic' ? 'perf' : 'mesh')) === 'perf';
const fineOf = o => o.v === 'fine';
const WALLNAMES0 = ['Основная стена', 'Дополнительная стена', 'Дополнительная стена'];
// v13e: in the L layout the LEFT (side) wall is the main one
const WALLNAMES = new Proxy(WALLNAMES0, { get: (t, k) => (k === '0' || k === '1') && typeof S !== 'undefined' && S.layout === 'L' ? (k === '0' ? 'Дополнительная стена' : 'Основная стена') : t[k] });
function mainWi() { return typeof S !== 'undefined' && S && S.layout === 'L' ? 1 : 0; }

function sec(w, items) { return { w, items }; }
function it(t, d, y, h) { const o = { t, d, y }; if (h) o.h = h; return o; }
// v13b: ONE shared set of standard levels for auto placement (start layout + presets); manual moves stay free
const LV = Object.freeze({ top: 192, rod: 182, sh: [192, 152, 112, 72, 40], mid: 112, bk: [75, 57, 39], shoe: [55, 31] });
function defaults() {
  const D = defaults0(); let q = 0; D.walls.forEach(w => w.sections.forEach(sc => { const sh = sc.items.find(o => o.t === 'mesh' && o.y === LV.top), r = sc.items.find(o => o.t === 'rail' && o.y === LV.rod); if (sh && r) { q++; sh.g = 'g' + q; sh.q = q; r.lk = sh.g; } })); D.q = q; return D; } // v13b: start rods are combined «Полка со штангой» (Разделить splits them)
function defaults0() {
  return {
    __fresh: true, v10: 1, v4: 1, v5: 1, v7: 1, v8: 1, layout: 'L', metal: 'black', wall: '#fbf8f3', wallCustom: true, wallFin: 'relief', wallVar: { paint: 'matte', plaster: 'koroed', paper: 'linen', relief: 'brick' }, v11m: 1, floor: 'lam', preset: 'warm', view: 'all', decor: false, card: null, postH: 1920, railTop: 213, plants: [], dims: false, dm: { o: false, s: false, h: false, g: false, sd: false }, dimC: 'auto', dimStyle: 'bold', studio: false, rug: null, room: { shOn: true, shP: 'soft', winL: 'off', glareM: 'soft', glare: 0.3, shadow: 0.55, shBlur: 4, shDist: 0.12, ceiling: false, skirting: true, extra: 250 },
    walls: [
      { gap: 0, gapR: 0, sections: [sec(90, [it('mesh', 40, 192), it('rail', 30, LV.rod), it('mesh', 40, 40)]), sec(90, [it('mesh', 40, 192), it('mesh', 40, 152), it('mesh', 40, 112), Object.assign(it('pull', 40, LV.bk[0], 181), { v: 'mesh' }), Object.assign(it('pull', 40, LV.bk[1], 181), { v: 'mesh' })])] },
      { gap: 50, sections: [sec(60, [it('mesh', 40, 192), it('mesh', 40, 152), it('mesh', 40, 112), it('mesh', 40, 72)]), sec(90, [it('mesh', 40, 192), it('rail', 30, LV.rod), it('mesh', 40, 40)])] },
      { gap: 50, sections: [sec(90, [it('mesh', 40, 192), it('rail', 30, LV.rod)]), sec(60, [it('mesh', 40, 192), it('mesh', 40, 152), it('mesh', 40, 112), it('shoe', 40, LV.shoe[1])])] }
    ]
  };
}
const ROOMDEF = { shP: 'soft', winL: 'off', glareM: 'soft', win: false, door: false, winX: 0, cornice: false, extra: 250, ceiling: false, ceilH: 275, skirting: true, lamps: false, glare: 0.3, shadow: 0.5, angle: 90, skirtColor: '#ffffff', lampType: 'spot', glow: 'none', shOn: true, shAng: 20, shBlur: 4, shDist: 0.12, shadow: 0.55 };
function migrate(S) { S.room = Object.assign({}, ROOMDEF, S.room || {}); if (!S.v13a) { S.v13a = 1; /* v13b (from v11u): only Titan catalog baskets */ S.basketStyle = 'mesh'; if (!['pull|mesh', 'basket|mesh'].includes(S.bKind)) S.bKind = 'pull|mesh'; (S.walls || []).forEach(w => (w.sections || []).forEach(sc => (sc.items || []).forEach(o => { if (o && (o.t === 'basket' || o.t === 'pull')) { o.v = 'mesh'; if (o.t === 'basket') o.h = 85; else o.h = (o.h || 85) > 130 ? 181 : 85; if (![30, 40].includes(o.d)) o.d = 40; } }))); } if (!S.v11m) { S.v11m = 1; Object.assign(S, { wall: '#fbf8f3', wallCustom: true, wallFin: 'relief', floor: 'lam', metal: 'black' }); S.wallVar = Object.assign({}, S.wallVar, { relief: 'brick' }); } if (!S.v10) { S.v10 = 1; if (S.dimC === 'white') S.dimC = 'auto'; delete S.dims; } if (!Array.isArray(S.props)) S.props = []; if (!S.v4) { S.v4 = 1; Object.assign(S.room, { shBlur: 4, shDist: 0.12, shadow: 0.55 }); } S.room.lampType = 'spot'; if (!S.v7) { S.v7 = 1; const d = S.dm || {}; S.dm = { o: !!(d.t || d.v), s: !!d.s, h: false, g: !!d.c, sd: false }; S.room.shAng = Math.max(-35, Math.min(35, S.room.shAng ?? 20)); S.room.shBlur = Math.min(8, S.room.shBlur ?? 4); S.room.shadow = Math.max(0.2, Math.min(0.8, S.room.shadow ?? 0.55)); } if (S.metal === 'graphite') S.metal = 'black'; if (!METAL[S.metal]) S.metal = 'white'; if (S.rod && S.rod !== 'white') S.rod = 'chrome'; if (!S.dm || !('o' in S.dm)) S.dm = { o: false, s: false, h: false, g: false, sd: false }; S.dimC = S.dimC === 'black' ? 'black' : 'white'; S.dimStyle = S.dimStyle === 'thin' ? 'thin' : 'bold'; if (!S.basketStyle) S.basketStyle = 'mesh'; if (!S.prices) S.prices = {}; if (!S.depth) S.depth = 40;
  if (!S.v8) { S.v8 = 1; if (S.wall === '#b3b1ad') S.wall = '#a9a49c'; S.room.shP = S.room.shOn === false ? 'none' : 'soft'; S.room.extra = Math.max(250, S.room.extra || 0); S.room.glareM = 'soft'; if (S.rug === true) S.rug = { shape: 'rect', pile: 'flat' }; }
  if (S.floor === 'tile') S.floor = 'marble'; if (S.rug && typeof S.rug !== 'object') S.rug = { shape: 'rect', pile: 'flat' }; if (!S.plants) S.plants = []; if (!S.wallVar) S.wallVar = { paint: 'matte', plaster: 'koroed', paper: 'linen' }; if (!['soft', 'left', 'right', 'top', 'sharp', 'sun', 'none'].includes(S.room.shP)) S.room.shP = 'soft'; if (!['off', 'wall', 'floor', 'both'].includes(S.room.winL)) S.room.winL = 'off'; if (!['soft', 'bright', 'off'].includes(S.room.glareM)) S.room.glareM = 'soft';
  // v9: ceiling always on (a bit higher), walls at full width, short attached shadows
  if (!S.v9) { S.v9 = 1; S.room.ceilH = Math.max(285, S.room.ceilH || 0); if (S.room.glareM === 'bright') S.room.glareM = 'soft'; }
  if (!S.v91) { S.v91 = 1; S.room.ceilH = Math.max(300, S.room.ceilH || 0); S.__gapFix = true; }
  if (!S.v12e) { S.v12e = 1; S.room.ceiling = true; } S.room.extra = 400; /* v12e: ceiling follows the Потолок toggle */ S.room.ceilH = Math.max(230, Math.min(400, S.room.ceilH || 300));
  S.walls.forEach(w => { if (w.gap == null) w.gap = 0; }); if (S.walls[0].gapR == null) S.walls[0].gapR = 0; return S; }
function setTemplate(t) {
  const m = y => ({ t: 'mesh', d: 40, y }), rl = y => ({ t: 'rail', d: 30, y: y + 2 }), sh = y => ({ t: 'shoe', d: 40, y }), pu = (y, h) => ({ t: 'pull', d: 40, y, h });
  const A = () => ({ w: 90, items: [m(LV.top), rl(LV.rod - 2), m(LV.sh[4])] }), B = () => ({ w: 90, items: LV.sh.map(m) }), C = () => ({ w: 60, items: [m(LV.sh[0]), m(LV.sh[1]), pu(LV.bk[0], 181), pu(LV.bk[1], 181), sh(LV.shoe[1])] }), D = () => ({ w: 90, items: [m(LV.top), rl(LV.rod - 2), rl(LV.mid - 12)] });
  S.walls[0].gap = S.walls[0].gap || 0;
  if (t === 'p2') { S.layout = 'straight'; S.walls[0].sections = [A(), B()]; }
  if (t === 'p3') { S.layout = 'straight'; S.walls[0].sections = [A(), B(), D()]; }
  if (t === 'p6') { S.layout = 'straight'; S.walls[0].sections = [A(), B(), C(), C(), B(), D()]; }
  if (t === 'l23') { S.layout = 'L'; S.walls[0].sections = [A(), B()]; S.walls[1].gap = Math.max(S.walls[1].gap || 0, 46); S.walls[1].sections = [B(), D()]; }
  if (t === 'zero') { S.layout = 'straight'; S.walls[0].sections = [{ w: 90, items: [] }, { w: 90, items: [] }]; }
  cur = { w: mainWi(), s: 0, it: -1 }; fillGeneral(); rebuild(); renderSec(); // templates never move the camera (only Сброс / Ракурс)
  if (['p2', 'p3', 'p6', 'zero', 'l23'].includes(t) && orb.on) { const c = bbox.getCenter(new THREE.Vector3()), corner = t === 'l23', e = (corner ? 10 : 8) * Math.PI / 180; orb.T.copy(c); orb.az = corner ? frontAz() : 0; orb.snapAz = false; orb.snapTo = null; orb.R = 6 * Math.cos(e); orb.h = c.y + 6 * Math.sin(e); camera.fov = LENSF(); camera.updateProjectionMatrix(); fitView(); if (corner) { orb.R *= 1.12; orb.h = orb.T.y + (orb.h - orb.T.y) * 1.12; } applyCam(); } // straight templates: frontal view
}
function cardPreset() {
  const S = defaults(), m = y => ({ t: 'mesh', d: 40, y }), rl = y => ({ t: 'rail', d: 30, y });
  Object.assign(S, { layout: 'L', view: 'fill', preset: 'warm', wall: '#ecdcc8', floor: 'lam', railTop: 205, postH: 1920, metal: 'white', rod: 'chrome', decor: true });
  S.walls[0].gap = 0; S.walls[0].sections = [{ w: 90, items: [m(190), rl(178), m(42)] }, { w: 60, items: [m(190), rl(178), m(42)] }];
  S.walls[1].gap = 46; S.walls[1].sections = [{ w: 60, items: [m(190), m(140), m(90), m(42)] }];
  S.card = Object.assign(cardDefaults(), { size: '156 × 110 × 205 см' }); S._cam = 'card'; return S;
}
// saved state is checked field by field on load; anything broken falls back to the default value, a badly corrupted state to the full default
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : d);
function validState(v) {
  const D = defaults(); if (!v || typeof v !== 'object' || !Array.isArray(v.walls) || !v.walls.length) return null;
  const ok = (k, set) => { if (!set.includes(v[k])) v[k] = D[k]; };
  ok('layout', ['L', 'Lr', 'U', 'straight']); ok('metal', Object.keys(METAL)); ok('view', ['all', 'frame', 'fill']);
  if (!FLOORS[v.floor]) v.floor = D.floor; if (v.rod !== 'white' && v.rod !== 'chrome') v.rod = D.rod || 'chrome';
  v.railTop = num(v.railTop, 120, 300, D.railTop); v.postH = num(v.postH, 500, 3000, D.postH);
  if (typeof v.wall !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.wall)) v.wall = D.wall;
  let bad = 0;
  while (v.walls.length < D.walls.length) v.walls.push(D.walls[v.walls.length]);
  v.walls = v.walls.slice(0, D.walls.length).map((w, wi) => { if (!w || !Array.isArray(w.sections)) { bad++; return D.walls[wi]; }
    w.gap = num(w.gap, 0, 300, D.walls[wi].gap || 0); if (w.gapR != null) w.gapR = num(w.gapR, 0, 300, 0);
    w.sections = w.sections.filter(s => s && typeof s === 'object').map(s => { s.w = num(s.w, 10, 200, 60);
      s.items = (Array.isArray(s.items) ? s.items : []).filter(o => o && REAL_DEPTH[o.t] && typeof o.y === 'number' && isFinite(o.y) && o.y >= 0 && o.y <= 300);
      s.items.forEach(o => { if (!REAL_DEPTH[o.t][o.d]) o.d = +Object.keys(REAL_DEPTH[o.t])[0]; if (o.h != null) o.h = num(o.h, 20, 400, 85);
        if (o.pr != null) o.pr = Array.isArray(o.pr) ? o.pr.filter(p => p && PROPK[p.k]).map(p => ({ k: p.k, u: num(p.u, 0, 1, 0.5) })) : []; });
      return s; });
    if (!w.sections.length && wi === 0) bad++; return w; });
  if (bad > 1) return null;
  if (v.plants != null && !Array.isArray(v.plants)) v.plants = [];
  if (Array.isArray(v.plants)) v.plants = v.plants.filter(p => p && PLANTS[p.k] && isFinite(p.x) && isFinite(p.z)).map(p => ({ ...p, s: num(p.s, 0.3, 3, 1), r: num(p.r, -100, 100, 0) }));
  if (v.room != null && typeof v.room !== 'object') delete v.room; if (v.dm != null && typeof v.dm !== 'object') delete v.dm;
  return v;
}
function safeMigrate(v) { try { const s = validState(v); return s ? migrate(s) : migrate(defaults()); } catch (e) { console.warn('state reset', e); try { localStorage.removeItem('gs_auto'); } catch (er) {} return migrate(defaults()); } }
function clearSaved() { try { Object.keys(localStorage).filter(k => k.startsWith('gs_') && k !== 'gs_snd').forEach(k => localStorage.removeItem(k)); } catch (e) {} }
const QS = new URLSearchParams(location.search);
if (QS.get('reset') === '1') { clearSaved(); QS.delete('reset'); try { history.replaceState(null, '', location.pathname + (QS.toString() ? '?' + QS : '') + location.hash); } catch (e) {} }
let S = (() => { const v = load('gs_auto'); return v && v.v5 ? safeMigrate(v) : migrate(defaults()); })();
try {
  if (QS.get('preset') === 'card') S = migrate(cardPreset());
  else if (QS.get('cfg')) { const v = JSON.parse(decodeURIComponent(escape(atob(QS.get('cfg').replace(/-/g, '+').replace(/_/g, '/'))))); if (v && v.walls) S = safeMigrate(v); }
} catch (e) { console.warn('cfg', e); } if (!FLOORS[S.floor]) S.floor = S.floor === 'parquet' || S.floor === 'walnut' ? 'oak' : S.floor === 'tile' ? 'marble' : 'lam'; if (!S.view) S.view = 'all'; S = migrate(S); if (!S.basketStyle) S.basketStyle = 'mesh'; if (!S.prices) S.prices = {}; if (!S.preset) S.preset = 'none'; S.dims = true;
let cur = { w: mainWi(), s: 0, it: -1 }, drag = null;
function load(k) { try { const v = JSON.parse(localStorage.getItem(k)); return v && v.walls ? v : null; } catch (e) { return null; } }

// ---------- renderer ----------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
const PR_MAX = Math.min(devicePixelRatio, innerWidth < 800 ? 2 : 1.5), PR_MIN = innerWidth < 800 ? Math.min(devicePixelRatio, 2) : 1; let PR = PR_MAX;
renderer.setPixelRatio(PR);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false; // shadow map only re-rendered after changes
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = CAMEXP();
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
// indoor HDRI (Poly Haven studio_small_09, CC0) for metal/chrome reflections; background unchanged
import('three/addons/loaders/RGBELoader.js').then(({ RGBELoader }) => new RGBELoader().load('tex/studio_small_09_1k.hdr', t => { t.mapping = THREE.EquirectangularReflectionMapping; window.HDR_ENV = pm.fromEquirectangular(t).texture; t.dispose(); try { applyGlareShadow(); } catch (e) {} })).catch(() => {});
// SSAO only for the 📷 snapshot (loaded in the background, never used in the live view)
let POST = null; Promise.all(['postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/SAOPass.js', 'postprocessing/OutputPass.js'].map(f => import('three/addons/' + f))).then(m => { POST = Object.assign({}, ...m); }).catch(() => {});
const camera = new THREE.PerspectiveCamera(35, 1, 0.08, 40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minPolarAngle = 0.05; controls.maxPolarAngle = Math.PI - 0.05; controls.minDistance = 0.5; controls.maxDistance = 45;
const hemi = new THREE.HemisphereLight(0xffffff, 0xd8cfc2, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
const sc = sun.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 20;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xfff4e6, 0.35); fill.position.set(-3, 2, 4); scene.add(fill);
const sideFill = new THREE.DirectionalLight(0xffe6c8, 0); scene.add(sideFill, sideFill.target);

const room = new THREE.Group(); scene.add(room);
const model = new THREE.Group(); scene.add(model);
const dimsG = new THREE.Group(); scene.add(dimsG);
let catcher;

// ---------- textures ----------
const SLOTC = {};
// perforation with soft AO around the slot and a light lower lip (edge highlight) so it reads on every color
function slotTex(horizontal, dark) {
  const k = (horizontal ? 'h' : 'v') + (dark ? 'd' : 'l'); if (SLOTC[k]) return SLOTC[k];
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  const slot = (x, y, w, h) => { g.save(); g.filter = 'blur(2px)'; g.fillStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.22)'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.restore();
    g.fillStyle = dark ? '#d8d8d8' : '#ffffff'; g.fillRect(x, y + h, w, 2); g.fillStyle = dark ? '#000' : '#2e2e2e'; g.fillRect(x, y, w, h); };
  if (!horizontal) { slot(14, 10, 10, 40); slot(40, 10, 10, 40); } else slot(10, 22, 40, 14);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; SLOTC[k] = t; return t;
}
const TL = new THREE.TextureLoader(), TC = {};
function tex(name, srgb, rep) {
  const k = name + rep; if (!TC[k]) { const t = TL.load('tex/' + name + '.jpg', () => {}); t.wrapS = t.wrapT = THREE.RepeatWrapping; const rr = String(rep).split('x'); t.repeat.set(+rr[0], +(rr[1] || rr[0])); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; TC[k] = t; }
  return TC[k];
}
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; return t; }
let CARPET;
function carpetTex() {
  if (!CARPET) { let sd = 3; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const col = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#b9ab98'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60000; i++) { const l = 150 + rnd() * 50; g.fillStyle = `rgba(${l + 25},${l + 12},${l - 6},0.55)`; g.fillRect(rnd() * w, rnd() * h, 1.6, 1.6); } }, 6);
    col.colorSpace = THREE.SRGBColorSpace;
    const nor = canvasTex(512, 512, (g, w, h) => { g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40000; i++) { g.fillStyle = `rgb(${100 + rnd() * 56},${100 + rnd() * 56},255)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } }, 6);
    CARPET = [col, nor]; }
  return CARPET;
}
function floorMat() {
  const [n, mx, tint, , , my] = FLOORS[S.floor] || FLOORS.oak, warm = S.preset === 'warm', rep = (60 / mx).toFixed(3) + 'x' + (60 / (my || mx)).toFixed(3);
  if (!n) { const [c, nn] = carpetTex(); return new THREE.MeshStandardMaterial({ color: warm ? 0xfff2e2 : 0xffffff, map: c, normalMap: nn, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, envMapIntensity: 0.2, userData: { floor: true } }); }
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tint).multiply(new THREE.Color(warm ? 0xfff6ec : 0xffffff)), map: tex(n + '_diff', true, rep), normalMap: tex(n + '_nor_gl', false, rep), roughnessMap: tex(n + '_rough', false, rep), roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2), clearcoat: 0, envMapIntensity: 0.15, specularIntensity: 0.06 }); /* v13g: no floor glare */
}
let PAPER;
function paperTex() {
  if (!PAPER) PAPER = canvasTex(256, 512, (g, w, h) => { g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgb(150,128,255)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgb(106,128,255)'; g.fillRect(x + 2, 0, 2, h); }
    for (let y = 32; y < h; y += 64) for (let x = 16; x < w; x += 64) { g.strokeStyle = 'rgb(150,150,255)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x + (y % 128 ? 32 : 0), y, 10, 18, 0, 0, 7); g.stroke(); } }, 2);
  return PAPER;
}
// walls: unlit exact color (identical on every wall) with a baked finish texture tinted by the wall color; shadows via a ShadowMaterial overlay
const FINS = { paint: [['matte', 'Матовая'], ['satin', 'Сатин'], ['roller', 'Валик'], ['eggs', 'Яичная скорлупа'], ['lime', 'Известковая']], relief: [['brick', 'Белый кирпич'], ['stone', 'Декор. камень'], ['slats', 'Рейки'], ['woodp', 'Деревянные панели'], ['conc2', 'Бетон']], plaster: [['beige', 'Теплая бежевая'], ['koroed', 'Короед, крошка'], ['venet', 'Венецианка'], ['beton', 'Бетон'], ['silk', 'Шелк'], ['trav', 'Травертин']], paper: [['linen', 'Лен'], ['geo', 'Геометрия'], ['botan', 'Ботаника'], ['stripe', 'Полоска'], ['damask', 'Дамаск']] };
const FINK = { brick: 0.52, beige: 1.3, conc2: 1.2, woodp: 0.6, slats: 0.48, stone: 0.9, eggs: 0.9, lime: 1.2, matte: 0.9, satin: 1.4, roller: 0.8, koroed: 0.7, venet: 1.3, beton: 1.6, silk: 0.6, trav: 1.2, linen: 0.45, geo: 0.5, botan: 0.75, stripe: 0.6, damask: 0.7 };
const FIN = {};
function finVar() { const f = S.wallFin || 'paint', v = S.wallVar && S.wallVar[f]; return FINS[f].some(p => p[0] === v) ? v : FINS[f][0][0]; }
function finishTex(v) {
  if (FIN[v]) return FIN[v];
  let sd = 11 + v.length * 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), w = 512, h = 512;
  const wrap = f => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { g.save(); g.translate(dx, dy); f(); g.restore(); } };
  const blob = (x, y, r, col) => wrap(() => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); });
  const specks = (n, lo, a, s = 1.4) => { for (let i = 0; i < n; i++) { const l = lo + rnd() * (255 - lo); g.fillStyle = `rgba(${l},${l},${l},${a})`; g.fillRect(rnd() * w, rnd() * h, s, s); } };
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  if (RELV.includes(v)) { const hc = document.createElement('canvas'); hc.width = hc.height = 512; reliefDraw(v, g, hc.getContext('2d'), w, h, rnd); RELIEF[v] = hc; }
  else if (v === 'matte') specks(16000, 236, 0.22);
  else if (v === 'satin') { for (let x = 0; x < w; x += 4) { const l = 248 + 7 * Math.sin(x / w * Math.PI * 2); g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(x, 0, 4, h); } specks(6000, 242, 0.15, 1); }
  else if (v === 'roller') { for (let x = 0; x < w; x += 128) { g.fillStyle = 'rgba(0,0,0,0.018)'; g.fillRect(x, 0, 64, h); } for (let i = 0; i < 9000; i++) { const x = rnd() * w, y = rnd() * h, r = 0.8 + rnd() * 2.4, l = 205 + rnd() * 40; g.fillStyle = `rgba(${l},${l},${l},0.28)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - r * 0.4, y - r * 0.4, r * 0.5, 0, 7); g.fill(); } }
  else if (v === 'koroed') { specks(30000, 215, 0.35, 1.6); for (let i = 0; i < 1300; i++) { const x = rnd() * w, y = rnd() * h, a = Math.PI / 2 + (rnd() - 0.5) * 1.3, L = 6 + rnd() * 22, x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L, mx = (x + x2) / 2 + (rnd() - 0.5) * 6, my = (y + y2) / 2;
      wrap(() => { g.lineCap = 'round'; g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 2 + rnd() * 1.6; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x2, y2); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 1.6, y + 1); g.quadraticCurveTo(mx + 1.6, my + 1, x2 + 1.6, y2 + 1); g.stroke(); }); } }
  else if (v === 'venet') { for (let i = 0; i < 260; i++) { const l = 222 + rnd() * 33; blob(rnd() * w, rnd() * h, 30 + rnd() * 90, `rgba(${l},${l},${l},0.32)`); } g.lineCap = 'round'; for (let i = 0; i < 160; i++) { const x = rnd() * w, y = rnd() * h, a = rnd() * 3, L = 40 + rnd() * 90; wrap(() => { g.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.35})`; g.lineWidth = 2 + rnd() * 5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.2 + 10, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.3); g.stroke(); }); } for (let i = 0; i < 30; i++) { const x = rnd() * w, y = rnd() * h; wrap(() => { g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 40, y + 20, x + 60, y - 30, x + 120, y + 10); g.stroke(); }); } }
  else if (v === 'beton') { g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { const l = 195 + rnd() * 55; blob(rnd() * w, rnd() * h, 10 + rnd() * 60, `rgba(${l},${l},${l},0.3)`); } specks(20000, 180, 0.2, 1.2); for (let i = 0; i < 380; i++) { const x = rnd() * w, y = rnd() * h, r = 0.6 + rnd() * 1.8; g.fillStyle = 'rgba(40,40,40,0.4)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x + r * 0.6, y + r * 0.6, r * 0.6, 0, 7); g.fill(); } g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, 255, w, 2); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, 257, w, 1); }
  else if (v === 'silk') { for (let i = 0; i < 14000; i++) { const x = rnd() * w, y = rnd() * h, a = rnd() * 6.3, L = 2 + rnd() * 6, l = 215 + rnd() * 40; g.strokeStyle = `rgba(${l},${l},${l},0.45)`; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } specks(1500, 255, 0.9, 1); }
  else if (v === 'trav') { g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, w, h); let y = 0; while (y < h) { const bh = 3 + rnd() * 18, l = 228 + rnd() * 27; g.fillStyle = `rgba(${l},${l - 2},${l - 5},0.7)`; g.fillRect(0, y, w, bh); y += bh; } for (let i = 0; i < 420; i++) { const x = rnd() * w, yy = rnd() * h, rw = 2 + rnd() * 9, rh = 0.8 + rnd() * 2; wrap(() => { g.fillStyle = 'rgba(70,60,50,0.28)'; g.beginPath(); g.ellipse(x, yy, rw, rh, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(x, yy + rh, rw * 0.8, rh * 0.5, 0, 0, 7); g.fill(); }); } specks(8000, 210, 0.2); }
  else if (v === 'linen') { for (let y = 0; y < h; y += 2) { const l = 236 + rnd() * 19; g.fillStyle = `rgba(${l},${l},${l},0.6)`; g.fillRect(0, y, w, 1); } for (let x = 0; x < w; x += 2) { const l = 232 + rnd() * 23; g.fillStyle = `rgba(${l},${l},${l},0.45)`; g.fillRect(x, 0, 1, h); } for (let i = 0; i < 400; i++) { const l = 220 + rnd() * 20; g.fillStyle = `rgba(${l},${l},${l},0.5)`; g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 30, 1); } }
  else if (v === 'geo') { specks(6000, 240, 0.2, 1); g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 1.6; const s = 64; for (let y = 0; y <= h; y += s) for (let x = 0; x <= w; x += s) { g.beginPath(); g.moveTo(x, y - s / 2); g.lineTo(x + s / 2, y); g.lineTo(x, y + s / 2); g.lineTo(x - s / 2, y); g.closePath(); g.stroke(); g.beginPath(); g.arc(x, y, 4, 0, 7); g.stroke(); } g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; for (let y = 0; y <= h; y += s) for (let x = 0; x <= w; x += s) { g.beginPath(); g.moveTo(x + 1, y - s / 2 + 1); g.lineTo(x + s / 2 + 1, y + 1); g.stroke(); } }
  else if (v === 'botan') { specks(6000, 240, 0.2, 1); const leaf = (x, y, a, L) => wrap(() => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(0,0,0,0.085)'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -L * 0.28, L, 0); g.quadraticCurveTo(L * 0.5, L * 0.28, 0, 0); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(2, 0); g.lineTo(L - 4, 0); g.stroke(); g.restore(); });
    for (let b = 0; b < 7; b++) { let x = rnd() * w, y = rnd() * h, a = rnd() * 6.3; for (let k = 0; k < 9; k++) { const nx = x + Math.cos(a) * 22, ny = y + Math.sin(a) * 22; wrap(() => { g.strokeStyle = 'rgba(0,0,0,0.09)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); }); leaf(nx, ny, a + 0.9, 26 + rnd() * 10); leaf(nx, ny, a - 0.9, 26 + rnd() * 10); x = nx; y = ny; a += (rnd() - 0.5) * 0.5; } } }
  else if (v === 'stripe') { for (let x = 0; x < w; x++) { const t = (x % 256) / 256, k = 0.5 + 0.5 * Math.tanh(Math.sin(t * Math.PI * 2) * 4), l = 255 - 14 * k; g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(x, 0, 1, h); } specks(5000, 240, 0.2, 1); }
  else if (v === 'damask') { specks(6000, 242, 0.2, 1); const motif = (cx, cy) => { g.save(); g.translate(cx, cy); for (const sx of [1, -1]) { g.save(); g.scale(sx, 1); g.fillStyle = 'rgba(0,0,0,0.075)'; g.beginPath(); g.moveTo(0, -100); g.bezierCurveTo(30, -80, 60, -60, 40, -20); g.bezierCurveTo(80, -30, 90, 20, 50, 30); g.bezierCurveTo(70, 60, 40, 90, 0, 100); g.bezierCurveTo(10, 60, 30, 40, 18, 10); g.bezierCurveTo(30, -20, 8, -40, 0, -60); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2; g.stroke(); g.beginPath(); g.ellipse(26, -4, 8, 16, 0.4, 0, 7); g.fill(); g.restore(); } g.fillStyle = 'rgba(0,0,0,0.07)'; g.beginPath(); g.ellipse(0, 0, 6, 22, 0, 0, 7); g.fill(); g.restore(); };
    wrap(() => { motif(128, 128); motif(384, 384); motif(384, -128 + 0); }); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; FIN[v] = t; return t;
}
// ---- v10 relief finishes: drawn color + height; height -> normal map; lit wall material keeps the chosen color
const RELIEF = {};
function reliefDraw(v, g, hg, w, h, rnd) {
  const R = (x, y, ww, hh, col, hv) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); hg.fillStyle = `rgb(${hv},${hv},${hv})`; hg.fillRect(x, y, ww, hh); };
  const noise = (n, a, s, hgA) => { for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h, l = 200 + rnd() * 55, q = rnd() * 255; g.fillStyle = `rgba(${l},${l},${l},${a})`; g.fillRect(x, y, s, s); hg.fillStyle = `rgba(${q},${q},${q},${hgA})`; hg.fillRect(x, y, s, s); } };
  if (v === 'brick') { // white painted brick 250x65 + 10 mm joints, tile 0.52 x 0.45 m
    R(0, 0, w, h, '#e9e6e1', 40); const rows = 6, bh = h / rows, bw = w / 2, j = 9;
    for (let r = 0; r < rows; r++) for (let k = -1; k < 3; k++) { const x = k * bw + (r % 2 ? bw / 2 : 0) + j / 2, y = r * bh + j / 2, ww = bw - j, hh = bh - j, l = 244 + rnd() * 10, sh = 215 + rnd() * 30;
      g.fillStyle = `rgb(${l},${l - 1},${l - 4})`; g.beginPath(); g.roundRect(x, y, ww, hh, 5); g.fill();
      const gr = hg.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, `rgb(${sh - 40},${sh - 40},${sh - 40})`); gr.addColorStop(0.15, `rgb(${sh},${sh},${sh})`); gr.addColorStop(0.85, `rgb(${sh},${sh},${sh})`); gr.addColorStop(1, `rgb(${sh - 50},${sh - 50},${sh - 50})`); hg.fillStyle = gr; hg.beginPath(); hg.roundRect(x, y, ww, hh, 6); hg.fill();
      for (let i = 0; i < 60; i++) { const px = x + rnd() * ww, py = y + rnd() * hh, rr = 1 + rnd() * 4, d = rnd() * 90; hg.fillStyle = `rgba(0,0,0,${d / 255})`; hg.beginPath(); hg.arc(px, py, rr, 0, 7); hg.fill(); g.fillStyle = 'rgba(120,110,100,0.06)'; g.beginPath(); g.arc(px, py, rr, 0, 7); g.fill(); } }
    noise(9000, 0.18, 1.3, 0.25); }
  else if (v === 'beige') { // warm beige lime plaster, soft trowel clouds
    R(0, 0, w, h, '#f1e3cf', 128); for (let i = 0; i < 420; i++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 80, l = rnd(); for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, l > 0.5 ? 'rgba(255,248,236,0.22)' : 'rgba(214,190,160,0.16)'); gr.addColorStop(1, l > 0.5 ? 'rgba(255,248,236,0)' : 'rgba(214,190,160,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
      const q = l > 0.5 ? 160 : 100, gh = hg.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gh.addColorStop(0, `rgba(${q},${q},${q},0.25)`); gh.addColorStop(1, `rgba(${q},${q},${q},0)`); hg.fillStyle = gh; hg.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r); } }
    noise(14000, 0.12, 1.2, 0.3); }
  else if (v === 'conc2') { R(0, 0, w, h, '#e4e2de', 128); for (let i = 0; i < 600; i++) { const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 50, l = 200 + rnd() * 50; g.fillStyle = `rgba(${l},${l},${l - 3},0.18)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    noise(26000, 0.25, 1.4, 0.4); for (const [x, y] of [[128, 128], [384, 128], [128, 384], [384, 384]]) { g.fillStyle = 'rgba(90,88,84,0.55)'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); hg.fillStyle = '#000'; hg.beginPath(); hg.arc(x, y, 9, 0, 7); hg.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); hg.fillStyle = '#303030'; hg.fillRect(0, 0, w, 3); hg.fillRect(0, 0, 3, h); }
  else if (v === 'woodp') { const pw = w / 4; for (let k = 0; k < 4; k++) { const base = 205 + rnd() * 25; R(k * pw, 0, pw, h, `rgb(${base},${base - 22},${base - 52})`, 200);
      for (let i = 0; i < 70; i++) { const x = k * pw + rnd() * pw, l = base - 30 + rnd() * 25; g.strokeStyle = `rgba(${l},${l - 28},${l - 60},0.5)`; g.lineWidth = 0.8 + rnd() * 1.8; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y / 60 + i) * 3, y); g.stroke(); hg.strokeStyle = 'rgba(150,150,150,0.4)'; hg.lineWidth = 1; hg.beginPath(); hg.moveTo(x, 0); hg.lineTo(x, h); hg.stroke(); }
      hg.fillStyle = '#202020'; hg.fillRect(k * pw, 0, 4, h); g.fillStyle = 'rgba(60,40,20,0.45)'; g.fillRect(k * pw, 0, 3, h); } }
  else if (v === 'slats') { const n = 8, sw = w / n; R(0, 0, w, h, '#3a342e', 0); for (let k = 0; k < n; k++) { const x = k * sw + 6, l = 236 + rnd() * 12; g.fillStyle = `rgb(${l},${l - 4},${l - 10})`; g.fillRect(x, 0, sw - 12, h);
      const gr = hg.createLinearGradient(x, 0, x + sw - 12, 0); gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.12, '#fafafa'); gr.addColorStop(0.88, '#fafafa'); gr.addColorStop(1, '#9a9a9a'); hg.fillStyle = gr; hg.fillRect(x, 0, sw - 12, h); }
    noise(5000, 0.12, 1.2, 0.2); }
  else if (v === 'stone') { R(0, 0, w, h, '#b9b2a8', 0); let y = 0; while (y < h - 4) { const rh = Math.min(h - y, 30 + rnd() * 50); let x = -rnd() * 60; while (x < w) { const rw = 50 + rnd() * 120, l = 210 + rnd() * 40, j = 5;
        g.fillStyle = `rgb(${l},${l - 4},${l - 10})`; g.beginPath(); g.roundRect(x + j, y + j, rw - 2 * j, rh - 2 * j, 4); g.fill(); const q = 150 + rnd() * 80; hg.fillStyle = `rgb(${q},${q},${q})`; hg.beginPath(); hg.roundRect(x + j, y + j, rw - 2 * j, rh - 2 * j, 6); hg.fill();
        for (let i = 0; i < 40; i++) { const px = x + j + rnd() * (rw - 2 * j), py = y + j + rnd() * (rh - 2 * j), s = 2 + rnd() * 7, d = rnd() * 70; hg.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${0},${0},0)`; hg.fillStyle = `rgba(${d > 35 ? 255 : 0},${d > 35 ? 255 : 0},${d > 35 ? 255 : 0},0.25)`; hg.fillRect(px, py, s, s); } x += rw; } y += rh; }
    noise(12000, 0.15, 1.3, 0.3); }
  else if (v === 'eggs') { R(0, 0, w, h, '#fbfbfa', 128); noise(30000, 0.12, 1, 0.35); }
  else if (v === 'lime') { R(0, 0, w, h, '#f6f4f0', 128); for (let i = 0; i < 300; i++) { const x = rnd() * w, y = rnd() * h, r = 15 + rnd() * 60, l = 225 + rnd() * 30; g.fillStyle = `rgba(${l},${l - 2},${l - 6},0.2)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } noise(12000, 0.12, 1.3, 0.3); }
}
const RELV = ['brick', 'beige', 'conc2', 'woodp', 'slats', 'stone', 'eggs', 'lime'];
function finHeight(v) { // height canvas: relief variants draw their own, the others use the luminance of the color pattern
  if (RELIEF[v]) return RELIEF[v];
  const c = document.createElement('canvas'); c.width = c.height = 512; const hg = c.getContext('2d');
  if (!RELV.includes(v)) { hg.drawImage(finishTex(v).image, 0, 0); }
  return RELIEF[v] = c;
}
const NRM = {};
function normalTex(v, str) {
  if (NRM[v]) return NRM[v];
  const src = finHeight(v).getContext('2d').getImageData(0, 0, 512, 512).data, c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), im = g.createImageData(512, 512), d = im.data;
  const H = (x, y) => src[(((y + 512) % 512) * 512 + ((x + 512) % 512)) * 4] / 255;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const dx = (H(x + 1, y) - H(x - 1, y)) * str, dy = (H(x, y + 1) - H(x, y - 1)) * str, l = Math.hypot(dx, dy, 1), i = (y * 512 + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return NRM[v] = t;
}
// lit wall: emissive carries the chosen color (stable), a dim diffuse part picks up relief, corners and sunlight
function setWallCol(m, c) { const col = new THREE.Color(c); m.color.copy(col).multiplyScalar(m.userData.kd); m.emissive.copy(col).multiplyScalar(m.userData.ke); }
const NSTR = { brick: 7, stone: 7, slats: 6, woodp: 3, conc2: 2.2, beige: 2.6, koroed: 3, trav: 2 };
const PHW = { brick: ['painted_brick', 1.04, 1.6], beige: ['beige_wall_001', 2.4, 1, 1.1], lime: ['white_plaster_02', 2.2, 1] };
function wallMat() { const v = finVar(), ph = PHW[v];
  if (ph) { const rp = (1 / ph[1]).toFixed(4), sunM = S.room.shP === 'sun', m = new THREE.MeshStandardMaterial({ map: tex(ph[0] + '_diff', true, rp), emissiveMap: tex(ph[0] + '_diff', true, rp), normalMap: tex(ph[0] + '_nor_gl', false, rp), normalScale: new THREE.Vector2(ph[2], ph[2]), roughnessMap: tex(ph[0] + '_rough', false, rp), roughness: 1, metalness: 0, envMapIntensity: 0.35, toneMapped: false });
    const gn = ph[3] || 1, lf = v === 'brick'; m.userData = lf ? { wall: true, kd: 0.52, ke: 0.52 } : { wall: true, kd: (sunM ? 0.6 : 0.66) * gn, ke: (sunM ? 0.36 : 0.38) * gn }; if (lf) m.roughness = 0.85; setWallCol(m, S.wall); return m; }
  const t = finishTex(v).clone(); t.needsUpdate = true; const k = FINK[v] || 0.9; t.repeat.set(1 / k, 1 / k); const n = normalTex(v, NSTR[v] || 1.4).clone(); n.needsUpdate = true; n.repeat.copy(t.repeat);
  const sunM = S.room.shP === 'sun', m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, normalMap: n, roughness: 0.93, metalness: 0, envMapIntensity: 0.25, toneMapped: false });
  m.userData = { wall: true, kd: sunM ? 0.55 : 0.62, ke: sunM ? 0.4 : 0.42 }; /* lit PBR wall: relief reads in the light, emissive keeps the color clean */ setWallCol(m, S.wall); return m; }
// small tile preview of a finish, tinted by the wall color
function finSwatch(v) { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'), src = finishTex(v).image, k = FINK[v] || 0.9, px = Math.min(512, 512 * 0.35 / k); g.drawImage(src, 0, 0, px, px, 0, 0, 96, 96); g.globalCompositeOperation = 'multiply'; g.fillStyle = S.wall; g.fillRect(0, 0, 96, 96); return c.toDataURL('image/jpeg', 0.85); }

function wallShadowMat() { return new THREE.ShadowMaterial({ opacity: (SHP[S.room.shP] || SHP.soft).k, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); }
const AOG = {};
function aoGrad(k) { // soft quadratic falloff, alpha along u (u=0 darkest)
  if (!AOG[k]) { const c = document.createElement('canvas'); c.width = 256; c.height = 2; const g = c.getContext('2d'), im = g.createImageData(256, 2); for (let x = 0; x < 256; x++) { const t = x / 255, a = Math.pow(1 - t, 2.2) * 255; for (let y = 0; y < 2; y++) { const i = (y * 256 + x) * 4; im.data[i + 3] = a; } } g.putImageData(im, 0, 0); AOG[k] = new THREE.CanvasTexture(c); }
  return new THREE.MeshBasicMaterial({ map: AOG[k], color: 0x000000, transparent: true, opacity: k, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}
// strip of AO on a plane: len along v, width w; u runs from the joint into the surface
function aoStrip(parent, len, w, k, place) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), aoGrad(k)); place(m); parent.add(m); return m; }
let CONTACT;
const CONTACTS = {};
// soft wall shadow as a vertex-alpha gradient (dark at the top under the shelf, fading down and at the sides)
function contactQuad(w, h, f, op) { // stacked bands with plain opacity (per-pixel alpha from maps/vertex colors rendered invisible here)
  const G = new THREE.Group(), N = 6; for (let k = 0; k < N; k++) { const t = (k + 0.5) / N, a = Math.min(0.6, op * 1.1 * Math.pow(1 - t, 1.3));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.01, w - (1 - Math.pow(1 - t, 0.5)) * 0.03), h / N), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: a * 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false, fog: false }));
    m.position.y = h / 2 - h * (k / N) - h / (2 * N); m.position.z = 0.004 + k * 0.0004; m.renderOrder = 20; m.userData.contact = true; G.add(m); }
  return G; }
function contactMat(f = 18, op = 0.6) {
  CONTACT = CONTACTS[f]; if (!CONTACT) { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.3, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    const m = g.getImageData(0, 0, 128, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) { const k = Math.min(1, Math.min(x, 127 - x) / f); m.data[(y * 128 + x) * 4 + 3] *= k; } g.putImageData(m, 0, 0); CONTACT = CONTACTS[f] = c; }
  // fresh texture per material from the cached canvas: a shared texture got disposed by rebuild and the shadow vanished
  const id = CONTACTS[f].getContext('2d').getImageData(0, 0, 128, 64), dd = new Uint8Array(128 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) { const i = (y * 128 + x) * 4, a = Math.round(255 * Math.max(0, 0.62 - 0.62 * y / 63) * Math.min(1, Math.min(x, 127 - x) / f)); dd[i] = dd[i + 1] = dd[i + 2] = 0; dd[i + 3] = a; }
  const tx = new THREE.DataTexture(dd, 128, 64); tx.flipY = true; tx.needsUpdate = true;
  return new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, opacity: op, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 });
}

// ---------- materials ----------
let M = {}, GRAIN = null;
// fine powder-coat grain: soft orange-peel normal map + roughness variation (tileable)
function grainTex() {
  if (GRAIN) return GRAIN;
  const N = 256; let sd = 9; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  let h = new Float32Array(N * N).map(() => rnd());
  const blur = (a, r) => { const o = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += a[((y + dy + N) % N) * N + ((x + dx + N) % N)]; n++; } o[y * N + x] = s / n; } return o; };
  const lo = blur(blur(h, 2), 2), fine = blur(h, 1); h = lo.map((v, i) => v * 0.75 + fine[i] * 0.25);
  let mn = 1, mx = 0; h.forEach(v => { mn = Math.min(mn, v); mx = Math.max(mx, v); }); h = h.map(v => (v - mn) / (mx - mn));
  const mk = f => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4, [r, gg, b] = f(x, y); im.data[i] = r; im.data[i + 1] = gg; im.data[i + 2] = b; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  const nor = mk((x, y) => { const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1); return [128 - dx / l * 127, 128 + dy / l * 127, 128 + 127 / l]; });
  const rough = mk((x, y) => { const v = 190 + H(x, y) * 65; return [v, v, v]; });
  GRAIN = { nor, rough }; return GRAIN;
}
const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };
// swatch grids: rows as even as possible (no lonely last swatch), at most 5 per row on a phone
function evenCols(n) { const rows = Math.ceil(n / 5); return Math.max(1, Math.ceil(n / rows)); }
function makeMats() {
  // Titan-GS powder coat: RAL 9016 snow white (slightly cool, glowing), RAL 9006 silver, RAL 9005 black
  const gm = { soft: 1, bright: 1, off: 0.3 }[S.room.glareM || 'soft'] || 1, bright = S.room.glareM === 'bright';
  const PB = {
    white: { color: 0xffffff, metalness: 0.04, roughness: S.room.glareM === 'off' ? 0.6 : 0.3, clearcoat: S.room.glareM === 'off' ? 0 : bright ? 1 : 0.55, clearcoatRoughness: bright ? 0.05 : 0.3, specularIntensity: bright ? 1 : S.room.glareM === 'off' ? 0.12 : 0.5, sheen: S.room.glareM === 'off' ? 0 : 0.3, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffffff), emissive: new THREE.Color(0x9da1a7), toneMapped: false, envMapIntensity: 0.9 * gm }, /* v11r: snow white - neutral emissive lift so ACES never grays it */
    silver: { color: 0xe4e7eb, metalness: 0.8, roughness: 0.3, clearcoat: bright ? 0.5 : 0.25, clearcoatRoughness: 0.25, specularIntensity: 0.9, envMapIntensity: 1.5 * gm }, /* v11t (90c4554): light satin silver like the Titan drawing */
    black: { color: METAL.black, metalness: 0.85, roughness: 0.45, clearcoat: bright ? 0.5 : 0.15, clearcoatRoughness: 0.35, specularIntensity: 0.9, sheen: 0.3, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x6c7078), envMapIntensity: 1.25 * gm }
  }[S.metal] || {}; if (S.metal === 'silver') Object.assign(PB, { map: tex('rodmetal_diff', true, '4x4'), roughnessMap: tex('rodmetal_rough', false, '4x4') }); /* v13b: exact v11t brushed silver */ /* v13b: v11u silver ported */
  const G = grainTex();
  M.metal = new THREE.MeshPhysicalMaterial({ ...PB, normalMap: rep(G.nor, 6, 6), normalScale: new THREE.Vector2(0.22, 0.22), roughnessMap: rep(G.rough, 6, 6) });
  M.wire = new THREE.MeshPhysicalMaterial({ ...PB, roughness: S.metal === 'black' ? 0.45 : 0.55, clearcoat: 0, sheen: 0, specularIntensity: 0.25, envMapIntensity: Math.min(0.6, PB.envMapIntensity || 0.6) });
  const dark = S.metal === 'black', pt = slotTex(false, dark).clone(); pt.needsUpdate = true; pt.repeat.set(1, S.postH / 32);
  // uprights: crisp perforation as color + bump relief, powder grain in the roughness
  M.postF = new THREE.MeshPhysicalMaterial({ ...PB, map: pt, bumpMap: pt, bumpScale: 2.2, roughnessMap: rep(G.rough, 1, S.postH / 60), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.post = new THREE.MeshPhysicalMaterial({ ...PB, roughnessMap: rep(G.rough, 1, S.postH / 60) }); // solid sides; slots only on the front face
  const rt = slotTex(true, dark).clone(); rt.needsUpdate = true; M.railTex = rt;
  // top rail: smooth solid profile without perforation (only the uprights carry the slot rows)
  M.rail = new THREE.MeshPhysicalMaterial({ ...PB, normalMap: rep(G.nor, 30, 1), normalScale: new THREE.Vector2(0.18, 0.18), roughnessMap: rep(G.rough, 30, 1) });
  M.chrome = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.01, specularIntensity: 1, emissive: new THREE.Color(0x0c0d0f), envMap: chromeEnv(), envMapIntensity: 1.7, userData: { chrome: true } });
  M.rod = S.rod === 'white' ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.04, roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.3, specularIntensity: 0.5, sheen: 0.3, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffffff), emissive: new THREE.Color(0x50555f), envMapIntensity: 0.9 * gm, normalMap: rep(G.nor, 8, 2), normalScale: new THREE.Vector2(0.2, 0.2) }) /* v13b: snow white rod */
    : S.rod === 'black' ? new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.85, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.35, specularIntensity: 0.9, envMapIntensity: 1 * gm, normalMap: rep(G.nor, 8, 2), normalScale: new THREE.Vector2(0.2, 0.2) }) : M.chrome;
  M.plastic = new THREE.MeshStandardMaterial({ color: dark ? 0x2a2b2e : S.metal === 'silver' ? 0xb4b7ba : 0xf6f7f8, roughness: 0.5, metalness: 0 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.85, metalness: 0 });
  M.ldsp = new THREE.MeshStandardMaterial({ color: dark ? 0x3b3836 : 0xf3f1ec, roughness: 0.6, metalness: 0 });
}

let SLOT;
function basketMat(rx, ry) {
  if (!SLOT) { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#000'; g.beginPath(); g.roundRect(27, 14, 10, 36, 5); g.fill(); SLOT = c; }
  const t = new THREE.CanvasTexture(SLOT); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.round(rx), Math.max(1, Math.round(ry)));
  return new THREE.MeshStandardMaterial({ color: M.plastic.color, roughness: 0.5, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide });
}
// ---------- geometry helpers ----------
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1); CYL.translate(0, 0.5, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
function rods(list, mat) {
  const im = new THREE.InstancedMesh(CYL, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), d = new THREE.Vector3();
  list.forEach(([a, b, r], i) => { d.subVectors(b, a); const L = d.length(); q.setFromUnitVectors(_up, d.normalize()); s.set(r, L, r); m.compose(a, q, s); im.setMatrixAt(i, m); });
  im.castShadow = true; im.receiveShadow = true; return im;
}
function box(w, h, d, x, y, z, mat) { const b = new THREE.Mesh(BOX, mat); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; return b; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- build ----------
function postLen(wi, i) { const L = S.walls[wi].postL; return (L && L[i]) || S.postH; }
function secLo(wi, si) { return Math.ceil((S.railTop * 10 - 10 - Math.min(postLen(wi, si), postLen(wi, si + 1))) / 10) + 3; }
let selPost = null;
function postBottom() { return S.railTop * 10 - 10 - S.postH; } // mm
function wallsActive() { return S.layout === 'straight' ? [0] : S.layout === 'L' ? [0, 1] : S.layout === 'Lr' ? [0, 2] : [0, 1, 2]; }
function wallWidth(w) { return S.walls[w].sections.reduce((a, s) => a + s.w * 10, 0); }
function wallsBuilt() { return wallsActive().filter(wi => !S.walls[wi].off); }
const ZB = 0.003, ZI = 0.004, XIN = 0; // shelves sit flush on the wall between the uprights // bracket base and back of the filling, m from the wall
// room frame per layout: x of the left side wall, start of the main wall, x of the right side wall
// every wall keeps its own shift from its corner (Lr: the main wall is measured from the right corner)
function frame() {
  const backW = wallWidth(0) * MM, g0 = effGap(0) / 100, gR = effGapR() / 100;
  if (S.layout === 'L') return { xL: -0.02, x0: g0, xR: null, backW };
  if (S.layout === 'Lr') return { xL: null, x0: -g0, xR: backW + 0.02, backW };
  if (S.layout === 'U') return { xL: -0.02, x0: g0, xR: g0 + backW + gR + 0.02, backW };
  return { xL: null, x0: 0, xR: null, backW };
}
// top rail: one profile at one height on every wall; in a corner it runs to the room corner (butt joint)
function railSpan(wi) {
  // the rail always ends flush with the outer uprights (end caps), never runs on to the corner on its own
  const tot = wallWidth(wi) * MM; return [-0.025, tot + 0.025];
}
function buildWall(wi) {
  const W = S.walls[wi], g = new THREE.Group(); g.userData.wi = wi;
  const total = wallWidth(wi), railY = S.railTop * 10 * MM, [ra, rb] = railSpan(wi), rl = rb - ra, rc = (ra + rb) / 2;
  const rm = M.rail.clone();
  // load-bearing rail 60 x 16 (visual), same on every wall: back plate, returns, rounded front lips, end caps
  { const H = 0.068, D = 0.014;
    const parts = [box(rl, H, 0.004, rc, railY - H / 2, 0.002, rm), box(rl, 0.0045, D, rc, railY - 0.00225, D / 2, M.metal), box(rl, 0.0045, D, rc, railY - H + 0.00225, D / 2, M.metal), box(0.004, H, D, ra + 0.002, railY - H / 2, D / 2, M.metal), box(0.004, H, D, rb - 0.002, railY - H / 2, D / 2, M.metal)];
    const lip = (h, y) => { const m = new THREE.Mesh(new RoundedBoxGeometry(rl, h, 0.0056, 2, 0.0022), M.metal); m.position.set(rc, y, D - 0.0026); m.castShadow = m.receiveShadow = true; return m; };
    parts.push(lip(0.022, railY - 0.011), lip(0.014, railY - H + 0.007));
    parts.forEach(p => { p.userData.frame = true; g.add(p); }); }
  const pt = (S.railTop * 10 - 10) * MM;
  let xs = [0]; W.sections.forEach(s => xs.push(xs[xs.length - 1] + s.w * 10 * MM));
  // uprights (catalog 32 x 34 mm, drawn about 1.5x heavier so they read in photos) with hook head and end cap
  xs.forEach((x, pi) => { const pb = pt - postLen(wi, pi) * MM, sel = selPost && selPost.wi === wi && selPost.i === pi, pm = new THREE.Mesh(new RoundedBoxGeometry(0.046, pt - pb, 0.042, 3, 0.0065), sel ? M.post.clone() : M.post); if (sel) { pm.material.emissive.set(0x2f7bff); pm.material.emissiveIntensity = 0.6; } pm.userData.post = { wi, i: pi }; pm.position.set(x, (pt + pb) / 2, 0.0225); pm.castShadow = pm.receiveShadow = true; pm.userData.frame = true; g.add(pm); { const ff = new THREE.Mesh(new THREE.PlaneGeometry(0.034, pt - pb), M.postF); ff.position.set(x, (pt + pb) / 2, 0.0436); ff.userData.post = { wi, i: pi }; ff.userData.frame = true; ff.receiveShadow = true; g.add(ff); }
    const hk = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.034, 0.03, 2, 0.004), M.metal); hk.position.set(x, pt - 0.012, 0.0165); hk.castShadow = true; hk.userData.frame = true; g.add(hk);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.048, 0.014, 0.044, 2, 0.004), M.plastic); cap.position.set(x, pb + 0.007, 0.0225); cap.userData.frame = true; g.add(cap);
    // painted contact darkening on the wall where the upright meets it (both sides), no SSAO pass needed
    if (!S.studio) [1, -1].forEach(sd => aoStrip(g, pt - pb, 0.04, 0.2, m => { m.position.set(x + sd * (0.023 + 0.02), (pt + pb) / 2, 0.0012); if (sd < 0) m.scale.x = -1; m.userData.contact = m.userData.frame = true; m.renderOrder = 1; })); });
  W.sections.forEach((s, si) => s.items.forEach((item, ii) => { const ig = new THREE.Group(); ig.userData.ref = { wi, si, ii }; g.add(ig); buildItem(ig, item, xs[si] + XIN, xs[si + 1] - XIN, s); buildProps(ig, item, xs[si] + XIN, xs[si + 1] - XIN, { wi, si, ii });
    // baked shadow tight on the wall under/behind the item: 5-15 cm, soft edge; presets only tilt it a little; never leaves the item's own wall
    const B = SHB[S.room.shP] || SHB.soft; if (B.o > 0 && item.t !== 'rail') { const rl = item.t === 'rail', ch = rl ? B.len * 0.55 : isBasket(item.t) ? (item.h || 85) * MM + B.len * 0.6 : B.len, cs = contactQuad(xs[si + 1] - xs[si] - 0.01, ch, B.f, B.o * (rl ? 0.6 : 1)); cs.position.set((xs[si] + xs[si + 1]) / 2 + B.dx, (rl ? item.y * 10 * MM - 0.02 : itemTop(item) + 0.003) - ch / 2, 0.0026); cs.renderOrder = 2; cs.userData.contact = true; ig.add(cs); } }));
  // soft contact shade on the floor under and just in front of the wall (the only shadow in Студия)
  if (false) { const fs = new THREE.Mesh(new THREE.PlaneGeometry(0.75, total * MM + 0.14), aoGrad(S.studio ? 0.36 : 0.12)); fs.rotation.x = -Math.PI / 2; fs.rotation.z = Math.PI / 2; fs.scale.x = -1; fs.position.set(total * MM / 2, 0.0025, 0.375); fs.userData.contact = fs.userData.keep = true; g.add(fs); }
  return g;
}
const BRG = {};
// shelf bracket: top flange ends exactly at y (shelf sits on it)
function bracket(g, x, y, L) {
  const k = L.toFixed(3);
  if (!BRG[k]) { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(L, -0.016); sh.lineTo(0.06, -0.082); sh.lineTo(0, -0.088); sh.lineTo(0, 0);
    const ge = new THREE.ExtrudeGeometry(sh, { depth: 0.0065, bevelEnabled: true, bevelThickness: 0.0013, bevelSize: 0.0012, bevelSegments: 2 }); ge.rotateY(-Math.PI / 2); ge.translate(0.00325, 0, 0); BRG[k] = ge; }
  const m = new THREE.Mesh(BRG[k], M.metal); m.position.set(x, y - 0.0012, ZB); m.castShadow = m.receiveShadow = true; g.add(m); [-0.012, -0.052].forEach(dy => g.add(box(0.0065, 0.016, 0.012, x, y + dy, 0.0405, M.metal))); /* hook tabs into the upright slot */
  g.add(box(0.03, 0.005, L - 0.044, x, y - 0.0025, 0.0435 + (L - 0.044) / 2, M.metal));
  g.add(box(0.016, 0.02, 0.01, x, y - 0.01, ZB + L - 0.005, M.metal));
}
const ROD_G = new THREE.CylinderGeometry(1, 1, 1, 32, 1).translate(0, 0.5, 0), HOOK_G = new THREE.TorusGeometry(0.0175, 0.0042, 12, 32, Math.PI * 1.7), RIV_G = new THREE.CylinderGeometry(0.0035, 0.0035, 0.007, 12);
let _GRM = null, _GRK = null; function gridMat() { if (_GRM && _GRK === M.metal) return _GRM; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 9); g.fillRect(0, 0, 9, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(34, 15); t.anisotropy = 4; _GRK = M.metal; _GRM = M.metal.clone(); _GRM.alphaMap = t; _GRM.alphaTest = 0.5; _GRM.side = THREE.DoubleSide; _GRM.normalMap = null; return _GRM; }
let _CHE = null; function chromeEnv() { if (_CHE) return _CHE; const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#dfe3e8'); gr.addColorStop(0.46, '#4a4e54'); gr.addColorStop(0.5, '#101113'); gr.addColorStop(0.56, '#6d7177'); gr.addColorStop(0.8, '#9a9ea3'); gr.addColorStop(1, '#55585c'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ffffff'; [[30, 40], [150, 22], [250, 56], [380, 30], [470, 18]].forEach(([x, w]) => g.fillRect(x, 10, w, 105)); g.fillStyle = '#1a1b1d'; [[100, 14], [215, 10], [330, 16], [440, 10]].forEach(([x, w]) => g.fillRect(x, 0, w, 256));
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; _CHE = new THREE.PMREMGenerator(renderer).fromEquirectangular(t).texture; return _CHE; }
function rodHolder(g, x, by, ry, zr, side) {
  // v11t: Titan-GS «кронштейн для перекладины» - one flat bent steel strip 30 x 2 mm (system color):
  // slotted tab hooked on the shelf bracket, straight drop, dog-leg toward the rod, open U cradle the 25 mm rod lies in
  const RR = 0.0155, T = 0.002, W = 0.03, zb = zr - 0.03, r = RR + 0.0008, yTop = by - 0.002, yLeg = ry + 0.035, pts = [];
  pts.push([yTop, zb], [yLeg + 0.012, zb]);
  for (let k = 1; k <= 6; k++) { const t = k / 6, e = t * t * (3 - 2 * t); pts.push([yLeg + 0.012 - 0.03 * t, zb + (zr - r - zb) * e]); }
  pts.push([ry, zr - r]);
  for (let k = 1; k <= 20; k++) { const f = Math.PI * 0.85 * k / 20; pts.push([ry - r * Math.sin(f), zr - r * Math.cos(f)]); }
  // profile as a thick polyline in (z, y)
  const L = [], Rr = [];
  pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dy = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dy, dz) || 1, ny = -dz / l, nz = dy / l;
    L.push([p[1] + nz * T / 2, p[0] + ny * T / 2]); Rr.push([p[1] - nz * T / 2, p[0] - ny * T / 2]); });
  const sh = new THREE.Shape(); sh.moveTo(L[0][0], L[0][1]); L.slice(1).forEach(q => sh.lineTo(q[0], q[1])); Rr.reverse().forEach(q => sh.lineTo(q[0], q[1])); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 4 });
  const m = new THREE.Mesh(geo, M.brk); m.rotation.y = -Math.PI / 2; m.position.set(x + W / 2, 0, 0); m.castShadow = true; g.add(m);
  // slot in the tab: dark notch where it hooks over the bracket edge
  const nt = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, T * 1.6), M.rubber); nt.position.set(x, yTop - 0.011, zb); g.add(nt);
}
let CUP_G = null, CAP_M = null;
function buildItem(g, item, x0, x1, sec) {
  const y = item.y * 10 * MM, dep = (REAL_DEPTH[item.t][item.d] || 400) * MM, z0 = ZI, zf = z0 + dep;
  const a = x0 + 0.014, b = x1 - 0.014, L = b - a, mid = (x0 + x1) / 2;
  const brL = dep + 0.02;
  if (item.t !== 'rail') { bracket(g, x0, y, brL); bracket(g, x1, y, brL); }
  if (item.t === 'mesh') {
    // cross wires lie on the bracket flanges, side rims sit right over them; heavy front lip and rolled top rim
    const r = [], ea = x0 + 0.005, eb = x1 - 0.005, Lw = eb - ea, n = Math.max(2, Math.round(Lw / 0.026));
    for (let t = 0; t <= 1.001; t += 0.2) { const z = z0 + 0.005 + (dep - 0.01) * t; r.push([V(x0 - 0.007, y + 0.0035, z), V(x1 + 0.007, y + 0.0035, z), 0.0035]); }
    for (let i = 1; i < n; i++) { const x = ea + Lw * i / n; r.push([V(x, y + 0.0095, z0), V(x, y + 0.0095, zf), 0.003]); }
    [ea, eb].forEach(x => r.push([V(x, y + 0.0065, z0), V(x, y + 0.0065, zf), 0.0065]));
    r.push([V(ea, y + 0.0095, z0), V(eb, y + 0.0095, z0), 0.005]);
    g.add(rods(r, M.wire));
    const lip = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0 - 0.002, 0.042, 0.008, 2, 0.0028), M.metal); lip.position.set(mid, y - 0.01, zf + 0.004); lip.castShadow = lip.receiveShadow = true; g.add(lip);
    const rim = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0 - 0.002, 0.009, 0.02, 2, 0.0035), M.metal); rim.position.set(mid, y + 0.0075, zf - 0.006); rim.castShadow = true; g.add(rim);
  } else if (item.t === 'metal') {
    g.add(box(x1 - x0, 0.0045, dep, mid, y + 0.00225, z0 + dep / 2, S.roomPre === 'loft' ? gridMat() : M.metal));
    const f = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, 0.038, 0.007, 2, 0.0025), M.metal); f.position.set(mid, y - 0.015, zf); f.castShadow = true; g.add(f);
    g.add(box(x1 - x0, 0.024, 0.006, mid, y + 0.012, z0, M.metal));
  } else if (item.t === 'ldsp') {
    g.add(box(x1 - x0 + 0.01, 0.018, dep, mid, y + 0.009, z0 + dep / 2, M.ldsp));
  } else if (isBasket(item.t) && !perfOf(item)) {
    const h = (item.h || 85) * MM, r = [], bot = y - h, aa = a + 0.012, bb = b - 0.012, LL = bb - aa, SP = fineOf(item) ? 0.011 : 0.025, n = Math.max(2, Math.round(LL / SP)), wz0 = z0 + 0.01, wzf = zf - 0.01, wr = fineOf(item) ? 0.0024 : 0.003;
    for (let i = 0; i <= n; i++) { const x = aa + LL * i / n; r.push([V(x, bot, wz0), V(x, bot, wzf), wr]); r.push([V(x, bot, wzf), V(x, y, wzf), wr]); r.push([V(x, bot, wz0), V(x, y, wz0), wr * 0.9]); }
    const m = Math.max(2, Math.round((wzf - wz0) / SP));
    for (let i = 0; i <= m; i++) { const z = wz0 + (wzf - wz0) * i / m; r.push([V(aa, bot, z), V(aa, y, z), wr * 0.9]); r.push([V(bb, bot, z), V(bb, y, z), wr * 0.9]); }
    const levels = [y, bot]; for (let yy = bot + (fineOf(item) ? 0.012 : 0.03); yy < y - 0.008; yy += fineOf(item) ? 0.012 : 0.03) levels.push(yy);
    levels.forEach((yy, k) => { const rr = k < 2 ? 0.0058 : wr * 0.9; r.push([V(aa, yy, wz0), V(bb, yy, wz0), rr]); r.push([V(aa, yy, wzf), V(bb, yy, wzf), rr]); r.push([V(aa, yy, wz0), V(aa, yy, wzf), rr]); r.push([V(bb, yy, wz0), V(bb, yy, wzf), rr]); });
    g.add(rods(r, M.metal));
    [[x0 + 0.003, aa], [x1 - 0.003, bb]].forEach(([xa, xb]) => g.add(box(Math.abs(xb - xa) + 0.006, 0.02, dep, (xa + xb) / 2, y - 0.01, z0 + dep / 2, M.metal)));
    if (item.t === 'pull') g.add(rods([[V(aa + LL * 0.3, y - 0.014, wzf + 0.03), V(bb - LL * 0.3, y - 0.014, wzf + 0.03), 0.0075], [V(aa + LL * 0.3, y - 0.014, wzf), V(aa + LL * 0.3, y - 0.014, wzf + 0.03), 0.0045], [V(bb - LL * 0.3, y - 0.014, wzf), V(bb - LL * 0.3, y - 0.014, wzf + 0.03), 0.0045]], M.chrome));
  } else if (isBasket(item.t)) {
    const h = (item.h || 85) * MM, bot = y - h, aa = a + 0.014, bb = b - 0.014, LL = bb - aa;
    [[x0 + 0.003, aa], [x1 - 0.003, bb]].forEach(([xa, xb]) => g.add(box(Math.abs(xb - xa) + 0.006, 0.02, dep, (xa + xb) / 2, y - 0.01, z0 + dep / 2, M.metal)));
    const bw = LL, bd = dep - 0.03, cz = z0 + dep / 2, fh = h - 0.014;
    const face = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, fh), basketMat(w / 0.05, fh / 0.06)); m.position.set(x, bot + fh / 2, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); };
    face(bw, (aa + bb) / 2, cz + bd / 2, 0); face(bw, (aa + bb) / 2, cz - bd / 2, Math.PI);
    face(bd, aa, cz, -Math.PI / 2); face(bd, bb, cz, Math.PI / 2);
    g.add(box(bw, 0.004, bd, (aa + bb) / 2, bot + 0.002, cz, M.plastic));
    g.add(box(bw + 0.018, 0.016, bd + 0.018, (aa + bb) / 2, y - 0.008, cz, M.plastic));
    if (item.t === 'pull') g.add(box(LL * 0.3, 0.016, 0.016, (aa + bb) / 2, y - 0.04, cz + bd / 2 + 0.01, M.plastic));
  } else if (item.t === 'trouser') {
    // Titan-GS pull-out trouser rack 463 / 603 x 440 x 45: flat frame on roller runners under the brackets,
    // the bars run from the wall to the front (trousers hang over them), rubber rings stop slipping
    const h = 0.045, aa = a + 0.006, bb = b - 0.006, n = Math.max(4, Math.round(L / 0.072)), yb = y - h + 0.009;
    [[x0 + 0.003, aa], [x1 - 0.003, bb]].forEach(([xa, xb]) => g.add(box(Math.abs(xb - xa) + 0.006, 0.022, dep, (xa + xb) / 2, y - 0.011, z0 + dep / 2, M.metal)));
    [aa, bb].forEach(x => g.add(box(0.012, 0.024, dep - 0.02, x, y - 0.02, z0 + dep / 2, M.metal)));
    g.add(box(bb - aa + 0.012, 0.03, 0.012, (aa + bb) / 2, y - 0.022, z0 + 0.012, M.metal));
    const fr = new THREE.Mesh(new RoundedBoxGeometry(bb - aa + 0.024, h - 0.004, 0.016, 2, 0.005), M.metal); fr.position.set((aa + bb) / 2, y - h / 2, zf - 0.008); fr.castShadow = fr.receiveShadow = true; g.add(fr);
    const r = [], rings = [];
    for (let k = 0; k < n; k++) { const x = aa + 0.03 + (bb - aa - 0.06) * k / (n - 1); r.push([V(x, yb, z0 + 0.018), V(x, yb, zf - 0.016), 0.0055]); for (let zz = z0 + 0.05; zz < zf - 0.05; zz += 0.05) rings.push([V(x, yb, zz), V(x, yb, zz + 0.008), 0.0078]); }
    g.add(rods(r, M.metal)); g.add(rods(rings, M.rubber));
  } else if (item.t === 'shoe') {
    const drop = 0.11, r = [], n = Math.max(2, Math.round(L / 0.03));
    const P = t => V(0, y + 0.004 - drop * t, z0 + dep * t);
    for (let i = 0; i <= n; i++) { const x = a + L * i / n, p0 = P(0), p1 = P(1); r.push([V(x, p0.y, p0.z), V(x, p1.y, p1.z), 0.0034]); r.push([V(x, p1.y, p1.z), V(x, p1.y + 0.04, p1.z + 0.003), 0.0034]); }
    [0, 0.33, 0.66, 1].forEach(t => { const p = P(t); r.push([V(x0, p.y, p.z), V(x1, p.y, p.z), 0.005]); });
    const p1 = P(1); r.push([V(a, p1.y + 0.04, p1.z + 0.003), V(b, p1.y + 0.04, p1.z + 0.003), 0.0055]);
    g.add(rods(r, M.metal));
    // angled shoe brackets: the same slope as the mesh, hooked into the uprights at the back
    const ang = Math.atan2(drop, dep), Lb = Math.hypot(dep, drop);
    [x0, x1].forEach(x => { const br = box(0.006, 0.026, Lb, x, y + 0.004 - drop / 2 - 0.016, z0 + dep / 2, M.metal); br.rotation.x = ang; br.castShadow = true; g.add(br);
      g.add(box(0.006, 0.07, 0.012, x, y - 0.025, z0 + 0.006, M.metal)); });
  } else if (item.t === 'rail') {
    // Titan-GS rod holder: sheet-steel hook 101 x 31 x 30 mm hung on the shelf bracket (before the shelf), seat for the d25 rod
    const sh = sec && sec.items.filter(o => o !== item && o.t !== 'rail' && o.t !== 'shoe' && o.y > item.y && o.y - item.y <= 25).sort((p, q) => p.y - q.y)[0];
    const by = sh ? sh.y * 10 * MM : y + 0.09, zr = Math.min(ZI + (sh ? (REAL_DEPTH[sh.t][sh.d] || 400) * MM : 0.4) - 0.07, 0.36);
    if (!sh) { bracket(g, x0, by, 0.355); bracket(g, x1, by, 0.355); }
    const ca = x0 + 0.004, cb = x1 - 0.004; g.userData.rodZ = zr;
    [x0, x1].forEach(x => rodHolder(g, x, by, y, zr));
    const rr = rods([[V(ca, y, zr), V(cb, y, zr), 0.0155]], M.rod); rr.geometry = ROD_G; g.add(rr); [ca, cb].forEach(xc => { const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.0163, 0.0163, 0.005, 24), CAP_M || (CAP_M = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.45 }))); cp.rotation.z = Math.PI / 2; cp.position.set(xc, y, zr); g.add(cp); }); /* end caps */
  }
}

// ---------- v10 props: clothes on hangers, shoes, bags, hat, folded stacks, fabric boxes (stored on the item: item.pr = [{ k, u }]) ----------
var PROPK = { shirts: ['Рубашки', 'rail', 0.42], dresses: ['Платья', 'rail', 0.4], trousers: ['Брюки', 'rail', 0.36], shoes: ['Пары обуви', 'shoe', 0.34], stack: ['Стопка свитеров', 'shelf', 0.34], towels: ['Полотенца', 'shelf', 0.32], box: ['Короб из ткани', 'shelf', 0.34], bag: ['Сумка', 'shelf', 0.3], hat: ['Шляпа', 'shelf', 0.34] };
const propFits = (k, t) => PROPK[k][1] === 'rail' ? t === 'rail' : PROPK[k][1] === 'shoe' ? t === 'shoe' : ['mesh', 'metal', 'ldsp'].includes(t);
const PCOL = { shirts: ['#c9cfe3', '#e9b9ad', '#f4f1ea', '#8d6a4d', '#efe7d6', '#2f3a4f', '#b9a28a'], dresses: ['#f0c9b8', '#1f2330', '#b0262e', '#d9b8a0', '#ece6dc'], trousers: ['#c8b08a', '#2b2d33', '#e7c2b7', '#4a4440', '#f1ece2'], stack: ['#6d7fa8', '#d9cbb5', '#8a8f7a', '#c7a79a', '#3e4757', '#e8e1d4'], towels: ['#f3f1ec', '#d8d0c4', '#b9c4c8', '#e9dfd2'] };
const PMAT = {}, PGEO = {};
function pmat(c, kind) { const key = c + (kind || ''); if (!PMAT[key]) PMAT[key] = kind === 'leather' ? new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 })
  : kind === 'wood' ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, envMapIntensity: 0.6 }) : kind === 'chrome' ? M.chrome
  : new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.92, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.4), envMapIntensity: 0.45 });
  return PMAT[key]; }
function extr(key, pts, depth, bev) { if (!PGEO[key]) { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const ge = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 }); ge.translate(0, 0, -depth / 2); PGEO[key] = ge; } return PGEO[key]; }
function hanger(g) { // wooden hanger with a chrome hook over the rod (rod center at 0,0)
  const w = pmat('#a9784f', 'wood'), bar = new THREE.Mesh(extr('hgr', [[-0.21, -0.075], [0, -0.035], [0.21, -0.075], [0.21, -0.088], [0, -0.05], [-0.21, -0.088]], 0.012, 0.003), w); g.add(bar);
  const hk = new THREE.Mesh(PGEO.hk || (PGEO.hk = new THREE.TorusGeometry(0.019, 0.0022, 6, 16, Math.PI * 1.3)), M.chrome); hk.rotation.z = -0.2; hk.position.y = 0.001; g.add(hk);
  const st = new THREE.Mesh(PGEO.hs || (PGEO.hs = new THREE.CylinderGeometry(0.002, 0.002, 0.03, 6)), M.chrome); st.position.y = -0.03; g.add(st); }
function garment(k, c, i) { const g = new THREE.Group(); hanger(g); let m;
  if (k === 'shirts') { m = new THREE.Mesh(extr('shirt', [[-0.2, -0.08], [-0.06, -0.04], [0.06, -0.04], [0.2, -0.08], [0.23, -0.32], [0.18, -0.33], [0.17, -0.2], [0.175, -0.76], [-0.175, -0.76], [-0.17, -0.2], [-0.18, -0.33], [-0.23, -0.32]], 0.008, 0.009), pmat(c)); const col = new THREE.Mesh(PGEO.col || (PGEO.col = new THREE.TorusGeometry(0.045, 0.01, 6, 18, Math.PI)), pmat(c)); col.rotation.z = Math.PI; col.position.y = -0.045; col.scale.z = 1.6; g.add(col);
    const pl = new THREE.Mesh(PGEO.pl || (PGEO.pl = new THREE.BoxGeometry(0.025, 0.68, 0.003)), pmat(new THREE.Color(c).multiplyScalar(0.9).getStyle())); pl.position.set(0, -0.41, 0.019); g.add(pl); }
  else if (k === 'dresses') { const L = i % 2 ? 1.05 : 0.9; m = new THREE.Mesh(extr('dress' + L, [[-0.17, -0.08], [-0.05, -0.05], [0.05, -0.05], [0.17, -0.08], [0.14, -0.3], [0.13, -0.4], [0.26, -L], [-0.26, -L], [-0.13, -0.4], [-0.14, -0.3]], 0.008, 0.009), pmat(c)); }
  else { // trousers folded over the hanger bar: two legs hanging on each side of the bar
    m = new THREE.Mesh(extr('trs', [[-0.17, -0.07], [0.17, -0.07], [0.19, -0.62], [0.02, -0.62], [0, -0.3], [-0.02, -0.62], [-0.19, -0.62]], 0.012, 0.009), pmat(c)); }
  m.castShadow = true; m.receiveShadow = true; m.rotation.y = 0; g.add(m);
  g.rotation.y = Math.PI / 2; return g; }
function shoeMesh(c, heel) { const g = new THREE.Group(), L = 0.26;
  const prof = heel ? [[0, 0], [L, 0], [L, 0.03], [0.17, 0.06], [0.06, 0.085], [0.0, 0.09], [0.0, 0.06], [0.018, 0.06], [0.018, 0.0]] : [[0, 0], [L, 0], [L, 0.035], [0.2, 0.065], [0.1, 0.07], [0.02, 0.075], [0, 0.06]];
  const b = new THREE.Mesh(extr(heel ? 'shH' : 'shL', prof, 0.07, 0.012), pmat(c, 'leather')); b.rotation.y = -Math.PI / 2; b.castShadow = true; g.add(b);
  const sole = new THREE.Mesh(PGEO.sole || (PGEO.sole = new RoundedBoxGeometry(0.094, 0.01, L + 0.02, 2, 0.004)), pmat('#2a211c', 'leather')); sole.position.set(0, 0.004, L / 2); g.add(sole);
  return g; }
function propModel(k, i, item) { const g = new THREE.Group(), C = PCOL[k] || PCOL.stack;
  if (k === 'shirts' || k === 'dresses' || k === 'trousers') { const n = k === 'shirts' ? 6 : 5, sp = (PROPK[k][2] - 0.12) / (n - 1);
    for (let j = 0; j < n; j++) { const gm = garment(k, C[(j + i) % C.length], j); gm.position.x = (j - (n - 1) / 2) * sp; gm.rotation.y = Math.PI / 2 - 0.62 + ((j * 7) % 5 - 2) * 0.04; g.add(gm); } }
  else if (k === 'shoes') { const cs = ['#6e3a22', '#1d1b1b', '#8a4b2b'], heel = [false, true, false];
    for (let j = 0; j < 2; j++) { const c = cs[(i + j) % 3], h = heel[(i + j) % 3]; [-1, 1].forEach(s => { const sh = shoeMesh(c, h); sh.position.x = (j - 0.5) * 0.17 + s * 0.04; sh.rotation.y = s * 0.04; g.add(sh); }); } }
  else if (k === 'stack' || k === 'towels') { let y = 0; const n = k === 'towels' ? 4 : 5;
    for (let j = 0; j < n; j++) { const h = k === 'towels' ? 0.055 : 0.045, w = 0.3 + ((j * 3) % 4) * 0.008, d = 0.26 + ((j * 5) % 3) * 0.008;
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, h * 0.45), pmat(C[(j + i) % C.length])); m.position.set(((j * 7) % 3 - 1) * 0.006, y + h / 2, 0); m.rotation.y = ((j * 5) % 3 - 1) * 0.03; m.castShadow = m.receiveShadow = true; g.add(m); y += h * 0.96; } }
  else if (k === 'box') { const w = 0.31, h = 0.22, d = 0.36, tx = linenTex();
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.012), new THREE.MeshStandardMaterial({ color: 0x8e9196, map: tx, roughness: 0.95, envMapIntensity: 0.45 })); m.position.y = h / 2; m.castShadow = m.receiveShadow = true; g.add(m);
    const lb = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.05, 0.006, 2, 0.002), new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.4, metalness: 0.4 })); lb.position.set(0, h * 0.6, d / 2 + 0.002); g.add(lb);
    const lc = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.03), new THREE.MeshBasicMaterial({ color: 0x0c0c0d })); lc.position.set(0, h * 0.6, d / 2 + 0.0055); g.add(lc); }
  else if (k === 'bag') { const c = i % 2 ? '#7a4a2e' : '#a0653f';
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.19, 0.11, 4, 0.03), pmat(c, 'leather')); m.position.y = 0.095; m.castShadow = true; g.add(m);
    const fl = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.09, 0.012, 3, 0.005), pmat(c, 'leather')); fl.position.set(0, 0.15, 0.058); g.add(fl);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 8, 24, Math.PI), pmat(c, 'leather')); hd.position.y = 0.19; g.add(hd);
    const lk = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 0.006), new THREE.MeshStandardMaterial({ color: 0xcfa85c, metalness: 1, roughness: 0.3 })); lk.position.set(0, 0.11, 0.066); g.add(lk); }
  else if (k === 'hat') { const fm = pmat('#b79f84');
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.11, 28), fm); cr.position.y = 0.065; cr.castShadow = true; g.add(cr);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.008, 36), fm); br.position.y = 0.012; br.castShadow = true; g.add(br);
    const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.0955, 0.097, 0.025, 28), pmat('#3a2a20')); bd.position.y = 0.03; g.add(bd); }
  return g; }
let LINT = null;
function linenTex() { if (!LINT) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#b5b7ba'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) { x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`; x.fillRect(0, i, 128, 1); x.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05})`; x.fillRect(i, 0, 1, 128); }
  LINT = new THREE.CanvasTexture(c); LINT.wrapS = LINT.wrapT = THREE.RepeatWrapping; LINT.repeat.set(3, 3); LINT.colorSpace = THREE.SRGBColorSpace; } return LINT; }
// place the props of one item inside its item group (wall-local coordinates)
function buildProps(ig, item, x0, x1, ref) {
  if (!Array.isArray(item.pr) || !item.pr.length) return;
  const y = item.y * 10 * MM, dep = (REAL_DEPTH[item.t][item.d] || 400) * MM, z0 = ZI;
  item.pr.forEach((p, pi) => { if (!PROPK[p.k] || !propFits(p.k, item.t)) return; const g = propModel(p.k, pi, item), hw = PROPK[p.k][2] / 2;
    const xa = x0 + 0.02 + hw, xb = x1 - 0.02 - hw, x = xb > xa ? xa + (xb - xa) * Math.max(0, Math.min(1, p.u ?? 0.5)) : (x0 + x1) / 2;
    if (item.t === 'rail') { const zr = ig.userData.rodZ ?? 0.3; g.position.set(x, y, zr); }
    else if (item.t === 'shoe') { const drop = 0.11, ang = Math.atan2(drop, dep), t = 0.18; g.rotation.x = ang; g.position.set(x, y + 0.008 - drop * t, z0 + dep * t); }
    else { const top = y + (item.t === 'ldsp' ? 0.018 : item.t === 'metal' ? 0.0045 : 0.0125), d0 = p.k === 'box' ? 0.36 : 0.27; g.position.set(x, top, z0 + Math.max(d0 / 2 + 0.01, dep - d0 / 2 - 0.03)); }
    g.userData.prop = { ...ref, pi, x0, x1, hw }; g.traverse(o => { o.userData.prop = g.userData.prop; }); ig.add(g); });
}

function effGap(wi) { return Math.max(0, Math.min(300, S.walls[wi].gap || 0)); }
function effGapR() { return Math.max(0, Math.min(300, S.walls[0].gapR || 0)); }
const maxDep = wis => { let d = 0; wis.forEach(k => S.walls[k] && !S.walls[k].off && S.walls[k].sections.forEach(s => s.items.forEach(o => d = Math.max(d, (REAL_DEPTH[o.t][o.d] || 400) / 10)))); return d; };
// shift at which the shelves of the two walls in that corner stop overlapping
function optGap(key) { const act = wallsActive(); const other = key === '0' ? (S.layout === 'Lr' ? [2] : [1]) : key === '0r' ? [2] : [0]; return Math.ceil(maxDep(other.filter(k => act.includes(k))) + 1.5); }
function minGap() { return Math.ceil(maxDep([0]) + 1.5); }
function placeWall(g, wi) {
  const F = frame();
  if (wi === 0) { g.position.x = F.x0; return; }
  const gap = effGap(wi) / 100;
  if (wi === 1) { g.rotation.y = -Math.PI / 2; g.scale.z = -1; g.position.set(F.xL, 0, gap); }
  if (wi === 2) { g.rotation.y = Math.PI / 2; g.scale.x = -1; g.scale.z = -1; g.position.set(F.xR, 0, gap); }
}

let ROOMB = null;
// window and door openings: which wall, position along it (m), size
function openingsList(F, CH) {
  const R = S.room, out = [], act = wallsActive(), ext = wi => act.includes(wi) ? effGap(wi) / 100 + wallWidth(wi) * MM : 0;
  if (R.win) { const w = 1.3, b = 0.82, h = Math.min(1.5, CH - b - 0.28), off = (R.winX || 0) / 100;
    if (S.layout === 'U') out.push({ wall: 'R', z: ext(2) + 0.45 + w / 2 + off, w, h, b, kind: 'win' });
    else if (S.layout === 'Lr') out.push({ wall: 'B', x: F.x0 - 0.45 - w / 2 - off, w, h, b, kind: 'win' });
    else out.push({ wall: 'B', x: F.x0 + F.backW + 0.45 + w / 2 + off, w, h, b, kind: 'win' }); }
  if (R.door) { const w = 0.9, h = Math.min(2.1, CH - 0.2), b = 0;
    if (S.layout === 'straight') out.push({ wall: 'B', x: F.x0 - 0.55 - w / 2, w, h, b, kind: 'door' });
    else if (S.layout === 'Lr') out.push({ wall: 'R', z: ext(2) + 0.5 + w / 2, w, h, b, kind: 'door' });
    else out.push({ wall: 'L', z: ext(1) + 0.5 + w / 2, w, h, b, kind: 'door' }); }
  return out;
}
let SKYT = null;
function skyTex() { if (!SKYT) { const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  // blurred out-of-focus view: sky, distant hills, a tree line and a sunny meadow (no image files)
  const sk = g.createLinearGradient(0, 0, 0, 300); sk.addColorStop(0, '#bcd6ee'); sk.addColorStop(1, '#eef3f4'); g.fillStyle = sk; g.fillRect(0, 0, 512, 512);
  g.filter = 'blur(10px)'; g.fillStyle = 'rgba(255,255,255,0.8)'; [[90, 80, 70], [300, 60, 90], [430, 120, 60]].forEach(([x, y, r]) => { g.beginPath(); g.ellipse(x, y, r * 1.6, r * 0.5, 0, 0, 7); g.fill(); });
  g.fillStyle = '#a9bfc4'; g.beginPath(); g.moveTo(0, 300); for (let x = 0; x <= 512; x += 32) g.lineTo(x, 270 - 30 * Math.sin(x / 90) - 14 * Math.sin(x / 31)); g.lineTo(512, 512); g.lineTo(0, 512); g.fill();
  g.fillStyle = '#6f8f63'; for (let i = 0; i < 26; i++) { const x = i * 21 + (i * 37 % 13), r = 18 + (i * 53 % 17); g.beginPath(); g.ellipse(x, 312 - r * 0.6, r, r * 1.3, 0, 0, 7); g.fill(); }
  const md = g.createLinearGradient(0, 320, 0, 512); md.addColorStop(0, '#a5bd78'); md.addColorStop(1, '#c9d49a'); g.fillStyle = md; g.fillRect(0, 322, 512, 190);
  g.filter = 'none'; SKYT = new THREE.CanvasTexture(c); SKYT.colorSpace = THREE.SRGBColorSpace; } return SKYT; }
// opening built in the wall plane's local frame (z = 0 is the wall surface, +z into the room)
function buildOpening(grp, o, H) {
  const g = new THREE.Group(); grp.add(g);
  const x0 = o.c - o.w / 2, x1 = o.c + o.w / 2, yb = o.b - H / 2, yt = yb + o.h, D = 0.24, cx = o.c, cy = (yb + yt) / 2, door = o.kind === 'door';
  const rev = new THREE.MeshStandardMaterial({ color: new THREE.Color(S.wall), roughness: 0.95, envMapIntensity: 0.5 });
  const trim = new THREE.MeshPhysicalMaterial({ color: 0xf8f7f3, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const add = (w, h, d, x, y, z, m, cast = true, r = 0) => { const b = r ? new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m) : box(w, h, d, 0, 0, 0, m); if (r) { b.receiveShadow = true; } b.position.set(x, y, z); b.castShadow = cast; g.add(b); return b; };
  add(0.02, o.h + 0.02, D, x0 - 0.01, cy, -D / 2, rev, false); add(0.02, o.h + 0.02, D, x1 + 0.01, cy, -D / 2, rev, false); add(o.w + 0.04, 0.02, D, cx, yt + 0.01, -D / 2, rev, false);
  const cw = 0.075, ct = 0.018;
  add(cw, o.h + cw, ct, x0 - cw / 2, yb + (o.h + cw) / 2, ct / 2, trim, true, 0.004); add(cw, o.h + cw, ct, x1 + cw / 2, yb + (o.h + cw) / 2, ct / 2, trim, true, 0.004); add(o.w + 2 * cw, cw, ct, cx, yt + cw / 2, ct / 2, trim, true, 0.004);
  if (!door) {
    add(o.w + 0.04, 0.02, D, cx, yb - 0.01, -D / 2, rev, false);
    add(o.w + 2 * cw + 0.05, 0.028, 0.31, cx, yb + 0.014, -0.085, trim, true, 0.006); // sill
    add(o.w + 2 * cw, 0.06, ct, cx, yb - 0.03, ct / 2, trim, true, 0.004); // apron
    const fz = -0.16, fw = 0.06, fd = 0.07, fm = new THREE.MeshPhysicalMaterial({ color: 0xfbfbf9, roughness: 0.35, clearcoat: 0.4 });
    add(fw, o.h, fd, x0 + fw / 2, cy, fz, fm, false, 0.006); add(fw, o.h, fd, x1 - fw / 2, cy, fz, fm, false, 0.006); add(o.w, fw, fd, cx, yt - fw / 2, fz, fm, false, 0.006); add(o.w, fw, fd, cx, yb + 0.028 + fw / 2, fz, fm, false, 0.006);
    add(0.05, o.h - 0.1, fd * 0.85, cx, cy + 0.01, fz, fm, false, 0.005); add(o.w - 0.1, 0.045, fd * 0.85, cx, yb + o.h * 0.7, fz, fm, false, 0.005);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 0.06, o.h - 0.06), new THREE.MeshPhysicalMaterial({ color: 0xeef5fb, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 2.2, clearcoat: 1, depthWrite: false })); gl.position.set(cx, cy, fz - 0.005); g.add(gl);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 0.8, o.h + 0.8), new THREE.MeshBasicMaterial({ map: skyTex(), toneMapped: false })); sky.position.set(cx, cy, -0.7); g.add(sky);
    // soft daylight glow spilling onto the reveal and sill
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 0.5, o.h + 0.5), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xfff6e8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); glow.position.set(cx, cy, 0.002); g.add(glow);
  } else {
    const lm = new THREE.MeshPhysicalMaterial({ color: 0xe6d6ca, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 });
    const leaf = add(o.w - 0.012, o.h - 0.006, 0.04, cx, yb + (o.h - 0.006) / 2, -0.06, lm, true, 0.004);
    leaf.castShadow = false;
    // two raised panels with a moulding, like a classic panel door
    const lw = o.w - 0.012, st = 0.11, pz = -0.04, ph = [[yb + 0.12, yb + o.h * 0.42], [yb + o.h * 0.42 + 0.11, yt - 0.12]];
    ph.forEach(([y0, y1]) => { const pw = lw - 2 * st, pcy = (y0 + y1) / 2, phh = y1 - y0;
      add(pw - 0.05, phh - 0.05, 0.012, cx, pcy, pz + 0.004, lm, true, 0.006);
      add(pw, 0.016, 0.012, cx, y1 - 0.008, pz + 0.004, lm, true, 0.004); add(pw, 0.016, 0.012, cx, y0 + 0.008, pz + 0.004, lm, true, 0.004);
      add(0.016, phh, 0.012, cx - pw / 2 + 0.008, pcy, pz + 0.004, lm, true, 0.004); add(0.016, phh, 0.012, cx + pw / 2 - 0.008, pcy, pz + 0.004, lm, true, 0.004); });
    const hg = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
    [yb + 0.25, yt - 0.25].forEach(y => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.1, 12), hg); h.position.set(x0 + 0.012, y, -0.038); g.add(h); });
    const jm = trim; add(0.03, o.h, 0.06, x0 + 0.015, cy, -0.06, jm, false); add(0.03, o.h, 0.06, x1 - 0.015, cy, -0.06, jm, false); add(o.w, 0.03, 0.06, cx, yt - 0.015, -0.06, jm, false);
    const hm = new THREE.MeshPhysicalMaterial({ color: 0x1c1c1e, metalness: 0.7, roughness: 0.32, clearcoat: 0.5 }), hx = x1 - 0.08, hy = yb + 1.0;
    const rose = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.2, 0.01, 2, 0.004), hm); rose.position.set(hx, hy - 0.05, -0.035); g.add(rose);
    const key = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 12), new THREE.MeshBasicMaterial({ color: 0x050505 })); key.rotation.x = Math.PI / 2; key.position.set(hx, hy - 0.12, -0.029); g.add(key);
    const lev = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.018, 0.018, 2, 0.007), hm); lev.position.set(hx - 0.055, hy, -0.016); g.add(lev);
  }
}
let GLOWT = null;
function glowTex() { if (!GLOWT) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); GLOWT = new THREE.CanvasTexture(c); } return GLOWT; }
let JOINTS = {};
function jointTex(k) { if (!JOINTS[k]) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256); g.fillStyle = 'rgba(70,64,58,0.55)'; g.fillRect(0, 0, 256, 2); g.fillRect(0, 0, 2, 256); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 2, 256, 1); g.fillRect(2, 0, 1, 256); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; JOINTS[k] = t; } return JOINTS[k]; }
const FILLS = [];
function buildRoom() {
  room.clear();
  FILLS.length = 0;
  if (!catcher) { catcher = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.25 })); catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; model.add(catcher); }
  const F = frame(), backW = F.backW, ST = !!S.studio && !photo, CH = Math.max(S.room.ceilH || 300, S.railTop + 4) / 100, Mg = 0.8 + (S.room.extra ?? 250) / 100;
  const cl = F.xL != null, cr = F.xR != null, left = cl ? F.xL : F.x0 - Mg, right = cr ? F.xR : F.x0 + backW + Mg, cx = (left + right) / 2;
  ROOMB = { l: cl && !photo ? left : -1e9, r: cr && !photo ? right : 1e9, ch: 1e9, CH };
  const act = wallsActive(), sideLen = Math.max(5, ...[1, 2].filter(w => act.includes(w)).map(w => effGap(w) / 100 + wallWidth(w) * MM + Mg));
  const floorM = ST ? new THREE.ShadowMaterial({ opacity: 0 }) : (fm0 => fm0.isMeshStandardMaterial ? new THREE.MeshLambertMaterial({ color: fm0.color, map: fm0.map, normalMap: fm0.normalMap, normalScale: fm0.normalScale, userData: { floor: true } }) : fm0)(floorMat()); // matte floor: no glare
  // floor laid from the corner: tiles and parquet at 45 deg, laminate along the main wall (real scale, see FLOORS)
  const fc = cl ? left : cr ? right : F.x0, FD = FLOORS[S.floor] || FLOORS.oak, fRot = FD[4] ? Math.PI / 4 : 0;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorM); fl.rotation.set(-Math.PI / 2, 0, fRot); fl.position.set(fc, 0, 0); fl.receiveShadow = !ST; fl.userData.floorM = true; room.add(fl);
  const FJ = FLOORS[S.floor] && FLOORS[S.floor][3];
  if (!ST && FJ) { const jt = jointTex(S.floor).clone(); jt.needsUpdate = true; jt.repeat.set(60 / FJ[0], 60 / FJ[1]); const j = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: jt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); j.rotation.set(-Math.PI / 2, 0, fRot); j.position.set(fc, 0.0005, 0); room.add(j); }
  const ops = ST ? [] : openingsList(F, CH), WH = CH + 0.03, bk = new THREE.Group(); room.add(bk);
  const wallPlane = (w, x, z, ry, parent, holes) => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, -WH / 2); sh.lineTo(w / 2, -WH / 2); sh.lineTo(w / 2, WH / 2); sh.lineTo(-w / 2, WH / 2); sh.lineTo(-w / 2, -WH / 2);
    holes.forEach(o => { const x0 = o.c - o.w / 2, y0 = Math.max(o.b, 0.002) - WH / 2, p = new THREE.Path(); p.moveTo(x0, y0); p.lineTo(x0 + o.w, y0); p.lineTo(x0 + o.w, o.b + o.h - WH / 2); p.lineTo(x0, o.b + o.h - WH / 2); p.lineTo(x0, y0); sh.holes.push(p); });
    const geo = new THREE.ShapeGeometry(sh), grp = new THREE.Group(); grp.position.set(x, WH / 2, z); grp.rotation.y = ry; parent.add(grp);
    if (!ST) { const wm = new THREE.Mesh(geo, wallMat()); wm.receiveShadow = S.room.shP === 'sun'; grp.add(wm); }
    const q = new THREE.Mesh(geo, wallShadowMat()); q.receiveShadow = true; grp.add(q);
    holes.forEach(o => buildOpening(grp, o, WH)); grp.userData.wallG = true; return grp;
  };
  const bo = ops.filter(o => o.wall === 'B').map(o => ({ ...o, c: o.x - cx }));
  bk.userData.occ = wallPlane(right - left, cx, 0, 0, bk, bo);
  const skM = new THREE.MeshBasicMaterial({ color: S.room.skirtColor || '#f6f5f2', toneMapped: false }); skM.userData.flat = true; /* v13b: unlit plinth - same colour at any rotation, no shading/shadow/AO */
  // skirting runs along u (local x of a wall frame), cut at doors
  const skirt = (parent, u0, u1, cuts, place) => { let segs = [[u0, u1]]; cuts.forEach(([a, b]) => { segs = segs.flatMap(([s, e]) => b <= s || a >= e ? [[s, e]] : [[s, a], [b, e]].filter(([p, q]) => q - p > 0.01)); });
    segs.forEach(([s, e]) => { const g = new THREE.Group(); place(g); [[0.016, 0.08, 0.04, 0.008], [0.022, 0.012, 0.074, 0.011]].forEach(([d, h, y, z]) => { const m = box(e - s, h, d, (s + e) / 2, y, z, skM); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; g.add(m); }); parent.add(g); }); };
  const doorCuts = (list, key) => list.filter(o => o.kind === 'door').map(o => [o[key] - o.w / 2 - 0.08, o[key] + o.w / 2 + 0.08]);
  const cmM = new THREE.MeshStandardMaterial({ color: S.room.cornColor || '#fbfaf6', roughness: 0.7 });
  const cornice = (len, place, parent) => { const g = new THREE.Group(); place(g); [[0.012, 0.09, 0.006], [0.03, 0.05, 0.02], [0.05, 0.022, 0.04]].forEach(([d, hh, zz]) => { const m = box(len, hh, d, 0, CH - hh / 2, zz - d / 2 + 0.006, cmM); m.castShadow = false; g.add(m); }); parent.add(g); };
  const dA = ((S.room.angle || 90) - 90) * Math.PI / 180, k = 0.16;
  const side = L => { const x = L ? left : right, pv = new THREE.Group(); pv.position.set(x, 0, 0); pv.rotation.y = L ? -dA : dA; room.add(pv);
    // side frame: u runs from the corner into the room along +z
    const so = ops.filter(o => o.wall === (L ? 'L' : 'R')).map(o => ({ ...o, c: L ? sideLen / 2 - o.z : o.z - sideLen / 2 }));
    pv.userData.occ = wallPlane(sideLen, 0, sideLen / 2, L ? Math.PI / 2 : -Math.PI / 2, pv, so);
    if (ST) return;
    // v13b: floor fill under this side wall, shaped each frame to the folded-floor wedge (no white gap from below)
    { floorM.side = THREE.DoubleSide; const fm = floorM; /* v13b: same material as the main floor */ const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(6).fill(0), 2)); const f = new THREE.Mesh(fg, fm); f.frustumCulled = false; f.visible = false; f.userData.floorFill = { L, len: 60 }; f.receiveShadow = !ST; pv.add(f); FILLS.push(f); }
    const fr = new THREE.Group(); fr.rotation.y = L ? Math.PI / 2 : -Math.PI / 2; if (L) fr.scale.x = -1; pv.add(fr); // local x = u (z in room), local z into the room
    if (!ST && S.room.skirting !== false) skirt(fr, 0, sideLen, doorCuts(ops.filter(o => o.wall === (L ? 'L' : 'R')), 'z'), () => {});
    if (S.room.cornice) cornice(sideLen, g => g.position.x = sideLen / 2, fr);
    aoStrip(fr, CH, 0.5, k, m => { m.position.set(0.25, CH / 2, 0.002); });
    { const cm = new THREE.Mesh(new THREE.PlaneGeometry(0.006, CH), new THREE.MeshBasicMaterial({ color: 0x8f8a83, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false })); cm.position.set(0.003, CH / 2, 0.003); cm.renderOrder = 3; fr.add(cm); } // v13h: crisp corner seam - a true vertical anchor line in the wall corner
    aoStrip(fr, sideLen, 0.35, k, m => { m.rotation.z = Math.PI / 2; m.position.set(sideLen / 2, 0.175, 0.002); });
    // corner shade on the back wall next to this side wall
    aoStrip(bk, CH, 0.5, k, m => { m.position.set(L ? x + 0.25 : x - 0.25, CH / 2, 0.002); if (!L) m.scale.x = -1; });
  };
  if (cl) side(true); if (cr) side(false);
  if (!ST) { const W = right - left;
    aoStrip(bk, W, 0.35, k, m => { m.position.set(cx, 0.175, 0.002); m.rotation.z = Math.PI / 2; });
    if (false) { aoStrip(room, W, 0.3, k * 0.7, m => { m.rotation.z = -Math.PI / 2; m.position.set(cx, CH - 0.15, 0.002); }); aoStrip(room, W, 0.4, k * 0.55, m => { m.rotation.x = Math.PI / 2; m.rotation.z = Math.PI / 2; m.scale.x = -1; m.position.set(cx, CH - 0.002, 0.2); }); } }
  if (ST) return;
  if (!ST && S.room.skirting !== false) skirt(bk, left, right, doorCuts(bo.map(o => ({ ...o, x: o.c + cx })), 'x'), () => {});
  // ceiling: one solid plane over the whole room, seen only from below
  const cg = new THREE.Group(); cg.userData.occC = CH; room.add(cg);
  if (S.room.ceiling) { const ce = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); ce.rotation.x = Math.PI / 2; ce.position.set(cx, CH, 0); ce.renderOrder = -1; cg.add(ce);
  }
  if (S.room.cornice) cornice(right - left, g => g.position.x = cx, bk);
  if (S.room.lamps) { const n = Math.max(2, Math.round((right - left) / 1.2)); for (let i = 0; i < n; i++) { const x = left + (right - left) * (i + 0.5) / n; const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 24), new THREE.MeshBasicMaterial({ color: 0xfff6e6, toneMapped: false })); d.position.set(x, CH - 0.007, 0.9); cg.add(d); const rg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide })); rg.position.set(x, CH - 0.006, 0.9); cg.add(rg); const rd = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 32), new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.35, metalness: 0.4 })); rd.rotation.x = Math.PI / 2; rd.position.set(x, CH - 0.0121, 0.9); cg.add(rd); const pl = new THREE.PointLight(0xffe9cc, 1.0, 0, 2); pl.position.set(x, CH - 0.12, 0.9); cg.add(pl); } }
}

// ---------- decor: rug, plants, window light ----------
const decor = new THREE.Group(); scene.add(decor);
const RUGT = {};
function rugTex(fluffy) {
  const k = fluffy ? 'f' : 'p'; if (RUGT[k]) return RUGT[k];
  let sd = fluffy ? 21 : 33; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const n = document.createElement('canvas'); n.width = n.height = 512; const q = n.getContext('2d'); q.fillStyle = 'rgb(128,128,255)'; q.fillRect(0, 0, 512, 512);
  if (fluffy) { g.fillStyle = '#b3a285'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 70000; i++) { const x = rnd() * 512, y = rnd() * 512, a = rnd() * 6.3, L = 3 + rnd() * 7, l = 170 + rnd() * 55; g.strokeStyle = `rgba(${l},${l - 8},${l - 22},0.55)`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); q.strokeStyle = `rgb(${128 + Math.cos(a) * 70},${128 + Math.sin(a) * 70},230)`; q.lineWidth = 1.5; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); q.stroke(); } }
  else { g.fillStyle = '#b9ab94'; g.fillRect(0, 0, 512, 512); for (let y = 0; y < 512; y += 6) for (let x = 0; x < 512; x += 6) { const l = 140 + rnd() * 45, o = ((x + y) / 6) % 2; g.fillStyle = `rgba(${l + 30},${l + 20},${l},0.95)`; if (o) g.fillRect(x, y, 6, 4); else g.fillRect(x, y, 4, 6); q.fillStyle = o ? 'rgb(128,150,255)' : 'rgb(150,128,255)'; if (o) q.fillRect(x, y, 6, 2); else q.fillRect(x, y, 2, 6); }
    g.fillStyle = 'rgba(80,72,62,0.55)'; for (let k2 = 0; k2 < 3; k2++) { g.fillRect(0, 60 + k2 * 10, 512, 4); g.fillRect(0, 448 - k2 * 10, 512, 4); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  const tn = new THREE.CanvasTexture(n); tn.wrapS = tn.wrapT = THREE.RepeatWrapping;
  RUGT[k] = [t, tn]; return RUGT[k];
}
function rugSpot() { const F = frame(), act = wallsActive(); if (S.layout === 'L') return [F.xL + 1.05, Math.max(1.0, Math.min(1.4, (act.includes(1) ? effGap(1) / 100 + wallWidth(1) * MM : 1) * 0.5 + 0.55))]; if (S.layout === 'Lr') return [F.xR - 1.05, 1.1]; return [F.x0 + F.backW / 2, S.layout === 'U' ? 1.2 : 1.05]; }
function buildRug() {
  const R = S.rug; if (!R || S.floor === 'carpet') return;
  const round = R.shape === 'round', fluffy = R.pile === 'fluffy', rk = Math.max(0.5, Math.min(2, R.k || 1)), th = fluffy ? 0.024 : 0.006, w = (round ? 1.5 : 1.8) * rk, d = (round ? 1.5 : 1.2) * rk, [t, tn] = rugTex(fluffy);
  const mt = t.clone(), mn = tn.clone(); mt.needsUpdate = mn.needsUpdate = true; mt.repeat.set(fluffy ? 2.5 : 1, fluffy ? 2.5 : (round ? 1 : 1)); mn.repeat.copy(mt.repeat);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, map: mt, normalMap: mn, normalScale: new THREE.Vector2(fluffy ? 0.9 : 0.5, fluffy ? 0.9 : 0.5), roughness: 1, envMapIntensity: 0.25 });
  const geo = round ? new THREE.CylinderGeometry(w / 2, w / 2 - (fluffy ? 0.012 : 0.002), th, 96) : new RoundedBoxGeometry(w, th, d, 3, fluffy ? 0.011 : 0.0028);
  if (round) { const uv = geo.attributes.uv, p = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getZ(i) / w + 0.5); }
  else { const uv = geo.attributes.uv, p = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getZ(i) / d + 0.5); }
  const m = new THREE.Mesh(geo, mat), sp = rugSpot(), x = R.x ?? sp[0], z = R.z ?? sp[1]; m.position.set(x, th / 2 + 0.001, z); if (!round) m.rotation.y = R.r || 0; m.userData.rug = true; m.userData.k0 = rk; m.receiveShadow = true; m.castShadow = false; decor.add(m);
}
// ---- plants: procedural potted plants, draggable on the floor ----
var PLANTS = { fig: 'Фикус лировидный', monstera: 'Монстера', olive: 'Оливковое дерево', mirror: 'Зеркало в черной раме', pouf: 'Пуф' };
let BLOBT = null;
function blobMat(op) { if (!BLOBT) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(30,24,20,1)'); gr.addColorStop(0.55, 'rgba(30,24,20,0.55)'); gr.addColorStop(1, 'rgba(30,24,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); BLOBT = new THREE.CanvasTexture(c); }
  return new THREE.MeshBasicMaterial({ map: BLOBT, transparent: true, opacity: op, depthWrite: false, toneMapped: false }); }
// tall floor mirror in a slim black frame, leaning on the wall; the glass reflects the room environment
function mirrorModel() { const g = new THREE.Group(), W = 0.62, H = 1.72, f = 0.035, lean = 0.075, tilt = Math.atan2(lean, H);
  const fm = new THREE.MeshPhysicalMaterial({ color: 0x18181a, roughness: 0.42, metalness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const gm = new THREE.MeshStandardMaterial({ color: 0xe9eeee, metalness: 1, roughness: 0.06, envMapIntensity: 2.6, emissive: new THREE.Color(0x8d9494) });
  const in_ = new THREE.Group(); in_.rotation.x = -tilt; in_.position.z = -lean; g.add(in_);
  const add = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.006), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; in_.add(o); return o; };
  add(f, H, 0.03, -W / 2 + f / 2, H / 2, 0, fm); add(f, H, 0.03, W / 2 - f / 2, H / 2, 0, fm); add(W, f, 0.03, 0, H - f / 2, 0, fm); add(W, f, 0.03, 0, f / 2, 0, fm);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * f + 0.004, H - 2 * f + 0.004), gm); gl.position.set(0, H / 2, 0.004); in_.add(gl);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), fm); back.rotation.y = Math.PI; back.position.set(0, H / 2, -0.012); in_.add(back);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.24, 0.36), blobMat(0.35)); sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.0025, 0.02); g.add(sh);
  g.position.z = 0; return g; }
// square upholstered pouf in soft velvet with a piped top edge
function poufModel() { const g = new THREE.Group(), s = 0.42, h = 0.44;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#8f7570'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,235' : '40,20,20'},${Math.random() * 0.08})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xe7cfc8), envMapIntensity: 0.5 });
  const b = new THREE.Mesh(new RoundedBoxGeometry(s, h - 0.03, s, 5, 0.06), m); b.position.y = (h - 0.03) / 2 + 0.03; b.castShadow = b.receiveShadow = true; g.add(b);
  const top = new THREE.Mesh(new RoundedBoxGeometry(s - 0.01, 0.07, s - 0.01, 5, 0.034), m); top.position.y = h - 0.03; top.castShadow = true; g.add(top);
  const fm = new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.5 }); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, z]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.03, 12), fm); l.position.set(a * (s / 2 - 0.05), 0.015, z * (s / 2 - 0.05)); g.add(l); });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(s + 0.24, s + 0.24), blobMat(0.5)); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.0025; g.add(sh);
  return g; }
let PSEED = 1; const prnd = () => (PSEED = (PSEED * 16807) % 2147483647) / 2147483647;
function potMesh(rt, rb, h, col, gloss) {
  const pts = [V(0, 0, 0), V(rb - 0.01, 0, 0), V(rb, 0.012, 0), V(rt, h - 0.012, 0), V(rt + 0.006, h, 0), V(rt - 0.012, h, 0), V(rt - 0.016, h - 0.03, 0), V(0, h - 0.03, 0)].map(p => new THREE.Vector2(p.x, p.y));
  const g = new THREE.Group(), pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), new THREE.MeshPhysicalMaterial({ color: col, roughness: gloss ? 0.32 : 0.75, clearcoat: gloss ? 0.7 : 0.05, clearcoatRoughness: 0.2, sheen: gloss ? 0 : 0.3 }));
  pot.castShadow = pot.receiveShadow = true; g.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(rt - 0.016, 40), new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = h - 0.035; g.add(soil);
  return g;
}
// leaf blade along +z from the origin, normal ~ +y; width profile f(u), droop and cup
function bladeGeo(len, wid, f, droop, cup, segU = 10, segV = 6) {
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= segU; i++) { const u = i / segU, ww = wid * f(u); for (let j = 0; j <= segV; j++) { const v = j / segV * 2 - 1; pos.push(v * ww / 2, -droop * u * u * len + cup * v * v * ww, u * len); uv.push(j / segV, u); } }
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) { const a = i * (segV + 1) + j, b = a + segV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function monsteraGeo(sz) {
  const sh = new THREE.Shape(), N = 90, slits = [0.5, 0.85, 1.2, 1.55, 1.95, 2.35], pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2, x = 16 * Math.pow(Math.sin(t), 3), y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); pts.push([x, y + 5, t]); }
  const out = []; pts.forEach(([x, y, t], i) => { const tt = t > Math.PI ? 2 * Math.PI - t : t; out.push([x, y]); slits.forEach(s => { if (Math.abs(tt - s) < Math.PI / N) { const ix = x * 0.38, iy = y * 0.85 + 2; out.push([ix, iy], [x * 1.0 + (t > Math.PI ? 0.6 : -0.6), y + 0.6]); } }); });
  out.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
  const g = new THREE.ShapeGeometry(sh, 2), p = g.attributes.position, k = sz / 22;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) * k, y = p.getY(i) * k; p.setXYZ(i, x, -0.35 * y * y / sz + 0.12 * x * x / sz, y); }
  g.computeVertexNormals(); return g;
}
function leafMat(c, gloss) { return new THREE.MeshPhysicalMaterial({ color: c, roughness: gloss, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0xc9e6b0), clearcoat: gloss < 0.4 ? 0.4 : 0, clearcoatRoughness: 0.3 }); }
function tube(pts, r, mat, rr = r) { const cv = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(cv, 24, r, 10, false); if (rr !== r) { const p = g.attributes.position; /* taper */ for (let i = 0; i < p.count; i++) { const seg = Math.floor(i / 11) / 24, c0 = cv.getPointAt(Math.min(1, seg)), v = V(p.getX(i), p.getY(i), p.getZ(i)).sub(c0), k = (r + (rr - r) * seg) / r; p.setXYZ(i, c0.x + v.x * k, c0.y + v.y * k, c0.z + v.z * k); } g.computeVertexNormals(); } const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; }
function plantModel(k) {
  if (k === 'mirror') return mirrorModel(); if (k === 'pouf') return poufModel();
  PSEED = { fig: 7, monstera: 13, olive: 29 }[k]; const g = new THREE.Group();
  if (k === 'fig') {
    const ph = 0.34; g.add(potMesh(0.17, 0.13, ph, 0xf1efea, false));
    const bark = new THREE.MeshStandardMaterial({ color: 0x6e5a48, roughness: 0.9 }), trunkPts = [V(0, ph - 0.03, 0), V(0.01, 0.7, 0.005), V(-0.01, 1.05, 0.01), V(0.02, 1.42, 0)];
    g.add(tube(trunkPts, 0.02, bark, 0.011)); const cv = new THREE.CatmullRomCurve3(trunkPts);
    const geo = bladeGeo(0.27, 0.19, u => Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.02)), 0.6) * (0.62 + 0.38 * u) * (u > 0.92 ? (1 - u) / 0.08 * 0.6 + 0.4 : 1), 0.25, 0.12);
    const mats = [leafMat(0x2d5a2a, 0.35), leafMat(0x37692f, 0.35), leafMat(0x264f25, 0.38)];
    for (let i = 0; i < 38; i++) { const t = 0.35 + 0.65 * (i / 37), p = cv.getPointAt(t), a = i * 2.4 + prnd() * 0.4, up = 0.25 + prnd() * 0.5 + (t > 0.9 ? 0.6 : 0), s = 0.75 + prnd() * 0.45 * (1.1 - t * 0.3);
      const l = new THREE.Mesh(geo, mats[i % 3]); l.position.copy(p).add(V(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02)); l.lookAt(p.clone().add(V(Math.cos(a), up, Math.sin(a)))); l.rotateZ((prnd() - 0.5) * 0.8); l.scale.setScalar(s); l.castShadow = true; g.add(l); }
  } else if (k === 'monstera') {
    const ph = 0.3; g.add(potMesh(0.21, 0.16, ph, 0xc58a6a, false));
    const stem = new THREE.MeshStandardMaterial({ color: 0x5a7d3c, roughness: 0.6 }), lm = [leafMat(0x1f4a24, 0.34), leafMat(0x285a2b, 0.34)];
    for (let i = 0; i < 10; i++) { const a = i * 2.4 + prnd() * 0.5, r = 0.18 + prnd() * 0.3, hh = ph + 0.25 + prnd() * 0.5, sz = 0.3 + prnd() * 0.16, base = V(Math.cos(a) * 0.04, ph - 0.03, Math.sin(a) * 0.04), end = V(Math.cos(a) * r, hh, Math.sin(a) * r);
      g.add(tube([base, V(Math.cos(a) * r * 0.3, (ph + hh) / 2 + 0.1, Math.sin(a) * r * 0.3), end], 0.007, stem, 0.005));
      const l = new THREE.Mesh(monsteraGeo(sz), lm[i % 2]); l.position.copy(end); l.lookAt(end.clone().add(V(Math.cos(a), -0.15 + prnd() * 0.3, Math.sin(a)))); l.rotateZ((prnd() - 0.5) * 0.5); l.castShadow = true; g.add(l); }
  } else {
    const ph = 0.36; g.add(potMesh(0.16, 0.12, ph, 0x3b3a38, true));
    const bark = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.95 }), tp = [V(0, ph - 0.03, 0), V(0.03, 0.62, 0.01), V(-0.02, 0.9, -0.01), V(0.01, 1.08, 0.02)];
    g.add(tube(tp, 0.024, bark, 0.014));
    const tips = [], top = tp[3];
    for (let b = 0; b < 7; b++) { const a = b * 0.9 + prnd() * 0.5, e = V(Math.cos(a) * (0.18 + prnd() * 0.12), top.y + 0.12 + prnd() * 0.3, Math.sin(a) * (0.18 + prnd() * 0.12)); g.add(tube([top.clone(), top.clone().lerp(e, 0.5).add(V(0, 0.05, 0)), e], 0.008, bark, 0.004)); tips.push(e); }
    const geo = bladeGeo(0.07, 0.014, u => Math.sin(Math.PI * Math.pow(u, 0.8)), 0.1, 0.05, 4, 2), lm = leafMat(0x7a8c62, 0.55);
    const n = 420, im = new THREE.InstancedMesh(geo, lm, n), o = new THREE.Object3D(), C = V(0, top.y + 0.28, 0);
    for (let i = 0; i < n; i++) { const tpt = tips[i % tips.length], p = top.clone().lerp(tpt, 0.25 + prnd() * 0.85).add(V((prnd() - 0.5) * 0.22, (prnd() - 0.4) * 0.2, (prnd() - 0.5) * 0.22)); o.position.copy(p); const d = p.clone().sub(C).normalize().add(V((prnd() - 0.5), (prnd() - 0.3), (prnd() - 0.5))); o.lookAt(p.clone().add(d)); o.scale.setScalar(0.8 + prnd() * 0.5); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new THREE.Color().setHSL(0.24 + prnd() * 0.04, 0.18 + prnd() * 0.12, 0.38 + prnd() * 0.16)); }
    im.castShadow = true; g.add(im);
  }
  return g;
}
const PLC = {};
function plantSpot(i) { const F = frame(), cl = F.xL != null, cr = F.xR != null; const spots = []; if (S.layout === 'Lr' || S.layout === 'straight') spots.push([F.x0 - 0.45, 0.4]); if (!cr) spots.push([F.x0 + F.backW + 0.45, 0.4]); else spots.push([F.xR - 0.4, 2.2]); if (cl) spots.push([F.xL + 0.4, 2.4]); spots.push([F.x0 + F.backW / 2 + 0.9, 1.6]); return spots[i % spots.length]; }
function buildPlants() {
  (S.plants || []).forEach((p, i) => { if (!PLC[p.k]) PLC[p.k] = plantModel(p.k); const g = PLC[p.k].clone(); g.position.set(p.x, 0, p.z); g.rotation.y = p.r || 0; g.scale.setScalar(p.s || 1); g.userData.plant = i; g.traverse(o => { o.userData.plant = i; }); decor.add(g); });
}
// window light: soft window-shaped patch with mullions on the wall and / or floor (additive, works on the unlit walls)
let WLT = null;
function winLightTex() { if (!WLT) { const c = document.createElement('canvas'); c.width = 256; c.height = 320; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 320); g.filter = 'blur(7px)'; g.fillStyle = '#fff'; const m = 12; [[24, 24], [134, 24], [24, 128], [134, 128]].forEach(([x, y], i) => g.fillRect(x, y, 98, i < 2 ? 96 - m / 2 : 168)); g.filter = 'none'; WLT = new THREE.CanvasTexture(c); WLT.colorSpace = THREE.SRGBColorSpace; } return WLT; }
const winDL = new THREE.DirectionalLight(0xfff0dc, 0); scene.add(winDL, winDL.target);
function buildWinLight(c) {
  const mode = S.room.winL || 'off'; winDL.intensity = 0; if (mode === 'off' || S.studio || photo) return;
  const mk = (w, h, op) => { const geo = new THREE.PlaneGeometry(w, h); return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: winLightTex(), color: 0xfff2dc, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); };
  const F = frame(), from = S.layout === 'Lr' ? 1 : -1; // light comes from the open side
  if (mode === 'wall' || mode === 'both') { const p = mk(1.15, 1.45, 0.26); p.geometry.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, -0.32 * from, 0, 0, 0)); p.position.set(c.x - from * 0.15, 1.25, 0.004); decor.add(p); }
  if (mode === 'floor' || mode === 'both') { const p = mk(1.0, 1.7, 0.2); p.geometry.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.45 * from, 0, 0, 0)); p.rotation.x = -Math.PI / 2; p.rotation.z = from * 0.5; p.position.set(c.x - from * 0.3, 0.0035, Math.max(1.0, c.z + 0.8)); decor.add(p); }
  winDL.intensity = 0.9; winDL.position.set(c.x + from * 3.5, c.y + 2.5, 3.5); winDL.target.position.copy(c);
}
function buildDecor(c) {
  decor.clear(); decor.visible = !photo && !S.studio; if (!decor.visible) { winDL.intensity = 0; return; }
  buildRug(); buildPlants(); buildWinLight(c);
}

// ---------- dimensions ----------
// «Авто» (default): dark lines on a light background (Студия, white brick), white otherwise, so dimensions never vanish
function dimBlack() { if (S.dimC === 'black') return true; if (S.dimC === 'white') return false; if (photo && !$('showRoom').checked) return false;
  const c = new THREE.Color(S.studio ? (S.wall || S.bg || '#e2ded7') : (S.wall || '#a9a49c')); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.62; }
const dimCol = () => dimBlack() ? '#1e1e1e' : '#ffffff';
function labelSprite(text, mode) {
  const bold = S.dimStyle !== 'thin', white = !dimBlack();
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 40, font = `${bold ? 700 : 600} ${fs}px Manrope,Arial,sans-serif`;
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 30; c.width = w; c.height = 60; g.font = font;
  g.fillStyle = white ? `rgba(24,24,26,${bold ? 0.62 : 0.42})` : `rgba(255,255,255,${bold ? 0.94 : 0.8})`; g.beginPath(); g.roundRect(0, 0, w, 60, 16); g.fill();
  g.fillStyle = white ? '#ffffff' : '#1e1e1e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false, sizeAttenuation: false }));
  /* about 17 css px tall at any zoom */ const h = 2 * Math.tan(camera.fov * Math.PI / 360) * ((view.clientHeight || 600) < 700 ? 14 : 16) / Math.max(300, view.clientHeight || 600); sp.scale.set(h * w / 60, h, 1); sp.renderOrder = 10;
  // h: above the line; vL / vR: vertical text left / right of a vertical line; tL / tR: tag anchored at its left / right bottom corner
  if (mode === 'vL') { sp.center.set(0.5, 0); sp.material.rotation = Math.PI / 2; } else if (mode === 'vR') { sp.center.set(0.5, 1); sp.material.rotation = Math.PI / 2; } else if (mode === 'tL') sp.center.set(0, 0); else if (mode === 'tR') sp.center.set(1, 0); else sp.center.set(0.5, 0);
  return sp;
}
let DM = null, DTH = 0.003;
function segs(g, pts) {
  const bold = S.dimStyle !== 'thin';
  if (!DM || DM.k !== dimCol() + S.dimStyle) DM = { k: dimCol() + S.dimStyle, m: bold ? new THREE.MeshBasicMaterial({ color: dimCol(), depthTest: false, transparent: true, toneMapped: false }) : new THREE.LineDashedMaterial({ color: dimCol(), dashSize: 0.018, gapSize: 0.012, transparent: true, opacity: 0.8, depthTest: false, toneMapped: false }) };
  if (!bold) { const geo = new THREE.BufferGeometry().setFromPoints(pts); const l = new THREE.LineSegments(geo, DM.m); l.computeLineDistances(); l.renderOrder = 9; g.add(l); return; }
  const th = DTH, q = new THREE.Quaternion(), X = V(1, 0, 0);
  for (let i = 0; i < pts.length; i += 2) { const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), L = d.length(); if (L < 1e-5) continue; const m = new THREE.Mesh(BOX, DM.m); m.scale.set(L + th, th, th); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.copy(q.setFromUnitVectors(X, d.normalize())); m.renderOrder = 9; g.add(m); }
}
function dimH(g, labels, xa, xb, y, z, text, yPart) {
  const t = 0.012, gap = 0.015, p = [V(xa, y, z), V(xb, y, z)];
  [xa, xb].forEach(x => p.push(V(x, yPart + gap, z), V(x, y + 0.012, z), V(x - t * 0.7, y - t * 0.7, z), V(x + t * 0.7, y + t * 0.7, z)));
  segs(g, p); labels.push({ p: V((xa + xb) / 2, y + 0.012, z), t: text, k: 'h' });
}
function dimV(g, labels, x, ya, yb, z, text, xPart, side) {
  const t = 0.012, gap = 0.015, sg = Math.sign(x - xPart) || 1, p = [V(x, ya, z), V(x, yb, z)];
  [ya, yb].forEach(y => p.push(V(xPart + sg * gap, y, z), V(x + sg * 0.012, y, z), V(x - t * 0.7, y - t * 0.7, z), V(x + t * 0.7, y + t * 0.7, z)));
  segs(g, p); const sd = side || (sg > 0 ? 'vR' : 'vL'); labels.push({ p: V(x + (sd === 'vR' ? 0.012 : -0.012), (ya + yb) / 2, z), t: text, k: sd });
}
const cm = mm => String(Math.round(mm / 10 * 10) / 10).replace('.', ',');
function itemTop(o) { return o.y * 10 * MM + (o.t === 'rail' ? 0.017 : 0); }
function itemBot(o) { const y = o.y * 10 * MM; return o.t === 'basket' || o.t === 'pull' ? y - (o.h || 85) * MM : o.t === 'trouser' ? y - 0.045 : o.t === 'shoe' ? y - 0.11 : o.t === 'rail' ? y - 0.017 : y - 0.042; }
function buildDims(g, wi) {
  const labels = [], W = S.walls[wi], z = 0.006, railY = S.railTop * 10 * MM, D = S.dm || {};
  let xs = [0]; W.sections.forEach(s => xs.push(xs[xs.length - 1] + s.w * 10 * MM));
  const tot = xs[xs.length - 1];
  if (D.s) W.sections.forEach((s, i) => dimH(g, labels, xs[i], xs[i + 1], railY + 0.08, z, cm(s.w * 10), railY));
  if (D.o) dimH(g, labels, -0.0125, tot + 0.0125, railY + (D.s ? 0.19 : 0.08), z, cm(tot / MM + 25), railY);
  if (D.s) { const eg = effGap(wi), lr = wi === 0 && S.layout === 'Lr', gr = wi === 0 && S.layout === 'U' ? effGapR() : 0;
    if (eg > 0 && S.layout !== 'straight') { if (lr) dimH(g, labels, tot + 0.0125, tot + eg / 100 + 0.02, railY + 0.08, z, cm(eg * 10 - 12.5), railY); else dimH(g, labels, -eg / 100 - (wi === 0 ? 0.02 : 0), -0.0125, railY + 0.08, z, cm(eg * 10 - 12.5), railY); }
    if (gr > 0) dimH(g, labels, tot + 0.0125, tot + gr / 100 + 0.02, railY + 0.08, z, cm(gr * 10 - 12.5), railY); }
  if (D.o) {
    const left = wi === 0 && S.layout === 'Lr', sg = left ? -1 : 1, xb = left ? -0.0125 : tot + 0.0125;
    const pb = postBottom() * MM, pt = (S.railTop * 10 - 10) * MM;
    dimV(g, labels, xb + sg * 0.1, pb, pt, z, cm(S.postH), xb);
    dimV(g, labels, xb + sg * 0.24, 0, railY, z, cm(railY / MM), xb);
  }
  W.sections.forEach((s, i) => {
    const its = s.items.slice().sort((a, b) => itemBot(a) - itemBot(b)); if (!its.length) return;
    if (D.g) { // distances between shelves: at the side of the section, by the left upright
      const x = xs[i] + 0.035, zz = 0.07, p = [], t = 0.01, pts = [0]; its.forEach(o => pts.push(itemBot(o), itemTop(o)));
      for (let k = 0; k < pts.length - 1; k += 2) { const ya = pts[k], yb = pts[k + 1]; if (yb - ya < 0.03) continue;
        p.push(V(x, ya, zz), V(x, yb, zz), V(x - t, ya, zz), V(x + t, ya, zz), V(x - t, yb, zz), V(x + t, yb, zz));
        if (yb - ya > 0.1) labels.push({ p: V(x + 0.01, (ya + yb) / 2, zz), t: cm((yb - ya) / MM), k: 'vR' }); }
      segs(g, p);
    }
    its.forEach(o => {
      if (o.t === 'rail') return;
      const zf = ZI + (REAL_DEPTH[o.t][o.d] || 400) * MM, yt = itemTop(o);
      if (D.h) labels.push({ p: V(xs[i] + 0.03, yt + 0.012, zf), t: `↑${Math.round(o.y)}`, k: 'tL' });
      if (D.sd) {
        const xa = xs[i] + 0.016, xb2 = xs[i + 1] - 0.016, y = yt + 0.008;
        segs(g, [V(xa, y, zf + 0.01), V(xb2, y, zf + 0.01), V(xa, y - 0.01, zf + 0.01), V(xa, y + 0.01, zf + 0.01), V(xb2, y - 0.01, zf + 0.01), V(xb2, y + 0.01, zf + 0.01),
          V(xb2, y, 0.06), V(xb2, y, zf), V(xb2, y - 0.01, 0.06), V(xb2, y + 0.01, 0.06)]);
        labels.push({ p: V((xa + xb2) / 2 - (D.h ? 0 : 0), y + 0.01, zf + 0.01), t: `${s.w}`, k: 'h' });
        labels.push({ p: V(xb2, y + 0.01, (0.06 + zf) / 2), t: `${o.d}`, k: 'h' });
      }
    });
  });
  return labels;
}
const WG = [];
function dimsOn() { const d = S.dm || {}; return !!(d.o || d.s || d.h || d.g || d.sd); }
function rebuildDims() {
  dimsG.clear(); const on = dimsOn(); dimsG.visible = on; if (!on) return;
  { const d = camera.position.distanceTo(bbox.getCenter(new THREE.Vector3())); DTH = Math.max(0.0025, d * 2 * Math.tan(camera.fov * Math.PI / 360) * 1.7 / Math.max(300, view.clientHeight || 600)); }
  model.updateMatrixWorld(true); const inv = model.matrixWorld.clone().invert(), camR = V(1, 0, 0).applyQuaternion(camera.quaternion);
  wallsBuilt().forEach(wi => { const g = WG[wi]; if (!g) return;
    const dg = new THREE.Group(); dg.matrixAutoUpdate = false; dg.matrix.multiplyMatrices(inv, g.matrixWorld); dimsG.add(dg);
    const labels = buildDims(dg, wi), flip = V(1, 0, 0).transformDirection(g.matrixWorld).dot(camR) < 0, SW = { vL: 'vR', vR: 'vL', tL: 'tR', tR: 'tL' };
    labels.forEach(L => { const sp = labelSprite(L.t, flip ? (SW[L.k] || L.k) : L.k); sp.position.copy(L.p).applyMatrix4(dg.matrix); dimsG.add(sp); });
  });
}
// ---------- rebuild ----------
let bbox = new THREE.Box3();
const HIST = [], RED = []; let histT = 0, histLock = false;
function pushHist() { if (histLock) return; clearTimeout(histT); histT = setTimeout(() => { const j = JSON.stringify(S); if (HIST[HIST.length - 1] !== j) { HIST.push(j); if (HIST.length > 80) HIST.shift(); RED.length = 0; } }, 250); }
function restoreHist(j) { histLock = true; setTimeout(() => { renderDeco(); setBg(); }); selPost = null; $('postPop').classList.add('hide'); closeMenus(); cur.it = -1; S = migrate(JSON.parse(j)); fillGeneral(); rebuild(); renderSec(); cardUI(); histLock = false; }
function undo() { clearTimeout(histT); if (HIST.length < 2) return; RED.push(HIST.pop()); restoreHist(HIST[HIST.length - 1]); }
function redo() { if (!RED.length) return; const j = RED.pop(); HIST.push(j); restoreHist(j); }
// v13g: snow-white system gets a thin light-grey contour on every frame part so it never melts into the white wall
const EDGE_C = new Map(); let EDGE_M;
function contours() { if (S.metal !== 'white') return; EDGE_M = EDGE_M || new THREE.LineBasicMaterial({ color: 0xaeb3ba, transparent: true, opacity: 0.85 }); const ms = [M.metal, M.post, M.postF, M.rail];
  const add = []; scene.traverse(o => { if (o.isMesh && o.castShadow && o.geometry && o.geometry.type !== 'CylinderGeometry' && ms.includes(o.material) && !o.userData.edged && o.geometry) { let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; if (v) add.push(o); } });
  add.forEach(o => { let eg = EDGE_C.get(o.geometry.uuid); if (!eg) { eg = new THREE.EdgesGeometry(o.geometry, 35); EDGE_C.set(o.geometry.uuid, eg); } const l = new THREE.LineSegments(eg, EDGE_M); l.raycast = () => {}; l.userData.noPick = true; o.userData.edged = true; o.add(l); }); }
function rebuild() {
  // fresh start / reset: corner shifts sit on the red dot (no shelves crossing in the corner)
  if (S.__gapFix) { delete S.__gapFix; const ks = gapKeys(); if (ks.length && !ks.some(([k]) => gapGet(k) >= optGap(k))) S.__fresh = true; }
  if (S.__fresh) { delete S.__fresh; if (S.layout !== 'straight') gapKeys().forEach(([k]) => gapSet(k, Math.min(300, optGap(k)))); }
  S.walls.forEach(w => w.sections.forEach(syncLinks));
  S.walls.forEach((w, wi) => { if (w.postL) Object.keys(w.postL).forEach(k => { if (+k > w.sections.length) delete w.postL[k]; }); w.sections.forEach((sc, si) => { const lo = secLo(wi, si); sc.items.forEach(o => { const drop = o.y - itemBot(o) * 100; if (o.y - drop < lo - 3 + 0.01) o.y = Math.min(S.railTop - 4, Math.ceil(lo - 3 + drop)); }); }); });
  makeMats();
  const keep = catcher; model.clear(); if (keep) model.add(keep); dimsG.clear(); WG.length = 0;
  const F = frame();
  buildRoom();
  wallsBuilt().forEach(wi => {
    const g = buildWall(wi); placeWall(g, wi);
    if (wi > 0) { const d = ((S.room.angle || 90) - 90) * Math.PI / 180, cx = wi === 1 ? F.xL : F.xR, pv = new THREE.Group(); pv.position.set(cx, 0, 0); pv.rotation.y = wi === 1 ? -d : d; g.position.x -= cx; pv.add(g); model.add(pv); pv.updateMatrixWorld(true); } else model.add(g);
    WG[wi] = g;
  });
  model.traverse(o => { if (o.isMesh && o !== catcher && !o.userData.dims && !o.userData.keep) { const f = !!o.userData.frame; o.visible = S.view === 'all' || (S.view === 'frame' ? f : !f); } });
  applyModelXf();
  bbox = new THREE.Box3();
  model.children.forEach(c => { if (c !== catcher) bbox.expandByObject(c); }); if (bbox.isEmpty()) bbox.set(V(F.x0, 0, 0), V(F.x0 + Math.max(0.6, F.backW), S.railTop / 100, 0.45)); { const cc = bbox.getCenter(new THREE.Vector3()); bbox.expandByPoint(V(cc.x, 0, Math.max(bbox.max.z, 0.5))); }
  buildDecor(bbox.getCenter(new THREE.Vector3()));
  { const sz = bbox.getSize(new THREE.Vector3()), k = S.layout.replace('Lr', 'L') + ':' + sz.x.toFixed(2) + ':' + sz.z.toFixed(2); /* no auto-fit on edits: only Сброс/Ракурс move the camera */ window.__fitK = k; } // width / type changed: refit
  rebuildDims();
  if (cur.it >= 0) model.traverse(o => { const r = o.userData.ref; if (r && r.wi === cur.w && r.si === cur.s && r.ii === cur.it) hlOn(o); });
  const c = bbox.getCenter(new THREE.Vector3());
  sun.position.set(c.x + 2.5, 4.5, 5); sun.target.position.copy(c); applyLights(); applyGlareShadow(); pushHist();
  catcher.visible = !!photo && !$('showRoom').checked;
  room.visible = !photo || $('showRoom').checked;
  summary(); fillDims(); localStorage.setItem('gs_auto', JSON.stringify(S));
  try { contours(); } catch (er) {}
  try { linkUI(); } catch (er) {}
  $('delBtn').classList.toggle('hide', !window.__propSel && !(window.__plantSel >= 0) && !(cur.it >= 0 && S.walls[cur.w].sections[cur.s] && S.walls[cur.w].sections[cur.s].items[cur.it]));
}
function setDims(on) { dimsG.visible = !!on && dimsOn(); }
function applyModelXf() {
  if (!photo) { model.position.set(0, 0, 0); model.scale.setScalar(1); model.rotation.y = 0; dimsG.position.set(0, 0, 0); dimsG.scale.setScalar(1); dimsG.rotation.y = 0; return; }
  const p = [+$('mx').value, +$('my').value, 0], s = +$('ms').value, r = +$('mr').value * Math.PI / 180;
  [model, dimsG].forEach(o => { o.position.set(...p); o.scale.setScalar(s); o.rotation.y = r; });
}

// ---------- camera ----------
function meshBox() { const b = new THREE.Box3(); model.traverse(o => { if (o.isMesh && o.visible && o !== catcher && !o.userData.dims && !o.userData.contact) { let p = o.parent, ok = true; while (p) { if (p.visible === false) ok = false; p = p.parent; } if (ok) b.expandByObject(o); } }); return b.isEmpty() ? bbox.clone() : b; }
function fitCard(aspect, topF, botF, sideF = 0.06) {
  const b = meshBox(), c = b.getCenter(new THREE.Vector3());
  const corner = S.layout !== 'straight', az = corner ? V(S.layout === 'Lr' ? -0.62 : 0.62, 0, 1).normalize() : V(0.32, 0, 1).normalize(), e = (corner ? 15 : 12) * Math.PI / 180;
  const dir = V(az.x * Math.cos(e), Math.sin(e), az.z * Math.cos(e));
  const cam = camera.clone(); cam.aspect = aspect; cam.fov = 28; cam.updateProjectionMatrix();
  const pts = []; for (let i = 0; i < 8; i++) pts.push(V(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  const yTop = 1 - 2 * topF, yBot = -1 + 2 * botF, xm = 1 - 2 * sideF;
  let tg = c.clone();
  const ndc = d => { cam.position.copy(tg).addScaledVector(dir, d); cam.lookAt(tg); cam.updateMatrixWorld(); let x0 = 9, x1 = -9, y0 = 9, y1 = -9; pts.forEach(p => { const q = p.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }); return [x0, x1, y0, y1]; };
  let d = 3;
  for (let it = 0; it < 5; it++) {
    let lo = 0.5, hi = 40; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, [x0, x1, y0, y1] = ndc(m); if ((x1 - x0) <= 2 * xm && (y1 - y0) <= (yTop - yBot)) hi = m; else lo = m; } d = hi;
    const [x0, x1, y0, y1] = ndc(d), up = V(0, 1, 0).applyQuaternion(cam.quaternion), rt = V(1, 0, 0).applyQuaternion(cam.quaternion);
    const th = Math.tan(cam.fov * Math.PI / 360) * d * 0.9, dy = ((y0 + y1) / 2 - (yTop + yBot) / 2) * th, dx = ((x0 + x1) / 2) * th * aspect;
    tg.addScaledVector(up, dy).addScaledVector(rt, dx);
  }
  cam.position.copy(tg).addScaledVector(dir, d);
  return { pos: cam.position.clone(), tg, fov: 28 };
}
let level = 0, levelTarget = 0;
function levelCam(cam, tg, k) {
  // keep position; rotate toward horizontal look; lens shift keeps tg centered
  if (k <= 0) { cam.clearViewOffset(); return; }
  const d = tg.clone().sub(cam.position), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  const ap = Math.abs(pitch); k *= Math.max(0, Math.min(1, (0.62 - ap) / 0.22)); if (k <= 0.001) { cam.clearViewOffset(); return; }
  const qO = new THREE.Quaternion().copy(cam.quaternion);
  const m = new THREE.Matrix4().lookAt(cam.position, V(tg.x, cam.position.y, tg.z), V(0, 1, 0));
  const qH = new THREE.Quaternion().setFromRotationMatrix(m);
  cam.quaternion.slerpQuaternions(qO, qH, k); cam.clearViewOffset(); cam.updateMatrixWorld();
  const p = tg.clone().applyMatrix4(cam.matrixWorldInverse), t = Math.tan(cam.fov * Math.PI / 360);
  const yN = (p.y / -p.z) / t; // ndc y of target
  const H = 1000, W = 1000 * cam.aspect; cam.setViewOffset(W, H, 0, -yN * H / 2, W, H);
}
// ---- level orbit: pitch always 0, height + lens shift ----
const orb = { on: false, T: V(0, 1, 0), az: 0, R: 4, h: 1.5 };
function syncFromCam(kind) {
  orb.on = kind !== 'top'; controls.enabled = !orb.on;
  if (!orb.on) { camera.clearViewOffset(); return; }
  const T = controls.target.clone(), p = camera.position;
  orb.T.copy(T); orb.az = Math.atan2(p.x - T.x, p.z - T.z); orb.R = Math.max(0.5, Math.hypot(p.x - T.x, p.z - T.z)); orb.h = p.y; applyCam();
}
function applyCam(cam = camera) {
  const o = orb; if (o.snapTo != null) { let d = o.snapTo - o.az; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) < 0.0005) { o.az = o.snapTo; o.snapTo = null; } else o.az += d * 0.2; } if (o.snapAz) { o.az *= 0.8; if (Math.abs(o.az) < 0.0005) { o.az = 0; o.snapAz = false; } }
  o.h = Math.max(o.T.y - o.R * Math.tan(12 * Math.PI / 180), Math.min(o.T.y + o.R * Math.tan(40 * Math.PI / 180), o.h)); // v13h: top 40; v13d: elevation -20..35 deg (pure lens shift); lower limit as v11o // up to ~87 deg above/below: straight-down view possible
  /* v13d: longer lens at steep angles - FOV 30 -> 11 deg as |elevation| goes 10 deg -> cap, distance scaled so framing stays the same (flatter perspective, corner stays ~90 deg, less shift stretch) */
  { const el = Math.atan2(o.h - o.T.y, o.R), cap = (el >= 0 ? 35 : 12) * Math.PI / 180, u = Math.max(0, Math.min(1, (Math.abs(el) - (el >= 0 ? 10 : 2) * Math.PI / 180) / (cap - (el >= 0 ? 10 : 2) * Math.PI / 180))), sm = u * u * (3 - 2 * u), f0 = 30, f = window.__noFovK ? f0 : f0 - 19 * sm; /* down to 11 deg (near-orthographic) at the caps */
    const k = Math.tan(f0 * Math.PI / 360) / Math.tan(f * Math.PI / 360);
    { const fr = (40 + 2 * Math.hypot(o.R, o.h - o.T.y)) * k; if (Math.abs(cam.fov - f) > 1e-6 || Math.abs(cam.far - fr) > 0.5) { cam.fov = f; cam.far = fr; cam.updateProjectionMatrix(); } }
    cam.position.set(o.T.x + k * o.R * Math.sin(o.az), o.T.y + k * (o.h - o.T.y), o.T.z + k * o.R * Math.cos(o.az)); }
  // plain perspective: true tilt at every angle, no lens shift, free orbit all around (walls facing the camera hide via tickOcc) // lens shift keeps uprights vertical up to ~35 deg, real pitch only beyond
  // two-point perspective: level camera + vertical lens shift keeps verticals straight at normal angles;
  // the shift is capped (30°) so the image never stretches, and from 40° to 65° it hands over smoothly to a real tilt
  const a = Math.atan2(o.h - o.T.y, o.R), ea = Math.abs(a), D2R = Math.PI / 180, sh = ea, p = 0; /* v13b: pure lens shift at all elevations - pitch always 0, verticals stay vertical */
  cam.up.set(0, 1, 0); cam.lookAt(o.T.x, cam.position.y, o.T.z); cam.clearViewOffset(); cam.updateMatrixWorld();
  if (sh > 1e-4) { const yN = -Math.tan(Math.sign(a) * sh) / Math.tan(cam.fov * Math.PI / 360), H = 1000, W = 1000 * cam.aspect; cam.setViewOffset(W, H, 0, -yN * H / 2, W, H); }
}
{
  const el = renderer.domElement, P = new Map(); let last = null, pinch = null;
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => { if (!orb.on) return; orb.snapAz = false; orb.snapTo = null; el.setPointerCapture(e.pointerId); P.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey }); last = null; pinch = null; });
  // straight and U: a near-frontal view settles exactly frontal, so the ceiling and floor edges read level
  const end = e => { P.delete(e.pointerId); last = null; pinch = null; if (!P.size) { let best = null, bd = 15 * Math.PI / 180; snapAzs().forEach(t => { let d = t - orb.az; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) < bd) { bd = Math.abs(d); best = t; } }); if (best != null) orb.snapTo = best; } }; // v13e: ease to the nearest frontal wall within 15 deg, any elevation
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('pointermove', e => {
    if (!orb.on || !P.has(e.pointerId)) return; if (window.__rugDrag) { const q = P.get(e.pointerId); q.x = e.clientX; q.y = e.clientY; last = null; pinch = null; return; } const p = P.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    const hpx = el.clientHeight || 600, unit = orb.R * Math.tan(camera.fov * Math.PI / 360) * 2 / hpx;
    if (P.size >= 2) {
      const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { orb.R = Math.max(0.25, Math.min(45, orb.R * pinch / Math.max(d, 1))); }
      pinch = d; const rt = V(Math.cos(orb.az), 0, -Math.sin(orb.az));
      orb.T.addScaledVector(rt, -dx * unit / 2); orb.T.y += dy * unit / 2; return;
    }
    if (p.b === 2 || p.b === 1 || p.sh) { const rt = V(Math.cos(orb.az), 0, -Math.sin(orb.az)); orb.T.addScaledVector(rt, -dx * unit); orb.T.y += dy * unit; return; }
    orb.az -= dx * 0.004; { const D = Math.hypot(orb.R, orb.h - orb.T.y), el = Math.max(-1.05, Math.min(1.52, Math.atan2(orb.h - orb.T.y, orb.R) + dy * 0.005)); orb.R = Math.max(0.05, D * Math.cos(el)); orb.h = orb.T.y + D * Math.sin(el); } // true spherical orbit: straight-down view reachable
  });
  el.addEventListener('wheel', e => { if (!orb.on) return; e.preventDefault(); orb.R = Math.max(0.25, Math.min(45, orb.R * Math.exp(e.deltaY * 0.001))); }, { passive: false });
}

// camera lens: «Обычная» (28 deg) or «Крупная» (~50 mm look, 17 deg, farther back); remembered
function camK() { const k = localStorage.getItem('gs_cam'); return ['std', 'int', 'por', 'top3'].includes(k) ? k : 'int'; } // default: «Интерьер» photo preset, closest to the client renders
var CAMS = [['std', 'Стандарт'], ['int', 'Интерьер'], ['por', 'Портрет'], ['top3', 'Сверху 3/4']];
const LENSF = () => 30;
function CAMEXP() { return { int: 1.1, por: 1.03 }[camK()] || 1.0; }
// interior-photographer cameras: own lens, height and viewpoint; verticals stay vertical (level camera + lens shift)
function camPhoto(k) {
  const c = bbox.getCenter(new THREE.Vector3()), sz = bbox.getSize(new THREE.Vector3()), sg = S.layout === 'Lr' ? -1 : 1, corner = S.layout === 'L' || S.layout === 'Lr', asp = camera.aspect;
  const P = { int: { fov: 30, az: corner ? frontAz() : 0, h: 1.45, k: 0.8 }, por: { fov: 13, az: corner ? 0.5 : 0, h: c.y + 0.05, k: 1.04 }, top3: { fov: 32, az: corner ? 0.68 : 0.35, el: 0.5, k: 1.1 } }[k];
  camera.fov = P.fov; camera.updateProjectionMatrix(); const f = P.fov * Math.PI / 180, t = Math.tan(f / 2);
  const span = Math.max(sz.x, 1) * Math.cos(P.az * 0.6) + sz.z * Math.sin(P.az), dist = Math.max(sz.y * 1.12 / (2 * t), (span * 1.1 + 0.2) / (2 * t * asp)) * P.k + sz.z * 0.4;
  const dir = V(sg * Math.sin(P.az), 0, Math.cos(P.az)); camera.position.copy(c).addScaledVector(dir, dist); camera.position.y = P.el ? c.y + dist * Math.sin(P.el) : P.h;
  controls.target.copy(c); camera.up.set(0, 1, 0); controls.update(); syncFromCam('nice'); applyLights();
}
function lensUI() { const k = camK(), b = document.getElementById('lensBtn'); if (!b) return; b.classList.toggle('on', k !== 'std'); b.title = 'Камера: ' + CAMS.find(c => c[0] === k)[1]; }
// auto-fit: keep the angle, set distance and target so the whole system (with props) fits the free canvas area
// between the top bar and the bottom toolbar with ~11% margin on each side
function safeNdc() { const r = renderer.domElement.getBoundingClientRect(), H = r.height || 1, tb = $('topbar'), fb = $('floatBar');
  const top = tb ? Math.max(0, tb.getBoundingClientRect().bottom - r.top) : 0, bot = fb ? Math.max(0, r.bottom - fb.getBoundingClientRect().top) : 0;
  const yT = 1 - 2 * top / H, yB = -1 + 2 * bot / H, m = 0.19, hy = (yT - yB) * m; return { x0: -1 + 2 * m, x1: 1 - 2 * m, y0: yB + hy, y1: yT - hy }; }
function fitView() { if (!orb.on || !WG.length) return; const b = meshBox(); if (b.isEmpty()) return;
  const pts = []; for (let i = 0; i < 8; i++) pts.push(V(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  const sf = safeNdc(), q = new THREE.Vector3();
  for (let it = 0; it < 12; it++) { applyCam(); camera.updateMatrixWorld(); let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    pts.forEach(p => { q.copy(p).project(camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
    const s = Math.max((x1 - x0) / (sf.x1 - sf.x0), (y1 - y0) / (sf.y1 - sf.y0)); if (!isFinite(s) || s <= 0) return;
    const dist = camera.position.distanceTo(orb.T), t = Math.tan(camera.fov * Math.PI / 360), rt = V(1, 0, 0).applyQuaternion(camera.quaternion);
    const dx = ((x0 + x1) - (sf.x0 + sf.x1)) / 2 * dist * t * camera.aspect, dy = ((y0 + y1) - (sf.y0 + sf.y1)) / 2 * dist * t;
    orb.T.addScaledVector(V(rt.x, 0, rt.z).normalize(), dx); orb.T.y += dy; orb.h += dy;
    const k = Math.max(0.5, Math.min(2, s)); orb.h = orb.T.y + (orb.h - orb.T.y) * k; orb.R *= k;
    if (Math.abs(s - 1) < 0.02 && Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) break;
    // the room walls stop the camera from backing off sideways: turn a little more frontal instead
    if (it >= 3 && s > 1.03) orb.az *= 0.75; }
  applyCam(); if (WG.length) rebuildDims(); }
// selection highlight: blue tint in the color itself plus emissive, so it reads on white (clamped) and black metal alike
function hlOn(g) { g.traverse(m => { if (!m.isMesh || !m.material || m.userData.contact || m.userData.hlOrig || Array.isArray(m.material)) return; const o = m.material, c = o.clone(); m.userData.hlOrig = o;
  if (c.color) c.color.set(0x5b9bff); if (c.emissive) { c.emissive.set(0x1f66ff); c.emissiveIntensity = 0.55; } if (c.map && c.color) c.color.set(0x8fbaff); if ('sheen' in c) c.sheen = 0; m.material = c; }); }
function hlOff(g) { g.traverse(m => { if (m.userData.hlOrig) { m.material.dispose(); m.material = m.userData.hlOrig; delete m.userData.hlOrig; } }); }
let HLG = null; function hlOnly(g) { if (HLG && HLG !== g) hlOff(HLG); HLG = g || null; if (g) hlOn(g); }
// v13e: the LEFT wall is the main wall and is faced squarely (one-point look); L: left = side wall (az +90), Lr/straight/U: left = back wall (az 0)
function frontAz() { return S.layout === 'L' ? Math.PI / 2 : 0; }
function snapAzs() { return S.layout === 'L' ? [Math.PI / 2, 0] : S.layout === 'Lr' ? [0, -Math.PI / 2] : [0]; }
function camTo(kind) { camTo0(kind); if (kind !== 'card' && kind !== 'top') fitView(); }
function camTo0(kind) {
  if (kind === 'nice' && camK() !== 'std') { camPhoto(camK()); document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === kind)); if (WG.length) rebuildDims(); return; }
  const c = bbox.getCenter(new THREE.Vector3()), sz = bbox.getSize(new THREE.Vector3());
  const sg = S.layout === 'Lr' ? -1 : 1, flat = kind === 'nice' && (S.layout === 'straight' || S.layout === 'U'), dir = kind === 'front' || flat ? V(0, 0, 1) : kind === 'iso' ? V(sg, 0.25, 1.1) : kind === 'nice' ? V(Math.sin(frontAz()), 0.14, Math.cos(frontAz())) : V(0, 1, 0.35);
  dir.normalize();
  camera.fov = kind === 'top' ? 35 : LENSF(); const asp = camera.aspect, fov = camera.fov * Math.PI / 180;
  const span = Math.max(sz.x, sz.z * (kind === 'front' ? 0 : 1), 1), hgt = kind === 'top' ? Math.max(sz.z, 1) : sz.y;
  const dist = flat ? (Math.max(hgt * 1.3 / (2 * Math.tan(fov / 2)), (sz.x * 1.22 + 0.7) / (2 * Math.tan(fov / 2) * asp)) + sz.z * 0.5) * (S.layout === 'U' ? 1.22 : 1) : Math.max(hgt / (2 * Math.tan(fov / 2)), span / (2 * Math.tan(fov / 2) * asp)) * (view.clientWidth < 800 ? 1.55 : 1.75) * (kind === 'nice' ? 1.12 : 1) + sz.z * 0.35;
  if (kind === 'card') { const f = fitCard(camera.aspect, 0.13, 0.05); camera.fov = f.fov; camera.updateProjectionMatrix(); camera.position.copy(f.pos); controls.target.copy(f.tg); controls.update(); syncFromCam('card'); document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === kind)); return; }
  camera.fov = kind === 'top' ? 35 : LENSF(); camera.updateProjectionMatrix();
  camera.position.copy(c).addScaledVector(dir, dist); controls.target.copy(c); camera.up.set(0, 1, 0); controls.update(); syncFromCam(kind);
  document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('on', b.dataset.cam === kind));
  if (WG.length) rebuildDims();
}
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(view);
let fpsT = performance.now(), fpsN = 0, lowCnt = 0, hiCnt = 0;
function adapt() { return; /* v13g: fixed quality - no pixel-ratio / shadow-map switching that flickered on touch */ fpsN++; const t = performance.now(); if (t - fpsT < 1500) return; const fps = fpsN * 1000 / (t - fpsT); fpsN = 0; fpsT = t; if (document.hidden) return;
  if (fps < 32) { hiCnt = 0; if (++lowCnt >= 2 && PR > PR_MIN) { PR = Math.max(PR_MIN, PR - 0.25); renderer.setPixelRatio(PR); resize(); lowCnt = 0; } else if (lowCnt >= 2 && sun.shadow.mapSize.x > 1024) { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null); lowCnt = 0; } }
  else if (fps > 55) { lowCnt = 0; if (++hiCnt >= 4 && PR < PR_MAX) { PR = Math.min(PR_MAX, PR + 0.25); renderer.setPixelRatio(PR); resize(); hiCnt = 0; } } }
function aspectGuard() { const w = view.clientWidth, h = view.clientHeight; if (w && h && (Math.abs(camera.aspect - w / h) > 1e-3 || Math.abs(renderer.domElement.width - Math.round(w * renderer.getPixelRatio())) > 1)) { resize(); if (orb.on) applyCam(); } } // v13b (from v12e): canvas/camera aspect always match - no squeezed first frame
renderer.setAnimationLoop(() => { aspectGuard(); if (orb.on) applyCam(); else { camera.up.set(0, 1, 0); controls.update(); } tickFlash(); tickSpec(); tickOcc(); renderer.render(scene, camera); adapt(); });

// ---------- photo ----------
let photo = null, photoImg = null;
$('photo').onchange = e => {
  const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
  rd.onload = () => { photo = rd.result; photoImg = new Image(); photoImg.src = photo; $('photoBg').style.backgroundImage = `url(${photo})`; $('photoCtl').classList.remove('hide'); scene.background = null; rebuild(); };
  rd.readAsDataURL(f);
};
$('photoOff').onclick = () => { photo = null; photoImg = null; $('photoBg').style.backgroundImage = ''; $('photoCtl').classList.add('hide'); $('photo').value = ''; setBg(); rebuild(); };
['mx', 'my', 'ms', 'mr'].forEach(id => $(id).oninput = applyModelXf);
$('showRoom').onchange = () => { setBg(); rebuild(); };
function goboTex() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = '#fff'; g.filter = 'blur(3px)';
  const fx = 180, fy = 120, fw = 660, fh = 820, m = 22;
  g.fillRect(fx, fy, fw, fh);
  g.fillStyle = '#000'; g.fillRect(fx + fw / 2 - m / 2, fy, m, fh); g.fillRect(fx, fy + fh * 0.38, fw, m);
  // leaves (olive branch silhouettes)
  g.filter = 'blur(5px)';
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let br = 0; br < 5; br++) {
    let x = 120 + rnd() * 380, y = 1000, a = -1.3 - rnd() * 0.5; g.strokeStyle = '#000'; g.lineWidth = 5;
    for (let k = 0; k < 16; k++) { const nx = x + Math.cos(a) * 34, ny = y + Math.sin(a) * 34; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      for (const sd of [-1, 1]) { g.save(); g.translate(nx, ny); g.rotate(a + sd * (0.7 + rnd() * 0.4)); g.beginPath(); g.ellipse(26, 0, 28, 7, 0, 0, 7); g.fill(); g.restore(); }
      x = nx; y = ny; a += (rnd() - 0.5) * 0.35; }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const gobo = new THREE.SpotLight(0xffd9a8, 0); gobo.map = goboTex(); gobo.castShadow = true; gobo.shadow.mapSize.set(1024, 1024); gobo.shadow.radius = 4;
gobo.angle = 0.62; gobo.penumbra = 0.15; gobo.shadow.bias = -0.0005; gobo.decay = 0; scene.add(gobo, gobo.target);
// «Солнечный свет»: warm low sun from the window side, long soft shadows of the shelves and mesh on the wall and floor
function sunMode() { if (!S.room || S.room.shP !== 'sun' || S.studio) return; { const c = bbox.getCenter(new THREE.Vector3()), sg = S.layout === 'Lr' ? -1 : 1, dd = S.room.sunD ?? 0; sun.position.set(c.x + sg * 1.4 + dd * 2.2, c.y + 4.6, c.z + 2.2); sun.target.position.set(c.x, c.y * 0.5, 0); sun.target.updateMatrixWorld(); Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.3, far: 20 }); sun.shadow.camera.updateProjectionMatrix(); } const big = innerWidth < 800 ? 2048 : 4096;
  if (sun.shadow.mapSize.x !== big) { sun.shadow.mapSize.set(big, big); sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null); }
  sun.color.set(0xffd6a6); sun.intensity = 2.6 * (S.room.sunK ?? 1); sun.shadow.radius = 5; sun.shadow.blurSamples = 16; hemi.intensity *= 0.78; fill.intensity *= 0.6; gobo.intensity = 0; }
function applyLights() {
  const c = bbox.getCenter(new THREE.Vector3()); const warm = S.preset === 'warm';
  if (warm && !S.sun) {
    sun.color.set(0xfff1e0); sun.intensity = 0.55; sun.position.set(c.x + 1, 4.5, 4); sun.shadow.radius = 8; gobo.intensity = 0;
    renderer.toneMappingExposure = CAMEXP(); hemi.color.set(0xfff4e8); hemi.groundColor.set(0xeed6b8); hemi.intensity = 1.35; fill.color.set(0xfff0e0); fill.intensity = 0.9; fill.position.set(c.x - 0.5, 1.8, 5); sideFill.intensity = 0.35; sideFill.position.set(c.x + 4, 1.8, c.z + 1); sideFill.target.position.set(-1, 1.2, c.z);
  } else if (warm) {
    sun.color.set(0xffe4c0); sun.intensity = 0.9; sun.position.set(c.x - 1.6, 3.4, 4.2); sun.shadow.radius = 3;
    gobo.color.set(0xffcf94); gobo.intensity = 9; gobo.position.set(c.x - 1.4, 3.3, 3.0); gobo.target.position.set(c.x + 0.4, 1.5, 0);
    renderer.toneMappingExposure = CAMEXP(); hemi.color.set(0xfff0dd); hemi.groundColor.set(0xe8c49c); hemi.intensity = 1.0; fill.color.set(0xffe2c2); fill.intensity = 0.45; fill.position.set(c.x + 3, 2.2, 4); sideFill.intensity = 2.0; sideFill.position.set(c.x + 4, 1.8, c.z + 1); sideFill.target.position.set(-1, 1.2, c.z);
  } else { sun.color.set(0xffffff); sun.intensity = 1.6; gobo.intensity = 0; renderer.toneMappingExposure = CAMEXP(); hemi.color.set(0xffffff); hemi.groundColor.set(0xd8cfc2); sideFill.intensity = 0; hemi.intensity = 0.6; fill.color.set(0xfff4e6); fill.intensity = 0.35; fill.position.set(-3, 2, 4); }
  sunMode(); if (S.studioL && !S.studio) { hemi.intensity *= 1.3; fill.intensity *= 1.4; sun.intensity *= 0.85; renderer.toneMappingExposure *= 1.06; }
}
const glow = new THREE.SpotLight(0xfff0dc, 0, 0, 0.9, 1, 0); scene.add(glow, glow.target);
const rim = new THREE.DirectionalLight(0xdfe7ff, 0); scene.add(rim, rim.target); // edge light so black RAL 9005 reads in detail
// shadow presets: sun direction (deg), blur radius, shadow strength on the walls
const SHP = { sun: { az: -52, el: 27, r: 6, k: 0.3 }, soft: { az: 5, el: 42, r: 9, k: 0.38 }, left: { az: -13, el: 15, r: 7, k: 0.4 }, right: { az: 13, el: 15, r: 7, k: 0.4 }, top: { az: 0, el: 19, r: 7, k: 0.4 }, sharp: { az: 5, el: 42, r: 1.6, k: 0.42 }, none: { k: 0 } };
const specL = new THREE.DirectionalLight(0xffffff, 0); scene.add(specL, specL.target);
const _sc = new THREE.OrthographicCamera();
// the highlight light rides with the camera (up and to the right), so edge highlights travel as the view turns
const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _co = new THREE.Vector3();
// walls and ceiling between the camera and the wardrobe disappear, so the view can go anywhere
function fillFold(th) { const s = Math.sin(th), k = Math.cos(th), Z = 30, fl = room.children.find(c => c.userData.floorM); FILLS.forEach(f => { f.visible = th > 0.001; if (!f.visible) return; const x = f.userData.floorFill.L ? 0.001 : -0.001, p = f.geometry.attributes.position, uv = f.geometry.attributes.uv;
  p.setXYZ(0, x, 0.0005, 0); p.setXYZ(1, x, 0.0005, Z); p.setXYZ(2, x, -Z * s, Z * k); f.updateMatrixWorld(true);
  /* v13b: UVs continue the main floor's texture (project into the floor plane), normals = main floor normal -> same tone, no seam */
  let n = V(0, 0, 1); if (fl) { fl.updateMatrixWorld(true); n = V(0, 0, 1).transformDirection(fl.matrixWorld); const inv = new THREE.Matrix4().copy(f.matrixWorld).invert(); n.transformDirection(inv); }
  if (!f.geometry.attributes.normal) f.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
  const nr = f.geometry.attributes.normal;
  { const w0 = V(p.getX(0), p.getY(0), p.getZ(0)).applyMatrix4(f.matrixWorld), w1 = V(p.getX(1), p.getY(1), p.getZ(1)).applyMatrix4(f.matrixWorld), w2 = V(p.getX(2), p.getY(2), p.getZ(2)).applyMatrix4(f.matrixWorld), gn = w1.clone().sub(w0).cross(w2.clone().sub(w0)); if (gn.dot(camera.position.clone().sub(w0)) < 0) { const t = [p.getX(1), p.getY(1), p.getZ(1)]; p.setXYZ(1, p.getX(2), p.getY(2), p.getZ(2)); p.setXYZ(2, t[0], t[1], t[2]); } } // front face toward the camera so DoubleSide never flips the normal
  for (let q = 0; q < 3; q++) { const w = V(p.getX(q), p.getY(q), p.getZ(q)).applyMatrix4(f.matrixWorld); if (fl) { fl.worldToLocal(w); uv.setXY(q, w.x / 60 + 0.5, w.y / 60 + 0.5); } nr.setXYZ(q, n.x, n.y, n.z); }
  p.needsUpdate = uv.needsUpdate = nr.needsUpdate = true; f.geometry.computeBoundingSphere(); }); }
function tickOcc() { const cp = camera.position, und = cp.y < 0.002;  decor.children.forEach(c => { if (c.userData.rug) c.visible = !und; }); room.children.forEach(c => { const u = c.userData; if (u.floorM) { if (!u.fb) u.fb = { p: c.position.clone(), r: c.rotation.x }; const th = cp.y < 0.15 ? Math.min(1.45, Math.atan2(0.15 - cp.y, Math.max(0.3, cp.z)) * 1.25) : 0, s = Math.sin(th), k = Math.cos(th); c.rotation.x = u.fb.r + th; c.position.set(u.fb.p.x, u.fb.p.y - u.fb.p.z * s, u.fb.p.z * k); fillFold(th); return; } if (u.occ) { _co.copy(cp); u.occ.worldToLocal(_co); c.visible = _co.z > -0.08; } else if (u.occC != null) c.visible = cp.y < u.occC - 0.005; }); }
function tickSpec() { if (!specL.intensity) return; _cr.set(1, 0, 0).applyQuaternion(camera.quaternion); _cu.set(0, 1, 0).applyQuaternion(camera.quaternion); specL.position.copy(camera.position).addScaledVector(_cr, 1.6).addScaledVector(_cu, 1.4); }
function applyGlareShadow() {
  const R = S.room || {}, c = bbox.getCenter(new THREE.Vector3()), P = SHP[R.shP] || SHP.soft, ST = !!S.studio && !photo, gmode = R.glareM || 'soft';
  if (R.glow === 'left' || R.glow === 'right') { const sx = R.glow === 'left' ? -1 : 1; glow.intensity = 1.6; glow.position.set(c.x + sx * 3, 2.4, 2.6); glow.target.position.set(c.x + sx * 0.6, 1.5, 0); } else glow.intensity = 0;
  const on = R.shP !== 'none' && !S.sun;
  sun.castShadow = (!!photo && !$('showRoom').checked) || (R.shP === 'sun' && !ST); gobo.castShadow = gobo.intensity > 0 && sun.castShadow; // shelf shadows are baked on the wall (SHB)
  if (P.el != null && !S.sun) {
    const az = P.az * Math.PI / 180, el = P.el * Math.PI / 180, D = 7;
    sun.position.set(c.x + D * Math.sin(az) * Math.cos(el), c.y + D * Math.sin(el), c.z + D * Math.cos(az) * Math.cos(el)); sun.target.position.copy(c);
    // tight light-space frustum around the construction and plants: crisp, attached shadows without acne
    const b = bbox.clone(); decor.children.forEach(o => { if (o.userData.plant != null) b.expandByObject(o); }); b.expandByScalar(0.2); b.min.y = 0; b.min.z = Math.min(b.min.z, 0);
    _sc.position.copy(sun.position); _sc.lookAt(sun.target.position); _sc.updateMatrixWorld(true); const inv = _sc.matrixWorldInverse;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < 8; i++) { const p = V(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(inv); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    if (R.shP === 'sun') { x0 -= 0.6; x1 += 0.6; y0 -= 0.6; y1 += 0.6; z0 -= 8; }
    Object.assign(sc, { left: x0, right: x1, bottom: y0, top: y1, near: Math.max(0.05, -z1 - 0.5), far: -z0 + 0.5 }); sc.updateProjectionMatrix();
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.012; sun.shadow.radius = P.r; sun.shadow.blurSamples = 16;
  }
  rim.intensity = S.metal === 'black' ? 1.4 : S.metal === 'silver' ? 0.4 : 0; rim.position.set(c.x - 2.5, c.y + 3, 1.2); rim.target.position.copy(c); if (catcher) catcher.material.opacity = 0.3;
  // metal highlights: a key light from the front right that the powder coat and chrome catch as the view turns
  specL.intensity = gmode === 'bright' ? 2.2 : gmode === 'soft' ? 0.5 : 0; specL.target.position.copy(c); tickSpec();
  const gm = { soft: 1, bright: 1, off: 0.35 }[gmode];
  scene.traverse(o => { if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return; const m = o.material; if (m.metalness > 0.5 && !m.userData.chrome && window.HDR_ENV && m.envMap !== window.HDR_ENV) { m.envMap = window.HDR_ENV; m.needsUpdate = true; } if (m.userData.floor) { m.envMapIntensity = 0; return; } if (!m.isMeshPhysicalMaterial && m !== M.chrome && !m.userData.wall) m.envMapIntensity = (m.metalness > 0.6 ? 1.0 : 0.9) * gm; });
  sunMode();
  renderer.shadowMap.needsUpdate = true; setTimeout(() => { renderer.shadowMap.needsUpdate = true; }, 120);
}
function setBg() { scene.background = photo && !$('showRoom').checked ? null : new THREE.Color(S.studio ? (S.wall || S.bg || '#e2ded7') : S.room && S.room.ceiling ? '#fbfbf9' : '#e9e6e0'); }

// ---------- export ----------
$('pngBtn').onclick = () => cleanShot(pngShot);
function pngShot() {
  const hide = false;
  const w = view.clientWidth, h = view.clientHeight, k = Math.min(4, Math.max(2, Math.ceil(3600 / Math.max(w, h)))), sm = sun.shadow.mapSize.x; sun.shadow.mapSize.set(4096, 4096); sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null);
  renderer.setPixelRatio(k); renderer.setSize(w, h, false); renderer.render(scene, camera);
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d');
  if (photoImg && !$('showRoom').checked) { const s = Math.max(W / photoImg.width, H / photoImg.height), iw = photoImg.width * s, ih = photoImg.height * s; g.drawImage(photoImg, (W - iw) / 2, (H - ih) / 2, iw, ih); }
  g.drawImage(renderer.domElement, 0, 0);
  sun.shadow.mapSize.set(sm, sm); sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null); renderer.setPixelRatio(PR); resize(); if (hide) setDims(true);
  out.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'garderob-snimok.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
};

// ---------- marketplace card ----------
function cardDefaults() { return { title: 'Наполнение для каркаса', tOn: true, size: '', sOn: true, panel: '', pOn: true, pos: 'auto', pColor: '#fff7ee', pOp: 0.62, pScale: 1, pFit: true, pX: -1, pY: -1, pW: 0, sSize: 38, sColor: '#231c16', tSize: 66, tColor: '#231c16', tY: 0, note: 'Для монтажа необходимо приобрести\nКАРКАС', nOn: true, dims: false }; }
function cardUI() {
  if (!S.card) S.card = cardDefaults(); const C = S.card = Object.assign(cardDefaults(), S.card);
  if (!C.size) C.size = overall(); if (!C.panel) C.panel = specData().cardLines.join('\n');
  $('cTitle').value = C.title; $('cPX').value = C.pX; $('cPY').value = C.pY; $('cPW').value = C.pW; $('cSSize').value = C.sSize; $('cSColor').value = C.sColor; $('cTSize').value = C.tSize; $('cTColor').value = C.tColor; $('cTY').value = C.tY; $('cPColor').value = C.pColor; $('cPOp').value = C.pOp; $('cPScale').value = C.pScale; $('cPFit').checked = C.pFit; $('cFont').value = C.font || 'manrope'; $('cTOn').checked = C.tOn; $('cSize').value = C.size; $('cSOn').checked = C.sOn; $('cPanel').value = C.panel; $('cPOn').checked = C.pOn; $('cPos').value = C.pos; $('cNote').value = C.note; $('cNOn').checked = C.nOn; $('cDims').checked = C.dims;
}
function cardRead() { const C = S.card; C.pX = +$('cPX').value; C.pY = +$('cPY').value; C.pW = +$('cPW').value; C.sSize = +$('cSSize').value; C.sColor = $('cSColor').value; C.tSize = +$('cTSize').value; C.tColor = $('cTColor').value; C.tY = +$('cTY').value; C.pColor = $('cPColor').value; C.pOp = +$('cPOp').value; C.pScale = +$('cPScale').value; C.pFit = $('cPFit').checked; C.font = $('cFont').value; C.title = $('cTitle').value; C.tOn = $('cTOn').checked; C.size = $('cSize').value; C.sOn = $('cSOn').checked; C.panel = $('cPanel').value; C.pOn = $('cPOn').checked; C.pos = $('cPos').value; C.note = $('cNote').value; C.nOn = $('cNOn').checked; C.dims = $('cDims').checked; localStorage.setItem('gs_auto', JSON.stringify(S)); }
['Manrope', 'Montserrat', 'Inter', 'Playfair Display'].forEach(f => [500, 700, 800].forEach(w => document.fonts.load(`${w} 40px "${f}"`, 'Наполнение КАРКАС 0123')));
function makeCard() {
  cardRead(); const C = S.card, CW = 900, CH = 1200, top = C.tOn || C.sOn ? 230 : 40, bot = C.nOn ? 190 : 40;
  const sv = { pos: camera.position.clone(), tg: controls.target.clone(), pr: renderer.getPixelRatio() };
  const dimsWas = dimsG.visible; if (!C.dims) setDims(false);
  renderer.setPixelRatio(2); renderer.setSize(CW, CH, false); camera.aspect = CW / CH; camera.updateProjectionMatrix();
  const sfov = camera.fov; if (orb.on) applyCam();
  { // same viewing angle as on screen; only dolly back/shift (no rotation) so the set fits between texts
    const b = meshBox(), pts = []; for (let i = 0; i < 8; i++) pts.push(V(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
    const fwd = V(0, 0, -1).applyQuaternion(camera.quaternion), up = V(0, 1, 0).applyQuaternion(camera.quaternion), rt = V(1, 0, 0).applyQuaternion(camera.quaternion);
    const c = b.getCenter(new THREE.Vector3()), base = camera.position.clone(), yTop = 1 - 2 * top / CH, yBot = -1 + 2 * bot / CH, xm = 0.9;
    const dist0 = c.clone().sub(base).dot(fwd); let off = V(0, 0, 0);
    const ndc = dd => { camera.position.copy(c).addScaledVector(fwd, -dd).add(off); camera.updateMatrixWorld(); let x0 = 9, x1 = -9, y0 = 9, y1 = -9; pts.forEach(p => { const q = p.clone().project(camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }); return [x0, x1, y0, y1]; };
    let d = Math.max(dist0, 0.5);
    for (let it = 0; it < 4; it++) {
      let lo = 0.3, hi = 60; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, [x0, x1, y0, y1] = ndc(m); if (x1 - x0 <= 2 * xm && y1 - y0 <= yTop - yBot) hi = m; else lo = m; } d = hi;
      const [x0, x1, y0, y1] = ndc(d), th = Math.tan(camera.fov * Math.PI / 360) * d;
      off.addScaledVector(up, ((y0 + y1) / 2 - (yTop + yBot) / 2) * th).addScaledVector(rt, ((x0 + x1) / 2) * th * camera.aspect);
    }
    ndc(d);
  }
  renderer.render(scene, camera);
  const out = document.createElement('canvas'); out.width = CW; out.height = CH; const g = out.getContext('2d');
  g.drawImage(renderer.domElement, 0, 0, CW, CH);
  // occupancy: projected boxes of visible meshes
  const rects = []; model.traverse(o => { if (o.isMesh && o.visible && o !== catcher && !o.userData.dims) { const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < 8; i++) { const p = V(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera); const X = (p.x + 1) / 2 * CW, Y = (1 - p.y) / 2 * CH; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); } rects.push([x0, y0, x1, y1]); } });
  const FF = { manrope: ['Manrope', 'Manrope'], montserrat: ['Montserrat', 'Montserrat'], inter: ['Inter', 'Inter'], playfair: ['Playfair Display', 'Manrope'] }[C.font || 'manrope'] || ['Manrope', 'Manrope'];
  const TF = `"${FF[0]}", Arial, sans-serif`, serif = `"${FF[1]}", Arial, sans-serif`, ink = C.tColor || '#231c16';
  const rule = (y, x0, x1) => { g.strokeStyle = 'rgba(35,28,22,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); };
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = ink;
  if (C.tOn) { let fs = C.tSize || 66; const tw = FF[0] === 'Playfair Display' ? 600 : 700; g.font = `${tw} ${fs}px ${TF}`; while (g.measureText(C.title).width > CW - 80 && fs > 30) { fs -= 2; g.font = `${tw} ${fs}px ${TF}`; } g.fillText(C.title, CW / 2, 112 + (C.tY || 0)); }
  if (C.sOn) { const ty = C.tY || 0; g.fillStyle = C.sColor || ink; g.font = `500 ${C.sSize || 38}px ${serif}`; const w = g.measureText(C.size).width; g.fillText(C.size, CW / 2, 182 + ty); rule(170 + ty, CW / 2 - w / 2 - 110, CW / 2 - w / 2 - 25); rule(170 + ty, CW / 2 + w / 2 + 25, CW / 2 + w / 2 + 110); g.fillStyle = ink; }
  if (C.nOn) { const L = C.note.split('\n').filter(Boolean), last = L.pop() || ''; g.font = `400 32px ${serif}`; L.forEach((t, i) => g.fillText(t, CW / 2, CH - 118 + (i - L.length + 1) * 38)); g.font = `800 48px ${serif}`; g.letterSpacing = '2px'; const w = g.measureText(last).width; g.fillText(last, CW / 2, CH - 52); rule(CH - 68, CW / 2 - w / 2 - 140, CW / 2 - w / 2 - 25); rule(CH - 68, CW / 2 + w / 2 + 25, CW / 2 + w / 2 + 140); g.letterSpacing = '0px'; }
  if (C.pOn && C.panel.trim()) {
    const lines = C.panel.split('\n').filter(Boolean); let k = C.pScale || 1; const meas = () => { g.font = `500 ${Math.round(24 * k)}px ${serif}`; return [Math.max(330 * k, ...lines.map(t => g.measureText(t).width + 64 * k)), (104 + lines.length * 40) * k]; };
    let [pw, ph] = meas(); if (C.pW > 0) { let it = 0; while (pw > C.pW && it++ < 40) { k *= 0.96; [pw, ph] = meas(); } pw = C.pW; } else if (C.pFit) { let it = 0; while ((pw > CW * 0.58 || ph > (CH - top - bot) * 0.62) && it++ < 30) { k *= 0.95; [pw, ph] = meas(); } }
    pw = Math.min(CW - 80, pw);
    const yT = top + 20, yB = CH - bot - ph - 20, yM = (top + CH - bot - ph) / 2;
    const cand = { tl: [40, yT], tr: [CW - pw - 40, yT], bl: [40, yB], br: [CW - pw - 40, yB], cr: [CW - pw - 40, yM] };
    const ov = ([x, y]) => rects.reduce((a, [x0, y0, x1, y1]) => a + Math.max(0, Math.min(x + pw, x1) - Math.max(x, x0)) * Math.max(0, Math.min(y + ph, y1) - Math.max(y, y0)), 0);
    let key = C.pos; if (key === 'auto') key = Object.keys(cand).sort((a, b) => ov(cand[a]) - ov(cand[b]))[0];
    let [px, py] = cand[key]; if (C.pX >= 0) px = Math.round(C.pX * (CW - pw)); if (C.pY >= 0) py = Math.round(C.pY * (CH - ph));
    g.save(); g.beginPath(); g.roundRect(px, py, pw, ph, 22); g.clip(); g.filter = 'blur(8px)'; g.drawImage(out, 0, 0); g.filter = 'none';
    { const pc = new THREE.Color(C.pColor || '#fff7ee'); g.fillStyle = `rgba(${Math.round(pc.r * 255)},${Math.round(pc.g * 255)},${Math.round(pc.b * 255)},${C.pOp ?? 0.62})`; } g.fillRect(px, py, pw, ph); g.restore();
    g.fillStyle = ink; g.font = `700 ${Math.round(26 * k)}px ${serif}`; g.letterSpacing = '3px'; g.textAlign = 'center'; g.fillText('КОМПЛЕКТАЦИЯ', px + pw / 2, py + 52 * k); g.letterSpacing = '0px'; rule(py + 68 * k, px + 40 * k, px + pw - 40 * k);
    g.textAlign = 'left'; g.font = `500 ${Math.round(24 * k)}px ${serif}`; lines.forEach((t, i) => g.fillText(t, px + 32 * k, py + (112 + i * 40) * k));
  }
  // restore
  renderer.setPixelRatio(sv.pr); resize(); camera.fov = sfov; camera.updateProjectionMatrix(); camera.position.copy(sv.pos); controls.target.copy(sv.tg); controls.update(); if (dimsWas) setDims(true);
  return out;
}

// ---------- spec / summary ----------
function nearest(arr, v) { return arr.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a); }
function railCombo(len) { const L = [1560, 1260, 1000, 700, 520], res = []; let rest = len; while (rest > 0) { const fit = L.slice().reverse().find(l => l >= rest); if (fit) { res.push(fit); break; } res.push(1560); rest -= 1560; } return res; }
function specData() {
  const frame = {}, fill = {}, card = {}, brk = new Set();
  const add = (o, k, n = 1) => o[k] = (o[k] || 0) + n;
  const walls = [];
  wallsBuilt().forEach(wi => {
    const W = S.walls[wi], tot = wallWidth(wi), [ra, rb] = railSpan(wi), rails = railCombo(Math.round((rb - ra) / MM) + 10);
    rails.forEach(r => add(frame, `Рельс несущий ${r} мм`)); for (let i = 0; i <= W.sections.length; i++) add(frame, `Стойка ${postLen(wi, i)} мм`);
    W.sections.forEach((s, si) => s.items.forEach(o => {
      const w = s.w * 10, d = REAL_DEPTH[o.t][o.d], br = { 306: 335, 327: 335, 330: 335, 340: 335, 406: 435, 427: 435, 430: 435, 440: 435, 506: 535 }[d] || 435;
      const nom = `${s.w}×${o.d} см`;
      if (o.t === 'mesh') { add(fill, `Полка сетчатая ${nearest([463, 603, 903, 1203], w)}x${d}`); add(card, `Полка ${nom}`); }
      if (o.t === 'metal') { add(fill, `Полка металлическая 597x${d}`); add(card, `Полка металлическая ${nom}`); }
      if (o.t === 'ldsp') { add(fill, `Полка ЛДСП ${nearest([446, 587, 887], w)}x${d}`); add(card, `Полка ЛДСП ${nom}`); }
      const bk = perfOf(o) ? 'перфорированная' : fineOf(o) ? 'мелкосетчатая' : 'сетчатая';
      if (o.t === 'basket') { add(fill, `Корзина ${bk} стационарная ${nearest([603, 903], w)}x${d}x${o.h || 85}`); add(card, `Корзина ${nom}`); }
      if (o.t === 'pull') { add(fill, `Корзина ${bk} выдвижная ${nearest([563, 863], w)}x${d}x${o.h || 85}`); add(card, `Корзина выдвижная ${nom}`); }
      if (o.t === 'trouser') { add(fill, `Брючница выдвижная ${nearest([463, 603], w)}x440x45`); add(card, `Брючница ${nom}`); }
      if (o.t === 'shoe') { add(fill, `Полка обувная сетчатая ${nearest([604, 904], w)}x${o.d === 30 ? 306 : 406}`); add(card, `Полка для обуви ${nom}`); }
      if (o.t === 'rail') { add(fill, `Перекладина ${nearest([520, 640, 940, 1240, 2000], w)} мм`); add(fill, 'Кронштейн для перекладины 30×30×100', 2); add(fill, 'Заглушка перекладины 15×23×23', 2); add(card, 'Штанга'); const ry = s.items.some(p => p !== o && p.t !== 'rail' && p.t !== 'shoe' && p.y > o.y && p.y - o.y <= 25) ? null : o.y + 9; if (ry != null) [si, si + 1].forEach(p => { const k = `${wi}:${p}:${ry}`; if (!brk.has(k)) { brk.add(k); add(fill, 'Кронштейн 335 мм'); add(card, 'Кронштейн для полки'); } }); }
      else [si, si + 1].forEach(p => { const k = `${wi}:${p}:${o.y}`; if (!brk.has(k)) { brk.add(k); add(fill, `Кронштейн ${br} мм`); add(card, 'Кронштейн для полки'); } });
    }));
    walls.push(`<b>${WALLNAMES[wi]}:</b> ${cm(tot)} см, секций ${W.sections.length}, рельс ${rails.join(' + ')} мм`);
  });
  const ck = Object.keys(card).sort((a, b) => (a.startsWith('Кронштейн') - b.startsWith('Кронштейн')) || (a.startsWith('Штанга') - b.startsWith('Штанга')) || b.localeCompare(a));
  return { frame, fill, walls, cardLines: ck.map(k => `${k} — ${card[k]} шт`) };
}
function overall() {
  const W = Math.round(wallWidth(0) / 10 + 2.5);
  let maxD = 0; S.walls[0].sections.forEach(s => s.items.forEach(o => maxD = Math.max(maxD, o.d)));
  let D = maxD + 5;
  if (S.layout !== 'straight') { const w = [1, 2].filter(i => wallsActive().includes(i)).map(i => effGap(i) + wallWidth(i) / 10 + 2.5); D = Math.round(Math.max(D, ...w)); }
  return `${W} × ${D} × ${S.railTop} см`;
}
function summary() {
  const d = specData(), li = o => Object.entries(o).map(([k, v]) => `${k} — ${v} шт`).join('<br>');
  let total = 0; const row = ([k, v]) => { const p = +(S.prices[k] || 0); total += p * v; return `<tr><td>${k}</td><td>${v} шт</td><td><input type="number" min="0" step="1" data-price="${k}" value="${p || ''}" placeholder="цена"></td><td>${p ? (p * v).toLocaleString('ru-RU') + ' ₽' : ''}</td></tr>`; };
  const tb = o => `<table class="est">${Object.entries(o).map(row).join('')}</table>`;
  const fr = tb(d.frame), fi = tb(d.fill);
  const MC = { white: 'белый RAL 9016', black: 'черный RAL 9005', silver: 'серебристый RAL 9006' }[S.metal], RC = { chrome: 'хром', white: 'белый', black: 'черный' }[S.rod || 'chrome'];
  const parts = [...Object.entries(d.frame), ...Object.entries(d.fill)].map(([k, v]) => `<tr><td><span class="tbd">—</span></td><td>${k}</td><td>${/Перекладина|Штанга/.test(k) ? RC : MC}</td><td>${v} шт</td></tr>`).join('');
  const W = [];
  wallsBuilt().forEach(wi => S.walls[wi].sections.forEach((sc, si) => {
    const nm = `${WALLNAMES[wi]}, секция ${si + 1}`;
    if (sc.items.length && ![45, 60, 90, 120].includes(sc.w)) W.push(`${nm}: ширина ${sc.w} см не совпадает с каталогом (45/60/90/120). Ближайшая: ${nearest([45, 60, 90, 120], sc.w)} см`);
    if (collisions(sc).size) W.push(`${nm}: элементы пересекаются`);
    sc.items.forEach(o => { if (itemTop(o) > S.railTop * 10 * MM - 0.04) W.push(`${nm}: ${TYPES[o.t]} выше стоек`); if (itemBot(o) < postBottom() * MM - 0.005) W.push(`${nm}: ${TYPES[o.t]} ниже стоек`); });
  }));
  if (S.walls.some(w => w.sections.some(sc => sc.items.some(o => o.t === 'pull' && (o.h || 85) === 285)))) W.push('Выдвижной корзины высотой 285 мм нет в крупной сетке (есть 85 и 181); 285 мм бывает у мелкосетчатой 535');
  if (S.room.ceiling && S.railTop > (S.room.ceilH || 275)) W.push(`Гардеробная (${S.railTop} см) выше потолка (${S.room.ceilH} см)`);
  if (!['512', '1025', '1156', '1536', '1920', '2304'].includes(String(S.postH))) W.push(`Стоек ${S.postH} мм нет в каталоге. Стандартные: 512, 1025, 1156, 1536, 1920, 2304 мм`);
  wallsBuilt().forEach(wi => { const [ra, rb] = railSpan(wi), L = Math.round((rb - ra) / MM) + 10, c = railCombo(L); if (c.length > 1) W.push(`${WALLNAMES[wi]}: рельс ${L} мм собирается из ${c.length} частей (${c.join(' + ')} мм), нужен стык`); });
  $('summary').innerHTML = (W.length ? `<div class="warnbox"><b>Проверьте конфигурацию:</b><br>${W.join('<br>')}</div>` : '<div class="okbox">Конфигурация собирается из каталога</div>') + d.walls.join('<br>') + `<br>Габарит: ${overall()}<details><summary>Комплектность (все детали)</summary><div class="catwrap"><table class="cat"><thead><tr><th>Артикул</th><th>Наименование и размер</th><th>Цвет</th><th>Кол-во</th></tr></thead><tbody>${parts}</tbody></table></div></details><details><summary>Каркас</summary>${fr}</details><details><summary>Наполнение</summary>${fi}</details><details${total ? ' open' : ''}><summary>Смета</summary>Итого: <b>${total.toLocaleString('ru-RU')} ₽</b><br><span class="foot">Цены за штуку вводятся в списках выше и сохраняются.</span></details>`;
  $('summary').querySelectorAll('[data-price]').forEach(el => el.onchange = () => { S.prices[el.dataset.price] = +el.value || 0; const open = [...$('summary').querySelectorAll('details')].map(x => x.open); summary(); [...$('summary').querySelectorAll('details')].forEach((x, i) => x.open = open[i] || x.open); localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); });
}

// ---------- UI ----------
function clampY(v) { const lo = Math.ceil(postBottom() / 10) + 3, hi = S.railTop - 4; return Math.max(lo, Math.min(hi, v)); }
function fillGeneral() {
  $('metal').value = S.metal; $('rodC').value = S.rod || 'chrome'; window.__rcS && window.__rcS(); $('wall').value = S.wall; $('floor').value = S.floor; $('railTop').value = S.railTop;
  const pre = ['512', '1025', '1156', '1536', '1920', '2304'].includes(String(S.postH));
  $('postH').value = pre ? String(S.postH) : 'custom'; $('postHc').value = S.postH;
  $('layout').value = S.layout; $('viewMode').value = S.view || 'all'; $('decor').checked = !!S.decor; $('sunT').checked = !!S.sun; $('bStyle').value = S.basketStyle || 'mesh'; const R = S.room; $('ceilT').checked = !!R.ceiling; $('skirtT').checked = R.skirting !== false; $('lampT').checked = !!R.lamps; $('glare').value = R.glare; $('glareV').textContent = Math.round(R.glare * 100) + '%'; $('shadow').value = R.shadow; $('shadowV').textContent = Math.round(R.shadow * 100) + '%'; $('roomX').value = R.extra; $('roomV').textContent = R.extra; $('angR').value = R.angle; $('wallFin').value = S.wallFin || 'paint'; $('ceilH').value = R.ceilH; $('ceilV').textContent = R.ceilH; $('angV').textContent = R.angle + '°'; $('skirtC').value = R.skirtColor; $('glowS').value = R.glow; $('shOnT').checked = R.shOn !== false; $('shAng').value = R.shAng; $('shAngV').textContent = R.shAng + '°'; $('shBlur').value = R.shBlur; $('shBlurV').textContent = R.shBlur; $('shDist').value = R.shDist; $('shDistV').textContent = Math.round(R.shDist * 100) + '%'; $('preset').value = S.preset || 'none'; fillDims();
}
$('rodC').onchange = e => { S.rod = e.target.value; rebuild(); rcS(); };
function rcS() { document.querySelectorAll('#rodCC [data-rc]').forEach(b => b.classList.toggle('on', b.dataset.rc === (S.rod || 'chrome'))); }
document.querySelectorAll('#rodCC [data-rc]').forEach(b => b.onclick = () => { $('rodC').value = b.dataset.rc; $('rodC').onchange({ target: $('rodC') }); }); rcS(); window.__rcS = rcS;
{ const sc = () => document.querySelectorAll('#sysC [data-sc]').forEach(b => b.classList.toggle('on', b.dataset.sc === S.metal)); document.querySelectorAll('#sysC [data-sc]').forEach(b => b.onclick = () => { $('metal').value = b.dataset.sc; $('metal').onchange({ target: $('metal') }); sc(); }); setTimeout(sc, 0); window.__sysC = sc; }
$('metal').onchange = e => { window.__sysC && setTimeout(window.__sysC, 0); S.metal = e.target.value; if (S.wallCustom) { rebuild(); renderDeco(); return; } const c = new THREE.Color(S.wall), l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; if (S.metal === 'white' && l > 0.55) S.wall = '#a9a49c'; else if (S.metal === 'silver' && l > 0.2 && l < 0.5) S.wall = '#e4e0d9'; else if (S.metal === 'black' && l < 0.35) S.wall = '#e6e2dc'; $('wall').value = S.wall; rebuild(); renderDeco(); };
$('postH').onchange = e => { if (e.target.value !== 'custom') { S.postH = +e.target.value; $('postHc').value = S.postH; fix(); } };
$('postHc').onchange = e => { S.postH = Math.max(300, Math.min(3000, +e.target.value || 1920)); $('postH').value = 'custom'; fix(); };
$('railTop').onchange = e => { S.railTop = Math.max(60, Math.min(350, +e.target.value || 210)); fix(); };
$('nSec').onchange = e => { const n = Math.max(1, Math.min(6, +e.target.value || 1)), secs = S.walls[cur.w].sections; while (secs.length < n) secs.push(JSON.parse(JSON.stringify(secs[secs.length - 1]))); secs.length = n; cur.s = Math.min(cur.s, n - 1); rebuild(); renderSec(); };
$('allW').onchange = e => { if (e.target.value) { S.walls[cur.w].sections.forEach(s => s.w = +e.target.value); e.target.value = ''; rebuild(); renderSec(); } };
function fix() { if (S.postH > S.railTop * 10) S.railTop = Math.ceil(S.postH / 10) + 2; $('railTop').value = S.railTop; fillDims(); S.walls.forEach(w => w.sections.forEach(s => s.items.forEach(o => o.y = clampY(o.y)))); rebuild(); renderSec(); }

const ICO = {
  shelf: '<svg viewBox="0 0 48 32"><rect x="4" y="12" width="40" height="4" rx="1"/><path d="M6 16v6M42 16v6" stroke-width="3"/><path d="M8 12v-2M14 12v-2M20 12v-2M26 12v-2M32 12v-2M38 12v-2" stroke-width="1.5"/></svg>',
  rod: '<svg viewBox="0 0 48 32"><path d="M6 6v12M42 6v12" stroke-width="3"/><rect x="5" y="15" width="38" height="4" rx="2"/><path d="M16 19l-6 9h12zM32 19l-6 9h12z" stroke-width="1.5" fill="none"/></svg>',
  combo: '<svg viewBox="0 0 48 32"><rect x="4" y="5" width="40" height="4" rx="1"/><path d="M6 9v4M42 9v4" stroke-width="3"/><path d="M10 9v8M38 9v8" stroke-width="2"/><rect x="8" y="16" width="32" height="3.5" rx="1.7"/><path d="M18 20l-5 8h10zM30 20l-5 8h10z" stroke-width="1.3" fill="none"/></svg>',
  basket: '<svg viewBox="0 0 48 32"><path d="M6 8h36v18H6z" fill="none" stroke-width="2.5"/><path d="M12 8v18M18 8v18M24 8v18M30 8v18M36 8v18M6 14h36M6 20h36" stroke-width="1.2"/></svg>',
  trouser: '<svg viewBox="0 0 48 32"><path d="M4 8h40" stroke-width="3"/><path d="M8 8v4h32V8" fill="none" stroke-width="1.5"/><path d="M12 12v14M18 12v14M24 12v14M30 12v14M36 12v14" stroke-width="2.5"/></svg>'
};
const BK = [['pull|mesh', 'Сетчатая выдвижная', '<path d="M4 6h40v20H4z" fill="none" stroke-width="2.5"/><path d="M12 6v20M20 6v20M28 6v20M36 6v20M4 16h40" stroke-width="1.3"/><path d="M18 29h12" stroke-width="3"/>'],
  ['basket|mesh', 'Стационарная', '<path d="M4 6h40v20H4z" fill="none" stroke-width="2.5"/><path d="M12 6v20M20 6v20M28 6v20M36 6v20M4 16h40" stroke-width="1.3"/>']];
function presetItems(t) {
  const top = S.railTop - 18, lo = Math.ceil(postBottom() / 10) + 10, mid = Math.round((top + lo) / 2), M_ = y => it('mesh', S.depth || 40, y), R_ = y => it('rail', 30, y), C_ = y => { const [a, b] = newItem('combo'); a.y = y; return [a, b]; }, B_ = y => Object.assign(it('pull', 40, y, 181), { v: 'mesh' });
  const T = { shelves: () => LV.sh.map(M_), rod: () => [...C_(LV.top), M_(LV.sh[4])], two: () => [...C_(LV.top), ...C_(LV.mid)], baskets: () => [M_(LV.sh[0]), M_(LV.sh[1]), M_(LV.sh[2]), ...LV.bk.map(B_)], shoes: () => [M_(LV.sh[0]), M_(LV.sh[1]), M_(LV.sh[2]), ...LV.shoe.map(y => it('shoe', 40, y))] }; /* v13b: shared LV levels */
  const r = { items: T[t]().map(o => (o.y = clampY(o.y), o)) }; syncLinks(r); return r.items;
}
function syncLinks(sec) { sec.items = sec.items.filter(o => !o.lk || sec.items.some(p => p.g === o.lk)); sec.items.forEach(o => { if (o.lk) { const p = sec.items.find(q => q.g === o.lk); o.y = clampY(p.y - 10); } }); }
function newItem(c) {
  S.q = (S.q || 0) + 1;
  if (c === 'combo') { const g = 'g' + S.q, sh = it('mesh', S.depth || 40, 100), r = it('rail', 30, 90); sh.g = g; sh.q = S.q; r.lk = g; return [sh, r]; }
  const [t, v] = (c === 'basket' ? (S.bKind || 'pull|mesh') : VARS[c][0][0]).split('|'); const o = it(t, 40, 100); o.q = S.q; o.d = DEPTHS[t].includes(S.depth) ? S.depth : DEPTHS[t].includes(40) ? 40 : DEPTHS[t][0]; if (isBasket(t)) { o.h = 85; o.v = v; } return [o];
}
// new item always strictly below the current lowest item
function appendItem(sec, c) {
  const os = newItem(c), main = os[0], lowY = sec.items.length ? Math.min(...sec.items.map(p => p.y)) : null, lowBot = sec.items.length ? Math.min(...sec.items.map(p => itemBot(p) * 100)) : null;
  const top = c === 'rod' ? 2 : 1, step = c === 'rod' ? 14 : c === 'basket' ? 6 : c === 'trouser' ? 6 : c === 'combo' ? 30 : 32;
  let y = lowY == null ? S.railTop - 18 - (c === 'rod' ? 12 : 0) : Math.floor(Math.min(lowY - step, lowBot - top - (c === 'shelf' || c === 'combo' ? 26 : 2)));
  if (!placeFree(sec, os, y)) { msg('В секции нет свободного места для нового элемента'); return -1; }
  sec.items.push(...os); syncLinks(sec);
  return sec.items.indexOf(main);
}
// find the nearest height (first downward, then upward) where the new items do not overlap anything
function placeFree(sec, os, y0) {
  const main = os[0], si = S.walls[cur.w].sections.indexOf(sec), lo = Math.max(Math.ceil(postBottom() / 10) + 3, si >= 0 ? secLo(cur.w, si) : 0), hi = S.railTop - 4;
  const ok = y => { if (y < lo - 20 || y > hi) return false; main.y = y; os.forEach(o => { if (o.lk) o.y = y - 10; }); if (os.some(o => o.y > hi || itemBot(o) * 100 < lo - 3 - 0.01)) return false;
    const m = 0.1; return !os.some(o => { const a0 = itemBot(o) - m, a1 = itemTop(o) + m; return sec.items.some(p => !(o.lk && p === main) && itemBot(p) < a1 && a0 < itemTop(p)); }); };
  y0 = Math.round(Math.min(hi, y0));
  for (let y = y0; y >= lo - 20; y--) if (ok(y)) return true;
  for (let y = y0 + 1; y <= hi; y++) if (ok(y)) return true;
  return false;
}
function linkUI() { let L = $('linkBar'); if (!L) { L = document.createElement('span'); L.id = 'linkBar'; L.style.cssText = 'display:inline-flex;gap:6px;margin-right:6px'; $('delBtn').before(L); }
  const sc = S.walls[cur.w] && S.walls[cur.w].sections[cur.s], o = sc && cur.it >= 0 && sc.items[cur.it]; let h = '';
  if (o && !window.__propSel && !(window.__plantSel >= 0)) {
    if (o.g) h = '<button class="rnd lk" data-lk="rm">Убрать штангу</button><button class="rnd lk" data-lk="un">Разделить</button>';
    else if (o.t === 'rail' && !o.lk) { const p = nearShelf(sc, o); if (p) h = '<button class="rnd lk" data-lk="at">Прикрепить к полке</button>'; }
    else if (!isBasket(o.t) && o.t !== 'rail' && o.t !== 'trouser') h = '<button class="rnd lk" data-lk="add">Добавить штангу</button>'; }
  if (L.innerHTML !== h) { L.innerHTML = h; L.querySelectorAll('[data-lk]').forEach(b => b.onclick = () => linkAct(b.dataset.lk)); } }
function nearShelf(sc, r) { return sc.items.filter(p => !p.g && !p.lk && p.t !== 'rail' && !isBasket(p.t) && p.y > r.y && p.y - r.y <= 40).sort((a, b) => a.y - b.y)[0]; }
function linkAct(k) { const sc = S.walls[cur.w].sections[cur.s], o = sc.items[cur.it]; if (!o) return;
  if (k === 'add') { S.q = (S.q || 0) + 1; o.g = 'g' + S.q; const r = it('rail', 30, o.y - 10); r.lk = o.g; sc.items.push(r); }
  else if (k === 'rm') { const g = o.g; sc.items = sc.items.filter(p => p.lk !== g); delete o.g; cur.it = sc.items.indexOf(o); }
  else if (k === 'un') { const r = sc.items.find(p => p.lk === o.g); if (r) { delete r.lk; r.q = (S.q = (S.q || 0) + 1); } delete o.g; }
  else if (k === 'at') { const p = nearShelf(sc, o); if (!p) return; S.q = (S.q || 0) + 1; p.g = 'g' + S.q; o.lk = p.g; cur.it = sc.items.indexOf(p); }
  syncLinks(sc); rebuild(); renderSec(); }
function removeItem(sec, i) { const o = sec.items[i]; sec.items.splice(i, 1); if (o && o.g) sec.items = sec.items.filter(p => p.lk !== o.g); }
function secHint(wi) { const sc = S.walls[wi].sections, g = {}; sc.forEach(x => g[x.w] = (g[x.w] || 0) + 1); const word = n => n % 10 === 1 && n % 100 !== 11 ? 'секция' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'секции' : 'секций'; return Object.entries(g).map(([w, n]) => `${n} ${word(n)} по ${w} см`).join(' + ') + ` = ${Math.round(wallWidth(wi) / 10)} см`; }
function renderSizes() {
  const W = S.walls[cur.w], tot = Math.round(wallWidth(cur.w) / 10), n = W.sections.length, sw = W.sections[0] ? W.sections[0].w : 90, same = W.sections.every(x => x.w === sw);
  const btn = (v, on, attr, label) => `<button ${attr}="${v}" class="${on ? 'on' : ''}">${label ?? v}</button>`;
  const WS = [60, 90, 120, 150, 180, 240, 270, 300, 360];
  const AW = wallsActive(), tabs = AW.length > 1 ? '<div class="wtabs">' + (S.layout === 'L' ? [1, 0] : AW).map(wi => `<button data-wt="${wi}" class="${wi === cur.w ? 'on' : ''}">${AW.length > 2 ? (wi === 0 ? 'Основная стена' : wi === 1 ? 'Левая стена' : 'Правая стена') : WALLNAMES[wi]}</button>`).join('') + '</div>' : '';
  $('wallSz').innerHTML = tabs + [cur.w].map(wi => { const t = Math.round(wallWidth(wi) / 10), nn = S.walls[wi].sections.length, nm = AW.length > 1 ? '' : 'Стена';
    return `<div class="wallblk"><div class="szlab">Ширина конструкции (верхний рельс), см</div><div class="sz">${WS.map(v => `<button data-ww="${wi}:${v}" class="${v === t ? 'on' : ''}">${v}</button>`).join('')}<button data-wown="${wi}" class="${WS.includes(t) ? '' : 'on'}">Свой размер${WS.includes(t) ? '' : ': ' + t}</button></div>
    <div class="own hide" id="wown${wi}"><input type="range" data-wr="${wi}" min="40" max="720" step="1" value="${t}"><input type="number" data-wf="${wi}" min="40" max="720" step="1" value="${t}"></div>
    <div class="szlab">Количество секций</div><div class="sz cnt6">${[1, 2, 3, 4, 5, 6].map(v => `<button data-wn="${wi}:${v}" class="${v === nn ? 'on' : ''}">${v}</button>`).join('')}</div><p class="foot">${secHint(wi)}</p></div>`; }).join('');
  const setW = (wi, v, live) => { const sc = S.walls[wi].sections, n = sc.length || 1, w = Math.max(20, Math.min(200, Math.round(v / n))), ws = live ? w : nearest([45, 60, 90, 120], w); sc.forEach(x => x.w = ws); clearTimeout(dimT); dimT = setTimeout(() => { rebuild(); if (!live) renderSec(); }, live ? 40 : 0); };
  const setN = (wi, n) => { const sc = S.walls[wi].sections, tot = wallWidth(wi) / 10, base = sc[sc.length - 1] || { w: 90, items: [] }; while (sc.length < n) sc.push(JSON.parse(JSON.stringify(base))); sc.length = n; const w = nearest([45, 60, 90, 120], tot / n); sc.forEach(x => x.w = w); cur.w = wi; cur.s = Math.min(cur.s, n - 1); rebuild(); renderSec(); };
  document.querySelectorAll('[data-ww]').forEach(b => b.onclick = () => { const [wi, v] = b.dataset.ww.split(':').map(Number); setW(wi, v); });
  document.querySelectorAll('[data-wn]').forEach(b => b.onclick = () => { const [wi, v] = b.dataset.wn.split(':').map(Number); setN(wi, v); });
  document.querySelectorAll('[data-wt]').forEach(b => b.onclick = () => { cur = { w: +b.dataset.wt, s: 0, it: -1 }; renderSec(); rebuild(); flashWall(cur.w); });
  document.querySelectorAll('[data-wown]').forEach(b => b.onclick = () => $('wown' + b.dataset.wown).classList.toggle('hide'));
  document.querySelectorAll('[data-wr]').forEach(el => { el.oninput = () => { el.nextElementSibling.value = el.value; setW(+el.dataset.wr, +el.value, true); }; el.onchange = () => setW(+el.dataset.wr, +el.value); });
  document.querySelectorAll('[data-wf]').forEach(el => el.onchange = () => setW(+el.dataset.wf, +el.value || 90));
  const SS = [[45, '463'], [60, '603'], [90, '903'], [120, '1203']];
  $('szS').innerHTML = SS.map(([v, m]) => btn(v, same && v === sw, 'data-zs', `${v}<small>${m} мм</small>`)).join('') + `<button data-own="ownS" class="${same && SS.some(p => p[0] === sw) ? '' : 'on'}">Свой размер</button>`;
  const HS = [512, 1025, 1156, 1536, 1920, 2304];
  $('szH').innerHTML = HS.map(v => btn(v, v === S.postH, 'data-zh', `${cm(v)}<small>${v} мм</small>`)).join('') + `<button data-own="ownH" class="${HS.includes(S.postH) ? '' : 'on'}">Свой размер</button>`;
  $('szD').innerHTML = [30, 40, 50].map(v => btn(v, v === (S.depth || 40), 'data-zd')).join('');
  $('szV').innerHTML = [['all', 'Все'], ['frame', 'Каркас'], ['fill', 'Наполнение']].map(([k, t]) => btn(k, (S.view || 'all') === k, 'data-zv', t)).join('');
  $('rS').value = $('fS').value = sw;
  const Q = (sel, f) => document.querySelectorAll(sel).forEach(b => b.onclick = () => f(b));
  Q('[data-zs]', b => { W.sections.forEach(x => x.w = +b.dataset.zs); rebuild(); renderSec(); });
  Q('[data-zh]', b => { const lift = liftCm(), t0 = S.railTop; S.walls.forEach(w => delete w.postL); S.postH = +b.dataset.zh; S.railTop = Math.round(lift + S.postH / 10 + 1); shiftFill(t0, S.railTop); fix(); });
  Q('[data-zd]', b => setDepth(+b.dataset.zd));
  Q('[data-zv]', b => { S.view = b.dataset.zv; $('viewMode').value = S.view; rebuild(); renderSizes(); });
  Q('[data-own]', b => $(b.dataset.own).classList.toggle('hide'));
}
function renderSec() {
  const act = wallsActive(); if (!act.includes(cur.w)) cur.w = act[0];
  const W = S.walls[cur.w]; $('nSec').value = W.sections.length; if (cur.s >= W.sections.length) cur.s = 0; if (cur.it == null) cur.it = -1;
  let h = '';
  if (act.length > 1) h += '<div class="tabs">' + act.map(wi => `<button data-w="${wi}" class="${wi === cur.w ? 'on' : ''}">${WALLNAMES[wi]}</button>`).join('') + '</div>';
  h += '<div class="tabs secchips">' + W.sections.map((s, i) => `<button data-s="${i}" class="${i === cur.s ? 'on' : ''}">Секция ${i + 1}<small>${s.w} см · ${s.items.length} эл.</small></button>`).join('') + '</div>';
  $('secTabs').innerHTML = h;
  $('secTabs').querySelectorAll('[data-w]').forEach(b => b.onclick = () => { cur = { w: +b.dataset.w, s: 0, it: -1 }; renderSec(); rebuild(); flashWall(cur.w); });
  $('secTabs').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { cur.s = +b.dataset.s; cur.it = -1; renderSec(); rebuild(); });
  renderGaps();
  renderSizes();
  if (W.off) { $('secEdit').innerHTML = `<div class="offbox"><b>${act.length > 2 ? ['Основная стена', 'Левая стена', 'Правая стена'][cur.w] : WALLNAMES[cur.w]}: конструкция убрана</b><p class="foot">Стена комнаты осталась. Стойки, рельс и наполнение можно вернуть.</p><button class="acc" data-restore="${cur.w}">Вернуть конструкцию</button></div>`; $('secEdit').querySelector('[data-restore]').onclick = () => { W.off = false; rebuild(); renderSec(); renderWallsPop(); }; return; }
  const s = W.sections[cur.s], lo = Math.ceil(postBottom() / 10) + 3, hi = S.railTop - 4;
  const cnt = c => s.items.filter(o => !o.lk && rowCat(o) === c).length;
  const wname = act.length > 2 ? (cur.w === 0 ? 'Основная стена' : cur.w === 1 ? 'Левая стена' : 'Правая стена') : WALLNAMES[cur.w];
  let e = `<div class="sechead"><div class="t1">${wname} · Секция ${cur.s + 1}</div><div class="t2">Наполнение секции</div></div>`;
  e += `<div class="wrow"><span>Ширина секции</span><div class="sz wbtn">${[45, 60, 90, 120].map(v => `<button data-pw="${v}" class="${s.w === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>`;
  if (s.items.length && ![45, 60, 90, 120].includes(s.w)) e += `<div class="wtxt">Ширины ${s.w} см нет в каталоге. Подходят: 45, 60, 90, 120 см</div>`;
  e += '<div class="szlab">Готовые наборы</div><div class="chips">' + [['shelves', 'Только полки'], ['rod', 'Штанга + полки'], ['two', 'Две штанги'], ['baskets', 'Полки + корзины'], ['shoes', 'Полки + обувь']].map(([k, t]) => `<button data-pre="${k}">${t}</button>`).join('') + '<button data-empty="1">Очистить</button></div>';
  const icoBtn = c => `<div class="ico"><button class="big" data-app="${c}" title="Добавить ниже последнего">${ICO[c]}<span class="${c === 'combo' ? 'two' : ''}">${c === 'combo' ? 'Штанга<br>с полкой' : CATS[c]}</span></button><div class="cnt"><button data-dec="${c}">−</button><b>${cnt(c)}</b><button data-inc="${c}">+</button></div></div>`;
  e += '<div class="szlab">Элементы</div><div class="icons">' + ['shelf', 'rod', 'combo', 'trouser'].map(icoBtn).join('') + '</div>';
  e += '<div class="bgroup"><div class="icons">' + icoBtn('basket') + '<div class="bnote">Тип корзины: нажмите на картинку, чтобы выбрать тип и добавить корзину</div></div><div class="btiles">' + BK.map(([k, t, svg]) => `<button data-bk="${k}" class="${(S.bKind || 'pull|mesh') === k ? 'on' : ''}"><svg viewBox="0 0 48 32">${svg}</svg><span>${t}</span></button>`).join('') + '</div>' + basketBlock(s) + '</div>';
  const ord = s.items.map((o, i) => [o, i]).filter(p => !p[0].lk).sort((a, b) => b[0].y - a[0].y), coll = collisions(s);
  if (!s.items.length) e += '<p class="sum">Секция пустая. Нажимайте на значки выше: каждый новый элемент встает ниже предыдущего.</p>';
  ord.forEach(([o, i], k) => {
    const c = rowCat(o), vv = c === 'basket' ? o.t + '|' + (o.v || 'mesh') : o.t;
    e += `<div class="item${coll.has(i) ? ' warn' : ''}${cur.it === i ? ' sel' : ''}" data-row="${i}"><div class="top"><b class="num">${k + 1}</b><span class="mico">${ICO[c]}</span>${isBasket(o.t) ? `<span class="bname">${(VARS[c].find(([kk]) => kk === vv) || [0, 'Корзина'])[1]} · ${o.h || 85} мм</span>` : `<select data-i="${i}" data-k="var">${VARS[c].map(([kk, v]) => `<option value="${kk}" ${kk === vv ? 'selected' : ''}>${v}</option>`).join('')}</select>`}
    <button class="mini" data-sw="${i}" data-dir="-1" ${k === 0 ? 'disabled' : ''}>↑</button><button class="mini" data-sw="${i}" data-dir="1" ${k === ord.length - 1 ? 'disabled' : ''}>↓</button><button class="mini danger" data-del="${i}">✕</button></div>
    ${c === 'shelf' || isBasket(o.t) ? '' : `<div class="ld"><span>Длина</span><div class="sz">${lensOf(o).map(mm => `<button data-len="${i}:${mm}" class="${secW(mm) === s.w ? 'on' : ''}" title="${mm} мм">${Math.round(mm / 10)}</button>`).join('')}</div></div>`}${o.t === 'rail' || isBasket(o.t) ? '' : `<div class="ld"><span>Глубина</span><div class="sz">${depthsOf(o).map(d => `<button data-dep="${i}:${d}" class="${d === o.d ? 'on' : ''}" title="${REAL_DEPTH[o.t][d]} мм">${d}</button>`).join('')}</div></div>`}
    <div class="yrow"><input type="range" data-i="${i}" data-k="yr" min="${lo}" max="${hi}" step="1" value="${o.y}"><label class="yn"><input type="number" data-i="${i}" data-k="y" value="${o.y}" min="${lo}" max="${hi}"> см</label></div>
    ${coll.has(i) ? '<div class="wtxt">Пересекается с соседним элементом</div>' : ''}</div>`;
  });
  $('secEdit').innerHTML = e;
  const E = $('secEdit'), go = () => { rebuild(); renderSec(); };
  E.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => { s.w = +b.dataset.pw; go(); });
  E.querySelectorAll('[data-app]').forEach(b => b.onclick = () => { cur.it = appendItem(s, b.dataset.app); go(); });
  E.querySelectorAll('[data-bkadd]').forEach(b => b.onclick = () => { S.bKind = b.dataset.bkadd; cur.it = appendItem(s, 'basket'); go(); });
  E.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => { cur.it = appendItem(s, b.dataset.inc); go(); });
  E.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { const c = b.dataset.dec, l = s.items.map((o, i) => [o, i]).filter(p => !p[0].lk && rowCat(p[0]) === c).sort((a, b) => ((b[0].q || 0) - (a[0].q || 0)) || (a[0].y - b[0].y))[0]; if (!l) return; removeItem(s, l[1]); cur.it = -1; go(); });
  E.querySelectorAll('[data-bk]').forEach(b => b.onclick = () => { S.bKind = b.dataset.bk; const o = s.items[cur.it]; if (o && isBasket(o.t)) { const [t, v] = S.bKind.split('|'); o.t = t; o.v = v; } else cur.it = appendItem(s, 'basket'); go(); });
  E.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { s.items = presetItems(b.dataset.pre); cur.it = -1; go(); });
  E.querySelector('[data-empty]').onclick = () => { s.items = []; cur.it = -1; go(); };
  E.querySelectorAll('[data-row]').forEach(r => r.onclick = ev => { if (ev.target.closest('select,input,button')) return; cur.it = +r.dataset.row; go(); });
  let yt;
  E.querySelectorAll('[data-k]').forEach(el => {
    if (el.dataset.k === 'yr') { el.oninput = () => { const o = s.items[+el.dataset.i]; cur.it = +el.dataset.i; o.y = clampY(+el.value); el.closest('.yrow').querySelector('[data-k=y]').value = o.y; clearTimeout(yt); yt = setTimeout(rebuild, 30); }; el.onchange = go; return; }
    el.onchange = () => {
      const i = +el.dataset.i, o = s.items[i], k = el.dataset.k; cur.it = i;
      if (k === 'var') { const [t, v] = el.value.split('|'); o.t = t; if (v) o.v = v; if (!depthsOf(o).includes(o.d)) o.d = depthsOf(o).includes(40) ? 40 : depthsOf(o)[0]; if (isBasket(o.t)) o.h = o.h || 85; }
      else if (k === 'y') o.y = clampY(+el.value || o.y); else o[k] = +el.value;
      go();
    };
  });
  E.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { const i = +b.dataset.sw, k = ord.findIndex(p => p[1] === i), j = ord[k + +b.dataset.dir]; if (!j) return; const o = s.items[i], p = j[0], t = o.y; o.y = p.y; p.y = t; cur.it = i; go(); });
  E.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { removeItem(s, +b.dataset.del); cur.it = -1; go(); });
  E.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { const [i, mm] = b.dataset.len.split(':').map(Number); cur.it = i; s.w = secW(mm); go(); });
  E.querySelectorAll('[data-bh]').forEach(b => b.onclick = () => { const [i, h] = b.dataset.bh.split(':').map(Number); cur.it = i; s.items[i].h = h; go(); });
  E.querySelectorAll('[data-bw]').forEach(b => b.onclick = () => { s.w = +b.dataset.bw; go(); });
  E.querySelectorAll('[data-dep]').forEach(b => b.onclick = () => { const [i, d] = b.dataset.dep.split(':').map(Number), o = s.items[i]; cur.it = i; o.d = d; s.items.forEach(p => { if (o.g && p.lk === o.g && DEPTHS[p.t].includes(d)) p.d = d; }); go(); });
  // v11u: a newly selected item (e.g. a basket tapped in 3D) brings its settings block right under the tabs
  { const key = cur.it >= 0 ? cur.w + ':' + cur.s + ':' + cur.it : ''; if (key && key !== window.__selKey) { const t = E.querySelector(`[data-bset="${cur.it}"]`) || E.querySelector('.item.sel'), P = $('panel'); if (t && P) requestAnimationFrame(() => { const st = document.getElementById('stepper'), pr = P.getBoundingClientRect(), top = Math.max(pr.top, st ? st.getBoundingClientRect().bottom : pr.top); P.scrollTo({ top: P.scrollTop + t.getBoundingClientRect().top - top - 8, behavior: 'smooth' }); }); } window.__selKey = key; }
}


// v11p: all basket settings in one block right under the basket tiles (length = section width)
function basketBlock(s) { const bi = s.items.map((o, i) => [o, i]).filter(p => isBasket(p[0].t)); if (!bi.length) return '';
  const [o, i] = (bi.find(p => p[1] === cur.it) || bi[bi.length - 1]);
  return `<div class="bset" data-bset="${i}"><div class="szlab">Корзина ${bi.length > 1 ? (bi.findIndex(p => p[1] === i) + 1) + ' из ' + bi.length : ''} · длина = ширина секции ${s.w} см</div><div class="ld"><span>Глубина от стены</span><div class="sz">${depthsOf(o).map(d => `<button data-dep="${i}:${d}" class="${d === o.d ? 'on' : ''}" title="${REAL_DEPTH[o.t][d]} мм">${d}</button>`).join('')}</div></div><div class="ld"><span>Высота корзины</span><div class="sz">${(o.t === 'basket' ? [85] : BKH).map(h => `<button data-bh="${i}:${h}" class="${(o.h || 85) === h ? 'on' : ''}">${h}</button>`).join('')}</div></div></div>`; }
const BKH = [85, 181];
let lastCam = 'front';
// ---------- collisions, dims fields, mirror, catalog ----------
function collisions(sec) {
  const bad = new Set(), iv = sec.items.map((o, i) => [itemBot(o) - (o.t === 'rail' ? 0.01 : 0), itemTop(o) + (o.t === 'rail' ? 0.02 : 0.009), i]);
  iv.forEach(([a0, a1, i]) => iv.forEach(([b0, b1, j]) => { if (i < j && a0 < b1 - 0.001 && b0 < a1 - 0.001) { bad.add(i); bad.add(j); } })); return bad;
}
function liftCm() { return Math.round(S.railTop - 1 - S.postH / 10); }
function fillDims() {
  const W = Math.round(wallWidth(cur.w) / 10), H = Math.round(S.postH / 10);
  $('fW').value = $('rW').value = W; $('fH').value = $('rH').value = H; $('fD').value = $('rD').value = S.depth || 40;
  $('lift').value = liftCm(); $('liftV').textContent = liftCm(); $('railTop').value = S.railTop; $('layout').value = S.layout;
  $('postH').value = ['512', '1025', '1156', '1536', '1920', '2304'].includes(String(S.postH)) ? String(S.postH) : 'custom'; $('postHc').value = S.postH;
}
let dimT;
const later = (fn, live) => { clearTimeout(dimT); dimT = setTimeout(fn, live ? 40 : 0); };
function setWidth(v, live) { const secs = S.walls[cur.w].sections, n = secs.length, w = Math.max(20, Math.min(200, Math.round(Math.max(40, Math.min(720, v)) / n))), ws = live ? w : nearest([45, 60, 90, 120], w); secs.forEach(s => s.w = ws);  $('fW').value = $('rW').value = (live ? w : ws) * n; later(() => { rebuild(); if (!live) renderSec(); }, live); }
// taller/shorter uprights: the upper filling moves with the top rail (keeps its distance below it), the lower part stays
function shiftFill(oldTop, newTop) { const d = newTop - oldTop; if (!d) return; const lo = Math.ceil(postBottom() / 10) + 3;
  S.walls.forEach(w => w.sections.forEach(s => { const prev = s.items.map(o => o.y), mid = (lo + oldTop) / 2, par = o => (o.lk && s.items.find(q => q.g === o.lk)) || o;
    s.items.forEach(o => { if (par(o).y > mid) o.y += d; });
    const pr = s.items.map((o, i) => [prev[i], o.y]).sort((a, b) => a[0] - b[0]), tight = pr.some((p, i) => i && p[1] - pr[i - 1][1] < Math.min(10, p[0] - pr[i - 1][0])) || pr.some(p => p[1] > newTop - 4 || p[1] < lo - 20);
    if (tight) s.items.forEach((o, i) => { o.y = Math.round(lo + (prev[i] - lo) * (newTop - lo) / Math.max(1, oldTop - lo)); }); })); }
function setHeight(v, live) { const lift = liftCm(), t0 = S.railTop; S.postH = Math.max(500, Math.min(3000, Math.round(v) * 10)); S.railTop = lift + S.postH / 10 + 1; shiftFill(t0, S.railTop); S.walls.forEach(w => w.sections.forEach(s => s.items.forEach(o => o.y = clampY(o.y)))); $('fH').value = $('rH').value = Math.round(S.postH / 10); later(() => { fillDims(); rebuild(); if (!live) renderSec(); }, live); }
function setDepth(v, live) { const d = [30, 40, 50].reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a); S.depth = d; S.walls.forEach(w => w.sections.forEach(s => s.items.forEach(o => { const D = DEPTHS[o.t]; o.d = D.reduce((a, b) => Math.abs(b - d) < Math.abs(a - d) ? b : a); }))); $('fD').value = $('rD').value = d; later(() => { rebuild(); if (!live) renderSec(); }, live); }
function setLift(v, live) { const d = Math.round(v) - liftCm(); if (!d) return; S.railTop += d; S.walls.forEach(w => w.sections.forEach(s => s.items.forEach(o => o.y += d))); $('liftV').textContent = liftCm(); $('railTop').value = S.railTop; later(() => { rebuild(); if (!live) renderSec(); }, live); }
[['W', setWidth], ['H', setHeight], ['D', setDepth]].forEach(([k, f]) => { $('r' + k).oninput = e => f(+e.target.value, true); $('r' + k).onchange = e => f(+e.target.value); $('f' + k).onchange = e => f(+e.target.value || 0); });
$('lift').oninput = e => setLift(+e.target.value, true); $('lift').onchange = e => setLift(+e.target.value);
$('layout').innerHTML = Object.entries(LAYOUTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('layout').onchange = e => { S.layout = e.target.value; cur = { w: mainWi(), s: 0 }; rebuild(); renderSec(); fillDims(); };
// «Зеркально» keeps the framing: same zoom, height and target offset, mirrored azimuth around the construction
function mirrorKeep() { const c0 = bbox.getCenter(new THREE.Vector3()), o = { dx: orb.T.x - c0.x, ty: orb.T.y, tz: orb.T.z, az: orb.az, R: orb.R, h: orb.h, on: orb.on, p: camera.position.clone(), t: controls.target.clone() };
  mirror(); const put = () => { const c1 = bbox.getCenter(new THREE.Vector3());
    if (o.on) { orb.on = true; controls.enabled = false; orb.T.set(c1.x - o.dx, o.ty, o.tz); orb.az = -o.az; orb.R = o.R; orb.h = o.h; orb.snapAz = false; applyCam(); }
    else { camera.position.set(2 * c1.x - o.p.x, o.p.y, o.p.z); controls.target.set(2 * c1.x - o.t.x, o.t.y, o.t.z); controls.update(); }
    if (WG.length) rebuildDims(); };
  put(); requestAnimationFrame(put); }
function mirror() {
  // every wall keeps its own shift from its corner; the left and right walls swap places
  const W0 = S.walls[0]; W0.sections.reverse(); if (W0.postL) { const n = W0.sections.length, nl = {}; Object.entries(W0.postL).forEach(([k, v]) => nl[n - +k] = v); W0.postL = nl; }
  if (S.layout !== 'straight') { const t = S.walls[1]; S.walls[1] = S.walls[2]; S.walls[2] = t; S.walls[1].gap = S.walls[1].gap || 0; S.walls[2].gap = S.walls[2].gap || 0; }
  if (S.layout === 'U') { const t = W0.gap || 0; W0.gap = W0.gapR || 0; W0.gapR = t; }
  if (S.layout === 'L') S.layout = 'Lr'; else if (S.layout === 'Lr') S.layout = 'L';
  if (S.layout === 'Lr' && cur.w === 1) cur.w = 2; else if (S.layout === 'L' && cur.w === 2) cur.w = 1;
  cur.s = Math.max(0, S.walls[cur.w].sections.length - 1 - cur.s);
  rebuild(); renderSec(); fillDims();
}
$('mirrorBtn').onclick = mirrorKeep;
function renderCatalog() {
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cell = v => v === 'уточнить' ? '<span class="tbd">уточнить</span>' : esc(v);
  $('catalog').innerHTML = '<div class="catwrap"><table class="cat"><thead><tr><th>Артикул</th><th>Название</th><th>Размеры</th><th>Правила соединения</th><th>Нагрузка</th><th>Монтаж</th></tr></thead><tbody>' +
    CATALOG.map(c => `<tr><td>${c.art ? esc(c.art) : '<span class="tbd">—</span>'}</td><td><b>${esc(c.name)}</b><br><span class="foot">${esc(c.group)}</span></td><td>${cell(c.size)}</td><td>${cell(c.conn)}</td><td>${cell(c.load)}</td><td>${cell(c.mount)}</td></tr>`).join('') + '</tbody></table></div><h4>Правила и примечания</h4><ul class="rules">' + RULES.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>';
}
renderCatalog();
// ---------- start choice and user templates ----------
document.querySelectorAll('[data-start]').forEach(b => b.onclick = () => setTemplate(b.dataset.start));
const TK = 'gs_tpls', tpls = () => { try { return JSON.parse(localStorage.getItem(TK)) || []; } catch (e) { return []; } }, saveT = a => localStorage.setItem(TK, JSON.stringify(a));
function renderTpl() {
  const a = tpls(), esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('myTpl').innerHTML = a.length ? a.map((t, i) => `<div class="tplrow"><b>${esc(t.name)}</b><span class="btns"><button class="mini" data-tl="${i}">Загрузить</button><button class="mini" data-td="${i}">Дублировать</button><button class="mini" data-tr="${i}">Переименовать</button><button class="mini danger" data-tx="${i}">✕</button></span></div>`).join('') : 'Пока нет сохраненных шаблонов.';
  const Q = (k, f) => $('myTpl').querySelectorAll(`[data-${k}]`).forEach(b => b.onclick = () => f(+b.dataset[k]));
  Q('tl', i => { S = migrate(JSON.parse(JSON.stringify(tpls()[i].cfg))); cur = { w: mainWi(), s: 0 }; fillGeneral(); rebuild(); renderSec(); cardUI(); camTo(S.layout === 'straight' ? 'front' : 'iso'); msg('Шаблон загружен'); });
  Q('td', i => { const a = tpls(); a.splice(i + 1, 0, { name: a[i].name + ' (копия)', cfg: a[i].cfg }); saveT(a); renderTpl(); });
  Q('tr', i => { const a = tpls(), n = prompt('Новое название шаблона', a[i].name); if (n && n.trim()) { a[i].name = n.trim(); saveT(a); renderTpl(); } });
  Q('tx', i => { const a = tpls(); if (!confirm(`Удалить шаблон «${a[i].name}»?`)) return; a.splice(i, 1); saveT(a); renderTpl(); });
}
$('tplBtn').onclick = () => $('tplPop').classList.toggle('hide');
$('tplSave').onclick = () => { const n = prompt('Название шаблона', 'Мой шаблон ' + (tpls().length + 1)); if (!n || !n.trim()) return; const a = tpls(); a.push({ name: n.trim(), cfg: JSON.parse(JSON.stringify(S)) }); saveT(a); renderTpl(); msg('Шаблон сохранен'); };
renderTpl();
// ---------- snap guide ----------
const snapLine = new THREE.Mesh(new THREE.BoxGeometry(1, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: 0xe0242b, depthTest: false, transparent: true, opacity: 0.9, toneMapped: false })); snapLine.renderOrder = 20; snapLine.visible = false; scene.add(snapLine);
let snapT = 0;
// brief thin line across the sections of the dragged wall
function showSnap(y, wi) { const g = WG[wi]; if (!g) return; const tot = wallWidth(wi) * MM; g.updateMatrixWorld(true); snapLine.matrixAutoUpdate = false; const m = new THREE.Matrix4().compose(V(tot / 2, y / 100 + 0.002, 0.07), new THREE.Quaternion(), V(tot + 0.1, 0.6, 0.6)); snapLine.matrix.multiplyMatrices(g.matrixWorld, m); snapLine.visible = true; clearTimeout(snapT); snapT = setTimeout(() => { snapLine.visible = false; }, 700); }
function hideSnap() { snapLine.visible = false; }
// tiny haptic tick: Android vibrate, iOS 17.4+ Safari via hidden switch checkbox
const hapEl = (() => { const l = document.createElement('label'); l.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0'; l.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(l); return l; })();
function haptic() { try { if (navigator.vibrate) { navigator.vibrate(10); return; } hapEl.click(); } catch (er) {} }
// ---------- pick, tap and drag ----------
const RC = new THREE.Raycaster(); RC.params.Line.threshold = 0; RC.params.Points.threshold = 0;
const findRef = o => { while (o) { if (o.userData && o.userData.ref) return o; o = o.parent; } return null; };
const visDeep = o => { while (o) { if (o.visible === false) return false; o = o.parent; } return true; };
// combo rail belongs to its shelf: always act on the main item
function mainIdx(wi, si, ii) { const sc = S.walls[wi].sections[si], o = sc && sc.items[ii]; if (o && o.lk) { const p = sc.items.findIndex(q => q.g === o.lk); if (p >= 0) return p; } return ii; }
function pickHits(e) { const el = renderer.domElement, r = el.getBoundingClientRect(); RC.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hs = RC.intersectObjects(model.children, true).filter(h => h.object.isMesh && h.object !== catcher && !h.object.userData.contact && visDeep(h.object));
  // wire baskets are mostly holes: pick them by their box so a tap anywhere on a basket selects it
  const bx = new THREE.Box3(), pt = new THREE.Vector3();
  model.traverse(o => { const r = o.userData.ref; if (!r || !visDeep(o)) return; const it = S.walls[r.wi] && S.walls[r.wi].sections[r.si] && S.walls[r.wi].sections[r.si].items[r.ii]; if (!it || !isBasket(it.t)) return;
    bx.setFromObject(o); if (bx.isEmpty() || !RC.ray.intersectBox(bx, pt)) return; let mm = null; o.traverse(m => { if (!mm && m.isMesh) mm = m; }); if (mm) hs.push({ object: mm, distance: RC.ray.origin.distanceTo(pt), point: pt.clone() }); });
  return hs.sort((a, b) => a.distance - b.distance); }
function itemGroups(wi, si, idxs) { const out = []; model.traverse(o => { const r = o.userData.ref; if (r && r.wi === wi && r.si === si && idxs.includes(r.ii)) out.push(o); }); return out; }
{
  const el = renderer.domElement, tip = $('dragTip');
  window.__gsDrag = { start: null };
  el.addEventListener('pointerdown', e => {
    if (!orb.on || e.button !== 0 || cur.it < 0) return;
    // the selected item can be grabbed even if another item overlaps it
    const hit = pickHits(e).find(h => { const g = findRef(h.object); if (!g) return false; const { wi, si, ii } = g.userData.ref; return wi === cur.w && si === cur.s && mainIdx(wi, si, ii) === cur.it; });
    if (!hit) return; const sc = S.walls[cur.w].sections[cur.s], o = sc.items[cur.it]; if (!o) return;
    const linked = sc.items.map((p, i) => [p, i]).filter(([p]) => o.g && p.lk === o.g), r = el.getBoundingClientRect();
    drag = { cx: e.clientX, cy: e.clientY, t0: performance.now(), drop: o.y - itemBot(o) * 100, o, linked: linked.map(p => p[0]), gs: itemGroups(cur.w, cur.s, [cur.it, ...linked.map(p => p[1])]), y0: o.y, ly0: linked.map(p => p[0].y), py: e.clientY, unit: hit.distance * Math.tan(camera.fov * Math.PI / 360) * 2 / (el.clientHeight || 600) * 100, wi: cur.w, si: cur.s };
    e.stopImmediatePropagation(); el.setPointerCapture(e.pointerId);
    tip.classList.remove('hide'); tip.textContent = `от пола ${o.y} см`; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top - 34) + 'px';
  }, true);
  el.addEventListener('pointermove', e => {
    if (!drag) return; e.stopImmediatePropagation(); const r = el.getBoundingClientRect();
    if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 6) return; drag.moved = true;
    const lo = Math.max(Math.ceil(postBottom() / 10) + 3, Math.ceil(secLo(drag.wi, drag.si) - 3 + drag.drop));
    let ny = Math.max(lo, Math.min(S.railTop - 4, Math.round(drag.y0 + (drag.py - e.clientY) * drag.unit)));
    // alignment with a shelf in another section: haptic tick + brief guide line, no snapping
    { let best = null; wallsBuilt().forEach(wi => S.walls[wi].sections.forEach((sc, si) => { if (wi === drag.wi && si === drag.si) return; sc.items.forEach(p => { if (!p.lk && p.t !== 'rail' && p.y === ny) best = p.y; }); }));
      if (best != null) { if (drag.snap !== best) { drag.snap = best; haptic(); showSnap(best, drag.wi); } } else drag.snap = null; }
    const dy = ny - drag.y0; drag.o.y = ny; drag.linked.forEach((p, k) => p.y = drag.ly0[k] + dy);
    drag.gs.forEach(g => g.position.y = dy / 100);
    if (dimsOn() && !drag.t) drag.t = setTimeout(() => { if (drag) { drag.t = 0; rebuildDims(); } }, 60);
    tip.textContent = `от пола ${ny} см${drag.snap === ny ? ' · вровень' : ''}`; nbTip(drag, e, r); placeTips(drag, e, r);
  }, true);
  const up = e => { if (!drag) return; e.stopImmediatePropagation(); clearTimeout(drag.t); const tap = !drag.moved && performance.now() - drag.t0 < 600; drag = null; tip.classList.add('hide'); $('dragTipL').classList.add('hide'); if (tap && e.type === 'pointerup') return handleTap(e); rebuild(); renderSec(); };
  el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true);
}
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { lastCam = b.dataset.cam; camTo(lastCam); });
const msg = t => { $('msg').textContent = t; setTimeout(() => $('msg').textContent = '', 3000); };
$('shareBtn').onclick = async () => { const u = location.origin + location.pathname + '?cfg=' + btoa(unescape(encodeURIComponent(JSON.stringify(S)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); try { await navigator.clipboard.writeText(u); msg('Ссылка скопирована'); } catch (e) { prompt('Ссылка на конфигурацию', u); } };
$('saveBtn').onclick = () => { localStorage.setItem('gs_saved', JSON.stringify(S)); msg('Конфигурация сохранена'); };
$('loadBtn').onclick = () => { const v = load('gs_saved'); if (!v) return msg('Сохраненной конфигурации нет'); S = migrate(v); cur = { w: mainWi(), s: 0 }; fillGeneral(); rebuild(); renderSec(); renderDeco(); setBg(); camTo(lastCam); msg('Конфигурация загружена'); };
$('resetBtn').onclick = () => { if (!confirm('Сбросить к исходному? Сохраненные настройки на этом устройстве будут удалены.')) return; clearSaved(); location.replace(location.pathname + '?v=v13d&r=' + Date.now()); return; S = migrate(defaults()); cur = { w: 0, s: 0, it: -1 }; lastCam = 'nice'; fillGeneral(); cardUI(); rebuild(); renderSec(); setBg(); renderDeco(); camTo('nice'); if (window.goStep) goStep(0); };

async function fontsFor(C) { const f = { montserrat: 'Montserrat', inter: 'Inter', playfair: 'Playfair Display' }[C.font] || 'Manrope'; await Promise.all([document.fonts.load(`700 60px "${f}"`, 'Наполнение КАРКАС 0123'), document.fonts.load('500 30px Manrope', 'Наполнение КАРКАС 0123'), document.fonts.load('800 48px Manrope', 'Наполнение КАРКАС 0123'), document.fonts.load(`800 48px "${f}"`, 'Наполнение КАРКАС 0123'), document.fonts.load(`500 30px "${f}"`, 'Наполнение КАРКАС 0123')]).catch(() => {}); }
$('cardBtn').onclick = async () => { cardRead(); await fontsFor(S.card); const o = cleanShot(makeCard); o.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'kartochka-900x1200.png'; a.click(); }, 'image/png'); };
$('cAuto').onclick = () => { S.card.size = overall(); S.card.panel = specData().cardLines.join('\n'); cardUI(); cardRead(); };
['cPX', 'cPY', 'cPW', 'cSSize', 'cSColor', 'cTSize', 'cTColor', 'cTY', 'cPColor', 'cPOp', 'cPScale', 'cPFit', 'cFont', 'cTitle', 'cTOn', 'cSize', 'cSOn', 'cPanel', 'cPOn', 'cPos', 'cNote', 'cNOn', 'cDims'].forEach(id => $(id).onchange = cardRead);
$('sunT').onchange = e => { S.sun = e.target.checked; rebuild(); };
$('setTpl').onchange = e => { if (e.target.value) setTemplate(e.target.value); e.target.value = ''; };
$('bStyle').onchange = e => { S.basketStyle = e.target.value; rebuild(); };
[['ceilT', 'ceiling'], ['skirtT', 'skirting'], ['lampT', 'lamps'], ['shOnT', 'shOn']].forEach(([id, k]) => $(id).onchange = e => { S.room[k] = e.target.checked; rebuild(); });
[['angR', 'angle', 'angV', v => v + '°'], ['shAng', 'shAng', 'shAngV', v => v + '°'], ['shBlur', 'shBlur', 'shBlurV', v => v], ['shDist', 'shDist', 'shDistV', v => Math.round(v * 100) + '%'], ['glare', 'glare', 'glareV', v => Math.round(v * 100) + '%'], ['shadow', 'shadow', 'shadowV', v => Math.round(v * 100) + '%'], ['roomX', 'extra', 'roomV', v => v], ['ceilH', 'ceilH', 'ceilV', v => v]].forEach(([id, k, lab, f]) => { let t; $(id).oninput = e => { S.room[k] = +e.target.value; $(lab).textContent = f(S.room[k]); clearTimeout(t); t = setTimeout(rebuild, 40); }; });
const SW = ['#b3b1ad', '#c9c7c2', '#ecdcc8', '#e8d3bd', '#f2efe9', '#ffffff', '#dcd9d3', '#c9d3cf', '#d8c3b0', '#bfc7d1'];
$('skirtC').oninput = $('skirtC').onchange = e => { S.room.skirtColor = e.target.value; S.room.skirting = true; $('skirtT').checked = true; rebuild(); localStorage.setItem('gs_auto', JSON.stringify(S)); }; $('glowS').onchange = e => { S.room.glow = e.target.value; rebuild(); };
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo(); } } });
$('viewMode').onchange = e => { S.view = e.target.value; rebuild(); };
$('preset').onchange = e => { S.preset = e.target.value; if (S.preset === 'warm') { S.wall = '#ecdcc8'; S.floor = 'oak'; } fillGeneral(); rebuild(); };
fillGeneral(); setBg(); resize(); rebuild(); renderSec(); cardUI(); if (S._cam) { lastCam = S._cam; delete S._cam; } camTo(lastCam === 'card' ? 'card' : 'nice');
// iOS settles the canvas size late (toolbar, safe areas): refit once the final size is known
{ renderer.domElement.addEventListener('pointerdown', () => { window.__userCam = true; }, true); const late = () => { if (lastCam === 'card' || window.__userCam) return; try { resize(); fitView(); } catch (e) {} }; requestAnimationFrame(() => requestAnimationFrame(late)); setTimeout(late, 350); setTimeout(late, 900); addEventListener('load', late);
  if (window.visualViewport) { let vt = 0; visualViewport.addEventListener('resize', () => { clearTimeout(vt); vt = setTimeout(late, 150); }); } }
const _x=0;window.__gs = { cornerX: () => { camera.updateMatrixWorld(); const w = renderer.domElement.clientWidth; return FILLS.map(f => [0.05, 2.5].map(y => +((f.parent.localToWorld(V(0, y, 0)).project(camera).x + 1) / 2 * w).toFixed(3))); }, plinthL: () => { camera.updateMatrixWorld(); const d = S.layout === 'L' ? V(0, 0, 1) : V(1, 0, 0), a = V(orb.T.x, 0, orb.T.z).project(camera), b = V(orb.T.x, 0, orb.T.z).addScaledVector(d, 0.5).project(camera), cw = renderer.domElement.clientWidth, ch = renderer.domElement.clientHeight; let g = Math.atan2((b.y - a.y) * ch, (b.x - a.x) * cw) * 180 / Math.PI; if (g > 90) g -= 180; if (g < -90) g += 180; return g; }, stretch: () => { camera.updateMatrixWorld(); const T = orb.T, f = camera.position.clone().sub(T).normalize(), r = V(1, 0, 0).applyQuaternion(camera.quaternion), u = r.clone().cross(f).normalize(), e = 0.05, p = q => q.clone().project(camera), a = p(T), x = p(T.clone().addScaledVector(r, e)), y = p(T.clone().addScaledVector(u, e)), cw = renderer.domElement.clientWidth, ch = renderer.domElement.clientHeight; return Math.hypot((y.x - a.x) * cw, (y.y - a.y) * ch) / Math.hypot((x.x - a.x) * cw, (x.y - a.y) * ch); }, asp: () => [camera.aspect, view.clientWidth / view.clientHeight], corner: () => { camera.updateMatrixWorld(); const f = FILLS[0]; if (!f) return null; const c = f.localToWorld(V(0, 0, 0)), a = f.localToWorld(V(0, 0, 1)), w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight; c.y = a.y = 0; const sx = c.x < 0 ? 1 : -1, b = c.clone().add(V(sx, 0, 0)), P = q => { const p = q.clone().project(camera); return [p.x * w / 2, p.y * h / 2]; }, C = P(c), A = P(a), B = P(b), v1 = [A[0] - C[0], A[1] - C[1]], v2 = [B[0] - C[0], B[1] - C[1]]; return +(Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / Math.hypot(...v1) / Math.hypot(...v2)) * 180 / Math.PI).toFixed(1); }, fov: () => camera.fov, conv: () => { camera.updateMatrixWorld(); const f = FILLS[0]; if (!f) return null; const c = f.localToWorld(V(0, 0, 0)), w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight, sx = c.x < 0 ? 1 : -1, P = q => { const p = q.clone().project(camera); return [p.x * w / 2, p.y * h / 2]; }, ang = (a, b) => { const A = P(a), B = P(b); return Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI; }, o = []; [[V(sx, 0, 0)], [f.localToWorld(V(0, 0, 1)).sub(c)]].forEach(([d]) => { d.y = 0; d.normalize(); const p0 = V(c.x, 0, c.z), p1 = p0.clone().addScaledVector(d, 1.5), q0 = V(c.x, 2.1, c.z), q1 = q0.clone().addScaledVector(d, 1.5); let x = ang(p0, p1) - ang(q0, q1); while (x > 180) x -= 360; while (x < -180) x += 360; o.push(+Math.abs(x).toFixed(1)); }); return o; }, vlean: () => { camera.updateMatrixWorld(); const r = renderer.domElement.getBoundingClientRect(), o = []; [[0.2, 0.2], [1.5, 0.05], [0.05, 1.5]].forEach(([x, z]) => { const a = V(x, 0.1, z).project(camera), b = V(x, 2.2, z).project(camera); o.push(+(((a.x - b.x) / 2) * r.width).toFixed(2)); }); return o; }, proj: (wi, si, ii) => { let g = null; model.traverse(o => { const r = o.userData.ref; if (r && r.wi === wi && r.si === si && r.ii === ii) g = o; }); const b = new THREE.Box3().setFromObject(g), p = b.getCenter(new THREE.Vector3()); p.z = b.max.z - 0.02; p.y = b.max.y - 0.005; p.project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }, get cur() { return cur; }, get orb() { return orb; }, get model() { return model; }, get room() { return room; }, get S() { return S; }, set S(v) { S = v; }, rebuild, renderSec, fillGeneral, cardUI, makeCard, makeCardAsync: async () => { cardRead(); await fontsFor(S.card); return makeCard(); }, camTo, setOrb: (az, h, R, tx, ty, tz) => { orb.on = true; controls.enabled = false; orb.az = az; orb.h = h; orb.R = R; orb.T.set(tx, ty, tz); }, dimsG, projP: i => { const p = S.plants[i], v = V(p.x, 0.15, p.z).project(camera), r = renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, setLayout: l => { $('layout').value = l; $('layout').onchange({ target: $('layout') }); }, setDims };
document.fonts.ready.then(() => rebuild());
// ---------- v4 extra controls ----------
$('rS').oninput = e => { $('fS').value = e.target.value; S.walls[cur.w].sections.forEach(x => x.w = +e.target.value); clearTimeout(dimT); dimT = setTimeout(rebuild, 40); };
$('rS').onchange = $('fS').onchange = e => { const v = Math.max(20, Math.min(200, +e.target.value || 90)); S.walls[cur.w].sections.forEach(x => x.w = v); rebuild(); renderSec(); };
// tap: item -> select (then it can be dragged), upright -> its popup, wall -> section, empty -> deselect everything
function deselectAll() { const had = cur.it >= 0 || selPost; selPost = null; $('postPop').classList.add('hide'); closeMenus(); cur.it = -1; if (had) { rebuild(); renderSec(); } }
{ const el = renderer.domElement; let d0 = null, multi = 0;
  el.addEventListener('pointerdown', e => { multi++; d0 = multi === 1 ? [e.clientX, e.clientY, performance.now()] : null; }, true);
  const end = () => { multi = Math.max(0, multi - 1); };
  el.addEventListener('pointercancel', () => { end(); d0 = null; }, true);
  el.addEventListener('pointerup', e => {
    end(); if (!d0 || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 8 || performance.now() - d0[2] > 600) { d0 = null; return; } d0 = null;
    handleTap(e);
  }, true); }
function handleTap(e) {
    if (window.__plantTap) { window.__plantTap = false; return; }
    if (window.__plantSel >= 0) { window.__plantSel = -1; hlOnly(null); $('delBtn').classList.add('hide'); }
    const hits = pickHits(e); closeMenus();
    if (!hits.length) { const t = performance.now(), L = window.__lastEmpty; window.__lastEmpty = { t, x: e.clientX, y: e.clientY }; if (L && t - L.t < 380 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 40) { window.__lastEmpty = null; $('niceBtn').click(); } return deselectAll(); }
    const h0 = hits[0];
    if (h0.object.userData.post) { selPost = h0.object.userData.post; cur.it = -1; rebuild(); renderSec(); showPostPop(); return; }
    if (selPost) { selPost = null; $('postPop').classList.add('hide'); }
    if (findRef(h0.object)) {
      // overlapping items: a second tap on the same spot selects the item behind
      const refs = []; hits.forEach(h => { const g = findRef(h.object); if (!g || h.distance > h0.distance + 0.25) return; const { wi, si, ii } = g.userData.ref, k = [wi, si, mainIdx(wi, si, ii)]; if (!refs.some(r => r.join() === k.join())) refs.push(k); });
      let k = refs[0]; const ci = refs.findIndex(r => r[0] === cur.w && r[1] === cur.s && r[2] === cur.it); if (ci >= 0 && refs.length > 1) k = refs[(ci + 1) % refs.length];
      cur = { w: k[0], s: k[1], it: k[2] }; rebuild(); renderSec(); if (window.goStep) goStep(1); return;
    }
    let o = h0.object; while (o && o.userData.wi == null) o = o.parent;
    if (!o) return deselectAll();
    const wi = o.userData.wi, x = o.worldToLocal(h0.point.clone()).x; let acc = 0, si = -1;
    S.walls[wi].sections.forEach((sc, i) => { if (x >= acc - 0.02 && x <= acc + sc.w / 100 + 0.02 && si < 0) si = i; acc += sc.w / 100; });
    cur = { w: wi, s: si < 0 ? cur.s : si, it: -1 }; rebuild(); renderSec();
}
// WB 3:4 snapshot with side air for plaques
$('wbBtn').onclick = () => cleanShot(wbShot);
function wbShot() {
  const CW = 1800, CH = 2400, sv = { pos: camera.position.clone(), pr: renderer.getPixelRatio(), q: camera.quaternion.clone() }, sm = sun.shadow.mapSize.x;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null);
  renderer.setPixelRatio(1); renderer.setSize(CW, CH, false); camera.aspect = CW / CH; camera.updateProjectionMatrix(); if (orb.on) applyCam();
  // the work canvas is already 3:4, so the shot is exactly the visible frame
  renderer.render(scene, camera);
  renderer.domElement.toBlob(bl => { const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'garderob-wb-1800x2400.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
  sun.shadow.mapSize.set(sm, sm); sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null);
  renderer.setPixelRatio(sv.pr); resize(); camera.position.copy(sv.pos); camera.quaternion.copy(sv.q);
};

$('niceBtn').onclick = () => { lastCam = 'nice'; if (!orb.on) { camTo('nice'); rebuildDims(); return; } const a0 = { az: orb.az, el: Math.atan2(orb.h - orb.T.y, orb.R) }, T0 = orb.T.clone(), D0 = Math.hypot(orb.R, orb.h - orb.T.y);
  camTo('nice'); const a1 = { az: orb.az, el: Math.atan2(orb.h - orb.T.y, orb.R) }; orb.T.copy(T0); let da = a1.az - a0.az; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; const t0 = performance.now();
  const st = () => { const k = Math.min(1, (performance.now() - t0) / 450), e = k * k * (3 - 2 * k), el = a0.el + (a1.el - a0.el) * e; orb.az = a0.az + da * e; orb.R = D0 * Math.cos(el); orb.h = orb.T.y + D0 * Math.sin(el); if (k < 1) requestAnimationFrame(st); else rebuildDims(); }; st(); };

{ const o = $('ceilT').onchange; $('ceilT').onchange = e => { o(e); setBg(); }; }
// ---------- stepper ----------
{
  const P = $('panel'), G = [...P.querySelectorAll(':scope > .grp')], names = ['Каркас', 'Наполнение', 'Оформление', 'Готово'];
  const stepOf = g => Math.min(3, G.indexOf(g)); // card and photo blocks belong to step 4
  const bar = document.createElement('div'); bar.id = 'stepper'; bar.innerHTML = names.map((n, i) => `<button data-step="${i}"><b>${i + 1}</b> ${n}</button>`).join(''); P.prepend(bar);
  G.forEach(g => { const i = stepOf(g); g.dataset.st = i; g.querySelector('h3').textContent = g.querySelector('h3').textContent.replace(/^\d\.\s*/, ''); });
  [0, 1, 2].forEach(i => { const nb = document.createElement('div'); nb.className = 'btns next'; nb.innerHTML = `<button class="acc" data-go="${i + 1}">Далее: ${names[i + 1]} →</button>`; G[i].appendChild(nb); });
  const foot = P.querySelector(':scope > p.foot'); if (foot) foot.dataset.st = 3;
  window.goStep = i => { P.querySelectorAll('[data-st]').forEach(e => e.classList.toggle('hide', +e.dataset.st !== i)); bar.querySelectorAll('[data-step]').forEach(b => b.classList.toggle('on', +b.dataset.step === i)); P.scrollTop = 0; bar.scrollIntoView({ block: 'nearest' }); };
  bar.querySelectorAll('[data-step]').forEach(b => b.onclick = () => goStep(+b.dataset.step));
  P.querySelectorAll('[data-go]').forEach(b => b.onclick = () => goStep(+b.dataset.go));
  goStep(0);
  // tapping a section in 3D opens step 2
  const sv = Element.prototype.scrollIntoView; $('secEdit').scrollIntoView = function (o) { goStep(1); sv.call(this, o); };
}

const dimBtnUI = () => $('dimBtn').classList.toggle('on', dimsOn());


function showPostPop() {
  const p = $('postPop'), { wi, i } = selPost, L = postLen(wi, i), n = S.walls[wi].sections.length, edge = i === 0 || i === n;
  p.innerHTML = `<b>Стойка ${i + 1}${wallsActive().length > 1 ? ' · ' + WALLNAMES[wi].toLowerCase() : ''}</b> <span class="foot">длина, мм</span><div class="sz">${[512, 1025, 1156, 1536, 1920, 2304].map(v => `<button data-pl="${v}" class="${v === L ? 'on' : ''}">${v}</button>`).join('')}</div><div class="btns"><button class="mini danger" id="postDel" ${edge ? 'disabled' : ''}>Убрать стойку</button><button class="mini" id="postClose">Готово</button></div>${edge ? '<div class="foot">Крайнюю стойку убрать нельзя</div>' : '<div class="foot">Соседние секции объединятся, полки на этой стойке удалятся</div>'}`;
  p.classList.remove('hide');
  $('postDel').onclick = () => { if (edge) return; const W = S.walls[wi], a = W.sections[i - 1], b = W.sections[i];
    W.sections.splice(i - 1, 2, { w: a.w + b.w, items: [] });
    if (W.postL) { const nl = {}; Object.entries(W.postL).forEach(([k, v]) => { k = +k; if (k < i) nl[k] = v; else if (k > i) nl[k - 1] = v; }); W.postL = nl; }
    cur = { w: wi, s: i - 1, it: -1 }; selPost = null; p.classList.add('hide'); rebuild(); renderSec(); msg('Стойка убрана, секции объединены'); };
  p.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { const W = S.walls[wi]; W.postL = W.postL || {}; W.postL[i] = +b.dataset.pl; if (W.postL[i] === S.postH) delete W.postL[i]; rebuild(); renderSec(); showPostPop(); });
  $('postClose').onclick = () => { selPost = null; p.classList.add('hide'); rebuild(); };
}

$('cornT').checked = !!S.room.cornice; $('cornT').onchange = e => { S.room.cornice = e.target.checked; rebuild(); };

// ================= v7 =================
function closeMenus() { ['dimPop', 'morePop'].forEach(id => $(id) && $(id).classList.add('hide')); }
function cleanShot(fn) {
  const sv = { it: cur.it, sp: selPost }, need = sv.it >= 0 || !!sv.sp; flashG.visible = false; snapLine.visible = false;
  if (need) { cur.it = -1; selPost = null; histLock = true; rebuild(); histLock = false; }
  try { return fn(); } finally { flashG.visible = true; if (need) { cur.it = sv.it; selPost = sv.sp; histLock = true; rebuild(); histLock = false; } }
}
// wall outline flash (never in snapshots: cleanShot hides it)
const flashG = new THREE.Group(); scene.add(flashG); let flashT0 = 0, flashMat = null;
function flashWall(wi) {
  const g = WG[wi]; if (!g) return; flashG.clear(); g.updateMatrixWorld(true);
  const tot = wallWidth(wi) * MM, top = S.railTop * 10 * MM + 0.035, xs = [0]; S.walls[wi].sections.forEach(s => xs.push(xs[xs.length - 1] + s.w / 100));
  const bot = Math.min(...xs.map((x, i) => (S.railTop * 10 - 10 - postLen(wi, i)) * MM)) - 0.035, x0 = -0.05, x1 = tot + 0.05, th = 0.007, z = 0.012;
  flashMat = new THREE.MeshBasicMaterial({ color: 0x2f7bff, transparent: true, opacity: 0, depthTest: false, toneMapped: false });
  const h = new THREE.Group(); h.matrixAutoUpdate = false; h.matrix.copy(g.matrixWorld); flashG.add(h);
  [[x1 - x0, th, (x0 + x1) / 2, top], [x1 - x0, th, (x0 + x1) / 2, bot], [th, top - bot, x0, (top + bot) / 2], [th, top - bot, x1, (top + bot) / 2]].forEach(([w, hh, x, y]) => { const m = new THREE.Mesh(BOX, flashMat); m.scale.set(w, hh, th); m.position.set(x, y, z); m.renderOrder = 30; h.add(m); });
  const fm = new THREE.MeshBasicMaterial({ color: 0x8cc4ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }); fm.userData.fill = true; const fp = new THREE.Mesh(BOX, fm); fp.scale.set(x1 - x0, top - bot, 0.002); fp.position.set((x0 + x1) / 2, (top + bot) / 2, 0.006); fp.renderOrder = 29; h.add(fp); window.__flashFill = fm;
  flashT0 = performance.now();
}
function tickFlash() { if (!flashMat) return; const t = (performance.now() - flashT0) / 1000; if (window.__flashFill) window.__flashFill.opacity = t < 1.1 ? 0.5 * Math.min(1, t * 6) * (t < 0.8 ? 1 : (1.1 - t) / 0.3) : 0; if (t > 1.3) { flashG.clear(); flashMat = null; return; } flashMat.opacity = 0.9 * Math.abs(Math.sin(t * Math.PI * 1.55)) * (1 - t / 1.3); }
// raise-from-floor: standard mark at 20 cm with haptic tick
{ let prev = liftCm(); $('lift').addEventListener('input', e => { const v = +e.target.value; if (v !== prev && (v === 20 || Math.sign(prev - 20) * Math.sign(v - 20) < 0)) haptic(); prev = v; }); }
// delete selected item from the bottom strip
$('delBtn').onclick = () => { const ps = window.__propSel; if (ps) { const it = S.walls[ps.wi] && S.walls[ps.wi].sections[ps.si] && S.walls[ps.wi].sections[ps.si].items[ps.ii]; if (it && it.pr) it.pr.splice(ps.pi, 1); window.__propSel = null; rebuild(); pushHist(); return; } if (window.__plantSel >= 0 && S.plants && S.plants[window.__plantSel]) { S.plants.splice(window.__plantSel, 1); window.__plantSel = -1; plantSel = -1; rebuild(); renderDeco(); pushHist(); localStorage.setItem('gs_auto', JSON.stringify(S)); return; } const sc = S.walls[cur.w].sections[cur.s]; if (!sc || cur.it < 0 || !sc.items[cur.it]) return; removeItem(sc, cur.it); cur.it = -1; rebuild(); renderSec(); };
// top bar: view switch, mirror, more menu
$('mirrorBtn').onclick = mirrorKeep;
$('moreBtn').onclick = e => { e.stopPropagation(); $('dimPop').classList.add('hide'); $('morePop').classList.toggle('hide'); };
$('tplBtn').onclick = () => $('tplPop').classList.toggle('hide');
$('pngTop').onclick = () => { closeMenus(); $('pngBtn').click(); }; $('wbTop').onclick = () => { closeMenus(); $('wbBtn').click(); };
['saveBtn', 'loadBtn', 'shareBtn'].forEach(id => $(id).addEventListener('click', () => $('morePop').classList.add('hide')));
document.addEventListener('pointerdown', e => { if (!e.target.closest('#morePop,#moreBtn,#dimPop,#dimBtn')) closeMenus(); });
// dimensions menu
function renderDimPop() {
  const D = S.dm, all = ['o', 's', 'h', 'g', 'sd'].every(k => D[k]);
  const ck = (k, t) => `<label class="chk"><input type="checkbox" data-dk="${k}" ${(k === 'all' ? all : D[k]) ? 'checked' : ''}> ${t}</label>`;
  $('dimPop').innerHTML = `<b>Размеры</b>${ck('all', 'Все')}${ck('o', 'Общая высота и ширина')}${ck('s', 'Ширина секций')}${ck('h', 'Высота полок от пола (↑)')}${ck('g', 'Расстояние между полками')}${ck('sd', 'Ширина × глубина полок')}
  <div class="szlab">Линии</div><div class="sz"><button data-ds="bold" class="${S.dimStyle !== 'thin' ? 'on' : ''}">Жирные</button><button data-ds="thin" class="${S.dimStyle === 'thin' ? 'on' : ''}">Тонкие</button></div>
  <div class="szlab">Цвет</div><div class="sz"><button data-dcl="auto" class="${S.dimC !== 'black' && S.dimC !== 'white' ? 'on' : ''}">Авто</button><button data-dcl="white" class="${S.dimC === 'white' ? 'on' : ''}">Белый</button><button data-dcl="black" class="${S.dimC === 'black' ? 'on' : ''}">Черный</button></div>
  <div class="btns"><button class="mini danger" id="dimOff">Выключить размеры</button></div>`;
  const P = $('dimPop'), upd = () => { rebuildDims(); dimBtnUI(); renderDimPop(); localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); };
  P.querySelectorAll('[data-dk]').forEach(c => c.onchange = () => { const k = c.dataset.dk; if (k === 'all') ['o', 's', 'h', 'g', 'sd'].forEach(x => D[x] = c.checked); else D[k] = c.checked; upd(); });
  P.querySelectorAll('[data-ds]').forEach(b => b.onclick = () => { S.dimStyle = b.dataset.ds; upd(); });
  P.querySelectorAll('[data-dcl]').forEach(b => b.onclick = () => { S.dimC = b.dataset.dcl; upd(); });
  $('dimOff').onclick = () => { ['o', 's', 'h', 'g', 'sd'].forEach(x => D[x] = false); upd(); P.classList.add('hide'); };
}
$('dimBtn').onclick = e => { e.stopPropagation(); $('morePop').classList.add('hide'); const P = $('dimPop'); if (P.classList.contains('hide') && !dimsOn()) { S.dm.o = S.dm.s = true; rebuildDims(); dimBtnUI(); } renderDimPop(); P.classList.toggle('hide'); };
dimBtnUI();
// ---- color picker: curated interior tones + HSV field with draggable marker, hue and brightness strips; applies live
const TONES = ['#a9a49c', '#b3b1ad', '#9e9b96', '#c9c6c0', '#dcd9d3', '#ecebe7', '#f4f1ea', '#e9e2d6', '#ddd0bf', '#ecdcc8', '#d8c3b0', '#c7b39c', '#b9a58f', '#cfd3cc', '#b8c2b5', '#9fab9c', '#c9d3cf', '#bfc7d1', '#a9b4bf', '#d9cfc7', '#cdb9ae', '#b79f93', '#8f8b86', '#6f6c69', '#4d4c4b'];
const hex2hsv = h => rgb2hsv(...hexRgb(h));
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function rgb2hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return [h, mx ? d / mx : 0, mx]; }
function hsv2hex(h, s, v) { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); }
function colorPicker(box, get, set, tones) {
  let tab = 'ready', hsv = hex2hsv(get());
  const draw = () => {
    box.innerHTML = `<div class="cpk"><div class="cphead"><span class="cpsw" style="background:${get()}"></span><div class="seg2"><button data-ct="ready" class="${tab === 'ready' ? 'on' : ''}">Готовые тона</button><button data-ct="own" class="${tab === 'own' ? 'on' : ''}">Свой цвет</button></div></div>` +
      (tab === 'ready' ? `<div class="cpgrid">${tones.map(c => `<button style="background:${c}" data-c="${c}" class="${c === get() ? 'on' : ''}" title="${c}"></button>`).join('')}</div>`
        : `<div class="cpfield"><canvas width="240" height="150"></canvas><i class="cpdot"></i></div><div class="cpstrip hue"><i></i></div><div class="cpstrip val"><i></i></div>`) + '</div>';
    box.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { tab = b.dataset.ct; hsv = hex2hsv(get()); draw(); });
    box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { set(b.dataset.c, true); draw(); });
    if (tab !== 'own') return;
    const fld = box.querySelector('.cpfield'), cv = fld.querySelector('canvas'), dot = fld.querySelector('.cpdot'), hue = box.querySelector('.hue'), val = box.querySelector('.val'), sw = box.querySelector('.cpsw');
    const paint = () => { const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.fillStyle = hsv2hex(hsv[0], 1, 1); g.fillRect(0, 0, W, H); let gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      dot.style.left = hsv[1] * 100 + '%'; dot.style.top = (1 - hsv[2]) * 100 + '%'; dot.style.background = hsv2hex(...hsv);
      hue.querySelector('i').style.left = hsv[0] / 360 * 100 + '%'; val.style.background = `linear-gradient(90deg,#000,${hsv2hex(hsv[0], hsv[1], 1)})`; val.querySelector('i').style.left = hsv[2] * 100 + '%'; sw.style.background = hsv2hex(...hsv); };
    const apply = fin => { set(hsv2hex(...hsv), fin); paint(); };
    const drag = (el, f) => { const mv = e => { const r = el.getBoundingClientRect(); f(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))); apply(false); };
      el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); mv(e); el.onpointermove = mv; e.preventDefault(); });
      el.addEventListener('pointerup', () => { el.onpointermove = null; apply(true); }); el.style.touchAction = 'none'; };
    drag(fld, (x, y) => { hsv[1] = x; hsv[2] = 1 - y; }); drag(hue, x => { hsv[0] = x * 359.9; }); drag(val, x => { hsv[2] = x; });
    paint();
  };
  draw(); return draw;
}
let wallT = 0;
function liveWall(c, fin) { S.wall = c; S.wallCustom = true; $('wall').value = c; room.traverse(o => { if (o.material && o.material.userData && o.material.userData.wall) setWallCol(o.material, c); }); clearTimeout(wallT); if (fin) wallT = setTimeout(() => { localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); }, 200); }
const drawWallPick = colorPicker($('wallPick'), () => S.wall, liveWall, TONES);
const BGT = ['#ffffff', '#f6f4f0', '#efece7', '#e9e6e0', '#e4e7ea', '#ddd8cf', '#d4d9d2', '#cfd6de', '#e8ded3', '#c9c6c0', '#8f8b86', '#2b2b2b'];
const drawBgPick = colorPicker($('bgPick'), () => S.bg || '#e2ded7', (c, fin) => { S.bg = c; setBg(); if (fin) { localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); } }, BGT);
function renderDeco() {
  const st = !!S.studio, R = S.room; $('dRoom').classList.toggle('hide', st); $('dStudio').classList.toggle('hide', !st);
  document.querySelectorAll('[data-dt]').forEach(b => b.classList.toggle('on', (b.dataset.dt === 'studio') === (st || !!S.studioL)));
  const fin = S.wallFin || 'paint', fv = finVar();
  $('finVars').style.gridTemplateColumns = `repeat(${evenCols(FINS[fin].length)},1fr)`; $('finBtns').innerHTML = [['paint', 'Краска'], ['plaster', 'Штукатурка'], ['relief', 'Рельеф'], ['paper', 'Обои']].map(([k, t]) => `<button data-fin="${k}" class="${fin === k ? 'on' : ''}">${t}</button>`).join('');
  $('finVars').innerHTML = FINS[fin].map(([k, t]) => `<button data-fv="${k}" class="${fv === k ? 'on' : ''}"><i style="background-image:url(${finSwatch(k)})"></i><span>${t}</span></button>`).join('');
  const FL = [['oak', 'Паркет', 'herringbone_parquet', ''], ['lam', 'Светлый ламинат', 'laminate_light', ''], ['lamD', 'Темный ламинат', 'wood_floor_worn', 'filter:brightness(.62) saturate(1.1)'], ['conc', 'Бетон', 'concrete_floor_worn_001', 'filter:brightness(1.08) grayscale(.4)'], ['marble', 'Мрамор', 'marble_01', ''], ['carpet', 'Ковролин', '', '']];
  $('floorBtns').style.gridTemplateColumns = `repeat(${evenCols(FL.length)},1fr)`; $('floorBtns').innerHTML = FL.map(([k, t, tx, f]) => `<button data-fl="${k}" class="${S.floor === k ? 'on' : ''}"><i style="${tx ? `background-image:url(tex/${tx}_diff.jpg);background-size:${k === 'oak' ? 160 : 120}%;${f}` : 'background:#b9ab98'}"></i><span>${t}</span></button>`).join('');
  $('finBtns').querySelectorAll('[data-fin]').forEach(b => b.onclick = () => { S.wallFin = b.dataset.fin; $('wallFin').value = S.wallFin; rebuild(); renderDeco(); });
  if (fv === 'brick') { $('finVars').insertAdjacentHTML('beforeend', `<div style="width:100%"></div><button data-lt="#fbf8f3" class="${S.wall === '#fbf8f3' ? 'on' : ''}">Теплый белый</button><button data-lt="#f6f9fc" class="${S.wall === '#f6f9fc' ? 'on' : ''}">Холодный белый</button>`); $('finVars').querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { S.wall = b.dataset.lt; S.wallCustom = true; rebuild(); renderDeco(); pushHist(); }); }
  $('finVars').querySelectorAll('[data-fv]').forEach(b => b.onclick = () => { S.wallVar = Object.assign({}, S.wallVar, { [fin]: b.dataset.fv }); const AC = { brick: '#ffffff', beige: '#ffffff', slats: '#ffffff', woodp: '#ffffff', stone: '#ffffff', conc2: '#ffffff' }[b.dataset.fv]; if (AC && !S.wallCustom) S.wall = AC; rebuild(); renderDeco(); });
  $('floorBtns').querySelectorAll('[data-fl]').forEach(b => b.onclick = () => { S.floor = b.dataset.fl; $('floor').value = S.floor; rebuild(); renderDeco(); });
  // rug: shape x pile
  const rg = S.rug, carpet = S.floor === 'carpet';
  $('rugBox').innerHTML = carpet ? '' : `<div class="sz"><button data-rs="round" class="${rg && rg.shape === 'round' ? 'on' : ''}">Круглый</button><button data-rs="rect" class="${rg && rg.shape === 'rect' ? 'on' : ''}">Прямоугольный</button></div><div class="sz"><button data-rp="fluffy" class="${rg && rg.pile === 'fluffy' ? 'on' : ''}">Пушистый</button><button data-rp="flat" class="${rg && rg.pile === 'flat' ? 'on' : ''}">Плоский</button><button data-rugoff="1" class="${rg ? '' : 'on'}">Убрать ковер</button></div>`;
  if (!carpet && rg) { $('rugBox').insertAdjacentHTML('beforeend', `<div class="szlab">Размер ковра: <b id="rugKv">${Math.round((rg.k || 1) * 100)}%</b></div><input type="range" id="rugK" min="50" max="200" step="1" value="${Math.round((rg.k || 1) * 100)}">` + (rg.shape === 'round' ? '' : `<div class="szlab">Поворот ковра: <b id="rugRv">${Math.round((rg.r || 0) * 180 / Math.PI)}°</b></div><input type="range" id="rugR" min="-90" max="90" step="1" value="${Math.round((rg.r || 0) * 180 / Math.PI)}">`));
    const rm = () => decor.children.find(c => c.userData.rug), kk = $('rugK'), rr = $('rugR');
    kk.oninput = () => { const k = kk.value / 100, m = rm(); S.rug.k = k; $('rugKv').textContent = kk.value + '%'; if (m) m.scale.set(k / (m.userData.k0 || 1), 1, k / (m.userData.k0 || 1)); }; kk.onchange = () => { rebuild(); pushHist(); };
    if (rr) { rr.oninput = () => { const a = rr.value * Math.PI / 180, m = rm(); S.rug.r = a; $('rugRv').textContent = rr.value + '°'; if (m) m.rotation.y = a; }; rr.onchange = () => { localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); }; } }
  $('rugNote').textContent = carpet ? 'На ковролин ковер не кладется: выберите другой пол.' : '';
  $('rugBox').querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { S.rug = { ...(S.rug || {}), shape: b.dataset.rs, pile: (S.rug && S.rug.pile) || 'flat' }; rebuild(); renderDeco(); });
  $('rugBox').querySelectorAll('[data-rp]').forEach(b => b.onclick = () => { S.rug = { ...(S.rug || {}), shape: (S.rug && S.rug.shape) || 'rect', pile: b.dataset.rp }; rebuild(); renderDeco(); });
  $('rugBox').querySelectorAll('[data-rugoff]').forEach(b => b.onclick = () => { S.rug = null; rebuild(); renderDeco(); });
  // openings
  $('openBtns').innerHTML = `<button data-op="win" class="${R.win ? 'on' : ''}">Окно</button><button data-op="door" class="${R.door ? 'on' : ''}">Дверной проем</button>`;
  $('openBtns').querySelectorAll('[data-op]').forEach(b => b.onclick = () => { R[b.dataset.op] = !R[b.dataset.op]; rebuild(); renderDeco(); });
  $('winXL').classList.toggle('hide', !R.win); $('winX').value = R.winX || 0; $('winXV').textContent = R.winX || 0;
  // plants
  $('plantBtns').innerHTML = Object.entries(PLANTS).map(([k, t]) => `<button data-pa="${k}">+ ${t}</button>`).join('');
  $('plantList').innerHTML = (S.plants || []).map((p, i) => `<div class="plrow${plantSel === i ? ' sel' : ''}"><span>${PLANTS[p.k]}</span><input type="range" data-ps="${i}" min="0.6" max="1.5" step="0.05" value="${p.s || 1}" title="Размер"><button class="mini danger" data-pd="${i}">✕</button></div>`).join('');
  $('plantBtns').querySelectorAll('[data-pa]').forEach(b => b.onclick = () => { const n = (S.plants || []).length, [x, z] = plantSpot(n); const k = b.dataset.pa, F = frame(); let px = x, pz = z, pr = n * 1.7;
    // mirror leans on the free side wall facing the system (or the back wall beside it); pouf stands in front of the system
    if (k === 'mirror') { if (F.xL != null && S.layout !== 'Lr') { px = F.xL + 0.08; pz = bbox.max.z + 0.5; pr = Math.PI / 2; } else if (F.xR != null) { px = F.xR - 0.08; pz = bbox.max.z + 0.5; pr = -Math.PI / 2; } else { px = F.x0 - 0.55; pz = 0.1; pr = 0; } }
    if (k === 'pouf') { px = F.x0 + Math.min(F.backW, 2) * 0.45; pz = Math.max(1.1, bbox.max.z - 0.2); pr = 0.25; }
    S.plants = [...(S.plants || []), { k, x: px, z: pz, s: 1, r: pr }]; plantSel = n; rebuild(); renderDeco(); });
  $('plantList').querySelectorAll('[data-ps]').forEach(el => { el.oninput = () => { const i = +el.dataset.ps; S.plants[i].s = +el.value; plantSel = i; const g = decor.children.find(c => c.userData.plant === i); if (g) g.scale.setScalar(+el.value); }; el.onchange = () => { rebuild(); }; });
  $('plantList').querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { S.plants.splice(+b.dataset.pd, 1); plantSel = -1; rebuild(); renderDeco(); });
  $('cornT').checked = !!R.cornice; $('skirtT').checked = R.skirting !== false; $('skirtC').value = R.skirtColor || '#ffffff'; $('cornC').value = R.cornColor || '#fbfaf6'; $('ceilH2').value = R.ceilH || 285; $('ceilV2').textContent = R.ceilH || 285;
  renderLight(); renderSwatches(); renderAng();
  drawWallPick(); drawBgPick();
}
let plantSel = -1;
function renderLight() {
  const R = S.room;
  $('shPBtns').innerHTML = [['soft', 'Мягкая'], ['left', 'Слева'], ['right', 'Справа'], ['top', 'Сверху'], ['sharp', 'Четкая'], ['sun', 'Солнечный свет'], ['none', 'Без тени']].map(([k, t]) => `<button data-shp="${k}" class="${(R.shP || 'soft') === k ? 'on' : ''}">${t}</button>`).join('');
  $('glMBtns').innerHTML = [['soft', 'Мягкие'], ['bright', 'Яркие'], ['off', 'Выкл']].map(([k, t]) => `<button data-glm="${k}" class="${(R.glareM || 'soft') === k ? 'on' : ''}">${t}</button>`).join('');
  $('winL').value = R.winL || 'off'; $('winL').disabled = !!S.studio;
  { let sl = $('sunSl'); if (!sl) { sl = document.createElement('div'); sl.id = 'sunSl'; $('shPBtns').after(sl); } sl.innerHTML = R.shP === 'sun' ? `<label class="rng">Сила солнца<input type="range" id="sunK" min="0.3" max="1.6" step="0.05" value="${R.sunK ?? 1}"></label><label class="rng">Направление<input type="range" id="sunD" min="-1" max="1" step="0.05" value="${R.sunD ?? 0}"></label>` : '';
    ['sunK', 'sunD'].forEach(k => { const el = $(k); if (el) el.oninput = () => { R[k] = +el.value; applyGlareShadow(); localStorage.setItem('gs_auto', JSON.stringify(S)); }; }); }
  $('shPBtns').querySelectorAll('[data-shp]').forEach(b => b.onclick = () => { R.shP = b.dataset.shp; R.shOn = R.shP !== 'none'; rebuild(); renderLight(); });
  $('glMBtns').querySelectorAll('[data-glm]').forEach(b => b.onclick = () => { R.glareM = b.dataset.glm; rebuild(); renderLight(); });
}
$('winL').onchange = e => { S.room.winL = e.target.value; rebuild(); };
{ let t; $('winX').oninput = e => { S.room.winX = +e.target.value; $('winXV').textContent = S.room.winX; clearTimeout(t); t = setTimeout(rebuild, 40); }; }
function renderSwatches() {
  $('metalSw').innerHTML = [['white', 'Белый', '#f7f9fc'], ['black', 'Черный', '#202124'], ['silver', 'Серебро', 'linear-gradient(135deg,#eceef0,#a7abaf 55%,#d9dcdf)']].map(([k, t, c]) => `<button data-msw="${k}" class="${S.metal === k ? 'on' : ''}" title="${t}"><i style="background:${c}"></i><span>${t}</span></button>`).join('');
  $('rodSw').innerHTML = [['white', 'Белый', '#f7f9fc'], ['black', 'Черный', '#111111'], ['chrome', 'Хром', 'linear-gradient(135deg,#ffffff,#9aa0a6 45%,#f4f6f8 62%,#7d838a)']].map(([k, t, c]) => `<button data-rsw="${k}" class="${(S.rod || 'chrome') === k ? 'on' : ''}" title="${t}"><i style="background:${c}"></i><span>${t}</span></button>`).join('');
  $('metalSw').querySelectorAll('[data-msw]').forEach(b => b.onclick = () => { $('metal').value = b.dataset.msw; $('metal').onchange({ target: $('metal') }); });
  $('rodSw').querySelectorAll('[data-rsw]').forEach(b => b.onclick = () => { S.rod = b.dataset.rsw; $('rodC').value = S.rod; rebuild(); rcS(); renderSwatches(); });
}
// «Раскрыть угол стен»: the same slider in Каркас and Оформление
function renderAng() {
  const on = S.layout !== 'straight', a = S.room.angle || 90;
  const h = on ? `<label>Раскрыть угол стен: <b class="angv">${a}°</b><input type="range" class="angr" min="90" max="115" step="1" value="${a}"></label>` : '';
  ['angBox1', 'angBox2'].forEach(id => $(id).innerHTML = h);
  let t; document.querySelectorAll('.angr').forEach(el => el.oninput = () => { S.room.angle = +el.value; $('angR').value = S.room.angle; document.querySelectorAll('.angr').forEach(o => { if (o !== el) o.value = el.value; }); document.querySelectorAll('.angv').forEach(o => o.textContent = el.value + '°'); clearTimeout(t); t = setTimeout(rebuild, 30); });
}
// corner shift: one slider per wall and corner, in Каркас and at the top of Наполнение (synced)
function gapKeys() { const L = S.layout; return L === 'L' ? [['1', 'Основная стена от угла'], ['0', 'Дополнительная стена от угла']] : L === 'Lr' ? [['0', 'Основная стена от угла'], ['2', 'Дополнительная стена от угла']] : L === 'U' ? [['0', 'Основная стена от левого угла'], ['0r', 'Основная стена от правого угла'], ['1', 'Левая стена от угла'], ['2', 'Правая стена от угла']] : []; }
function gapGet(k) { return k === '0r' ? effGapR() : effGap(+k); }
function gapSet(k, v) { if (k === '0r') S.walls[0].gapR = v; else S.walls[+k].gap = v; }
let gapTmr;
function renderGaps() {
  const ks = gapKeys();
  const html = ks.length ? '<div class="szlab">Сдвиг от угла, см</div>' + ks.map(([k, t]) => { const eg = gapGet(k), og = Math.min(300, optGap(k)); return `<label class="gapl">${t}: <b data-gv="${k}">${eg}</b> см<span class="own"><span class="rng"><input type="range" data-gr="${k}" min="0" max="300" step="1" value="${eg}"><i class="opt" style="left:calc(${og / 300} * (100% - 18px) + 9px)" title="Без пересечения полок: ${og} см"></i></span><input type="number" data-gf="${k}" min="0" max="300" step="1" value="${eg}"></span></label>`; }).join('') + '<p class="foot"><i class="opt inl"></i> красная точка — положение, при котором полки двух стен не пересекаются</p>' : '';
  ['posGap', 'posGap2'].forEach(id => $(id).innerHTML = html);
  const sh = { '0': S.layout === 'U' ? 'Осн. слева' : S.layout === 'L' ? 'Дополнит.' : 'Основная', '0r': 'Осн. справа', '1': S.layout === 'U' ? 'Левая' : S.layout === 'L' ? 'Основная' : 'Дополнит.', '2': S.layout === 'U' ? 'Правая' : 'Дополнит.' };
  $('posGap3').innerHTML = ks.length ? '<div class="szlab">Сдвиг от угла, см</div><div class="gr2">' + ks.map(([k]) => `<label>${sh[k]}: <b data-gv="${k}">${gapGet(k)}</b><input type="range" data-gr="${k}" min="0" max="300" step="1" value="${gapGet(k)}"></label>`).join('') + '</div>' : '';
  const set = (k, v, live, src) => { const prev = gapGet(k), og = Math.min(300, optGap(k)); let nv = Math.max(0, Math.min(300, Math.round(v))); if (Math.abs(nv - og) <= 4) nv = og; gapSet(k, nv); if (prev !== nv && nv === og) { haptic(); tick('bright'); }
    document.querySelectorAll(`[data-gv="${k}"]`).forEach(e => e.textContent = nv); document.querySelectorAll(`[data-gr="${k}"],[data-gf="${k}"]`).forEach(e => { if (e !== src) e.value = nv; }); clearTimeout(gapTmr); gapTmr = setTimeout(rebuild, live ? 30 : 0); };
  document.querySelectorAll('[data-gr]').forEach(el => { el.oninput = () => set(el.dataset.gr, +el.value, true, el); el.onchange = () => set(el.dataset.gr, +el.value, false, el); });
  document.querySelectorAll('[data-gf]').forEach(el => el.onchange = () => set(el.dataset.gf, +el.value || 0, false, el));
}
document.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => { S.studio = b.dataset.dt === 'studio'; S.studioL = false; setBg(); rebuild(); renderDeco(); });
$('cornC').oninput = $('cornC').onchange = e => { S.room.cornColor = e.target.value; S.room.cornice = true; $('cornT').checked = true; rebuild(); localStorage.setItem('gs_auto', JSON.stringify(S)); };
{ let t; $('ceilH2').oninput = e => { S.room.ceilH = +e.target.value; $('ceilV2').textContent = S.room.ceilH; if ($('ceilH')) { $('ceilH').value = S.room.ceilH; } if ($('ceilV')) $('ceilV').textContent = S.room.ceilH; clearTimeout(t); t = setTimeout(rebuild, 40); }; }
{ const o = $('ceilT').onchange; $('ceilT').onchange = e => { o(e); renderDeco(); }; }
{ const o = $('layout').onchange; $('layout').onchange = e => { o(e); renderAng(); renderWallsPop(); }; }
// neighbour distances while dragging: left of the finger, «от пола» on the right
// both hints sit right beside the dragged item on screen, clamped inside the view
const _tb = new THREE.Box3(), _tv = new THREE.Vector3();
function placeTips(d, e, r) {
  const T = $('dragTip'), L = $('dragTipL'), ii = S.walls[d.wi].sections[d.si].items.indexOf(d.o); let g = null;
  model.traverse(o => { const f = o.userData.ref; if (f && f.wi === d.wi && f.si === d.si && f.ii === ii) g = o; });
  let x0 = e.clientX - r.left - 40, x1 = e.clientX - r.left + 40, yc = e.clientY - r.top;
  if (g) { _tb.makeEmpty(); g.traverse(m => { if (m.isMesh && !m.userData.contact) _tb.expandByObject(m); }); if (!_tb.isEmpty()) { x0 = 1e9; x1 = -1e9; let y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) { _tv.set(i & 1 ? _tb.max.x : _tb.min.x, i & 2 ? _tb.max.y : _tb.min.y, i & 4 ? _tb.max.z : _tb.min.z).project(camera); const sx = (_tv.x + 1) / 2 * r.width, sy = (1 - _tv.y) / 2 * r.height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    yc = (y0 + y1) / 2; } }
  const cl = (v, w) => Math.max(4, Math.min(r.width - w - 4, v)), ch = (v, h) => Math.max(4, Math.min(r.height - h - 4, v));
  const tw = T.offsetWidth || 120, th = T.offsetHeight || 26, lw = L.offsetWidth || 90, lh = L.offsetHeight || 40;
  T.style.left = cl(x1 + 8, tw) + 'px'; T.style.top = ch(yc - th / 2, th) + 'px'; L.style.right = 'auto'; L.style.left = cl(x0 - 8 - lw, lw) + 'px'; L.style.top = ch(yc - lh / 2, lh) + 'px';
}
function nbTip(d, e, r) {
  const L = $('dragTipL'), sc = S.walls[d.wi].sections[d.si], o = d.o, me = new Set([o, ...d.linked]); let up = null, dn = null; const t = itemTop(o), b0 = itemBot(o);
  sc.items.forEach(p => { if (me.has(p)) return; const pb = itemBot(p), pt = itemTop(p); if (pb >= t - 0.005) up = up == null ? pb - t : Math.min(up, pb - t); else if (pt <= b0 + 0.005) dn = dn == null ? b0 - pt : Math.min(dn, b0 - pt); });
  L.innerHTML = (up != null ? `<div>↑ ${Math.round(up * 100)} см</div>` : '') + (dn != null ? `<div>↓ ${Math.round(dn * 100)} см</div>` : '');
  L.classList.toggle('hide', up == null && dn == null); 
}
// ---- «Стены ▾»: clear or restore the construction on each wall (the room wall stays)
function renderWallsPop() {
  const act = wallsActive(), nm = wi => act.length > 2 ? ['Основная стена', 'Левая стена', 'Правая стена'][wi] : WALLNAMES[wi];
  $('wallsPop').innerHTML = '<b>Стены</b>' + act.map(wi => S.walls[wi].off ? `<button data-won="${wi}" class="acc">${nm(wi)} · Вернуть конструкцию</button>` : `<button data-woff="${wi}">${nm(wi)} · Очистить</button>`).join('') + `<button data-ceil="1" class="${S.room.ceiling ? 'acc' : ''}">Потолок · ${S.room.ceiling ? 'Убрать' : 'Показать'}</button>` + '<p class="foot">Очистить: убрать стойки, рельс и наполнение с этой стены. Стена комнаты остается, отмена ↶ тоже работает.</p>';
  $('wallsPop').querySelectorAll('[data-woff]').forEach(b => b.onclick = () => { const wi = +b.dataset.woff; S.walls[wi].off = true; if (cur.w === wi) cur.it = -1; selPost = null; $('postPop').classList.add('hide'); rebuild(); renderSec(); renderWallsPop(); msg('Конструкция убрана: ' + nm(wi).toLowerCase()); });
  $('wallsPop').querySelectorAll('[data-won]').forEach(b => b.onclick = () => { const wi = +b.dataset.won; S.walls[wi].off = false; cur = { w: wi, s: 0, it: -1 }; rebuild(); renderSec(); renderWallsPop(); flashWall(wi); });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-ceil]'); if (!b) return; S.room.ceiling = !S.room.ceiling; $('ceilT').checked = S.room.ceiling; rebuild(); setBg(); renderWallsPop(); });
$('wallsBtn').onclick = e => { e.stopPropagation(); ['dimPop', 'morePop'].forEach(id => $(id).classList.add('hide')); renderWallsPop(); $('wallsPop').classList.toggle('hide'); };
document.addEventListener('pointerdown', e => { if (!e.target.closest('#wallsPop,#wallsBtn')) $('wallsPop').classList.add('hide'); });
// ---- 📷: one tap 3:4 snapshot 1800 x 2400 of the current view, without highlights
function snap34() {
  const CW = 1800, CH = 2400, sv = { pos: camera.position.clone(), q: camera.quaternion.clone(), pr: renderer.getPixelRatio() }, sm = sun.shadow.mapSize.x;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null);
  renderer.setPixelRatio(1); renderer.setSize(CW, CH, false); camera.aspect = CW / CH; camera.updateProjectionMatrix(); if (orb.on) applyCam();
  renderer.shadowMap.needsUpdate = true; let comp = null;
  try { if (POST && !isIOS() && !matchMedia('(pointer: coarse)').matches) { comp = new POST.EffectComposer(renderer); comp.setSize(CW, CH); comp.addPass(new POST.RenderPass(scene, camera)); const sao = new POST.SAOPass(scene, camera); Object.assign(sao.params, { saoIntensity: 0.025, saoScale: 3, saoKernelRadius: 28, saoBias: 0.5, saoMinResolution: 0, saoBlur: true, saoBlurRadius: 6 }); comp.addPass(sao); comp.addPass(new POST.OutputPass()); comp.render(); } } catch (er) { comp = null; }
  if (!comp) renderer.render(scene, camera);
  const out = document.createElement('canvas'); out.width = CW; out.height = CH; const g = out.getContext('2d');
  if (photoImg && !$('showRoom').checked) { const s = Math.max(CW / photoImg.width, CH / photoImg.height), iw = photoImg.width * s, ih = photoImg.height * s; g.drawImage(photoImg, (CW - iw) / 2, (CH - ih) / 2, iw, ih); }
  g.drawImage(renderer.domElement, 0, 0, CW, CH); fxBake(g, CW, CH); if (comp) comp.dispose(); { const vg = g.createRadialGradient(CW / 2, CH / 2, CH * 0.38, CW / 2, CH / 2, CH * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.16)'); g.fillStyle = vg; g.fillRect(0, 0, CW, CH); }
  sun.shadow.mapSize.set(sm, sm); renderer.shadowMap.needsUpdate = true; sun.shadow.map && (sun.shadow.map.dispose(), sun.shadow.map = null);
  renderer.setPixelRatio(sv.pr); resize(); camera.position.copy(sv.pos); camera.quaternion.copy(sv.q); if (orb.on) applyCam();
  return out;
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
$('camBtn').onclick = () => { try { camShot(); } catch (er) { msg('Не удалось сделать снимок'); } };
function camShot() {
  try { hlOnly(null); window.__plantSel = -1; window.__propSel = null; $('delBtn').classList.add('hide'); } catch (e) {}
  const out = cleanShot(snap34), name = 'garderob-' + new Date().toISOString().slice(0, 10) + '-1800x2400.png';
  if (matchMedia('(pointer: coarse)').matches || isIOS()) { showShot(out, name); return; }
  if (isIOS() && navigator.canShare) { try { const bin = atob(out.toDataURL('image/png').split(',')[1]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); const file = new File([u8], name, { type: 'image/png' }); if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(e => { if (!e || e.name !== 'AbortError') dl(); }); return; } } catch (er) {} }
  dl();
  function dl() { out.toBlob(b => { if (!b) { msg('Не удалось сделать снимок'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); msg('Снимок сохранен'); }, 'image/png'); }
}
// ---- plants: drag with a finger on the floor
{ const el = renderer.domElement, fp = new THREE.Plane(V(0, 1, 0), 0); let pd = null;
  const ray = e => { const r = el.getBoundingClientRect(); RC.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera); };
  el.addEventListener('pointerdown', e => { if (!orb.on || e.button !== 0 || !decor.visible || !(S.plants || []).length || pd) return; ray(e);
    const h = RC.intersectObjects(decor.children, true).find(x => x.object.userData.plant != null); if (!h) return; const mh = pickHits(e)[0]; if (mh && mh.distance < h.distance) return;
    const i = h.object.userData.plant, p = S.plants[i], q = new THREE.Vector3(); if (!RC.ray.intersectPlane(fp, q)) return;
    pd = { i, dx: p.x - q.x, dz: p.z - q.z, g: decor.children.find(c => c.userData.plant === i), id: e.pointerId }; plantSel = i; window.__plantSel = i; hlOnly(pd.g); $('delBtn').classList.remove('hide'); window.__plantTap = true;
    e.stopImmediatePropagation(); el.setPointerCapture(e.pointerId); }, true);
  el.addEventListener('pointermove', e => { if (!pd || e.pointerId !== pd.id) return; e.stopImmediatePropagation(); ray(e); const q = new THREE.Vector3(); if (!RC.ray.intersectPlane(fp, q)) return;
    const p = S.plants[pd.i]; p.x = q.x + pd.dx; p.z = Math.max(0.2, Math.min(9, q.z + pd.dz)); if (ROOMB) p.x = Math.max(ROOMB.l + 0.2, Math.min(ROOMB.r - 0.2, p.x)); if (pd.g) pd.g.position.set(p.x, 0, p.z); }, true);
  const up = e => { if (!pd || e.pointerId !== pd.id) return; pd = null; setTimeout(() => { window.__plantTap = false; }, 0); localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); applyGlareShadow(); renderDeco(); };
  el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true); }
// ---- sound: soft synthesized clicks + light haptics; toggle in the top bar
const SND = { on: localStorage.getItem('gs_snd') !== '0', ctx: null };
function tick(kind) {
  if (!SND.on) return;
  try { const C = SND.ctx || (SND.ctx = new (window.AudioContext || window.webkitAudioContext)()); if (C.state === 'suspended') C.resume();
    const t = C.currentTime + 0.002, P = { soft: [560, 0.05, 0.045, 'sine', 1500], bright: [680, 0.055, 0.05, 'sine', 1700], muted: [340, 0.06, 0.06, 'sine', 900] }[kind] || [560, 0.05, 0.045, 'sine', 1500];
    const o = C.createOscillator(), g = C.createGain(), f = C.createBiquadFilter(); o.type = P[3]; o.frequency.setValueAtTime(P[0], t); o.frequency.exponentialRampToValueAtTime(P[0] * 0.5, t + P[2]);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(P[1], t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + P[2]); f.type = 'lowpass'; f.frequency.value = P[4];
    o.connect(f); f.connect(g); g.connect(C.destination); o.start(t); o.stop(t + P[2] + 0.02);
    if (false) { const o2 = C.createOscillator(), g2 = C.createGain(); o2.type = 'sine'; o2.frequency.setValueAtTime(P[0] * 1.5, t + 0.012); g2.gain.setValueAtTime(0.0001, t + 0.012); g2.gain.exponentialRampToValueAtTime(0.03, t + 0.016); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o2.connect(g2); g2.connect(C.destination); o2.start(t + 0.012); o2.stop(t + 0.07); }
  } catch (er) {}
}
function lightHaptic() { try { if (navigator.vibrate) { navigator.vibrate(6); return; } hapEl.click(); } catch (er) {} }
function sndUI() { $('sndBtn').classList.toggle('off', !SND.on); $('sndBtn').title = SND.on ? 'Звук включен' : 'Звук выключен'; }
$('sndBtn').onclick = () => { SND.on = !SND.on; localStorage.setItem('gs_snd', SND.on ? '1' : '0'); sndUI(); if (SND.on) tick('soft'); };
sndUI();
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled || b.id === 'sndBtn') return;
  const muted = ['delBtn', 'undoBtn', 'redoBtn'].includes(b.id), bright = !muted && !!b.closest('.sz,.sws,.tiles,.cpgrid,.ld,.wbtn,.btiles');
  tick(muted ? 'muted' : bright ? 'bright' : 'soft'); if (muted || bright) lightHaptic(); }, true);
try { renderDeco(); setBg(); rebuild(); renderSec(); } catch (e) { console.warn('bad state, defaults', e); clearSaved(); S = migrate(defaults()); renderDeco(); setBg(); rebuild(); renderSec(); }
// lens toggle in the top bar
{ const pop = document.createElement('div'); pop.id = 'camPop'; pop.className = 'hide'; document.body.appendChild(pop);
  const draw = () => { pop.innerHTML = '<div class="szlab">Камера</div>' + CAMS.map(([k, t]) => `<button data-cs="${k}" class="${camK() === k ? 'on' : ''}">${t}</button>`).join('');
    pop.querySelectorAll('[data-cs]').forEach(b => b.onclick = () => { localStorage.setItem('gs_cam', b.dataset.cs); lensUI(); pop.classList.add('hide'); applyLights(); $('niceBtn').click(); }); };
  $('lensBtn').onclick = e => { e.stopPropagation(); draw(); const r = $('lensBtn').getBoundingClientRect(); pop.style.top = (r.bottom + 6) + 'px'; pop.style.right = Math.max(6, innerWidth - r.right - 40) + 'px'; pop.classList.toggle('hide'); };
  document.addEventListener('pointerdown', e => { if (!pop.contains(e.target) && e.target !== $('lensBtn') && !$('lensBtn').contains(e.target)) pop.classList.add('hide'); }); }
lensUI();
// «Эффект»: a per-camera photo look (no blur); live as CSS filter + overlays, baked into 📷 by pixels
const FXP = { std: { b: 1.02, c: 1.03, s: 1.04, w: 0.03, l: 0, v: 0.2 }, int: { b: 1.08, c: 0.92, s: 1.03, w: 0.035, l: 0.04, v: 0 }, por: { b: 1.0, c: 1.16, s: 1.06, w: 0, l: 0, v: 0.32 }, top3: { b: 1.04, c: 1.03, s: 0.9, w: -0.035, l: 0, v: 0.06 } };
const fxOn = () => localStorage.getItem('gs_fx') === '1';
function fxUI() { const on = fxOn(), p = FXP[camK()] || FXP.std, el = renderer.domElement; $('fxBtn').classList.toggle('on', on);
  el.style.filter = on ? `brightness(${p.b + p.l}) contrast(${p.c}) saturate(${p.s})` : '';
  let ov = document.getElementById('fxOv'); if (!ov) { ov = document.createElement('div'); ov.id = 'fxOv'; el.parentNode.insertBefore(ov, el.nextSibling); }
  const tint = p.w > 0 ? `rgba(255,170,90,${p.w * 3})` : `rgba(120,170,255,${-p.w * 3})`;
  ov.style.cssText = on ? `position:absolute;left:${el.offsetLeft}px;top:${el.offsetTop}px;width:${el.clientWidth}px;height:${el.clientHeight}px;pointer-events:none;z-index:1;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${p.v}) 100%), linear-gradient(${tint},${tint});mix-blend-mode:normal` : 'display:none';
  if (on && p.w) ov.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${p.v}) 100%), linear-gradient(${p.w > 0 ? 'rgba(255,190,120,' + p.w * 1.6 + ')' : 'rgba(150,190,255,' + (-p.w * 1.6) + ')'},rgba(0,0,0,0))`; }
function fxBake(g, W, H) { if (!fxOn()) return; const p = FXP[camK()] || FXP.std, im = g.getImageData(0, 0, W, H), d = im.data, cx = W / 2, cy = H / 2, R2 = cx * cx + cy * cy;
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) { let r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    r = r * p.b + p.l * (1 - r); gg = gg * p.b + p.l * (1 - gg); b = b * p.b + p.l * (1 - b); r = (r - 0.5) * p.c + 0.5; gg = (gg - 0.5) * p.c + 0.5; b = (b - 0.5) * p.c + 0.5;
    const L = 0.299 * r + 0.587 * gg + 0.114 * b; r = L + (r - L) * p.s; gg = L + (gg - L) * p.s; b = L + (b - L) * p.s; r += p.w; b -= p.w;
    if (p.v) { const q = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / R2, k = 1 - p.v * Math.max(0, (q - 0.3) / 0.7); r *= k; gg *= k; b *= k; }
    d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255; }
  g.putImageData(im, 0, 0); }
$('fxBtn').onclick = () => { localStorage.setItem('gs_fx', fxOn() ? '0' : '1'); fxUI(); msg('Эффект: ' + (fxOn() ? 'вкл' : 'выкл')); };
addEventListener('resize', () => setTimeout(fxUI, 50)); fxUI();
{ let rt = 0, lw = innerWidth; const refit = () => { clearTimeout(rt); rt = setTimeout(() => { try { resize(); if (innerWidth !== lw) { lw = innerWidth; fitView(); } } catch (e) {} }, 150); }; addEventListener('resize', refit); addEventListener('orientationchange', refit); }
{ const o = lensUI; lensUI = function () { o(); try { fxUI(); } catch (e) {} }; }

// ---- v10 props: add to the selected (or first fitting) shelf / rod, drag along it with a finger, delete with 🗑
function addProp(k) {
  const cand = []; wallsBuilt().forEach(wi => S.walls[wi].sections.forEach((sc, si) => sc.items.forEach((o, ii) => { if (propFits(k, o.t)) cand.push({ wi, si, ii, o }); })));
  if (!cand.length) { msg(PROPK[k][1] === 'rail' ? 'Сначала добавьте штангу' : PROPK[k][1] === 'shoe' ? 'Сначала добавьте полку для обуви' : 'Сначала добавьте полку'); return; }
  const sel = cand.find(c => c.wi === cur.w && c.si === cur.s && c.ii === cur.it), t = sel || cand.slice().sort((a, b) => (a.o.pr || []).length - (b.o.pr || []).length || (PROPK[k][1] === 'shelf' ? Math.abs(a.o.y - (k === 'hat' || k === 'box' ? 200 : 115)) - Math.abs(b.o.y - (k === 'hat' || k === 'box' ? 200 : 115)) : 0))[0];
  const n = (t.o.pr || []).length; t.o.pr = [...(t.o.pr || []), { k, u: [0.5, 0.05, 0.95, 0.3, 0.7][n % 5] }];
  window.__propSel = { wi: t.wi, si: t.si, ii: t.ii, pi: n }; rebuild(); pushHist(); msg(PROPK[k][0] + ': добавлено');
}
function renderPropBtns() { const el = $('propBtns'); if (!el) return; el.innerHTML = Object.entries(PROPK).map(([k, v]) => `<button data-prk="${k}">+ ${v[0]}</button>`).join(''); el.querySelectorAll('[data-prk]').forEach(b => b.onclick = () => addProp(b.dataset.prk)); }
renderPropBtns();
{ const el = renderer.domElement; let pd = null;
  el.addEventListener('pointerdown', e => { if (e.button !== 0 || pd) return; const h = pickHits(e)[0], pr = h && h.object.userData.prop;
    if (!pr) { if (window.__propSel) { window.__propSel = null; hlOnly(null); $('delBtn').classList.toggle('hide', !(cur.it >= 0) && !(window.__plantSel >= 0)); } return; }
    let g = h.object; while (g.parent && g.parent.userData.prop === pr) g = g.parent; const wg = WG[pr.wi]; if (!wg) return;
    wg.updateMatrixWorld(true); const n = V(0, 0, 1).transformDirection(wg.matrixWorld), plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, h.point), lp = wg.worldToLocal(h.point.clone());
    pd = { pr, g, wg, plane, dx: g.position.x - lp.x, id: e.pointerId, moved: false };
    window.__propSel = { wi: pr.wi, si: pr.si, ii: pr.ii, pi: pr.pi }; window.__plantSel = -1; hlOnly(g); window.__plantTap = true; $('delBtn').classList.remove('hide');
    e.stopImmediatePropagation(); el.setPointerCapture(e.pointerId); }, true);
  el.addEventListener('pointermove', e => { if (!pd || e.pointerId !== pd.id) return; e.stopImmediatePropagation(); const r = el.getBoundingClientRect();
    RC.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera); const q = new THREE.Vector3(); if (!RC.ray.intersectPlane(pd.plane, q)) return;
    const lp = pd.wg.worldToLocal(q), { x0, x1, hw } = pd.pr, xa = x0 + 0.02 + hw, xb = x1 - 0.02 - hw; if (xb <= xa) return;
    const x = Math.max(xa, Math.min(xb, lp.x + pd.dx)); pd.g.position.x = x; pd.u = (x - xa) / (xb - xa); pd.moved = true; }, true);
  const up = e => { if (!pd || e.pointerId !== pd.id) return; const p = pd; pd = null; setTimeout(() => { window.__plantTap = false; }, 0);
    if (p.moved && p.u != null) { const it = S.walls[p.pr.wi].sections[p.pr.si].items[p.pr.ii]; if (it && it.pr && it.pr[p.pr.pi]) it.pr[p.pr.pi].u = Math.round(p.u * 1000) / 1000; localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); }
    else msg((PROPK[(S.walls[p.pr.wi].sections[p.pr.si].items[p.pr.ii].pr[p.pr.pi] || {}).k] || ['Вещь'])[0] + ': выбрано, 🗑 удалит'); };
  el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true); }

// iPhone: show the shot as a plain <img>; long-press → «Сохранить в Фото» (no iCloud/Files needed); «Поделиться» as an extra
function showShot(cv, name) { const url = cv.toDataURL('image/jpeg', 0.92), ov = document.createElement('div'); ov.id = 'shotOv';
  ov.innerHTML = '<button class="x" aria-label="Закрыть">✕</button><img alt="Снимок"><p>Нажмите и удерживайте фото → «Сохранить в Фото»</p><button class="sh">Поделиться</button>';
  ov.querySelector('img').src = url; document.body.appendChild(ov); const close = () => ov.remove(); ov.querySelector('.x').onclick = close;
  let lp = 0; ov.addEventListener('touchstart', e => { if (e.target.tagName === 'IMG') lp = performance.now(); }, { passive: true }); ov.addEventListener('click', e => { if (e.target === ov || (e.target.tagName === 'P')) close(); });
  document.addEventListener('visibilitychange', function vc() { if (document.visibilityState === 'visible' && lp) { document.removeEventListener('visibilitychange', vc); } });
  ov.addEventListener('contextmenu', () => { setTimeout(() => { if (document.body.contains(ov)) ov.dataset.saved = '1'; }, 0); });
  const shb = ov.querySelector('.sh'); if (!navigator.share) shb.remove();
  shb.onclick = () => { fetch(url).then(r => r.blob()).then(b => { const f = new File([b], name.replace(/\.png$/, '.jpg'), { type: 'image/jpeg' }); return navigator.share(navigator.canShare && navigator.canShare({ files: [f] }) ? { files: [f] } : { url: location.href }); }).then(close).catch(() => {}); };
  ov.querySelector('img').addEventListener('touchend', () => { if (lp && performance.now() - lp > 600) setTimeout(() => { const once = () => { close(); removeEventListener('focus', once); }; addEventListener('pointerdown', once, { once: true, capture: true }); }, 300); }); }
// rug: a tap selects it; only a selected rug follows one finger; a second finger always goes to the camera
{ const el = renderer.domElement, fp = new THREE.Plane(V(0, 1, 0), 0), TP = new Set(); let pd = null, sel = null, tap = null;
  addEventListener('pointerdown', e => TP.add(e.pointerId), true);
  const clr = () => { pd = null; window.__rugDrag = false; };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => addEventListener(t, e => { TP.delete(e.pointerId); if (pd && pd.id === e.pointerId) { clr(); localStorage.setItem('gs_auto', JSON.stringify(S)); pushHist(); } if (!TP.size) clr(); }, true));
  ['touchend', 'touchcancel'].forEach(t => addEventListener(t, e => { if (!e.touches || !e.touches.length) { TP.clear(); clr(); } }, true)); addEventListener('blur', () => { TP.clear(); clr(); });
  const ray = e => { const r = el.getBoundingClientRect(); RC.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera); };
  el.addEventListener('pointerdown', e => { if (TP.size > 1) { clr(); tap = null; return; } if (!orb.on || e.button !== 0 || !S.rug || !decor.visible) return; ray(e);
    const m = decor.children.find(c => c.userData.rug); if (!m) return; const h = RC.intersectObjects(decor.children, true)[0];
    if (!h || !h.object.userData.rug) { if (sel) { sel = null; hlOnly(null); } return; }
    const mh = pickHits(e)[0]; if (mh && mh.distance < h.distance) return;
    if (sel !== m) { tap = { m, id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    const q = new THREE.Vector3(); if (!RC.ray.intersectPlane(fp, q)) return; pd = { m, dx: m.position.x - q.x, dz: m.position.z - q.z, id: e.pointerId }; window.__rugDrag = true; }, true);
  el.addEventListener('pointerup', e => { const t = tap; tap = null; if (!t || t.id !== e.pointerId || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return; sel = t.m; hlOnly(t.m); }, true);
  el.addEventListener('pointermove', e => { if (!pd || e.pointerId !== pd.id || TP.size > 1) return; e.stopImmediatePropagation(); ray(e); const q = new THREE.Vector3(); if (!RC.ray.intersectPlane(fp, q)) return;
    let x = q.x + pd.dx, z = Math.max(0.3, Math.min(9, q.z + pd.dz)); if (ROOMB) x = Math.max(ROOMB.l + 0.3, Math.min(ROOMB.r - 0.3, x)); pd.m.position.x = x; pd.m.position.z = z; S.rug.x = x; S.rug.z = z; }, true); }

// baked soft shadows: the sun shadow map (light from the upper front left) is rendered only after a configuration change
// (debounced), not every frame; walls and floor receive it, so cast shadows of uprights/shelves/rails and the darker corner read at every angle
var _bk = 0; function bakeShadows() { if (S.studio || (photo && !$('showRoom').checked)) { renderer.shadowMap.autoUpdate = true; return; }
  const c = bbox.getCenter(new THREE.Vector3()); renderer.shadowMap.autoUpdate = false; sun.castShadow = true;
  const sg = S.layout === 'Lr' ? -1 : 1; sun.color.set(0xfff1e0); sun.position.set(c.x + sg * 2.4, c.y + 3.8, c.z + 3.6); sun.target.position.set(c.x - sg * 0.6, c.y * 0.6, 0.3); sun.target.updateMatrixWorld();
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.3, far: 20 }); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 7; sun.shadow.blurSamples = 12;
  clearTimeout(_bk); renderer.shadowMap.needsUpdate = true; _bk = setTimeout(() => { sun.castShadow = true; sun.color.set(0xfff1e0); sun.position.set(c.x + sg * 2.4, c.y + 3.8, c.z + 3.6); let n = 12; const f = () => { renderer.shadowMap.needsUpdate = true; if (--n > 0) requestAnimationFrame(f); }; f(); }, 180); }
setInterval(() => { if (!renderer.shadowMap.autoUpdate && sun.castShadow && !sun.shadow.map) renderer.shadowMap.needsUpdate = true; }, 250);
