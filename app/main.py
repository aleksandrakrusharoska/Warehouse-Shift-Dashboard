"""WHS Shift Dashboard – FastAPI entry point.

Run (PyCharm or terminal):  uvicorn app.main:app --reload
Then open http://127.0.0.1:8000   (API docs: /docs)
"""
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import services as svc
from .db import get_conn, init_db
from .schemas import BadgeIn, KpiIn, RemarkIn, ScanIn

Team = Optional[Literal["A", "B", "C"]]   # team filter
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="WHS Shift Dashboard", version="0.3.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.exception_handler(svc.ServiceError)
async def service_error_handler(_: Request, exc: svc.ServiceError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/overview")
def overview(team: Team = None):
    """Sections → report lines → tasks with assigned people, statuses and the report columns."""
    with get_conn() as c:
        return svc.get_overview(c, team)


@app.get("/api/attendance")
def attendance(team: Team = None):
    with get_conn() as c:
        return svc.get_attendance(c, team)


@app.post("/api/tasks/{task_id}/scan")
def scan_to_task(task_id: str, body: ScanIn):
    """Scan a badge inside a task popup → assign that person to the task (ILU checked)."""
    with get_conn() as c:
        return svc.scan_to_task(c, task_id, body.code, body.move)


@app.post("/api/tasks/{task_id}/remove")
def remove_from_task(task_id: str, body: BadgeIn):
    with get_conn() as c:
        svc.unassign(c, task_id, body.badge)
    return {"ok": True}


@app.put("/api/rows/{row_id}/remark")
def row_remark(row_id: str, body: RemarkIn):
    """Remark for the report column "Non Working Lines / Areas in actual shift"."""
    with get_conn() as c:
        svc.set_remark(c, row_id, body.remark)
    return {"ok": True}


@app.put("/api/rows/{row_id}/kpi")
def row_kpi(row_id: str, body: KpiIn):
    """Extra report values, e.g. Receiving: Pallets / Deliveries."""
    with get_conn() as c:
        svc.set_kpi(c, row_id, body.name, body.value)
    return {"ok": True}


@app.get("/api/ilu")
def ilu(team: Team = None):
    with get_conn() as c:
        return svc.get_ilu_matrix(c, team)


@app.get("/api/scans")
def scans(limit: int = 50, team: Team = None):
    with get_conn() as c:
        return svc.get_scans(c, limit, team)


@app.post("/api/shift/new")
def new_shift():
    """Clears all assignments (start of a new shift)."""
    with get_conn() as c:
        svc.new_shift(c)
    return {"ok": True}


@app.post("/api/demo/fill")
def demo_fill():
    with get_conn() as c:
        return {"assigned": svc.demo_fill(c)}

@app.post("/api/employees/{badge}/break/start")
def employee_break_start(badge: str):
    with get_conn() as c:
        return svc.start_break(c, badge)


@app.post("/api/employees/{badge}/break/end")
def employee_break_end(badge: str):
    with get_conn() as c:
        return svc.end_break(c, badge)


@app.post("/api/employees/{badge}/shift/end")
def employee_shift_end(badge: str):
    with get_conn() as c:
        return svc.end_shift(c, badge)

@app.get("/api/analytics/work-time")
def work_time_analytics(team: Team = None):
    with get_conn() as c:
        return svc.get_work_time_analytics(c, team)
