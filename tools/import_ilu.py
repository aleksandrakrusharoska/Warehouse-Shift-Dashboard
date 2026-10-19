"""Import the real ILU matrix (Excel) into the dashboard's data files.

Usage (PyCharm terminal, project folder):
    python tools/import_ilu.py "C:\\path\\to\\ILU_Matrix.xls"

What it does
  - reads the matrix (.xls saved as binary workbook, .xlsb or .xlsx)
  - finds the header row ("Pers. No." / "Name") and the 36 skill columns
    (same order as data/skills.csv, starting at "Goods receiving / Unloading trucks")
  - writes  data/employees.csv   (badge = personnel number, name, team, WHS code)
            data/ilu_matrix.csv  (I / L / U per employee and skill)
  - keeps a backup of the old files (*.bak) and deletes whs.db so the app reloads the data

Employees without a personnel number ("External") get a badge like EXT001.
Team letters typed in Cyrillic (А, В, С) are converted to Latin (A, B, C).
"""
import csv
import shutil
import sys
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
CYRILLIC_TO_LATIN = str.maketrans({"А": "A", "В": "B", "С": "C", "Д": "D", "Е": "E"})


def read_cells(path: Path) -> dict[int, dict[int, object]]:
    """Returns {row: {col: value}} for the first sheet (0-based rows/cols)."""
    rows: dict[int, dict[int, object]] = {}
    is_xlsb = zipfile.is_zipfile(path) and "xl/workbook.bin" in zipfile.ZipFile(path).namelist()
    if is_xlsb:
        from pyxlsb import open_workbook   # pip install pyxlsb
        with open_workbook(str(path)) as wb, wb.get_sheet(1) as ws:
            for row in ws.rows():
                for c in row:
                    if c.v not in (None, ""):
                        rows.setdefault(c.r, {})[c.c] = c.v
    else:
        import openpyxl                    # pip install openpyxl
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        for r, row in enumerate(ws.iter_rows(values_only=True)):
            for c, v in enumerate(row):
                if v not in (None, ""):
                    rows.setdefault(r, {})[c] = v
    return rows


def find(rows, text):
    """First (row, col) whose cell contains text (case-insensitive)."""
    for r in sorted(rows):
        for c, v in rows[r].items():
            if isinstance(v, str) and text.lower() in v.lower():
                return r, c
    raise SystemExit(f"Could not find '{text}' in the file – is this the ILU matrix?")


def main(src: str) -> None:
    path = Path(src)
    rows = read_cells(path)
    skills = list(csv.DictReader(open(DATA / "skills.csv", encoding="utf-8")))

    head_r, persno_c = find(rows, "Pers. No")
    name_c = persno_c + 1
    team_c = name_c + 1
    whs_c = 0
    _, first_skill_c = find(rows, "Goods receiving")
    skill_cols = list(range(first_skill_c, first_skill_c + len(skills)))

    employees, levels, ext = [], [], 0
    for r in sorted(rows):
        if r <= head_r:
            continue
        d = rows[r]
        first = str(d.get(0, ""))
        if first.lower().startswith("number of qualified"):
            break
        name = str(d.get(name_c, "")).strip()
        if not name:
            continue
        lv = [str(d.get(c, "")).strip().upper() for c in skill_cols]
        if not any(x in ("I", "L", "U") for x in lv):
            continue                                   # not an employee row
        persno = d.get(persno_c)
        if isinstance(persno, (int, float)):
            badge = str(int(persno))
        else:
            ext += 1
            badge = f"EXT{ext:03d}"
        team = str(d.get(team_c, "")).strip().upper().translate(CYRILLIC_TO_LATIN)
        employees.append((badge, " ".join(name.split()), team, str(d.get(whs_c, "")).strip()))
        levels.append([badge] + [x if x in ("I", "L", "U") else "" for x in lv])

    seen = set()
    for e in employees:
        if e[0] in seen:
            raise SystemExit(f"Personnel number {e[0]} appears twice – please fix the matrix.")
        seen.add(e[0])

    for f in ("employees.csv", "ilu_matrix.csv"):
        if (DATA / f).exists():
            shutil.copy(DATA / f, DATA / (f + ".bak"))
    with open(DATA / "employees.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["badge", "name", "team", "role"])
        w.writerows(employees)
    with open(DATA / "ilu_matrix.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["badge"] + [s["code"] for s in skills])
        w.writerows(levels)
    (BASE / "whs.db").unlink(missing_ok=True)

    teams: dict[str, int] = {}
    for e in employees:
        teams[e[2]] = teams.get(e[2], 0) + 1
    print(f"Imported {len(employees)} employees, {len(skills)} skills.")
    print("Per team:", ", ".join(f"{k}: {v}" for k, v in sorted(teams.items())))
    print("Restart the app – the database is rebuilt from the new files.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
