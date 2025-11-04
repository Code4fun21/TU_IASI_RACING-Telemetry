from dotenv import load_dotenv
load_dotenv() 
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import csv
import os
import glob
from paho.mqtt import client as mqtt_client
import numpy as np
import socketio
from aiohttp import web
import asyncio
import lttb
from dataclasses import dataclass
from datetime import datetime
import json
import time
from paho.mqtt import client as mqtt_client
from fastapi import FastAPI
import ssl
import math
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
import heapq
try:
    from lttb import lttb
    _HAS_LTTB = True
except Exception:
    _HAS_LTTB = False
import ssl
from typing import Callable, Optional

import servert_test
from start_point import GPS_Intersection
import database
import os
import r2_storage as r2

@dataclass
class GPSPoint:
        lat:float
        lon:float
        speed:float
        timestamp:float
        

class App:
    def __init__(self):
        self.__webObj = servert_test.WebSocketServer()

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            await self.__webObj.start_websocket()
            yield
            await self.__webObj.stop_websocket()

        self.__app = FastAPI(lifespan=lifespan)

        self.__app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://your-site.pages.dev",
            # add dev host if testing locally:
            "http://localhost:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

        self.__mqtt = None
        self.__csv = None
        self.__tables = []
        self.__gates = {}
        self.__mainCoor = []
        self.__gates_list = None
        self.__connection = None

        self.create_routes()

    def create_routes(self):
        api = self.__app.add_api_route

        api("/telemetry/connect", self.create_mqtt, methods=["POST"])
        api("/create-csv", self.create_csv, methods=["POST"])
        api("/get-table", self.get_table_data, methods=["GET"])
        api("/create-table", self.create_tables, methods=["GET"])
        # api("/debug", self.debug, methods=["GET"])
        api("/save-gates", self.save_gates, methods=["POST"])
        api("/get-csv-files", self.get_csv_files, methods=["GET"])
        self.__app.add_api_route("/telemetry/disconnect", self.disconnect_all, methods=["POST"])

        api("/api/drivers", database.add_driver, methods=["POST"])
        api("/api/drivers/{id}", database.get_driver, methods=["GET"])
        api("/api/drivers", database.get_all_drivers, methods=["GET"])

        api("/api/tracks", database.add_track, methods=["POST"])
        api("/api/tracks/{id}", database.get_track, methods=["GET"])
        api("/api/tracks", database.get_all_tracks, methods=["GET"])

        api("/api/monoposts", database.add_car, methods=["POST"])
        api("/api/monoposts/{id}", database.get_car, methods=["GET"])
        api("/api/monoposts", database.get_all_cars, methods=["GET"])

        api("/api/timestamps", database.add_timestemp, methods=["POST"])
        api("/api/timestamps/{column}", database.get_timestemp, methods=["GET"])
        api("/api/timestamps", database.get_all_timestemps, methods=["GET"])

        api("/api/sessions", database.add_session, methods=["POST"])
        api("/api/sessions/{id}", database.get_session, methods=["GET"])
        api("/api/sessions", database.get_all_session, methods=["GET"])
        


    
    async def get_csv_files(self):
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data_files")
        csv_files = glob.glob(os.path.join(data_dir, "*.csv"))

        return {
            "csv_files": [
                {
                    "filename": os.path.basename(f),
                    "last_modified": datetime.fromtimestamp(os.path.getmtime(f)).strftime('%Y-%m-%d %H:%M:%S')
                }
                for f in csv_files
            ]
        }

    async def disconnect_all(self):
        """
        External API to stop MQTT + WS and clean internal state.
        """
        # Stop MQTT/WebSocket if the live connection exists
        if self.__connection:
            try:
                await self.__connection.shutdown()
            except Exception as e:
                print(f"[App.disconnect_all] shutdown failed: {e}")

        # Extra safety: stop App-owned WebSocket server too
        try:
            await self.__webObj.stop_websocket()
        except Exception:
            pass

        # Reset local state
        await self.clean_up()
        return {"message": "Telemetry disconnected (MQTT + WebSocket closed)."}

    async def save_gates(self, request: Request):
        data = await request.json()
        circuit = data["circuit"]
        gates_list = data["gates"]

        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data_files")
        os.makedirs(data_dir, exist_ok=True)

        with open(os.path.join(data_dir, f"{circuit}_gates.json"), "w", encoding="utf-8") as f:
            json.dump(gates_list, f, indent=4)

        return {"message": "gates saved"}

    async def clean_up(self):
        self.__gates_list = None
        self.__mainCoor = []

        if self.__connection:
            await self.__connection.stop_socket()
            self.__connection = None

        for t in self.__tables:
            del t
        self.__tables = []

        if self.__csv:
            del self.__csv
            self.__csv = None

        if self.__mqtt:
            del self.__mqtt
            self.__mqtt = None

    def get_gates_array(self, file):
        try:
            with open(file, mode='r') as f:
                for gate in json.load(f):
                    self.__gates[gate["name"]] = GPS_Intersection(
                        GPSPoint(gate["lat1"], gate["lon1"], -1, -1),
                        GPSPoint(gate["lat2"], gate["lon2"], -1, -1)
                    )
        except Exception as e:
            print("Error loading gates:", e)

    async def create_csv(self, request: Request):
        await self.clean_up()
        data = await request.json()

        files = data["files"].split(",")
        self.__gates_list = data["gates"]

        lat, lon = map(int, data["trackCoordonates"].split(","))
        self.__mainCoor = [lat, lon]

        self.get_gates_array(self.__gates_list)
        self.__csv = CSV(self.__gates, self.__mainCoor, self.__tables, self.__app)

        for file in files:
            await self.__csv.add_file(file)

        return {"message": "CSV loaded"}

    async def create_tables(self, file_no: int):
        if not self.__csv or file_no >= len(self.__csv.get_files()):
            return {"Error": "Invalid request"}

        table = CSV_Tables(self.__csv)
        await table.add_data_from(file_no)
        self.__tables.append(table)
        return {"Message": f"Table created for file {file_no}", "tables": table.get_data()}

    async def get_table_data(self, file_no: int):
        if file_no >= len(self.__tables):
            return {"Error": "Invalid table index"}
        return {"Data": self.__tables[file_no].get_data()}

    async def create_mqtt(self, request: Request):
        data = await request.json()
        await self.clean_up()

        track = await database.get_track(data["trackId"])
        self.__gates_list = track["gates"]

        lat, lon = map(int, track["trackCoordonates"].split(","))
        self.__mainCoor = [lat, lon]

        self.get_gates_array(self.__gates_list)

        self.__mqtt = MQTT(self.__app, self.__gates, self.__mainCoor,
                           data["broker"], int(data["port"]),
                           data["topic"], data["clientId"])

        await self.__webObj.start_websocket()
        await self.__mqtt.connect_to_mqtt()

        self.__connection = MQTT_Tables(self.__mqtt, self.__webObj, data["fileName"])
        return {"Message": "MQTT started"}

    def get_app(self):
        return self.__app







class CSV:
    def __init__(self, gates, main_coordinates, tables, app: FastAPI):
        self._app = app
        self._files = []
        self._tables = tables              # reference shared table store
        self._gates = gates
        self._main_coordinates = main_coordinates

        # ⚠️ only register route once (global), not every time CSV instance is made
        if not hasattr(self._app.state, "csv_routes_registered"):
            self._app.add_api_route("/get-files", self.get_files, methods=["GET"])
            self._app.state.csv_routes_registered = True

    async def add_file(self, path: str):
        """Register CSV file name for processing."""
        path = path.strip()
        if path and path not in self._files:
            self._files.append(path)
            self._tables.append(None)

    def get_files(self):
        """Return list of registered CSV file names."""
        return list(self._files)  # return a copy for safety

    def get_gates(self):
        return self._gates

    def get_main_coordinates(self):
        return self._main_coordinates

    # ❌ Don't rely on __del__
    def cleanup(self):
        """Called by App.clean_up()"""
        self._files.clear()








class CSV_Tables:

    # --- IMU scaling (adjust if your IMU ranges differ) ---
    ACCEL_SENS = 16384.0  # counts per g (±2g)
    GYRO_SENS  = 131.0    # counts per °/s (±250 °/s)

    # Input kind for IMU channels:
    #   "value" -> accel & gyro are already values in counts (DEFAULT)
    #   "rate"  -> accel & gyro are rates of change in counts/s (jerk, angular accel)
    __IMU_INPUT_KIND = "value"

    # Optional bias removal (first N samples assumed stationary). 0 = disabled.
    __IMU_BIAS_SAMPLES = 25

    def __init__(self, csv_class: "CSV"):
        # self.__app        = csv_class.get_app()
        self.__csv_files  = csv_class.get_files()

        # store as instance field (not local var)
        self.SIGNAL_KEYS = [
            # engine/ecu
            "RPM", "ECU_time", "Main_pulsewidth_bank1", "Main_pulsewidth_bank2",
            # 5F2
            "Manifold_air_pressure", "Manifold_air_temperature", "Coolant_temperature",
            # 5F3
            "Throttle_position", "Battery_voltage",
            # 5F4..5F7
            "Air_density_correction", "Warmup_correction", "TPS_based_acceleration",
            "TPS_based_fuel_cut", "Total_fuel_correction", "VE_value_table_bank1",
            "VE_value_table_bank2", "Cold_advance", "Rate_of_change_of_TPS",
            "Rate_of_change_of_RPM",
            # 61B / 624
            "Sync_loss_counter", "Sync_loss_reason_code", "Average_fuel_flow",
            # chassis
            "Damper_Left_Rear", "Damper_Right_Rear", "Gear",
            "Brake_Pressure", "BSPD",
            "Damper_Left_Front", "Damper_Right_Front", "Steering_Angle",
            # GPS
            "GPS_Latitude", "GPS_Longitude", "GPS_Speed",
            # IMU
            "Acceleration_on_X_axis", "Acceleration_on_Y_axis", "Acceleration_on_Z_axis",
            "Gyroscope_on_X_axis", "Gyroscope_on_Y_axis", "Gyroscope_on_Z_axis",
            # optional computed roll/pitch/yaw if you ever add them
            "Roll", "Pitch", "Yaw",
        ]

        # Single storage dict for all signals -> DataFrame(Time, data)
        self._series: dict[str, pd.DataFrame] = {
            k: pd.DataFrame(columns=["Time", "data"]) for k in self.SIGNAL_KEYS
        }

        # keep gates separate (table of laps)
        self.__Gates_times = pd.DataFrame(columns=["Time", "data"])

        # IMU filtering toggle & tuning (no external deps)
        self.__ENABLE_IMU_KALMAN = True
        self.__KF_PROCESS_VAR = 0.05   # Q — increase = smoother, but more lag
        self.__KF_MEASURE_VAR = 4.0    # R — increase = trust filter more than measurements

        self.__mainCoor  = csv_class.get_main_coordinates()
        self.__gates_pos = csv_class.get_gates()
        print("GAtes&Coor", self.__gates_pos, self.__mainCoor)

        self.__id_data_map = {
            1520: ([2,2,2,2],[1,0.001,0.001,1]),
            1522: ([2,2,2,2],[0,0.1,0.1,0.1]),
            1523: ([2,2,2,2],[0.1,0.1,0,0]),
            1524: ([2,2,2,2],[0,0,0,0.1]),
            1525: ([2,2,2,2],[0.1,0.1,0.1,0]),
            1526: ([2,2,2,2],[0.1,0.1,0.1,0]),
            1527: ([2,2,2,2],[0.1,0.1,0,10]),
            1563: ([1,1,1,1,1,1,1,1],[1,1,0,0,0,0,0,0]),
            1572: ([2,2,2,2],[0,0,1,0]),
            277:  ([2,2,1,2,1],[1,1,1,1,1]),
            278:  ([2,2,2,2],[1,1,1,0]),
            279:  ([3,3,1,1],[1,1,1,0]),
            280:  ([2,2,2,2],[1,1,1,0]),
            281:  ([2,2,2,2],[1,1,1,0])
        }
        self.__prev_pos   = None
        self.__curr_pos   = None
        self.__track_len  = 0
        self.__lap        = {}
        self.__car_pos    = []
        self.__just_s0    = None

    # --- convenience accessors ---
    def _s(self, key: str) -> pd.DataFrame:
        return self._series[key]

    def _set_s(self, key: str, df: pd.DataFrame):
        self._series[key] = df

    def as_map(self, key: str) -> dict:
        df = self._series.get(key)
        return self._series_dict_from_df(df, "Time", "data") if df is not None else {}

    def __getattr__(self, name: str):
        """Compatibility shim so old code like self.__RPM still works."""
        prefix = f"_{self.__class__.__name__}__"
        if name.startswith(prefix):
            key = name[len(prefix):]
            if key in getattr(self, "_series", {}):
                return self._series[key]
        raise AttributeError(f"{self.__class__.__name__} has no attribute {name}")

    # ---------- SIMPLE 1D KALMAN FILTER (value-only) ----------
    def _kalman_filter_df(self, df: pd.DataFrame, process_var=None, measure_var=None) -> pd.DataFrame:
        if df is None or df.empty:
            return df
        q = self.__KF_PROCESS_VAR if process_var is None else process_var
        r = self.__KF_MEASURE_VAR if measure_var is None else measure_var

        x = float(df["data"].iloc[0])
        p = 1.0
        F = 1.0; H = 1.0
        Q = float(q); R = float(r)

        out = []
        for z in df["data"].astype(float).tolist():
            x = F * x
            p = F * p * F + Q
            K = (p * H) / (H * p * H + R)
            x = x + K * (z - H * x)
            p = (1 - K * H) * p
            out.append(x)

        df_filt = df.copy()
        df_filt["data"] = out
        return df_filt

    def _kalman_filter_2d_accel_velocity(self, df: pd.DataFrame, process_Q=None, measure_R=None) -> pd.DataFrame:
        if df is None or df.empty:
            return df.copy()
        w = df.copy()
        w["Time"] = w["Time"].astype(float)
        w = w.sort_values("Time").reset_index(drop=True)

        if process_Q is None:
            process_Q = np.array([[1e-3, 0.0],[0.0,  1e-2]], dtype=float)
        if measure_R is None:
            measure_R = 1e-1  # (m/s^2)^2

        first_acc = float(w["data"].iloc[0])
        x = np.array([0.0, first_acc], dtype=float)  # [vel, accel]
        P = np.eye(2, dtype=float)
        I = np.eye(2, dtype=float)

        vel_list, acc_list, t_list = [], [], []
        times = w["Time"].to_numpy(float)
        meas_accels = w["data"].to_numpy(float)
        last_t = times[0]

        for t, z in zip(times, meas_accels):
            dt = t - last_t
            if dt < 0: dt = 0.0
            last_t = t

            F = np.array([[1.0, dt],[0.0, 1.0]], dtype=float)
            x = F @ x
            P = F @ P @ F.T + process_Q

            H = np.array([[0.0, 1.0]], dtype=float)
            y = z - (H @ x)[0]
            S = (H @ P @ H.T)[0, 0] + measure_R
            K = (P @ H.T) / S
            x = x + K.flatten() * y
            P = (I - K @ H) @ P

            vel_list.append(x[0]); acc_list.append(x[1]); t_list.append(t)

        return pd.DataFrame({"Time": t_list, "vel": vel_list, "accel": acc_list})

    def _kalman_filter_2d_gyro(self, df: pd.DataFrame, process_Q=None, measure_R=None) -> pd.DataFrame:
        if df is None or df.empty:
            return df.copy()
        w = df.copy()
        w["Time"] = w["Time"].astype(float)
        w = w.sort_values("Time").reset_index(drop=True)

        if process_Q is None:
            process_Q = np.array([[1e-5, 0.0],[0.0,  1e-4]], dtype=float)
        if measure_R is None:
            measure_R = 1e-3  # (rad/s)^2

        first_rate = float(w["data"].iloc[0])
        x = np.array([0.0, first_rate], dtype=float)  # [angle, rate]
        P = np.eye(2, dtype=float)
        I = np.eye(2, dtype=float)

        ang_list, rate_list, t_list = [], [], []
        times = w["Time"].to_numpy(float)
        meas_rates = w["data"].to_numpy(float)
        last_t = times[0]

        for t, z in zip(times, meas_rates):
            dt = t - last_t
            if dt < 0: dt = 0.0
            last_t = t

            F = np.array([[1.0, dt],[0.0, 1.0]], dtype=float)
            x = F @ x
            P = F @ P @ F.T + process_Q

            H = np.array([[0.0, 1.0]], dtype=float)
            y = z - (H @ x)[0]
            S = (H @ P @ H.T)[0, 0] + measure_R
            K = (P @ H.T) / S
            x = x + K.flatten() * y
            P = (I - K @ H) @ P

            ang_list.append(x[0]); rate_list.append(x[1]); t_list.append(t)

        return pd.DataFrame({"Time": t_list, "angle": ang_list, "rate": rate_list})

    def _integrate_df(self, df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return df
        df = df.copy()
        df["Time"] = df["Time"].astype(float)
        df = df.sort_values("Time")
        dt = df["Time"].diff().fillna(0)
        df["data"] = (df["data"].astype(float) * dt).cumsum()
        return df

    def _scale_accel_counts_to_ms2(self, df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return df
        out = df.copy()
        out["data"] = (out["data"].astype(float) / self.ACCEL_SENS) * 9.80665
        return out

    def _scale_gyro_counts_to_rads(self, df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return df
        out = df.copy()
        out["data"] = (out["data"].astype(float) / self.GYRO_SENS) * (np.pi / 180.0)
        return out

    def _remove_bias(self, df: pd.DataFrame, n:int) -> pd.DataFrame:
        if df is None or df.empty or n <= 0:
            return df
        n = min(n, len(df))
        bias = df["data"].astype(float).iloc[:n].mean()
        out = df.copy()
        out["data"] = out["data"].astype(float) - bias
        return out

    def check_cross(self, finalize: bool = False):
        def _push_current_lap(complete: bool, t_for_row=None):
            if not self.__lap:
                return
            lap = self.__lap.copy()
            lap["dist"] = self.__track_len
            lap["complete"] = bool(complete)
            if t_for_row is None:
                for k in ("S3", "S2", "S1", "S0"):
                    if lap.get(k) is not None:
                        t_for_row = lap[k]; break
                if t_for_row is None:
                    t_for_row = 0
            self.__Gates_times.loc[len(self.__Gates_times)] = [t_for_row, lap]

        if self.__prev_pos is None:
            self.__prev_pos = self.__curr_pos
            self._gate_idx = getattr(self, "_gate_idx", 0)
            self.__just_s0 = False
            return

        prev, curr = self.__prev_pos, self.__curr_pos
        dist = self.haversine_distance(prev.lat, prev.lon, curr.lat, curr.lon)

        s0 = self.__gates_pos["S0"]
        s0.update_points(prev, curr)
        if s0.get_intersection_time():
            t0 = s0.get_time()
            if self.__lap.get("S2") is not None and t0 > self.__lap["S2"]:
                self.__lap["S3"] = t0
                _push_current_lap(complete=True, t_for_row=t0)
                self.__lap = {"S0": t0}
                self.__track_len = 0
                self._gate_idx = 1
                self.__just_s0 = True
            else:
                self.__lap = {"S0": t0}
                self.__track_len = 0
                self._gate_idx = 1
                self.__just_s0 = True
        else:
            seq = ["S0", "S1", "S2"]
            if 0 < self._gate_idx < len(seq):
                name = seq[self._gate_idx]
                g = self.__gates_pos[name]
                g.update_points(prev, curr)
                if g.get_intersection_time():
                    t = g.get_time()
                    self.__lap[name] = t
                    self._gate_idx += 1

        if self._gate_idx > 0 and not getattr(self, "__just_s0", False):
            self.__track_len += dist
        if getattr(self, "__just_s0", False):
            self.__just_s0 = False

        if finalize and "S0" in self.__lap and "S3" not in self.__lap:
            t_last = self.__lap.get("S2") or self.__lap.get("S1") or self.__lap.get("S0") or \
                     getattr(curr, "time", None) or getattr(curr, "timestamp", None) or 0
            _push_current_lap(complete=False, t_for_row=t_last)

        self.__prev_pos = curr

    def haversine_distance(self, lat1, lon1, lat2, lon2):
        R = 6371000
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    async def add_data_from(self, file: int, reorder_window_s: float = 0.5):
        """
        Stream CSV rows and feed them to the lap detector in (mostly) time order
        without sorting the entire file. A small heap buffer reorders out-of-order
        rows within `reorder_window_s`.
        """
        try:
            print("Opening file:", self.__csv_files[file])

            heap = []
            have_max_t = None

            def _drain_ready(until_t):
                while heap and heap[0][0] <= until_t:
                    _t, row = heapq.heappop(heap)
                    _process_row(row)

            def _process_row(row):
<<<<<<< HEAD
                t_str = row[0].strip()
=======
                # row: [time, id_hex, payload]
                time = row[0].strip()
>>>>>>> parent of 36ef3f8d (updates on backend: decode and to_dict)
                try:
                    _id = int(row[1].strip(), 16)
                except Exception:
                    return
                aux  = self.get_aditional_data(_id)
                data = self.sep_data(row[2])
<<<<<<< HEAD
                self.create_el(_id, aux, data, t_str)  # emits GPSPoint only if id==279
=======
                self.create_el(_id, aux, data, time)  # will emit GPSPoint only if id==279

            with open(self.__csv_files[file], mode='r', newline='',encoding="utf-8", errors="replace") as openedFile:
                reader = csv.reader(openedFile)
>>>>>>> parent of 36ef3f8d (updates on backend: decode and to_dict)

            with open(self.__csv_files[file], mode='r', newline='', encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f)
                for row in reader:
                    if not row or len(row) < 3 or row[0].strip().lower() in ("time", "timestamp"):
                        continue
                    try:
                        t = float(row[0])
                    except Exception:
                        continue

                    have_max_t = t if have_max_t is None else max(have_max_t, t)
                    heapq.heappush(heap, (t, row))
                    _drain_ready(have_max_t - reorder_window_s)

                while heap:
                    _t, row = heapq.heappop(heap)
                    _process_row(row)

            self.check_cross(finalize=True)

        except Exception as e:
            print("Error reading file:", e)

    def get_aditional_data(self, id):
        return self.__id_data_map.get(id, [[], []])

    def create_el(self, id, aux, data, time):
        if aux[1]:
<<<<<<< HEAD
            start = 0
            length = len(aux[1])
            car_point = []
            for i in range(length):
                if aux[1][i] != 0:
                    converted = self.convert_data(id, i, data[start:start+aux[0][i]], aux[1][i], time)
                    self.add_to_tabel(id, i, converted[0])
                    if id == 279:
                        car_point.append(converted[1])
                start += aux[0][i]
=======
            start=0
            length=len(aux[1])
            car_point=[]
            for i in range(0,length):
                el=aux[1][i]
                if el !=0: 
                    convertedData=self.convert_data(id,i,data[start:start+aux[0][i]],aux[1][i],time)

                    self.add_to_tabel(id,i,convertedData[0])
                    if id==279:
                        car_point.append(convertedData[1])
                start+=aux[0][i]
>>>>>>> parent of 36ef3f8d (updates on backend: decode and to_dict)

            if id == 279 and len(car_point) > 2:
                car_point.append(float(time))
                self.__car_pos.append(GPSPoint(car_point[0], car_point[1], car_point[2], car_point[3]))
                self.__curr_pos = self.__car_pos[-1]
                self.check_cross()

    def add_to_tabel(self, id, index, data):
        signal_name = self.__get_signal_name(id, index)
        if not signal_name:
            return
        if isinstance(data, dict):
<<<<<<< HEAD
            df_old = self._s(signal_name)
            data_df = pd.DataFrame([data])
            new_df = df_old if data_df.dropna(how="all").empty else pd.concat([df_old, data_df], ignore_index=True)
            self._set_s(signal_name, new_df)
=======
            data = pd.DataFrame([data])  
            if not data.empty and not data.dropna(how="all").empty:
                new_df = pd.concat([df, data], ignore_index=True)
            else:
                new_df = df
            setattr(self, f"_{self.__class__.__name__}__{signal_name}", new_df)
>>>>>>> parent of 36ef3f8d (updates on backend: decode and to_dict)

    def __get_signal_name(self, id, index):
        signal_map = {
            1520: ["ECU_time", "Main_pulsewidth_bank1", "Main_pulsewidth_bank2", "RPM"],
            1522: [None, "Manifold_air_pressure", "Manifold_air_temperature", "Coolant_temperature"],
            1523: ["Throttle_position","Battery_voltage"],
            1524: ["Air_density_correction"],
            1525: ["Warmup_correction","TPS_based_acceleration","TPS_based_fuel_cut"],
            1526: ["Total_fuel_correction","VE_value_table_bank1","VE_value_table_bank2"],
            1527: ["Cold_advance","Rate_of_change_of_TPS","Rate_of_change_of_RPM"],
            1563: ["Sync_loss_counter","Sync_loss_reason_code"],
            1572: ["Average_fuel_flow"],
            277:  ["Damper_Left_Rear","Damper_Right_Rear","Gear","Brake_Pressure","BSPD"],
            278:  ["Damper_Left_Front","Damper_Right_Front","Steering_Angle"],
            279:  ["GPS_Latitude","GPS_Longitude","GPS_Speed"],
            280:  ["Acceleration_on_X_axis","Acceleration_on_Y_axis","Acceleration_on_Z_axis"],
            281:  ["Gyroscope_on_X_axis","Gyroscope_on_Y_axis","Gyroscope_on_Z_axis"]
        }
        if id not in signal_map or index >= len(signal_map[id]):
            return None
        return signal_map[id][index]

    def sep_data(self, data):
        return [data[i:i+2] for i in range(0, len(data), 2)]

    def convert_data(self, id, index, dataString, multiplier, time):
        combined_hex = ''.join(dataString).strip()
        row = [{"Time": time, "data": None}, None]
        try:
            if not combined_hex:
                return row
            if id == 278 or (id == 277 and (index < 2 or index == 3)):
                nr = self.convert_data_m1(combined_hex)
            elif id == 279 and index < 2:
                nr = self.convert_data_m2(index, int(combined_hex, 16))
            elif id == 1522 and index > 1:
                nr = int(combined_hex, 16) * multiplier
                nr = self.fahrenheitToCelsius(nr)
                multiplier = 1
            else:
                nr = int(combined_hex, 16)

            if multiplier:
                nr *= multiplier

            row = [{"Time": time, "data": nr}, nr]
        except Exception as e:
            print(f"[convert_data] Failed for id={id} index={index}: {e}")
        return row

    def convert_data_m1(self, data):
        return int(data[2:4], 16) + int(data[0:2], 16) * 100

    def convert_data_m2(self, index, data):
        data /= (10 ** len(str(data)))
        return self.__mainCoor[index] + data

    def fahrenheitToCelsius(self, fahrenheit):
        return (fahrenheit - 32) * 5 / 9

    def _series_dict_from_df(self, df: pd.DataFrame, time_col: str, value_col: str) -> dict:
<<<<<<< HEAD
        if df is None or df.empty:
            return {}
=======
        """
        Turn columns Time + value_col into {Time: value}
        Time will be stringified as the dict key (JS Object keys are strings anyway).
        """
>>>>>>> parent of 36ef3f8d (updates on backend: decode and to_dict)
        out = {}
        t_arr = df[time_col].astype(float).to_numpy()
        v_arr = df[value_col].astype(float).to_numpy()
        for t, v in zip(t_arr, v_arr):
<<<<<<< HEAD
            out[str(t)] = float(v)
=======
            out[str(t)] = v
>>>>>>> parent of 36ef3f8d (updates on backend: decode and to_dict)
        return out

    def _pre_smooth(self, df, window=5):
        if df is None or df.empty:
            return df
        df = df.copy()
        df["data"] = (
            df["data"].astype(float)
              .rolling(window=window, min_periods=1, center=True)
              .mean()
        )
        return df

    def get_data(self):
        # ----- IMU raw -> SI units -----
        acc_x = self._s("Acceleration_on_X_axis").dropna()
        acc_y = self._s("Acceleration_on_Y_axis").dropna()
        acc_z = self._s("Acceleration_on_Z_axis").dropna()
        gyro_x = self._s("Gyroscope_on_X_axis").dropna()
        gyro_y = self._s("Gyroscope_on_Y_axis").dropna()
        gyro_z = self._s("Gyroscope_on_Z_axis").dropna()

        # counts -> physical units
        acc_x = self._scale_accel_counts_to_ms2(acc_x)
        acc_y = self._scale_accel_counts_to_ms2(acc_y)
        acc_z = self._scale_accel_counts_to_ms2(acc_z)

        gyro_x = self._scale_gyro_counts_to_rads(gyro_x)
        gyro_y = self._scale_gyro_counts_to_rads(gyro_y)
        gyro_z = self._scale_gyro_counts_to_rads(gyro_z)

        # bias removal + smoothing
        if self.__IMU_BIAS_SAMPLES > 0:
            acc_x = self._remove_bias(acc_x, self.__IMU_BIAS_SAMPLES)
            acc_y = self._remove_bias(acc_y, self.__IMU_BIAS_SAMPLES)
            acc_z = self._remove_bias(acc_z, self.__IMU_BIAS_SAMPLES)
            gyro_x = self._remove_bias(gyro_x, self.__IMU_BIAS_SAMPLES)
            gyro_y = self._remove_bias(gyro_y, self.__IMU_BIAS_SAMPLES)
            gyro_z = self._remove_bias(gyro_z, self.__IMU_BIAS_SAMPLES)

        acc_x = self._pre_smooth(acc_x, window=7)
        acc_y = self._pre_smooth(acc_y, window=7)
        acc_z = self._pre_smooth(acc_z, window=7)
        gyro_x = self._pre_smooth(gyro_x, window=7)
        gyro_y = self._pre_smooth(gyro_y, window=7)
        gyro_z = self._pre_smooth(gyro_z, window=7)

        # filtering
        if self.__ENABLE_IMU_KALMAN:
            acc_x_f = self._kalman_filter_2d_accel_velocity(acc_x,
                process_Q=np.array([[1e-4, 0.0],[0.0,  1e-4]], dtype=float), measure_R=1)
            acc_y_f = self._kalman_filter_2d_accel_velocity(acc_y,
                process_Q=np.array([[1e-4, 0.0],[0.0,  1e-4]], dtype=float), measure_R=1)
            acc_z_f = self._kalman_filter_2d_accel_velocity(acc_z,
                process_Q=np.array([[1e-4, 0.0],[0.0,  1e-4]], dtype=float), measure_R=1)

            gyro_x_f = self._kalman_filter_2d_gyro(gyro_x,
                process_Q=np.array([[1e-5, 0.0],[0.0,  1e-5]], dtype=float), measure_R=1)
            gyro_y_f = self._kalman_filter_2d_gyro(gyro_y,
                process_Q=np.array([[1e-5, 0.0],[0.0,  1e-5]], dtype=float), measure_R=1)
            gyro_z_f = self._kalman_filter_2d_gyro(gyro_z,
                process_Q=np.array([[1e-5, 0.0],[0.0,  1e-5]], dtype=float), measure_R=1)

            Accel_X_dict = self._series_dict_from_df(acc_x_f, "Time", "accel")
            Accel_Y_dict = self._series_dict_from_df(acc_y_f, "Time", "accel")
            Accel_Z_dict = self._series_dict_from_df(acc_z_f, "Time", "accel")

            Gyro_X_dict  = self._series_dict_from_df(gyro_x_f, "Time", "rate")
            Gyro_Y_dict  = self._series_dict_from_df(gyro_y_f, "Time", "rate")
            Gyro_Z_dict  = self._series_dict_from_df(gyro_z_f, "Time", "rate")
        else:
            def df_to_dict(df):
                out = {}
                if df is None or df.empty: return out
                df_sorted = df.copy()
                df_sorted["Time"] = df_sorted["Time"].astype(float)
                df_sorted = df_sorted.sort_values("Time")
                for t, v in zip(df_sorted["Time"].to_numpy(float),
                                df_sorted["data"].to_numpy(float)):
                    out[str(t)] = float(v)
                return out

            Accel_X_dict = df_to_dict(acc_x)
            Accel_Y_dict = df_to_dict(acc_y)
            Accel_Z_dict = df_to_dict(acc_z)
            Gyro_X_dict  = df_to_dict(gyro_x)
            Gyro_Y_dict  = df_to_dict(gyro_y)
            Gyro_Z_dict  = df_to_dict(gyro_z)

        payload = {}

<<<<<<< HEAD
        # simple signals
        simple_keys = [
            "RPM", "ECU_time", "Main_pulsewidth_bank1", "Main_pulsewidth_bank2",
            "Manifold_air_pressure", "Manifold_air_temperature", "Coolant_temperature",
            "Throttle_position", "Battery_voltage",
            "Air_density_correction", "Warmup_correction", "TPS_based_acceleration",
            "TPS_based_fuel_cut", "Total_fuel_correction", "VE_value_table_bank1",
            "VE_value_table_bank2", "Cold_advance", "Rate_of_change_of_TPS",
            "Rate_of_change_of_RPM",
            "Sync_loss_counter", "Sync_loss_reason_code", "Average_fuel_flow",
            "Damper_Left_Rear", "Damper_Right_Rear", "Gear",
            "Brake_Pressure", "BSPD",
            "Damper_Left_Front", "Damper_Right_Front", "Steering_Angle",
            "GPS_Latitude", "GPS_Longitude", "GPS_Speed",
        ]
        for k in simple_keys:
            payload[k] = self.as_map(k)
=======
        # ----- build final payload -----
        return {
            "RPM": self.__RPM.dropna().astype(float).to_dict(),
            "ECU_time": self.__ECU_time.dropna().astype(float).to_dict(),
            "Main_pulsewidth_bank1": self.__Main_pulsewidth_bank1.dropna().astype(float).to_dict(),
            "Main_pulsewidth_bank2": self.__Main_pulsewidth_bank2.dropna().astype(float).to_dict(),

            "Manifold_air_pressure": self.__Manifold_air_pressure.dropna().astype(float).to_dict(),
            "Manifold_air_temperature": self.__Manifold_air_temperature.dropna().astype(float).to_dict(),
            "Coolant_temperature": self.__Coolant_temperature.dropna().astype(float).to_dict(),

            "Throttle_position": self.__Throttle_position.dropna().astype(float).to_dict(),
            "Battery_voltage": self.__Battery_voltage.dropna().astype(float).to_dict(),
            "Air_density_correction": self.__Air_density_correction.dropna().astype(float).to_dict(),
            "Warmup_correction": self.__Warmup_correction.dropna().astype(float).to_dict(),
            "TPS_based_acceleration": self.__TPS_based_acceleration.dropna().astype(float).to_dict(),
            "TPS_based_fuel_cut": self.__TPS_based_fuel_cut.dropna().astype(float).to_dict(),
            "Total_fuel_correction": self.__Total_fuel_correction.dropna().astype(float).to_dict(),
            "VE_value_table_bank1": self.__VE_value_table_bank1.dropna().astype(float).to_dict(),
            "VE_value_table_bank2": self.__VE_value_table_bank2.dropna().astype(float).to_dict(),
            "Cold_advance": self.__Cold_advance.dropna().astype(float).to_dict(),
            "Rate_of_change_of_TPS": self.__Rate_of_change_of_TPS.dropna().astype(float).to_dict(),
            "Rate_of_change_of_RPM": self.__Rate_of_change_of_RPM.dropna().astype(float).to_dict(),
            "Sync_loss_counter": self.__Sync_loss_counter.dropna().astype(float).to_dict(),
            "Sync_loss_reason_code": self.__Sync_loss_reason_code.dropna().astype(float).to_dict(),
            "Average_fuel_flow": self.__Average_fuel_flow.dropna().astype(float).to_dict(),

            "Damper_Left_Rear": self.__Damper_Left_Rear.dropna().astype(float).to_dict(),
            "Damper_Right_Rear": self.__Damper_Right_Rear.dropna().astype(float).to_dict(),
            "Gear": self.__Gear.dropna().astype(float).to_dict(),
            "Brake_Pressure": self.__Brake_Pressure.dropna().astype(float).to_dict(),
            "BSPD": self.__BSPD.dropna().astype(float).to_dict(),

            "Roll": self.__Roll.dropna().astype(float).to_dict(),
            "Pitch": self.__Pitch.dropna().astype(float).to_dict(),
            "Yaw": self.__Yaw.dropna().astype(float).to_dict(),

            "Damper_Left_Front": self.__Damper_Left_Front.dropna().astype(float).to_dict(),
            "Damper_Right_Front": self.__Damper_Right_Front.dropna().astype(float).to_dict(),
            "Steering_Angle": self.__Steering_Angle.dropna().astype(float).to_dict(),

            # GPS arrays go out as arrays (frontend uses them directly)
            "GPS_Latitude": self.__GPS_Latitude.dropna().astype(float).to_numpy().tolist(),
            "GPS_Longitude": self.__GPS_Longitude.dropna().astype(float).to_numpy().tolist(),
            "GPS_Speed": self.__GPS_Speed.dropna().astype(float).to_numpy().tolist(),

            # IMU (what frontend already expects)
            "Acceleration_on_X_axis": Accel_X_dict,
            "Acceleration_on_Y_axis": Accel_Y_dict,
            "Acceleration_on_Z_axis": Accel_Z_dict,

            "Gyroscope_on_X_axis": Gyro_X_dict,
            "Gyroscope_on_Y_axis": Gyro_Y_dict,
            "Gyroscope_on_Z_axis": Gyro_Z_dict,

            # Optional bonus channels if you want to use them later:
            "Velocity_on_X_axis": Vel_X_dict,
            "Velocity_on_Y_axis": Vel_Y_dict,
            "Velocity_on_Z_axis": Vel_Z_dict,

            "Angle_on_X_axis": Angle_X_dict,
            "Angle_on_Y_axis": Angle_Y_dict,
            "Angle_on_Z_axis": Angle_Z_dict,

            "Gates_times": gates,

            "GPS_Latitude_counter": len(self.__GPS_Latitude.dropna()),
            "GPS_Longitude_counter": len(self.__GPS_Longitude.dropna()),
            "GPS_Speed_counter": len(self.__GPS_Speed.dropna()),
        }
>>>>>>> parent of 36ef3f8d (updates on backend: decode and to_dict)

        # IMU exports
        payload["Acceleration_on_X_axis"] = Accel_X_dict
        payload["Acceleration_on_Y_axis"] = Accel_Y_dict
        payload["Acceleration_on_Z_axis"] = Accel_Z_dict
        payload["Gyroscope_on_X_axis"]    = Gyro_X_dict
        payload["Gyroscope_on_Y_axis"]    = Gyro_Y_dict
        payload["Gyroscope_on_Z_axis"]    = Gyro_Z_dict

        # Gates
        if not self.__Gates_times.empty:
            gates = {
                "timestamps": self.__Gates_times["Time"].astype(float).tolist(),
                "lap_data"  : self.__Gates_times["data"].tolist()
            }
        else:
            gates = {"timestamps": [], "lap_data": []}
        payload["Gates_times"] = gates

        return payload

    def get_filtred_data(self):
        """
        Downsample each series to reduce payload. Uses LTTB if available,
        otherwise returns a naive stride-downsample to n_out points.
        """
        def df_to_xy(df: pd.DataFrame) -> np.ndarray:
            if df is None or df.empty:
                return np.empty((0,2))
            d = df[["Time", "data"]].astype(float)
            return d.to_numpy()

        def downsample_xy(xy: np.ndarray, n_out=50) -> np.ndarray:
            if xy.shape[0] <= n_out:
                return xy
            if _HAS_LTTB:
                return lttb.downsample(xy, n_out=n_out)
            # naive fallback: uniform stride
            stride = max(1, xy.shape[0] // n_out)
            return xy[::stride][:n_out]

        out = {}
        for key in self.SIGNAL_KEYS:
            xy = df_to_xy(self._s(key).dropna())
            out[key] = downsample_xy(xy, n_out=50)

        # Gates_times (convert to two-column numeric for consistency)
        if not self.__Gates_times.empty:
            g = self.__Gates_times.copy()
            g["Time"] = g["Time"].astype(float)
            # downsample by time only; represent as [Time, idx]
            gt_xy = np.column_stack([
                g["Time"].to_numpy(),
                np.arange(len(g), dtype=float)
            ])
            out["Gates_times"] = downsample_xy(gt_xy, n_out=50)
        else:
            out["Gates_times"] = np.empty((0,2))

        return out

    def __del__(self):
        print("Destructor called for CSV_Tables")
        self._series.clear()
        self.__Gates_times = None





class MQTT:
    """
    Minimal, robust wrapper over paho-mqtt that:
      - keeps your existing public methods (set_custom_on_message, get_client, etc.)
      - supports optional username/password and TLS
      - does clean async-friendly start/stop
      - lets other classes inject a custom on_message handler
    """

    def __init__(
        self,
        app: FastAPI,
        corners,
        mainCoordinates,
        broker: str = "mqtt.eclipseprojects.io",
        port: int = 1883,
        topic: str = "python/mqtt",
        client_id: str = "3",
    ):
        self.__app = app
        self.__broker = broker
        self.__port = int(port)
        self.__client_id = str(client_id)
        self.__topic = topic
        self.__client: Optional[mqtt_client.Client] = None
        self.__gates = corners
        self.__mainCoor = mainCoordinates

        # Optional auth/TLS
        self.__username: Optional[str] = None
        self.__password: Optional[str] = None
        self.__use_tls: bool = (self.__port == 8883)
        self.__tls_insecure: bool = True  # set False if you want cert validation

        # External message handler (installed by MQTT_Tables via set_custom_on_message)
        self.__custom_on_message: Optional[Callable] = None




    async def disconnect(self):
        """Gracefully unsubscribe, stop loop, and disconnect MQTT."""
        try:
            if self.__client:
                try:
                    self.__client.unsubscribe(self.__topic)
                except Exception:
                    pass
                try:
                    self.__client.loop_stop()
                except Exception:
                    pass
                try:
                    self.__client.disconnect()
                except Exception:
                    pass
                self.__client = None
            # Clear any custom handler so future connects start clean
            self.__custom_on_message = None
            return {"message": "MQTT disconnected"}
        except Exception as e:
            return {"error": str(e)}

    # ---------- Public helpers you already use elsewhere ----------

    def set_custom_on_message(self, handler: Callable):
        """Allow another class to supply an on_message callback."""
        self.__custom_on_message = handler
        if self.__client is not None:
            self.__client.on_message = handler

    def configure_auth(self, username: str, password: str):
        """Optional: set username/password before connect()."""
        self.__username = username
        self.__password = password

    def enable_tls(self, insecure: bool = True):
        """Optional: enable TLS (if your broker uses 8883, TLS is auto-enabled)."""
        self.__use_tls = True
        self.__tls_insecure = bool(insecure)

    def get_client(self) -> Optional[mqtt_client.Client]:
        return self.__client

    def get_app(self) -> FastAPI:
        return self.__app

    def get_topic(self) -> str:
        return self.__topic

    def get_gates(self):
        return self.__gates

    def get_main_coordinates(self):
        return self.__mainCoor

    # ---------- Connect / Subscribe / Publish / Stop ----------

    async def connect_to_mqtt(self):
        """
        Starts the paho network loop in a background thread (loop_start).
        Safe to call from async code. Returns a small dict status.
        """
        try:
            # paho-mqtt v1.x compatible client; if you're on v2, keep this and pin to v1.6.*
            client = mqtt_client.Client(client_id=self.__client_id, clean_session=True)

            if self.__username and self.__password:
                client.username_pw_set(self.__username, self.__password)

            if self.__use_tls or self.__port == 8883:
                client.tls_set(tls_version=ssl.PROTOCOL_TLS_CLIENT)
                client.tls_insecure_set(self.__tls_insecure)

            # --- callbacks ---
            def _on_connect(cli, userdata, flags, rc):
                if rc == 0:
                    print("MQTT: connected")
                    try:
                        cli.subscribe(self.__topic, qos=0)
                        print(f"MQTT: subscribed to {self.__topic}")
                    except Exception as e:
                        print(f"MQTT: subscribe failed: {e}")
                else:
                    print(f"MQTT: connect failed rc={rc}")

            def _default_on_message(cli, userdata, msg):
                try:
                    payload = msg.payload.decode(errors="ignore")
                    print(f"[MQTT] {msg.topic}: {payload[:200]}")
                except Exception as e:
                    print(f"[MQTT] on_message error: {e}")

            client.on_connect = _on_connect
            client.on_disconnect = lambda cli, userdata, rc: print(f"MQTT: disconnected rc={rc}")

            # Install message handler (external if provided)
            client.on_message = self.__custom_on_message or _default_on_message

            # Connect & start loop
            client.connect(self.__broker, self.__port, keepalive=60)
            client.loop_start()

            self.__client = client
            return {"message": "MQTT connected"}

        except Exception as e:
            print(f"MQTT: failed to connect: {e}")
            return {"error": str(e)}

    async def subscribe(self, topic: str, qos: int = 0):
        """Optional convenience: subscribe to another topic."""
        if not self.__client:
            return {"error": "MQTT not connected"}
        try:
            self.__client.subscribe(topic, qos=qos)
            return {"message": f"subscribed to {topic}"}
        except Exception as e:
            return {"error": str(e)}

    async def publish(self, topic: str, payload: str | bytes, qos: int = 0, retain: bool = False):
        """Optional convenience: publish helper."""
        if not self.__client:
            return {"error": "MQTT not connected"}
        try:
            r = self.__client.publish(topic, payload=payload, qos=qos, retain=retain)
            # r.wait_for_publish()  # optional blocking confirmation
            return {"message": "published", "mid": r.mid}
        except Exception as e:
            return {"error": str(e)}

    async def disconnect(self):
        """Gracefully stop loop + disconnect. Safe to call multiple times."""
        cli = self.__client
        if cli is not None:
            try:
                cli.loop_stop()
            except Exception:
                pass
            try:
                cli.disconnect()
            except Exception:
                pass
        self.__client = None

    # ---------- GC fallback ----------
    def __del__(self):
        # Best-effort, in case caller forgot to call disconnect()
        try:
            if self.__client:
                self.__client.loop_stop()
                self.__client.disconnect()
        except Exception:
            pass
        self.__client = None

class MQTT_Tables:
    def __init__(self, mqtt_class,webObj,driver):
        self._executor = ThreadPoolExecutor(max_workers=4)
        self.__first_msg    = True
        self.__web = webObj
        self.__driver_name = driver
        self.__app=mqtt_class.get_app()
        self.__client=None
        self.__topic=mqtt_class.get_topic()
        self.__msg=''
        self.__mqtt=mqtt_class
        self.__NoClients = None
        self.__clients = set()  
        self.__mainCoor=self.__mqtt.get_main_coordinates()
        self.__gates=self.__mqtt.get_gates()
        print(self.__gates,self.__mainCoor)
        self.__update_task = None
        self.__req_keys=[key for key, gate in self.__gates.items()]
        self.__prev_pos=None
        self.__curr_pos=None
        self.__car_pos=[]
        self.__message=None
        self.__lap={}
        self.__track_len=0
        self.__last_sent_index = {
            "1520":0, "1522":0, "1523":0, "1524":0, "1525":0, "1526":0, "1527":0, "1563":0,"1572":0,
            "277":0, "278":0, "279":0, "280":0, "281":0, "Laps":0,
        }     
        self.__tables = {
            "1520":[], "1522":[], "1523":[], "1524":[], "1525":[], "1526":[], "1527":[], "1563":[],
            "1572":[], "277":[], "278":[], "279":[], "280":[], "281":[], "Laps":[],
        }
        self.__id_index_map = {
            1520: ["ECU_time", "Main_pulsewidth_bank1", "Main_pulsewidth_bank2", "RPM"],
            1522: ["","Coolant_temperature", "Manifold_air_pressure", "Manifold_air_temperature"],
            1523: ["Throttle_position","Battery_voltage"],
            1524: ["Air_density_correction"],
            1525: ["Warmup_correction","TPS_based_acceleration","TPS_based_fuel_cut"],
            1526: ["Total_fuel_correction","VE_value_table_bank1","VE_value_table_bank2"],
            1527: ["Cold_advance","Rate_of_change_of_TPS","Rate_of_change_of_RPM"],
            1563: ["Sync_loss_counter","Sync_loss_reason_code"],
            1572: ["Average_fuel_flow"],
            277:  ["Damper_Left_Rear","Damper_Right_Rear","Gear","Brake_Pressure","BSPD"],
            278:  ["Damper_Left_Front","Damper_Right_Front","Steering_Angle"],
            279:  ["GPS_Latitude","GPS_Longitude","GPS_Speed"],
            280:  ["Acceleration_on_X_axis","Acceleration_on_Y_axis","Acceleration_on_Z_axis"],
            281:  ["Roll","Pitch","Yaw"]
        }
        self.__id_data_map = {
            1520: ([2,2,2,2],[1,0.001,0.001,1]),
            1522: ([2,2,2,2],[0,0.1,0.1,0.1]),
            1523: ([2,2,2,2],[0.1,0.1,0,0]),
            1524: ([2,2,2,2],[0,0,0,0.1]),
            1525: ([2,2,2,2],[0.1,0.1,0.1,0]),
            1526: ([2,2,2,2],[0.1,0.1,0.1,0]),
            1527: ([2,2,2,2],[0.1,0.1,0,10]),
            1563: ([1,1,1,1,1,1,1,1],[1,1,0,0,0,0,0,0]),
            1572: ([2,2,2,2],[0,0,1,0]),
            277:  ([2,2,1,2,1],[1,1,1,1,1]),
            278:  ([2,2,2,2],[1,1,1,0]),
            279:  ([3,3,1,1],[1,1,1,0]),
            280:  ([2,2,2,2],[1,1,1,0]),
            281:  ([2,2,2,2],[1,1,1,0])
        }
        self.__driver_name=driver
        self.create_routes()

        # --- Decide CSV sink (R2 vs local) ---
        self.__csv_logger = None
        self.__local_log_path = None

        driver_csv_name = (
            self.__driver_name
            if str(self.__driver_name).lower().endswith(".csv")
            else f"{self.__driver_name}.csv"
        )

        # ✅ always use telemetry-data-files bucket when R2 is enabled
        R2_BUCKET = "telemetry-data-files"
        R2_PREFIX = "sessions"   # folder inside bucket (optional but recommended)

        driver_csv_name = f"{self.__driver_name}.csv"

                # --- R2 logging if enabled ---
        if r2.is_r2_enabled():
            r2_key = f"{r2.R2_DATA_PREFIX}{driver_csv_name}".lstrip("/")
            try:
                self.__csv_logger = r2.R2BufferedCSVLogger(r2.R2_BUCKET_DATA, r2_key)
                print(f"[R2] Logging CSV to s3://{r2.R2_BUCKET_DATA}/{r2_key}")
            except Exception as e:
                print(f"[R2] Failed, falling back to local storage: {e}")
                self.__csv_logger = None
        else:
            self.__csv_logger = None

        # --- LOCAL fallback ---
        if not self.__csv_logger:
            data_dir = os.getenv(
                "DATA_DIR",
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "data_files")
            )
            os.makedirs(data_dir, exist_ok=True)
            self.__local_log_path = os.path.join(data_dir, driver_csv_name)

            print(f"[LOCAL] Logging CSV to {self.__local_log_path}")

    def create_routes(self):
        self.__app.add_api_route("/get-data", self.get_data, methods=["GET"])
        self.__app.add_api_route("/start", self.read_from_server, methods=["POST"])
        self.__app.add_api_route("/stop-websocket", self.stop_socket, methods=["GET"])
        
    async def stop_socket(self):
        self.__NoClients = 0  # stop while loop
        if self.__update_task and not self.__update_task.done():
            self.__update_task.cancel()
            try:
                await self.__update_task
            except asyncio.CancelledError:
                print("Update task was cancelled.")

    
    def check_cross(self):
        # first point: prime and bail
        if self.__prev_pos is None:
            self.__prev_pos = self.__curr_pos
            # initialize sector index: 0=S0->1=S1->2=S2->3=finish (S0)
            self._gate_idx = 0
            return

        # accumulate track distance
        dist = self.haversine_distance(
            self.__prev_pos.lat, self.__prev_pos.lon,
            self.__curr_pos.lat, self.__curr_pos.lon
        )
        self.__track_len += dist

        # list of the three physical gates
        seq = ["S0", "S1", "S2"]

        prev, curr = self.__prev_pos, self.__curr_pos

        # --- Sector crossing logic ---
        if self._gate_idx < len(seq):
            name = seq[self._gate_idx]
            gate = self.__gates[name]
            gate.update_points(prev, curr)
            t = gate.get_intersection_time()
            if t:
                # record
                t=gate.get_time()
                self.__lap[name] = t
                if name == "S0":
                    print(f"[CHECK_CROSS] -> lap start (S0) at {t}")
                else:
                    print(f"[CHECK_CROSS] -> recorded {name} at {t}")
                # advance to next sector (or finish next)
                self._gate_idx += 1

        else:
            # --- Finish line: re-crossing S0 after S2 ---
            gate = self.__gates["S0"]
            gate.update_points(prev, curr)
            t=gate.get_intersection_time()
            if t:    
                t=gate.get_time()
                if t > self.__lap.get("S2", 0):            
                    
                    self.__lap["S3"]   = t
                    self.__lap["dist"] = self.__track_len
                    print(f"[CHECK_CROSS] lap complete: {self.__lap}")
                    self.__tables["Laps"].append(self.__lap.copy())

                    # reset for next lap: start with S0 at this finish time
                    self.__lap = {"S0": t}
                    self.__track_len = 0
                    print(f"[CHECK_CROSS] -> new lap start (S0) at {t}")

                    # now expect S1 next
                    self._gate_idx = 1

        # roll forward
        self.__prev_pos = self.__curr_pos

    async def shutdown(self):
        """
        Stop periodic update loop, flush/close CSV sink (R2/local),
        stop MQTT connection, and stop WebSocket server.
        Safe to call multiple times.
        """
        # stop the WebSocket broadcast loop (if running)
        try:
            await self.stop_socket()
        except Exception:
            pass

        # close R2/local CSV logger if present
        try:
            if hasattr(self, "_MQTT_Tables__csv_logger") and self.__csv_logger:
                self.__csv_logger.close()
                self.__csv_logger = None
        except Exception as e:
            print(f"[shutdown] CSV logger close failed: {e}")

        # disconnect MQTT
        try:
            await self.__mqtt.disconnect()
        except Exception as e:
            print(f"[shutdown] MQTT disconnect failed: {e}")

        # stop WS server (if you own/control it here)
        try:
            if hasattr(self, "_MQTT_Tables__web") and self.__web:
                await self.__web.stop_websocket()
        except Exception as e:
            print(f"[shutdown] WebSocket stop failed: {e}")

    def haversine_distance(self, lat1, lon1, lat2, lon2):
        R = 6371000  # Radius of Earth in meters

        # Convert degrees to radians
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        # Haversine formula
        a = math.sin(delta_phi / 2) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * \
            math.sin(delta_lambda / 2) ** 2

        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        distance = R * c  # in meters
        return distance

    async def send_updates_to_clients(self):
        print("In function")
        
        while self.__NoClients:
            updates = self.__get_new_data()
            if updates:
                for key, records in updates.items():
                    if isinstance(key, list):
                        key = str(key)
                    # print(records)
                    
                    for record in records: 
                         
                        if key == "Laps":

                            lap_time = round(record["S3"] - record["S0"], 3)
                            s1 = round(record["S1"] - record["S0"], 3)
                            s2 = round(record["S2"] - record["S1"], 3)
                            s3 = round(record["S3"] - record["S2"], 3)

                            message = {
                                "lap_data": {
                                    "lapTime": lap_time,
                                    "S1": s1,
                                    "S2": s2,
                                    "S3": s3,
                                    "S0_timestamp": record["S0"],
                                    "S1_timestamp": record["S1"],
                                    "S2_timestamp": record["S2"],
                                    "S3_timestamp": record["S3"],
                                    "track_length": record["dist"]
                                }
                            }
                            print(f"Laps:{message}")
                            await self.__web.send_message_to_all(message)
                        else:
                            
                            await self.__web.send_message_to_all(record)

    def __get_new_data(self):        
        new_data = {}
        for key, table in self.__tables.items():
            last_index = self.__last_sent_index[key]
            if last_index < len(table):
                new_data[key] = table[last_index:]
                self.__last_sent_index[key] = len(table)
        return new_data if new_data else None

    
    async def read_from_server(self, request: Request):
        data = await request.json()
        if data.get("start"):
            # capture the ASGI event loop
            self._loop = asyncio.get_running_loop()

            def _mqtt_paho_callback(client, userdata, message):
                # schedule our coroutine safely on that loop
                self._loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(self._on_mqtt_message(message))
                )

            # install it
            self.__mqtt.set_custom_on_message(_mqtt_paho_callback)

            # connect & subscribe
            await self.__mqtt.connect_to_mqtt()
              

    def get_aditional_data(self, id):
        return self.__id_data_map.get(id, [[], []])
       
        # [0]-size; [1]-multiplier/devider;
        
    def create_el(self,id,aux,data,time):
        if aux[1]:
            start=0
            length=len(aux[1])
            car_point=[]
            for i in range(0,length):
                el=aux[1][i]
                if el !=0: 
                    convertedData=self.convert_data(id,i,data[start:start+aux[0][i]],aux[1][i],time)
                    self.add_to_tabel(id,i,convertedData[0])
                    if id==279:
                        car_point.append(convertedData[1])
                        # print(convertedData[1])
                start+=aux[0][i]

            if id==279 and len(car_point)>2:
                car_point.append(float(time))
                # print("create",car_point[0],car_point[1],car_point[2],car_point[3])
                self.__car_pos.append(GPSPoint(car_point[0],car_point[1],car_point[2],car_point[3]))
                self.__curr_pos=self.__car_pos[-1]
                # print(self.__prev_pos,self.__curr_pos)
                self.check_cross()
                
                
    def add_to_tabel(self, id, index, data):
        name_list = self.__id_index_map.get(id)
        
        if not name_list or index >= len(name_list):
            return  # Unknown ID or invalid index

        signal_name = name_list[index]
        if id==1522:
            print(f"message from id={id} and index={index} has namelist={name_list} and signal_name={signal_name}")
        # Start a new message object when first signal arrives
        if index == 0:
            self.__message = {"timestamp": data["Time"], "values": {}}

        # Always set the value
        self.__message["values"][signal_name] = data["data"]

        # Append message to table only when this is the last expected signal
        if index == len(name_list) - 1:
            self.__tables[str(id)].append(self.__message)


    def sep_data(self,data):
        devData = [data[i:i+2] for i in range(0, len(data), 2)]
        return devData

    def convert_data(self, id, index, dataString, multiplier, time):
        combined_hex = ''.join(dataString).strip()
        row = [{"Time": time, "data": None}, None]

        try:
            if not combined_hex:
                return row

            if id == 278 or (id == 277 and (index < 2 or index == 3)):
                nr = self.convert_data_m1(combined_hex)
            elif id == 279 and index < 2:
                nr = self.convert_data_m2(index, int(combined_hex, 16))
            elif id == 1522 and index > 1:
                nr = int(combined_hex, 16) * multiplier
                nr = self.fahrenheitToCelsius(nr)
                multiplier = 1
                print(f"initial nr={combined_hex} converted to {nr}")
            else:
                nr = int(combined_hex, 16)

            if multiplier:
                nr *= multiplier

            row = [{"Time": time, "data": nr}, nr]
        except Exception as e:
            print(f"[convert_data] Failed for id={id} index={index}: {e}")

        return row

    def convert_data_m1(self,data):
        value=data
        return int(value[2:4],16)+int(value[0:2],16)*100

    def convert_data_m2(self,index,data):
        # data/=(10**len(str(data)))
        
        data/=(256**3)
        return self.__mainCoor[index]+data
    
    def fahrenheitToCelsius(self,fahrenheit):
        return (fahrenheit - 32) * 5 / 9


    async def _on_mqtt_message(self, message):
        # 1) offload heavy work into thread pool and build CAN message
        parsed = await asyncio.get_running_loop().run_in_executor(
            self._executor,
            self._parse_and_store,
            message
        )

        # 2) immediately broadcast the raw CAN‐decoded message
        await self.__web.send_message_to_all(parsed)

        # 3) check for newly completed laps in your tables
        new_data = self.__get_new_data()
        print(self.__tables["Laps"])
        if new_data and "Laps" in new_data:
            for record in new_data["Laps"]:
                # reconstruct exactly what you used to send in send_updates_to_clients
                lap_time = round(record["S3"] - record["S0"], 3)
                s1       = round(record["S1"] - record["S0"], 3)
                s2       = round(record["S2"] - record["S1"], 3)
                s3       = round(record["S3"] - record["S2"], 3)

                lap_msg = {
                    "lap_data": {
                        "lapTime":        lap_time,
                        "S1":             s1,
                        "S2":             s2,
                        "S3":             s3,
                        "S0_timestamp":   record["S0"],
                        "S1_timestamp":   record["S1"],
                        "S2_timestamp":   record["S2"],
                        "S3_timestamp":   record["S3"],
                        "track_length":   record["dist"],
                    }
                }
                print(f"Lap data:{lap_msg}")
                await self.__web.send_message_to_all(lap_msg)


    def _parse_and_store(self, message) -> dict:
        """
        Runs in a background thread:
        - decode payload
        - write to CSV
        - use existing create_el/add_to_tabel logic to build the data dict
        - return that dict for WebSocket emit
        """
        # 1) decode raw payload
        raw = message.payload.decode()
        parts = [p.strip() for p in raw.split(",") if p.strip()]

        # 2) persist full row to CSV
        
        row_str = ",".join(parts)

        if r2.is_r2_enabled() and isinstance(self.__csv_logger, r2.R2BufferedCSVLogger):
            self.__csv_logger.write_row(row_str)
        else:
            with open(self.__local_log_path, "a", encoding="utf-8") as f:
                f.write(row_str + "\n")


        # 3) extract timestamp and CAN ID
        timestamp = parts[0]
        try:
            
            can_id = int(parts[1], 16)
        except ValueError:
            return {"timestamp": timestamp, "values": {}}

        # 4) split and convert the data bytes
        aux    = self.get_aditional_data(can_id)   # [sizes], [multipliers]
        sep    = self.sep_data(parts[2])           # list of hex-pairs
        # 5) build the message via existing pipeline
        self.create_el(can_id, aux, sep, timestamp)
        # 6) __message now holds {"timestamp":..., "values":{...}}
        return self.__message.copy()

    
    def get_data(self):

        return {
            "data": self.__tables
        }




    def __del__(self):
        try:
            if self.__csv_logger:
                self.__csv_logger.close()
        except Exception as e:
            print(f"[R2] close failed: {e}")



main_app = App()




app = main_app.get_app()







