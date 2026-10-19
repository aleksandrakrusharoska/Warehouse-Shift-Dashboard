// =====================================================================================
//  3D warehouse view (CSS 3D – a floor plane tilted 48°, boxes built from div faces).
//  Zones, labels and pictograms come from layout.js; walls, trucks, racks, doors and the
//  Hall 21 building are drawn below. Exposes window.Scene3D:
//    Scene3D.setAreas({ AREA_ID: { status, label, count, selected } })   – labels + selection
//    Scene3D.setWorkers({ ROW_ID: status })                              – badge colour of the pictograms
//    Scene3D.resetView()
//    Scene3D.highlight(areaId, row)                                      – link from the Shift report (null, null = off)
//  DOM events: "area-hover" (area id or null), "area-click" (area id),
//  "worker-hover" ({row, x, y} or null), "worker-click" ({row}).
// =====================================================================================
const L = window.LAYOUT;
const host = document.getElementById("scene");

const TILT = 48;
const STATUS_COLOR = {ok: "#2E8B57", warning: "#C98A12", critical: "#C8372D", none: "#8E9BAA"};
const MAIN = "#1E66F5";
const STAGE_W = 1080, STAGE_H = 760;

// the lower hall (y > 576) is drawn at 55 % depth
const K = 0.55, Y0 = 576;
const fy = (y) => (y <= Y0 ? y : Y0 + (y - Y0) * K);
const box = (x, y, w, h) => `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;`;
const rgba = (h, a) => `rgba(${parseInt(h.substr(1, 2), 16)},${parseInt(h.substr(3, 2), 16)},${parseInt(h.substr(5, 2), 16)},${a})`;
const grid = "background-color:#EAEFF4;background-image:repeating-linear-gradient(0deg,rgba(40,60,90,0.06) 0 1px,transparent 1px 36px)," +
    "repeating-linear-gradient(90deg,rgba(40,60,90,0.06) 0 1px,transparent 1px 36px);";

// ---------------------------------------------------------------- stage + floor plane
const stage = document.createElement("div");
stage.className = "wl-stage";
const plane = document.createElement("div");
plane.className = "wl-plane";
stage.appendChild(plane);
host.appendChild(stage);

let zoneTag = null;   // area id given to everything drawn while it is set (clickable)

function add(parent, style, tag = "div") {
    const el = document.createElement(tag);
    el.setAttribute("style", style);
    if (zoneTag && parent === plane) el.dataset.area = zoneTag;
    parent.appendChild(el);
    return el;
}

// ---- floors
const DOCK_D = 276;   // depth of the green truck dock (last truck ends at 261)
add(plane, box(0, 0, 212, DOCK_D) + "background:#CFE9E5;border:3px solid #009688;border-radius:4px");    // truck docks
add(plane, box(212, 0, 387, 578) + grid + "border:2px solid #8FA2B8;border-bottom:0");                  // upper hall
add(plane, box(16, 577, 583, fy(992) - 577) + grid + "border:2px solid #8FA2B8;border-top:0");          // lower hall
add(plane, box(-260, -125, 120, 192) + "background:#B9C3CE;border-radius:4px");                          // Hall 21 yard
add(plane, box(597, fy(608), 100, fy(900) - fy(608)) + grid + "border:2px solid #8FA2B8");              // repack room

// ---- zone fills (each zone clickable; hover / selection make the fill stronger)
const fills = {};   // area id -> {el, color, alpha: [normal, lit, selected]}
for (const a of L.AREAS) {
    if (a.ext || a.main) continue;
    const [x, y, w, h] = a.zone;
    zoneTag = a.id;
    const el = add(plane, box(x, fy(y), w, fy(y + h) - fy(y)) +
        `border:3px solid ${a.color};border-radius:3px;background:${rgba(a.color, 0.34)};transform:translateZ(0.5px)`);
    fills[a.id] = {el, color: a.color, alpha: [0.34, 0.52, 0.62]};
}
zoneTag = null;
// Main WHS: one seamless L-shaped area + its outline
const mTop = 294, mStep = fy(578), mBot = fy(988), mL = 20, mS = 216, mR = 594, BW = 3;
add(plane, box(mL, mTop, mR - mL, mBot - mTop) + `background:${rgba(MAIN, 0.34)};clip-path:polygon(${mS - mL}px 0,100% 0,100% 100%,0 100%,0 ${mStep - mTop}px,${mS - mL}px ${mStep - mTop}px);transform:translateZ(0.5px)`);
[[mS, mTop, mR - mS, BW], [mR - BW, mTop, BW, mBot - mTop], [mL, mBot - BW, mR - mL, BW], [mL, mStep, BW, mBot - mStep],
    [mL, mStep, mS - mL + BW, BW], [mS, mTop, BW, mStep - mTop + BW]].forEach(([x, y, w, h]) => {
    add(plane, box(x, y, w, h) + `background:${MAIN};transform:translateZ(0.6px)`);
});
// …split into Picking and Production Material Transport for clicks / hover (invisible until lit)
for (const a of L.AREAS.filter((x) => x.main)) {
    const [x, y, w, h] = a.zone;
    zoneTag = a.id;
    const el = add(plane, box(x, fy(y), w, fy(y + h) - fy(y)) + "background:transparent;transform:translateZ(0.55px)");
    fills[a.id] = {el, color: a.color, alpha: [0, 0.2, 0.3]};
}
zoneTag = null;

// ---------------------------------------------------------------- 3D boxes
function cubRaw(x, y, w, d, h, k, z = 0) {
    const line = `1px solid ${k.line};`, lift = `translateZ(${z}px) `;
    add(plane, box(x, y, h, d) + `transform-origin:0 0;transform:${lift}rotateY(-90deg);background:${k.left || k.side};border:${line}`);
    add(plane, box(x + w, y, h, d) + `transform-origin:0 0;transform:${lift}rotateY(-90deg);background:${k.side};border:${line}`);
    add(plane, box(x, y + d, w, h) + `transform-origin:0 0;transform:${lift}rotateX(90deg);background-color:${k.front};` +
        (k.pattern ? `background-image:${k.pattern};` : "") + (k.extra || "") + `border:${line}`);
    add(plane, box(x, y, w, d) + `transform:translateZ(${z + h}px);background:${k.top};border:${line}`);
}

function cub(x, y, w, d, h, k, z) {
    const y1 = fy(y);
    cubRaw(x, y1, w, fy(y + d) - y1, h, k, z);
}

const RACK = {top: "#F4F6F9", front: "#CDD6E0", side: "#B8C3CF", line: "#8E9BAA", pattern: "repeating-linear-gradient(180deg,transparent 0 11px,rgba(90,105,125,0.4) 11px 12px)"};
const PAL = {top: "#D29A62", front: "#B07843", side: "#956236", line: "#76502C"};
const TYRE = {top: "#2B2F35", front: "#1F2328", side: "#1A1D21", line: "#0E1013"};
const METAL = {top: "#9AA6B2", front: "#7D8995", side: "#6B7682", line: "#4E5966"};
const MACH = {top: "#C7CFD8", front: "#9AA6B2", side: "#86929F", line: "#5E6C7B"};
const TRAY = {top: "#7CC08F", front: "#4E9A64", side: "#3F8454", line: "#2E6A40"};
const BIN = {top: "#F0A35C", front: "#D9823A", side: "#C2702E", line: "#9A5520"};
const TABLE = {top: "#D6DCE3", front: "#A9B4BF", side: "#98A3AE", line: "#6E7A86"};
const WALL = {top: "rgba(110,130,200,0.55)", front: "rgba(130,150,215,0.16)", side: "rgba(130,150,215,0.16)", line: "rgba(100,120,190,0.6)"};
const FRAME = {top: "#2B3440", front: "#36414F", side: "#2B3440", line: "#1B222B"};

// walls (back and sides only)
cub(212, 0, 387, 3, 44, WALL);
cub(596, 0, 3, 992, 44, WALL);
cub(212, 292, 3, 286, 44, WALL);
cub(16, 576, 196, 3, 44, WALL);
cub(16, 576, 3, 416, 44, WALL);
cub(212, 0, 3, 292, 44, WALL);
cub(599, 608, 98, 3, 44, WALL);    // repack / kitting room
cub(694, 608, 3, 292, 44, WALL);

// trucks at the loading docks: cab-over tractor (front to the left) + box trailer backed up to the dock
const TRAILER = {
    top: "#F7F9FB",
    front: "#F2F5F8",   // long side towards the viewer: smooth white with a blue stripe at the bottom
    pattern: "linear-gradient(180deg,transparent 0 10%,#1E66F5 10% 18%,transparent 18%)",   // side faces stand up from the floor: 0 % = bottom
    left: "#D3D9E0",    // front wall of the trailer
    side: "linear-gradient(180deg,#C9D0D8 0 48%,#7D8995 48% 52%,#C9D0D8 52%)",   // rear doors (dock side)
    line: "#8C97A3"
};
const CAB_LOW = {   // lower cab: grille + bumper at the front, fuel tank on the side
    top: "#2F56BF", front: "#284CAD", side: "#21418F", line: "#1D3A85",
    left: "linear-gradient(90deg,#AEB8C3 0 30%,#16223A 30% 100%)",
    pattern: "linear-gradient(180deg,transparent 0 35%,#CDD5DE 35% 80%,transparent 80%)",
    extra: "background-size:34% 100%;background-position:85% 0;background-repeat:no-repeat;"
};
const CAB_HIGH = {  // cabin: windshield at the front, side window + door line
    top: "linear-gradient(90deg,#4C75E8,#3B63D8)", front: "#2F56BF", side: "#26489F", line: "#1D3A85",
    left: "linear-gradient(90deg,#26489F 0 30%,#16223A 30% 88%,#26489F 88%)",
    pattern: "linear-gradient(180deg,transparent 0 8%,#1B2A44 8% 50%,transparent 50%)," +
        "linear-gradient(90deg,transparent 0 96%,#1D3A85 96% 100%)",
    extra: "background-size:58% 100%,100% 100%;background-position:25% 0,0 0;background-repeat:no-repeat;"
};
const DEFLECTOR = {top: "#4C75E8", front: "#3B63D8", side: "#2F56BF", left: "#2F56BF", line: "#1D3A85"};
const CHROME = {top: "#E2E8EF", front: "#B8C2CD", side: "#9AA6B2", line: "#6B7682"};

// round wheel standing on the visible long side of the truck (y = that side)
function wheel(cx, y, dia) {
    add(plane, box(cx - dia / 2, fy(y) + 0.6, dia, dia) + "transform-origin:0 0;transform:rotateX(90deg);border-radius:50%;" +
        "background:radial-gradient(circle,#E2E8EF 0 16%,#7D8995 18% 30%,#23272D 33% 100%);border:1px solid #0E1013");
}

// 4 lanes, equally spaced (68); the dock floor ends a short way below the last truck (DOCK_D)
[0, 1, 2, 3].map((i) => 31 + i * 68).forEach((y) => {
    const d = 26, kz = 1;      // truck width on the floor, height factor
    const tc = (x, dy, w, dd, h, k, z = 0) => cub(x, y + dy, w, dd, h * kz, k, z * kz);
    add(plane, box(0, fy(y) - 1, 190, d + 6) + "background:rgba(20,30,50,0.2);border-radius:6px;filter:blur(2px);transform:translateZ(0.3px)");   // shadow
    tc(6, 4, 178, d - 8, 4, METAL, 6);                       // chassis
    tc(8, 2, 12, d - 4, 9, TYRE);                            // axles (dark, between the wheels)
    tc(34, 2, 14, d - 4, 9, TYRE);
    tc(140, 2, 36, d - 4, 9, TYRE);
    tc(46, 0, 138, d, 32, TRAILER, 10);                      // trailer box
    tc(62, 3, 3, 3, 10, METAL);                              // landing legs
    tc(62, d - 6, 3, 3, 10, METAL);
    tc(4, 1, 30, d - 2, 12, CAB_LOW, 6);                     // lower cab, grille, bumper
    tc(6, 1, 26, d - 2, 22, CAB_HIGH, 18);                   // cabin
    tc(12, 3, 18, d - 6, 4, DEFLECTOR, 40);                  // roof deflector
    tc(33, d - 6, 2, 2, 24, CHROME, 14);                     // exhaust stack
    tc(8, d - 1, 2, 3, 6, CHROME, 27);                       // mirror
    [[14, y + d - 1], [41, y + d - 1], [150, y + d], [166, y + d]].forEach(([cx, wy]) => wheel(cx, wy, 11 * kz));
});

// sorting line, traymaster
zoneTag = "SORT";
cub(306, 20, 80, 10, 8, MACH);
for (let s = 0; s < 4; s++) cub(310 + s * 19, 34, 14, 12, 10, BIN);
zoneTag = "TRAY";
cub(430, 16, 34, 20, 24, TRAY);

// incoming / outgoing pallets
zoneTag = "IO";
for (let i = 0; i < 5; i++) {
    cub(250 + i * 44, 110, 30, 30, 22, PAL);
    cub(250 + i * 44, 205, 30, 30, 22, PAL);
}
cub(490, 205, 30, 30, 22, PAL);
cub(534, 205, 30, 30, 22, PAL);
zoneTag = null;

// ---------------------------------------------------------------- doors (frame, steel door with glass, swing arc, « » arrows)
const floorFx = [];
const GLASSPANE = "#B9D6F5";
const SIDEWIN = `linear-gradient(90deg,transparent 56%,${GLASSPANE} 56% 82%,transparent 82%) center/100% 46% no-repeat,#4F6A8A`;
const DOORS = {top: "#4F6A8A", front: "#45607F", side: SIDEWIN, left: SIDEWIN, line: "#22364D"};
const DOORF = {
    top: "#4F6A8A", front: "#4F6A8A", side: "#45607F", line: "#22364D",
    pattern: `linear-gradient(180deg,transparent 0 56%,${GLASSPANE} 56% 82%,transparent 82%)`,
    extra: "background-size:46% 100%;background-position:center;background-repeat:no-repeat;"
};
const apron = (x, y, w, h) => floorFx.push(box(x, y, w, h) + "background:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.9);border-radius:2px;transform:translateZ(0.8px)");
const arc = (x, y, clip) => floorFx.push(box(x - 24, y - 24, 48, 48) + `border-radius:50%;border:2px dashed #FFFFFF;clip-path:inset(${clip});transform:translateZ(1px);filter:drop-shadow(0 0 1.5px rgba(10,20,40,0.7))`);
const leaf = (x, y, w, h) => floorFx.push(box(x, y, w, h) + "background:#FFFFFF;border-radius:1px;transform:translateZ(1.2px);box-shadow:0 0 2px rgba(10,20,40,0.7)");
const chev = (cx, cy, rot) => floorFx.push(box(cx - 5, cy - 5, 10, 10) + `border-top:3px solid #FFFFFF;border-left:3px solid #FFFFFF;transform:translateZ(1.3px) rotate(${rot}deg);filter:drop-shadow(0 0 1.5px rgba(10,20,40,0.85))`);

function door(x, y, side, noArc) {
    y = fy(y);
    if (side === "F") {
        cubRaw(x - 4, y - 2, 4, 6, 36, FRAME);
        cubRaw(x + 24, y - 2, 4, 6, 36, FRAME);
        cubRaw(x - 4, y - 2, 32, 6, 5, FRAME, 33);
        cubRaw(x, y - 1, 24, 3, 33, DOORF);
        apron(x - 6, y + 4, 36, noArc ? 12 : 26);
        if (!noArc) {
            arc(x, y + 4, "50% 0 0 50%");
            leaf(x, y + 4, 2, 24);
        }
        const off = noArc ? 22 : 36;
        chev(x + 12, y + off, -135);
        chev(x + 12, y + off + 8, -135);
    } else {
        cubRaw(x - 3, y - 4, 6, 4, 36, FRAME);
        cubRaw(x - 3, y + 24, 6, 4, 36, FRAME);
        cubRaw(x - 3, y - 4, 6, 32, 5, FRAME, 33);
        cubRaw(x - 1, y, 3, 24, 33, DOORS);
        if (side === "L") {
            apron(x - 30, y - 6, 26, 36);
            arc(x - 3, y, "50% 50% 0 0");
            leaf(x - 27, y, 24, 2);
        } else {
            apron(x + 4, y - 6, 26, 36);
            arc(x + 4, y, "50% 0 0 50%");
            leaf(x + 4, y, 24, 2);
        }
        const cy = y + 12, lo = side === "L" ? 36 : 12, ro = side === "L" ? 12 : 36;
        chev(x - lo, cy, -45);
        chev(x - lo - 8, cy, -45);
        chev(x + ro, cy, 135);
        chev(x + ro + 8, cy, 135);
    }
}

door(596, 236, "R");   // incoming / outgoing, east
door(212, 244, "L");   // main hall by the docks (apron + arrows stay on the dock floor)
door(212, 380, "L");   // main hall, west
door(16, 641, "L");    // production material transport, west (aisle 1)
door(16, 841, "L");    // production material transport, west (aisle 3)
door(596, 641, "R");   // main WHS → repack / kitting

// ---------------------------------------------------------------- Hall 21: closed external building (clickable)
zoneTag = "H21";
const PLINTH = "#56606E", ACCENT = "#F08A24", CLAD = "#E3E8ED";
const wallBands = (dir) => `linear-gradient(${dir},${PLINTH} 0 22%,transparent 22% 74%,${ACCENT} 74% 80%,transparent 80%),` +
    `repeating-linear-gradient(${dir === "180deg" ? "90deg" : "0deg"},rgba(110,122,136,0.32) 0 1px,transparent 1px 9px)`;
const SHED = {top: CLAD, front: CLAD, side: wallBands("90deg") + "," + CLAD, line: "#8C97A3", pattern: wallBands("180deg")};
const ROLL = {top: "#9AA6B2", front: "#B4BDC7", side: "#9AA6B2", line: "#5E6C7B", pattern: "repeating-linear-gradient(180deg,transparent 0 3px,rgba(70,82,96,0.55) 3px 4px)"};
const HX = -250, HY = -115, HW = 100, HD = 150, HH = 38, PITCH = 22;
cubRaw(HX, HY, HW, HD, HH, SHED);
[HY, HY + HD].forEach((gy) => {
    add(plane, box(HX, gy, HW, Math.round(HW / 2 * Math.tan(PITCH * Math.PI / 180))) +
        `transform-origin:0 0;transform:translateZ(${HH}px) rotateX(90deg);background:${CLAD};clip-path:polygon(0 0,100% 0,50% 100%)`);
});
const ov = 2, half = HW / 2 + ov, slope = half / Math.cos(PITCH * Math.PI / 180);
const RX0 = HX - ov, RY = HY - 4, RD = HD + 8;
const roofSkin = "background:repeating-linear-gradient(180deg,#4B5563 0 7px,#3F4855 7px 8px);border:1px solid #2E3540;";
add(plane, box(RX0, RY, slope, RD) + `transform-origin:0 0;transform:translateZ(${HH}px) rotateY(-${PITCH}deg);` + roofSkin);
add(plane, box(RX0 + 2 * half - slope, RY, slope, RD) + `transform-origin:100% 0;transform:translateZ(${HH}px) rotateY(${PITCH}deg);` + roofSkin);
cubRaw(HX + 9, HY + HD - 2, 34, 3, 28, ROLL);
cubRaw(HX + 7, HY + HD - 3, 38, 4, 3, FRAME, 28);
door(HX + 57, HY + HD, "F", true);
cubRaw(HX + 51, HY + HD, 36, 10, 2, FRAME, 36);
zoneTag = null;

// ---------------------------------------------------------------- racking (simplified)
zoneTag = "PICK";
for (let a = 0; a < 4; a++) cub(236, 304 + a * 68, 200, 24, 34, RACK);       // main WHS storage rows
for (let b = 0; b < 3; b++) cub(462 + b * 50, 304, 14, 262, 40, RACK);       // main WHS pick racks
zoneTag = "TRANS";
for (let c = 0; c < 4; c++) {                                                 // production material transport
    cub(40, 598 + c * 100, 360, 30, 26, RACK);
    cub(450, 598 + c * 100, 135, 30, 26, RACK);
}

// tables: support & back-up, repack / kitting
zoneTag = "SUP";
cub(508, 14, 30, 12, 12, TABLE);
cub(550, 14, 30, 12, 12, TABLE);
cub(508, 38, 30, 12, 12, TABLE);
cub(550, 38, 30, 12, 12, TABLE);
zoneTag = "RPK";
cub(677, 640, 8, 230, 6, MACH);
[700, 775, 850].forEach((ty) => cub(635, ty, 32, 30, 12, TABLE));
zoneTag = null;

// floor markings (door arcs, arrows) on top of everything on the floor
floorFx.forEach((st) => add(plane, st));

// ---------------------------------------------------------------- zone labels (stand upright on the floor)
const labels = {};   // area id -> {btn, dot, name, count, pin, area}
for (const a of L.AREAS) {
    const [ax, ay] = a.label;
    const wrap = add(plane, `position:absolute;left:${ax}px;top:${fy(ay)}px;width:0;height:0;transform-style:preserve-3d;transform:rotateX(-${TILT}deg);transform-origin:0 0`);
    const inner = add(wrap, "");
    inner.className = "wl-label-inner";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wl-label";
    btn.dataset.area = a.id;
    btn.innerHTML = '<span class="wl-dot"></span><span class="wl-name"></span><span class="count"></span>';
    inner.appendChild(btn);
    add(inner, `width:2px;height:${a.stem}px;background:#5B636B`);
    const pin = add(inner, "width:10px;height:10px;");
    pin.className = "wl-pin";
    labels[a.id] = {btn, dot: btn.children[0], name: btn.children[1], count: btn.children[2], pin, area: a};
}

// ---------------------------------------------------------------- pictograms (flat layer above the 3D scene)
// floor point → stage pixels (must match the .wl-stage / .wl-plane CSS)
function project(x, y) {
    const PL = 256, PT = 10, PCY = 415, PERSP = 3200, OX = 540, OY = STAGE_H * 0.4, t = TILT * Math.PI / 180;
    const dy = y - PCY, Y = PT + PCY + dy * Math.cos(t), Z = dy * Math.sin(t), X = PL + x, f = PERSP / (PERSP - Z);
    return {left: OX + (X - OX) * f, top: OY + (Y - OY) * f};
}

const ICON_PERSON = '<svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.3 5.4a3.7 3.7 0 0 1 7.4 0z" fill="#FFD24A" stroke="#7A5A00" stroke-width="0.5"/><path d="M7.4 1.9h1.2v3.3H7.4z" fill="#E0B020"/><rect x="3.2" y="5.2" width="9.6" height="1.3" rx="0.65" fill="#FFD24A" stroke="#7A5A00" stroke-width="0.5"/><circle cx="8" cy="8.3" r="1.9" fill="#FFFFFF"/><path d="M3 15.2c.4-2.8 2.4-4.4 5-4.4s4.6 1.6 5 4.4z" fill="#FFFFFF"/><path d="M6.2 11.1l1.8 2.2 1.8-2.2" fill="none" stroke="#FF8A1F" stroke-width="0.9" stroke-linejoin="round"/></svg>';
const ICON_FORKLIFT = '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><rect x="17" y="3" width="2.8" height="15.5" rx="0.6" fill="#FFFFFF"/><rect x="17" y="17" width="6.5" height="2.2" rx="0.6" fill="#FFFFFF"/><path d="M4.4 12V5.2h8.4V12" fill="none" stroke="#FFFFFF" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.5 8.4a2.1 2.1 0 0 1 4.2 0z" fill="#FFD24A"/><circle cx="8.6" cy="9.4" r="1.6" fill="#FFFFFF"/><rect x="2.5" y="11.6" width="13" height="6.6" rx="1.2" fill="#FFFFFF"/><circle cx="6.2" cy="19.4" r="2.7" fill="#173B27" stroke="#FFFFFF" stroke-width="1.5"/><circle cx="13" cy="19.4" r="2.7" fill="#173B27" stroke="#FFFFFF" stroke-width="1.5"/></svg>';

const pics = {};   // row id -> button
[...(L.WORKERS || []).map((w) => ({...w, lift: false})), ...(L.FORKLIFTS || []).map((f) => ({...f, lift: true}))]
    .forEach(({row, pos: [x, y], lift}) => {
        add(plane, box(x - 13, fy(y) - 6, 26, 12) + "border-radius:50%;background:rgba(20,30,50,0.28);transform:translateZ(1px)");   // floor shadow
        const p = project(x, fy(y));
        const wrap = add(stage, `position:absolute;left:${p.left.toFixed(1)}px;top:${p.top.toFixed(1)}px;width:0;height:0;z-index:5`);
        const inner = add(wrap, "");
        inner.className = "wl-pic-inner";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `wl-pic ${lift ? "forklift" : "person"}`;
        btn.dataset.row = row;
        btn.style.background = STATUS_COLOR.none;
        btn.innerHTML = lift ? ICON_FORKLIFT : ICON_PERSON;
        inner.appendChild(btn);
        pics[row] = btn;
    });

// ---------------------------------------------------------------- fit the stage into the map
// 1080 × 760 stage scaled to fit the map panel (width and height), centred
function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const s = Math.min(w / STAGE_W, h / STAGE_H, 1.6);
    stage.style.top = `${Math.round((h - STAGE_H * s) / 2)}px`;
    stage.style.transform = `translateX(-50%) scale(${s})`;
    // labels and pictograms shrink less than the scene, so they stay readable in a small panel
    stage.style.setProperty("--ui", Math.min(Math.sqrt(1 / s), 1.45).toFixed(3));
}

new ResizeObserver(fit).observe(host);
fit();

// ---------------------------------------------------------------- interaction
let hovered = null, selected = null;
let linked = {area: null, row: null};   // area / pictogram pointed at from the Shift report

function applyStyles() {
    for (const [id, f] of Object.entries(fills)) {
        const lit = id === hovered || id === linked.area;
        const alpha = id === selected ? f.alpha[2] : lit ? f.alpha[1] : f.alpha[0];
        f.el.style.background = alpha ? rgba(f.color, alpha) : "transparent";
    }
    for (const [id, l] of Object.entries(labels)) l.btn.classList.toggle("hover", id === hovered || id === linked.area);
    for (const [row, b] of Object.entries(pics)) b.classList.toggle("linked", row === linked.row);
}

function setHovered(areaId) {
    if (areaId === hovered) return;
    hovered = areaId;
    applyStyles();
    document.dispatchEvent(new CustomEvent("area-hover", {detail: areaId}));
}

stage.addEventListener("pointermove", (e) => {
    const pic = e.target.closest("[data-row]");
    setHovered(pic ? null : e.target.closest("[data-area]")?.dataset.area || null);
    const r = host.getBoundingClientRect();
    document.dispatchEvent(new CustomEvent("worker-hover", {
        detail: pic ? {row: pic.dataset.row, x: e.clientX - r.left, y: e.clientY - r.top} : null
    }));
});
stage.addEventListener("pointerleave", () => {
    setHovered(null);
    document.dispatchEvent(new CustomEvent("worker-hover", {detail: null}));
});
stage.addEventListener("click", (e) => {
    const pic = e.target.closest("[data-row]");
    if (pic) return document.dispatchEvent(new CustomEvent("worker-click", {detail: {row: pic.dataset.row}}));
    const area = e.target.closest("[data-area]");
    if (area) document.dispatchEvent(new CustomEvent("area-click", {detail: area.dataset.area}));
});

// ---------------------------------------------------------------- public API
window.Scene3D = {
    setAreas(data) {
        for (const [id, d] of Object.entries(data)) {
            const l = labels[id];
            if (!l) continue;
            const color = STATUS_COLOR[d.status] || STATUS_COLOR.none;
            l.dot.style.background = color;
            l.pin.style.border = `2px solid ${color}`;
            l.name.textContent = d.label;
            l.count.textContent = l.area.count === false || d.count == null ? "" : String(d.count);
            l.btn.classList.toggle("selected", !!d.selected);
            if (d.selected) selected = id;
            else if (selected === id) selected = null;
        }
        applyStyles();
    },
    // badge colour of the pictograms = status of their report line
    setWorkers(statusByRow) {
        for (const [row, status] of Object.entries(statusByRow)) {
            if (pics[row]) pics[row].style.background = STATUS_COLOR[status] || STATUS_COLOR.none;
        }
    },
    // screen position of a pictogram, relative to the map (used by automated tests)
    workerScreenPos(row) {
        const b = pics[row]?.getBoundingClientRect(), r = host.getBoundingClientRect();
        return b ? [b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top] : null;
    },
    // highlight an area and / or the pictogram of a report line (hover in the Shift report)
    highlight(area = null, row = null) {
        if (linked.area === area && linked.row === row) return;
        linked = {area, row};
        applyStyles();
    },
    resetView() {
    },
};
document.dispatchEvent(new Event("scene-ready"));
