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
//     zone   : [x, y, w, h] floor rectangle (clickable); for Hall 21 the building is clickable (ext: true)
//     label  : [x, y] floor point the label stands on, stem = length of its line (px)
//     count  : false = no number on the label (otherwise: number of people assigned)
//     note   : i18n key shown after the name ("Hall 21 · External")
//  Sections without a place on the map (OFF_MAP) are shown as buttons on the map.
// =====================================================================================
window.LAYOUT = {
    AREAS: [
        {id: "SORT", opens: {row: "SRT"}, color: "#E5484D", zone: [212, 0, 129, 64], label: [276, 50], stem: 60, count: false},
        {id: "TRAY", opens: {row: "TRM"}, color: "#F59E0B", zone: [341, 0, 129, 64], label: [405, 50], stem: 104, count: false},
        {id: "SUP", opens: {section: "SUP"}, color: "#14B8C4", zone: [470, 0, 129, 64], label: [534, 50], stem: 60, count: false},
        {id: "IO", opens: {section: "IO"}, color: "#22A55B", zone: [216, 64, 378, 224], label: [520, 280], stem: 48},
        {id: "H21", opens: {row: "H21"}, color: "#3949AB", zone: [-220, -155, 100, 150], label: [-110, -30], stem: 18, ext: true},
        {id: "PICK", opens: {section: "PICK"}, color: "#8B5CF6", zone: [216, 294, 378, 284], label: [405, 562], stem: 60},
        {id: "TRANS", opens: {section: "TRANS"}, color: "#8B5CF6", zone: [20, 578, 574, 410], label: [300, 984], stem: 40},
        {id: "RPK", opens: {row: "RPK"}, color: "#EC4899", zone: [605, 616, 86, 276], label: [650, 660], stem: 30},
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
        {row: "SRT", pos: [258, 28]},       // Sorting
        {row: "TRM", pos: [381, 28]},       // Traymaster
        {row: "OTH", pos: [500, 28]},       // Support & back-up
        {row: "ABS", pos: [560, 28]},       // Support & back-up
        {row: "RPK", pos: [650, 760]},      // Repack / Kitting
        {row: "SHP", pos: [300, 172]},      // Incom. / Outg. WHS – Shipping
        {row: "REC", pos: [420, 262]},      //                      Receiving
        {row: "IM_P", pos: [390, 350]},     // Main WHS - Picking: IM (RM Picking, RM Delivery, FG Pick-up)
        {row: "IM_T", pos: [300, 418]},     // IM (FG Pick-up, FG Packaging) – Prod. Material Transport
        {row: "ASM_P", pos: [262, 486]},    // Assembly – left in the aisle, clear of the Main WHS – Picking label
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
