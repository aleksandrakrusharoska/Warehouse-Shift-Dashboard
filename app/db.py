"""SQLite storage (Python standard library, no database server needed).

When the environment variable DATABASE_URL is set (e.g. Supabase on Render), PostgreSQL is used instead.
The queries in services.py stay written for SQLite; _PgConnection translates the few differences.

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
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = BASE_DIR / "whs.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

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


# ---------------------------------------------------------------- PostgreSQL (DATABASE_URL)
class _PgRow(dict):
    """Row readable by name and by position, like sqlite3.Row."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def _pg_row_factory(cursor):
    names = [c.name for c in cursor.description or []]
    return lambda values: _PgRow(zip(names, values))


_GROUP_CONCAT = re.compile(r"GROUP_CONCAT\((DISTINCT\s+)?([^)]+)\)", re.IGNORECASE)


def _to_pg(sql: str) -> str:
    sql = sql.replace("%", "%%").replace("?", "%s")
    sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    return _GROUP_CONCAT.sub(r"STRING_AGG(\1\2, ',')", sql)


class _PgConnection:
    """The subset of the sqlite3.Connection API used by this app, on a psycopg connection."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql: str, params=()):
        return self._conn.execute(_to_pg(sql), tuple(params))

    def executescript(self, sql: str):
        self._conn.execute(_to_pg(sql).replace("%%", "%"))

    def commit(self):
        self._conn.commit()


_pg_pool = None


def _get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        from psycopg_pool import ConnectionPool
        # prepare_threshold=None: no server-side prepared statements, so the Supabase pooler works in every mode.
        _pg_pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, open=True,
                                  kwargs={"prepare_threshold": None, "row_factory": _pg_row_factory})
    return _pg_pool


@contextmanager
def get_conn():
    if DATABASE_URL:
        with _get_pg_pool().connection() as pg:   # commits on success, rolls back on error
            yield _PgConnection(pg)
        return
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
            # A line moved to another section in report_rows.csv (e.g. Traymaster, Sorting → Support & back-up).
            for row in _read_csv("report_rows.csv"):
                conn.execute("UPDATE report_rows SET section_code=? WHERE id=?", (row["section"], row["id"]))


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
