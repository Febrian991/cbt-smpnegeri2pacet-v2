-- =========================================================================
-- SKRIP SQL SUPABASE: APLIKASI CBT UJIAN SEKOLAH (13 GURU & 250 SISWA)
-- Salin (copy) seluruh teks ini dan tempel (paste) ke menu SQL Editor di Supabase
-- =========================================================================

CREATE TABLE IF NOT EXISTS cbt_exam_results (
  id BIGSERIAL PRIMARY KEY,
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
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cbt_exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert to exam results" ON cbt_exam_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on exam results" ON cbt_exam_results FOR SELECT USING (true);
CREATE POLICY "Allow public delete on exam results" ON cbt_exam_results FOR DELETE USING (true);

-- Tabel sinkronisasi pengaturan ujian, jadwal, bank soal, data siswa & guru lintas perangkat
CREATE TABLE IF NOT EXISTS cbt_school_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cbt_school_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on school state" ON cbt_school_state FOR ALL USING (true) WITH CHECK (true);

-- Tabel pemantauan status login, sedang mengerjakan & selesai siswa secara real-time
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
  login_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB
);

ALTER TABLE cbt_student_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on student sessions" ON cbt_student_sessions FOR ALL USING (true) WITH CHECK (true);
