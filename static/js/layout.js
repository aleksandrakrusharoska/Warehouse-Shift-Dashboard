// =====================================================================================
//  WAREHOUSE LAYOUT – zones, labels and people of the 3D map (static/js/scene3d.js)
// =====================================================================================
//  Coordinates are floor units of the map (1 unit = 10 cm), (0, 0) = north-west corner of the
//  truck docks, x to the east, y to the south. The building, trucks, racks, doors and the
//  Hall 21 building are built in scene3d.js.
//
//  >>> To change what an area on the map opens, edit AREAS <<<
//     id     : any short name
//     opens  : { section: "PICK" }  -> pop-up with all report lines of that section
//              { row: "SRT" }       -> pop-up of one report line (ids from data/report_rows.csv)
//     color  : own colour of the area (floor colour) – also the left edge of its group in the Shift report
//     zone   : [x, y, w, h] floor rectangle (clickable); for Hall 21 the building is clickable (ext: true)
//     label  : [x, y] floor point the label stands on, stem = height of its post
//     maxw   : widest the label may get (floor units) – longer names end in "…", full name on hover
//     count  : false = no number on the label (otherwise: number of people assigned)
//     note   : i18n key shown after the name ("Hall 21 · External")
//  Sections without a place on the map (OFF_MAP) are shown as buttons on the map.
// =====================================================================================
window.LAYOUT = {
    AREAS: [
        {id: "SORT", opens: {row: "SRT"}, color: "#F0768C", zone: [218, 2, 128, 78], label: [282, 40], stem: 55, maxw: 240, count: false},
        {id: "TRAY", opens: {row: "TRM"}, color: "#F4A93E", zone: [346, 2, 130, 78], label: [411, 40], stem: 85, maxw: 240, count: false},
        {id: "SUP", opens: {section: "SUP"}, color: "#B7F34A", zone: [476, 2, 122, 78], label: [537, 40], stem: 55, maxw: 320, count: false},
        {id: "IO", opens: {section: "IO"}, color: "#4DD5DA", zone: [218, 80, 380, 208], label: [440, 190], stem: 8, maxw: 360},
        {id: "H21", opens: {row: "H21"}, color: "#3949AB", zone: [-250, 10, 140, 160], label: [-180, 70], stem: 45, maxw: 340, ext: true},
        {id: "PICK", opens: {section: "PICK"}, color: "#AE9BEA", zone: [214, 290, 384, 290], label: [400, 440], stem: 8, maxw: 360},
        {id: "TRANS", opens: {section: "TRANS"}, color: "#AE9BEA", zone: [-58, 580, 656, 338], label: [285, 736], stem: 6, maxw: 600},
        {id: "RPK", opens: {row: "RPK"}, color: "#5B9CF2", zone: [610, 592, 88, 266], label: [655, 618], stem: 60, maxw: 320},
    ],

    OFF_MAP: [],

    /*
      People of the report lines (every person on the map is one): a 3D person stands at pos, on a floor ring in the status colour of
      the line (green / amber / red). Hover = name of the line, click = pop-up of that line
      (e.g. Assembly → RM Picking, FG Putaway → choose one → scan the badge).
        row : report line id from data/report_rows.csv
        pos : [x, y] floor position
    */
    WORKERS: [
        {row: "SHP", pos: [330, 165]},      // Incom. / Outg. WHS – Shipping
        {row: "REC", pos: [500, 260]},      //                      Receiving
        {row: "IM_P", pos: [270, 400]},     // Main WHS - Picking (six people): IM (RM Picking, RM Delivery, FG Pick-up)
        {row: "IM_T", pos: [340, 358]},     // IM (FG Pick-up, FG Packaging)
        {row: "ASM_P", pos: [431, 350]},    // Assembly
        {row: "EP_P", pos: [486, 470]},     // EP – RM Picking, RM Putaway
        {row: "OBC_P", pos: [544, 400]},    // OBC
        {row: "EP_T", pos: [340, 490]},     // EP – RM Delivery, FG Packaging, FG Pick-up
        {row: "SRT", pos: [300, 58]},       // Sorting
        {row: "TRM", pos: [420, 60]},       // Traymaster
        {row: "OTH", pos: [520, 58]},       // Support & back-up – Other not-planned support actions
        {row: "ABS", pos: [574, 62]},       //                     Possible back-up
        {row: "RPK", pos: [656, 760]},      // Repack / Kitting
        {row: "H21", pos: [-188, 210]},     // Hall 21, in front of its door
    ],

    // forklifts of a report line, the driver sits on it (rot = heading in degrees, 0 = forks to the south)
    FORKLIFTS: [
        {row: "ASM_T1", pos: [285, 640], rot: 0},     // main aisle, north
        {row: "ASM_T2", pos: [285, 880], rot: 180},   // main aisle, south
        {row: "OBC_T", pos: [540, 736], rot: -90},    // aisle of the east rows
    ],
};
