CREATE TABLE IF NOT EXISTS canvases (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, body TEXT,
 updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO canvases(id,name,updated_at) VALUES('main','我的画布',datetime('now'));
