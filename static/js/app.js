// WHS Shift Dashboard – plain JavaScript (no framework).
//
// Workflow of the shift leader
//   1. click an area on the 3D map (or a section on the right)       -> pop-up: report lines of that section
//   2. click a line, e.g. "IM – FG Pick-up & FG Packaging"           -> its tasks
//   3. click a task, e.g. "FG Pick-up"                                -> status + scan box
//   4. scan the employee's badge                                      -> assigned (only with ILU level L or U)
//      The report columns "Actual Distribution" and "Employees" fill automatically.
const state = {team: null, ov: null, att: null, flow: [], pages: {}, flash: null, feedback: null};
const REFRESH_MS = 5000;
const PAGE_SIZE = {iluEmp: 8};
let staffingChart = null;
let attendanceChart = null;
let capacityChart = null;
let workedTimeChart = null;

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));
const fmt = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1));
const hhmm = (iso) => (iso ? iso.slice(11, 16) : "");
const hhmmss = (iso) => (iso ? iso.slice(11, 19) : "");
const initials = (name) => name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const lvlPill = (l) => `<span class="lvl lvl-${l || "none"}">${l || "–"}</span>`;
const statusPill = (st, big = false) => (st && st !== "none" && st !== "inactive"
    ? `<span class="pill st-${st} ${big ? "pill-lg" : ""}"><i class="dot"></i>${esc(t(`st_${st}`))}</span>` : "");
const reportStatus = (st) => (st && st !== "none" && st !== "inactive"
    ? `<span class="rp-status-text"><i class="dot st-${st}"></i>${esc(t(`st_${st}`))}</span>` : "");

function duration(seconds = 0) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function workStatusLabel(status) {
    const labels = {
        WORKING: "Working",
        ON_BREAK: "On break",
        FINISHED: "Finished shift",
        NOT_STARTED: "Not started"
    };

    return labels[status] || "Unknown";
}

function workStatusClass(status) {
    const classes = {
        WORKING: "working",
        ON_BREAK: "break",
        FINISHED: "finished",
        NOT_STARTED: "not-started"
    };

    return classes[status] || "not-started";
}

function workStatusText(status) {
    const labels = {
        WORKING: "Working",
        ON_BREAK: "On break",
        FINISHED: "Finished shift",
        NOT_STARTED: "Not started"
    };

    return labels[status] || "Unknown";
}

async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: {"Content-Type": "application/json"},
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || res.statusText);
    return data;
}

const withTeam = (url) => (state.team ? url + (url.includes("?") ? "&" : "?") + "team=" + state.team : url);

function toast(msg, kind = "ok") {
    $("toast").className = `toast x-toast ${kind}`;
    $("toastBody").textContent = msg;
    bootstrap.Toast.getOrCreateInstance($("toast"), {delay: 2800}).show();
}

// names in the current language
const rowLabel = (row) => rowName({name: row.label});
const tName = (task) => taskName(task);
// tasks of a line; empty when they only repeat the line name (Receiving (Receiving) → Receiving)
const rowTasksText = (row) => {
    const tasks = row.tasks.map(tName).join(", ");
    return tasks.trim().toLowerCase() === rowLabel(row).trim().toLowerCase() ? "" : tasks;
};
const rowDisplay = (row) => {
    const tasks = rowTasksText(row);
    return tasks ? `${rowLabel(row)} (${tasks})` : rowLabel(row);
};
// ---------------------------------------------------------------- data lookups
const sections = () => state.ov?.sections || [];
const findSection = (code) => sections().find((s) => s.code === code);

function findRow(id) {
    for (const s of sections()) {
        const r = s.rows.find((x) => x.id === id);
        if (r) return {row: r, section: s};
    }
    return {};
}

function findTask(id) {
    for (const s of sections()) for (const r of s.rows) {
        const tk = r.tasks.find((x) => x.id === id);
        if (tk) return {task: tk, row: r, section: s};
    }
    return {};
}

// own colour of an area / section / line (layout.js) – used on the map and in the Shift report
function sectionColor(code) {
    return allAreas().find((a) => a.opens.section === code)?.color || "#6f9bd1";
}

function rowColor(rowId) {
    const own = allAreas().find((a) => a.opens.row === rowId);
    if (own) return own.color;
    const {section} = findRow(rowId);
    return section ? sectionColor(section.code) : "#6f9bd1";
}

const allAreas = () => [...LAYOUT.AREAS, ...LAYOUT.OFF_MAP];

function areaInfo(a) {
    if (a.opens.section) {
        const s = findSection(a.opens.section);
        return s && {name: sectionName(s), status: s.status, count: s.actual};
    }
    const {row} = findRow(a.opens.row);
    return row && {name: rowLabel(row), status: row.status, count: row.actual};
}

// ---------------------------------------------------------------- 3D map + side panel
function updateScene() {
    if (!window.Scene3D || !state.ov) return;
    const root = state.flow[0];
    const data = {};
    for (const a of LAYOUT.AREAS) {
        const info = areaInfo(a);
        if (!info) continue;
        const sel = root && ((a.opens.section && root.type === "section" && root.id === a.opens.section) ||
            (a.opens.row && root.rowId === a.opens.row));
        // label: "Hall 21 · External  4" – name, optional note, number of people assigned
        const name = info.name.replace(/ - /g, " – ");   // "Main WHS – Picking" (en dash on the map)
        data[a.id] = {status: info.status, label: a.note ? `${name} · ${t(a.note)}` : name, count: info.count, selected: !!sel};
    }
    Scene3D.setAreas(data);

    // badge colour of the pictograms = STATUS of their report line (green / amber / red)
    const workers = {};
    const rows = [...(LAYOUT.WORKERS || []), ...(LAYOUT.FORKLIFTS || [])].map((w) => w.row);
    for (const r of rows) workers[r] = findRow(r).row?.status || "none";
    Scene3D.setWorkers?.(workers);
}

document.addEventListener("scene-ready", updateScene);
document.addEventListener("area-click", (e) => {
    const a = allAreas().find((x) => x.id === e.detail);
    if (a) openArea(a.opens);
});
/* Click a worker pictogram on the layout → pop-up of its report line
   (e.g. Assembly → RM Picking, FG Putaway → choose one → scan the badge) */
document.addEventListener("worker-click", (e) => {
    $("workerTip").classList.remove("show");
    openArea({row: e.detail.row});
});

/* Hover a pictogram → small tooltip with the line name, its tasks and status */
document.addEventListener("worker-hover", (e) => {
    const tip = $("workerTip");
    const d = e.detail;
    if (!d) return tip.classList.remove("show");
    let title = "", sub = "", status = "none";
    if (d.row) {
        const {row} = findRow(d.row);
        if (!row) return;
        title = rowDisplay(row);
        sub = "";
        status = row.status;
    } else if (d.area) {
        const a = allAreas().find((x) => x.id === d.area);
        const info = a && areaInfo(a);
        if (!info) return;
        title = info.name;
        sub = t("door_flow");
        status = info.status;
    }
    tip.innerHTML = `<div class="tip-title"><i class="dot st-${status}"></i>${esc(title)}</div>`;   // status dot + name, e.g. "● Assembly"
    // first corner around the pictogram that stays inside the map and covers no area label
    const wrap = tip.parentElement.getBoundingClientRect();
    const W = wrap.width, H = wrap.height, w = tip.offsetWidth, h = tip.offsetHeight;
    const labels = [...document.querySelectorAll("#scene .wl-label, #offMap .map-chip")]
        .map((el) => el.getBoundingClientRect()).filter((r) => r.width)
        .map((r) => [r.left - wrap.left, r.top - wrap.top, r.right - wrap.left, r.bottom - wrap.top]);
    const free = ([x, y]) => x >= 6 && y >= 6 && x + w <= W - 6 && y + h <= H - 6
        && !labels.some(([l, t, r, b]) => x < r + 3 && x + w > l - 3 && y < b + 3 && y + h > t - 3);
    const spots = [[d.x + 14, d.y + 14], [d.x - 14 - w, d.y + 14], [d.x + 14, d.y - 14 - h], [d.x - 14 - w, d.y - 14 - h]];
    let [x, y] = spots.find(free) || spots[0];
    x = Math.max(6, Math.min(x, W - 6 - w));
    y = Math.max(6, Math.min(y, H - 6 - h));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    tip.classList.add("show");
});

// line under the map: how many zones are understaffed / partially staffed / at target + update time
function renderMapFoot() {
    const n = {critical: 0, warning: 0, ok: 0};
    for (const a of LAYOUT.AREAS) {
        const st = areaInfo(a)?.status;
        if (st in n) n[st]++;
    }
    const d = new Date(), two = (x) => String(x).padStart(2, "0");
    $("mapFoot").innerHTML = ["critical", "warning", "ok"]
        .map((st) => `<span><i class="dot st-${st}"></i><b class="st-${st}">${n[st]}</b> ${esc(t("foot_" + st))}</span>`).join("") +
        `<span class="muted">${esc(t("foot_updated"))} ${two(d.getHours())}:${two(d.getMinutes())}</span>`;
}

function renderOffMap() {
    $("offMap").innerHTML = LAYOUT.OFF_MAP.map((a) => {
        const info = areaInfo(a);
        if (!info) return "";
        return `<button type="button" class="map-chip st-${info.status}" data-offmap="${a.id}" style="border-left:4px solid ${a.color}"><i class="dot"></i>${esc(info.name)}</button>`;
    }).join("");
}

$("offMap").addEventListener("click", (e) => {
    const b = e.target.closest("[data-offmap]");
    if (!b) return;
    const a = LAYOUT.OFF_MAP.find((x) => x.id === b.dataset.offmap);
    if (a) openArea(a.opens);
});

function renderAttendance() {
    const a = state.att;
    if (!a) return;
    const cell = (label, value, cls = "") => `<div class="att"><div class="att-label">${esc(label)}</div><div class="att-value ${cls}">${value}</div></div>`;
    $("attendance").innerHTML =
        cell(t("att_total"), a.total) + cell(t("att_absent"), a.absent, a.absent ? "bad" : "") + cell(t("att_present"), a.present) +
        cell(t("att_planned"), `${a.planned_pct}%`) +
        cell(t("att_actual"), `${a.actual_absent_pct}%`, a.actual_absent_pct > a.planned_pct ? "bad" : "good");
    $("coverage").className = `coverage ${a.coverage_ok ? "ok" : "nok"}`;
    $("coverage").innerHTML = `${esc(t("att_coverage"))} <b>${a.coverage_ok ? "OK" : "NOK"}</b><span>${esc(t("att_coverage_detail", {
        p: a.present,
        n: fmt(a.needed)
    }))}</span>`;
}

// ---------------------------------------------------------------- pop-up: area → line → task
// The area pop-up does not block the page: no dark backdrop, no focus trap, page stays scrollable,
// so the report can be scrolled and other pictograms clicked while it is open (it then just changes).
const areaModal = () => bootstrap.Modal.getOrCreateInstance($("areaModal"), {
    backdrop: false,
    focus: false,
    keyboard: false
});

/* -----------------------------------------------------------
   Drag the area/task popup by its top header
   ----------------------------------------------------------- */
let modalDrag = null;

$("areaModal").addEventListener("shown.bs.modal", () => {
    const modal = $("areaModal");
    const dialog = modal.querySelector(".modal-dialog");

    /* First opening: keep the normal centred Bootstrap position */
    if (dialog.dataset.dragReady) return;

    const rect = dialog.getBoundingClientRect();

    dialog.style.position = "fixed";
    dialog.style.margin = "0";
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.transform = "none";

    dialog.dataset.dragReady = "true";
});

// $("areaModalHead").addEventListener("pointerdown", (e) => {
//     /* Do not drag when using back, close, or breadcrumb buttons */
//     if (e.target.closest("button, a")) return;
//
//     const dialog = $("areaModal").querySelector(".modal-dialog");
//     const rect = dialog.getBoundingClientRect();
//
//     modalDrag = {
//         offsetX: e.clientX - rect.left,
//         offsetY: e.clientY - rect.top,
//         dialog
//     };
//
//     $("areaModalHead").setPointerCapture(e.pointerId);
// });
//
// $("areaModalHead").addEventListener("pointermove", (e) => {
//     if (!modalDrag) return;
//
//     const dialog = modalDrag.dialog;
//     const width = dialog.offsetWidth;
//     const height = dialog.offsetHeight;
//
//     /* Keep at least part of the popup visible on screen */
//     const left = Math.max(
//         0,
//         Math.min(window.innerWidth - width, e.clientX - modalDrag.offsetX)
//     );
//
//     const top = Math.max(
//         0,
//         Math.min(window.innerHeight - 60, e.clientY - modalDrag.offsetY)
//     );
//
//     dialog.style.left = `${left}px`;
//     dialog.style.top = `${top}px`;
// });
//
// function stopModalDrag() {
//     modalDrag = null;
// }
//
// $("areaModalHead").addEventListener("pointerup", stopModalDrag);
// $("areaModalHead").addEventListener("pointercancel", stopModalDrag);

/* -----------------------------------------------------------
   Fixed task popup position:
   upper-left map area, over the truck/dock space.
   The popup cannot be dragged.
----------------------------------------------------------- */

$("areaModal").addEventListener("shown.bs.modal", () => {
    const dialog = $("areaModal").querySelector(".modal-dialog");

    const map = document.querySelector(".scene-wrap").getBoundingClientRect();   // top-left corner of the map = trucks
    dialog.style.position = "fixed";
    dialog.style.margin = "0";
    dialog.style.setProperty("left", `${Math.round(map.left + 10)}px`, "important");   // beats the fixed CSS fallback
    dialog.style.setProperty("top", `${Math.round(map.top + 10)}px`, "important");
    dialog.style.transform = "none";
});

function openArea(opens) {
    state.flow = [];
    if (opens.section) state.flow.push({type: "section", id: opens.section});
    else pushRow(opens.row, true);
    renderFlow(true);
    areaModal().show();
    updateScene();
}

// a line with only one task (Receiving, Sorting …) opens that task directly
function pushRow(rowId, root = false) {
    const {row} = findRow(rowId);
    if (!row) return;
    if (row.tasks.length === 1) state.flow.push({type: "task", id: row.tasks[0].id, rowId, single: true, root});
    else state.flow.push({type: "row", id: rowId, rowId, root});
}

$("areaModal").addEventListener("show.bs.modal", () => document.body.classList.add("area-pop-open"));
$("areaModal").addEventListener("hidden.bs.modal", () => {
    // every new opening starts centred again (forget where it was dragged to)
    const dialog = $("areaModal").querySelector(".modal-dialog");
    ["position", "margin", "left", "top", "transform"].forEach((p) => dialog.style.removeProperty(p));
    delete dialog.dataset.dragReady;
    document.body.classList.remove("area-pop-open");
    state.flow = [];
    state.feedback = null;
    updateScene();
});
// Escape closes the open pop-up even when the focus is not inside it
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal.show").forEach((m) => bootstrap.Modal.getInstance(m)?.hide());
});
$("areaBack").addEventListener("click", () => {
    if (state.flow.length > 1) {      // on the first level it is only the people icon (no action)
        state.flow.pop();
        renderFlow(true);
    }
});

// status of a pop-up level (section, line or task)
function stepStatus(step) {
    if (!step) return "none";
    if (step.type === "section") return findSection(step.id)?.status || "none";
    if (step.type === "row") return findRow(step.id).row?.status || "none";
    const {task, row} = findTask(step.id);
    return (step.single ? row?.status : task?.status) || "none";
}

$("areaCrumbs").addEventListener("click", (e) => {
    const c = e.target.closest("[data-crumb]");
    if (!c) return;
    state.flow = state.flow.slice(0, Number(c.dataset.crumb) + 1);
    renderFlow(true);
});

function crumbText(step) {
    if (step.type === "section") return sectionName(findSection(step.id));
    if (step.type === "row") return rowLabel(findRow(step.id).row);
    const {task, row} = findTask(step.id);
    return step.single ? rowDisplay(row) : tName(task);
}

function renderFlow(animate = false) {
    if (!state.flow.length || !state.ov) return;
    const step = state.flow[state.flow.length - 1];
    // first level: people icon (staffing) in the status colour; deeper levels: back arrow
    const back = $("areaBack");
    if (state.flow.length > 1) {
        back.className = "round-btn";
        back.innerHTML = `<i class="bi bi-arrow-left"></i>`;
        back.title = t("back");
    } else {
        back.className = `round-btn people-badge st-${stepStatus(state.flow[0])}`;
        back.innerHTML = `<i class="bi bi-people-fill"></i>`;
        back.removeAttribute("title");
    }
    back.style.visibility = "visible";
    $("areaCrumbs").innerHTML = state.flow.map((s, i) => i < state.flow.length - 1
        ? `<a data-crumb="${i}">${esc(crumbText(s))}</a><i class="bi bi-chevron-right"></i>`
        : `<span>${esc(crumbText(s))}</span>`).join("");

    // keep what the user is typing (scan box, remark) during the automatic refresh
    const active = document.activeElement;
    if (!animate && active && $("areaBody").contains(active) && active.matches("input, textarea")) {
        if (step.type === "task") renderTaskLive(step);
        return;
    }
    const body = $("areaBody");
    if (step.type === "section") body.innerHTML = sectionView(findSection(step.id));
    else if (step.type === "row") body.innerHTML = rowView(findRow(step.id).row);
    else body.innerHTML = taskView(step);
    if (animate) {
        body.classList.remove("slide-in");
        void body.offsetWidth;
        body.classList.add("slide-in");
    }
    if (step.type === "task") setTimeout(() => $("scanTask")?.focus(), animate ? 250 : 0);
}

function sectionView(s) {
    return `
    <div class="view-head">
      <div>
        <div class="eyebrow">${esc(t("tasks_covered", {a: s.covered, b: s.task_count}))}</div>
        <h2>${esc(sectionName(s))}</h2>
        <div class="muted">${esc(t("rows_choose", {n: s.rows.length}))}</div>
      </div>
      ${statusPill(s.status, true)}
    </div>
    <div class="list">
      ${s.rows.map((r) => `
        <button type="button" class="item st-${r.status}" data-row="${r.id}">
          <span class="item-bar"></span>
          <span class="item-main">
            <span class="item-title">${esc(rowLabel(r))}</span>    
            <span class="item-names muted">${esc(rowTasksText(r))}</span>
          </span>
          <span class="item-nums"><b>${r.actual}</b><span>/ ${fmt(r.target)}</span></span>
          ${statusPill(r.status)}
          <i class="bi bi-chevron-right chev"></i>
        </button>`).join("")}
    </div>`;
}

// the three report columns of a line (+ remark, + extra values like pallets)
function reportBlock(r) {
    return `
    <div class="report-block">
      <div class="rb-cell"><div class="rb-label">${esc(t("distribution"))}</div><div class="rb-value">${fmt(r.target)}</div></div>
      <div class="rb-cell"><div class="rb-label">${esc(t("actual_distribution"))}</div><div class="rb-value" id="rbActual">${r.actual}</div></div>
      <div class="rb-cell wide"><div class="rb-label">${esc(t("employees_field"))}</div>
        <div class="rb-names" id="rbNames">${r.employees ? esc(r.employees) : `<span class="muted">${esc(t("no_one_yet"))}</span>`}</div></div>
    </div>
    <div class="report-extra">
      <label class="field">
        <span>${esc(t("remark"))}</span>
        <input class="x-input" data-remark="${r.id}" value="${esc(r.remark)}" placeholder="${esc(t("remark_ph"))}">
      </label>
      ${r.kpis.map((k) => `
        <label class="field small-field">
          <span>${esc(rowLabel(r))}: ${esc(kpiName(k.name))}</span>
          <input class="x-input" inputmode="numeric" data-kpi="${esc(k.name)}" data-row="${r.id}" value="${esc(k.value)}">
        </label>`).join("")}
    </div>`;
}

function rowView(r) {
    return `
    <div class="view-head">
      <div>
        <div class="eyebrow">${esc(t("row_tasks_covered", {a: r.covered, b: r.task_count}))}</div>
        <h2>${esc(rowLabel(r))}</h2>       
        <div class="muted">${esc(t("tasks_choose", {n: r.tasks.length}))}</div>
      </div>
      ${statusPill(r.status, true)}
    </div>
    <div class="list">
      ${r.tasks.map((tk) => `
        <button type="button" class="item st-${tk.status}" data-task="${tk.id}">
          <span class="item-bar"></span>
          <span class="item-main">
            <span class="item-title">${esc(tName(tk))}</span>

          </span>
          <span class="item-nums"><b>${tk.actual}</b></span>
          ${statusPill(tk.status)}
          <i class="bi bi-chevron-right chev"></i>
        </button>`).join("")}
    </div>`;
}

function taskView(step) {
    const {task} = findTask(step.id);

    /*
      The scan card changes colour according to the latest scan result:
      - is-ok  = employee was assigned successfully
      - is-bad = employee is not qualified / assignment was refused
    */
    const feedback =
        state.feedback?.task === step.id
            ? state.feedback
            : null;

    const scanState =
        feedback?.kind === "ok"
            ? "is-ok"
            : feedback?.kind === "bad"
                ? "is-bad"
                : "";

    return `
        <!-- 1. Assigned operators -->
        <div class="assigned-heading">
    <div class="section-label assigned-title">
        ${esc(t("on_task", {n: task.actual}))}
    </div>

    <div class="assigned-action-headings">
        <span>ILU qualification</span>
        <span>Remove</span>
    </div>
</div>

        <div id="taskPeople">
            ${peopleList(task)}
        </div>

        <!-- 2. Add another operator -->
        <div class="section-label task-section-title assign-more-title">
            Assign additionally
        </div>

        <form
            class="scan-card ${scanState}"
            id="scanForm"
            autocomplete="off"
        >
            <div class="scan-icon">
                <i class="bi bi-upc-scan"></i>
            </div>

            <input
                id="scanTask"
                class="scan-input flex-grow-1"
                placeholder="Scan employee badge…"
                title="Scan = assign · scan the same badge again = remove"
                autocomplete="off"
            >
        </form>

        <div
            id="scanFeedback"
            class="scan-feedback ${feedback ? `show ${feedback.kind}` : ""}"
        >
            ${feedback ? feedback.html : ""}
        </div>

        <div class="demo-badges" id="demoBadges">
            ${demoBadges(task)}
        </div>
    `;
}

function peopleList(task) {
    if (!task.people.length) {
        return `
            <div class="empty-slot">
                <i class="bi bi-person-dash"></i>
                ${esc(t("task_status_critical"))}
            </div>
        `;
    }

    return task.people.map((p) => `
        <div class="person ${state.flash === p.badge ? "flash" : "working"}">
            <span class="avatar">${esc(initials(p.name))}</span>

            <span class="flex-grow-1">
                <span class="person-name">${esc(p.name)}</span>

                <span class="person-meta">
                    ${esc(t("team"))} ${esc(p.team)}
                    · ${esc(p.badge)}
                </span>
            </span>

            <span class="person-actions">
                <span class="person-ilu">
                    ${lvlPill(p.ilu)}
                </span>

                <button
                    type="button"
                    class="round-btn danger"
                    data-remove="${esc(p.badge)}"
                    title="${esc(t("remove"))}"
                    aria-label="${esc(t("remove"))}"
                >
                    <i class="bi bi-x-lg"></i>
                </button>
            </span>
        </div>
    `).join("");
}

// parts of the task view that change on refresh (the scan box keeps focus)
function renderTaskLive(step) {
    const {task, row} = findTask(step.id);
    if (!task) return;
    $("taskPeople").innerHTML = peopleList(task);
    const taskStatusPill = $("taskStatusPill");
    if (taskStatusPill) taskStatusPill.innerHTML = statusPill(task.status, true);
    const taskStatusText = $("taskStatusText");
    if (taskStatusText) {
        taskStatusText.textContent = t(task.actual ? "task_status_ok" : "task_status_critical");
    }
    if ($("rbActual")) {
        $("rbActual").textContent = row.actual;
        $("rbNames").innerHTML = row.employees ? esc(row.employees) : `<span class="muted">${esc(t("no_one_yet"))}</span>`;
    }
}

// demo: a few badges to click when no hand scanner is connected (3 qualified, 1 not)
let iluCache = null;

function demoBadges(task) {
    if (!iluCache) return "";
    const need = task.skills.map((s) => s.code);
    const rank = {I: 1, L: 2, U: 3};
    const level = (e) => (need.length ? (need.every((c) => e.levels[c]) ? need.map((c) => e.levels[c]).sort((a, b) => rank[a] - rank[b])[0] : null) : "U");
    const pool = iluCache.employees.filter((e) => !state.team || e.team === state.team);
    const ok = pool.filter((e) => ["L", "U"].includes(level(e))).slice(0, 3);
    const no = pool.filter((e) => !["L", "U"].includes(level(e))).slice(0, 1);
    const chip = (e) => `<button type="button" class="badge-chip ${["L", "U"].includes(level(e)) ? "" : "no"}" data-demo="${esc(e.badge)}">
      <i class="bi bi-person-badge"></i>${esc(e.name)}${["L", "U"].includes(level(e)) ? "" : ` <em>(${esc(t("not_qualified_short"))})</em>`}</button>`;
    return `<span class="muted small">${esc(t("demo_badges"))}</span> ${[...ok, ...no].map(chip).join("")}`;
}

async function scan(code, move = false) {
    const step = state.flow[state.flow.length - 1];
    if (!code || step?.type !== "task") return;
    const {task} = findTask(step.id);
    const r = await api(`/api/tasks/${step.id}/scan`, {method: "POST", body: {code, move}});
    if (r.event === "ELSEWHERE") return askMove(step.id, r);
    const vars = {name: r.name, code: r.code, task: tName(task), skills: (r.skills || []).join(", ")};
    const kind = {ASSIGNED: "ok", MOVED: "ok", REMOVED: "info", DUPLICATE: "info", REFUSED: "bad", ERROR: "bad"}[r.event] || "info";
    const icon = {
        ASSIGNED: "bi-check-circle-fill",
        MOVED: "bi-arrow-left-right",
        REMOVED: "bi-dash-circle-fill",
        DUPLICATE: "bi-arrow-repeat",
        REFUSED: "bi-shield-x",
        ERROR: "bi-question-circle-fill"
    }[r.event];
    state.feedback = {task: step.id, kind, html: `<i class="bi ${icon}"></i>${esc(t(`msg_${r.event}`, vars))}`};
    $("scanFeedback").className = `scan-feedback show ${kind}`;
    $("scanFeedback").innerHTML = state.feedback.html;
    if (r.event === "ASSIGNED" || r.event === "MOVED") state.flash = r.code;
    await refresh();
    setTimeout(() => {
        state.flash = null;
    }, 1500);
}

/* The scanned person already works on another position: ask before moving them here */
function askMove(taskId, r) {
    const where = [...new Set(r.tasks.map((id) => findTask(id).row).filter(Boolean).map(rowDisplay))].join(", ");
    state.feedback = {
        task: taskId, kind: "warn",
        html: `<i class="bi bi-exclamation-triangle-fill"></i>
            <span class="flex-grow-1">${esc(t("msg_ELSEWHERE", {name: r.name, where}))}</span>
            <button type="button" class="fb-btn" data-move="${esc(r.code)}">${esc(t("btn_move_here"))}</button>
            <button type="button" class="fb-btn ghost" data-move-cancel>${esc(t("btn_cancel_move"))}</button>`,
    };
    $("scanFeedback").className = "scan-feedback show warn";
    $("scanFeedback").innerHTML = state.feedback.html;
}

$("areaBody").addEventListener("submit", (e) => {
    if (e.target.id !== "scanForm") return;
    e.preventDefault();
    const code = $("scanTask").value.trim();
    $("scanTask").value = "";
    scan(code);
});
$("areaBody").addEventListener("click", async (e) => {
    const row = e.target.closest("[data-row]:not(input)");
    if (row) {
        pushRow(row.dataset.row);
        return renderFlow(true);
    }
    const task = e.target.closest("[data-task]");
    if (task) {
        state.flow.push({type: "task", id: task.dataset.task, rowId: findTask(task.dataset.task).row.id});
        return renderFlow(true);
    }
    const demo = e.target.closest("[data-demo]");
    if (demo) return scan(demo.dataset.demo);

    const move = e.target.closest("[data-move]");
    if (move) return scan(move.dataset.move, true);
    if (e.target.closest("[data-move-cancel]")) {
        state.feedback = null;
        $("scanFeedback").className = "scan-feedback";
        $("scanFeedback").innerHTML = "";
        return $("scanTask")?.focus();
    }

    const breakStart = e.target.closest("[data-break-start]");
    if (breakStart) {
        await api(
            `/api/employees/${encodeURIComponent(breakStart.dataset.breakStart)}/break/start`,
            {method: "POST"}
        );

        toast("Food break started", "info");
        await refresh();
        return;
    }

    const breakEnd = e.target.closest("[data-break-end]");
    if (breakEnd) {
        await api(
            `/api/employees/${encodeURIComponent(breakEnd.dataset.breakEnd)}/break/end`,
            {method: "POST"}
        );

        toast("Employee returned from break");
        await refresh();
        return;
    }

    const shiftEnd = e.target.closest("[data-shift-end]");
    if (shiftEnd) {
        if (!confirm("Finish this employee's shift?")) return;

        await api(
            `/api/employees/${encodeURIComponent(shiftEnd.dataset.shiftEnd)}/shift/end`,
            {method: "POST"}
        );

        toast("Shift finished", "info");
        await refresh();
        return;
    }

    const rm = e.target.closest("[data-remove]");
    if (rm) {
        const step = state.flow[state.flow.length - 1];
        await api(`/api/tasks/${step.id}/remove`, {method: "POST", body: {badge: rm.dataset.remove}});
        await refresh();
        $("scanTask")?.focus();
    }
});
// remark / extra values are saved when leaving the field
$("areaBody").addEventListener("change", async (e) => {
    const el = e.target;
    if (el.dataset.remark) await api(`/api/rows/${el.dataset.remark}/remark`, {
        method: "PUT",
        body: {remark: el.value}
    });
    else if (el.dataset.kpi) await api(`/api/rows/${el.dataset.row}/kpi`, {
        method: "PUT",
        body: {name: el.dataset.kpi, value: el.value}
    });
    else return;
    el.classList.add("saved");
    setTimeout(() => el.classList.remove("saved"), 1200);
    toast(t("saved"));
    refresh();
});

// Shift report: one CSS grid template for the header AND every line, so the columns line up.
// The rounded left edge of each section has the section's own map colour; the thin bar shows its status.
const REPORT_ICON_PERSON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.3 5.4a3.7 3.7 0 0 1 7.4 0z" fill="#FFD24A" stroke="#7A5A00" stroke-width="0.6"/><path d="M7.4 1.9h1.2v3.3H7.4z" fill="#E0B020"/><rect x="3.2" y="5.2" width="9.6" height="1.3" rx="0.65" fill="#FFD24A" stroke="#7A5A00" stroke-width="0.6"/><circle cx="8" cy="8.3" r="1.9" fill="#D9E5F2" stroke="#38506A" stroke-width="0.6"/><path d="M3 15.2c.4-2.8 2.4-4.4 5-4.4s4.6 1.6 5 4.4z" fill="#D9E5F2" stroke="#38506A" stroke-width="0.7"/><path d="M6.2 11.1l1.8 2.2 1.8-2.2" fill="none" stroke="#FF8A1F" stroke-width="0.9" stroke-linejoin="round"/></svg>';
const REPORT_ICON_FORKLIFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="17" y="3" width="2.8" height="15.5" rx="0.6" fill="#394B5F" stroke="#182534" stroke-width="0.5"/><rect x="17" y="17" width="6.5" height="2.2" rx="0.6" fill="#394B5F" stroke="#182534" stroke-width="0.5"/><path d="M4.4 12V5.2h8.4V12" fill="none" stroke="#394B5F" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.5 8.4a2.1 2.1 0 0 1 4.2 0z" fill="#FFD24A" stroke="#7A5A00" stroke-width="0.5"/><circle cx="8.6" cy="9.4" r="1.6" fill="#D9E5F2" stroke="#38506A" stroke-width="0.5"/><rect x="2.5" y="11.6" width="13" height="6.6" rx="1.2" fill="#F0A51A" stroke="#7A5A00" stroke-width="0.7"/><circle cx="6.2" cy="19.4" r="2.7" fill="#394B5F" stroke="#182534" stroke-width="0.8"/><circle cx="13" cy="19.4" r="2.7" fill="#394B5F" stroke="#182534" stroke-width="0.8"/></svg>';
const reportSectionIcon = (code) => code === "TRANS" ? REPORT_ICON_FORKLIFT : REPORT_ICON_PERSON;

function renderReport() {
    const ov = state.ov;
    const reportBody = $("reportBody");
    if (!ov || !reportBody) return;

    const line = (r, section) => {
        const own = allAreas().find((a) => a.opens.row === r.id);    // e.g. Sorting, Traymaster have their own colour
        const progress = r.target ? Math.min(100, Math.round((Number(r.actual) / Number(r.target)) * 100)) : 0;
        return `
        <div class="rp-grid rp-line" data-line="${esc(r.id)}">
            <div class="rp-area">
                <button type="button" class="rp-link" data-row="${esc(r.id)}"><b>${esc(rowLabel(r))}</b>${rowTasksText(r) ? `<span class="muted"> (${esc(rowTasksText(r))})</span>` : ""}</button>
            </div>
            <div class="rp-num">${fmt(r.target)}</div>
            <div class="rp-num">${r.actual}</div>
            <div class="rp-emp">
                ${r.employees ? esc(r.employees) : `<span class="muted">${esc(t("no_one_yet"))}</span>`}
                ${r.remark ? `<div class="remark"><i class="bi bi-exclamation-triangle"></i> ${esc(r.remark)}</div>` : ""}
                ${r.kpis.length ? `<div class="rp-kpis">${r.kpis.map((k) => `${esc(kpiName(k.name))}: <b>${esc(k.value || "–")}</b>`).join(" · ")}</div>` : ""}
            </div>
            <div class="rp-status">${reportStatus(r.status)}</div>
        </div>`;
    };
    const columnHead = `
        <div class="rp-grid rp-head">
            <div>${esc(t("col_area"))}</div>
            <div class="rp-num">${esc(t("distribution"))}</div>
            <div class="rp-num">${esc(t("actual_distribution"))}</div>
            <div>${esc(t("employees_col"))}</div>
            <div class="rp-status">${esc(t("col_status"))}</div>
        </div>`;

    reportBody.innerHTML = `
        ${ov.sections.map((s) => {
        return `
            <section class="rp-section" data-section="${esc(s.code)}" style="--sec-color:${sectionColor(s.code)}">
                <div class="rp-summary">
                    <div class="rp-summary-top">
                        <span class="rp-sec-name"><span class="rp-sec-icon">${reportSectionIcon(s.code)}</span>${esc(sectionName(s))}</span>
                        <span class="rp-section-progress">
                            <span class="rp-section-progress-label">${esc(t("tasks_covered", {a: s.covered, b: s.task_count}))}</span>
                            <span class="rp-section-progress-bar">
                                <span class="rp-section-progress-track">
                                    <i class="rp-section-progress-fill st-${esc(s.status)}" style="width:${s.target ? Math.min(100, Math.round((Number(s.actual) / Number(s.target)) * 100)) : 0}%"></i>
                                </span>
                                <span>${s.target ? Math.min(100, Math.round((Number(s.actual) / Number(s.target)) * 100)) : 0}%</span>
                            </span>
                        </span>
                    </div>
</div>
                ${columnHead}
                ${s.rows.map((r) => line(r, s)).join("")}
            </section>`;
    }).join("")}
        <div class="rp-grid rp-total">
            <div>${esc(t("total_per_shift"))}</div>
        <div></div><div></div>
        <div class="rp-num">${fmt(ov.total_target)}</div>
        <div class="rp-num">${ov.total_actual}</div>
        </div>`;
    fitReport();
}

/* The Shift report fills its panel on one screen without scrolling:
   scaled down when it is taller than the panel (not below 70 %), up when it is shorter (up to 130 %). */
function fitReport() {
    const body = $("reportBody");
    const box = body?.parentElement;
    if (!box || !box.offsetHeight) return;   // hidden (the right panel shows the view choice)
    const apply = (scale) => {
        body.style.transform = scale !== 1 ? `scale(${scale})` : "";
        body.style.width = scale !== 1 ? `${100 / scale}%` : "";   // keeps the full panel width after scaling
        body.style.marginBottom = "";
    };
    // largest scale (0.7 – 1.3×) at which the whole report still fits the panel: shrinks a long report and
    // grows a short one so there is no blank gap. Scaling changes the line wrapping (the text gets a different
    // width), so the height is measured at every step of a binary search instead of computed once.
    const fits = (scale) => {
        apply(scale);
        return body.scrollHeight * scale <= box.clientHeight;
    };
    let lo = 0.6, hi = 1.3;
    if (fits(hi)) lo = hi;
    else for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
    }
    const scale = Math.floor(lo * 1000) / 1000;
    apply(scale);
    // Keep the whole report visible in the panel; the compact lower bound handles the repeated section headers.
    const fitsNow = body.scrollHeight * scale <= box.clientHeight;
    box.style.overflowY = fitsNow ? "" : "auto";
    if (!fitsNow) body.style.marginBottom = `${-body.scrollHeight * (1 - scale)}px`;
}

window.addEventListener("resize", fitReport);

/* Right panel: first a choice between Shift report and Analytics; Shift report opens in the panel,
   Analytics in its window. The back arrow in the report goes back to the choice. */
const reportPanel = document.querySelector(".shift-report-panel");
$("openReport").addEventListener("click", async () => {
    reportPanel.classList.remove("choosing");
    if (state.ov) renderReport();
    else await refresh();
    fitReport();
});
$("reportBackBtn").addEventListener("click", () => reportPanel.classList.add("choosing"));

function destroyChart(chart) {
    if (chart) chart.destroy();
}

function analyticsData() {
    const result = {
        ok: 0,
        warning: 0,
        critical: 0,
        sections: [],
        attention: []
    };

    for (const section of sections()) {
        result.sections.push({
            name: sectionName(section),
            target: Number(section.target || 0),
            actual: Number(section.actual || 0)
        });

        for (const row of section.rows) {
            for (const task of row.tasks) {
                if (task.status === "warning" || task.status === "critical") {
                    result.attention.push({
                        status: task.status,
                        section: sectionName(section),
                        row: rowLabel(row),
                        task: tName(task),
                        taskId: task.id
                    });
                }
            }
        }
    }

    for (const section of sections()) {
        for (const row of section.rows) {
            for (const task of row.tasks) {
                if (task.status === "ok") result.ok += 1;
                else if (task.status === "warning") result.warning += 1;
                else if (task.status === "critical") result.critical += 1;
            }
        }
    }

    return result;
}

function renderAnalytics() {
    if (!state.ov || !state.att || !window.Chart) return;

    const data = analyticsData();

    destroyChart(staffingChart);
    destroyChart(attendanceChart);
    destroyChart(capacityChart);

    staffingChart = new Chart($("staffingChart"), {
        type: "doughnut",
        data: {
            labels: ["Acc. target allocation", "Partially allocated", "No allocation"],
            datasets: [{
                data: [data.ok, data.warning, data.critical],
                backgroundColor: ["#16a34a", "#d99a00", "#dc2626"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        padding: 18
                    }
                }
            }
        }
    });

    attendanceChart = new Chart($("attendanceChart"), {
        type: "doughnut",
        data: {
            labels: ["Present", "Absent"],
            datasets: [{
                data: [state.att.present, state.att.absent],
                backgroundColor: ["#2563eb", "#dc2626"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        padding: 18
                    }
                }
            }
        }
    });

    capacityChart = new Chart($("capacityChart"), {
        type: "bar",
        data: {
            labels: data.sections.map((s) => s.name),
            datasets: [
                {
                    label: "Planned capacity",
                    data: data.sections.map((s) => s.target),
                    backgroundColor: "#bfdbfe",
                    borderColor: "#2563eb",
                    borderWidth: 1,
                    borderRadius: 6
                },
                {
                    label: "Assigned employees",
                    data: data.sections.map((s) => s.actual),
                    backgroundColor: "#2563eb",
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 35,
                        minRotation: 0
                    }
                }
            },
            plugins: {
                legend: {
                    position: "bottom"
                }
            }
        }
    });

    $("attentionList").innerHTML = data.attention.length
        ? data.attention.map((item) => `
        <button type="button"
                class="attention-row st-${item.status}"
                data-attention-task="${esc(item.taskId)}">
          <span>
            <span class="attention-name">${esc(item.task)}</span>
            <span class="attention-meta">
              ${esc(item.section)} · ${esc(item.row)}
            </span>
          </span>
          ${statusPill(item.status)}
        </button>
      `).join("")
        : `
        <div class="empty-slot">
          <i class="bi bi-check-circle"></i>
          All tasks are currently staffed.
        </div>
      `;
}

async function renderWorkTimeAnalytics() {
    const data = await api(withTeam("/api/analytics/work-time"));

    $("workWorking").textContent = data.counts.WORKING;
    $("workOnBreak").textContent = data.counts.ON_BREAK;
    $("workFinished").textContent = data.counts.FINISHED;
    $("workTotal").textContent = duration(data.total_worked_seconds);
    $("breakTotal").textContent = duration(data.total_break_seconds);
    $("workAverage").textContent = duration(data.average_worked_seconds);

    // Show employees who started the shift, longest worked time first.
    const employees = [...data.employees]
        .filter((employee) => employee.work_status !== "NOT_STARTED")
        .sort((a, b) => b.worked_seconds - a.worked_seconds);

    if (workedTimeChart) {
        workedTimeChart.destroy();
    }

    workedTimeChart = new Chart($("workedTimeChart"), {
        type: "bar",
        data: {
            labels: employees.map((employee) => employee.name),
            datasets: [
                {
                    label: "Worked time (hours)",
                    data: employees.map((employee) =>
                        Number((employee.worked_seconds / 3600).toFixed(2))
                    ),
                    backgroundColor: employees.map((employee) => {
                        if (employee.work_status === "ON_BREAK") return "#f4c84f";
                        if (employee.work_status === "FINISHED") return "#94a3b8";
                        return "#22a85a";
                    }),
                    borderRadius: 6,
                    borderSkipped: false
                }
            ]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Hours worked"
                    }
                },
                y: {
                    ticks: {
                        autoSkip: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const employee = employees[context.dataIndex];
                            return `Worked: ${duration(employee.worked_seconds)} · Break: ${duration(employee.break_seconds)}`;
                        }
                    }
                }
            }
        }
    });

    $("workTimeTable").innerHTML = data.employees.map((employee) => `
    <tr>
      <td>
        <span class="avatar sm">${esc(initials(employee.name))}</span>
        <b>${esc(employee.name)}</b>
        <span class="muted small">· Team ${esc(employee.team)}</span>
      </td>

      <td>
        <span class="work-status-pill ${workStatusClass(employee.work_status)}">
          ${esc(workStatusText(employee.work_status))}
        </span>
      </td>

      <td>${esc(hhmm(employee.shift_started_at) || "—")}</td>
      <td><b>${duration(employee.worked_seconds)}</b></td>
      <td>${duration(employee.break_seconds)}</td>
      <td>${esc(employee.current_tasks || "—")}</td>
    </tr>
  `).join("");
}

$("analyticsModal").addEventListener("show.bs.modal", async () => {
    renderAnalytics();
    await renderWorkTimeAnalytics();
});

// ---------------------------------------------------------------- scan log pop-up
const EVENT_ICON = {
    SHIFT_START: "bi-box-arrow-in-right",
    ASSIGNED: "bi-person-check",
    REMOVED: "bi-person-dash",
    BREAK_START: "bi-pause-circle-fill",
    BREAK_END: "bi-play-circle-fill",
    SHIFT_END: "bi-box-arrow-right",
    DUPLICATE: "bi-arrow-repeat",
    REFUSED: "bi-shield-x",
    ERROR: "bi-question-circle"
};

async function loadLog() {
    const rows = await api(withTeam("/api/scans?limit=80"));
    $("scanLog").innerHTML = rows.map((r) => `
    <tr>
      <td class="t-time">${hhmmss(r.ts)}</td>
      <td>${r.name ? `<span class="avatar sm">${esc(initials(r.name))}</span> ${esc(r.name)}` : "–"}</td>
      <td>${r.task_name ? `${esc(rowName({name: r.row_label}))} · ${esc(taskName({
        code: r.task_code,
        name: r.task_name
    }))}` : "–"}</td>
      <td><span class="ev ev-${esc(r.event)}"><i class="bi ${EVENT_ICON[r.event] || "bi-dot"}"></i>${esc(t(`ev_${r.event}`))}</span></td>
      <td><code>${esc(r.code)}</code></td>
    </tr>`).join("") || `<tr><td colspan="5" class="muted p-4">${esc(t("no_scans"))}</td></tr>`;
}

$("logModal").addEventListener("show.bs.modal", loadLog);

// ---------------------------------------------------------------- ILU pop-up (cards, not a grid)
function paginate(id, items) {
    const size = PAGE_SIZE[id];
    const pages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(state.pages[id] || 0, pages - 1);
    state.pages[id] = page;
    const slice = items.slice(page * size, page * size + size);
    if (pages <= 1) return {slice, html: ""};
    return {
        slice, html: `
    <div class="pager">
      <button class="round-btn" data-pager="${id}" data-page="${page - 1}" ${page === 0 ? "disabled" : ""}><i class="bi bi-chevron-left"></i></button>
      <span>${esc(t("page_of", {a: page * size + 1, b: page * size + slice.length, n: items.length}))}</span>
      <button class="round-btn" data-pager="${id}" data-page="${page + 1}" ${page >= pages - 1 ? "disabled" : ""}><i class="bi bi-chevron-right"></i></button>
    </div>`
    };
}

document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pager]");
    if (!b || b.disabled) return;
    state.pages[b.dataset.pager] = Number(b.dataset.page);
    renderIlu();
});

const iluState = {data: null, tab: "emp", q: "", open: null};

async function loadIlu() {
    iluState.data = await api(withTeam("/api/ilu"));
    renderIlu();
}

const LEVELS = ["U", "L", "I"];
const levelBar = (c, total) => `<div class="lvl-bar">${LEVELS.map((l) => c[l] ? `<span class="seg-${l}" style="width:${(c[l] / total) * 100}%"></span>` : "").join("")}</div>`;
const countText = (c) => LEVELS.map((l) => `${lvlPill(l)}<b>${c[l] || 0}</b>`).join(" ");

function renderIlu() {
    const m = iluState.data;
    if (!m) return;
    const q = iluState.q.trim().toLowerCase();
    const groups = [];
    for (const sk of m.skills) {
        const g = groups[groups.length - 1];
        if (g && g.grp === sk.grp) g.skills.push(sk); else groups.push({
            grp: sk.grp,
            name: skillGroup(sk),
            skills: [sk]
        });
    }
    if (iluState.tab === "emp") {
        const pg = paginate("iluEmp", m.employees.filter((e) => !q || e.name.toLowerCase().includes(q) || e.badge.includes(q)));
        $("iluBody").innerHTML = (pg.slice.map((e) => {
            const c = {U: 0, L: 0, I: 0};
            Object.values(e.levels).forEach((l) => c[l]++);
            const open = iluState.open === e.badge;
            return `
        <div class="ilu-card ${open ? "open" : ""}">
          <button class="ilu-card-head" data-open="${esc(e.badge)}">
            <span class="avatar">${esc(initials(e.name))}</span>
            <span class="flex-grow-1 text-start"><span class="d-block fw-semibold">${esc(e.name)}</span>
              <span class="small muted">${esc(t("team"))} ${esc(e.team)} · ${esc(e.badge)}</span></span>
            <span class="ilu-summary">${levelBar(c, m.skills.length)}<span class="small">${countText(c)}</span></span>
            <i class="bi bi-chevron-${open ? "up" : "down"} ms-2"></i>
          </button>
          ${open ? `<div class="ilu-card-body">${groups.map((g) => `
            <div><div class="ilu-group-title">${g.grp}. ${esc(g.name)}</div>
              ${g.skills.map((sk) => `<div class="ilu-skill-line">${lvlPill(e.levels[sk.code])}<span>${esc(skillName(sk))}</span></div>`).join("")}
            </div>`).join("")}</div>` : ""}
        </div>`;
        }).join("") || `<div class="muted">${esc(t("no_results"))}</div>`) + pg.html;
        return;
    }
    $("iluBody").innerHTML = groups.map((g) => {
        const skills = g.skills.filter((sk) => !q || skillName(sk).toLowerCase().includes(q) || sk.code.startsWith(q));
        if (!skills.length) return "";
        return `<div class="ilu-group-title mt-3">${g.grp}. ${esc(g.name)}</div>` + skills.map((sk) => {
            const by = {U: [], L: [], I: []};
            m.employees.forEach((e) => {
                const l = e.levels[sk.code];
                if (l) by[l].push(e.name);
            });
            const c = {U: by.U.length, L: by.L.length, I: by.I.length};
            const open = iluState.open === sk.code;
            return `
        <div class="ilu-card ${open ? "open" : ""}">
          <button class="ilu-card-head" data-open="${esc(sk.code)}">
            <span class="ilu-code">${esc(sk.code)}</span>
            <span class="flex-grow-1 text-start fw-semibold">${esc(skillName(sk))}</span>
            <span class="ilu-summary">${levelBar(c, m.employees.length || 1)}<span class="small">${countText(c)}</span></span>
            <i class="bi bi-chevron-${open ? "up" : "down"} ms-2"></i>
          </button>
          ${open ? `<div class="ilu-card-body names">${LEVELS.map((l) => `
            <div class="ilu-names">${lvlPill(l)} ${by[l].length ? by[l].map((n) => `<span class="name-chip">${esc(n)}</span>`).join("") : `<span class="muted small">${esc(t("nobody"))}</span>`}</div>`).join("")}
          </div>` : ""}
        </div>`;
        }).join("");
    }).join("") || `<div class="muted">${esc(t("no_results"))}</div>`;
}

$("iluBody").addEventListener("click", (e) => {
    const h = e.target.closest("[data-open]");
    if (!h) return;
    iluState.open = iluState.open === h.dataset.open ? null : h.dataset.open;
    renderIlu();
});
$("iluTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    iluState.tab = b.dataset.tab;
    iluState.open = null;
    document.querySelectorAll("#iluTabs button").forEach((x) => x.classList.toggle("active", x === b));
    renderIlu();
});
$("iluSearch").addEventListener("input", (e) => {
    iluState.q = e.target.value;
    iluState.open = null;
    state.pages.iluEmp = 0;
    renderIlu();
});
$("iluModal").addEventListener("show.bs.modal", loadIlu);

// ---------------------------------------------------------------- header
$("teamFilter").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-team]");
    if (!b) return;
    state.team = b.dataset.team || null;
    state.pages.iluEmp = 0;
    document.querySelectorAll("#teamFilter button").forEach((x) => x.classList.toggle("active", x === b));
    refresh();
    if ($("iluModal").classList.contains("show")) loadIlu();
    if ($("logModal").classList.contains("show")) loadLog();
});
$("langSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lang]");
    if (!b) return;
    setLang(b.dataset.lang);
    markLang();
    tick();
    renderAll(true);
    if ($("iluModal").classList.contains("show")) renderIlu();
    if ($("logModal").classList.contains("show")) loadLog();
    if ($("analyticsModal").classList.contains("show")) {
        renderWorkTimeAnalytics();
    }
});
const markLang = () => document.querySelectorAll("#langSwitch button").forEach((x) => x.classList.toggle("active", x.dataset.lang === LANG));
$("btnDemo").addEventListener("click", async () => {
    const r = await api("/api/demo/fill", {method: "POST"});
    toast(t("toast_demo", {n: r.assigned}));
    refresh();
});
$("btnNewShift").addEventListener("click", async () => {
    if (!confirm(t("confirm_new_shift"))) return;
    await api("/api/shift/new", {method: "POST"});
    refresh();
});

/* ---------------------------------------------------------------- Shift report <-> layout link
   Hover a line in the report → its area lights up and its pictogram grows on the layout;
   hover a group heading → the whole area. Hover a pictogram / area on the layout → its line / group
   is highlighted in the report. */
function areaForRow(rowId) {
    const own = LAYOUT.AREAS.find((a) => a.opens.row === rowId);   // Sorting, Traymaster
    if (own) return own.id;
    const {section} = findRow(rowId);
    return section ? LAYOUT.AREAS.find((a) => a.opens.section === section.code)?.id || null : null;
}

let reportHover = "";
function reportSelectorForLine(rowId) {
    return `[data-line="${CSS.escape(rowId)}"]`;
}

function reportSelectorForArea(areaId) {
    const area = areaId && allAreas().find((x) => x.id === areaId);
    if (area?.opens.row) return reportSelectorForLine(area.opens.row);
    if (area?.opens.section) return `[data-section="${CSS.escape(area.opens.section)}"]`;
    return null;
}

$("reportBody").addEventListener("mouseover", (e) => {
    const line = e.target.closest("[data-line]");
    const sec = !line && e.target.closest(".rp-summary") && e.target.closest("[data-section]");
    const key = line ? "l:" + line.dataset.line : sec ? "s:" + sec.dataset.section : "";
    if (key === reportHover) return;
    reportHover = key;
    if (line) {
        markReport(reportSelectorForLine(line.dataset.line));
        window.Scene3D?.highlight(areaForRow(line.dataset.line), line.dataset.line);
    } else if (sec) {
        const area = LAYOUT.AREAS.find((a) => a.opens.section === sec.dataset.section);
        markReport(`[data-section="${CSS.escape(sec.dataset.section)}"]`);
        window.Scene3D?.highlight(area?.id || null, null);
    }
});
$("reportBody").addEventListener("mouseleave", () => {
    reportHover = "";
    markFromMap();
    if (!mapHoverRow && !mapHoverArea) window.Scene3D?.highlight(null, null);
});

function markReport(selector) {
    $("reportBody").querySelectorAll(".rp-linked").forEach((el) => el.classList.remove("rp-linked"));
    if (selector) $("reportBody").querySelectorAll(selector).forEach((el) => el.classList.add("rp-linked"));
}

let mapHoverRow = null, mapHoverArea = null;
const markFromMap = () => {
    if (mapHoverRow) return markReport(reportSelectorForLine(mapHoverRow));
    markReport(reportSelectorForArea(mapHoverArea));
};
document.addEventListener("worker-hover", (e) => {
    const row = e.detail?.row || null;
    if (row === mapHoverRow) return;
    mapHoverRow = row;
    if (row) mapHoverArea = null;
    markFromMap();
});
document.addEventListener("area-hover", (e) => {
    mapHoverArea = e.detail;
    if (mapHoverArea) mapHoverRow = null;
    markFromMap();
});

/* Click the name of a line in the Shift report → same pop-up as clicking its pictogram on the layout
   (e.g. IM → RM Picking, RM Delivery, FG Pick-up → choose one → scan the badge) */
$("reportBody").addEventListener("click", (e) => {
    const link = e.target.closest(".rp-link");
    if (link) openArea({row: link.dataset.row});
});

$("attentionList").addEventListener("click", (e) => {
    const button = e.target.closest("[data-attention-task]");
    if (!button) return;

    const {task, row, section} = findTask(button.dataset.attentionTask);
    if (!task) return;

    bootstrap.Modal.getInstance($("analyticsModal"))?.hide();

    state.flow = [
        {type: "section", id: section.code},
        {type: "row", id: row.id, rowId: row.id},
        {type: "task", id: task.id, rowId: row.id}
    ];

    renderFlow(true);
    areaModal().show();
});

const WEEKDAYS = {
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    mk: ["Нед", "Пон", "Вто", "Сре", "Чет", "Пет", "Саб"]
};

// header height → CSS (--top-h): the map and the Shift report fill the rest of the screen, also when the header wraps
new ResizeObserver(([e]) => {
    document.documentElement.style.setProperty("--top-h", `${Math.ceil(e.target.getBoundingClientRect().height)}px`);
}).observe(document.querySelector(".topbar"));

// shift times shown in the header (start hour, end hour, i18n key)
const SHIFTS = [[6, 14, "shift_day"], [14, 22, "shift_afternoon"], [22, 6, "shift_night"]];

function tick() {
    const d = new Date(), two = (n) => String(n).padStart(2, "0"), h = d.getHours();
    $("clock").textContent = `${WEEKDAYS[LANG][d.getDay()]}, ${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(h)}:${two(d.getMinutes())}`;
    const [from, to, key] = SHIFTS.find(([a, b]) => (a < b ? h >= a && h < b : h >= a || h < b));
    $("shiftName").textContent = `${t(key)}  ${two(from)}:00 – ${two(to)}:00`;
}

// "Operations live" in the header: time of the last successful refresh, red when the server is not reachable
function setLive(ok) {
    const d = new Date(), two = (n) => String(n).padStart(2, "0");
    $("liveInfo").classList.toggle("offline", !ok);
    $("liveSub").textContent = ok ? t("live_updated", {t: `${two(d.getHours())}:${two(d.getMinutes())}`}) : t("live_offline");
}

// ---------------------------------------------------------------- refresh loop
function renderAll(full = false) {
    renderReport();
    renderOffMap();
    renderMapFoot();
    updateScene();

    if ($("areaModal").classList.contains("show")) {
        renderFlow(full);
    }

    if ($("analyticsModal")?.classList.contains("show")) {
        renderWorkTimeAnalytics();
    }
}

async function refresh() {
    try {
        [state.ov, state.att] = await Promise.all([api(withTeam("/api/overview")), api(withTeam("/api/attendance"))]);
        renderAll();
        setLive(true);
    } catch (err) {
        console.error(err);
        setLive(false);
    }
}

setLang(LANG);
markLang();
tick();
setInterval(tick, 30000);
api("/api/ilu").then((m) => {
    iluCache = m;
});
refresh();
setInterval(refresh, REFRESH_MS);
