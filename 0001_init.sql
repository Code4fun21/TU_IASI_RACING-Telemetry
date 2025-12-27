-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- 1. Drivers
CREATE TABLE Driver (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    weight REAL,
    other TEXT
);

-- 2. Tracks
CREATE TABLE Track (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gates TEXT, -- Storing JSON as text
    coordinates TEXT -- Storing JSON as text
);

-- 3. Monoposts (Cars)
CREATE TABLE Monopost (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    details TEXT,
    tires TEXT,
    other TEXT
);

-- 4. Sessions
CREATE TABLE Session (                                   
      id INTEGER PRIMARY KEY AUTOINCREMENT,                
      csvFileName TEXT NOT NULL,           
      decodedFileName TEXT NOT NULL,                           
      trackId INTEGER,                                     
      date TEXT,                                           
      time TEXT,                                           
      FOREIGN KEY (trackId) REFERENCES Track(id)           
                                                           
 );

  CREATE TABLE Timestamp(                                  
      id INTEGER PRIMARY KEY AUTOINCREMENT,                
      startTime INTEGER,                                   
      endTime INTEGER,                                     
      driverId INTEGER,                                    
      monopostId INTEGER,                                  
      sessionId INTEGER,                                   
      FOREIGN KEY (sessionId) REFERENCES Session(id),      
      FOREIGN KEY (driverId) REFERENCES Driver(id),        
      FOREIGN KEY (monopostId) REFERENCES Monopost(id)     
  );

  -- 1. Create the table to track usage
CREATE TABLE IF NOT EXISTS system_limits (
    id TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    last_reset TEXT
);

-- 2. Initialize the counters (Set them to 0 starting today)
INSERT INTO system_limits (id, count, last_reset) VALUES ('d1_writes', 0, DATE('now'));
INSERT INTO system_limits (id, count, last_reset) VALUES ('r2_uploads', 0, DATE('now'));
INSERT INTO system_limits (id, count, last_reset) VALUES ('d1_reads', 0, DATE('now'));
INSERT INTO system_limits (id, count, last_reset) VALUES ('r2_downloads', 0, DATE('now'));
