"""SQLite storage (Python standard library, no database server needed).

On first start the tables are created and filled from the CSV files in /data:
  - report_rows.csv -> the lines of the WHS Shift Change Report ("Distribution" block):
                       section, label (IM, EP, Assembly …), detail, target (0.5, 0.6, 2 …)
  - tasks.csv       -> the tasks inside each line (IM → FG Pick-up, FG Packaging), a task type code and the
                       ILU skills a person needs for the task (e.g. 3.5;3.4, empty = anyone)
  - skills.csv      -> the 36 skills of the ILU matrix
  - employees.csv   -> badge (= personnel number), name, team
  - ilu_matrix.csv  -> ILU level (I / L / U) per employee and skill

Load your real ILU matrix with:  python tools/import_ilu.py <file>
After changing a CSV: delete whs.db and restart.
"""
import csv
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = BASE_DIR / "whs.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS skills (
    code TEXT PRIMARY KEY, grp INTEGER NOT NULL, group_name TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS employees (
    badge TEXT PRIMARY KEY, name TEXT NOT NULL, team TEXT, role TEXT
);
CREATE TABLE IF NOT EXISTS skill_levels (
    badge TEXT NOT NULL REFERENCES employees(badge),
    skill_code TEXT NOT NULL REFERENCES skills(code),
    level TEXT NOT NULL CHECK (level IN ('I','L','U')),
    PRIMARY KEY (badge, skill_code)
);
CREATE TABLE IF NOT EXISTS sections (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS report_rows (
    id TEXT PRIMARY KEY,
    section_code TEXT NOT NULL REFERENCES sections(code),
    label TEXT NOT NULL,
    detail TEXT,
    target REAL NOT NULL DEFAULT 0,
    kpis TEXT NOT NULL DEFAULT '',          -- extra report columns, e.g. "Pallets;Deliveries"
    sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    row_id TEXT NOT NULL REFERENCES report_rows(id),
    code TEXT NOT NULL,                     -- task type (RM_PICK, FG_PACK …) used for translations
    name TEXT NOT NULL,
    skills TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL
);
-- Who is working on which task in the CURRENT shift (filled by scanning badges in a task popup).
CREATE TABLE IF NOT EXISTS assignments (
    badge TEXT NOT NULL REFERENCES employees(badge),
    task_id TEXT NOT NULL REFERENCES tasks(id),
    assigned_at TEXT NOT NULL,
    PRIMARY KEY (badge, task_id)
);
-- Remark per report line ("Non Working Lines / Areas in actual shift") and KPI values (Pallets, Deliveries …)
CREATE TABLE IF NOT EXISTS row_notes (
    row_id TEXT PRIMARY KEY REFERENCES report_rows(id),
    remark TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS row_kpis (
    row_id TEXT NOT NULL REFERENCES report_rows(id),
    name TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (row_id, name)
);
-- Every scan is logged.
CREATE TABLE IF NOT EXISTS scan_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    code TEXT NOT NULL,
    badge TEXT,
    task_id TEXT,
    event TEXT NOT NULL,
    message TEXT
);
-- Current shift time status for each employee.
CREATE TABLE IF NOT EXISTS employee_shift_state (
    badge TEXT PRIMARY KEY REFERENCES employees(badge),
    shift_started_at TEXT NOT NULL,
    break_started_at TEXT,
    break_seconds INTEGER NOT NULL DEFAULT 0,
    shift_ended_at TEXT
);

-- History of work, break and end-shift actions.
CREATE TABLE IF NOT EXISTS time_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    badge TEXT NOT NULL REFERENCES employees(badge),
    event_type TEXT NOT NULL,
    task_id TEXT REFERENCES tasks(id),
    ts TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn():
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _read_csv(name: str) -> list[dict]:
    with open(DATA_DIR / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM report_rows").fetchone()[0] == 0:
            seed(conn)
        else:
            # Keep display labels in the existing local database in sync with the CSV source.
            conn.execute("UPDATE report_rows SET label=? WHERE id=?", ("External Hall", "H21"))
            conn.execute("UPDATE tasks SET name=? WHERE id=?", ("External Hall", "H21"))


def seed(conn: sqlite3.Connection) -> None:
    for i, row in enumerate(_read_csv("skills.csv")):
        conn.execute("INSERT INTO skills VALUES (?,?,?,?,?)",
                     (row["code"], int(row["group"]), row["group_name"], row["name"], i))
    sections: dict[str, str] = {}
    for i, row in enumerate(_read_csv("report_rows.csv")):
        if row["section"] not in sections:
            sections[row["section"]] = row["section_name"]
            conn.execute("INSERT INTO sections VALUES (?,?,?)", (row["section"], row["section_name"], len(sections)))
        conn.execute("INSERT INTO report_rows VALUES (?,?,?,?,?,?,?)",
                     (row["id"], row["section"], row["label"], row["detail"], float(row["target"] or 0),
                      row.get("kpis") or "", i))
    for i, row in enumerate(_read_csv("tasks.csv")):
        skills = ";".join(x.strip() for x in (row["skills"] or "").split(";") if x.strip())
        conn.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?)",
                     (row["id"], row["row_id"], row["code"], row["name"], skills, i))
    for row in _read_csv("employees.csv"):
        conn.execute("INSERT INTO employees VALUES (?,?,?,?)", (row["badge"], row["name"], row["team"], row["role"]))
    for row in _read_csv("ilu_matrix.csv"):
        badge = row.pop("badge")
        for skill, level in row.items():
            level = (level or "").strip().upper()
            if level in ("I", "L", "U"):
                conn.execute("INSERT INTO skill_levels VALUES (?,?,?)", (badge, skill, level))
