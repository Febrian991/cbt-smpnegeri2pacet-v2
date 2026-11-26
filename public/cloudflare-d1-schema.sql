-- =========================================================================
-- SKRIP SQL CLOUDFLARE D1 (SQLite): APLIKASI CBT SMP NEGERI 2 PACET
-- Gratis, Egress UNLIMITED, Storage 5 GB, 5 Juta Read/Hari
-- Tempel (paste) seluruh teks ini ke Cloudflare Dashboard -> D1 -> Console -> Execute
-- =========================================================================

CREATE TABLE IF NOT EXISTS cbt_exam_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT NOT NULL,
  student_nisn TEXT NOT NULL,
  student_class TEXT DEFAULT 'Umum',
  exam_title TEXT NOT NULL,
  subject TEXT NOT NULL,
  final_score INTEGER NOT NULL,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  unattempted_count INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  cheat_count INTEGER DEFAULT 0,
  completed_at TEXT NOT NULL,
  finish_reason TEXT DEFAULT 'Selesai',
  raw_data TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cbt_exam_results_nisn_subject ON cbt_exam_results(student_nisn, subject);
CREATE INDEX IF NOT EXISTS idx_cbt_exam_results_exam_title ON cbt_exam_results(exam_title);
CREATE INDEX IF NOT EXISTS idx_cbt_exam_results_raw_id ON cbt_exam_results(student_nisn, json_extract(raw_data, '$.id'));

CREATE TABLE IF NOT EXISTS cbt_school_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cbt_student_sessions (
  session_key TEXT PRIMARY KEY,
  student_nisn TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_class TEXT DEFAULT 'Umum',
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'logged_in',
  attempt_number INTEGER DEFAULT 1,
  answered_count INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  remaining_seconds INTEGER DEFAULT 0,
  cheat_count INTEGER DEFAULT 0,
  final_score INTEGER,
  login_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  raw_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_cbt_student_sessions_updated ON cbt_student_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cbt_student_sessions_nisn ON cbt_student_sessions(student_nisn);

CREATE TABLE IF NOT EXISTS cbt_questions (
  question_key TEXT PRIMARY KEY,
  subject TEXT NOT NULL DEFAULT 'Umum',
  class_level TEXT DEFAULT 'Semua Kelas',
  created_by TEXT DEFAULT '',
  q_type TEXT DEFAULT 'single',
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  raw_data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cbt_questions_subject ON cbt_questions(subject);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_class ON cbt_questions(class_level);

CREATE TABLE IF NOT EXISTS cbt_question_keys (
  question_key TEXT PRIMARY KEY,
  q_type TEXT NOT NULL DEFAULT 'single',
  correct_answer TEXT,
  statements TEXT,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cbt_exam_tokens (
  token_key TEXT PRIMARY KEY,
  token_value TEXT NOT NULL,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
