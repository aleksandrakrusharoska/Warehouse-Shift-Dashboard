// =====================================================================================
//  Warehouse map in 3D (Three.js). Zones, labels and the people / forklifts of the report
//  lines come from layout.js; the building (white fence with posts), doors, trucks, racks,
//  floor markings and the Hall 21 building are built below. People, trucks and pallets are
//  3D models (static/models, see CREDITS.md), forklifts, racks and buildings are built from
//  boxes. Live labels are HTML on top. Exposes window.Scene3D:
//    Scene3D.setAreas({ AREA_ID: { status, label, count, selected } })   – labels + selection
//    Scene3D.setWorkers({ ROW_ID: status })                              – colour of the floor ring under people / forklifts
//    Scene3D.resetView()
//    Scene3D.highlight(areaId, row)                                      – link from the Shift report (null, null = off)
//  DOM events: "area-hover" (area id or null), "area-click" (area id),
//  "worker-hover" ({row, x, y} or null), "worker-click" ({row}).
// =====================================================================================
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const L = window.LAYOUT;
const host = document.getElementById("scene");
const S = 0.1;                               // metres per floor unit (layout.js coordinates)
const TILT = 50 * Math.PI / 180;             // camera elevation above the floor
const MAP_ZOOM = 1.1;                        // keep the warehouse readable without cropping its labels
const MODELS = "/static/models/";
const STATUS_COLOR = {ok: "#2E8B57", warning: "#C98A12", critical: "#C8372D", none: "#8E9BAA"};

// part of the floor shown on the map (floor units)
const SITE = {x0: -295, y0: -30, x1: 712, y1: 940};
const CX = (SITE.x0 + SITE.x1) / 2, CZ = (SITE.y0 + SITE.y1) / 2;

// floor unit → world (x east, z south, y up; centre of the map = 0, 0)
const wx = (x) => (x - CX) * S;
const wz = (y) => (y - CZ) * S;

// deterministic random numbers, so the scene looks the same on every load
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---------------------------------------------------------------- renderer, camera, lights
const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});   // transparent: the photo behind the map shows through
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = "map3d-canvas";
host.appendChild(renderer.domElement);

const overlay = document.createElement("div");
overlay.className = "map3d-overlay";
host.appendChild(overlay);

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
camera.position.set(0, Math.sin(TILT) * 300, Math.cos(TILT) * 300);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight("#FFFFFF", "#7D858C", 1.45));
const sun = new THREE.DirectionalLight("#FFF6E8", 2.1);
sun.position.set(-45, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, {left: -65, right: 65, top: 65, bottom: -65, near: 10, far: 400});
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- materials and textures
const std = (color, roughness = 0.85, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({color, roughness, metalness, ...extra});
const M = {
    fence: std("#F3F5F7", 0.6),
    post: std("#DDE2E7", 0.55),
    frame: std("#2B3440", 0.6, 0.3),
    door: std("#D3D8DE", 0.6, 0.1),
    doorTop: std("#9AA3AD", 0.6, 0.2),
    glass: std("#B9D6F5", 0.15, 0.1),
    white: std("#FFFFFF", 0.5, 0, {emissive: "#FFFFFF", emissiveIntensity: 0.2}),
    green: std("#2FD47F", 0.5, 0, {emissive: "#2FD47F", emissiveIntensity: 0.25}),
    line: std("#FFFFFF", 0.6, 0, {transparent: true, opacity: 0.75}),
};

// one unit box, scaled per object
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16);

function mesh(geo, material, cast = true) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
}

// box between world x0..x1, z0..z1, height h above base
function wbox(x0, x1, z0, z1, h, material, base = 0, cast = true) {
    const m = mesh(BOX, material, cast);
    m.scale.set(Math.abs(x1 - x0), h, Math.abs(z1 - z0));
    m.position.set((x0 + x1) / 2, base + h / 2, (z0 + z1) / 2);
    scene.add(m);
    return m;
}

// box on the floor plan: x, y, w, d in floor units, height h and base z0 in metres
const block = (x, y, w, d, h, material, z0 = 0, cast = true) => wbox(wx(x), wx(x + w), wz(y), wz(y + d), h, material, z0, cast);

// many small boxes of one kind (rack parts, cartons …) drawn as one InstancedMesh each
const batches = {};
const BATCH_MAT = {
    paint: std("#FFFFFF", 0.55, 0.25),
    wood: std("#FFFFFF", 0.9),
    carton: std("#FFFFFF", 0.9),
    metal: std("#FFFFFF", 0.5, 0.4),
};

function part(kind, cx, cy, cz, sx, sy, sz, color) {
    (batches[kind] ||= []).push([cx, cy, cz, sx, sy, sz, color]);
}

// same, given as a floor rectangle
const sitePart = (kind, x, y, w, d, z0, h, color) => part(kind, wx(x + w / 2), z0 + h / 2, wz(y + d / 2), w * S, h, d * S, color);

function flushBatches() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (const [kind, items] of Object.entries(batches)) {
        const im = new THREE.InstancedMesh(BOX, BATCH_MAT[kind], items.length);
        items.forEach(([x, y, z, sx, sy, sz, color], i) => {
            im.setMatrixAt(i, m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz)));
            im.setColorAt(i, c.set(color));
        });
        im.castShadow = im.receiveShadow = true;
        scene.add(im);
    }
}

// flat shape on the floor, points in floor units
function floorShape(points, material, y = 0.08) {
    const sh = new THREE.Shape();
    points.forEach(([x, z], i) => (i ? sh.lineTo(wx(x), -wz(z)) : sh.moveTo(wx(x), -wz(z))));
    const m = mesh(new THREE.ShapeGeometry(sh), material, false);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    scene.add(m);
    return m;
}

// ---------------------------------------------------------------- ground (photo behind the map) and painted lines
const ground = mesh(new THREE.PlaneGeometry(260, 260), new THREE.ShadowMaterial({opacity: 0.35}), false);   // invisible, only takes the shadows
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// painted line (axis-parallel), solid or dashed (dash / gap in floor units)
function paint(x1, y1, x2, y2, dash = 0, gap = 0, width = 2.5) {
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1), dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    const step = dash ? dash + gap : len;
    for (let t = 0; t < len; t += step) {
        const e = Math.min(t + (dash || len), len);
        const ax = x1 + dx * t, ay = y1 + dy * t, bx = x1 + dx * e, by = y1 + dy * e;
        block(Math.min(ax, bx) - (dx ? 0 : width / 2), Math.min(ay, by) - (dy ? 0 : width / 2),
            Math.abs(bx - ax) || width, Math.abs(by - ay) || width, 0.02, M.line, 0.02, false);
    }
}


// ---------------------------------------------------------------- building floor and zones
const zones = {};   // area id -> {mat, frame}
const zoneMeshes = [];
for (const a of L.AREAS) {
    const [x, y, w, d] = a.zone;
    const color = new THREE.Color(a.color);
    const mat = std(color, 0.8, 0, {emissive: color, emissiveIntensity: 0, toneMapped: false});   // the exact zone colour
    let hit;
    if (a.ext) {        // building: the building itself is clickable (invisible box around it)
        hit = block(x, y, w, d, 6, std("#FFFFFF", 1, 0, {transparent: true, opacity: 0, depthWrite: false}), 0, false);
    } else {
        hit = block(x, y, w, d, 0.05, mat, 0.01, false);
    }
    hit.userData.area = a.id;
    zoneMeshes.push(hit);
    // white highlight frame (hover / selection)
    const hi = std("#FFFFFF", 0.4, 0, {emissive: "#FFFFFF", emissiveIntensity: 0.7});
    const frame = [];
    const t = 4;
    for (const [fx, fy, fw, fd] of [[x, y, w, t], [x, y + d - t, w, t], [x, y, t, d], [x + w - t, y, t, d]]) {
        const f = block(fx, fy, fw, fd, 0.1, hi, 0.03, false);
        f.visible = false;
        frame.push(f);
    }
    zones[a.id] = {mat, frame};
}
// white lines between the zones
paint(218, 80, 598, 80, 0, 0, 2);
paint(258, 290, 598, 290, 0, 0, 2);
paint(258, 580, 598, 580, 0, 0, 2);

// ---------------------------------------------------------------- white fence with posts, doors
const FENCE_H = 1.1, POST_H = 1.5, POST_STEP = 40;

// fence along one axis-parallel line, gaps = [[from, to], …] along that line (floor units)
function fence(x1, y1, x2, y2, gaps = [], h = FENCE_H, posts = true) {
    const horiz = y1 === y2, a = Math.min(horiz ? x1 : y1, horiz ? x2 : y2), b = Math.max(horiz ? x1 : y1, horiz ? x2 : y2);
    const seg = (p, q) => horiz ? block(p, y1 - 1.5, q - p, 3, h, M.fence) : block(x1 - 1.5, p, 3, q - p, h, M.fence);
    let p = a;
    for (const [g0, g1] of [...gaps].sort((u, v) => u[0] - v[0])) {
        if (g0 > p) seg(p, g0);
        p = g1;
    }
    if (b > p) seg(p, b);
    if (!posts) return;
    const inGap = (v) => gaps.some(([g0, g1]) => v > g0 - 3 && v < g1 + 3);
    for (let v = a; v <= b + 0.1; v += (b - a) / Math.max(1, Math.round((b - a) / POST_STEP))) {
        if (inGap(v)) continue;
        const [px, py] = horiz ? [v, y1] : [x1, v];
        block(px - 3, py - 3, 6, 6, POST_H, M.post);
    }
}

// chevron on the floor pointing in direction ang (0 = east)
const CHEV = new THREE.ShapeGeometry(new THREE.Shape([[0, 0], [-0.55, 0.6], [-0.95, 0.6], [-0.4, 0], [-0.95, -0.6], [-0.55, -0.6]].map(([x, y]) => new THREE.Vector2(x, y))));

function chevron(x, y, ang) {
    const m = mesh(CHEV, M.white, false);
    m.rotation.set(-Math.PI / 2, 0, ang);
    m.position.set(wx(x), 0.08, wz(y));
    scene.add(m);
}

// door in a west wall at x, opening from y to y + 30: small grey door house outside, « on the floor
function westDoor(x, y) {
    block(x - 24, y - 2, 22, 34, 2.4, M.door);
    block(x - 26, y - 4, 26, 38, 0.2, M.doorTop, 2.4);
    block(x - 25, y + 6, 1, 18, 1.9, std("#7E8893", 0.5, 0.3));
    chevron(x - 40, y + 15, Math.PI);
    chevron(x - 50, y + 15, Math.PI);
}

const DOCKS = [45, 110, 175, 240];   // truck lanes (y of the centre)
// upper block: Sorting / Traymaster / Support + Incom. / Outg. WHS, dock openings on the west side
fence(216, 0, 600, 0);
// One continuous west boundary: keep it straight instead of following the old stepped outline.
// Outer perimeter of the upper block + Picking L-shape:
// right edge of the upper block, then the top and left edge of Picking.
fence(600, 0, 600, 290, DOCKS.map((y) => [y - 17, y + 17]), 1.35);
fence(216, 290, 216, 580, [[352, 382]], 1.35);
// Main WHS – PMT outer edge: step left at the top, then continue down its west side.
fence(-60, 580, 216, 580, [], 1.35);
fence(-60, 580, -60, 920, [[628, 658], [770, 800]], 1.35);
// Main WHS – Production Material Transport bottom and east edge.
fence(-60, 920, 600, 920);
fence(600, 0, 600, 920, [[640, 670]]);
// Repack / Kitting room next to the transport hall
fence(604, 588, 702, 588);
fence(702, 588, 702, 862);
fence(604, 862, 702, 862);
// low dividers between Sorting / Traymaster / Support
fence(346, 0, 346, 80, [], 0.5, false);
fence(476, 0, 476, 80, [], 0.5, false);
westDoor(-60, 628);
westDoor(-60, 770);

// green arrows: deliveries from the trucks into the building
for (const y of DOCKS) floorShape([[198, y - 4], [214, y - 4], [214, y - 10], [232, y], [214, y + 10], [214, y + 4], [198, y + 4]], M.green, 0.09);

// ---------------------------------------------------------------- Hall 21: external building
{
    const HX = -250, HY = 10, HW = 140, HD = 160, HH = 4.2, PITCH = 24 * Math.PI / 180;
    const X0 = wx(HX), X1 = wx(HX + HW), Z0 = wz(HY), Z1 = wz(HY + HD);
    block(HX - 14, HY - 10, HW + 28, HD + 46, 0.04, std("#9EA3A8", 0.9), 0, false);   // concrete pad
    wbox(X0, X1, Z0, Z1, 0.6, std("#7C848D", 0.8));                               // plinth
    wbox(X0, X1, Z0, Z1, HH - 0.6, std("#D9DDE2", 0.75), 0.6);                   // walls
    // gable roof, ridge north – south
    const half = (X1 - X0) / 2 + 0.4, rise = half * Math.tan(PITCH);
    const roofShape = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
    const roof = mesh(new THREE.ExtrudeGeometry(roofShape, {depth: Z1 - Z0 + 1, bevelEnabled: false}), std("#5E646C", 0.7, 0.15));
    roof.position.set((X0 + X1) / 2, HH, Z0 - 0.5);
    scene.add(roof);
    // south face: wide door with a light above it
    wbox(wx(HX + 50), wx(HX + 90), Z1, Z1 + 0.08, 3, std("#B4BDC7", 0.5, 0.4));
    wbox(wx(HX + 48), wx(HX + 92), Z1, Z1 + 0.15, 0.25, M.frame, 3);
    wbox(wx(HX + 66), wx(HX + 74), Z1, Z1 + 0.25, 0.25, std("#FFB347", 0.4, 0, {emissive: "#FF9A1F", emissiveIntensity: 1.2}), 3.3, false);
    paint(HX - 10, HY + HD + 34, HX + HW + 10, HY + HD + 34, 0, 0, 2);
}

// ---------------------------------------------------------------- racks, cartons
const CARTON = ["#F2A33A", "#F6C46A", "#E8603F", "#F7F2E8", "#F0B455", "#F8DDA0", "#EE8A3C"];
const WOOD = ["#B9824A", "#A8743F", "#C28E57"];

// pallet rack along its longer side: dark uprights, orange beams, colourful cartons in (almost) every slot
function rack(x, y, w, d, levels = 3, H = 2.6) {
    const X0 = wx(x), X1 = wx(x + w), Z0 = wz(y), Z1 = wz(y + d);
    const alongX = X1 - X0 >= Z1 - Z0;
    const len = alongX ? X1 - X0 : Z1 - Z0, dep = alongX ? Z1 - Z0 : X1 - X0;
    const n = Math.max(1, Math.round(len / 1.1)), slot = len / n;
    // u = along the rack, v = across it
    const put = (kind, u, h, v, su, sh, sv, color) => alongX
        ? part(kind, X0 + u, h, Z0 + v, su, sh, sv, color)
        : part(kind, X0 + v, h, Z0 + u, sv, sh, su, color);
    for (let i = 0; i <= n; i++) {
        put("paint", i * slot, H / 2, 0.05, 0.09, H, 0.09, "#3D4A63");
        put("paint", i * slot, H / 2, dep - 0.05, 0.09, H, 0.09, "#3D4A63");
    }
    for (let lv = 0; lv < levels; lv++) {
        const z = 0.12 + lv * (H / levels);
        put("paint", len / 2, z, 0.05, len, 0.1, 0.07, "#F08A24");
        put("paint", len / 2, z, dep - 0.05, len, 0.1, 0.07, "#F08A24");
        for (let i = 0; i < n; i++) {
            if (rnd() < 0.06) continue;
            const cu = (i + 0.5) * slot, ch = (H / levels) * (0.55 + rnd() * 0.25);
            put("carton", cu, z + 0.1 + ch / 2, dep / 2, slot * 0.84, ch, dep * 0.86, pick(CARTON));
        }
    }
}

const palletSpots = [];   // pallets on the floor (3D model added when loaded)
function stack(x, y, w, d, H) {
    palletSpots.push([x, y, w, d]);
    const layers = Math.max(1, Math.round(H / 0.45)), lh = H / layers;
    for (let k = 0; k < layers; k++) {
        const hw = (w - 3) / 2, hd = (d - 3) / 2;   // 2 × 2 cartons per layer
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            if (k === layers - 1 && rnd() < 0.25) continue;
            sitePart("carton", x + 1 + dx * (hw + 1), y + 1 + dy * (hd + 1), hw, hd, 0.16 + k * lh, lh * 0.96, pick(CARTON.slice(0, 2).concat(["#E2B272", "#D6A867"])));
        }
    }
}

// Sorting, Traymaster: pallets of goods; Support & back-up: two small racks
stack(296, 22, 30, 30, 0.9);
stack(370, 22, 30, 30, 1.2);
stack(430, 22, 30, 30, 1.2);
rack(490, 16, 42, 18, 2, 1.6);
rack(546, 16, 42, 18, 2, 1.6);
// Incom. / Outg. WHS: two rows of six pallet places
for (let i = 0; i < 6; i++) {
    stack(240 + i * 60, 110, 30, 30, 1.3 + rnd() * 0.5);
    stack(240 + i * 60, 225, 30, 30, 1 + rnd() * 0.6);
}
// Main WHS – Picking: four storage rows, extended toward the west boundary
for (let a = 0; a < 4; a++) rack(250, 312 + a * 66, 168, 26, 3, 2.6);
for (let b = 0; b < 3; b++) rack(444 + b * 56, 304, 30, 262, 5, 3.8);
// Main WHS – Production Material Transport: two pairs of rows on each side of the main aisle
for (const ry of [600, 664, 776, 840]) {
    rack(-36, ry, 290, 32, 3, 2.6);
    rack(318, ry, 268, 32, 3, 2.6);
}
// Repack / Kitting: pallets in two columns
for (const ry of [606, 668, 730, 792]) {
    stack(620, ry, 28, 28, 1);
    stack(662, ry, 28, 28, 1.2);
}
// Hall 21: pallets at the door
stack(-238, 182, 22, 22, 0.8);
stack(-140, 182, 22, 22, 0.8);

// ---------------------------------------------------------------- forklifts (built in code)
const FL = {body: std("#F2C200", 0.45, 0.1), dark: std("#2B2F35", 0.6, 0.3), tyre: std("#15171A", 0.9), vest: std("#D4E83A", 0.7), helmet: std("#FFD21F", 0.5)};

const forklifts = [];   // groups; the 3D driver is seated in each one when the models are loaded

function forklift(px, py, rot = 0) {
    const g = new THREE.Group();
    const b = (sx, sy, sz, x, y, z, m) => {
        const o = mesh(BOX, m);
        o.scale.set(sx, sy, sz);
        o.position.set(x, y, z);
        g.add(o);
        return o;
    };
    b(1.15, 0.75, 1.7, 0, 0.62, 0, FL.body);              // body
    b(1.15, 0.55, 0.45, 0, 0.75, -0.95, FL.body);         // counterweight
    b(0.5, 0.25, 0.5, 0, 1.1, -0.15, FL.dark);            // seat
    for (const [x, z] of [[-0.48, -0.55], [0.48, -0.55], [-0.48, 0.45], [0.48, 0.45]]) b(0.06, 1.25, 0.06, x, 1.6, z, FL.dark);   // guard posts
    for (const x of [-0.48, 0.48]) b(0.06, 0.06, 1.1, x, 2.24, -0.05, FL.dark);   // guard roof: open frame, the driver shows from above
    for (const z of [-0.55, 0.45]) b(1.02, 0.06, 0.06, 0, 2.24, z, FL.dark);
    b(0.08, 2.5, 0.1, -0.36, 1.25, 0.92, FL.dark);        // mast
    b(0.08, 2.5, 0.1, 0.36, 1.25, 0.92, FL.dark);
    b(0.8, 0.1, 0.08, 0, 2.4, 0.92, FL.dark);
    b(0.1, 0.05, 1.1, -0.25, 0.12, 1.5, FL.dark);         // forks
    b(0.1, 0.05, 1.1, 0.25, 0.12, 1.5, FL.dark);
    const vest = b(0.4, 0.45, 0.28, 0, 1.45, -0.1, FL.vest);   // simple driver until the 3D person is loaded
    const head = mesh(new THREE.SphereGeometry(0.17, 12, 8), FL.helmet);
    head.position.set(0, 1.82, -0.08);
    g.add(head);
    g.userData.simpleDriver = [vest, head];
    for (const [x, z] of [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.55], [0.6, 0.55]]) {
        const w = mesh(CYL, FL.tyre);
        w.scale.set(0.3, 0.22, 0.3);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.3, z);
        g.add(w);
    }
    g.position.set(wx(px), 0, wz(py));
    g.rotation.y = rot;
    g.scale.setScalar(1.5);
    scene.add(g);
    forklifts.push(g);
}

(L.FORKLIFTS || []).forEach(({pos: [x, y], rot = 0}) => forklift(x, y, rot * Math.PI / 180));

// ---------------------------------------------------------------- floor markings: flow arrows in the aisles
function arrowHead(x, y, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), r = (u, v) => [x + u * c - v * s, y + u * s + v * c];
    floorShape([r(0, 0), r(-9, 5), r(-9, -5)], M.white, 0.09);
}

function arrow(x1, y1, x2, y2) {
    paint(x1, y1, x2, y2, 0, 0, 2);
    arrowHead(x2, y2, Math.atan2(y2 - y1, x2 - x1));
}


// ---------------------------------------------------------------- label pins and posts
// the HTML label sits on top of a thin white post; the post stands on a pin at the label point
const labelAnchors = {};   // area id -> Vector3 of the label centre
for (const a of L.AREAS) {
    const [lx, ly] = a.label, h = 1 + (a.stem || 40) * 0.2;
    const px = wx(lx), pz = wz(ly);
    const post = mesh(CYL, M.white, false);
    post.scale.set(0.07, h, 0.07);
    post.position.set(px, h / 2, pz);
    scene.add(post);
    const pin = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20), std("#FFFFFF", 0.4), false);
    pin.position.set(px, 0.1, pz);
    scene.add(pin);
    const ring = mesh(new THREE.TorusGeometry(0.45, 0.08, 8, 24), std(a.color), false);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px, 0.17, pz);
    scene.add(ring);
    labelAnchors[a.id] = new THREE.Vector3(px, h, pz);
}

flushBatches();

// ---------------------------------------------------------------- HTML layer: labels and badges
function add(parent, cls, style = "", tag = "div") {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.setAttribute("style", style);
    parent.appendChild(el);
    return el;
}

const labels = {};   // area id -> {anchor, btn, dot, name, count, area}
for (const a of L.AREAS) {
    const anchor = add(overlay, "im-anchor");
    const btn = add(anchor, "wl-label im-label", "", "button");
    btn.type = "button";
    btn.dataset.area = a.id;
    btn.innerHTML = '<span class="wl-dot"></span><span class="wl-name"></span><span class="count"></span>';
    labels[a.id] = {anchor, btn, dot: btn.children[0], name: btn.children[1], count: btn.children[2], area: a};
}

const ICON_PERSON = '<svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.3 5.4a3.7 3.7 0 0 1 7.4 0z" fill="#FFD24A" stroke="#7A5A00" stroke-width="0.5"/><path d="M7.4 1.9h1.2v3.3H7.4z" fill="#E0B020"/><rect x="3.2" y="5.2" width="9.6" height="1.3" rx="0.65" fill="#FFD24A" stroke="#7A5A00" stroke-width="0.5"/><circle cx="8" cy="8.3" r="1.9" fill="#FFFFFF"/><path d="M3 15.2c.4-2.8 2.4-4.4 5-4.4s4.6 1.6 5 4.4z" fill="#FFFFFF"/><path d="M6.2 11.1l1.8 2.2 1.8-2.2" fill="none" stroke="#FF8A1F" stroke-width="0.9" stroke-linejoin="round"/></svg>';
const ICON_FORKLIFT = '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><rect x="17" y="3" width="2.8" height="15.5" rx="0.6" fill="#FFFFFF"/><rect x="17" y="17" width="6.5" height="2.2" rx="0.6" fill="#FFFFFF"/><path d="M4.4 12V5.2h8.4V12" fill="none" stroke="#FFFFFF" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.5 8.4a2.1 2.1 0 0 1 4.2 0z" fill="#FFD24A"/><circle cx="8.6" cy="9.4" r="1.6" fill="#FFFFFF"/><rect x="2.5" y="11.6" width="13" height="6.6" rx="1.2" fill="#FFFFFF"/><circle cx="6.2" cy="19.4" r="2.7" fill="#173B27" stroke="#FFFFFF" stroke-width="1.5"/><circle cx="13" cy="19.4" r="2.7" fill="#173B27" stroke="#FFFFFF" stroke-width="1.5"/></svg>';

// the same pictograms in the map legend (index.html)
document.querySelectorAll("[data-legend-icon]").forEach((el) => {
    el.innerHTML = el.dataset.legendIcon === "forklift" ? ICON_FORKLIFT : ICON_PERSON;
});

// people / forklifts of a report line: status ring on the floor, white ring when pointed at, invisible
// cylinder around them that takes the hover and the click
const pics = {};   // row id -> {ring, halo, at: Vector3}
const rowMeshes = [];
const HIT = std("#FFFFFF", 1, 0, {transparent: true, opacity: 0, depthWrite: false});
[...(L.WORKERS || []).map((w) => ({...w, lift: false})), ...(L.FORKLIFTS || []).map((f) => ({...f, lift: true}))]
    .forEach(({row, pos: [x, y], lift}) => {
        const r = lift ? 2.5 : 1.6, X = wx(x), Z = wz(y);
        const ring = mesh(new THREE.RingGeometry(r * 0.72, r, 40), std(STATUS_COLOR.none, 0.5, 0, {emissive: STATUS_COLOR.none, emissiveIntensity: 0.5}), false);
        const halo = mesh(new THREE.RingGeometry(r * 1.05, r * 1.3, 40), M.white, false);
        for (const m of [ring, halo]) {
            m.rotation.x = -Math.PI / 2;
            m.position.set(X, 0.11, Z);
            scene.add(m);
        }
        halo.visible = false;
        const hit = mesh(CYL, HIT, false);
        hit.scale.set(r, lift ? 4 : 3.8, r);
        hit.position.set(X, hit.scale.y / 2, Z);
        hit.userData.row = row;
        scene.add(hit);
        rowMeshes.push(hit);
        pics[row] = {ring, halo, at: new THREE.Vector3(X, 1.8, Z)};
    });

// ---------------------------------------------------------------- 3D models (loaded in the background)
const loader = new GLTFLoader();
const load = (file) => loader.loadAsync(MODELS + file).catch((err) => {
    console.warn("3D model not loaded:", file, err);
    return null;
});

// scale a model to the given size (metres); keep = scale the other axes by the same factor
function measure(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => o.isSkinnedMesh && o.skeleton.update());   // posed people: bones first, then the box
    return new THREE.Box3().setFromObject(obj, true);
}

function fitModel(obj, {w, h, d, keep = true}) {
    const size = measure(obj).getSize(new THREE.Vector3());
    if (keep) obj.scale.multiplyScalar(h ? h / size.y : w ? w / size.x : d / size.z);
    else obj.scale.set((w || size.x) / size.x * obj.scale.x, (h || size.y) / size.y * obj.scale.y, (d || size.z) / size.z * obj.scale.z);
    const b2 = measure(obj), c = b2.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    obj.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
    holder.add(obj);
    return holder;
}

function shadows(obj) {
    obj.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = o.receiveShadow = true;
            if (o.isSkinnedMesh) o.frustumCulled = false;
        }
    });
    return obj;
}


// trucks at the loading docks: blue cab to the west, white trailer backed up to the dock (built in code)
{
    const CAB = std("#2F78F0", 0.45, 0.2), CAB_DARK = std("#1E4FB0", 0.5, 0.2), TRAILER = std("#F7F8FA", 0.5), GLASS = std("#1B2A44", 0.2, 0.3);
    const TYRE = std("#15171A", 0.9), STRIPE = std("#9AA3AD", 0.6);
    for (const y of DOCKS) {
        block(28, y - 16, 28, 32, 3.1, CAB, 0.5);                // cab
        block(28, y - 17, 28, 34, 0.5, CAB_DARK, 0.25);          // bumper / step
        block(27, y - 13, 1.2, 26, 1.1, GLASS, 2);               // windshield
        block(34, y - 15, 18, 30, 0.4, CAB_DARK, 3.6);           // roof deflector
        block(58, y - 17, 140, 34, 3.6, TRAILER, 0.7);           // trailer
        block(58, y + 17, 140, 0.4, 0.25, STRIPE, 0.9, false);   // side stripe
        block(56, y - 6, 4, 12, 0.6, std("#2B3440"), 0.4);       // coupling
        for (const x of [36, 50, 160, 176, 190]) for (const s of [-1, 1]) {
            const w = mesh(CYL, TYRE);
            w.scale.set(0.5, 0.4, 0.5);
            w.rotation.x = Math.PI / 2;
            w.position.set(wx(x), 0.5, wz(y + s * 15.5));
            scene.add(w);
        }
    }
}

async function loadModels() {
    const [wa, wb, pallet, boxes] = await Promise.all([
        load("worker-a.glb"), load("worker-b.glb"), load("pallet.glb"), load("boxes.glb")]);

    // people: every person is a report line and stands on its floor ring (the transport people drive the forklifts)
    const people = [wa, wb].filter(Boolean);
    const person = (i, h) => {
        const src = people[i % people.length];
        const body = shadows(SkeletonUtils.clone(src.scene));
        const clip = src.animations.find((c) => /Idle$/.test(c.name)) || src.animations[0];
        if (clip) {
            const mixer = new THREE.AnimationMixer(body);
            mixer.clipAction(clip).play();
            mixer.update(rnd() * 2);   // a still idle pose (the map is not animated)
        }
        return fitModel(body, {h});
    };
    if (people.length) {
        (L.WORKERS || []).map((w) => w.pos).forEach(([x, y], i) => {
            const p = person(i, 3.4);   // a bit larger than life, so people read from above
            p.position.set(wx(x), 0, wz(y));
            p.rotation.y = (rnd() - 0.5) * 1.6;
            scene.add(p);
        });
        // drivers sit on the forklifts: hips on the seat, legs inside the body of the forklift
        forklifts.forEach((g, i) => {
            const d = person(i + 1, 1.75);
            d.position.set(0, 0.32, -0.12);
            g.add(d);
            g.userData.simpleDriver.forEach((o) => (o.visible = false));
        });
    }
    // wooden pallets under the floor stacks
    if (pallet) {
        for (const [x, y, w, d] of palletSpots) {
            const p = fitModel(shadows(pallet.scene.clone()), {w: w * S, h: 0.16, d: d * S, keep: false});
            p.position.set(wx(x + w / 2), 0, wz(y + d / 2));
            scene.add(p);
        }
    }
    // cardboard boxes by the doors
    if (boxes) {
        [[232, 278], [580, 278]].forEach(([x, y]) => {
            const p = fitModel(shadows(boxes.scene.clone()), {h: 0.9});
            p.position.set(wx(x), 0, wz(y));
            p.rotation.y = rnd() * Math.PI;
            scene.add(p);
        });
    }
    requestRender();
}

// ---------------------------------------------------------------- fit + render
let pending = false;

function requestRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
        pending = false;
        renderer.render(scene, camera);
    });
}

const tmp = new THREE.Vector3();

function toScreen(v) {
    tmp.copy(v).project(camera);
    return [(tmp.x + 1) / 2 * host.clientWidth, (1 - tmp.y) / 2 * host.clientHeight];
}

function placeOverlay() {
    const [lx] = toScreen(new THREE.Vector3(wx(0), 0, 0)), [rx] = toScreen(new THREE.Vector3(wx(100), 0, 0));
    const k = (rx - lx) / 100;   // screen px per floor unit
    overlay.style.setProperty("--ui", Math.min(Math.max(k * 1.05, 0.7), 1.1).toFixed(3));
    for (const [id, l] of Object.entries(labels)) {
        const [x, y] = toScreen(labelAnchors[id]);
        l.anchor.style.left = `${x.toFixed(1)}px`;
        l.anchor.style.top = `${y.toFixed(1)}px`;
        l.btn.style.setProperty("--maxw", `${((l.area.maxw || l.area.zone[2]) * k).toFixed(0)}px`);
    }
}

function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.updateMatrixWorld();
    // frame the map rectangle and the label tops in the view, centred
    const inv = camera.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const pts = [[SITE.x0, SITE.y0], [SITE.x1, SITE.y0], [SITE.x0, SITE.y1], [SITE.x1, SITE.y1]].map(([x, y]) => new THREE.Vector3(wx(x), 0, wz(y)));
    for (const v of [...pts, ...Object.values(labelAnchors).map((a) => a.clone().setY(a.y + 2))]) {
        v.applyMatrix4(inv);
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y);
        y1 = Math.max(y1, v.y);
    }
    y1 += (y1 - y0) * 0.05;   // room for the labels above their posts
    y0 -= (y1 - y0) * 0.04;   // a little extra breathing room below the warehouse
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    if (hw / hh > w / h) hh = hw / (w / h);
    else hw = hh * (w / h);
    hw /= MAP_ZOOM * 1.11;
    hh = (hh / MAP_ZOOM) * 1.06;
    Object.assign(camera, {left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh});
    camera.updateProjectionMatrix();
    placeOverlay();
    requestRender();
}

new ResizeObserver(fit).observe(host);
fit();

// ---------------------------------------------------------------- interaction
let hovered = null, selected = null;
let hoveredRow = null;
let linked = {area: null, row: null};   // area / person pointed at from the Shift report

function applyStyles() {
    for (const [id, z] of Object.entries(zones)) {
        const lit = id === hovered || id === linked.area, sel = id === selected;
        z.mat.emissiveIntensity = sel ? 0.28 : lit ? 0.18 : 0;
        z.frame.forEach((f) => (f.visible = lit || sel));
    }
    for (const [id, l] of Object.entries(labels)) l.btn.classList.toggle("hover", id === hovered || id === linked.area);
    for (const [row, p] of Object.entries(pics)) p.halo.visible = row === linked.row || row === hoveredRow;
    requestRender();
}

function setHovered(areaId) {
    if (areaId === hovered) return;
    hovered = areaId;
    applyStyles();
    document.dispatchEvent(new CustomEvent("area-hover", {detail: areaId}));
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

function hitAt(e, objects, key) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objects, false)[0]?.object.userData[key] || null;
}

// what is under the pointer: {row} for a person / forklift of a report line, else {area}
function under(e) {
    const label = e.target.closest("[data-area]");
    if (label) return {area: label.dataset.area};
    if (e.target !== renderer.domElement) return {};
    const row = hitAt(e, rowMeshes, "row");
    return row ? {row} : {area: hitAt(e, zoneMeshes, "area")};
}

host.addEventListener("pointermove", (e) => {
    const {row = null, area = null} = under(e);
    if (row !== hoveredRow) {
        hoveredRow = row;
        applyStyles();
    }
    setHovered(area);
    renderer.domElement.style.cursor = row || area ? "pointer" : "";
    const r = host.getBoundingClientRect();
    document.dispatchEvent(new CustomEvent("worker-hover", {
        detail: row ? {row, x: e.clientX - r.left, y: e.clientY - r.top} : null
    }));
});
host.addEventListener("pointerleave", () => {
    hoveredRow = null;
    setHovered(null);
    applyStyles();
    document.dispatchEvent(new CustomEvent("worker-hover", {detail: null}));
});
host.addEventListener("click", (e) => {
    const {row, area} = under(e);
    if (row) return document.dispatchEvent(new CustomEvent("worker-click", {detail: {row}}));
    if (area) document.dispatchEvent(new CustomEvent("area-click", {detail: area}));
});

// ---------------------------------------------------------------- public API
window.Scene3D = {
    setAreas(data) {
        for (const [id, d] of Object.entries(data)) {
            const l = labels[id];
            if (!l) continue;
            l.dot.style.background = STATUS_COLOR[d.status] || STATUS_COLOR.none;
            l.name.textContent = d.label;
            l.btn.title = d.label;
            l.count.textContent = "";
            l.btn.classList.toggle("selected", !!d.selected);
            if (d.selected) selected = id;
            else if (selected === id) selected = null;
        }
        applyStyles();
    },
    // colour of the floor ring under the person / forklift = status of their report line
    setWorkers(statusByRow) {
        for (const [row, status] of Object.entries(statusByRow)) {
            if (!pics[row]) continue;
            const c = STATUS_COLOR[status] || STATUS_COLOR.none;
            pics[row].ring.material.color.set(c);
            pics[row].ring.material.emissive.set(c);
        }
        requestRender();
    },
    // screen position of a person / forklift, relative to the map (used by automated tests)
    workerScreenPos(row) {
        return pics[row] ? toScreen(pics[row].at) : null;
    },
    // highlight an area and / or the pictogram of a report line (hover in the Shift report)
    highlight(area = null, row = null) {
        if (linked.area === area && linked.row === row) return;
        linked = {area, row};
        applyStyles();
    },
    resetView() {
        fit();
    },
};
document.dispatchEvent(new Event("scene-ready"));
loadModels();
