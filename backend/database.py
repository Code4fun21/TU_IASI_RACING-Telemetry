from __future__ import annotations

import os
import json
from datetime import datetime
from typing import Union

from fastapi import Request, Query

# ---- NEW: boto3 R2 client (S3-compatible)
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

# ---------------- R2 / local storage config ----------------
R2_ON  = os.getenv("R2_ENABLED", "false").lower() == "true"
R2_ACC = os.getenv("R2_ACCOUNT_ID", "")
R2_AK  = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SK  = os.getenv("R2_SECRET_ACCESS_KEY", "")

B_DB = os.getenv("R2_BUCKET_DB", "")
P_DB = os.getenv("R2_DB_PREFIX", "")  # e.g. "db/"

def _r2_key(local_filename: str) -> str:
    return f"{P_DB}{local_filename}"

# Cache the boto3 client so we don't recreate it on every call
_s3_client = None

def _get_s3():
    global _s3_client
    if _s3_client is not None:
        return _s3_client
    if not (R2_ACC and R2_AK and R2_SK):
        raise RuntimeError("Missing R2 credentials/env vars (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).")
    endpoint_url = f"https://4c2c8f6251585eac5db48b7f10224cc1.r2.cloudflarestorage.com"
    _s3_client = boto3.client(
        "s3",
        region_name="auto",                     # required for R2
        endpoint_url=endpoint_url,
        aws_access_key_id=R2_AK,
        aws_secret_access_key=R2_SK,
        config=Config(
            signature_version="s3v4",           # required for R2
            s3={"addressing_style": "path"}     # bucket-in-path works best with R2
        ),
    )
    return _s3_client

def _r2_get_json(bucket: str, key: str):
    s3 = _get_s3()
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        raw = obj["Body"].read()
        
        return json.loads(raw)
    except ClientError as e:
        # NoSuchKey or access error -> treat as missing
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404", "AccessDenied"):
            return None
        raise
    except Exception:
        # any parse/other error -> treat as missing/empty
        return None

def _r2_put_json(bucket: str, key: str, payload):
    s3 = _get_s3()
    body = json.dumps(payload, ensure_ascii=False, indent=4).encode("utf-8")
    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/json; charset=utf-8")

# ---------------- Helpers exposed to the rest of the file ----------------
def load_json_list(filename: str):
    """Read a list-like JSON either from R2 (if enabled) or local file."""
    # print("R2_ON",R2_ON)
    if R2_ON:
        
        data = _r2_get_json(B_DB, _r2_key(filename))
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
        _r2_put_json(B_DB, _r2_key(filename), data_list)
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
