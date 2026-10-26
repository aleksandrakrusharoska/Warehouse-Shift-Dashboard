"""Business logic.

Structure (from the WHS Shift Change Report):
    section  (Main WHS - Production Material Transport)
      └ line (report row)  IM  "FG Pick-up & FG Packaging"   target 0.5
          └ task           FG Pick-up, FG Packaging

Status rules
    task     : at least 1 person assigned -> "ok" (Target reached), nobody -> "critical" (Understaffed)
    line/section/area : share of its tasks that have someone
                 100 %             -> ok       (green)
                 >= UNDER_THRESHOLD -> warning  (yellow, "Under")
                 below             -> critical (red, "Understaffed")

Report columns that are filled automatically for every line:
    Actual Distribution = number of different people assigned to the line's tasks
    Employees           = their full names, separated by commas
"""
import random
import sqlite3
from datetime import datetime, timedelta

UNDER_THRESHOLD = 0.75
PLANNED_ABSENTEEISM_PCT = 5
SHIFT_START_HOURS = (6, 14, 22)   # day, afternoon, night (same shifts as SHIFTS in app.js)
LATE_AFTER_MINUTES = 15           # first scan later than this after the shift start = late
EARLY_BEFORE_MINUTES = 30         # a scan up to this long before a shift start belongs to that shift (on time)
DOUBLE_READ_SECONDS = 2
RANK = {"I": 1, "L": 2, "U": 3}


class ServiceError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _seconds_between(start_iso: str, end_iso: str | None = None) -> int:
    """Return whole seconds between two ISO timestamps."""
    start = datetime.fromisoformat(start_iso)
    end = datetime.fromisoformat(end_iso) if end_iso else datetime.now()
    return max(0, int((end - start).total_seconds()))


def _format_state(row: sqlite3.Row | None) -> dict:
    """Return current employee time information for the frontend."""
    if not row or not row["shift_started_at"]:
        return {
            "work_status": "NOT_STARTED",
            "worked_seconds": 0,
            "break_seconds": 0,
            "shift_started_at": None,
            "break_started_at": None,
            "shift_ended_at": None,
            "active": False,
        }

    break_seconds = int(row["break_seconds"] or 0)

    # If the employee is currently on break, include the still-running break.
    if row["break_started_at"] and not row["shift_ended_at"]:
        break_seconds += _seconds_between(row["break_started_at"])

    # If the shift has ended, calculate time until the end of shift.
    end_time = row["shift_ended_at"] or now()
    total_seconds = _seconds_between(row["shift_started_at"], end_time)
    worked_seconds = max(0, total_seconds - break_seconds)

    if row["shift_ended_at"]:
        work_status = "FINISHED"
    elif row["break_started_at"]:
        work_status = "ON_BREAK"
    else:
        work_status = "WORKING"

    return {
        "work_status": work_status,
        "worked_seconds": worked_seconds,
        "break_seconds": break_seconds,
        "shift_started_at": row["shift_started_at"],
        "break_started_at": row["break_started_at"],
        "shift_ended_at": row["shift_ended_at"],
        "active": work_status == "WORKING",
    }


def _employee_time_state(conn, badge: str) -> dict:
    row = conn.execute(
        "SELECT * FROM employee_shift_state WHERE badge=?",
        (badge,)
    ).fetchone()

    return _format_state(row)


def _ensure_shift_started(conn, badge: str, task_id: str | None = None) -> dict:
    """
    Start the employee's work time when they are first assigned to a task.
    Does not restart a finished shift.
    """
    row = conn.execute(
        "SELECT * FROM employee_shift_state WHERE badge=?",
        (badge,)
    ).fetchone()

    if not row:
        ts = now()

        conn.execute(
            """
            INSERT INTO employee_shift_state
            (badge, shift_started_at, break_started_at, break_seconds, shift_ended_at)
            VALUES (?, ?, NULL, 0, NULL)
            """,
            (badge, ts),
        )

        conn.execute(
            """
            INSERT INTO time_events (badge, event_type, task_id, ts)
            VALUES (?, 'SHIFT_START', ?, ?)
            """,
            (badge, task_id, ts),
        )

        _log(
            conn,
            badge,
            badge,
            task_id,
            "SHIFT_START",
            f"Shift started for {badge}."
        )

        return _employee_time_state(conn, badge)

    return _format_state(row)


def start_break(conn, badge: str) -> dict:
    employee = conn.execute(
        "SELECT name FROM employees WHERE badge=?",
        (badge,)
    ).fetchone()

    if not employee:
        raise ServiceError("Employee not found", 404)

    row = conn.execute(
        "SELECT * FROM employee_shift_state WHERE badge=?",
        (badge,)
    ).fetchone()

    if not row:
        raise ServiceError(f"{employee['name']} has not started the shift.", 409)

    if row["shift_ended_at"]:
        raise ServiceError(f"{employee['name']} has already finished the shift.", 409)

    if row["break_started_at"]:
        raise ServiceError(f"{employee['name']} is already on break.", 409)

    ts = now()

    conn.execute(
        "UPDATE employee_shift_state SET break_started_at=? WHERE badge=?",
        (ts, badge),
    )

    conn.execute(
        """
        INSERT INTO time_events (badge, event_type, task_id, ts)
        VALUES (?, 'BREAK_START', NULL, ?)
        """,
        (badge, ts),
    )

    _log(
        conn,
        badge,
        badge,
        None,
        "BREAK_START",
        f"{employee['name']} started a food break."
    )

    return _employee_time_state(conn, badge)


def end_break(conn, badge: str) -> dict:
    employee = conn.execute(
        "SELECT name FROM employees WHERE badge=?",
        (badge,)
    ).fetchone()

    if not employee:
        raise ServiceError("Employee not found", 404)

    row = conn.execute(
        "SELECT * FROM employee_shift_state WHERE badge=?",
        (badge,)
    ).fetchone()

    if not row or not row["break_started_at"]:
        raise ServiceError(f"{employee['name']} is not currently on break.", 409)

    seconds = _seconds_between(row["break_started_at"])
    ts = now()

    conn.execute(
        """
        UPDATE employee_shift_state
        SET break_seconds    = break_seconds + ?,
            break_started_at = NULL
        WHERE badge = ?
        """,
        (seconds, badge),
    )

    conn.execute(
        """
        INSERT INTO time_events (badge, event_type, task_id, ts)
        VALUES (?, 'BREAK_END', NULL, ?)
        """,
        (badge, ts),
    )

    _log(
        conn,
        badge,
        badge,
        None,
        "BREAK_END",
        f"{employee['name']} returned from food break."
    )

    return _employee_time_state(conn, badge)


def end_shift(conn, badge: str) -> dict:
    employee = conn.execute(
        "SELECT name FROM employees WHERE badge=?",
        (badge,)
    ).fetchone()

    if not employee:
        raise ServiceError("Employee not found", 404)

    row = conn.execute(
        "SELECT * FROM employee_shift_state WHERE badge=?",
        (badge,)
    ).fetchone()

    if not row:
        raise ServiceError(f"{employee['name']} has not started the shift.", 409)

    if row["shift_ended_at"]:
        raise ServiceError(f"{employee['name']} has already finished the shift.", 409)

    ts = now()
    extra_break_seconds = 0

    # If the employee ends the shift while on break,
    # close the break automatically first.
    if row["break_started_at"]:
        extra_break_seconds = _seconds_between(row["break_started_at"])

    conn.execute(
        """
        UPDATE employee_shift_state
        SET break_seconds    = break_seconds + ?,
            break_started_at = NULL,
            shift_ended_at   = ?
        WHERE badge = ?
        """,
        (extra_break_seconds, ts, badge),
    )

    conn.execute(
        """
        INSERT INTO time_events (badge, event_type, task_id, ts)
        VALUES (?, 'SHIFT_END', NULL, ?)
        """,
        (badge, ts),
    )

    _log(
        conn,
        badge,
        badge,
        None,
        "SHIFT_END",
        f"{employee['name']} finished the shift."
    )

    return _employee_time_state(conn, badge)


def status_of(covered: int, total: int) -> str:
    if total == 0:
        return "inactive"
    if covered >= total:
        return "ok"
    return "warning" if covered / total >= UNDER_THRESHOLD else "critical"


def _team_filter(team: str | None, alias: str = "e") -> tuple[str, tuple]:
    return (f" AND {alias}.team = ?", (team,)) if team else ("", ())


def _levels(conn, badge: str) -> dict[str, str]:
    return {r["skill_code"]: r["level"] for r in
            conn.execute("SELECT skill_code, level FROM skill_levels WHERE badge=?", (badge,))}


def task_level(levels: dict[str, str], skills: list[str]) -> str | None:
    """Lowest ILU level over the task's skills (None if a skill is missing). No skills = 'U' (anyone)."""
    if not skills:
        return "U"
    if not all(s in levels for s in skills):
        return None
    return min((levels[s] for s in skills), key=RANK.get)


# ---------------------------------------------------------------- the whole picture in one call
def get_overview(conn, team: str | None = None) -> dict:
    skills = {r["code"]: dict(r) for r in conn.execute("SELECT code, grp, group_name, name FROM skills")}
    tf, tp = _team_filter(team)
    assigned: dict[str, list[dict]] = {}
    for r in conn.execute(
            "SELECT a.task_id, a.assigned_at, e.badge, e.name, e.team FROM assignments a "
            "JOIN employees e ON e.badge = a.badge WHERE 1=1" + tf + " ORDER BY a.assigned_at", tp):
        assigned.setdefault(r["task_id"], []).append(dict(r))

    level_cache: dict[str, dict] = {}
    tasks_by_row: dict[str, list[dict]] = {}
    for t in conn.execute("SELECT * FROM tasks ORDER BY sort_order"):
        sk = [s for s in t["skills"].split(";") if s]
        people = assigned.get(t["id"], [])
        for p in people:
            if p["badge"] not in level_cache:
                level_cache[p["badge"]] = _levels(conn, p["badge"])

            # Existing ILU qualification for this task
            p["ilu"] = task_level(level_cache[p["badge"]], sk)

            # New: adds working/break/finished status and time totals
            p.update(_employee_time_state(conn, p["badge"]))
        tasks_by_row.setdefault(t["row_id"], []).append({
            "id": t["id"], "code": t["code"], "name": t["name"],
            "skills": [skills[s] for s in sk if s in skills],
            "people": people, "actual": len(people),
            "status": "ok" if people else "critical",
        })

    remarks = {r["row_id"]: r["remark"] for r in conn.execute("SELECT * FROM row_notes")}
    kpi_values: dict[str, dict[str, str]] = {}
    for r in conn.execute("SELECT * FROM row_kpis"):
        kpi_values.setdefault(r["row_id"], {})[r["name"]] = r["value"]
    sections, total_target, all_people = [], 0.0, set()
    for s in conn.execute("SELECT * FROM sections ORDER BY sort_order"):
        rows, s_cov, s_tot = [], 0, 0
        for r in conn.execute("SELECT * FROM report_rows WHERE section_code=? ORDER BY sort_order", (s["code"],)):
            tasks = tasks_by_row.get(r["id"], [])
            covered = sum(1 for t in tasks if t["actual"])
            names: dict[str, str] = {}
            for t in tasks:
                for p in t["people"]:
                    names[p["badge"]] = p["name"]
            all_people.update(names)
            rows.append({
                "id": r["id"], "label": r["label"], "detail": r["detail"], "target": r["target"],
                "remark": remarks.get(r["id"], ""),
                "kpis": [{"name": k, "value": kpi_values.get(r["id"], {}).get(k, "")}
                         for k in r["kpis"].split(";") if k],
                "tasks": tasks, "covered": covered, "task_count": len(tasks),
                "actual": len(names), "employees": ", ".join(names.values()),
                "status": status_of(covered, len(tasks)),
            })
            s_cov += covered;
            s_tot += len(tasks);
            total_target += r["target"]
        sections.append({
            "code": s["code"], "name": s["name"], "rows": rows,
            "covered": s_cov, "task_count": s_tot,
            "target": round(sum(r["target"] for r in rows), 1),
            "actual": len({b for r in rows for t in r["tasks"] for b in (p["badge"] for p in t["people"])}),
            "status": status_of(s_cov, s_tot),
        })
    return {"sections": sections, "total_target": round(total_target, 1), "total_actual": len(all_people)}


def _is_late(started_iso: str) -> bool:
    """First scan more than LATE_AFTER_MINUTES after the start of its shift. A scan up to
    EARLY_BEFORE_MINUTES before a shift start counts for that shift (13:50 → 14:00 shift, on time)."""
    started = datetime.fromisoformat(started_iso)
    ref = started + timedelta(minutes=EARLY_BEFORE_MINUTES)
    shift_start = None
    for hour in sorted(SHIFT_START_HOURS, reverse=True):
        if ref.hour >= hour:
            shift_start = ref.replace(hour=hour, minute=0, second=0, microsecond=0)
            break
    if shift_start is None:   # after midnight: the night shift started yesterday
        shift_start = (ref - timedelta(days=1)).replace(hour=max(SHIFT_START_HOURS), minute=0, second=0, microsecond=0)
    return (started - shift_start).total_seconds() > LATE_AFTER_MINUTES * 60


def get_attendance(conn, team: str | None = None) -> dict:
    """Attendance block of the report. Present = people scanned into at least one task;
    late = present people whose first scan was more than LATE_AFTER_MINUTES after the shift start."""
    tf, tp = _team_filter(team)
    total = conn.execute("SELECT COUNT(*) FROM employees e WHERE 1=1" + tf, tp).fetchone()[0]
    present = conn.execute("SELECT COUNT(DISTINCT a.badge) FROM assignments a JOIN employees e "
                           "ON e.badge = a.badge WHERE 1=1" + tf, tp).fetchone()[0]
    starts = conn.execute("SELECT ess.shift_started_at FROM employee_shift_state ess JOIN employees e "
                          "ON e.badge = ess.badge WHERE ess.badge IN (SELECT badge FROM assignments)" + tf, tp)
    late = sum(1 for r in starts if _is_late(r["shift_started_at"]))
    needed = conn.execute("SELECT COALESCE(SUM(target), 0) FROM report_rows").fetchone()[0]
    absent = max(total - present, 0)
    return {
        "total": total, "absent": absent, "present": present, "late": late,
        "planned_pct": PLANNED_ABSENTEEISM_PCT,
        "actual_absent_pct": round(absent / total * 100) if total else 0,
        "needed": round(needed, 1), "coverage_ok": present >= needed,
    }


def get_work_time_analytics(conn, team: str | None = None) -> dict:
    """Work-time analytics for the current shift."""

    tf, tp = _team_filter(team)

    rows = conn.execute(
        """
        SELECT
            e.badge,
            e.name,
            e.team,

            ess.shift_started_at,
            ess.break_started_at,
            COALESCE(ess.break_seconds, 0) AS break_seconds,
            ess.shift_ended_at,

            GROUP_CONCAT(DISTINCT t.name) AS current_tasks

        FROM employees e

        LEFT JOIN employee_shift_state ess
            ON ess.badge = e.badge

        LEFT JOIN assignments a
            ON a.badge = e.badge

        LEFT JOIN tasks t
            ON t.id = a.task_id

        WHERE 1 = 1
        """
        + tf
        + """
        GROUP BY
            e.badge,
            e.name,
            e.team,
            ess.shift_started_at,
            ess.break_started_at,
            ess.break_seconds,
            ess.shift_ended_at

        ORDER BY e.name
        """,
        tp,
    ).fetchall()

    employees = []

    for row in rows:
        employee = {
            "badge": row["badge"],
            "name": row["name"],
            "team": row["team"],
            "current_tasks": row["current_tasks"] or "",
        }

        # Calculates Working / On break / Finished / Not started
        # and worked_seconds / break_seconds.
        employee.update(_format_state(row))

        employees.append(employee)

    started_employees = [
        employee
        for employee in employees
        if employee["work_status"] != "NOT_STARTED"
    ]

    counts = {
        "WORKING": sum(
            1 for employee in employees
            if employee["work_status"] == "WORKING"
        ),
        "ON_BREAK": sum(
            1 for employee in employees
            if employee["work_status"] == "ON_BREAK"
        ),
        "FINISHED": sum(
            1 for employee in employees
            if employee["work_status"] == "FINISHED"
        ),
        "NOT_STARTED": sum(
            1 for employee in employees
            if employee["work_status"] == "NOT_STARTED"
        ),
    }

    total_worked_seconds = sum(
        employee["worked_seconds"]
        for employee in started_employees
    )

    total_break_seconds = sum(
        employee["break_seconds"]
        for employee in started_employees
    )

    average_worked_seconds = round(
        total_worked_seconds / len(started_employees)
    ) if started_employees else 0

    return {
        "counts": counts,
        "total_worked_seconds": total_worked_seconds,
        "total_break_seconds": total_break_seconds,
        "average_worked_seconds": average_worked_seconds,
        "employees": employees,
    }


def get_ilu_matrix(conn, team: str | None = None) -> dict:
    skills = [dict(r) for r in conn.execute("SELECT code, grp, group_name, name FROM skills ORDER BY sort_order")]
    levels: dict[str, dict[str, str]] = {}
    for r in conn.execute("SELECT * FROM skill_levels"):
        levels.setdefault(r["badge"], {})[r["skill_code"]] = r["level"]
    tf, tp = _team_filter(team)
    employees = [{**dict(e), "levels": levels.get(e["badge"], {})}
                 for e in conn.execute("SELECT * FROM employees e WHERE 1=1" + tf + " ORDER BY team, name", tp)]
    return {"skills": skills, "employees": employees}


def get_scans(conn, limit: int = 50, team: str | None = None) -> list[dict]:
    tf, tp = _team_filter(team)
    return [dict(r) for r in conn.execute("""
        SELECT s.*, e.name, e.team, t.name AS task_name, t.code AS task_code, r.label AS row_label
        FROM scan_events s
        LEFT JOIN employees e ON e.badge = s.badge
        LEFT JOIN tasks t ON t.id = s.task_id
        LEFT JOIN report_rows r ON r.id = t.row_id
        WHERE 1=1""" + tf + " ORDER BY s.id DESC LIMIT ?", (*tp, limit))]


# ---------------------------------------------------------------- writes
def _log(conn, code, badge, task_id, event, message):
    conn.execute("INSERT INTO scan_events (ts, code, badge, task_id, event, message) VALUES (?,?,?,?,?,?)",
                 (now(), code, badge, task_id, event, message))


def _task(conn, task_id: str) -> sqlite3.Row:
    t = conn.execute("SELECT t.*, r.label AS row_label FROM tasks t JOIN report_rows r ON r.id = t.row_id "
                     "WHERE t.id=?", (task_id,)).fetchone()
    if not t:
        raise ServiceError("Task not found", 404)
    return t


def scan_to_task(conn, task_id: str, code: str, move: bool = False) -> dict:
    """The shift leader scans a badge inside a task pop-up:
         not on the task -> assigned (only with L or U in ALL skills of the task)
         already on it   -> removed again (a second read within 2 s is ignored as a double read)
         on another task -> nothing changes, the pop-up asks first ("ELSEWHERE");
                            scanned again with move=True -> taken off the other task(s) and assigned here"""
    t = _task(conn, task_id)
    code = code.strip().upper()
    e = conn.execute("SELECT * FROM employees WHERE badge=?", (code,)).fetchone()
    if not e:
        _log(conn, code, None, task_id, "ERROR", f"Unknown barcode '{code}'.")
        return {"ok": False, "event": "ERROR", "code": code}
    existing = conn.execute("SELECT assigned_at FROM assignments WHERE badge=? AND task_id=?",
                            (code, task_id)).fetchone()
    if existing:
        if (datetime.now() - datetime.fromisoformat(existing["assigned_at"])).total_seconds() < DOUBLE_READ_SECONDS:
            _log(conn, code, code, task_id, "DUPLICATE", f"{e['name']} is already on {t['name']}.")
            return {"ok": True, "event": "DUPLICATE", "name": e["name"], "code": code}
        conn.execute("DELETE FROM assignments WHERE badge=? AND task_id=?", (code, task_id))
        _log(conn, code, code, task_id, "REMOVED", f"{e['name']} removed from {t['name']}.")
        return {"ok": True, "event": "REMOVED", "name": e["name"], "code": code}

    # Check break / finished first WITHOUT starting the work time (the person may still be refused).
    time_state = _employee_time_state(conn, code)

    if time_state["work_status"] == "FINISHED":
        _log(conn, code, code, task_id, "REFUSED", f"{e['name']} has already finished the shift.")
        return {
            "ok": False,
            "event": "REFUSED",
            "name": e["name"],
            "code": code,
        }

    if time_state["work_status"] == "ON_BREAK":
        _log(conn, code, code, task_id, "REFUSED", f"{e['name']} is currently on break.")
        return {
            "ok": False,
            "event": "REFUSED",
            "name": e["name"],
            "code": code,
        }

    needed = [x for x in t["skills"].split(";") if x]
    level = task_level(_levels(conn, code), needed)
    if level not in ("L", "U"):
        _log(conn, code, code, task_id, "REFUSED", f"{e['name']} is not qualified for {t['name']}.")
        return {"ok": False, "event": "REFUSED", "name": e["name"], "level": level, "code": code, "skills": needed}
    # A person works on one position at a time: already on another task -> ask before moving.
    elsewhere = [r["task_id"] for r in conn.execute(
        "SELECT task_id FROM assignments WHERE badge=? AND task_id<>?", (code, task_id))]
    if elsewhere and not move:
        return {"ok": False, "event": "ELSEWHERE", "name": e["name"], "code": code, "tasks": elsewhere}
    for other_id in elsewhere:
        other = _task(conn, other_id)
        conn.execute("DELETE FROM assignments WHERE badge=? AND task_id=?", (code, other_id))
        _log(conn, code, code, other_id, "REMOVED",
             f"{e['name']} moved from {other['row_label']} · {other['name']} to {t['row_label']} · {t['name']}.")
    # Qualified -> the work time starts with the first assignment of the shift.
    _ensure_shift_started(conn, code, task_id)
    conn.execute("INSERT INTO assignments VALUES (?,?,?)", (code, task_id, now()))
    _log(conn, code, code, task_id, "ASSIGNED", f"{e['name']} → {t['row_label']} · {t['name']}.")
    return {"ok": True, "event": "MOVED" if elsewhere else "ASSIGNED", "name": e["name"], "level": level, "code": code}


def set_remark(conn, row_id: str, remark: str) -> None:
    if not conn.execute("SELECT 1 FROM report_rows WHERE id=?", (row_id,)).fetchone():
        raise ServiceError("Line not found", 404)
    conn.execute("INSERT INTO row_notes VALUES (?,?) ON CONFLICT(row_id) DO UPDATE SET remark=excluded.remark",
                 (row_id, remark.strip()))


def set_kpi(conn, row_id: str, name: str, value: str) -> None:
    r = conn.execute("SELECT kpis FROM report_rows WHERE id=?", (row_id,)).fetchone()
    if not r or name not in r["kpis"].split(";"):
        raise ServiceError("Unknown value", 404)
    conn.execute("INSERT INTO row_kpis VALUES (?,?,?) ON CONFLICT(row_id, name) DO UPDATE SET value=excluded.value",
                 (row_id, name, value.strip()))


def unassign(conn, task_id: str, badge: str) -> None:
    t = _task(conn, task_id)
    e = conn.execute("SELECT name FROM employees WHERE badge=?", (badge,)).fetchone()
    if conn.execute("DELETE FROM assignments WHERE badge=? AND task_id=?", (badge, task_id)).rowcount:
        _log(conn, badge, badge, task_id, "REMOVED", f"{e['name'] if e else badge} removed from {t['name']}.")


def new_shift(conn) -> None:
    conn.execute("DELETE FROM assignments")
    conn.execute("DELETE FROM row_notes")
    conn.execute("DELETE FROM row_kpis")
    conn.execute("DELETE FROM employee_shift_state")
    conn.execute("DELETE FROM time_events")


def demo_fill(conn) -> int:
    """Demo: assigns a qualified person to about 80 % of the tasks.
    A person works on one position at a time (same rule as the scan), so only people
    without any assignment are used – each of them once."""
    rnd = random.Random()
    people = [r["badge"] for r in conn.execute("SELECT badge FROM employees")]
    levels = {b: _levels(conn, b) for b in people}
    busy = {r["badge"] for r in conn.execute("SELECT DISTINCT badge FROM assignments")}
    count = 0

    for t in conn.execute("SELECT * FROM tasks ORDER BY sort_order").fetchall():
        if rnd.random() > 0.8:
            continue

        sk = [s for s in t["skills"].split(";") if s]
        qualified_people = [
            b for b in people
            if b not in busy and task_level(levels[b], sk) in ("L", "U")
        ]

        if not qualified_people:
            continue

        badge = rnd.choice(qualified_people)

        # Creates SHIFT_START state and event if this employee has not started yet.
        _ensure_shift_started(conn, badge, t["id"])

        # Assign employee to this task.
        conn.execute(
            "INSERT INTO assignments VALUES (?,?,?)",
            (badge, t["id"], now())
        )

        _log(
            conn,
            badge,
            badge,
            t["id"],
            "ASSIGNED",
            "demo"
        )

        busy.add(badge)
        count += 1

    return count
