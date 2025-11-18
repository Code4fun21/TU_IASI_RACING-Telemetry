import json
from datetime import datetime
from fastapi import Request
import os
from fastapi import Query
from typing import Union, Any
'''Drivers''' 
async def add_driver(request: Request):
    try:
        data = await request.json()
        drivers = load_json_list("drivers.json")
        drivers.append(data)
        # Auto-generate a new car ID if not provided
        existing_ids = [driver.get("driverId", 0) for driver in drivers]
        new_id = max(existing_ids, default=0) + 1
        data["weight"]=int(data["weight"])
        # Assign the ID (if missing)
        data.setdefault("driverId", new_id)

        drivers.append(data)
        save_json_list("drivers.json", drivers)

        return {
            "message": "Setup added successfully",
            "driver": {**data, "id": data["driverId"]} 
        }
    except Exception as e:
        return {"error": str(e)}



async def get_driver(id:int):
    try:
        with open("drivers.json", mode='r') as openedFile:
            drivers = json.load(openedFile)  
            for driver in drivers:
                #   print(driver["driverId"],id,driver["driverId"]==id)
                  if driver["driverId"]==id:
                        return driver
        return{f"No driver with the id {id}"}
    except Exception as e:
                return {"Error": str(e)}  
    

async def get_all_drivers():
    # print("drivers")
    drivers = load_json_list("drivers.json")
    for driver in drivers:
        driver["id"] = driver.pop("driverId")  # Rename key
    return drivers




'''Track'''   
async def add_track(request: Request):
    try:
        data = await request.json()
        tracks = load_json_list("tracks.json")

        # Auto-generate a new car ID if not provided
        existing_ids = [track.get("trackId", 0) for track in tracks]
        new_id = max(existing_ids, default=0) + 1

        # Assign the ID (if missing)
        data.setdefault("trackId", new_id)

        tracks.append(data)
        save_json_list("tracks.json", tracks)

        return {
            "message": "Setup added successfully",
            "car": {**data, "id": data["trackId"]} 
        }
    except Exception as e:
        return {"error": str(e)}

async def get_track(id):
    
    try:
        with open("tracks.json", mode='r') as openedFile:
            tracks = json.load(openedFile)  
            for track in tracks:
                if track["trackId"]==int(id):
                    print(track)
                    return track
            return{f"No track with the id {id}"}
    except Exception as e:
                return {"Error": str(e)}
    
async def get_all_tracks():
    tracks = load_json_list("tracks.json")
    for track in tracks:
        track["id"] = track.pop("trackId")  # Rename key
    return tracks


'''Car'''

   

async def add_car(request: Request):
    try:
        data = await request.json()
        cars = load_json_list("car_setups.json")

        # Auto-generate a new car ID if not provided
        existing_ids = [car.get("carId", 0) for car in cars]
        new_id = max(existing_ids, default=0) + 1

        # Assign the ID (if missing)
        data.setdefault("carId", new_id)

        cars.append(data)
        save_json_list("car_setups.json", cars)

        return {
            "message": "Setup added successfully",
            "car": {**data, "id": data["carId"]}  
        }
    except Exception as e:
        return {"error": str(e)}


async def get_car(id):
    try:
        with open("car_setups.json", mode='r') as openedFile:
            setups = json.load(openedFile)  
            for setup in setups:
                  if setup["carId"]==id:
                        return setup
            return{f"No setup with the id {id}"}
    except Exception as e:
                return {"Error": str(e)}
    

async def get_all_cars():
    cars = load_json_list("car_setups.json")
    for car in cars:
        car["id"] = car.pop("carId")  # Rename key
    return cars

    



'''Timestamps'''
async def add_timestemp(request: Request):
    try:
        data = await request.json()
        timestemps = load_json_list("timestemps.json")
        print(timestemps)
        # Auto-generate a new car ID if not provided
        existing_ids = [timestemp.get("timestempId", 0) for timestemp in timestemps]
        new_id = max(existing_ids, default=0) + 1
        # Assign the ID (if missing)
        data.setdefault("timestempId", new_id)
        
        # data["driverId"]=int(data["driverId"])
        # data["setupId"]=int(data["setupId"])
        # data["sessionsId"]=int(data["sessionsId"])
        
        timestemps.append(data)
        save_json_list("timestemps.json", timestemps)
        return {
            "message": "Timestamp added successfully",
            "timestamp": {**data, "id": data["timestempId"]} 
        }
    except Exception as e:
        return {"error": str(e)}

async def get_timestemp(column: str,value: Union[int, str] = Query(...)):
    results: list[dict] = []
    # print(column, value)
    try:
        with open("timestemps.json", "r") as f:
            timestamps = json.load(f)
        for ts in timestamps:
            # compare as strings (or cast to int if you know it’s numeric)
            cell = ts.get(column)
            print(cell)
            # print(cell)
            if cell == value or str(cell) == str(value):
                results.append(ts)
        return results
    except Exception as e:
                return {"Error": str(e)}
    
async def get_all_timestemps():
    timestemps = load_json_list("timestemps.json")
    for timestemp in timestemps:
        timestemp["id"] = timestemp.pop("timestempId")  # Rename key
    return timestemps



'''Session'''

async def add_session(request: Request):
    try:
        data = await request.json()
        sessions = load_json_list("sessions.json")

        # Auto-generate a new session ID if not provided
        existing_ids = [session.get("sessionId", 0) for session in sessions]
        new_id = max(existing_ids, default=0) + 1

        # Assign the ID (if missing)
        data.setdefault("sessionId", new_id)

        # Add date and time
        now = datetime.now()
        data["date"] = now.strftime("%Y-%m-%d")   # e.g., "2025-07-05"
        data["time"] = now.strftime("%H:%M:%S")   # e.g., "14:32:08"
        # print(data)
        sessions.append(data)
        
        save_json_list("sessions.json", sessions)

        return {
            "message": "Setup added successfully",
            "sessionData": {**data}
        }
    except Exception as e:
        return {"error": str(e)}


    

async def get_session(id:int):
    try:
        with open("sessions.json", mode='r') as openedFile:
            setups = json.load(openedFile)  
            for setup in setups:
                  if setup["sessionId"]==id:
                        return setup
            return{f"No session with the id {id}"}
    except Exception as e:
                return {"Error": str(e)}    
    

async def get_all_session():
    sessions = load_json_list("sessions.json")
    for session in sessions:
        session["id"] = session.pop("sessionId")  # Rename key
    return sessions
    



def load_json_list(filename):
    if os.path.exists(filename):
        with open(filename, "r") as file:
            try:
                return json.load(file)
            except json.JSONDecodeError:
                return []
    return []

def save_json_list(filename, data_list):
    with open(filename, "w") as file:
        json.dump(data_list, file, indent=4)