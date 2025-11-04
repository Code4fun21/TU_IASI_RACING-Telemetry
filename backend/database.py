from __future__ import annotations

import os
import json
from datetime import datetime
from typing import Union

from fastapi import Request, Query

# R2 helpers (you said you already have these)
from r2_storage import get_json, put_json

# -------- R2 / local storage helpers --------
R2_ON = os.getenv("R2_ENABLED", "false").lower() == "true"
B_DB  = os.getenv("R2_BUCKET_DB", "")
P_DB  = os.getenv("R2_DB_PREFIX", "db/")  # e.g. "db/"

def _r2_key(local_filename: str) -> str:
    return f"{P_DB}{local_filename}"

def load_json_list(filename: str):
    """Read a list-like JSON either from R2 (if enabled) or local file."""
    if R2_ON:
        data = get_json(B_DB, _r2_key(filename))
        return data or []
    if os.path.exists(filename):
        try:
            with open(filename, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_json_list(filename: str, data_list):
    """Write list-like JSON to R2 or local file."""
    if R2_ON:
        put_json(B_DB, _r2_key(filename), data_list)
        return
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data_list, f, ensure_ascii=False, indent=4)

# ===================== Drivers =====================

async def add_driver(request: Request):
    try:
        data = await request.json()
        drivers = load_json_list("drivers.json")

        # assign numeric weight if present
        if "weight" in data:
            try:
                data["weight"] = int(data["weight"])
            except Exception:
                pass

        # allocate ID once, then append once
        existing_ids = [int(d.get("driverId", 0)) for d in drivers]
        data.setdefault("driverId", (max(existing_ids, default=0) + 1))

        drivers.append(data)
        save_json_list("drivers.json", drivers)

        return {"message": "Driver added", "driver": {**data, "id": data["driverId"]}}
    except Exception as e:
        return {"error": str(e)}

async def get_driver(id: int):
    try:
        drivers = load_json_list("drivers.json")
        for d in drivers:
            if int(d.get("driverId", -1)) == int(id):
                return d
        return {"error": f"No driver with id {id}"}
    except Exception as e:
        return {"error": str(e)}

async def get_all_drivers():
    drivers = load_json_list("drivers.json")
    for d in drivers:
        d["id"] = d.pop("driverId", d.get("id"))
    return drivers

# ===================== Tracks =====================

async def add_track(request: Request):
    try:
        data = await request.json()
        tracks = load_json_list("tracks.json")
        existing_ids = [int(t.get("trackId", 0)) for t in tracks]
        data.setdefault("trackId", (max(existing_ids, default=0) + 1))
        tracks.append(data)
        save_json_list("tracks.json", tracks)
        return {"message": "Track added", "track": {**data, "id": data["trackId"]}}
    except Exception as e:
        return {"error": str(e)}

async def get_track(id: int):
    try:
        tracks = load_json_list("tracks.json")
        for t in tracks:
            if int(t.get("trackId", -1)) == int(id):
                return t
        return {"error": f"No track with id {id}"}
    except Exception as e:
        return {"error": str(e)}

async def get_all_tracks():
    tracks = load_json_list("tracks.json")
    for t in tracks:
        t["id"] = t.pop("trackId", t.get("id"))
    return tracks

# ===================== Cars =====================

async def add_car(request: Request):
    try:
        data = await request.json()
        cars = load_json_list("car_setups.json")
        existing_ids = [int(c.get("carId", 0)) for c in cars]
        data.setdefault("carId", (max(existing_ids, default=0) + 1))
        cars.append(data)
        save_json_list("car_setups.json", cars)
        return {"message": "Car setup added", "car": {**data, "id": data["carId"]}}
    except Exception as e:
        return {"error": str(e)}

async def get_car(id: int):
    try:
        cars = load_json_list("car_setups.json")
        for c in cars:
            if int(c.get("carId", -1)) == int(id):
                return c
        return {"error": f"No car with id {id}"}
    except Exception as e:
        return {"error": str(e)}

async def get_all_cars():
    cars = load_json_list("car_setups.json")
    for c in cars:
        c["id"] = c.pop("carId", c.get("id"))
    return cars

# ===================== Timestamps =====================

async def add_timestemp(request: Request):
    try:
        data = await request.json()
        stamps = load_json_list("timestemps.json")
        existing_ids = [int(s.get("timestempId", 0)) for s in stamps]
        data.setdefault("timestempId", (max(existing_ids, default=0) + 1))
        stamps.append(data)
        save_json_list("timestemps.json", stamps)
        return {"message": "Timestamp added", "timestamp": {**data, "id": data["timestempId"]}}
    except Exception as e:
        return {"error": str(e)}

async def get_timestemp(column: str, value: Union[int, str] = Query(...)):
    try:
        stamps = load_json_list("timestemps.json")
        out = []
        for ts in stamps:
            cell = ts.get(column)
            if cell == value or str(cell) == str(value):
                out.append(ts)
        return out
    except Exception as e:
        return {"error": str(e)}

async def get_all_timestemps():
    stamps = load_json_list("timestemps.json")
    for s in stamps:
        s["id"] = s.pop("timestempId", s.get("id"))
    return stamps

# ===================== Sessions =====================

async def add_session(request: Request):
    try:
        data = await request.json()
        sessions = load_json_list("sessions.json")
        existing_ids = [int(s.get("sessionId", 0)) for s in sessions]
        data.setdefault("sessionId", (max(existing_ids, default=0) + 1))

        now = datetime.now()
        data.setdefault("date", now.strftime("%Y-%m-%d"))
        data.setdefault("time", now.strftime("%H:%M:%S"))

        sessions.append(data)
        save_json_list("sessions.json", sessions)
        return {"message": "Session added", "sessionData": {**data}}
    except Exception as e:
        return {"error": str(e)}

async def get_session(id: int):
    try:
        sessions = load_json_list("sessions.json")
        for s in sessions:
            if int(s.get("sessionId", -1)) == int(id):
                return s
        return {"error": f"No session with id {id}"}
    except Exception as e:
        return {"error": str(e)}

async def get_all_session():
    sessions = load_json_list("sessions.json")
    for s in sessions:
        s["id"] = s.pop("sessionId", s.get("id"))
    return sessions
