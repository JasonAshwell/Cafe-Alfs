-- ============================================================
-- Cafe Alf Fresco — Compliance Tracker
-- Supabase Schema
-- ============================================================
-- Run this once in the Supabase SQL editor:
--   Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- Settings (single row, keyed as 'singleton')
CREATE TABLE IF NOT EXISTS settings (
  key                TEXT PRIMARY KEY DEFAULT 'singleton',
  cafe_name          TEXT NOT NULL DEFAULT 'Cafe Alf Fresco',
  open_time          TEXT NOT NULL DEFAULT '07:00',
  close_time         TEXT NOT NULL DEFAULT '14:00',
  kitchen_close_time TEXT NOT NULL DEFAULT '13:30'
);

-- Skills (training/certification types)
CREATE TABLE IF NOT EXISTS skills (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Users (staff members)
CREATE TABLE IF NOT EXISTS users (
  id     TEXT PRIMARY KEY,
  name   TEXT    NOT NULL,
  role   TEXT    NOT NULL CHECK (role IN ('Admin', 'Manager', 'Supervisor', 'Staff')),
  team   TEXT,
  age    INTEGER,
  skills JSONB   NOT NULL DEFAULT '[]',
  pin    TEXT    NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Tasks (compliance tasks with recurrence rules)
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT    PRIMARY KEY,
  title            TEXT    NOT NULL,
  category         TEXT,
  team             TEXT,
  expected_minutes INTEGER,
  description      TEXT,
  frequency        JSONB   NOT NULL,
  required_skills  JSONB   NOT NULL DEFAULT '[]',
  min_age          INTEGER NOT NULL DEFAULT 16,
  mandatory        BOOLEAN NOT NULL DEFAULT false,
  active           BOOLEAN NOT NULL DEFAULT true
);

-- Completions (task completion / skip records)
CREATE TABLE IF NOT EXISTS completions (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL,
  date_str       TEXT NOT NULL,      -- 'YYYY-MM-DD'
  slot_id        TEXT NOT NULL,      -- e.g. '09:00', 'daily', 'opening'
  user_id        TEXT,
  completed_at   TEXT,               -- ISO timestamp
  status         TEXT NOT NULL CHECK (status IN ('completed', 'skipped')),
  notes          TEXT,
  actual_minutes INTEGER
);

-- Audit log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  ts        TEXT NOT NULL,           -- ISO timestamp
  user_id   TEXT,
  user_name TEXT,
  action    TEXT,
  detail    TEXT
);

-- ============================================================
-- Indexes (performance for common query patterns)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_completions_date_str ON completions (date_str);
CREATE INDEX IF NOT EXISTS idx_completions_task_id  ON completions (task_id);
CREATE INDEX IF NOT EXISTS idx_completions_user_id  ON completions (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_ts         ON audit_log (ts DESC);

-- ============================================================
-- Row Level Security
-- ============================================================
-- The app uses PIN-based authentication handled in JavaScript
-- (auth.js), not Supabase Auth. RLS is enabled on all tables
-- and the anonymous role is granted full access so the frontend
-- can read and write data.
--
-- IMPORTANT: Restrict your Supabase anon key to your GitHub
-- Pages domain only. Do this in:
--   Dashboard → Settings → API → Allowed Origins (CORS)
-- Add: https://YOUR_GITHUB_USERNAME.github.io
-- ============================================================

ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log   ENABLE ROW LEVEL SECURITY;

-- settings
CREATE POLICY "anon_all" ON settings    FOR ALL TO anon USING (true) WITH CHECK (true);
-- skills
CREATE POLICY "anon_all" ON skills      FOR ALL TO anon USING (true) WITH CHECK (true);
-- users
CREATE POLICY "anon_all" ON users       FOR ALL TO anon USING (true) WITH CHECK (true);
-- tasks
CREATE POLICY "anon_all" ON tasks       FOR ALL TO anon USING (true) WITH CHECK (true);
-- completions
CREATE POLICY "anon_all" ON completions FOR ALL TO anon USING (true) WITH CHECK (true);
-- audit_log (allow insert + select for anon; no update/delete)
CREATE POLICY "anon_select" ON audit_log FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert" ON audit_log FOR INSERT TO anon WITH CHECK (true);
