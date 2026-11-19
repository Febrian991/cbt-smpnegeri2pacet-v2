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

  IF v_id IN ('admin', 'proktor', 'superadmin', '198501012010011001') OR v_id LIKE '%admin%' OR v_id LIKE '%proktor%' THEN
    SELECT t INTO v_found
    FROM jsonb_array_elements(v_teachers) t
    WHERE (t->>'role' = 'admin' OR t->>'id' = 'admin')
    LIMIT 1;
    v_is_admin := true;
  ELSE
    SELECT t INTO v_found
    FROM jsonb_array_elements(v_teachers) t
    WHERE LOWER(BTRIM(COALESCE(t->>'nip', ''))) = v_id
    LIMIT 1;

    IF v_found IS NULL THEN
      SELECT t INTO v_found
      FROM jsonb_array_elements(v_teachers) t
      WHERE LOWER(BTRIM(COALESCE(t->>'id', ''))) = v_id
      LIMIT 1;
    END IF;

    IF v_found IS NULL THEN
      SELECT t INTO v_found
      FROM jsonb_array_elements(v_teachers) t
      WHERE LOWER(BTRIM(COALESCE(t->>'name', ''))) = v_id
      LIMIT 1;
    END IF;

    IF v_found IS NULL AND LENGTH(v_id) >= 3 THEN
      SELECT t INTO v_found
      FROM jsonb_array_elements(v_teachers) t
      WHERE LOWER(COALESCE(t->>'name', '')) LIKE '%' || v_id || '%'
      LIMIT 1;
    END IF;
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

GRANT EXECUTE ON FUNCTION cbt_verify_teacher_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_verify_student_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_lookup_student_hint(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_sync_question_vault(TEXT, TEXT, JSONB, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cbt_grade_and_submit_exam(JSONB) TO anon, authenticated;
