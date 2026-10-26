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

## Map (`static/js/layout.js`, `static/js/scene3d.js`, `static/models/`)

The *Warehouse layout* card is a real 3D scene (Three.js 0.160 from jsDelivr), seen from the south, on a warehouse
photo (`static/img/warehouse-bg.jpg`, the 3D scene is transparent around the building): Hall 21 (gable roof) and four trucks (blue cab, white trailer) at the docks with green
delivery arrows; the building with a low white fence and posts: Sorting · Traymaster · Support & back-up along the north
side, Incom. / Outg. WHS (two rows of pallet places), Main WHS – Picking (four storage rows, three tall pick racks),
Production Material Transport (two pairs of rows each side of the main aisle) and the Repack / Kitting room; door
houses with « on the west side, flow arrows in the aisles. Shadows, render on demand (no animation loop).

* **3D models** (`static/models/`, authors and licenses in `static/models/CREDITS.md`): workers, wooden pallet,
  cardboard boxes. Trucks, forklifts, racks, the fence, doors and buildings are built in code.
* **Live layer**: HTML labels with a status dot and the number of people, on a post with a pin. The people and
  forklifts of a report line stand on a floor ring in the status colour of their line (no badges); they and the zones
  are hovered / clicked in 3D (raycast).

`layout.js` holds what is interactive, in floor units (1 unit = 10 cm, x east, y south):

```js
{id: "PICK", opens: {section: "PICK"}, color: "#AE9BEA", zone: [258, 290, 340, 290], label: [400, 440], stem: 8, maxw: 360},
{id: "SORT", opens: {row: "SRT"},      color: "#F0768C", zone: [218, 2, 128, 78],    label: [282, 40],  stem: 55, maxw: 240, count: false},
```
* `opens` – whole report section or one report line; `color` – floor colour of the zone, hover outline and the edge colour in the Shift report.
* `zone` – coloured, clickable rectangle (Hall 21: `ext: true`, the building is clickable); `label` – floor point of the
  label's pin, `stem` – height of its post; `maxw` – widest label (longer names end in "…");
  the number on the label is the people assigned (`count: false` hides it).
* **`WORKERS`** / **`FORKLIFTS`** – `{row: "ASM_P", pos: [431, 350]}`: a 3D person / forklift there. Hover shows the
  line name, click opens that line → choose a task → scan the badge. Ring colour = status of the line.
* The fence, doors, racks, pallet stacks, trucks … are placed in `scene3d.js`, one line per object in floor units,
  e.g. `fence(-60, 580, -60, 920, [[628, 658]])`, `westDoor(-60, 628)`, `rack(282, 312, 136, 26)`, `stack(240, 110, 30, 30, 1.4)`.
  Forklifts of report lines take `rot` (heading in degrees) in `FORKLIFTS`.

**Header:** date, current shift (`SHIFTS` in `app.js`: 06–14 day, 14–22 afternoon, 22–06 night) and
*Operations live* with the time of the last successful refresh (red when the server can't be reached).
**Shift report:** attendance tiles, one card per area (progress = share of tasks staffed), Total per Shift.

## Language
EN / MK switch in the header; all texts in `static/js/i18n.js`.

## Project structure
```
app/main.py        API routes          app/services.py  statuses, scan → assign, report columns
app/db.py          SQLite/Postgres + CSV seed  tools/import_ilu.py  import of the real ILU matrix
static/index.html  page                static/js/app.js     pop-ups, overview, report, scan log, ILU
static/js/layout.js  map areas         static/js/scene3d.js 3D scene (CSS 3D)
static/js/i18n.js  EN / MK texts       static/css/style.css  design
```

## Deployment (Render + Supabase)

Locally the app uses SQLite (`whs.db`). When the environment variable `DATABASE_URL` is set it uses PostgreSQL
instead – needed on Render, whose disk is wiped on every deploy / restart. Tables and CSV data are created on first start.

1. **Supabase** → *New project* (pick a region close to the Render region, e.g. Frankfurt). Note the database password.
   *Connect* → **Session pooler** → copy the URI (Render has no IPv6, so not the *Direct connection*), e.g.
   `postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`.
2. Push this repository to GitHub.
3. **Render** → *New* → *Blueprint* → pick the repository (`render.yaml` is read). Paste the URI as `DATABASE_URL`.
   `TZ` (time zone for shift / break times) is set to `Europe/Skopje` in `render.yaml`.
4. Open `https://<service>.onrender.com`. The free plan sleeps after 15 min without traffic (first request ~1 min).

After changing a CSV in production: in Supabase *SQL Editor* run
`DROP TABLE time_events, employee_shift_state, scan_events, row_kpis, row_notes, assignments, tasks, report_rows, sections, skill_levels, employees, skills;`
and restart the Render service.

Note: the app has no login – anyone with the URL can scan, change remarks and start a new shift.
