-- =========================================================================
-- SKRIP SQL SUPABASE: APLIKASI CBT UJIAN SEKOLAH (13 GURU & 250 SISWA)
-- Salin (copy) seluruh teks ini dan tempel (paste) ke menu SQL Editor di Supabase
-- Versi v3.38: Penyimpanan Soal Per-Baris, Realtime, + Keamanan Kunci & Privasi
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cbt_exam_results' AND policyname = 'Allow public insert to exam results') THEN
    CREATE POLICY "Allow public insert to exam results" ON cbt_exam_results FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cbt_exam_results' AND policyname = 'Allow public select on exam results') THEN
    CREATE POLICY "Allow public select on exam results" ON cbt_exam_results FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cbt_exam_results' AND policyname = 'Allow public delete on exam results') THEN
    CREATE POLICY "Allow public delete on exam results" ON cbt_exam_results FOR DELETE USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cbt_exam_results_nisn_subject ON cbt_exam_results(student_nisn, subject);
CREATE INDEX IF NOT EXISTS idx_cbt_exam_results_exam_title ON cbt_exam_results(exam_title);

-- Tabel sinkronisasi pengaturan ujian, jadwal, bank soal, data siswa & guru lintas perangkat
CREATE TABLE IF NOT EXISTS cbt_school_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cbt_school_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cbt_school_state' AND policyname = 'Allow public all on school state') THEN
    CREATE POLICY "Allow public all on school state" ON cbt_school_state FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_cbt_student_sessions_updated ON cbt_student_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cbt_student_sessions_nisn ON cbt_student_sessions(student_nisn);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cbt_student_sessions' AND policyname = 'Allow public all on student sessions') THEN
    CREATE POLICY "Allow public all on student sessions" ON cbt_student_sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Tabel penyimpanan soal per-baris (1 baris = 1 butir soal, agar banyak guru bisa input serentak tanpa saling menimpa)
CREATE TABLE IF NOT EXISTS cbt_questions (
  question_key TEXT PRIMARY KEY,
  subject TEXT NOT NULL DEFAULT 'Umum',
  class_level TEXT DEFAULT 'Semua Kelas',
  created_by TEXT DEFAULT '',
  q_type TEXT DEFAULT 'single',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cbt_questions_subject ON cbt_questions(subject);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_class ON cbt_questions(class_level);

ALTER TABLE cbt_questions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cbt_questions' AND policyname = 'Allow public all on questions') THEN
    CREATE POLICY "Allow public all on questions" ON cbt_questions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE cbt_questions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cbt_questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cbt_questions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cbt_student_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cbt_student_sessions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cbt_exam_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cbt_exam_results;
  END IF;
END $$;

-- =========================================================================
-- LAPISAN KEAMANAN v3.38: BRANKAS KUNCI JAWABAN TERPISAH, AUTENTIKASI SERVER,
-- & KOREKSI NILAI OTOMATIS DI POSTGRES (ANTI BOCOR DI BROWSER SISWA)
-- =========================================================================

CREATE TABLE IF NOT EXISTS cbt_question_keys (
  question_key TEXT PRIMARY KEY,
  q_type TEXT NOT NULL DEFAULT 'single',
  correct_answer JSONB,
  statements JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Aktif TANPA policy publik: Siswa/anon sama sekali tidak bisa SELECT kunci jawaban!
ALTER TABLE cbt_question_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cbt_question_keys FROM anon, authenticated;

-- Brankas Token Ujian Terpisah (v3.57): Token hanya di server & dibaca Admin/Guru/Pengawas via RPC terautentikasi!
CREATE TABLE IF NOT EXISTS cbt_exam_tokens (
  token_key TEXT PRIMARY KEY,
  token_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cbt_exam_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cbt_exam_tokens FROM anon, authenticated;

-- Helper Internal: Hapus field sensitif (token / adminPin) dari cbt_exam_schedules / cbt_config
CREATE OR REPLACE FUNCTION cbt_strip_schedule_tokens(p_schedules JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_res JSONB;
BEGIN
  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_agg(elem - 'token'), '[]'::jsonb)
  INTO v_res
  FROM jsonb_array_elements(p_schedules) AS elem;
  RETURN v_res;
END;
$$;

-- Migrasi idempoten: pindahkan token dari cbt_school_state ke cbt_exam_tokens lalu bersihkan cbt_school_state
DO $$
DECLARE
  v_cfg JSONB;
  v_scheds JSONB;
  v_sch JSONB;
  v_tok TEXT;
BEGIN
  SELECT value INTO v_cfg FROM cbt_school_state WHERE key = 'cbt_config' LIMIT 1;
  IF v_cfg IS NOT NULL AND jsonb_typeof(v_cfg) = 'object' THEN
    v_tok := UPPER(BTRIM(COALESCE(v_cfg->>'examToken', '')));
    IF v_tok <> '' THEN
      INSERT INTO cbt_exam_tokens (token_key, token_value, updated_at)
      VALUES ('config', v_tok, NOW())
      ON CONFLICT (token_key) DO UPDATE SET
        token_value = EXCLUDED.token_value,
        updated_at = NOW();
    END IF;
    IF (v_cfg ? 'examToken') OR (v_cfg ? 'adminPin') THEN
      UPDATE cbt_school_state
      SET value = (v_cfg - 'examToken' - 'adminPin'), updated_at = NOW()
      WHERE key = 'cbt_config';
    END IF;
  END IF;

  SELECT value INTO v_scheds FROM cbt_school_state WHERE key = 'cbt_exam_schedules' LIMIT 1;
  IF v_scheds IS NOT NULL AND jsonb_typeof(v_scheds) = 'array' THEN
    FOR v_sch IN SELECT * FROM jsonb_array_elements(v_scheds) LOOP
      v_tok := UPPER(BTRIM(COALESCE(v_sch->>'token', '')));
      IF COALESCE(BTRIM(v_sch->>'id'), '') <> '' AND v_tok <> '' THEN
        INSERT INTO cbt_exam_tokens (token_key, token_value, updated_at)
        VALUES ('schedule:' || BTRIM(v_sch->>'id'), v_tok, NOW())
        ON CONFLICT (token_key) DO UPDATE SET
          token_value = EXCLUDED.token_value,
          updated_at = NOW();
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_scheds) s WHERE s ? 'token') THEN
      UPDATE cbt_school_state
      SET value = cbt_strip_schedule_tokens(v_scheds), updated_at = NOW()
      WHERE key = 'cbt_exam_schedules';
    END IF;
  END IF;
END $$;

-- Helper Internal: Bersihkan kunci jawaban dari raw_data soal
CREATE OR REPLACE FUNCTION cbt_strip_question_keys(p_q JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean JSONB;
  v_stmts JSONB;
BEGIN
  IF p_q IS NULL THEN
    RETURN NULL;
  END IF;
  v_clean := p_q - 'correctAnswer';
  IF jsonb_typeof(v_clean->'statements') = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('id', s->'id', 'text', s->'text')
      ),
      '[]'::jsonb
    ) INTO v_stmts
    FROM jsonb_array_elements(v_clean->'statements') AS s;
    v_clean := jsonb_set(v_clean, '{statements}', v_stmts, true);
  END IF;
  RETURN v_clean;
END;
$$;

-- Migrasi idempoten: pindahkan kunci dari cbt_questions ke cbt_question_keys lalu bersihkan cbt_questions
DO $$
DECLARE
  v_rec RECORD;
  v_stmts JSONB;
BEGIN
  FOR v_rec IN SELECT question_key, q_type, raw_data, updated_at FROM cbt_questions LOOP
    IF (v_rec.raw_data ? 'correctAnswer') OR (jsonb_typeof(v_rec.raw_data->'statements') = 'array' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_rec.raw_data->'statements') s WHERE s ? 'correct'
    )) THEN
      v_stmts := NULL;
      IF jsonb_typeof(v_rec.raw_data->'statements') = 'array' THEN
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object('id', s->'id', 'correct', s->'correct')),
          '[]'::jsonb
        ) INTO v_stmts
        FROM jsonb_array_elements(v_rec.raw_data->'statements') s;
      END IF;

      INSERT INTO cbt_question_keys (question_key, q_type, correct_answer, statements, updated_at)
      VALUES (
        v_rec.question_key,
        COALESCE(v_rec.raw_data->>'type', v_rec.q_type, 'single'),
        v_rec.raw_data->'correctAnswer',
        v_stmts,
        COALESCE(v_rec.updated_at, NOW())
      )
      ON CONFLICT (question_key) DO UPDATE SET
        q_type = EXCLUDED.q_type,
        correct_answer = COALESCE(EXCLUDED.correct_answer, cbt_question_keys.correct_answer),
        statements = COALESCE(EXCLUDED.statements, cbt_question_keys.statements),
        updated_at = EXCLUDED.updated_at;

      UPDATE cbt_questions
      SET raw_data = cbt_strip_question_keys(v_rec.raw_data)
      WHERE question_key = v_rec.question_key;
    END IF;
  END LOOP;
END $$;

-- Helper Internal: Verifikasi Kredensial Guru / Admin dari cbt_school_state
CREATE OR REPLACE FUNCTION cbt_verify_teacher_pin_internal(p_identifier TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id TEXT := LOWER(BTRIM(COALESCE(p_identifier, '')));
  v_pin TEXT := BTRIM(COALESCE(p_pin, ''));
  v_teachers JSONB;
  v_cfg JSONB;
  v_cfg_pin TEXT := '';
  v_elem JSONB;
  v_found JSONB := NULL;
  v_is_admin BOOLEAN := false;
BEGIN
  IF v_id = '' OR v_pin = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Username/NIP dan PIN wajib diisi.');
  END IF;

  SELECT value INTO v_teachers FROM cbt_school_state WHERE key = 'cbt_teachers_list' LIMIT 1;
  IF v_teachers IS NULL THEN
    SELECT raw_data INTO v_teachers
    FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_teachers_list'
    ORDER BY id DESC LIMIT 1;
  END IF;

  IF v_teachers IS NULL OR jsonb_typeof(v_teachers) <> 'array' OR jsonb_array_length(v_teachers) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'not_seeded', true);
  END IF;

  SELECT value INTO v_cfg FROM cbt_school_state WHERE key = 'cbt_config' LIMIT 1;
  IF v_cfg IS NOT NULL AND (v_cfg ? 'adminPin') THEN
    v_cfg_pin := BTRIM(COALESCE(v_cfg->>'adminPin', ''));
  END IF;

  -- Prioritaskan kecocokan identifier + PIN di seluruh daftar akun (termasuk Guru & Pengawas NIP kembar)
  SELECT t INTO v_found
  FROM jsonb_array_elements(v_teachers) t
  WHERE LOWER(BTRIM(COALESCE(t->>'nip', ''))) = v_id
    AND BTRIM(COALESCE(t->>'pin', '')) = v_pin
  LIMIT 1;

  IF v_found IS NULL THEN
    SELECT t INTO v_found
    FROM jsonb_array_elements(v_teachers) t
    WHERE LOWER(BTRIM(COALESCE(t->>'id', ''))) = v_id
      AND BTRIM(COALESCE(t->>'pin', '')) = v_pin
    LIMIT 1;
  END IF;

  IF v_found IS NULL THEN
    SELECT t INTO v_found
    FROM jsonb_array_elements(v_teachers) t
    WHERE LOWER(BTRIM(COALESCE(t->>'name', ''))) = v_id
      AND BTRIM(COALESCE(t->>'pin', '')) = v_pin
    LIMIT 1;
  END IF;

  IF v_found IS NULL AND LENGTH(v_id) >= 3 THEN
    SELECT t INTO v_found
    FROM jsonb_array_elements(v_teachers) t
    WHERE LOWER(COALESCE(t->>'name', '')) LIKE '%' || v_id || '%'
      AND BTRIM(COALESCE(t->>'pin', '')) = v_pin
    LIMIT 1;
  END IF;

  IF v_found IS NULL AND (
    v_id IN ('admin', 'proktor', 'superadmin', '198501012010011001')
    OR (
      (v_id LIKE '%admin%' OR v_id LIKE '%proktor%')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_teachers) t
        WHERE LOWER(BTRIM(COALESCE(t->>'nip', ''))) = v_id
           OR LOWER(BTRIM(COALESCE(t->>'id', ''))) = v_id
           OR LOWER(BTRIM(COALESCE(t->>'name', ''))) = v_id
      )
    )
  ) THEN
    SELECT t INTO v_found
    FROM jsonb_array_elements(v_teachers) t
    WHERE (t->>'role' = 'admin' OR t->>'id' = 'admin')
    LIMIT 1;
    v_is_admin := true;
  END IF;

  -- Fallback: cek apakah identifier memang terdaftar (untuk pesan PIN salah)
  IF v_found IS NULL THEN
    SELECT t INTO v_found
    FROM jsonb_array_elements(v_teachers) t
    WHERE LOWER(BTRIM(COALESCE(t->>'nip', ''))) = v_id
       OR LOWER(BTRIM(COALESCE(t->>'id', ''))) = v_id
       OR LOWER(BTRIM(COALESCE(t->>'name', ''))) = v_id
       OR (LENGTH(v_id) >= 3 AND LOWER(COALESCE(t->>'name', '')) LIKE '%' || v_id || '%')
    LIMIT 1;
  END IF;

  IF v_found IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Username / NIP tidak terdaftar.');
  END IF;

  IF COALESCE(v_found->>'role', '') = 'admin' OR COALESCE(v_found->>'id', '') = 'admin' THEN
    v_is_admin := true;
  END IF;

  IF v_pin = BTRIM(COALESCE(v_found->>'pin', '')) OR (v_is_admin AND v_cfg_pin <> '' AND v_pin = v_cfg_pin) THEN
    RETURN jsonb_build_object('valid', true, 'teacher', v_found);
  END IF;

  RETURN jsonb_build_object('valid', false, 'message', 'PIN / Kata Sandi salah!');
END;
$$;

-- RPC 1: Verifikasi Login Guru / Proktor (tanpa mengunduh seluruh PIN guru ke browser siswa)
CREATE OR REPLACE FUNCTION cbt_verify_teacher_login(p_identifier TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := cbt_verify_teacher_pin_internal(p_identifier, p_pin);
  IF COALESCE((v_res->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object('success', true, 'teacher', v_res->'teacher');
  END IF;
  RETURN jsonb_build_object(
    'success', false,
    'not_seeded', COALESCE((v_res->>'not_seeded')::boolean, false),
    'message', COALESCE(v_res->>'message', 'Username / NIP atau PIN salah.')
  );
END;
$$;

-- RPC 2: Verifikasi Login Siswa (hanya mengembalikan 1 profil siswa tanpa password & tanpa daftar 250 siswa lainnya)
CREATE OR REPLACE FUNCTION cbt_verify_student_login(p_nisn TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nisn TEXT := BTRIM(COALESCE(p_nisn, ''));
  v_pass TEXT := BTRIM(COALESCE(p_password, ''));
  v_students JSONB;
  v_stu JSONB;
BEGIN
  IF v_nisn = '' OR v_pass = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Harap lengkapi NISN dan kata sandi!');
  END IF;

  SELECT value INTO v_students FROM cbt_school_state WHERE key = 'cbt_students_list' LIMIT 1;
  IF v_students IS NULL THEN
    SELECT raw_data INTO v_students
    FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_students_list'
    ORDER BY id DESC LIMIT 1;
  END IF;

  IF v_students IS NULL OR jsonb_typeof(v_students) <> 'array' OR jsonb_array_length(v_students) = 0 THEN
    RETURN jsonb_build_object('success', false, 'not_seeded', true);
  END IF;

  SELECT s INTO v_stu
  FROM jsonb_array_elements(v_students) s
  WHERE BTRIM(COALESCE(s->>'nisn', '')) = v_nisn
  LIMIT 1;

  IF v_stu IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'NISN tidak terdaftar di pangkalan data SMP NEGERI 2 PACET!');
  END IF;

  IF BTRIM(COALESCE(NULLIF(v_stu->>'password', ''), '123')) <> v_pass THEN
    RETURN jsonb_build_object('success', false, 'message', 'Password akun siswa salah! Silakan periksa kartu peserta ujian Anda.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'student', jsonb_build_object(
      'nisn', BTRIM(v_stu->>'nisn'),
      'name', COALESCE(v_stu->>'name', '-'),
      'class', COALESCE(v_stu->>'class', 'Umum')
    )
  );
END;
$$;

-- RPC 3: Lookup Nama & Kelas Siswa saat Mengetik NISN (tanpa membuka daftar siswa maupun password)
CREATE OR REPLACE FUNCTION cbt_lookup_student_hint(p_nisn TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nisn TEXT := BTRIM(COALESCE(p_nisn, ''));
  v_students JSONB;
  v_stu JSONB;
BEGIN
  IF LENGTH(v_nisn) < 4 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT value INTO v_students FROM cbt_school_state WHERE key = 'cbt_students_list' LIMIT 1;
  IF v_students IS NULL THEN
    SELECT raw_data INTO v_students
    FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_students_list'
    ORDER BY id DESC LIMIT 1;
  END IF;

  IF v_students IS NULL OR jsonb_typeof(v_students) <> 'array' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT s INTO v_stu
  FROM jsonb_array_elements(v_students) s
  WHERE BTRIM(COALESCE(s->>'nisn', '')) = v_nisn
  LIMIT 1;

  IF v_stu IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'name', COALESCE(v_stu->>'name', '-'),
    'class', COALESCE(v_stu->>'class', 'Umum')
  );
END;
$$;

-- RPC 4: Sinkronisasi Bank Soal Khusus Guru & Proktor (Baca & Simpan Soal beserta Brankas Kunci Jawaban)
CREATE OR REPLACE FUNCTION cbt_sync_question_vault(
  p_identifier TEXT,
  p_pin TEXT,
  p_questions JSONB DEFAULT NULL,
  p_delete_key TEXT DEFAULT NULL,
  p_replace_all BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth JSONB;
  v_q JSONB;
  v_qkey TEXT;
  v_qraw JSONB;
  v_stmts_keys JSONB;
  v_clean_raw JSONB;
  v_rows JSONB := '[]'::jsonb;
  v_count INTEGER := 0;
BEGIN
  v_auth := cbt_verify_teacher_pin_internal(p_identifier, p_pin);
  IF NOT COALESCE((v_auth->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'unauthorized', NOT COALESCE((v_auth->>'not_seeded')::boolean, false),
      'not_seeded', COALESCE((v_auth->>'not_seeded')::boolean, false),
      'message', COALESCE(v_auth->>'message', 'Akses brankas soal ditolak.')
    );
  END IF;

  IF LOWER(COALESCE(v_auth->'teacher'->>'role', 'guru')) = 'pengawas' THEN
    RETURN jsonb_build_object(
      'success', false,
      'unauthorized', true,
      'message', 'Akses brankas soal & kunci jawaban tertutup untuk akun Pengawas Ruang.'
    );
  END IF;

  IF COALESCE(p_replace_all, false) THEN
    DELETE FROM cbt_question_keys;
    DELETE FROM cbt_questions;
  END IF;

  IF BTRIM(COALESCE(p_delete_key, '')) <> '' THEN
    DELETE FROM cbt_question_keys WHERE question_key = BTRIM(p_delete_key);
    DELETE FROM cbt_questions WHERE question_key = BTRIM(p_delete_key);
    RETURN jsonb_build_object('success', true, 'deleted', BTRIM(p_delete_key));
  END IF;

  IF p_questions IS NOT NULL AND jsonb_typeof(p_questions) = 'array' THEN
    FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
      v_qraw := CASE WHEN (v_q ? 'raw_data') THEN v_q->'raw_data' ELSE v_q END;
      v_qkey := BTRIM(COALESCE(v_q->>'question_key', v_qraw->>'id', ''));
      IF v_qkey = '' THEN CONTINUE; END IF;

      v_stmts_keys := NULL;
      IF jsonb_typeof(v_qraw->'statements') = 'array' THEN
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object('id', s->'id', 'correct', s->'correct')),
          '[]'::jsonb
        ) INTO v_stmts_keys
        FROM jsonb_array_elements(v_qraw->'statements') s;
      END IF;

      INSERT INTO cbt_question_keys (question_key, q_type, correct_answer, statements, updated_at)
      VALUES (
        v_qkey,
        COALESCE(v_qraw->>'type', 'single'),
        v_qraw->'correctAnswer',
        v_stmts_keys,
        NOW()
      )
      ON CONFLICT (question_key) DO UPDATE SET
        q_type = EXCLUDED.q_type,
        correct_answer = EXCLUDED.correct_answer,
        statements = EXCLUDED.statements,
        updated_at = NOW();

      v_clean_raw := cbt_strip_question_keys(v_qraw);

      INSERT INTO cbt_questions (question_key, subject, class_level, created_by, q_type, updated_at, raw_data)
      VALUES (
        v_qkey,
        COALESCE(NULLIF(BTRIM(v_qraw->>'subject'), ''), 'Umum'),
        COALESCE(NULLIF(BTRIM(v_qraw->>'classLevel'), ''), 'Semua Kelas'),
        COALESCE(v_qraw->>'createdBy', ''),
        COALESCE(v_qraw->>'type', 'single'),
        NOW(),
        v_clean_raw
      )
      ON CONFLICT (question_key) DO UPDATE SET
        subject = EXCLUDED.subject,
        class_level = EXCLUDED.class_level,
        created_by = EXCLUDED.created_by,
        q_type = EXCLUDED.q_type,
        updated_at = NOW(),
        raw_data = EXCLUDED.raw_data;

      v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_count);
  END IF;

  -- Mode Baca untuk Guru/Admin: gabungkan soal + kunci jawaban dari cbt_question_keys
  SELECT COALESCE(
    jsonb_agg(
      (
        CASE
          WHEN k.question_key IS NULL THEN q.raw_data
          WHEN COALESCE(q.raw_data->>'type', q.q_type, 'single') = 'true_false' THEN
            jsonb_set(
              q.raw_data,
              '{statements}',
              COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', qs->'id',
                      'text', qs->'text',
                      'correct', COALESCE(
                        (
                          SELECT ks->'correct'
                          FROM jsonb_array_elements(COALESCE(k.statements, '[]'::jsonb)) ks
                          WHERE ks->>'id' = qs->>'id'
                          LIMIT 1
                        ),
                        qs->'correct'
                      )
                    )
                  )
                  FROM jsonb_array_elements(COALESCE(q.raw_data->'statements', '[]'::jsonb)) qs
                ),
                COALESCE(q.raw_data->'statements', '[]'::jsonb)
              ),
              true
            )
          ELSE
            CASE
              WHEN k.correct_answer IS NOT NULL THEN jsonb_set(q.raw_data, '{correctAnswer}', k.correct_answer, true)
              ELSE q.raw_data
            END
        END
      )
      ORDER BY q.question_key
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM cbt_questions q
  LEFT JOIN cbt_question_keys k ON k.question_key = q.question_key;

  RETURN jsonb_build_object('success', true, 'rows', v_rows);
END;
$$;

-- RPC 5: Koreksi Jawaban & Simpan Hasil Ujian Secara Aman di Server Postgres
CREATE OR REPLACE FUNCTION cbt_grade_and_submit_exam(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student JSONB := COALESCE(p_payload->'student', '{}'::jsonb);
  v_exam_title TEXT := COALESCE(p_payload->>'examTitle', 'Ujian CBT');
  v_subject TEXT := COALESCE(p_payload->>'subject', 'Umum');
  v_attempt INTEGER := GREATEST(1, COALESCE((p_payload->>'attemptNumber')::integer, 1));
  v_completed_at TEXT := COALESCE(NULLIF(BTRIM(p_payload->>'completedAt'), ''), TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'DD/MM/YYYY, HH24.MI.SS'));
  v_duration_used INTEGER := GREATEST(0, COALESCE((p_payload->>'durationUsedSeconds')::integer, 0));
  v_cheat_count INTEGER := GREATEST(0, COALESCE((p_payload->>'cheatCount')::integer, 0));
  v_cheat_logs JSONB := COALESCE(p_payload->'cheatLogs', '[]'::jsonb);
  v_finish_reason TEXT := COALESCE(p_payload->>'finishReason', 'Selesai mandiri oleh peserta');
  v_q_ids JSONB := COALESCE(p_payload->'questionIds', '[]'::jsonb);
  v_answers JSONB := COALESCE(p_payload->'answers', '{}'::jsonb);

  v_qid_elem JSONB;
  v_qid TEXT;
  v_idx INTEGER := 0;
  v_qraw JSONB;
  v_kraw RECORD;
  v_has_key BOOLEAN := false;
  v_type TEXT;
  v_weight NUMERIC;
  v_ans_obj JSONB;
  v_stu_ans JSONB;
  v_earned NUMERIC;
  v_is_fully_correct BOOLEAN;
  v_status TEXT;
  v_stu_display TEXT;
  v_cor_display TEXT;
  v_cor_val JSONB;
  v_cor_single TEXT;
  v_stu_single TEXT;
  v_cor_keys TEXT[];
  v_stu_keys TEXT[];
  v_cor_selected INTEGER;
  v_inc_selected INTEGER;
  v_stmts JSONB;
  v_stmt_len INTEGER;
  v_stmt_cor_cnt INTEGER;
  v_stmt JSONB;
  v_stmt_cor_val TEXT;
  v_stmt_given_val TEXT;
  v_has_any_tf BOOLEAN;
  v_all_tf_answered BOOLEAN;

  v_total_earned NUMERIC := 0;
  v_max_points NUMERIC := 0;
  v_correct_cnt INTEGER := 0;
  v_incorrect_cnt INTEGER := 0;
  v_unattempted_cnt INTEGER := 0;
  v_matched_cnt INTEGER := 0;
  v_final_score INTEGER := 0;
  v_details JSONB := '[]'::jsonb;
  v_res_id TEXT := 'RES_' || (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint::text;
  v_full_record JSONB;
  v_sess_key TEXT;
  v_nisn TEXT := BTRIM(COALESCE(v_student->>'nisn', ''));
BEGIN
  IF v_nisn = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Identitas NISN peserta tidak valid.');
  END IF;

  FOR v_qid_elem IN SELECT * FROM jsonb_array_elements(v_q_ids) LOOP
    v_idx := v_idx + 1;
    v_qid := BTRIM(v_qid_elem #>> '{}');

    SELECT raw_data INTO v_qraw FROM cbt_questions WHERE question_key = v_qid LIMIT 1;
    IF v_qraw IS NULL THEN
      CONTINUE;
    END IF;
    v_matched_cnt := v_matched_cnt + 1;

    SELECT * INTO v_kraw FROM cbt_question_keys WHERE question_key = v_qid LIMIT 1;
    v_has_key := FOUND;

    v_type := COALESCE(v_qraw->>'type', 'single');
    v_weight := GREATEST(1, COALESCE((v_qraw->>'weight')::numeric, 10));
    v_max_points := v_max_points + v_weight;

    v_ans_obj := v_answers->v_qid;
    v_stu_ans := CASE WHEN v_ans_obj IS NOT NULL THEN v_ans_obj->'answer' ELSE NULL END;

    v_earned := 0;
    v_is_fully_correct := false;
    v_status := 'unattempted';
    v_stu_display := '-';
    v_cor_display := '-';
    v_cor_val := NULL;

    IF v_type = 'single' THEN
      v_cor_single := COALESCE(v_kraw.correct_answer #>> '{}', v_qraw->>'correctAnswer', '-');
      v_cor_val := to_jsonb(v_cor_single);
      v_cor_display := COALESCE(NULLIF(v_cor_single, ''), '-');
      v_stu_single := CASE WHEN v_stu_ans IS NOT NULL AND jsonb_typeof(v_stu_ans) = 'string' THEN v_stu_ans #>> '{}' ELSE NULL END;
      v_stu_display := COALESCE(NULLIF(v_stu_single, ''), '-');

      IF v_stu_single IS NULL OR v_stu_single = '' THEN
        v_unattempted_cnt := v_unattempted_cnt + 1;
        v_status := 'unattempted';
      ELSIF v_stu_single = v_cor_single THEN
        v_earned := v_weight;
        v_is_fully_correct := true;
        v_correct_cnt := v_correct_cnt + 1;
        v_status := 'correct';
      ELSE
        v_incorrect_cnt := v_incorrect_cnt + 1;
        v_status := 'incorrect';
      END IF;

    ELSIF v_type = 'multiple' THEN
      v_cor_val := COALESCE(v_kraw.correct_answer, v_qraw->'correctAnswer', '[]'::jsonb);
      IF jsonb_typeof(v_cor_val) = 'array' THEN
        SELECT COALESCE(array_agg(x #>> '{}'), ARRAY[]::text[]) INTO v_cor_keys FROM jsonb_array_elements(v_cor_val) x;
      ELSIF jsonb_typeof(v_cor_val) = 'string' THEN
        v_cor_keys := ARRAY[v_cor_val #>> '{}'];
      ELSE
        v_cor_keys := ARRAY[]::text[];
      END IF;

      IF v_stu_ans IS NOT NULL AND jsonb_typeof(v_stu_ans) = 'array' THEN
        SELECT COALESCE(array_agg(x #>> '{}'), ARRAY[]::text[]) INTO v_stu_keys FROM jsonb_array_elements(v_stu_ans) x;
      ELSE
        v_stu_keys := ARRAY[]::text[];
      END IF;

      v_cor_display := COALESCE(NULLIF(array_to_string(v_cor_keys, ','), ''), '-');
      v_stu_display := CASE WHEN COALESCE(array_length(v_stu_keys, 1), 0) > 0 THEN array_to_string(v_stu_keys, ',') ELSE '-' END;

      IF COALESCE(array_length(v_stu_keys, 1), 0) = 0 THEN
        v_unattempted_cnt := v_unattempted_cnt + 1;
        v_status := 'unattempted';
      ELSE
        SELECT COUNT(*) INTO v_cor_selected FROM unnest(v_stu_keys) k WHERE k = ANY(v_cor_keys);
        SELECT COUNT(*) INTO v_inc_selected FROM unnest(v_stu_keys) k WHERE NOT (k = ANY(v_cor_keys));

        IF COALESCE(array_length(v_cor_keys, 1), 0) > 0 AND v_cor_selected = array_length(v_cor_keys, 1) AND v_inc_selected = 0 THEN
          v_earned := v_weight;
          v_is_fully_correct := true;
          v_correct_cnt := v_correct_cnt + 1;
          v_status := 'correct';
        ELSIF COALESCE(array_length(v_cor_keys, 1), 0) > 0 AND v_cor_selected > 0 AND v_inc_selected = 0 THEN
          v_earned := ROUND((v_cor_selected::numeric / array_length(v_cor_keys, 1)::numeric) * v_weight);
          IF v_earned > 0 THEN v_correct_cnt := v_correct_cnt + 1; ELSE v_incorrect_cnt := v_incorrect_cnt + 1; END IF;
          v_status := 'incorrect';
        ELSE
          v_incorrect_cnt := v_incorrect_cnt + 1;
          v_status := 'incorrect';
        END IF;
      END IF;

    ELSIF v_type = 'true_false' THEN
      v_stmts := COALESCE(v_kraw.statements, v_qraw->'statements', '[]'::jsonb);
      IF jsonb_typeof(v_stmts) <> 'array' THEN
        v_stmts := '[]'::jsonb;
      END IF;
      v_stmt_len := jsonb_array_length(v_stmts);
      v_stmt_cor_cnt := 0;
      v_has_any_tf := false;
      v_all_tf_answered := (v_stmt_len > 0);
      v_cor_display := '';
      v_stu_display := '';

      IF v_stmt_len > 0 THEN
        FOR v_stmt IN SELECT * FROM jsonb_array_elements(v_stmts) LOOP
          v_stmt_cor_val := COALESCE(v_stmt->>'correct', '');
          v_stmt_given_val := CASE
            WHEN v_stu_ans IS NOT NULL AND jsonb_typeof(v_stu_ans) = 'object' THEN COALESCE(v_stu_ans->>(v_stmt->>'id'), '')
            ELSE ''
          END;
          v_cor_display := CASE WHEN v_cor_display = '' THEN COALESCE(NULLIF(v_stmt_cor_val, ''), '-') ELSE v_cor_display || ',' || COALESCE(NULLIF(v_stmt_cor_val, ''), '-') END;
          v_stu_display := CASE WHEN v_stu_display = '' THEN COALESCE(NULLIF(v_stmt_given_val, ''), '-') ELSE v_stu_display || ',' || COALESCE(NULLIF(v_stmt_given_val, ''), '-') END;
          IF v_stmt_given_val <> '' THEN
            v_has_any_tf := true;
          ELSE
            v_all_tf_answered := false;
          END IF;
          IF v_stmt_given_val <> '' AND v_stmt_given_val = v_stmt_cor_val THEN
            v_stmt_cor_cnt := v_stmt_cor_cnt + 1;
          END IF;
        END LOOP;
      END IF;

      IF NOT v_has_any_tf THEN
        v_stu_display := '-';
      END IF;
      IF v_cor_display = '' THEN
        v_cor_display := '-';
      END IF;
      v_cor_val := to_jsonb(v_cor_display);

      IF NOT v_all_tf_answered THEN
        v_unattempted_cnt := v_unattempted_cnt + 1;
        v_status := 'unattempted';
      ELSE
        v_earned := ROUND((v_stmt_cor_cnt::numeric / v_stmt_len::numeric) * v_weight);
        IF v_stmt_cor_cnt = v_stmt_len THEN
          v_is_fully_correct := true;
          v_correct_cnt := v_correct_cnt + 1;
          v_status := 'correct';
        ELSE
          v_incorrect_cnt := v_incorrect_cnt + 1;
          v_status := 'incorrect';
        END IF;
      END IF;
    END IF;

    v_total_earned := v_total_earned + v_earned;

    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'questionNumber', v_idx,
        'questionId', v_qraw->'id',
        'type', v_type,
        'questionText', v_qraw->>'question',
        'studentAnswer', v_stu_ans,
        'correctAnswer', v_cor_val,
        'studentAnswerDisplay', v_stu_display,
        'correctAnswerDisplay', v_cor_display,
        'status', v_status,
        'earnedScore', v_earned,
        'maxScore', v_weight,
        'isFullyCorrect', v_is_fully_correct
      )
    );
  END LOOP;

  IF jsonb_array_length(v_q_ids) > 0 AND v_matched_cnt = 0 THEN
    RETURN jsonb_build_object('success', false, 'not_seeded', true, 'message', 'Bank soal Cloud belum tersinkron.');
  END IF;

  IF v_max_points > 0 THEN
    v_final_score := ROUND((v_total_earned / v_max_points) * 100);
  ELSE
    v_final_score := 0;
  END IF;

  v_full_record := jsonb_build_object(
    'id', v_res_id,
    'student', v_student,
    'examTitle', v_exam_title,
    'subject', v_subject,
    'attemptNumber', v_attempt,
    'completedAt', v_completed_at,
    'durationUsedSeconds', v_duration_used,
    'correctCount', v_correct_cnt,
    'incorrectCount', v_incorrect_cnt,
    'unattemptedCount', v_unattempted_cnt,
    'totalQuestions', v_idx,
    'totalEarnedPoints', v_total_earned,
    'maxPossiblePoints', v_max_points,
    'finalScore', v_final_score,
    'cheatCount', v_cheat_count,
    'cheatLogs', v_cheat_logs,
    'finishReason', v_finish_reason,
    'detailedAnswers', v_details
  );

  INSERT INTO cbt_exam_results (
    student_name, student_nisn, student_class, exam_title, subject,
    final_score, correct_count, incorrect_count, unattempted_count,
    total_questions, cheat_count, completed_at, finish_reason, raw_data
  ) VALUES (
    COALESCE(v_student->>'name', '-'),
    v_nisn,
    COALESCE(v_student->>'class', 'Umum'),
    v_exam_title,
    v_subject,
    v_final_score,
    v_correct_cnt,
    v_incorrect_cnt,
    v_unattempted_cnt,
    v_idx,
    v_cheat_count,
    v_completed_at,
    v_finish_reason,
    v_full_record
  );

  v_sess_key := UPPER(v_nisn) || '__' || LOWER(BTRIM(v_subject));
  INSERT INTO cbt_student_sessions (
    session_key, student_nisn, student_name, student_class, subject,
    status, attempt_number, answered_count, total_questions, remaining_seconds,
    cheat_count, final_score, completed_at, updated_at, raw_data
  ) VALUES (
    v_sess_key,
    v_nisn,
    COALESCE(v_student->>'name', '-'),
    COALESCE(v_student->>'class', 'Umum'),
    v_subject,
    'completed',
    v_attempt,
    GREATEST(0, v_idx - v_unattempted_cnt),
    v_idx,
    0,
    v_cheat_count,
    v_final_score,
    v_completed_at,
    NOW(),
    jsonb_build_object(
      'nisn', v_nisn,
      'name', COALESCE(v_student->>'name', '-'),
      'class', COALESCE(v_student->>'class', 'Umum'),
      'subject', v_subject,
      'status', 'completed',
      'attemptNumber', v_attempt,
      'answeredCount', GREATEST(0, v_idx - v_unattempted_cnt),
      'totalQuestions', v_idx,
      'remainingSeconds', 0,
      'cheatCount', v_cheat_count,
      'finalScore', v_final_score,
      'finishReason', v_finish_reason,
      'completedAt', v_completed_at,
      'updatedAt', NOW()
    )
  )
  ON CONFLICT (session_key) DO UPDATE SET
    status = 'completed',
    attempt_number = EXCLUDED.attempt_number,
    answered_count = EXCLUDED.answered_count,
    total_questions = EXCLUDED.total_questions,
    remaining_seconds = 0,
    cheat_count = EXCLUDED.cheat_count,
    final_score = EXCLUDED.final_score,
    completed_at = EXCLUDED.completed_at,
    updated_at = NOW(),
    raw_data = EXCLUDED.raw_data;

  -- Hanya kembalikan bukti selesai ke siswa (TANPA nilai maupun kunci jawaban, hanya status Remedial/Tidak Remedial!)
  RETURN jsonb_build_object(
    'success', true,
    'receipt', jsonb_build_object(
      'id', v_res_id,
      'student', v_student,
      'examTitle', v_exam_title,
      'subject', v_subject,
      'attemptNumber', v_attempt,
      'completedAt', v_completed_at,
      'totalQuestions', v_idx,
      'cheatCount', v_cheat_count,
      'finishReason', v_finish_reason,
      'isRemedial', (v_final_score < 75),
      'remedialStatus', CASE WHEN v_final_score < 75 THEN 'Remedial' ELSE 'Tidak Remedial' END
    )
  );
END;
$$;

-- RPC 6: Ambil Konfigurasi Publik untuk Layar Login Siswa (TANPA token & TANPA PIN)
CREATE OR REPLACE FUNCTION cbt_get_public_exam_config()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg JSONB;
  v_school_cfg JSONB;
  v_scheds JSONB;
  v_migrated JSONB;
  v_state JSONB := '{}'::jsonb;
BEGIN
  SELECT value INTO v_cfg FROM cbt_school_state WHERE key = 'cbt_config' LIMIT 1;
  IF v_cfg IS NULL THEN
    SELECT raw_data INTO v_cfg FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_config'
    ORDER BY id DESC LIMIT 1;
  END IF;

  SELECT value INTO v_school_cfg FROM cbt_school_state WHERE key = 'cbt_school_config' LIMIT 1;
  IF v_school_cfg IS NULL THEN
    SELECT raw_data INTO v_school_cfg FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_school_config'
    ORDER BY id DESC LIMIT 1;
  END IF;

  SELECT value INTO v_scheds FROM cbt_school_state WHERE key = 'cbt_exam_schedules' LIMIT 1;
  IF v_scheds IS NULL THEN
    SELECT raw_data INTO v_scheds FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_exam_schedules'
    ORDER BY id DESC LIMIT 1;
  END IF;

  SELECT value INTO v_migrated FROM cbt_school_state WHERE key = 'cbt_questions_migrated_v1' LIMIT 1;

  IF v_school_cfg IS NOT NULL THEN
    v_state := jsonb_set(v_state, '{cbt_school_config}', v_school_cfg, true);
  END IF;
  IF v_cfg IS NOT NULL AND jsonb_typeof(v_cfg) = 'object' THEN
    v_state := jsonb_set(v_state, '{cbt_config}', (v_cfg - 'examToken' - 'adminPin'), true);
  END IF;
  IF v_scheds IS NOT NULL AND jsonb_typeof(v_scheds) = 'array' THEN
    v_state := jsonb_set(v_state, '{cbt_exam_schedules}', cbt_strip_schedule_tokens(v_scheds), true);
  END IF;
  IF v_migrated IS NOT NULL THEN
    v_state := jsonb_set(v_state, '{cbt_questions_migrated_v1}', v_migrated, true);
  END IF;

  RETURN jsonb_build_object('success', true, 'state', v_state);
END;
$$;

-- RPC 7: Baca / Simpan Token Ujian di Brankas Server (Hanya Admin/Guru/Pengawas Terautentikasi)
CREATE OR REPLACE FUNCTION cbt_sync_token_vault(
  p_identifier TEXT,
  p_pin TEXT,
  p_config_token TEXT DEFAULT NULL,
  p_schedule_tokens JSONB DEFAULT NULL,
  p_mode TEXT DEFAULT 'read'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth JSONB;
  v_role TEXT;
  v_item JSONB;
  v_sid TEXT;
  v_tok TEXT;
  v_cfg_token TEXT;
  v_sched_tokens JSONB := '{}'::jsonb;
  v_cfg JSONB;
  v_scheds JSONB;
  v_rec RECORD;
BEGIN
  v_auth := cbt_verify_teacher_pin_internal(p_identifier, p_pin);
  IF NOT COALESCE((v_auth->>'valid')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'unauthorized', true,
      'message', COALESCE(v_auth->>'message', 'Autentikasi staf gagal.')
    );
  END IF;

  v_role := LOWER(COALESCE(v_auth->'teacher'->>'role', 'guru'));

  IF LOWER(COALESCE(p_mode, 'read')) = 'write' THEN
    IF v_role <> 'admin' THEN
      RETURN jsonb_build_object('success', false, 'unauthorized', true, 'message', 'Hanya Admin yang dapat mengubah token ujian.');
    END IF;

    IF p_config_token IS NOT NULL AND BTRIM(p_config_token) <> '' THEN
      INSERT INTO cbt_exam_tokens (token_key, token_value, updated_at)
      VALUES ('config', UPPER(BTRIM(p_config_token)), NOW())
      ON CONFLICT (token_key) DO UPDATE SET
        token_value = EXCLUDED.token_value,
        updated_at = NOW();
    END IF;

    IF p_schedule_tokens IS NOT NULL AND jsonb_typeof(p_schedule_tokens) = 'array' THEN
      DELETE FROM cbt_exam_tokens WHERE token_key LIKE 'schedule:%';
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_schedule_tokens) LOOP
        v_sid := BTRIM(COALESCE(v_item->>'id', ''));
        v_tok := UPPER(BTRIM(COALESCE(v_item->>'token', '')));
        IF v_sid <> '' AND v_tok <> '' THEN
          INSERT INTO cbt_exam_tokens (token_key, token_value, updated_at)
          VALUES ('schedule:' || v_sid, v_tok, NOW())
          ON CONFLICT (token_key) DO UPDATE SET
            token_value = EXCLUDED.token_value,
            updated_at = NOW();
        END IF;
      END LOOP;
    END IF;

    -- Pastikan tabel publik cbt_school_state bebas dari token
    SELECT value INTO v_cfg FROM cbt_school_state WHERE key = 'cbt_config' LIMIT 1;
    IF v_cfg IS NOT NULL AND ((v_cfg ? 'examToken') OR (v_cfg ? 'adminPin')) THEN
      UPDATE cbt_school_state
      SET value = (v_cfg - 'examToken' - 'adminPin'), updated_at = NOW()
      WHERE key = 'cbt_config';
    END IF;

    SELECT value INTO v_scheds FROM cbt_school_state WHERE key = 'cbt_exam_schedules' LIMIT 1;
    IF v_scheds IS NOT NULL AND jsonb_typeof(v_scheds) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_scheds) s WHERE s ? 'token') THEN
      UPDATE cbt_school_state
      SET value = cbt_strip_schedule_tokens(v_scheds), updated_at = NOW()
      WHERE key = 'cbt_exam_schedules';
    END IF;

    RETURN jsonb_build_object('success', true);
  END IF;

  -- Mode Read: hanya untuk Admin, Guru Mapel, atau Pengawas Ruang terautentikasi
  SELECT token_value INTO v_cfg_token FROM cbt_exam_tokens WHERE token_key = 'config' LIMIT 1;
  IF COALESCE(v_cfg_token, '') = '' THEN
    SELECT UPPER(BTRIM(COALESCE(value->>'examToken', ''))) INTO v_cfg_token
    FROM cbt_school_state WHERE key = 'cbt_config' LIMIT 1;
  END IF;

  FOR v_rec IN SELECT token_key, token_value FROM cbt_exam_tokens WHERE token_key LIKE 'schedule:%' LOOP
    v_sid := SUBSTRING(v_rec.token_key FROM 10);
    IF v_sid <> '' THEN
      v_sched_tokens := jsonb_set(v_sched_tokens, ARRAY[v_sid], to_jsonb(v_rec.token_value), true);
    END IF;
  END LOOP;

  -- Fallback baca jika jadwal masih menyimpan token sebelum migrasi penuh
  SELECT value INTO v_scheds FROM cbt_school_state WHERE key = 'cbt_exam_schedules' LIMIT 1;
  IF v_scheds IS NOT NULL AND jsonb_typeof(v_scheds) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_scheds) LOOP
      v_sid := BTRIM(COALESCE(v_item->>'id', ''));
      v_tok := UPPER(BTRIM(COALESCE(v_item->>'token', '')));
      IF v_sid <> '' AND v_tok <> '' AND NOT (v_sched_tokens ? v_sid) THEN
        v_sched_tokens := jsonb_set(v_sched_tokens, ARRAY[v_sid], to_jsonb(v_tok), true);
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'configToken', COALESCE(NULLIF(v_cfg_token, ''), 'CBT80M'),
    'scheduleTokens', v_sched_tokens
  );
END;
$$;

-- Helper Internal: Normalisasi token kelas (Romawi VII/VIII/IX + rentang 7-8-9 / 7-9)
CREATE OR REPLACE FUNCTION cbt_expand_class_tokens(p_raw TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT := UPPER(BTRIM(COALESCE(p_raw, '')));
  v_parts TEXT[];
  v_part TEXT;
  v_res TEXT[] := ARRAY[]::text[];
  v_norm TEXT;
  v_match TEXT[];
  v_num_a INTEGER;
  v_num_b INTEGER;
  v_i INTEGER;
  v_seg TEXT;
  v_segs TEXT[];
BEGIN
  IF v_clean = '' THEN RETURN v_res; END IF;
  -- Gunakan \y (word boundary POSIX PostgreSQL — jangan \b karena di PostgreSQL \b bermakna backspace!)
  v_clean := regexp_replace(v_clean, '\y(KELAS|TINGKAT|KLS)\y', '', 'gi');
  v_clean := regexp_replace(v_clean, '\s+(DAN|&)\s+', ',', 'gi');
  v_clean := regexp_replace(v_clean, '\s*(S/D|SD|TO)\s*', '-', 'gi');
  v_parts := regexp_split_to_array(v_clean, '[,;/]+');

  FOREACH v_part IN ARRAY v_parts LOOP
    v_part := BTRIM(v_part);
    IF v_part = '' THEN CONTINUE; END IF;

    -- Konversi awalan Kelas/Tingkat jika menempel tanpa spasi (misal "Kelas7" -> "7")
    v_part := regexp_replace(v_part, '^(KELAS|TINGKAT|KLS)\s*', '', 'i');

    -- Konversi angka romawi pada setiap segmen (misal "VII-IX" -> "7-9", "VII-A" -> "7-A")
    v_part := regexp_replace(v_part, '\yXII\y', '12', 'gi');
    v_part := regexp_replace(v_part, '\yXI\y', '11', 'gi');
    v_part := regexp_replace(v_part, '\yVIII\y', '8', 'gi');
    v_part := regexp_replace(v_part, '\yVII\y', '7', 'gi');
    v_part := regexp_replace(v_part, '\yVI\y', '6', 'gi');
    v_part := regexp_replace(v_part, '\yIX\y', '9', 'gi');
    v_part := regexp_replace(v_part, '\yIV\y', '4', 'gi');
    v_part := regexp_replace(v_part, '\yX\y', '10', 'gi');

    -- Cek rentang / daftar tingkat dipisah strip: misal 7-8-9 atau 7-9 atau VII-IX
    v_norm := regexp_replace(v_part, '\s+', '', 'g');
    IF v_norm ~ '^\d+(-\d+)+$' THEN
      v_segs := regexp_split_to_array(v_norm, '-');
      IF array_length(v_segs, 1) = 2 THEN
        v_num_a := v_segs[1]::integer;
        v_num_b := v_segs[2]::integer;
        IF v_num_a <= v_num_b AND (v_num_b - v_num_a) <= 6 THEN
          FOR v_i IN v_num_a..v_num_b LOOP
            v_res := array_append(v_res, v_i::text);
          END LOOP;
          CONTINUE;
        END IF;
      END IF;
      FOREACH v_seg IN ARRAY v_segs LOOP
        v_res := array_append(v_res, v_seg);
      END LOOP;
      CONTINUE;
    END IF;

    -- Token tunggal seperti VII-a -> 7A, 8 B -> 8B, 9 -> 9, VIIA -> 7A
    v_norm := regexp_replace(v_part, '[\s\-_]+', '', 'g');
    v_norm := regexp_replace(v_norm, '^(KELAS|TINGKAT|KLS)', '', 'i');
    v_norm := regexp_replace(v_norm, '^XII', '12', 'i');
    v_norm := regexp_replace(v_norm, '^XI', '11', 'i');
    v_norm := regexp_replace(v_norm, '^VIII', '8', 'i');
    v_norm := regexp_replace(v_norm, '^VII', '7', 'i');
    v_norm := regexp_replace(v_norm, '^VI', '6', 'i');
    v_norm := regexp_replace(v_norm, '^IX', '9', 'i');
    v_norm := regexp_replace(v_norm, '^IV', '4', 'i');
    v_norm := regexp_replace(v_norm, '^X', '10', 'i');

    IF v_norm <> '' THEN
      v_res := array_append(v_res, v_norm);
    END IF;
  END LOOP;

  RETURN v_res;
END;
$$;

-- Helper Internal: Cek kesesuaian kelas siswa terhadap classLevel jadwal di server
CREATE OR REPLACE FUNCTION cbt_matches_class_level(p_sched_class TEXT, p_student_class TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_qc TEXT := UPPER(BTRIM(COALESCE(p_sched_class, '')));
  v_tc TEXT := UPPER(BTRIM(COALESCE(p_student_class, '')));
  v_q_parts TEXT[];
  v_t_parts TEXT[];
  v_q TEXT;
  v_t TEXT;
  v_q_grade TEXT;
  v_t_grade TEXT;
BEGIN
  IF v_qc = '' OR v_qc ~ '(SEMUA|ALL)' THEN RETURN true; END IF;
  IF v_tc = '' OR v_tc ~ '(SEMUA|ALL)' THEN RETURN true; END IF;

  v_q_parts := cbt_expand_class_tokens(v_qc);
  v_t_parts := cbt_expand_class_tokens(v_tc);

  IF COALESCE(array_length(v_q_parts, 1), 0) = 0 OR COALESCE(array_length(v_t_parts, 1), 0) = 0 THEN
    RETURN true;
  END IF;

  FOREACH v_q IN ARRAY v_q_parts LOOP
    IF v_q IN ('SEMUA', 'SEMUAKELAS', 'ALL') THEN RETURN true; END IF;
    v_q_grade := substring(v_q FROM '^(\d+)');

    FOREACH v_t IN ARRAY v_t_parts LOOP
      IF v_q = v_t THEN RETURN true; END IF;
      v_t_grade := substring(v_t FROM '^(\d+)');
      IF v_q_grade IS NOT NULL AND v_t_grade IS NOT NULL AND v_q_grade = v_t_grade THEN
        IF v_q = v_q_grade OR v_t = v_t_grade THEN RETURN true; END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$$;

-- RPC 8: Validasi Token Ujian Siswa di Sisi Server (tanpa mengirim token asli ke browser siswa!)
CREATE OR REPLACE FUNCTION cbt_verify_exam_token(
  p_token TEXT,
  p_schedule_id TEXT DEFAULT NULL,
  p_student_class TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input_token TEXT := UPPER(BTRIM(COALESCE(p_token, '')));
  v_sched_id TEXT := BTRIM(COALESCE(p_schedule_id, ''));
  v_stu_class TEXT := BTRIM(COALESCE(p_student_class, ''));
  v_cfg JSONB;
  v_scheds JSONB;
  v_cfg_token TEXT;
  v_has_active BOOLEAN := false;
  v_selected JSONB := NULL;
  v_matched JSONB := NULL;
  v_matched_exact_id JSONB := NULL;
  v_matched_class JSONB := NULL;
  v_matched_any JSONB := NULL;
  v_sch JSONB;
  v_sch_tok TEXT;
  v_is_sched_active BOOLEAN;
  v_sched_class TEXT;
BEGIN
  IF v_input_token = '' THEN
    RETURN jsonb_build_object('success', false, 'valid', false, 'message', 'Harap masukkan Token Ujian!');
  END IF;

  SELECT value INTO v_cfg FROM cbt_school_state WHERE key = 'cbt_config' LIMIT 1;
  IF v_cfg IS NULL THEN
    SELECT raw_data INTO v_cfg FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_config'
    ORDER BY id DESC LIMIT 1;
  END IF;

  SELECT value INTO v_scheds FROM cbt_school_state WHERE key = 'cbt_exam_schedules' LIMIT 1;
  IF v_scheds IS NULL THEN
    SELECT raw_data INTO v_scheds FROM cbt_exam_results
    WHERE student_nisn = '__CBT_STATE__' AND student_name = 'cbt_exam_schedules'
    ORDER BY id DESC LIMIT 1;
  END IF;

  SELECT token_value INTO v_cfg_token FROM cbt_exam_tokens WHERE token_key = 'config' LIMIT 1;
  IF COALESCE(v_cfg_token, '') = '' THEN
    v_cfg_token := UPPER(BTRIM(COALESCE(v_cfg->>'examToken', '')));
  END IF;
  IF COALESCE(v_cfg_token, '') = '' THEN
    v_cfg_token := 'CBT80M';
  END IF;

  IF v_scheds IS NOT NULL AND jsonb_typeof(v_scheds) = 'array' THEN
    FOR v_sch IN SELECT * FROM jsonb_array_elements(v_scheds) LOOP
      v_is_sched_active := COALESCE((v_sch->>'isActive')::boolean, (v_sch->>'active')::boolean, false);
      IF v_is_sched_active THEN
        v_has_active := true;
        v_sched_class := COALESCE(NULLIF(v_sch->>'classLevel', ''), NULLIF(v_sch->>'targetClass', ''), 'Semua Kelas');

        IF v_selected IS NULL
           OR (v_sched_id <> '' AND BTRIM(COALESCE(v_sch->>'id', '')) = v_sched_id)
           OR (v_stu_class <> '' AND cbt_matches_class_level(v_sched_class, v_stu_class) AND v_sched_id = '') THEN
          v_selected := v_sch;
        END IF;

        SELECT token_value INTO v_sch_tok
        FROM cbt_exam_tokens
        WHERE token_key = 'schedule:' || BTRIM(COALESCE(v_sch->>'id', ''))
        LIMIT 1;
        IF COALESCE(v_sch_tok, '') = '' THEN
          v_sch_tok := UPPER(BTRIM(COALESCE(v_sch->>'token', '')));
        END IF;
        IF COALESCE(v_sch_tok, '') = '' THEN
          v_sch_tok := v_cfg_token;
        END IF;

        IF UPPER(BTRIM(v_sch_tok)) = v_input_token THEN
          IF v_matched_any IS NULL THEN
            v_matched_any := v_sch;
          END IF;

          IF v_sched_id <> '' AND BTRIM(COALESCE(v_sch->>'id', '')) = v_sched_id THEN
            IF v_stu_class = '' OR cbt_matches_class_level(v_sched_class, v_stu_class) THEN
              v_matched_exact_id := v_sch;
            ELSIF v_matched_exact_id IS NULL THEN
              v_matched_exact_id := v_sch;
            END IF;
          END IF;

          IF v_stu_class <> '' AND cbt_matches_class_level(v_sched_class, v_stu_class) THEN
            IF v_matched_class IS NULL OR (v_sched_id <> '' AND BTRIM(COALESCE(v_sch->>'id', '')) = v_sched_id) THEN
              v_matched_class := v_sch;
            END IF;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF v_has_active THEN
    -- Prioritas: cocok kelas siswa (dan/atau schedule_id yang dipilih) -> exact schedule_id -> kecocokan pertama
    v_matched := COALESCE(v_matched_class, v_matched_exact_id, v_matched_any);

    IF v_matched IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'valid', false,
        'message', 'Token ujian "' || v_input_token || '" tidak cocok dengan jadwal ujian (' || COALESCE(v_selected->>'subject', '-') || '). Periksa kembali atau tanyakan kepada Pengawas Ruang!'
      );
    END IF;

    v_sched_class := COALESCE(NULLIF(v_matched->>'classLevel', ''), NULLIF(v_matched->>'targetClass', ''), '');
    IF v_stu_class <> '' AND v_sched_class <> '' AND NOT cbt_matches_class_level(v_sched_class, v_stu_class) THEN
      RETURN jsonb_build_object(
        'success', false,
        'valid', false,
        'message', '⛔ Ujian Ditolak: Jadwal "' || COALESCE(v_matched->>'subject', '-') || '" (' || v_sched_class || ') bukan untuk Kelas ' || v_stu_class || '. Pilih mata pelajaran lain yang sesuai kelas Anda.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'valid', true,
      'mode', 'schedule',
      'schedule', (v_matched - 'token')
    );
  END IF;

  -- Mode Manual (belum ada jadwal aktif)
  IF v_input_token <> UPPER(BTRIM(v_cfg_token)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'valid', false,
      'message', 'Token ujian salah! Periksa kembali atau tanyakan kepada Pengawas Ruang / Proktor.'
    );
  END IF;

  IF v_stu_class <> '' AND COALESCE(v_cfg->>'targetClass', '') <> '' AND NOT cbt_matches_class_level(v_cfg->>'targetClass', v_stu_class) THEN
    RETURN jsonb_build_object(
      'success', false,
      'valid', false,
      'message', '⛔ Ujian Ditolak: Ujian "' || COALESCE(v_cfg->>'subject', '-') || '" saat ini dikhususkan untuk ' || COALESCE(v_cfg->>'targetClass', '-') || '.'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'valid', true, 'mode', 'manual');
END;
$$;

GRANT EXECUTE ON FUNCTION cbt_verify_teacher_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_verify_student_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_lookup_student_hint(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_sync_question_vault(TEXT, TEXT, JSONB, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_grade_and_submit_exam(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_get_public_exam_config() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_sync_token_vault(TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_verify_exam_token(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_matches_class_level(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_expand_class_tokens(TEXT) TO anon, authenticated;
