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
    startTime INTEGER, -- Unix Timestamp
    endTime INTEGER,   -- Unix Timestamp
    driverId INTEGER,
    trackId INTEGER,
    monopostId INTEGER,
    FOREIGN KEY (driverId) REFERENCES Driver(id),
    FOREIGN KEY (trackId) REFERENCES Track(id),
    FOREIGN KEY (monopostId) REFERENCES Monopost(id)
);

-- Seed some initial data (Optional, helps with testing)
INSERT INTO Driver (name, weight) VALUES ('Test Driver', 75.5);
INSERT INTO Track (name) VALUES ('Test Track');
INSERT INTO Monopost (details) VALUES ('Car V1');