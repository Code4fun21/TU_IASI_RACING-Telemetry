from dataclasses import dataclass
import math
import numpy as np  # At the top of the file
@dataclass
class GPSPoint:
        lat:float
        lon:float
        timestamp:float
        speed:float
        

class GPS_Intersection:

    def __init__(self,gL:GPSPoint,gR:GPSPoint):
        self.__gateL=gL
        self.__gateR=gR
        self.__prev=None
        self.__curr=None
        self.__currTime=None


    def get_intersection_time(self):
        if not (self.is_valid_point(self.__prev) and self.is_valid_point(self.__curr)):
            print("Invalid GPS input points")
            return False

        if not self.do_intersect(self.__prev, self.__curr):
            return False

        if not (self.is_valid_point(self.__gateL) and self.is_valid_point(self.__gateR)):
            print("Invalid gate points")
            return False

        x1, y1 = self.__prev.lon, self.__prev.lat
        x2, y2 = self.__curr.lon, self.__curr.lat
        x3, y3 = self.__gateL.lon, self.__gateL.lat
        x4, y4 = self.__gateR.lon, self.__gateR.lat

        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if denom == 0 or not np.isfinite(denom):
            print("Degenerate intersection (denominator is 0 or invalid)")
            return False

        try:
            interLon = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
            interLat = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
        except Exception as e:
            print(f"Intersection calculation error: {e}")
            return False

        if not np.isfinite(interLon) or not np.isfinite(interLat):
            print("Intersection point is invalid")
            return False

        distToInter = math.hypot(interLon - self.__prev.lon, interLat - self.__prev.lat)

        avg_speed = (self.__prev.speed + self.__curr.speed) / 2
        if avg_speed <= 0 or not np.isfinite(avg_speed):
            print("Invalid average speed")
            return False

        ratio = distToInter / avg_speed
        self.__currTime = self.__prev.timestamp + ratio * (self.__curr.timestamp - self.__prev.timestamp)

        return True



    def do_intersect(self, p1, q1):
        o1 = self.orientation(p1, q1, self.__gateL);    # AB and point C
        o2 = self.orientation(p1, q1, self.__gateR);    # AB and point D
        o3 = self.orientation(self.__gateL, self.__gateR, p1); # CD and point A
        o4 = self.orientation(self.__gateL, self.__gateR, q1); # CD and point B

                    #????
        if o1 != o2 and o3 != o4:
        #     pass
            return True
        
        if o1 == 0 and self.on_segment(p1, self.__gateL, q1): return True

        if o2 == 0 and self.on_segment(p1, self.__gateR, q1): return True

        if o3 == 0 and self.on_segment(self.__gateL, p1, self.__gateR): return True

        if o4 == 0 and self.on_segment(self.__gateL, q1, self.__gateR): return True

        return False  
        

    # def orientation(self, p, q, r):

    #     val = (q.lon - p.lon) * (r.lat - q.lat) - (q.lat - p.lat) * (r.lon - q.lon)
    #     if val == 0.0:
    #         return 0               # colinear
    #     return 1 if val > 0.0 else 2 # clock or counterclockwise

    def is_valid_point(self, pt: GPSPoint):
        return (
            pt is not None and
            isinstance(pt.lat, (int, float)) and
            isinstance(pt.lon, (int, float)) and
            np.isfinite(pt.lat) and
            np.isfinite(pt.lon)
        )
    
    def orientation(self, p, q, r):
        if not (self.is_valid_point(p) and self.is_valid_point(q) and self.is_valid_point(r)):
            print("Invalid point in orientation()")
            return -1  # Safe fallback

        try:
            val = (q.lon - p.lon) * (r.lat - q.lat) - (q.lat - p.lat) * (r.lon - q.lon)
        except Exception as e:
            print(f"Orientation calculation error: {e}")
            return -1

        if math.isinf(val) or math.isnan(val):
            print("Invalid orientation value: overflow or NaN")
            return -1

        if val == 0.0:
            return 0  # colinear
        return 1 if val > 0.0 else 2

    


    def on_segment(self, p, q, r):

        return q.lon <= max(p.lon, r.lon) and q.lon >= min(p.lon, r.lon) and q.lat <= max(p.lat, r.lat) and q.lat >= min(p.lat, r.lat)

    def update_points(self, prev:GPSPoint,curr:GPSPoint):
        self.__prev = prev
        self.__curr = curr

    def get_time(self):
        return self.__currTime
    def get_pos(self):
            return self.__prev,self.__curr