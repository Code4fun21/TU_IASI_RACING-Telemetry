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

import servert_test
from start_point import GPS_Intersection
import database

@dataclass
class GPSPoint:
        lat:float
        lon:float
        speed:float
        timestamp:float
        

class App:
    def __init__(self):
        # 1) Instantiate WS server
        self.__webObj = servert_test.WebSocketServer()

        # 2) Define the lifespan context
        @asynccontextmanager
        async def lifespan(app: FastAPI):
            # before the app starts:
            await self.__webObj.start_websocket()
            yield
            # after the app shuts down:
            await self.__webObj.stop_websocket()

        # 3) Create FastAPI with our lifespan
        self.__app = FastAPI(lifespan=lifespan)

        # 4) Add middleware (only once!)
        self.__app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # 5) Your other attributes
        self.__mqtt = None
        self.__csv = None
        self.__tables = []
        self.__gates = {}
        self.__mainCoor = []
        self.__gates_list = None
        self.__connection = None

        # 6) Now register your routes
        self.create_routes()

    def create_routes(self):
        self.__app.add_api_route("/telemetry/connect", self.create_mqtt, methods=["POST"])
        self.__app.add_api_route("/create-csv", self.create_csv, methods=["POST"])
        self.__app.add_api_route("/get-table", self.get_table_data, methods=["GET"])
        self.__app.add_api_route("/create-table", self.create_tables, methods=["GET"])
        self.__app.add_api_route("/debug", self.debug, methods=["GET"])
        self.__app.add_api_route("/save-gates", self.save_gates, methods=["POST"])
        self.__app.add_api_route("/get-csv-files", self.get_csv_files, methods=["GET"])

        self.__app.add_api_route("/api/drivers", database.add_driver, methods=["POST"])
        self.__app.add_api_route("/api/drivers/{id}", database.get_driver, methods=["GET"])
        self.__app.add_api_route("/api/drivers", database.get_all_drivers, methods=["GET"])

        self.__app.add_api_route("/api/tracks", database.add_track, methods=["POST"])
        self.__app.add_api_route("/api/tracks/{id}", database.get_track, methods=["GET"])
        self.__app.add_api_route("/api/tracks", database.get_all_tracks, methods=["GET"])

        self.__app.add_api_route("/api/monoposts", database.add_car, methods=["POST"])
        self.__app.add_api_route("/api/monoposts/{id}", database.get_car, methods=["GET"])
        self.__app.add_api_route("/api/monoposts", database.get_all_cars, methods=["GET"])

        self.__app.add_api_route("/api/timestamps", database.add_timestemp, methods=["POST"])
        self.__app.add_api_route("/api/timestamps/{column}",database.get_timestemp,methods=["GET"])
        self.__app.add_api_route("/api/timestamps", database.get_all_timestemps, methods=["GET"])

        self.__app.add_api_route("/api/sessions", database.add_session, methods=["POST"])
        self.__app.add_api_route("/api/sessions/{id}", database.get_session, methods=["GET"])
        self.__app.add_api_route("/api/sessions", database.get_all_session, methods=["GET"])

    async def get_csv_files(self):
        parent_folder = os.path.dirname(os.path.abspath(__file__))
        csv_files = glob.glob(os.path.join(parent_folder, "*.csv"))
        csv_files_info = [
            {
                "filename": os.path.basename(file),
                "last_modified": datetime.fromtimestamp(os.path.getmtime(file)).strftime('%Y-%m-%d %H:%M:%S')
            }
            for file in csv_files
        ]
        return {"csv_files": csv_files_info}

    async def save_gates(self, request: Request):
        data = await request.json()
        circuit = data["circuit"]
        gates_list = data["gates"]
        gates_json = [
            {
                "name": f"S{i}",
                "lat1": gate[0],
                "lon1": gate[1],
                "lat2": gate[2],
                "lon2": gate[3]
            }
            for i, gate in enumerate(gates_list)
        ]
        with open(f"{circuit}_gates.json", "w") as file:
            json.dump(gates_json, file, indent=4)

    async def debug(self):
        return {
            "mqtt": int(self.__mqtt is not None),
            "csv": int(self.__csv is not None)
        }

    async def clean_up(self):
        self.__gates_list = None
        self.__mainCoor = []
        if self.__csv:
            self.__csv.__del__
            self.__csv = None
        # if self.__webObj:
        #     print("Stopping socket...")
        #     await self.__webObj.stop_websocket()
        if self.__connection:
            await self.__connection.stop_socket()
            self.__connection=None
        if self.__mqtt:
            self.__mqtt.__del__
            self.__mqtt = None

        for table in self.__tables:
            if table:
                table.__del__
        self.__connection = None

    def get_gates_array(self, file):
        try:
            with open(file, mode='r') as openedFile:
                data = json.load(openedFile)
                for gate in data:
                    gl = GPSPoint(gate["lat1"], gate["lon1"], -1, -1)
                    gr = GPSPoint(gate["lat2"], gate["lon2"], -1, -1)
                    self.__gates[f"{gate['name']}"] = GPS_Intersection(gl, gr)
        except Exception as e:
            return {"Error": str(e)}

    async def create_csv(self, request: Request):
        await self.clean_up()
        data = await request.json()
        files = data["files"].split(",")
        self.__gates_list = data["gates"]
        coorStr = data["trackCoordonates"]
        coorArray = coorStr.split(",")
        self.__mainCoor = [int(coorArray[0]), int(coorArray[1])]
        if self.__csv:
            return {"Error": "CSV object already exists"}
        self.get_gates_array(self.__gates_list)
        self.__csv = CSV(self.__gates, self.__mainCoor, self.__tables, self.__app)
        for file in files:
            await self.__csv.add_file(file)

    async def create_tables(self, file_no: int):
        if not self.__csv:
            return {"Error": "CSV instance not initialized"}
        if file_no >= len(self.__csv.get_files()):
            return {"Error": "Invalid file number"}
        table = CSV_Tables(self.__csv)
        await table.add_data_from(file_no)
        self.__tables.append(table)
        return {"Message": f"Table created for file index {file_no}","tables":table.get_data()}

    async def get_table_data(self, file_no: int):
        if file_no >= len(self.__tables):
            return {"Error": "Invalid table index"}
        return {"Message": "yes", "Data": self.__tables[file_no].get_data()}

    async def create_mqtt(self, request: Request):
        data = await request.json()

        # Clean existing connection
        if self.__mqtt:
            print("Cleaning up existing MQTT...")
            await self.clean_up()
            if self.__connection:
                await self.__connection.stop_socket()

        broker = data["broker"]
        port = int(data["port"])
        topic = data["topic"]
        client_id = data["clientId"]
        track = await database.get_track(data["trackId"])
        self.__gates_list = track["gates"]

        self.get_gates_array(self.__gates_list)
        coorStr = track["trackCoordonates"]
        coorArray = coorStr.split(",")
        self.__mainCoor = [int(coorArray[0]), int(coorArray[1])]

        self.create_mqtt_instance(self.__gates, self.__mainCoor, broker, port, topic, client_id)
        await self.__webObj.start_websocket()
        await self.__mqtt.connect_to_mqtt()
        self.__connection = MQTT_Tables(self.__mqtt, self.__webObj,data["fileName"])
        return {"Message": "MQTT object created"}

    def create_mqtt_instance(self, gates, mainCoor, broker, port, topic, client_id):
        self.__mqtt = MQTT(self.__app, gates, mainCoor, broker, port, topic, client_id)

    def get_app(self):
        return self.__app






class CSV:
    def __init__(self,corners,mainCoordinates,tables, app: FastAPI):
        self.__app = app
        self.__files = []
        self.__tables=tables
        self.__gates=corners
        self.__mainCoor=mainCoordinates
        self.create_routes()

    def create_routes(self):
        self.__app.add_api_route("/get-files",self.get_files,methods=["GET"])

    
    async def add_file(self,path):
        if not path in self.__files:
            self.__files.append(path)
            self.__tables.append(None)
    
    def get_files(self):
        return self.__files
    
    def get_app(self):
        return self.__app

    def get_corners(self):
        return self.__corners
            
    def get_gates(self):
        return self.__gates
    
    def get_main_coordinates(self):
        return self.__mainCoor

    def __del__(self):
        print("Destructor called for CSV")
        self.__app=None
        self.__files=[]      






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

    def __init__(self,csv_class: "CSV"):
        self.__app=csv_class.get_app()
        self.__csv_files=csv_class.get_files()

        self.__RPM = pd.DataFrame(columns=["Time", "data"])
        self.__ECU_time = pd.DataFrame(columns=["Time", "data"])
        self.__Main_pulsewidth_bank1 = pd.DataFrame(columns=["Time", "data"])
        self.__Main_pulsewidth_bank2 = pd.DataFrame(columns=["Time", "data"])
        
        self.__Manifold_air_pressure = pd.DataFrame(columns=["Time", "data"])
        self.__Manifold_air_temperature = pd.DataFrame(columns=["Time", "data"])
        self.__Coolant_temperature = pd.DataFrame(columns=["Time", "data"])
        
        self.__Throttle_position = pd.DataFrame(columns=["Time", "data"])
        self.__Battery_voltage = pd.DataFrame(columns=["Time", "data"])
        
        self.__Air_density_correction = pd.DataFrame(columns=["Time", "data"])

        self.__Warmup_correction = pd.DataFrame(columns=["Time", "data"])        
        self.__TPS_based_acceleration = pd.DataFrame(columns=["Time", "data"])
        self.__TPS_based_fuel_cut = pd.DataFrame(columns=["Time", "data"])

        self.__Total_fuel_correction = pd.DataFrame(columns=["Time", "data"])        
        self.__VE_value_table_bank1 = pd.DataFrame(columns=["Time", "data"])
        self.__VE_value_table_bank2 = pd.DataFrame(columns=["Time", "data"])

        self.__Cold_advance = pd.DataFrame(columns=["Time", "data"])        
        self.__Rate_of_change_of_TPS = pd.DataFrame(columns=["Time", "data"])
        self.__Rate_of_change_of_RPM = pd.DataFrame(columns=["Time", "data"])

        self.__Sync_loss_counter = pd.DataFrame(columns=["Time", "data"])
        self.__Sync_loss_reason_code = pd.DataFrame(columns=["Time", "data"])

        self.__Average_fuel_flow = pd.DataFrame(columns=["Time", "data"])      

        self.__Damper_Left_Rear = pd.DataFrame(columns=["Time", "data"])      
        self.__Damper_Right_Rear = pd.DataFrame(columns=["Time", "data"])      
        self.__Gear = pd.DataFrame(columns=["Time", "data"])      
        self.__Brake_Pressure = pd.DataFrame(columns=["Time", "data"])   
        self.__BSPD = pd.DataFrame(columns=["Time", "data"]) 

        self.__Roll = pd.DataFrame(columns=["Time", "data"])
        self.__Pitch = pd.DataFrame(columns=["Time", "data"])        
        self.__Yaw = pd.DataFrame(columns=["Time", "data"])

        self.__Damper_Left_Front = pd.DataFrame(columns=["Time", "data"])
        self.__Damper_Right_Front = pd.DataFrame(columns=["Time", "data"])        
        self.__Steering_Angle = pd.DataFrame(columns=["Time", "data"])

        self.__GPS_Latitude = pd.DataFrame(columns=["Time", "data"])
        self.__GPS_Longitude = pd.DataFrame(columns=["Time", "data"])        
        self.__GPS_Speed = pd.DataFrame(columns=["Time", "data"])

        self.__Acceleration_on_X_axis = pd.DataFrame(columns=["Time", "data"])
        self.__Acceleration_on_Y_axis = pd.DataFrame(columns=["Time", "data"])        
        self.__Acceleration_on_Z_axis = pd.DataFrame(columns=["Time", "data"])

        self.__Gyroscope_on_X_axis = pd.DataFrame(columns=["Time", "data"])
        self.__Gyroscope_on_Y_axis = pd.DataFrame(columns=["Time", "data"])        
        self.__Gyroscope_on_Z_axis = pd.DataFrame(columns=["Time", "data"])

        self.__Gates_times=pd.DataFrame(columns=["Time", "data"])

        # IMU filtering toggle & tuning (no external deps)
        self.__ENABLE_IMU_KALMAN = True
        self.__KF_PROCESS_VAR = 0.05   # Q — increase = smoother, but more lag
        self.__KF_MEASURE_VAR = 4.0    # R — increase = trust filter more than measurements

        # self.__corners=
        self.__mainCoor=csv_class.get_main_coordinates()
        self.__gates_pos=csv_class.get_gates()
        print("GAtes&Coor",self.__gates_pos,self.__mainCoor)
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
        self.__prev_pos=None
        self.__curr_pos=None
        self.__track_len=0
        self.__lap={}
        self.__car_pos=[]
        self.__just_s0=None
        

    # ---------- SIMPLE 1D KALMAN FILTER (value-only) ----------
    def _kalman_filter_df(self, df: pd.DataFrame, process_var=None, measure_var=None) -> pd.DataFrame:
        """Apply a basic 1D Kalman filter to df['data'] and return a copy with smoothed 'data'.
        No external libraries; constant model (good enough for IMU smoothing)."""
        if df is None or df.empty:
            return df

        q = self.__KF_PROCESS_VAR if process_var is None else process_var
        r = self.__KF_MEASURE_VAR if measure_var is None else measure_var

        # State: x (value), covariance: p
        x = float(df["data"].iloc[0])
        p = 1.0

        F = 1.0   # state transition
        H = 1.0   # measurement
        Q = float(q)
        R = float(r)

        out = []
        for z in df["data"].astype(float).tolist():
            # predict
            x = F * x
            p = F * p * F + Q
            # update
            K = (p * H) / (H * p * H + R)
            x = x + K * (z - H * x)
            p = (1 - K * H) * p
            out.append(x)

        df_filt = df.copy()
        df_filt["data"] = out
        return df_filt

    def _kalman_filter_2d_accel_velocity(self, df: pd.DataFrame,
                                        process_Q=None,
                                        measure_R=None) -> pd.DataFrame:
        if df is None or df.empty:
            return df.copy()

        w = df.copy()
        w["Time"] = w["Time"].astype(float)
        w = w.sort_values("Time").reset_index(drop=True)

        if process_Q is None:
            process_Q = np.array([[1e-3, 0.0],
                                [0.0,  1e-2]], dtype=float)
        if measure_R is None:
            measure_R = 1e-1  # (m/s^2)^2

        first_acc = float(w["data"].iloc[0])
        # x = [vel, accel]
        x = np.array([0.0, first_acc], dtype=float)
        P = np.eye(2, dtype=float)

        I = np.eye(2, dtype=float)

        vel_list = []
        acc_list = []
        t_list   = []

        times = w["Time"].to_numpy(float)
        meas_accels = w["data"].to_numpy(float)

        last_t = times[0]

        for t, z in zip(times, meas_accels):
            dt = t - last_t
            if dt < 0:
                dt = 0.0
            last_t = t

            # Predict
            F = np.array([[1.0, dt],
                        [0.0, 1.0]], dtype=float)
            x = F @ x
            P = F @ P @ F.T + process_Q

            # Update
            H = np.array([[0.0, 1.0]], dtype=float)  # measure accel only
            z_pred = H @ x
            y = z - z_pred[0]

            S = (H @ P @ H.T)[0, 0] + measure_R
            K = (P @ H.T) / S
            x = x + K.flatten() * y
            P = (I - K @ H) @ P

            vel_list.append(x[0])
            acc_list.append(x[1])
            t_list.append(t)

        out = pd.DataFrame({
            "Time": t_list,
            "vel": vel_list,     # m/s
            "accel": acc_list,   # m/s^2 filtered
        })
        return out

    def _kalman_filter_2d_gyro(self, df: pd.DataFrame,
                           process_Q=None,
                           measure_R=None) -> pd.DataFrame:
        if df is None or df.empty:
            return df.copy()

        w = df.copy()
        w["Time"] = w["Time"].astype(float)
        w = w.sort_values("Time").reset_index(drop=True)

        if process_Q is None:
            process_Q = np.array([[1e-5, 0.0],
                                [0.0,  1e-4]], dtype=float)
        if measure_R is None:
            measure_R = 1e-3  # (rad/s)^2

        first_rate = float(w["data"].iloc[0])
        # x = [angle, rate]
        x = np.array([0.0, first_rate], dtype=float)
        P = np.eye(2, dtype=float)

        I = np.eye(2, dtype=float)

        ang_list = []
        rate_list = []
        t_list    = []

        times = w["Time"].to_numpy(float)
        meas_rates = w["data"].to_numpy(float)

        last_t = times[0]

        for t, z in zip(times, meas_rates):
            dt = t - last_t
            if dt < 0:
                dt = 0.0
            last_t = t

            # Predict
            F = np.array([[1.0, dt],
                        [0.0, 1.0]], dtype=float)
            x = F @ x
            P = F @ P @ F.T + process_Q

            # Update
            H = np.array([[0.0, 1.0]], dtype=float)  # we observe rate
            z_pred = H @ x
            y = z - z_pred[0]

            S = (H @ P @ H.T)[0, 0] + measure_R
            K = (P @ H.T) / S
            x = x + K.flatten() * y
            P = (I - K @ H) @ P

            ang_list.append(x[0])
            rate_list.append(x[1])
            t_list.append(t)

        out = pd.DataFrame({
            "Time": t_list,
            "angle": ang_list,   # rad
            "rate": rate_list,   # rad/s filtered
        })
        return out


    # ---------- Helper: integrate rate-of-change (only if __IMU_INPUT_KIND == "rate") ----------
    def _integrate_df(self, df: pd.DataFrame) -> pd.DataFrame:
        """Integrate df['data'] using df['Time'] (seconds). Assumes 'data' is rate-of-change."""
        if df is None or df.empty:
            return df
        df = df.copy()
        df["Time"] = df["Time"].astype(float)
        df = df.sort_values("Time")
        dt = df["Time"].diff().fillna(0)
        df["data"] = (df["data"].astype(float) * dt).cumsum()
        return df

    # ---------- Helpers: counts -> SI ----------
    def _scale_accel_counts_to_ms2(self, df: pd.DataFrame) -> pd.DataFrame:
        """Counts (values) -> m/s², using ACCEL_SENS counts/g."""
        if df is None or df.empty:
            return df
        out = df.copy()
        out["data"] = (out["data"].astype(float) / self.ACCEL_SENS) * 9.80665
        return out

    def _scale_gyro_counts_to_rads(self, df: pd.DataFrame) -> pd.DataFrame:
        """Counts (values) -> rad/s, using GYRO_SENS counts/(°/s)."""
        if df is None or df.empty:
            return df
        out = df.copy()
        out["data"] = (out["data"].astype(float) / self.GYRO_SENS) * (np.pi / 180.0)
        return out

    # ---------- Optional: remove DC bias from first N samples ----------
    def _remove_bias(self, df: pd.DataFrame, n:int) -> pd.DataFrame:
        if df is None or df.empty or n <= 0:
            return df
        n = min(n, len(df))
        bias = df["data"].astype(float).iloc[:n].mean()
        out = df.copy()
        out["data"] = out["data"].astype(float) - bias
        return out

    def check_cross(self, finalize: bool = False):
        """
        ALWAYS test S0 first on every segment.
        - If we see S0 with no S2 yet -> (re)start lap at S0 (resync)
        - If we see S0 after S2        -> close lap (S3) and start new lap at that S0
        Also flushes incomplete lap on finalize=True.
        """
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

        # --- S0 FIRST ---
        s0 = self.__gates_pos["S0"]
        s0.update_points(prev, curr)
        if s0.get_intersection_time():
            t0 = s0.get_time()
            if self.__lap.get("S2") is not None and t0 > self.__lap["S2"]:
                # close lap
                self.__lap["S3"] = t0
                print(f"[CHECK_CROSS] lap complete: {self.__lap}")
                _push_current_lap(complete=True, t_for_row=t0)
                # start next at this S0
                self.__lap = {"S0": t0}
                self.__track_len = 0
                self._gate_idx = 1
                self.__just_s0 = True
                print(f"[CHECK_CROSS] -> new lap start (S0) at {t0}")
            else:
                # start/resync lap at this S0
                self.__lap = {"S0": t0}
                self.__track_len = 0
                self._gate_idx = 1
                self.__just_s0 = True
                print(f"[CHECK_CROSS] -> lap start (S0) at {t0}")
        else:
            # Then look for the expected sector (S1 or S2)
            seq = ["S0", "S1", "S2"]
            if 0 < self._gate_idx < len(seq):
                name = seq[self._gate_idx]
                g = self.__gates_pos[name]
                g.update_points(prev, curr)
                if g.get_intersection_time():
                    t = g.get_time()
                    self.__lap[name] = t
                    print(f"[CHECK_CROSS] -> recorded {name} at {t}")
                    self._gate_idx += 1

        # accumulate distance after S0
        if self._gate_idx > 0 and not getattr(self, "__just_s0", False):
            self.__track_len += dist
        if getattr(self, "__just_s0", False):
            self.__just_s0 = False

        # EOF flush
        if finalize and "S0" in self.__lap and "S3" not in self.__lap:
            t_last = self.__lap.get("S2") or self.__lap.get("S1") or self.__lap.get("S0") or \
                    getattr(curr, "time", None) or getattr(curr, "timestamp", None) or 0
            print(f"[CHECK_CROSS] finalize -> pushing INCOMPLETE lap: {self.__lap} (t={t_last})")
            _push_current_lap(complete=False, t_for_row=t_last)

        self.__prev_pos = curr


    def haversine_distance(self, lat1, lon1, lat2, lon2):
        R = 6371000
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = math.sin(delta_phi / 2) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * \
            math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance = R * c
        return distance

   

    async def add_data_from(self, file: int, reorder_window_s: float = 0.5):

        try:
            print("Opening file:", self.__csv_files[file])

            # Min-heap of (time_float, row)
            heap = []
            have_max_t = None

            def _drain_ready(until_t):
                # Pop rows whose time <= until_t
                while heap and heap[0][0] <= until_t:
                    _t, row = heapq.heappop(heap)
                    _process_row(row)

            def _process_row(row):
                # row: [time, id_hex, payload]
                time = row[0].strip()
                try:
                    _id = int(row[1].strip(), 16)   # e.g. "117" -> 279
                except Exception:
                    return
                aux  = self.get_aditional_data(_id)
                data = self.sep_data(row[2])
                self.create_el(_id, aux, data, time)  # will emit GPSPoint only if id==279

            with open(self.__csv_files[file], mode='r', newline='',encoding="utf-8", errors="replace") as openedFile:
                reader = csv.reader(openedFile)

                for row in reader:
                    # Skip blanks and obvious headers
                    if not row or len(row) < 3 or row[0].strip().lower() in ("time", "timestamp"):
                        continue
                    try:
                        t = float(row[0])
                    except Exception:
                        # malformed time -> skip
                        continue

                    if have_max_t is None:
                        have_max_t = t
                    else:
                        have_max_t = max(have_max_t, t)

                    # push to heap
                    heapq.heappush(heap, (t, row))

                    # Drain anything that is safely behind the current max time
                    # so we keep only a small reorder buffer in memory.
                    _drain_ready(have_max_t - reorder_window_s)

                # EOF: drain everything that remains
                while heap:
                    _t, row = heapq.heappop(heap)
                    _process_row(row)

            # EOF -> flush any in-progress lap
            self.check_cross(finalize=True)

        except Exception as e:
            print("Error reading file:", e)


    def get_aditional_data(self, id):
        return self.__id_data_map.get(id, [[], []])

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
                start+=aux[0][i]

            if id==279 and len(car_point)>2:
                car_point.append(float(time))
                self.__car_pos.append(GPSPoint(car_point[0],car_point[1],car_point[2],car_point[3]))
                self.__curr_pos=self.__car_pos[-1]
                self.check_cross()

    def add_to_tabel(self, id, index, data):
        signal_name = self.__get_signal_name(id, index)
        if not signal_name:
            return

        df = getattr(self, f"_{self.__class__.__name__}__{signal_name}")
        if isinstance(data, dict):
            data = pd.DataFrame([data])  
            if not data.empty and not data.dropna(how="all").empty:
                new_df = pd.concat([df, data], ignore_index=True)
            else:
                new_df = df
            setattr(self, f"_{self.__class__.__name__}__{signal_name}", new_df)

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
        data/=(10**len(str(data)))
        return self.__mainCoor[index]+data
    
    def fahrenheitToCelsius(self,fahrenheit):
        return (fahrenheit - 32) * 5 / 9

    def _series_dict_from_df(self, df: pd.DataFrame, time_col: str, value_col: str) -> dict:
        """
        Turn columns Time + value_col into {Time: value}
        Time will be stringified as the dict key (JS Object keys are strings anyway).
        """
        out = {}
        t_arr = df[time_col].astype(float).to_numpy()
        v_arr = df[value_col].astype(float).to_numpy()
        for t, v in zip(t_arr, v_arr):
            out[str(t)] = v
        return out

    def _pre_smooth(self, df, window=5):
        if df is None or df.empty:
            return df
        df = df.copy()
        df["data"] = (
            df["data"]
            .astype(float)
            .rolling(window=window, min_periods=1, center=True)
            .mean()
        )
        return df


    def get_data(self):
        # ----- Gates -----
        if not self.__Gates_times.empty:
            gates = {
                "timestamps": self.__Gates_times["Time"].astype(float).tolist(),
                "lap_data"  : self.__Gates_times["data"].tolist()
            }
        else:
            gates = {"timestamps": [], "lap_data": []}

        # ----- IMU raw -> SI units -----
        acc_x = self.__Acceleration_on_X_axis.dropna()
        acc_y = self.__Acceleration_on_Y_axis.dropna()
        acc_z = self.__Acceleration_on_Z_axis.dropna()
        gyro_x = self.__Gyroscope_on_X_axis.dropna()
        gyro_y = self.__Gyroscope_on_Y_axis.dropna()
        gyro_z = self.__Gyroscope_on_Z_axis.dropna()

        # counts -> physical units
        acc_x = self._scale_accel_counts_to_ms2(acc_x)
        acc_y = self._scale_accel_counts_to_ms2(acc_y)
        acc_z = self._scale_accel_counts_to_ms2(acc_z)

        gyro_x = self._scale_gyro_counts_to_rads(gyro_x)
        gyro_y = self._scale_gyro_counts_to_rads(gyro_y)
        gyro_z = self._scale_gyro_counts_to_rads(gyro_z)

        # bias removal
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
            # 2D accel: vel+accel
            acc_x_f = self._kalman_filter_2d_accel_velocity(acc_x,process_Q=np.array([[1e-4, 0.0],[0.0,  1e-4]], dtype=float),measure_R=1,)
            acc_y_f = self._kalman_filter_2d_accel_velocity(acc_y,process_Q=np.array([[1e-4, 0.0],[0.0,  1e-4]], dtype=float),measure_R=1,)
            acc_z_f = self._kalman_filter_2d_accel_velocity(acc_z,process_Q=np.array([[1e-4, 0.0],[0.0,  1e-4]], dtype=float),measure_R=1,)

            # 2D gyro: angle+rate
            gyro_x_f = self._kalman_filter_2d_gyro(gyro_x,process_Q=np.array([[1e-5, 0.0],[0.0,  1e-5]], dtype=float),measure_R=1,)
            gyro_y_f = self._kalman_filter_2d_gyro(gyro_y,process_Q=np.array([[1e-5, 0.0],[0.0,  1e-5]], dtype=float),measure_R=1,)
            gyro_z_f = self._kalman_filter_2d_gyro(gyro_z,process_Q=np.array([[1e-5, 0.0],[0.0,  1e-5]], dtype=float),measure_R=1,)

            # convert to {timestamp: value} dicts, using the columns
            Accel_X_dict = self._series_dict_from_df(acc_x_f, "Time", "accel")
            Accel_Y_dict = self._series_dict_from_df(acc_y_f, "Time", "accel")
            Accel_Z_dict = self._series_dict_from_df(acc_z_f, "Time", "accel")

            Gyro_X_dict  = self._series_dict_from_df(gyro_x_f, "Time", "rate")
            Gyro_Y_dict  = self._series_dict_from_df(gyro_y_f, "Time", "rate")
            Gyro_Z_dict  = self._series_dict_from_df(gyro_z_f, "Time", "rate")

            # optional extras you can expose, not currently used in React:
            Vel_X_dict   = self._series_dict_from_df(acc_x_f, "Time", "vel")
            Vel_Y_dict   = self._series_dict_from_df(acc_y_f, "Time", "vel")
            Vel_Z_dict   = self._series_dict_from_df(acc_z_f, "Time", "vel")

            Angle_X_dict = self._series_dict_from_df(gyro_x_f, "Time", "angle")
            Angle_Y_dict = self._series_dict_from_df(gyro_y_f, "Time", "angle")
            Angle_Z_dict = self._series_dict_from_df(gyro_z_f, "Time", "angle")
        else:
            # no kalman: just dump the bias-corrected physical units directly
            # build dict {timestamp: value} from raw df["Time"], df["data"]

            def df_to_dict(df):
                out = {}
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

            Vel_X_dict = {}
            Vel_Y_dict = {}
            Vel_Z_dict = {}
            Angle_X_dict = {}
            Angle_Y_dict = {}
            Angle_Z_dict = {}

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




    def get_filtred_data(self):
        return {
            "RPM": lttb.downsample(self.__RPM.dropna().astype(float).to_numpy(), n_out=50),
            "ECU_time": lttb.downsample(self.__ECU_time.dropna().astype(float).to_numpy(), n_out=50),
            "Main_pulsewidth_bank1": lttb.downsample(self.__Main_pulsewidth_bank1.dropna().astype(float).to_numpy(), n_out=50),
            "Main_pulsewidth_bank2": lttb.downsample(self.__Main_pulsewidth_bank2.dropna().astype(float).to_numpy(), n_out=50),

            "Manifold_air_pressure": lttb.downsample(self.__Manifold_air_pressure.dropna().astype(float).to_numpy(), n_out=50),
            "Manifold_air_temperature": lttb.downsample(self.__Manifold_air_temperature.dropna().astype(float).to_numpy(), n_out=50),
            "Coolant_temperature": lttb.downsample(self.__Coolant_temperature.dropna().astype(float).to_numpy(), n_out=50),

            "Throttle_position": lttb.downsample(self.__Throttle_position.dropna().astype(float).to_numpy(), n_out=50),
            "Battery_voltage": lttb.downsample(self.__Battery_voltage.dropna().astype(float).to_numpy(), n_out=50),

            "Air_density_correction": lttb.downsample(self.__Air_density_correction.dropna().astype(float).to_numpy(), n_out=50),
            "Warmup_correction": lttb.downsample(self.__Warmup_correction.dropna().astype(float).to_numpy(), n_out=50),
            "TPS_based_acceleration": lttb.downsample(self.__TPS_based_acceleration.dropna().astype(float).to_numpy(), n_out=50),
            "TPS_based_fuel_cut": lttb.downsample(self.__TPS_based_fuel_cut.dropna().astype(float).to_numpy(), n_out=50),

            "Total_fuel_correction": lttb.downsample(self.__Total_fuel_correction.dropna().astype(float).to_numpy(), n_out=50),
            "VE_value_table_bank1": lttb.downsample(self.__VE_value_table_bank1.dropna().astype(float).to_numpy(), n_out=50),
            "VE_value_table_bank2": lttb.downsample(self.__VE_value_table_bank2.dropna().astype(float).to_numpy(), n_out=50),

            "Cold_advance": lttb.downsample(self.__Cold_advance.dropna().astype(float).to_numpy(), n_out=50),
            "Rate_of_change_of_TPS": lttb.downsample(self.__Rate_of_change_of_TPS.dropna().astype(float).to_numpy(), n_out=50),
            "Rate_of_change_of_RPM": lttb.downsample(self.__Rate_of_change_of_RPM.dropna().astype(float).to_numpy(), n_out=50),

            "Sync_loss_counter": lttb.downsample(self.__Sync_loss_counter.dropna().astype(float).to_numpy(), n_out=50),
            "Sync_loss_reason_code": lttb.downsample(self.__Sync_loss_reason_code.dropna().astype(float).to_numpy(), n_out=50),

            "Average_fuel_flow": lttb.downsample(self.__Average_fuel_flow.dropna().astype(float).to_numpy(), n_out=50),

            "Damper_Left_Rear": lttb.downsample(self.__Damper_Left_Rear.dropna().astype(float).to_numpy(), n_out=50),
            "Damper_Right_Rear": lttb.downsample(self.__Damper_Right_Rear.dropna().astype(float).to_numpy(), n_out=50),
            "Gear": lttb.downsample(self.__Gear.dropna().astype(float).to_numpy(), n_out=50),
            "Brake_Pressure": lttb.downsample(self.__Brake_Pressure.dropna().astype(float).to_numpy(), n_out=50),
            "BSPD": lttb.downsample(self.__BSPD.dropna().astype(float).to_numpy(), n_out=50),

            "Roll": lttb.downsample(self.__Roll.dropna().astype(float).to_numpy(), n_out=50),
            "Pitch": lttb.downsample(self.__Pitch.dropna().astype(float).to_numpy(), n_out=50),
            "Yaw": lttb.downsample(self.__Yaw.dropna().astype(float).to_numpy(), n_out=50),

            "Damper_Left_Front": lttb.downsample(self.__Damper_Left_Front.dropna().astype(float).to_numpy(), n_out=50),
            "Damper_Right_Front": lttb.downsample(self.__Damper_Right_Front.dropna().astype(float).to_numpy(), n_out=50),
            "Steering_Angle": lttb.downsample(self.__Steering_Angle.dropna().astype(float).to_numpy(), n_out=50),

            "GPS_Latitude": lttb.downsample(self.__GPS_Latitude.dropna().astype(float).to_numpy(), n_out=50),
            "GPS_Longitude": lttb.downsample(self.__GPS_Longitude.dropna().astype(float).to_numpy(), n_out=50),
            "GPS_Speed": lttb.downsample(self.__GPS_Speed.dropna().astype(float).to_numpy(), n_out=50),

            "Acceleration_on_X_axis": lttb.downsample(self.__Acceleration_on_X_axis.dropna().astype(float).to_numpy(), n_out=50),
            "Acceleration_on_Y_axis": lttb.downsample(self.__Acceleration_on_Y_axis.dropna().astype(float).to_numpy(), n_out=50),
            "Acceleration_on_Z_axis": lttb.downsample(self.__Acceleration_on_Z_axis.dropna().astype(float).to_numpy(), n_out=50),
            "Gates_times": lttb.downsample(self.__Gates_times.dropna().astype(float).to_numpy(), n_out=50),
        }


    def __del__(self):
        print("Destructor called for CSV_Tables")
        self.__RPM = None
        self.__Barometric_pressure = None
        self.__Manifold_air_pressure = None
        self.__Manifold_air_temperature = None
        self.__Coolant_temperature = None
        self.__Throttle_position = None
        self.__Battery_voltage = None





class MQTT:
    def __init__(self, app: FastAPI, corners, mainCoordinates, broker='mqtt.eclipseprojects.io', port=1883, topic="python/mqtt", client_id="3"):
        self.__app = app
        self.__broker = broker
        self.__port = port
        self.__client_id = client_id
        self.__topic = topic
        self.__client = None
        self.__gates = corners
        self.__mainCoor = mainCoordinates
        self.__websocket_runner = None

        self.__custom_on_message = None 
        
    async def connect_to_mqtt(self):
        def on_connect(client, userdata, flags, rc):
            if rc == 0:
                print("Connected to MQTT Broker!")
                client.subscribe(self.__topic)
            else:
                print(f"Failed to connect, return code {rc}")

        def default_on_message(client, userdata, msg):
            try:
                print(f"Message received on {msg.topic}: {msg.payload.decode()}")
            except Exception as e:
                print(f"Error handling message: {e}")

        try:
            client = mqtt_client.Client()

            # OPTIONAL: credentials
            if hasattr(self, "__username") and hasattr(self, "__password"):
                client.username_pw_set(self.__username, self.__password)

            # OPTIONAL: TLS (for secure brokers)
            if self.__port == 8883:
                client.tls_set(tls_version=ssl.PROTOCOL_TLS)
                client.tls_insecure_set(True)

            client.on_connect = on_connect

            # ✅ Use custom handler if available
            if self.__custom_on_message:
                client.on_message = self.__custom_on_message
            else:
                client.on_message = default_on_message

            client.connect(self.__broker, self.__port)
            client.loop_start()

            self.__client = client
            print("MQTT loop started")
            return {"message": "MQTT connected"}

        except Exception as e:
            print(f"Failed to connect to MQTT broker: {e}")
            return {"error": str(e)}

    def set_custom_on_message(self, handler):  # ✅ NEW: allows others to set handler
        self.__custom_on_message = handler

    def get_client(self):
        return self.__client

    def get_app(self):
        return self.__app

    def get_topic(self):
        return self.__topic

    def get_gates(self):
        return self.__gates

    def get_main_coordinates(self):
        return self.__mainCoor

    def __del__(self):
        if self.__client:
            self.__client.loop_stop()
            self.__client.disconnect()
            self.__client = None



class MQTT_Tables:
    def __init__(self, mqtt_class,webObj,driver):
        self._executor = ThreadPoolExecutor(max_workers=4)
        self.__first_msg    = True
        self.__web = webObj
        self.__driver_name = driver
        self.__app=mqtt_class.get_app()
        self.__client=None
        self.__web=webObj
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
        
        with open(f"{self.__driver_name}", "a", newline="") as f:
            csv.writer(f).writerow(parts)

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
        print("Destructor called for MQTT_Tables")
        if self.__client:
            self.__client.loop_stop() 
            for el in self.__tables:
                el=None



main_app = App()




app = main_app.get_app()







