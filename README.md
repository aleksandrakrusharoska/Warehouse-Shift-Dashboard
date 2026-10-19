# WHS Shift Dashboard

Digital version of the **Warehouse Shift Handover / Shift Change Report** for the shift leader:
a vertical **3D warehouse map**, pop-ups per area → report line → task, **badge scanning** to assign people
(checked against the **ILU matrix**), and the report columns *Actual Distribution* and *Employees* filled automatically.

Backend: **FastAPI + SQLite** (standard library, no DB server).
Frontend: **plain HTML + Bootstrap 5 + vanilla JS**, 3D map in plain CSS 3D.

## Start in PyCharm

1. *File → Open…* → select the `whs_shift_dashboard` folder.
2. *Settings → Project → Python Interpreter → Add Interpreter → Virtualenv* (Python 3.10+).
3. Terminal (with the virtualenv active): `python -m pip install -r requirements.txt`
4. Run: the run configuration **WHS Dashboard**, or right-click `run.py` → **Run**, or `uvicorn app.main:app --reload`
5. Open <http://127.0.0.1:8000> (API docs: `/docs`).

Quick test: **⋯ → Demo: fill the shift with scans**, or open any task and click a *demo badge*.

## Workflow

```
3D map / shift overview ──click──► Section pop-up            e.g. Main WHS - Production Material Transport
                                     IM 0.5 · EP 0.6 · Assembly 2 · Assembly 1 · OBC 0.6
                                   ──click IM──► Line pop-up: FG Pick-up, FG Packaging (+ report columns, remark)
                                   ──click FG Pick-up──► Task pop-up: status + SCAN BADGE
```

* **Scan a badge in the task pop-up** → the person is assigned to that task.
  Only people with **L or U in all ILU skills of the task** are accepted (others: "Not qualified").
  Scanning the same badge again removes the person (a second read within 2 s is ignored).
  One person may work on several tasks (e.g. FG Pick-up *and* FG Packaging of IM 0.5).
* Lines with only one task (Receiving, Shipping, Sorting, Traymaster …) open the task directly.
* Every line shows the report columns: **Distribution** (target), **Actual Distribution** (number of people),
  **Employees** (full names, separated by commas), a **remark** for non-working lines/areas,
  and for Receiving/Shipping the values Pallets / Deliveries / Delivery Notes.
* **Shift report** (header) shows the whole report table; **Print** prints it.

### Status colours (outline on the map, pills in the pop-ups)

| | Task | Line / section / area |
|---|---|---|
| Green – Target reached | at least 1 person assigned | all tasks have someone |
| Yellow – Under | – | 75 % or more of the tasks have someone |
| Red – Understaffed | nobody assigned | fewer than 75 % of the tasks |

75 % = `UNDER_THRESHOLD` in `app/services.py`.

### Attendance
Present = people scanned into at least one task. Absent = team size − present.
Workload coverage OK when present ≥ total distribution (22). Planned absenteeism 5 % = `PLANNED_ABSENTEEISM_PCT`.

## Data (CSV, folder `data/`)

| File | Content |
|---|---|
| `report_rows.csv` | the report lines: section, label (IM, EP…), detail, **target** (0.5, 0.6 …), extra values (`Pallets;Deliveries`) |
| `tasks.csv` | tasks per line (IM → FG Pick-up, FG Packaging) and the **ILU skills** needed (`3.5;3.4`, empty = anyone) |
| `skills.csv` | the 36 skills of the ILU matrix |
| `employees.csv`, `ilu_matrix.csv` | **sample** people and their I / L / U levels |

**Please check the task → skill mapping in `tasks.csv`** (e.g. FG Packaging → 3.4 is a guess).
After changing a CSV: delete `whs.db` and restart.

### Load the real ILU matrix
```
python tools/import_ilu.py "C:\path\to\ILU_Matrix.xls"
```
Writes `employees.csv` + `ilu_matrix.csv` (old files kept as `.bak`) and deletes `whs.db`. Badge = personnel number.

## Map (`static/js/layout.js`, `static/js/scene3d.js`)

The *Warehouse layout* card follows the design mockup `warehouse-layout-3d.html`: a CSS-3D floor tilted 48°
(no WebGL), white pill labels standing on the floor with a line + pin, status-coloured pictograms, and a
summary line under the map (zones understaffed / partially staffed / at target). The Shift report is below the map.

`layout.js` holds what is interactive, in floor units (hall floor 700 × 830, lower hall drawn at 55 % depth):

```js
{id: "PICK", opens: {section: "PICK"}, color: "#1E66F5", zone: [216, 294, 378, 284], label: [405, 562], stem: 60, main: true},
{id: "SORT", opens: {row: "SRT"},      color: "#8E24AA", zone: [300, 4, 96, 56],    label: [345, 50],  stem: 60, count: false},
```
* `opens` – whole report section or one report line; `color` – floor fill and the edge colour in the Shift report.
* `label` – floor point the label stands on, `stem` – length of its line; the number on the label is the
  people assigned (`count: false` hides it).
* **`WORKERS`** / **`FORKLIFTS`** – `{row: "ASM_P", pos: [390, 486]}`. Hover shows the line name, click opens that
  line → choose a task → scan the badge. Badge colour = status of the line.

Walls, trucks, racks, doors (« » in / out arrows) and the Hall 21 building are drawn in `scene3d.js`.

## Language
EN / MK switch in the header; all texts in `static/js/i18n.js`.

## Project structure
```
app/main.py        API routes          app/services.py  statuses, scan → assign, report columns
app/db.py          SQLite + CSV seed   tools/import_ilu.py  import of the real ILU matrix
static/index.html  page                static/js/app.js     pop-ups, overview, report, scan log, ILU
static/js/layout.js  map areas         static/js/scene3d.js 3D scene (CSS 3D)
static/js/i18n.js  EN / MK texts       static/css/style.css  design
```
