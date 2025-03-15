DROP TABLE IF EXISTS SessionRecordings;
CREATE TABLE IF NOT EXISTS SessionRecordings (
    ID TEXT PRIMARY KEY,
    InstanceID TEXT, 
    SessionID TEXT, 
    UserID TEXT,
    Bucketed INTEGER NOT NULL,
    StartTime INT, 
    EndTime INT, 
    TotalTime INT,
    ActiveTime INT,
    FirstURL TEXT,
    ClickCount INT,
    KeypressCount INT,
    MouseCount INT,
    ConsoleLogCount INT,
    ConsoleWarnCount INT,    
    ConsoleErrorCount INT,
    EventCount INT
);