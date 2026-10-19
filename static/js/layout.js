// =====================================================================================
//  WAREHOUSE LAYOUT – zones, labels and pictograms of the 3D map (static/js/scene3d.js)
// =====================================================================================
//  Coordinates are floor units of the map: the hall floor is 700 × 830 units, (0, 0) = top left
//  of the truck docks. Floor further down than y = 576 (the lower hall) is drawn at 55 % depth,
//  scene3d.js does that conversion – always give the plain floor position here.
//  The walls, trucks, racks, doors and the Hall 21 building are drawn in scene3d.js.
//
//  >>> To change what an area on the map opens, edit AREAS <<<
//     id     : any short name
//     opens  : { section: "PICK" }  -> pop-up with all report lines of that section
//              { row: "SRT" }       -> pop-up of one report line (ids from data/report_rows.csv)
//     color  : own colour of the area (floor fill) – also the left edge of its group in the Shift report
//     zone   : [x, y, w, h] floor rectangle (clickable). Picking + Production Material Transport are
//              drawn as one L-shaped blue area (main: true); for Hall 21 the building is clickable (ext: true)
//     label  : [x, y] floor point the label stands on, stem = length of its line (px)
//     count  : false = no number on the label (otherwise: number of people assigned)
//     note   : i18n key shown after the name ("Hall 21 · External")
//  Sections without a place on the map (OFF_MAP) are shown as buttons on the map.
// =====================================================================================
window.LAYOUT = {
    AREAS: [
        {id: "SORT", opens: {row: "SRT"}, color: "#8E24AA", zone: [300, 4, 96, 56], label: [345, 50], stem: 60, count: false},
        {id: "TRAY", opens: {row: "TRM"}, color: "#FB8C00", zone: [404, 4, 84, 56], label: [448, 50], stem: 104, count: false},
        {id: "SUP", opens: {section: "SUP"}, color: "#00ACC1", zone: [496, 4, 96, 56], label: [544, 50], stem: 60, count: false},
        {id: "IO", opens: {section: "IO"}, color: "#009688", zone: [216, 64, 378, 224], label: [520, 280], stem: 48},
        {id: "H21", opens: {row: "H21"}, color: "#3949AB", zone: [-250, -115, 100, 150], label: [-200, -40], stem: 98, ext: true, note: "h21_note"},
        {id: "PICK", opens: {section: "PICK"}, color: "#1E66F5", zone: [216, 294, 378, 284], label: [405, 562], stem: 60, main: true},
        {id: "TRANS", opens: {section: "TRANS"}, color: "#1E66F5", zone: [20, 578, 574, 410], label: [300, 984], stem: 40, main: true},
        {id: "RPK", opens: {row: "RPK"}, color: "#E0338A", zone: [605, 616, 86, 276], label: [640, 888], stem: 40},
    ],

    OFF_MAP: [],

    /*
      Person pictograms. Hover = name of the report line, click = pop-up of that line
      (e.g. Assembly → RM Picking, FG Putaway → choose one → scan the badge).
      The badge colour is the status of the line (green / amber / red).
        row : report line id from data/report_rows.csv
        pos : [x, y] floor position
    */
    WORKERS: [
        {row: "SHP", pos: [300, 172]},      // Incom. / Outg. WHS – Shipping
        {row: "REC", pos: [420, 262]},      //                      Receiving
        {row: "IM_P", pos: [390, 350]},     // Main WHS - Picking: IM (RM Picking, RM Delivery, FG Pick-up)
        {row: "IM_T", pos: [300, 418]},     // IM (FG Pick-up, FG Packaging) – Prod. Material Transport
        {row: "ASM_P", pos: [390, 486]},    // Assembly
        {row: "OBC_P", pos: [300, 555]},    // OBC
        {row: "EP_P", pos: [494, 410]},     // EP – RM Picking, RM Putaway          (pick racks)
        {row: "EP_T", pos: [544, 490]},     // EP – RM Delivery, FG Packaging, FG Pick-up
    ],

    // man-on-forklift pictograms just inside the transport doors (click → that report line)
    FORKLIFTS: [
        {row: "ASM_T1", pos: [80, 663]},    // west door, aisle 1
        {row: "ASM_T2", pos: [80, 863]},    // west door, aisle 3
        {row: "OBC_T", pos: [540, 663]},    // door to Repack / Kitting
    ],
};
