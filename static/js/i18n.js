// =====================================================================================
//  Translations – English (en) and Macedonian (mk)
//  To change a text, edit it here. {name}, {n} … are filled in by the app.
// =====================================================================================
const I18N = {
    en: {
        title: "Warehouse Shift Dashboard",
    worker_hint: "Click to choose a task and scan a badge", door_flow: "Material transport · in / out",
        team: "Team",
        all: "All",
        btn_report: "Shift report",
        btn_log: "Scan log",
        btn_ilu: "ILU",
        demo_fill: "Demo: fill the shift with scans",
        new_shift: "Start new shift (clear all)",
        confirm_new_shift: "Clear all assignments and remarks for a new shift?",

        layout: "Warehouse layout",
        layout_hint: "Click an area or a person",
        reset_view: "Reset view",
        st_ok: "Target reached",
        st_warning: "Partially staffed",
        st_critical: "Understaffed",
        st_ok_legend: "Target reached",
        st_warning_legend: "Partially staffed",
        st_critical_legend: "Understaffed",
        foot_critical: "zones understaffed",
        foot_warning: "partially staffed",
        foot_ok: "at target",
        foot_updated: "Updated",
        h21_note: "External",

        attendance: "Attendance",
        att_total: "Total",
        att_absent: "Absent",
        att_present: "Present",
        att_planned: "Planned absenteeism",
        att_actual: "Actual absenteeism",
        att_coverage: "Workload coverage",
        att_coverage_detail: "{p} present / {n} needed",
        overview: "Shift overview",
        tasks_covered: "{a} of {b} positions staffed",
        row_tasks_covered: "{a} of {b} tasks staffed",
        open_report: "Open full shift report",

        // pop-up
        back: "Back",
        close: "Close",
        rows_choose: "{n} lines · choose one",
        tasks_choose: "{n} tasks · choose one",
        distribution: "Target distribution",
        actual_distribution: "Actual Distribution",
        employees_field: "Employees or Non Working Lines / Areas in actual shift",
        employees_col: "Assigned employees",
        no_one_yet: "Nobody scanned yet.",
        remark: "Non working lines / areas – remark",
        remark_ph: "e.g. Line 3 not working",
        saved: "Saved",
        task_status_ok: "At least one person is working here.",
        task_status_critical: "Nobody is assigned – scan an employee badge.",
        scan_here: "Scan employee badge",
        scan_ph: "Scan badge to assign…",
        scan_hint: "Scan = assign · scan the same badge again = remove",
        on_task: "Already assigned ({n})",
        required_skills: "Required ILU skills (L or U in all)",
        anyone: "No special skill needed – anyone can be assigned.",
        demo_badges: "Demo badges (no scanner):",
        not_qualified_short: "not qualified",
        remove: "Remove",
        since: "since {t}",

        // report pop-up
        report_title: "Warehouse shift handover",
        col_area: "Activity area and Position",
        col_status: "Status",
        total_per_shift: "Total per Shift",
        print: "Print",

        // scan log
        log_title: "Scan log",
        col_time: "Time",
        col_barcode: "Barcode",
        col_employee: "Employee",
        col_task: "Task",
        col_result: "Result",
        no_scans: "No scans yet.",
        ev_SHIFT_START: "Shift started",
        ev_ASSIGNED: "Assigned",
        ev_REMOVED: "Removed",
        ev_BREAK_START: "Break started",
        ev_BREAK_END: "Returned from break",
        ev_SHIFT_END: "Shift finished",
        ev_REFUSED: "Not qualified",
        ev_ERROR: "Unknown badge",
        ev_DUPLICATE: "Double read",
        msg_ASSIGNED: "{name} assigned to {task}.",
        msg_MOVED: "{name} moved to {task}.",
        msg_ELSEWHERE: "{name} is already on {where}. Move here?",
        btn_move_here: "Move here",
        btn_cancel_move: "Cancel",
        msg_REMOVED: "{name} removed from {task}.",
        msg_REFUSED: "{name} is not qualified for {task}.",
        msg_ERROR: "Unknown barcode '{code}'.",
        msg_DUPLICATE: "{name} is already on {task}.",

        // ILU
        ilu_title: "ILU qualifications",
        ilu_legend: "<span class='lvl lvl-U'>U</span> can train others <span class='lvl lvl-L'>L</span> works independently <span class='lvl lvl-I'>I</span> in training",
        tab_employees: "Employees",
        tab_skills: "Skills",
        search: "Search…",
        nobody: "nobody",
        no_results: "No results.",
        page_of: "{a}–{b} of {n}",
        ilu_U: "can train others",
        ilu_L: "works independently",
        ilu_I: "in training",
        toast_demo: "{n} people scanned to tasks",
    },

    mk: {
        title: "Контролна табла – смена во магацин",
    worker_hint: "Кликнете за да изберете задача и скенирате картичка", door_flow: "Транспорт на материјал · влез / излез",
        team: "Тим",
        all: "Сите",
        btn_report: "Извештај за смена",
        btn_log: "Скенирања",
        btn_ilu: "ILU",
        demo_fill: "Демо: пополни ја смената со скенирања",
        new_shift: "Започни нова смена (избриши сè)",
        confirm_new_shift: "Да се избришат сите распоредувања и забелешки за нова смена?",

        layout: "Распоред на магацинот",
        layout_hint: "Кликнете на област или на личност",
        reset_view: "Почетен поглед",
        st_ok: "Целта е постигната",
        st_warning: "Под",
        st_critical: "Недоволно персонал",
        st_ok_legend: "Целта е постигната",
        st_warning_legend: "Под (≥75% од задачите)",
        st_critical_legend: "Недоволно персонал",
        foot_critical: "зони со недоволно персонал",
        foot_warning: "делумно пополнети",
        foot_ok: "ја постигнаа целта",
        foot_updated: "Ажурирано",
        h21_note: "Надворешна",

        attendance: "Присуство",
        att_total: "Вкупно",
        att_absent: "Отсутни",
        att_present: "Присутни",
        att_planned: "Планирано отсуство",
        att_actual: "Вистинско отсуство",
        att_coverage: "Покриеност на работата",
        att_coverage_detail: "{p} присутни / {n} потребни",
        overview: "Преглед на смената",
        tasks_covered: "{a} од {b} позиции пополнети",
        row_tasks_covered: "{a} од {b} задачи пополнети",
        open_report: "Отвори го целиот извештај",

        back: "Назад",
        close: "Затвори",
        rows_choose: "{n} линии · изберете една",
        tasks_choose: "{n} задачи · изберете една",
        distribution: "Целна распределба",
        actual_distribution: "Вистинска распределба",
        employees_field: "Вработени или линии / области што не работат во смената",
        employees_col: "Распоредени вработени",
        no_one_yet: "Сè уште никој не е скениран.",
        remark: "Линии / области што не работат – забелешка",
        remark_ph: "пр. Линија 3 не работи",
        saved: "Зачувано",
        task_status_ok: "Барем една личност работи тука.",
        task_status_critical: "Никој не е распореден – скенирајте картичка на вработен.",
        scan_here: "Скенирај картичка",
        scan_ph: "Скенирај картичка за распоредување…",
        scan_hint: "Скенирање = распореди · истата картичка повторно = отстрани",
        on_task: "Работат на оваа задача ({n})",
        required_skills: "Потребни ILU вештини (L или U во сите)",
        anyone: "Не е потребна посебна вештина – секој може.",
        demo_badges: "Демо картички (без скенер):",
        not_qualified_short: "без квалификација",
        remove: "Отстрани",
        since: "од {t}",

        report_title: "Предавање на смена – магацин",
        col_area: "Област на активност и позиција",
        col_status: "Статус",
        total_per_shift: "Вкупно по смена",
        print: "Печати",

        log_title: "Евиденција на скенирања",
        col_time: "Време",
        col_barcode: "Баркод",
        col_employee: "Вработен",
        col_task: "Задача",
        col_result: "Резултат",
        no_scans: "Сè уште нема скенирања.",
        ev_SHIFT_START: "Почеток на смена",
        ev_ASSIGNED: "Распореден",
        ev_REMOVED: "Отстранет",
        ev_BREAK_START: "Почеток на пауза",
        ev_BREAK_END: "Враќање од пауза",
        ev_SHIFT_END: "Крај на смена",
        ev_REFUSED: "Без квалификација",
        ev_ERROR: "Непозната картичка",
        ev_DUPLICATE: "Двојно читање",
        msg_ASSIGNED: "{name} распореден/а на {task}.",
        msg_MOVED: "{name} преместен/а на {task}.",
        msg_ELSEWHERE: "{name} е веќе на {where}. Да се премести тука?",
        btn_move_here: "Премести",
        btn_cancel_move: "Откажи",
        msg_REMOVED: "{name} отстранет/а од {task}.",
        msg_REFUSED: "{name} нема квалификација за {task}.",
        msg_ERROR: "Непознат баркод „{code}“.",
        msg_DUPLICATE: "{name} веќе е на {task}.",

        ilu_title: "ILU квалификации",
        ilu_legend: "<span class='lvl lvl-U'>U</span> може да обучува други <span class='lvl lvl-L'>L</span> работи самостојно <span class='lvl lvl-I'>I</span> во обука",
        tab_employees: "Вработени",
        tab_skills: "Вештини",
        search: "Пребарај…",
        nobody: "никој",
        no_results: "Нема резултати.",
        page_of: "{a}–{b} од {n}",
        ilu_U: "може да обучува други",
        ilu_L: "работи самостојно",
        ilu_I: "во обука",
        toast_demo: "Скенирани на задачи: {n}",
    },
};

// Report sections, rows and tasks in Macedonian (codes from data/report_rows.csv and data/tasks.csv)
const SECTIONS_MK = {
    PICK: "Главен магацин – подигање", TRANS: "Главен магацин – транспорт на материјал за производство",
    IO: "Влезен / излезен магацин", SUP: "Поддршка и резерва",
};
const ROWS_MK = {
    Assembly: "Монтажа", Receiving: "Прием", Shipping: "Испорака", "Hall 21": "Хала 21",
    "Repack / Kitting": "Препакување / китинг", Sorting: "Сортирање",
    "Other not-planned support actions": "Други непланирани активности за поддршка",
    "Possible back-up": "Можна замена",
};
const TASKS_MK = {
    RM_PICK: "Подигање на RM", RM_DEL: "Достава на RM", FG_PICK: "Преземање на FG", RM_PUT: "Складирање на RM",
    FG_PUT: "Складирање на FG", DEL_REPACK: "Достава за препакување", FG_PACK: "Пакување на FG",
    EMPTIES: "Празна амбалажа", RECEIVING: "Прием", SHIPPING: "Испорака", HALL21: "Хала 21",
    RM_DEL_OBC: "Достава на RM до OBC", EMPT_OBC: "Празна амбалажа од OBC до препакување",
    TRAYMASTER: "Traymaster", SORTING: "Сортирање", DEL_SORT: "Достава за сортирање", INVENTORY: "Попис",
    SUPPORT_OTHER: "Поддршка на други активности", BACKUP: "Замена за отсутни",
};
const KPIS_MK = {Pallets: "Палети", Deliveries: "Испораки", "Delivery Notes": "Испратници"};

// ILU skill names and groups in Macedonian (by skill code from data/skills.csv)
const SKILLS_MK = {
    "1.1": "Прием на стока / истовар на камиони", "1.2": "Книжење на издавање со скенер",
    "1.3": "Складирање во магацин", "1.4": "Обработка на рекламации", "1.5": "Ракување со потрошен материјал",
    "1.6": "Процес на китинг",
    "2.1": "Подигање во магацин – палетни места", "2.2": "Подигање во магацин – мезанин",
    "2.3": "Сортирање и чистење на празна амбалажа", "2.4": "Пописување на залиха",
    "2.5": "Ракување со температурно контролиран материјал", "2.6": "Ракување со опасни материи",
    "2.7": "Traymaster", "2.8": "Препакување на суровини", "2.9": "Ракување со отпаден материјал",
    "3.1": "Снабдување на монтажа (HU 2bin)", "3.2": "Снабдување со празна амбалажа",
    "3.3": "Backflushing и складирање на лиени делови", "3.4": "Backflushing на готови производи",
    "3.5": "Внатрешен транспорт", "3.6": "Складирање на готови производи во магацин",
    "3.7": "Книжење на HU на складишна локација",
    "4.1": "Подигање на готови производи за испорака", "4.2": "Ракување со испратници",
    "4.3": "Обработка на пакетни пратки", "4.4": "Препакување",
    "4.5": "Товарање камиони со рачна палетна количка", "4.6": "Обработка на специјални испораки",
    "5.1": "Ракување со материјал за контрола на квалитет", "5.2": "Безбедносни упатства",
    "5.3": "Еколошки прописи (рециклирање)", "5.4": "Работа со рачни палетни колички",
    "5.5": "Работа со електричен стакер", "5.6": "Работа со виљушкар",
    "5.7": "Одржување и евиденција на опремата", "5.8": "Работа со подни транспортери",
};
const SKILL_GROUPS_MK = {1: "Влез", 2: "Магацин", 3: "Снабдување и одвоз од производство", 4: "Испорака", 5: "Општо"};

function skillName(sk) {
    return LANG === "mk" && SKILLS_MK[sk.code] ? SKILLS_MK[sk.code] : sk.name;
}

function skillGroup(sk) {
    return LANG === "mk" && SKILL_GROUPS_MK[sk.grp] ? SKILL_GROUPS_MK[sk.grp] : sk.group_name;
}

// ------------------------------------------------------------------ helpers
let LANG = (() => {
    try {
        return localStorage.getItem("whs-lang") || "en";
    } catch {
        return "en";
    }
})();

function t(key, vars = {}) {
    const s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

const mk = () => LANG === "mk";

function sectionName(s) {
    return (mk() && SECTIONS_MK[s.code]) || s.name;
}

function rowName(r) {
    return (mk() && ROWS_MK[r.name]) || r.name;
}

function taskName(tk) {
    return (mk() && TASKS_MK[tk.code]) || tk.name;
}

function kpiName(k) {
    return (mk() && KPIS_MK[k]) || k;
}

function setLang(lang) {
    LANG = lang;
    try {
        localStorage.setItem("whs-lang", lang);
    } catch { /* storage not available */
    }
    document.documentElement.lang = lang;
    applyStaticTexts();
}

// Static texts in index.html: data-i18n (text), data-i18n-html (HTML), data-i18n-ph (placeholder), data-i18n-title (tooltip)
function applyStaticTexts() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
        el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
        el.placeholder = t(el.dataset.i18nPh);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        el.title = t(el.dataset.i18nTitle);
    });
    document.title = t("title");
}
