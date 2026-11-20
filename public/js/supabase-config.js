// Supabase Cloud Client & Real-Time Sync Manager
// Menyinkronkan Hasil Ujian, Pengaturan/Token, Jadwal, Bank Soal, Data Siswa & Guru lintas perangkat (Laptop & HP)

const DEFAULT_SUPABASE_CONFIG = {
  supabaseUrl: "https://ibmsfedjcathditbedpt.supabase.co",
  supabaseKey: "sb_publishable_k_36nCyvisFcxpAN6okLHg_7076YXri",
  enabled: true
};

class SupabaseSyncManager {
  constructor() {
    this.config = this.loadConfig();
    this.client = null;
    this.isConnected = false;
    this.stateTableMissing = false;
    this.sessionTableMissing = false;
    this.questionTableMissing = false;
    this.securityRpcMissing = false;
    this.tokenRpcMissing = false;
    this.PUBLIC_STATE_KEYS = ['cbt_config', 'cbt_school_config', 'cbt_exam_schedules', 'cbt_questions_migrated_v1'];
    this.pendingQuestionsStorageKey = 'cbt_pending_question_sync';
    this.questionsMigrationStorageKey = 'cbt_questions_migrated_v1';
    this._migrationPromise = null;
    this._flushPromise = null;
    this.inflightUpserts = new Map();
    this.inflightDeletes = new Set();
    this.initClient();
  }

  loadConfig() {
    const saved = localStorage.getItem('cbt_supabase_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.supabaseUrl && parsed.supabaseKey) {
          return parsed;
        }
      } catch (e) {
        console.error("Gagal load supabase config", e);
      }
    }
    const defaults = { ...DEFAULT_SUPABASE_CONFIG };
    try {
      localStorage.setItem('cbt_supabase_config', JSON.stringify(defaults));
    } catch (e) {}
    return defaults;
  }

  isCloudConfigured() {
    return Boolean(this.config && this.config.supabaseUrl && this.config.supabaseKey && this.isConnected);
  }

  getConfig() {
    return this.config || { ...DEFAULT_SUPABASE_CONFIG };
  }

  saveConfig(urlOrConfig, key) {
    if (typeof urlOrConfig === 'string') {
      this.config = {
        ...this.config,
        supabaseUrl: urlOrConfig.trim(),
        supabaseKey: (key || '').trim(),
        enabled: Boolean(urlOrConfig && key)
      };
    } else if (typeof urlOrConfig === 'object' && urlOrConfig !== null) {
      this.config = { ...this.config, ...urlOrConfig };
    }
    this.stateTableMissing = false;
    this.sessionTableMissing = false;
    this.questionTableMissing = false;
    this.securityRpcMissing = false;
    this._migrationPromise = null;
    this._flushPromise = null;
    localStorage.setItem('cbt_supabase_config', JSON.stringify(this.config));
    this.initClient();
  }

  isMissingRpcError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.status === 404 ||
      msg.includes('could not find the function') ||
      msg.includes('function public.cbt_') ||
      (msg.includes('does not exist') && msg.includes('function'))
    );
  }

  getPrivilegedCredentials() {
    if (
      typeof window !== 'undefined' &&
      window.cbtAdmin &&
      window.cbtAdmin.isAuthenticated &&
      typeof window.cbtAdmin.getAuthRpcCredentials === 'function'
    ) {
      return window.cbtAdmin.getAuthRpcCredentials();
    }
    return null;
  }

  stripQuestionKeys(q) {
    if (!q || typeof q !== 'object') return q;
    const clone = { ...q };
    delete clone.correctAnswer;
    if (Array.isArray(clone.statements)) {
      clone.statements = clone.statements.map(s => ({
        id: s && s.id !== undefined ? s.id : '',
        text: s && s.text !== undefined ? s.text : ''
      }));
    }
    return clone;
  }

  async callSecurityRpc(fnName, params = {}) {
    if (!this.client || !this.isConnected || this.securityRpcMissing || typeof this.client.rpc !== 'function') {
      return { rpcUnavailable: true };
    }
    try {
      const { data, error } = await this.client.rpc(fnName, params);
      if (error) {
        if (this.isMissingRpcError(error)) {
          this.securityRpcMissing = true;
          return { rpcUnavailable: true };
        }
        return { rpcUnavailable: false, success: false, message: error.message };
      }
      if (data && typeof data === 'object') {
        return data;
      }
      return { success: false, message: 'Respons server tidak valid.' };
    } catch (err) {
      return { rpcUnavailable: true, message: err.message };
    }
  }

  async verifyTeacherLoginRpc(identifier, pin) {
    return this.callSecurityRpc('cbt_verify_teacher_login', {
      p_identifier: String(identifier || '').trim(),
      p_pin: String(pin || '').trim()
    });
  }

  async verifyStudentLoginRpc(nisn, password) {
    return this.callSecurityRpc('cbt_verify_student_login', {
      p_nisn: String(nisn || '').trim(),
      p_password: String(password || '').trim()
    });
  }

  async lookupStudentHintRpc(nisn) {
    return this.callSecurityRpc('cbt_lookup_student_hint', {
      p_nisn: String(nisn || '').trim()
    });
  }

  async fetchTeacherQuestionsRpc(identifier, pin) {
    return this.callSecurityRpc('cbt_sync_question_vault', {
      p_identifier: String(identifier || '').trim(),
      p_pin: String(pin || '').trim(),
      p_questions: null,
      p_delete_key: null,
      p_replace_all: false
    });
  }

  async upsertTeacherQuestionsRpc(identifier, pin, payloads, replaceAll = false) {
    return this.callSecurityRpc('cbt_sync_question_vault', {
      p_identifier: String(identifier || '').trim(),
      p_pin: String(pin || '').trim(),
      p_questions: payloads,
      p_delete_key: null,
      p_replace_all: Boolean(replaceAll)
    });
  }

  async deleteTeacherQuestionRpc(identifier, pin, questionKey) {
    return this.callSecurityRpc('cbt_sync_question_vault', {
      p_identifier: String(identifier || '').trim(),
      p_pin: String(pin || '').trim(),
      p_questions: null,
      p_delete_key: String(questionKey || '').trim(),
      p_replace_all: false
    });
  }

  async gradeAndSubmitExamRpc(payload) {
    return this.callSecurityRpc('cbt_grade_and_submit_exam', {
      p_payload: payload
    });
  }

  async callTokenRpc(fnName, params = {}) {
    if (!this.client || !this.isConnected || this.tokenRpcMissing || typeof this.client.rpc !== 'function') {
      return { rpcUnavailable: true };
    }
    try {
      const { data, error } = await this.client.rpc(fnName, params);
      if (error) {
        if (this.isMissingRpcError(error)) {
          this.tokenRpcMissing = true;
          return { rpcUnavailable: true };
        }
        return { rpcUnavailable: false, success: false, valid: false, message: error.message };
      }
      if (data && typeof data === 'object') {
        return data;
      }
      return { success: false, valid: false, message: 'Respons server tidak valid.' };
    } catch (err) {
      return { rpcUnavailable: true, message: err.message };
    }
  }

  stripSensitiveStateFields(key, val) {
    if (key === 'cbt_config' && val && typeof val === 'object') {
      const { adminPin, examToken, ...restCfg } = val;
      return restCfg;
    }
    if (key === 'cbt_exam_schedules' && Array.isArray(val)) {
      return val.map(item => {
        if (!item || typeof item !== 'object') return item;
        const { token, ...restItem } = item;
        return restItem;
      });
    }
    return val;
  }

  async getPublicExamConfigRpc() {
    return this.callTokenRpc('cbt_get_public_exam_config', {});
  }

  async verifyExamTokenRpc(token, scheduleId = null, studentClass = null) {
    return this.callTokenRpc('cbt_verify_exam_token', {
      p_token: String(token || '').trim().toUpperCase(),
      p_schedule_id: scheduleId ? String(scheduleId).trim() : null,
      p_student_class: studentClass ? String(studentClass).trim() : null
    });
  }

  async fetchTokenVaultRpc(identifier, pin) {
    return this.callTokenRpc('cbt_sync_token_vault', {
      p_identifier: String(identifier || '').trim(),
      p_pin: String(pin || '').trim(),
      p_config_token: null,
      p_schedule_tokens: null,
      p_mode: 'read'
    });
  }

  async saveTokenVaultRpc(identifier, pin, configToken = null, scheduleTokens = null) {
    return this.callTokenRpc('cbt_sync_token_vault', {
      p_identifier: String(identifier || '').trim(),
      p_pin: String(pin || '').trim(),
      p_config_token: configToken ? String(configToken).trim().toUpperCase() : null,
      p_schedule_tokens: Array.isArray(scheduleTokens) ? scheduleTokens : null,
      p_mode: 'write'
    });
  }

  initClient() {
    if (this.config.supabaseUrl && this.config.supabaseKey && typeof window.supabase !== 'undefined') {
      try {
        this.client = window.supabase.createClient(this.config.supabaseUrl, this.config.supabaseKey);
        this.isConnected = true;
      } catch (err) {
        console.error("Gagal inisialisasi Supabase:", err);
        this.client = null;
        this.isConnected = false;
      }
    } else {
      this.client = null;
      this.isConnected = false;
    }
  }

  isTableMissingErr(error, tableName = '') {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    const t = String(tableName || '').toLowerCase();
    if (error.code === '42P01' || error.code === 'PGRST205') return true;
    if (msg.includes('does not exist') || msg.includes('not find the table') || msg.includes('schema cache')) {
      return !t || msg.includes(t);
    }
    return false;
  }

  async checkTablesHealth(customUrl = null, customKey = null) {
    if (typeof window.supabase === 'undefined') {
      return { success: false, message: "Pustaka Supabase JS belum siap dimuat.", tables: [] };
    }
    const targetUrl = String(customUrl || this.config?.supabaseUrl || '').trim();
    const targetKey = String(customKey || this.config?.supabaseKey || '').trim();
    if (!targetUrl || !targetKey) {
      return { success: false, message: "URL atau Key Supabase belum diisi.", tables: [] };
    }

    try {
      const client = (customUrl || customKey || !this.client)
        ? window.supabase.createClient(targetUrl, targetKey)
        : this.client;

      const specs = [
        { name: 'cbt_exam_results', label: 'Hasil Ujian (Utama)', purpose: 'Menyimpan rekap nilai akhir seluruh siswa', countReadable: true },
        { name: 'cbt_school_state', label: 'Pengaturan & Jadwal', purpose: 'Sinkronisasi pengaturan, jadwal, siswa & guru', countReadable: true },
        { name: 'cbt_questions', label: 'Bank Soal Per-Baris', purpose: 'Akses cepat soal tanpa kunci jawaban di browser siswa', countReadable: true },
        { name: 'cbt_student_sessions', label: 'Sesi Live Siswa', purpose: 'Pantau 250 siswa login, mengerjakan & selesai real-time', countReadable: true },
        { name: 'cbt_question_keys', label: 'Brankas Kunci Server', purpose: 'Menjaga kunci jawaban tersembunyi & koreksi di Postgres', countReadable: false, keyCol: 'question_key' },
        { name: 'cbt_exam_tokens', label: 'Brankas Token Server', purpose: 'Menjaga token ujian tersembunyi & validasi di Postgres', countReadable: false, keyCol: 'token_key' }
      ];

      const results = [];
      for (const sp of specs) {
        const resp = sp.countReadable
          ? await client.from(sp.name).select('*', { count: 'exact', head: true })
          : await client.from(sp.name).select(sp.keyCol || 'question_key').limit(1);
        const { count, error, status } = resp;
        let ready = false;
        let note = '';
        const errMsgLower = String(error?.message || '').toLowerCase();
        const isPermDenied = Boolean(error) && (
          error.code === '42501' ||
          status === 401 ||
          status === 403 ||
          errMsgLower.includes('permission denied') ||
          errMsgLower.includes('insufficient_privilege') ||
          errMsgLower.includes('row-level security')
        );

        if (!error) {
          ready = true;
          note = typeof count === 'number' ? `${count} baris` : 'Aktif';
        } else if ((sp.name === 'cbt_question_keys' || sp.name === 'cbt_exam_tokens') && isPermDenied) {
          // Tabel cbt_question_keys & cbt_exam_tokens sengaja memblokir SELECT dari anon agar kunci/token aman 100%
          ready = true;
          note = 'Aktif & Terkunci Aman';
        } else if (this.isTableMissingErr(error, sp.name)) {
          ready = false;
          note = 'Belum dibuat (Mode Fallback)';
        } else if (error.code === 'PGRST116') {
          ready = true;
          note = 'Aktif';
        } else {
          ready = false;
          note = error.message || `Gagal akses (HTTP ${status || '?'})`;
        }
        results.push({ ...sp, ready, count: typeof count === 'number' ? count : null, note });
      }

      // Cek apakah RPC server-side (keamanan, validasi token & koreksi Postgres) sudah terpasang
      let rpcReady = false;
      let tokenRpcReady = false;
      try {
        const [rpcTest, tokRpcTest] = await Promise.all([
          client.rpc('cbt_lookup_student_hint', { p_nisn: '__HEALTH_CHECK__' }),
          client.rpc('cbt_verify_exam_token', { p_token: '', p_schedule_id: null, p_student_class: null })
        ]);
        if (!rpcTest.error) {
          rpcReady = true;
        } else {
          const rMsg = String(rpcTest.error.message || '').toLowerCase();
          rpcReady = !(rpcTest.error.code === 'PGRST202' || rMsg.includes('could not find the function'));
        }
        if (!tokRpcTest.error) {
          tokenRpcReady = true;
        } else {
          const tMsg = String(tokRpcTest.error.message || '').toLowerCase();
          tokenRpcReady = !(tokRpcTest.error.code === 'PGRST202' || tMsg.includes('could not find the function'));
        }
      } catch (e) {
        rpcReady = false;
        tokenRpcReady = false;
      }

      const missingTables = results.filter(r => !r.ready).map(r => r.name);
      if (!customUrl && !customKey) {
        this.stateTableMissing = missingTables.includes('cbt_school_state');
        this.questionTableMissing = missingTables.includes('cbt_questions');
        this.sessionTableMissing = missingTables.includes('cbt_student_sessions');
        this.securityRpcMissing = !rpcReady;
        this.tokenRpcMissing = !tokenRpcReady;
      }

      return {
        success: true,
        allOptimal: missingTables.length === 0 && rpcReady && tokenRpcReady,
        allDedicatedTablesReady: missingTables.length === 0,
        missingTables,
        rpcReady,
        tokenRpcReady,
        tables: results
      };
    } catch (err) {
      return { success: false, message: err.message, tables: [] };
    }
  }

  async migrateFallbackToDedicatedTables() {
    if (!this.client || !this.isConnected) {
      return { success: false, message: "Supabase Cloud belum terhubung." };
    }
    const health = await this.checkTablesHealth();
    if (!health.success) {
      return { success: false, message: health.message || "Gagal memeriksa tabel Supabase." };
    }
    if (!health.allDedicatedTablesReady) {
      return {
        success: false,
        message: `Masih ada tabel yang belum dibuat di Supabase: ${health.missingTables.join(', ')}.\n\nSilakan salin Script SQL lalu jalankan (Run) di menu SQL Editor Supabase terlebih dahulu.`
      };
    }

    this.stateTableMissing = false;
    this.questionTableMissing = false;
    this.sessionTableMissing = false;
    this.securityRpcMissing = !health.rpcReady;

    const pushRes = await this.pushAllSchoolState();
    const qRes = await this.fetchAllQuestionRows();
    const finalHealth = await this.checkTablesHealth();

    return {
      success: Boolean(pushRes && pushRes.success),
      pushedCount: pushRes?.count || 0,
      questionsCount: Array.isArray(qRes?.rows) ? qRes.rows.length : 0,
      health: finalHealth,
      message: pushRes?.success
        ? `Migrasi & sinkronisasi berhasil!\n• ${pushRes.count} kelompok data sekolah tersimpan di cbt_school_state\n• ${Array.isArray(qRes?.rows) ? qRes.rows.length : 0} butir soal aktif di tabel khusus cbt_questions\n• Database kini siap optimal untuk 250 siswa serentak!`
        : (pushRes?.message || "Gagal memindahkan data ke tabel khusus.")
    };
  }

  async testConnection(url, key) {
    if (typeof window.supabase === 'undefined') {
      return { success: false, message: "Pustaka Supabase JS belum siap dimuat. Cek koneksi internet Anda." };
    }

    try {
      const testClient = window.supabase.createClient(url.trim(), key.trim());
      const { error } = await testClient.from('cbt_exam_results').select('count', { count: 'exact', head: true });

      if (error && error.code !== 'PGRST116') {
        if (this.isTableMissingErr(error, 'cbt_exam_results')) {
          return {
            success: true,
            warning: true,
            message: "Koneksi berhasil! Namun tabel 'cbt_exam_results' belum dibuat di Supabase SQL Editor. Jalankan script supabase-schema.sql terlebih dahulu."
          };
        }
        return { success: false, message: "Gagal: " + error.message };
      }

      const health = await this.checkTablesHealth(url, key);
      if (health.success && health.missingTables.length > 0) {
        return {
          success: true,
          warning: true,
          health,
          message: `Koneksi ke Supabase berhasil, namun masih berjalan di MODE FALLBACK karena tabel khusus berikut belum dibuat:\n• ${health.missingTables.join('\n• ')}\n\nKlik tombol "Salin Script SQL Optimal" di bawah lalu jalankan (Run) di SQL Editor Supabase agar siap untuk 250 siswa serentak.`
        };
      }

      if (health.success && (!health.rpcReady || !health.tokenRpcReady)) {
        return {
          success: true,
          warning: true,
          health,
          message: "Semua 6 tabel utama sudah aktif! Namun fungsi keamanan & validasi token server (RPC) belum lengkap — disarankan jalankan ulang script supabase-schema.sql terbaru."
        };
      }

      return {
        success: true,
        health,
        message: "Koneksi ke Supabase Cloud Berhasil! Semua 6 tabel khusus (cbt_exam_results, cbt_school_state, cbt_questions, cbt_student_sessions, cbt_question_keys, cbt_exam_tokens) & fungsi keamanan server sudah AKTIF dan OPTIMAL untuk 250 siswa serentak."
      };
    } catch (err) {
      return { success: false, message: "Error: " + err.message };
    }
  }

  isMissingTableError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      msg.includes('cbt_school_state') && (msg.includes('does not exist') || msg.includes('not find the table') || msg.includes('schema cache'))
    );
  }

  // Simpan 1 bagian state aplikasi (config, jadwal, soal, siswa, guru) ke Supabase
  async pushStateKey(key, value) {
    if (!this.client || !this.isConnected || !key) return { success: false };
    let payloadValue = value;
    if (key === 'cbt_config' && payloadValue && typeof payloadValue === 'object') {
      const { adminPin, ...restCfg } = payloadValue;
      payloadValue = restCfg;
      const creds = this.getPrivilegedCredentials();
      if (creds && restCfg.examToken && !this.tokenRpcMissing) {
        const tokRes = await this.saveTokenVaultRpc(creds.identifier, creds.pin, restCfg.examToken, null);
        if (tokRes && tokRes.success && !tokRes.rpcUnavailable) {
          payloadValue = this.stripSensitiveStateFields('cbt_config', restCfg);
        }
      }
    } else if (key === 'cbt_exam_schedules' && Array.isArray(payloadValue)) {
      const creds = this.getPrivilegedCredentials();
      if (creds && !this.tokenRpcMissing) {
        const schedTokens = payloadValue
          .filter(s => s && s.id && s.token)
          .map(s => ({ id: String(s.id), token: String(s.token).trim().toUpperCase() }));
        const tokRes = await this.saveTokenVaultRpc(creds.identifier, creds.pin, null, schedTokens);
        if (tokRes && tokRes.success && !tokRes.rpcUnavailable) {
          payloadValue = this.stripSensitiveStateFields('cbt_exam_schedules', payloadValue);
        }
      }
    }

    try {
      if (!this.stateTableMissing) {
        const { error } = await this.client
          .from('cbt_school_state')
          .upsert({ key, value: payloadValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

        if (!error) return { success: true };
        if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        } else {
          console.warn(`Gagal upsert cbt_school_state[${key}]:`, error.message);
        }
      }

      // Fallback otomatis via tabel cbt_exam_results jika cbt_school_state belum dibuat
      await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('student_nisn', '__CBT_STATE__')
        .eq('student_name', key);

      const { error: fallbackErr } = await this.client
        .from('cbt_exam_results')
        .insert([{
          student_name: key,
          student_nisn: '__CBT_STATE__',
          student_class: 'STATE',
          exam_title: 'CBT_STATE_SYNC',
          subject: key,
          final_score: 0,
          correct_count: 0,
          incorrect_count: 0,
          unattempted_count: 0,
          total_questions: 0,
          cheat_count: 0,
          completed_at: new Date().toISOString(),
          finish_reason: 'STATE',
          raw_data: payloadValue
        }]);

      if (fallbackErr) {
        console.warn(`Gagal sinkron cloud state[${key}]:`, fallbackErr.message);
        return { success: false, message: fallbackErr.message };
      }
      return { success: true };
    } catch (err) {
      console.warn(`Error pushStateKey[${key}]:`, err);
      return { success: false, message: err.message };
    }
  }

  isMissingQuestionsTableError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      (msg.includes('cbt_questions') && (msg.includes('does not exist') || msg.includes('not find the table') || msg.includes('schema cache')))
    );
  }

  // ================= ANTIAN OFFLINE & PENYIMPANAN SOAL PER-BARIS =================
  loadPendingQuestionOps() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.pendingQuestionsStorageKey) || '{}');
      return {
        upserts: raw && typeof raw.upserts === 'object' && raw.upserts ? raw.upserts : {},
        deletes: raw && typeof raw.deletes === 'object' && raw.deletes ? raw.deletes : {}
      };
    } catch (e) {
      return { upserts: {}, deletes: {} };
    }
  }

  savePendingQuestionOps(ops) {
    try {
      const upCount = Object.keys(ops.upserts || {}).length;
      const delCount = Object.keys(ops.deletes || {}).length;
      if (upCount === 0 && delCount === 0) {
        localStorage.removeItem(this.pendingQuestionsStorageKey);
      } else {
        localStorage.setItem(this.pendingQuestionsStorageKey, JSON.stringify(ops));
      }
    } catch (e) {}
  }

  markQuestionsPendingUpsert(questionsArray) {
    const ops = this.loadPendingQuestionOps();
    (questionsArray || []).forEach(q => {
      if (!q || q.id === undefined || q.id === null) return;
      const k = String(q.id);
      ops.upserts[k] = q;
      delete ops.deletes[k];
    });
    this.savePendingQuestionOps(ops);
  }

  markQuestionPendingDelete(questionId) {
    if (questionId === undefined || questionId === null) return;
    const k = String(questionId);
    const ops = this.loadPendingQuestionOps();
    delete ops.upserts[k];
    ops.deletes[k] = true;
    this.savePendingQuestionOps(ops);
  }

  clearQuestionsPendingKeys(keys, type = 'both') {
    const ops = this.loadPendingQuestionOps();
    (keys || []).forEach(k => {
      const sk = String(k);
      if (type === 'upsert' || type === 'both') delete ops.upserts[sk];
      if (type === 'delete' || type === 'both') delete ops.deletes[sk];
    });
    this.savePendingQuestionOps(ops);
  }

  buildQuestionRowPayload(q) {
    const key = String(q.id);
    const updatedAt = q.updatedAt || new Date().toISOString();
    const enriched = { ...q, updatedAt };
    return {
      question_key: key,
      subject: String(q.subject || 'Umum').trim() || 'Umum',
      class_level: String(q.classLevel || 'Semua Kelas').trim() || 'Semua Kelas',
      created_by: String(q.createdBy || ''),
      q_type: String(q.type || 'single'),
      updated_at: updatedAt,
      raw_data: enriched
    };
  }

  sortQuestionsList(list) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      const na = Number(a && a.id);
      const nb = Number(b && b.id);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
        return na - nb;
      }
      return String(a && a.id || '').localeCompare(String(b && b.id || ''));
    });
  }

  mergeQuestionListsById(baseList, overlayList) {
    const map = new Map();
    (Array.isArray(baseList) ? baseList : []).forEach(q => {
      if (q && q.id !== undefined && q.id !== null) {
        map.set(String(q.id), q);
      }
    });
    (Array.isArray(overlayList) ? overlayList : []).forEach(q => {
      if (!q || q.id === undefined || q.id === null) return;
      const key = String(q.id);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, q);
      } else {
        const prevTs = String(prev.updatedAt || '');
        const nextTs = String(q.updatedAt || '');
        if (!prevTs || (nextTs && nextTs >= prevTs)) {
          map.set(key, q);
        }
      }
    });
    return this.sortQuestionsList(Array.from(map.values()));
  }

  applyPendingQuestionOverlay(remoteQuestions) {
    const ops = this.loadPendingQuestionOps();
    const deleteSet = new Set([
      ...Object.keys(ops.deletes || {}),
      ...Array.from(this.inflightDeletes || [])
    ]);

    const baseFiltered = (Array.isArray(remoteQuestions) ? remoteQuestions : [])
      .filter(q => q && q.id !== undefined && q.id !== null && !deleteSet.has(String(q.id)));

    const overlayList = [
      ...Object.values(ops.upserts || {}),
      ...Array.from((this.inflightUpserts && this.inflightUpserts.values()) || [])
    ];

    return this.mergeQuestionListsById(baseFiltered, overlayList);
  }

  async hasAnyPerRowQuestionsRemote() {
    if (!this.client || !this.isConnected) return false;
    try {
      if (!this.questionTableMissing) {
        const { data, error } = await this.client
          .from('cbt_questions')
          .select('question_key')
          .limit(1);

        if (!error) {
          if (Array.isArray(data) && data.length > 0) return true;
        } else if (this.isMissingQuestionsTableError(error)) {
          this.questionTableMissing = true;
        }
      }

      const { data: fbData, error: fbErr } = await this.client
        .from('cbt_exam_results')
        .select('id')
        .eq('student_nisn', '__CBT_QUESTION_ROW__')
        .limit(1);

      return !fbErr && Array.isArray(fbData) && fbData.length > 0;
    } catch (e) {
      return false;
    }
  }

  markQuestionsMigrationDoneLocal() {
    try {
      localStorage.setItem(this.questionsMigrationStorageKey, '1');
    } catch (e) {}
  }

  async markQuestionsMigrationDoneRemote() {
    this.markQuestionsMigrationDoneLocal();
    if (!this.client || !this.isConnected) return false;
    try {
      await this.pushStateKey('cbt_questions_migrated_v1', {
        migrated: true,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async isQuestionsMigrationCompleted() {
    try {
      if (localStorage.getItem(this.questionsMigrationStorageKey) === '1') {
        return true;
      }
    } catch (e) {}

    if (!this.client || !this.isConnected) return false;

    const hasRows = await this.hasAnyPerRowQuestionsRemote();
    if (hasRows) {
      this.markQuestionsMigrationDoneLocal();
      return true;
    }

    try {
      if (!this.stateTableMissing) {
        const { data, error } = await this.client
          .from('cbt_school_state')
          .select('value')
          .eq('key', 'cbt_questions_migrated_v1')
          .limit(1);
        if (!error && Array.isArray(data) && data.length > 0 && data[0].value) {
          this.markQuestionsMigrationDoneLocal();
          return true;
        } else if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        }
      }

      const { data: fbMarker, error: fbErr } = await this.client
        .from('cbt_exam_results')
        .select('id')
        .eq('student_nisn', '__CBT_STATE__')
        .eq('student_name', 'cbt_questions_migrated_v1')
        .limit(1);
      if (!fbErr && Array.isArray(fbMarker) && fbMarker.length > 0) {
        this.markQuestionsMigrationDoneLocal();
        return true;
      }
    } catch (e) {}

    return false;
  }

  async ensureQuestionsMigratedToRows(fallbackLocalQuestions = []) {
    if (!this.client || !this.isConnected) return false;
    if (this._migrationPromise) return this._migrationPromise;

    this._migrationPromise = (async () => {
      try {
        const alreadyMigrated = await this.isQuestionsMigrationCompleted();
        if (alreadyMigrated) return true;

        let legacyQuestions = [];
        if (!this.stateTableMissing) {
          const { data, error } = await this.client
            .from('cbt_school_state')
            .select('value')
            .eq('key', 'cbt_questions')
            .limit(1);
          if (!error && Array.isArray(data) && data[0] && Array.isArray(data[0].value)) {
            legacyQuestions = data[0].value;
          } else if (this.isMissingTableError(error)) {
            this.stateTableMissing = true;
          }
        }

        if (legacyQuestions.length === 0) {
          const { data: fbState } = await this.client
            .from('cbt_exam_results')
            .select('raw_data, id')
            .eq('student_nisn', '__CBT_STATE__')
            .eq('student_name', 'cbt_questions')
            .order('id', { ascending: false })
            .limit(1);
          if (Array.isArray(fbState) && fbState[0] && Array.isArray(fbState[0].raw_data)) {
            legacyQuestions = fbState[0].raw_data;
          }
        }

        const seedList = legacyQuestions.length > 0
          ? legacyQuestions
          : (Array.isArray(fallbackLocalQuestions) ? fallbackLocalQuestions : []);

        if (seedList.length > 0) {
          await this.upsertQuestionRows(seedList, { skipMigrationCheck: true, skipPendingMark: true });
        }
        await this.markQuestionsMigrationDoneRemote();
        return true;
      } catch (e) {
        return false;
      } finally {
        this._migrationPromise = null;
      }
    })();

    return this._migrationPromise;
  }

  async upsertQuestionRow(questionObj, seedFallback = []) {
    if (!questionObj || questionObj.id === undefined || questionObj.id === null) {
      return { success: false, message: 'ID soal tidak valid.' };
    }
    return this.upsertQuestionRows([questionObj], { seedFallback });
  }

  async upsertQuestionRows(questionsArray, options = {}) {
    const validList = (Array.isArray(questionsArray) ? questionsArray : [])
      .filter(q => q && q.id !== undefined && q.id !== null);

    if (validList.length === 0) return { success: true, count: 0 };

    // Catat ke antrean pending SECARA SINKRON sebelum request jaringan agar tidak hilang jika browser direfresh/ditutup mendadak
    if (!options.skipPendingMark) {
      this.markQuestionsPendingUpsert(validList);
    }

    if (!this.client || !this.isConnected) {
      return { success: false, queued: true, count: 0 };
    }

    const trackedKeys = [];
    if (!options.skipInflightTrack) {
      validList.forEach(q => {
        const k = String(q.id);
        trackedKeys.push(k);
        this.inflightDeletes.delete(k);
        this.inflightUpserts.set(k, q);
      });
    }

    try {
      if (!options.skipMigrationCheck) {
        await this.ensureQuestionsMigratedToRows(options.seedFallback || []);
      }

      const CHUNK_SIZE = 50;
      let syncedCount = 0;
      const creds = this.getPrivilegedCredentials();

      for (let i = 0; i < validList.length; i += CHUNK_SIZE) {
        const chunk = validList.slice(i, i + CHUNK_SIZE);
        const payloads = chunk.map(q => this.buildQuestionRowPayload(q));
        const chunkKeys = payloads.map(p => p.question_key);
        let chunkSaved = false;

        if (creds && !this.securityRpcMissing) {
          const rpcRes = await this.upsertTeacherQuestionsRpc(creds.identifier, creds.pin, payloads, false);
          if (rpcRes && rpcRes.success) {
            chunkSaved = true;
          }
        }

        if (!chunkSaved && !this.questionTableMissing) {
          const { error } = await this.client
            .from('cbt_questions')
            .upsert(payloads, { onConflict: 'question_key' });

          if (!error) {
            chunkSaved = true;
          } else if (this.isMissingQuestionsTableError(error)) {
            this.questionTableMissing = true;
          } else {
            console.warn('Gagal upsert cbt_questions:', error.message);
          }
        }

        if (!chunkSaved) {
          await this.client
            .from('cbt_exam_results')
            .delete()
            .eq('student_nisn', '__CBT_QUESTION_ROW__')
            .in('exam_title', chunkKeys);

          const fbRows = payloads.map(p => ({
            student_name: p.created_by || 'Guru',
            student_nisn: '__CBT_QUESTION_ROW__',
            student_class: p.class_level,
            exam_title: p.question_key,
            subject: p.subject,
            final_score: 0,
            correct_count: 0,
            incorrect_count: 0,
            unattempted_count: 0,
            total_questions: 1,
            cheat_count: 0,
            completed_at: p.updated_at,
            finish_reason: p.q_type,
            raw_data: p.raw_data
          }));

          const { error: fbErr } = await this.client
            .from('cbt_exam_results')
            .insert(fbRows);

          if (fbErr) {
            this.markQuestionsPendingUpsert(validList.slice(i));
            return { success: false, queued: true, message: fbErr.message, count: syncedCount };
          }
          chunkSaved = true;
        }

        if (chunkSaved) {
          this.clearQuestionsPendingKeys(chunkKeys, 'upsert');
          syncedCount += chunk.length;
        }
      }

      if (syncedCount > 0) {
        this.markQuestionsMigrationDoneLocal();
      }

      return { success: true, count: syncedCount };
    } catch (err) {
      this.markQuestionsPendingUpsert(validList);
      return { success: false, queued: true, message: err.message };
    } finally {
      trackedKeys.forEach(k => this.inflightUpserts.delete(k));
    }
  }

  async deleteQuestionRow(questionId, seedFallback = []) {
    if (questionId === undefined || questionId === null) return { success: false };
    const key = String(questionId);

    // Catat penghapusan secara sinkron sebelum request jaringan agar tidak muncul kembali jika browser direfresh
    this.markQuestionPendingDelete(key);

    if (!this.client || !this.isConnected) {
      return { success: false, queued: true };
    }

    this.inflightUpserts.delete(key);
    this.inflightDeletes.add(key);

    try {
      await this.ensureQuestionsMigratedToRows(seedFallback);

      let deletedOk = false;
      const creds = this.getPrivilegedCredentials();
      if (creds && !this.securityRpcMissing) {
        const rpcRes = await this.deleteTeacherQuestionRpc(creds.identifier, creds.pin, key);
        if (rpcRes && rpcRes.success) {
          deletedOk = true;
        }
      }

      if (!deletedOk && !this.questionTableMissing) {
        const { error } = await this.client
          .from('cbt_questions')
          .delete()
          .eq('question_key', key);

        if (!error) {
          deletedOk = true;
        } else if (this.isMissingQuestionsTableError(error)) {
          this.questionTableMissing = true;
        } else {
          console.warn(`Gagal hapus cbt_questions[${key}]:`, error.message);
        }
      }

      const { error: fbErr } = await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('student_nisn', '__CBT_QUESTION_ROW__')
        .eq('exam_title', key);

      if (deletedOk || !fbErr) {
        this.clearQuestionsPendingKeys([key], 'both');
        this.markQuestionsMigrationDoneLocal();
        return { success: true };
      }

      return { success: false, queued: true, message: fbErr ? fbErr.message : 'Gagal menghapus soal di cloud.' };
    } catch (err) {
      return { success: false, queued: true, message: err.message };
    } finally {
      this.inflightDeletes.delete(key);
    }
  }

  async deleteQuestionRows(questionIds = [], seedFallback = []) {
    const keys = [...new Set(
      (Array.isArray(questionIds) ? questionIds : [])
        .filter(id => id !== undefined && id !== null && String(id).trim() !== '')
        .map(id => String(id))
    )];
    if (keys.length === 0) return { success: true, count: 0 };

    keys.forEach(k => {
      this.markQuestionPendingDelete(k);
      this.inflightUpserts.delete(k);
      this.inflightDeletes.add(k);
    });

    if (!this.client || !this.isConnected) {
      keys.forEach(k => this.inflightDeletes.delete(k));
      return { success: false, queued: true, count: 0 };
    }

    try {
      await this.ensureQuestionsMigratedToRows(seedFallback);

      const creds = this.getPrivilegedCredentials();
      const deletedKeys = [];
      const failedKeys = [];

      if (creds && !this.securityRpcMissing) {
        const RPC_BATCH = 6;
        for (let i = 0; i < keys.length; i += RPC_BATCH) {
          const slice = keys.slice(i, i + RPC_BATCH);
          const results = await Promise.all(slice.map(async (k) => {
            try {
              const rpcRes = await this.deleteTeacherQuestionRpc(creds.identifier, creds.pin, k);
              return { k, ok: Boolean(rpcRes && rpcRes.success) };
            } catch (e) {
              return { k, ok: false };
            }
          }));
          results.forEach(r => (r.ok ? deletedKeys.push(r.k) : failedKeys.push(r.k)));
        }
      } else {
        const CHUNK_SIZE = 50;
        for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
          const chunk = keys.slice(i, i + CHUNK_SIZE);
          let chunkOk = false;

          if (!this.questionTableMissing) {
            const { error } = await this.client
              .from('cbt_questions')
              .delete()
              .in('question_key', chunk);
            if (!error) {
              chunkOk = true;
            } else if (this.isMissingQuestionsTableError(error)) {
              this.questionTableMissing = true;
            }
          }

          const { error: fbErr } = await this.client
            .from('cbt_exam_results')
            .delete()
            .eq('student_nisn', '__CBT_QUESTION_ROW__')
            .in('exam_title', chunk);

          if (chunkOk || !fbErr) {
            deletedKeys.push(...chunk);
          } else {
            failedKeys.push(...chunk);
          }
        }
      }

      if (deletedKeys.length > 0) {
        this.clearQuestionsPendingKeys(deletedKeys, 'both');
        this.markQuestionsMigrationDoneLocal();
      }

      return {
        success: failedKeys.length === 0,
        count: deletedKeys.length,
        queued: failedKeys.length > 0
      };
    } catch (err) {
      return { success: false, queued: true, message: err.message };
    } finally {
      keys.forEach(k => this.inflightDeletes.delete(k));
    }
  }

  async replaceAllQuestionRows(questionsArray) {
    const validList = (Array.isArray(questionsArray) ? questionsArray : [])
      .filter(q => q && q.id !== undefined && q.id !== null);

    this.savePendingQuestionOps({ upserts: {}, deletes: {} });
    if (validList.length > 0) {
      this.markQuestionsPendingUpsert(validList);
    }

    if (!this.client || !this.isConnected) {
      return { success: false, queued: true };
    }

    try {
      const creds = this.getPrivilegedCredentials();
      let res = null;
      if (creds && !this.securityRpcMissing) {
        const payloads = validList.map(q => this.buildQuestionRowPayload(q));
        const rpcRes = await this.upsertTeacherQuestionsRpc(creds.identifier, creds.pin, payloads, true);
        if (rpcRes && rpcRes.success) {
          this.savePendingQuestionOps({ upserts: {}, deletes: {} });
          res = { success: true, count: validList.length };
        }
      }

      if (!res) {
        if (!this.questionTableMissing) {
          const { error } = await this.client
            .from('cbt_questions')
            .delete()
            .neq('question_key', '__NEVER_MATCH__');
          if (error && this.isMissingQuestionsTableError(error)) {
            this.questionTableMissing = true;
          }
        }

        await this.client
          .from('cbt_exam_results')
          .delete()
          .eq('student_nisn', '__CBT_QUESTION_ROW__');

        res = await this.upsertQuestionRows(validList, { skipMigrationCheck: true, skipPendingMark: true });
      }

      const legacyMirror = !this.securityRpcMissing
        ? validList.map(q => this.stripQuestionKeys(q))
        : validList;
      await this.pushStateKey('cbt_questions', legacyMirror);
      await this.markQuestionsMigrationDoneRemote();
      return res;
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async flushPendingQuestionOps() {
    if (!this.client || !this.isConnected) return false;
    if (this._flushPromise) return this._flushPromise;

    this._flushPromise = (async () => {
      try {
        const ops = this.loadPendingQuestionOps();
        const pendingUpserts = Object.values(ops.upserts || {});
        const pendingDeletes = Object.keys(ops.deletes || {});

        if (pendingUpserts.length === 0 && pendingDeletes.length === 0) return true;

        if (pendingUpserts.length > 0) {
          await this.upsertQuestionRows(pendingUpserts, { skipPendingMark: true });
        }
        for (const delKey of pendingDeletes) {
          await this.deleteQuestionRow(delKey);
        }
        return true;
      } finally {
        this._flushPromise = null;
      }
    })();

    return this._flushPromise;
  }

  async fetchAllQuestionRows(options = {}) {
    if (!this.client || !this.isConnected) {
      return { success: false, rows: [] };
    }

    const rowMap = new Map();
    const putRow = (qObj, updatedAtFallback = '') => {
      if (!qObj || typeof qObj !== 'object' || qObj.id === undefined || qObj.id === null) return false;
      const k = String(qObj.id);
      const prev = rowMap.get(k);
      const nextTs = String(qObj.updatedAt || updatedAtFallback || '');
      const prevTs = prev ? String(prev.updatedAt || '') : '';
      if (!prev || (!prevTs && nextTs) || (nextTs && nextTs >= prevTs)) {
        rowMap.set(k, updatedAtFallback && !qObj.updatedAt ? { ...qObj, updatedAt: updatedAtFallback } : qObj);
        return true;
      }
      return false;
    };

    try {
      const creds = this.getPrivilegedCredentials();
      if (creds && !this.securityRpcMissing) {
        const vaultRes = await this.fetchTeacherQuestionsRpc(creds.identifier, creds.pin);
        if (vaultRes && vaultRes.success && Array.isArray(vaultRes.rows)) {
          vaultRes.rows.forEach(q => putRow(q));
          if (rowMap.size > 0) {
            this.markQuestionsMigrationDoneLocal();
          }
          return {
            success: true,
            rows: this.sortQuestionsList(Array.from(rowMap.values())),
            source: 'cbt_question_vault'
          };
        }
      }

      let primaryOk = false;
      if (!this.questionTableMissing) {
        let from = 0;
        const PAGE = 1000;
        primaryOk = true;

        while (true) {
          const { data, error } = await this.client
            .from('cbt_questions')
            .select('question_key, updated_at, raw_data')
            .range(from, from + PAGE - 1);

          if (error) {
            if (this.isMissingQuestionsTableError(error)) {
              this.questionTableMissing = true;
            }
            primaryOk = false;
            break;
          }

          if (Array.isArray(data)) {
            data.forEach(r => {
              if (r && r.raw_data && typeof r.raw_data === 'object') {
                putRow(r.raw_data, r.updated_at || '');
              }
            });
          }
          if (!Array.isArray(data) || data.length < PAGE) break;
          from += PAGE;
        }
      }

      // Selalu cek baris cadangan __CBT_QUESTION_ROW__ agar tidak ada soal guru lain yang tertinggal saat masa transisi tabel
      const fallbackToPromote = [];
      let fbFrom = 0;
      const FB_PAGE = 1000;
      let fbOk = true;
      while (true) {
        const { data: fbData, error: fbErr } = await this.client
          .from('cbt_exam_results')
          .select('exam_title, completed_at, raw_data, id')
          .eq('student_nisn', '__CBT_QUESTION_ROW__')
          .order('id', { ascending: false })
          .range(fbFrom, fbFrom + FB_PAGE - 1);

        if (fbErr || !Array.isArray(fbData)) {
          if (fbErr) fbOk = false;
          break;
        }
        fbData.forEach(r => {
          if (r && r.raw_data && typeof r.raw_data === 'object') {
            const updated = putRow(r.raw_data, r.completed_at || '');
            if (primaryOk && updated) {
              fallbackToPromote.push(rowMap.get(String(r.raw_data.id)));
            }
          }
        });
        if (fbData.length < FB_PAGE) break;
        fbFrom += FB_PAGE;
      }

      if (!primaryOk && !fbOk) {
        return { success: false, rows: [] };
      }

      // Jika tabel cbt_questions sudah aktif dan ada sisa soal di fallback, promosikan otomatis ke cbt_questions
      if (primaryOk && !this.questionTableMissing && fallbackToPromote.length > 0 && creds) {
        try {
          const promotePayloads = fallbackToPromote.map(q => this.buildQuestionRowPayload(q));
          const { error: promErr } = await this.client
            .from('cbt_questions')
            .upsert(promotePayloads, { onConflict: 'question_key' });
          if (!promErr) {
            await this.client
              .from('cbt_exam_results')
              .delete()
              .eq('student_nisn', '__CBT_QUESTION_ROW__')
              .in('exam_title', promotePayloads.map(p => p.question_key));
          }
        } catch (e) {}
      }

      if (rowMap.size > 0) {
        this.markQuestionsMigrationDoneLocal();
      }

      let rows = this.sortQuestionsList(Array.from(rowMap.values()));
      if (!creds && options.stripKeys) {
        rows = rows.map(q => this.stripQuestionKeys(q));
      }

      return {
        success: true,
        rows,
        source: this.questionTableMissing ? 'fallback_rows' : 'cbt_questions'
      };
    } catch (err) {
      console.warn('Gagal fetchAllQuestionRows:', err);
      return { success: false, rows: [] };
    }
  }

  // Ambil daftar guru/siswa ke memori sementara HANYA saat fallback login (ketika RPC v3.38 belum aktif)
  async pullAuthDirectoryFallback() {
    if (!this.client || !this.isConnected) {
      return { success: false, state: {} };
    }
    const dirMap = {};
    const targetKeys = ['cbt_teachers_list', 'cbt_students_list', 'cbt_config'];
    try {
      if (!this.stateTableMissing) {
        const { data, error } = await this.client
          .from('cbt_school_state')
          .select('key, value')
          .in('key', targetKeys);
        if (!error && Array.isArray(data)) {
          data.forEach(row => {
            if (row && row.key && row.value !== undefined && row.value !== null) {
              dirMap[row.key] = row.value;
            }
          });
        } else if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        }
      }

      if (Object.keys(dirMap).length === 0) {
        const { data: fbData, error: fbError } = await this.client
          .from('cbt_exam_results')
          .select('student_name, raw_data, id')
          .eq('student_nisn', '__CBT_STATE__')
          .in('student_name', targetKeys)
          .order('id', { ascending: false });
        if (!fbError && Array.isArray(fbData)) {
          fbData.forEach(row => {
            if (row && row.student_name && row.raw_data !== undefined && dirMap[row.student_name] === undefined) {
              dirMap[row.student_name] = row.raw_data;
            }
          });
        }
      }
      return { success: true, state: dirMap };
    } catch (e) {
      return { success: false, state: {} };
    }
  }

  async checkActiveDeviceSessionConflict(nisn, subject, deviceId) {
    if (!this.client || !this.isConnected || !nisn || !subject) {
      return { conflict: false };
    }
    const sessionKey = this.buildSessionKey(nisn, subject);
    const maxStaleMs = 120000;
    try {
      let rowObj = null;
      if (!this.sessionTableMissing) {
        const { data, error } = await this.client
          .from('cbt_student_sessions')
          .select('*')
          .eq('session_key', sessionKey)
          .limit(1);
        if (!error && Array.isArray(data) && data[0]) {
          rowObj = data[0].raw_data && typeof data[0].raw_data === 'object'
            ? { ...data[0].raw_data, status: data[0].status, updatedAt: data[0].updated_at || data[0].raw_data.updatedAt }
            : { status: data[0].status, updatedAt: data[0].updated_at };
        } else if (this.isMissingSessionTableError(error)) {
          this.sessionTableMissing = true;
        }
      }

      if (!rowObj && this.sessionTableMissing) {
        const { data: fbData } = await this.client
          .from('cbt_exam_results')
          .select('finish_reason, completed_at, raw_data')
          .eq('exam_title', '__CBT_LIVE_SESSION__')
          .eq('student_nisn', String(nisn).trim())
          .eq('subject', String(subject).trim())
          .order('id', { ascending: false })
          .limit(1);
        if (Array.isArray(fbData) && fbData[0]) {
          rowObj = fbData[0].raw_data && typeof fbData[0].raw_data === 'object'
            ? fbData[0].raw_data
            : { status: fbData[0].finish_reason, updatedAt: fbData[0].completed_at };
        }
      }

      if (!rowObj || rowObj.status !== 'in_progress') return { conflict: false };
      const remoteDevice = String(rowObj.deviceId || '').trim();
      const updatedMs = Date.parse(rowObj.updatedAt || '');
      if (remoteDevice && deviceId && remoteDevice !== String(deviceId).trim() && Number.isFinite(updatedMs)) {
        if ((Date.now() - updatedMs) < maxStaleMs) {
          return { conflict: true, session: rowObj };
        }
      }
      return { conflict: false };
    } catch (e) {
      return { conflict: false };
    }
  }

  // Kirim seluruh data sekolah dari perangkat saat ini ke Cloud Supabase (tanpa menimpa soal guru lain atau menghidupkan soal yang sudah dihapus)
  async pushAllSchoolState() {
    if (!this.client || !this.isConnected) {
      return { success: false, message: "Supabase Cloud belum terhubung." };
    }

    await this.flushPendingQuestionOps();

    let mergedQuestions = window.examEngine ? [...window.examEngine.questions] : [];
    const remoteQ = await this.fetchAllQuestionRows();
    const alreadyMigrated = remoteQ && remoteQ.success && (remoteQ.rows.length > 0 || await this.isQuestionsMigrationCompleted());

    if (alreadyMigrated) {
      // Gunakan bank soal Cloud sebagai sumber kebenaran + overlay antrean lokal yang belum terkirim
      mergedQuestions = this.applyPendingQuestionOverlay(remoteQ.rows);
      if (window.examEngine) {
        const prevSig = JSON.stringify((window.examEngine.questions || []).map(q => [q.id, q.updatedAt || '']));
        const nextSig = JSON.stringify(mergedQuestions.map(q => [q.id, q.updatedAt || '']));
        if (prevSig !== nextSig) {
          window.examEngine.saveQuestions(mergedQuestions, true);
        }
      }
    }

    const isSuperAdmin = Boolean(
      typeof window !== 'undefined' &&
      window.cbtAdmin &&
      typeof window.cbtAdmin.isSuperAdminUser === 'function' &&
      window.cbtAdmin.isSuperAdminUser()
    );

    const entries = [
      ['cbt_config', window.examEngine ? window.examEngine.config : null],
      ['cbt_school_config', window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : null],
      ['cbt_exam_schedules', window.cbtAdmin ? window.cbtAdmin.schedules : null]
    ];

    if (isSuperAdmin) {
      if (window.studentManager) {
        entries.push(['cbt_students_list', window.studentManager.getAllStudents()]);
      }
      if (window.cbtAdmin) {
        entries.push(['cbt_teachers_list', window.cbtAdmin.getAllTeachers()]);
      }
    }

    const validEntries = entries.filter(([, val]) => val !== null && val !== undefined);

    let pushed = 0;
    const legacyMirror = !this.securityRpcMissing
      ? mergedQuestions.map(q => this.stripQuestionKeys(q))
      : mergedQuestions;

    if (mergedQuestions.length > 0) {
      const qPush = await this.upsertQuestionRows(mergedQuestions, { skipMigrationCheck: true, skipPendingMark: true });
      await this.pushStateKey('cbt_questions', legacyMirror);
      await this.markQuestionsMigrationDoneRemote();
      if (qPush && qPush.success) pushed++;
    } else if (alreadyMigrated) {
      await this.pushStateKey('cbt_questions', []);
      await this.markQuestionsMigrationDoneRemote();
      pushed++;
    }

    for (const [k, v] of validEntries) {
      const res = await this.pushStateKey(k, v);
      if (res && res.success) pushed++;
    }
    return { success: pushed > 0, count: pushed };
  }

  // Ambil seluruh pengaturan, jadwal, soal, data siswa & guru terbaru dari Cloud Supabase
  // options.publicOnly = true: khusus layar login / siswa agar PIN guru, password 250 siswa & kunci soal tidak terbaca di browser siswa
  async pullAllSchoolState(options = {}) {
    if (!this.client || !this.isConnected) {
      return { success: false, state: {} };
    }

    const publicOnly = Boolean(options && options.publicOnly);
    const stateMap = {};

    try {
      await this.flushPendingQuestionOps();

      if (publicOnly && !this.tokenRpcMissing) {
        const pubRes = await this.getPublicExamConfigRpc();
        if (pubRes && pubRes.success && pubRes.state && typeof pubRes.state === 'object') {
          Object.entries(pubRes.state).forEach(([k, v]) => {
            if (v !== undefined && v !== null) {
              stateMap[k] = this.stripSensitiveStateFields(k, v);
            }
          });
        }
      }

      if (Object.keys(stateMap).length === 0 && !this.stateTableMissing) {
        let query = this.client.from('cbt_school_state').select('key, value');
        if (publicOnly) {
          query = query.in('key', this.PUBLIC_STATE_KEYS);
        }
        const { data, error } = await query;

        if (!error && Array.isArray(data)) {
          data.forEach(row => {
            if (row && row.key && row.value !== undefined && row.value !== null) {
              stateMap[row.key] = publicOnly ? this.stripSensitiveStateFields(row.key, row.value) : row.value;
            }
          });
        } else if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        }
      }

      if (Object.keys(stateMap).length === 0) {
        // Fallback otomatis dari tabel cbt_exam_results
        let fbQuery = this.client
          .from('cbt_exam_results')
          .select('student_name, raw_data, id')
          .eq('student_nisn', '__CBT_STATE__')
          .neq('exam_title', '__CBT_LIVE_SESSION__');
        if (publicOnly) {
          fbQuery = fbQuery.in('student_name', this.PUBLIC_STATE_KEYS);
        }
        const { data: fbData, error: fbError } = await fbQuery.order('id', { ascending: false });

        if (!fbError && Array.isArray(fbData)) {
          fbData.forEach(row => {
            if (row && row.student_name && row.raw_data !== undefined && stateMap[row.student_name] === undefined) {
              stateMap[row.student_name] = publicOnly
                ? this.stripSensitiveStateFields(row.student_name, row.raw_data)
                : row.raw_data;
            }
          });
        }
      }

      // Jika Admin/Guru/Pengawas terautentikasi (publicOnly = false), isi token dari Brankas Server
      if (!publicOnly) {
        const creds = this.getPrivilegedCredentials();
        if (creds && !this.tokenRpcMissing) {
          const vaultTok = await this.fetchTokenVaultRpc(creds.identifier, creds.pin);
          if (vaultTok && vaultTok.success && !vaultTok.rpcUnavailable) {
            if (vaultTok.configToken && stateMap.cbt_config && typeof stateMap.cbt_config === 'object') {
              stateMap.cbt_config = { ...stateMap.cbt_config, examToken: vaultTok.configToken };
            }
            if (vaultTok.scheduleTokens && typeof vaultTok.scheduleTokens === 'object' && Array.isArray(stateMap.cbt_exam_schedules)) {
              stateMap.cbt_exam_schedules = stateMap.cbt_exam_schedules.map(sch => {
                if (!sch || typeof sch !== 'object') return sch;
                const serverTok = vaultTok.scheduleTokens[String(sch.id || '')];
                return serverTok ? { ...sch, token: serverTok } : sch;
              });
            }
          }
        }
      } else {
        // Sabuk pengaman ekstra: pastikan mode publik/siswa tidak pernah membawa token ke browser
        if (stateMap.cbt_config) stateMap.cbt_config = this.stripSensitiveStateFields('cbt_config', stateMap.cbt_config);
        if (stateMap.cbt_exam_schedules) stateMap.cbt_exam_schedules = this.stripSensitiveStateFields('cbt_exam_schedules', stateMap.cbt_exam_schedules);
      }

      // Ambil soal per-baris dari cbt_questions / brankas soal guru
      const qRes = await this.fetchAllQuestionRows();
      const hasMigrated = qRes && qRes.success && (qRes.rows.length > 0 || await this.isQuestionsMigrationCompleted());

      if (hasMigrated) {
        stateMap.cbt_questions = qRes.rows;
        stateMap.cbt_questions_migrated = true;
      } else if (!publicOnly && Array.isArray(stateMap.cbt_questions) && stateMap.cbt_questions.length > 0) {
        // Auto-migrasi dari penyimpanan lama 1-JSON ke per-baris (hanya oleh staf terautentikasi)
        await this.upsertQuestionRows(stateMap.cbt_questions, { skipMigrationCheck: true, skipPendingMark: true });
        await this.markQuestionsMigrationDoneRemote();
        stateMap.cbt_questions_migrated = true;
      }

      return { success: true, state: stateMap };
    } catch (err) {
      console.warn("Gagal pullAllSchoolState:", err);
      return { success: false, state: stateMap };
    }
  }

  isMissingSessionTableError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      (msg.includes('cbt_student_sessions') && (msg.includes('does not exist') || msg.includes('not find the table') || msg.includes('schema cache')))
    );
  }

  buildSessionKey(nisn, subject) {
    const n = String(nisn || '').trim().toUpperCase();
    const s = String(subject || '').trim().toLowerCase();
    return `${n}__${s}`;
  }

  saveLocalStudentSession(sessionObj) {
    if (!sessionObj || !sessionObj.nisn) return;
    try {
      const key = this.buildSessionKey(sessionObj.nisn, sessionObj.subject);
      const list = JSON.parse(localStorage.getItem('cbt_local_student_sessions') || '[]');
      const filtered = Array.isArray(list) ? list.filter(x => this.buildSessionKey(x.nisn, x.subject) !== key) : [];
      filtered.unshift({ ...sessionObj, sessionKey: key });
      localStorage.setItem('cbt_local_student_sessions', JSON.stringify(filtered.slice(0, 500)));
    } catch (e) {}
  }

  removeLocalStudentSession(nisn, subject) {
    try {
      const key = this.buildSessionKey(nisn, subject);
      const list = JSON.parse(localStorage.getItem('cbt_local_student_sessions') || '[]');
      const filtered = Array.isArray(list) ? list.filter(x => this.buildSessionKey(x.nisn, x.subject) !== key) : [];
      localStorage.setItem('cbt_local_student_sessions', JSON.stringify(filtered));
    } catch (e) {}
  }

  getLocalStudentSessions() {
    try {
      const list = JSON.parse(localStorage.getItem('cbt_local_student_sessions') || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  // Kirim status login / sedang mengerjakan / selesai siswa secara real-time
  async upsertStudentSession(sessionObj) {
    if (!sessionObj || !sessionObj.nisn) return { success: false };
    const sessionKey = this.buildSessionKey(sessionObj.nisn, sessionObj.subject);
    const enriched = {
      ...sessionObj,
      sessionKey,
      updatedAt: sessionObj.updatedAt || new Date().toISOString()
    };
    this.saveLocalStudentSession(enriched);

    if (!this.client || !this.isConnected) return { success: true, localOnly: true };

    try {
      if (!this.sessionTableMissing) {
        const { error } = await this.client
          .from('cbt_student_sessions')
          .upsert({
            session_key: sessionKey,
            student_nisn: String(enriched.nisn || ''),
            student_name: String(enriched.name || '-'),
            student_class: String(enriched.class || 'Umum'),
            subject: String(enriched.subject || ''),
            status: String(enriched.status || 'logged_in'),
            attempt_number: parseInt(enriched.attemptNumber, 10) || 1,
            answered_count: parseInt(enriched.answeredCount, 10) || 0,
            total_questions: parseInt(enriched.totalQuestions, 10) || 0,
            remaining_seconds: parseInt(enriched.remainingSeconds, 10) || 0,
            cheat_count: parseInt(enriched.cheatCount, 10) || 0,
            final_score: enriched.finalScore !== undefined ? enriched.finalScore : null,
            login_at: enriched.loginAt || enriched.updatedAt,
            started_at: enriched.startedAt || null,
            completed_at: enriched.completedAt || null,
            updated_at: enriched.updatedAt,
            raw_data: enriched
          }, { onConflict: 'session_key' });

        if (!error) return { success: true };
        if (this.isMissingSessionTableError(error)) {
          this.sessionTableMissing = true;
        }
      }

      // Fallback otomatis via cbt_exam_results (tidak perlu buat tabel tambahan)
      await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('exam_title', '__CBT_LIVE_SESSION__')
        .eq('student_nisn', String(enriched.nisn || ''))
        .eq('subject', String(enriched.subject || ''));

      const { error: fbErr } = await this.client
        .from('cbt_exam_results')
        .insert([{
          student_name: String(enriched.name || '-'),
          student_nisn: String(enriched.nisn || ''),
          student_class: String(enriched.class || 'Umum'),
          exam_title: '__CBT_LIVE_SESSION__',
          subject: String(enriched.subject || ''),
          final_score: enriched.finalScore !== undefined && enriched.finalScore !== null ? enriched.finalScore : 0,
          correct_count: parseInt(enriched.answeredCount, 10) || 0,
          incorrect_count: 0,
          unattempted_count: 0,
          total_questions: parseInt(enriched.totalQuestions, 10) || 0,
          cheat_count: parseInt(enriched.cheatCount, 10) || 0,
          completed_at: String(enriched.updatedAt || new Date().toISOString()),
          finish_reason: String(enriched.status || 'logged_in'),
          raw_data: enriched
        }]);

      return { success: !fbErr };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async removeStudentSession(nisn, subject) {
    if (!nisn) return { success: false };
    this.removeLocalStudentSession(nisn, subject);
    if (!this.client || !this.isConnected) return { success: true, localOnly: true };

    const sessionKey = this.buildSessionKey(nisn, subject);
    try {
      if (!this.sessionTableMissing) {
        await this.client
          .from('cbt_student_sessions')
          .delete()
          .eq('session_key', sessionKey);
      }
      await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('exam_title', '__CBT_LIVE_SESSION__')
        .eq('student_nisn', String(nisn).trim())
        .eq('subject', String(subject || '').trim());
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async fetchStudentSessions() {
    const localList = this.getLocalStudentSessions();
    if (!this.client || !this.isConnected) {
      return { success: false, data: localList };
    }

    const sessionMap = new Map();
    const putSession = (item) => {
      if (!item || !item.nisn) return;
      const k = this.buildSessionKey(item.nisn, item.subject);
      const prev = sessionMap.get(k);
      if (!prev || String(item.updatedAt || '') >= String(prev.updatedAt || '')) {
        sessionMap.set(k, { ...item, sessionKey: k });
      }
    };

    try {
      let fetchedFromPrimary = false;
      if (!this.sessionTableMissing) {
        const { data, error } = await this.client
          .from('cbt_student_sessions')
          .select('*')
          .order('updated_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          fetchedFromPrimary = true;
          data.forEach(row => {
            const obj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              nisn: row.student_nisn,
              name: row.student_name,
              class: row.student_class,
              subject: row.subject,
              status: row.status,
              attemptNumber: row.attempt_number,
              answeredCount: row.answered_count,
              totalQuestions: row.total_questions,
              remainingSeconds: row.remaining_seconds,
              cheatCount: row.cheat_count,
              finalScore: row.final_score,
              loginAt: row.login_at,
              startedAt: row.started_at,
              completedAt: row.completed_at,
              updatedAt: row.updated_at
            };
            putSession(obj);
          });
        } else if (this.isMissingSessionTableError(error)) {
          this.sessionTableMissing = true;
        }
      }

      if (!fetchedFromPrimary) {
        const { data: fbData, error: fbErr } = await this.client
          .from('cbt_exam_results')
          .select('*')
          .eq('exam_title', '__CBT_LIVE_SESSION__')
          .order('id', { ascending: false });

        if (!fbErr && Array.isArray(fbData)) {
          fbData.forEach(row => {
            const obj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              nisn: row.student_nisn,
              name: row.student_name,
              class: row.student_class,
              subject: row.subject,
              status: row.finish_reason || 'logged_in',
              answeredCount: row.correct_count || 0,
              totalQuestions: row.total_questions || 0,
              cheatCount: row.cheat_count || 0,
              updatedAt: row.completed_at
            };
            putSession(obj);
          });
        }
      }

      localList.forEach(putSession);
      return { success: true, data: Array.from(sessionMap.values()) };
    } catch (err) {
      return { success: false, data: localList, message: err.message };
    }
  }

  _getDeletedResultSignatures() {
    try {
      const raw = JSON.parse(localStorage.getItem('cbt_deleted_result_sigs') || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch (e) {
      return new Set();
    }
  }

  _addDeletedResultSignatures(sigs = []) {
    try {
      const set = this._getDeletedResultSignatures();
      sigs.forEach(s => { if (s) set.add(String(s)); });
      localStorage.setItem('cbt_deleted_result_sigs', JSON.stringify(Array.from(set).slice(-500)));
    } catch (e) {}
  }

  _buildResultSignature(rec) {
    if (!rec) return '';
    if (rec._cloudRowId !== undefined && rec._cloudRowId !== null) return `ROW:${rec._cloudRowId}`;
    const nisn = String(rec.student?.nisn || rec.student_nisn || '').trim().toUpperCase();
    const subj = String(rec.subject || '').trim().toLowerCase();
    const comp = String(rec.completedAt || rec.completed_at || '').trim();
    const idStr = String(rec.id || '').trim();
    return `${idStr}__${nisn}__${subj}__${comp}`;
  }

  async deleteSingleResultFromCloud(resultRecord) {
    if (!resultRecord) return { success: false };
    const sig = this._buildResultSignature(resultRecord);
    if (sig) this._addDeletedResultSignatures([sig]);

    if (!this.client || !this.isConnected) {
      return { success: true, offlineQueued: true };
    }

    try {
      let deletedCount = 0;
      if (resultRecord._cloudRowId !== undefined && resultRecord._cloudRowId !== null) {
        const { error } = await this.client
          .from('cbt_exam_results')
          .delete()
          .eq('id', resultRecord._cloudRowId);
        if (!error) deletedCount += 1;
      }

      const nisn = String(resultRecord.student?.nisn || resultRecord.student_nisn || '').trim();
      const subj = String(resultRecord.subject || '').trim();
      const compAt = String(resultRecord.completedAt || resultRecord.completed_at || '').trim();

      if (nisn && nisn !== '__CBT_STATE__' && nisn !== '__CBT_QUESTION_ROW__') {
        let q = this.client
          .from('cbt_exam_results')
          .delete()
          .eq('student_nisn', nisn)
          .neq('exam_title', '__CBT_LIVE_SESSION__');
        if (subj) q = q.eq('subject', subj);
        if (compAt) q = q.eq('completed_at', compAt);
        const { error: qErr } = await q;
        if (!qErr) deletedCount += 1;
      }

      if (nisn && subj) {
        const sessKey = `${nisn.toUpperCase()}__${subj.toLowerCase()}`;
        await this.client
          .from('cbt_student_sessions')
          .delete()
          .eq('session_key', sessKey)
          .eq('status', 'completed');
      }

      return { success: true, deletedCount };
    } catch (err) {
      console.warn('Gagal hapus hasil tunggal di cloud:', err);
      return { success: false, message: err.message };
    }
  }

  async deleteAllResultsFromCloud(targetRecords = null) {
    if (Array.isArray(targetRecords) && targetRecords.length > 0) {
      const sigs = targetRecords.map(r => this._buildResultSignature(r)).filter(Boolean);
      this._addDeletedResultSignatures(sigs);
    }

    if (!this.client || !this.isConnected) {
      return { success: true, offlineOnly: true };
    }

    try {
      if (Array.isArray(targetRecords) && targetRecords.length > 0) {
        const rowIds = targetRecords
          .map(r => r._cloudRowId)
          .filter(id => id !== undefined && id !== null && id !== '');
        if (rowIds.length > 0) {
          for (let i = 0; i < rowIds.length; i += 100) {
            const chunk = rowIds.slice(i, i + 100);
            await this.client.from('cbt_exam_results').delete().in('id', chunk);
          }
        }
        // Fallback hapus berdasarkan NISN + Subject + CompletedAt jika _cloudRowId belum ada
        const withoutRowId = targetRecords.filter(r => r._cloudRowId === undefined || r._cloudRowId === null);
        for (const rec of withoutRowId) {
          const nisn = String(rec.student?.nisn || rec.student_nisn || '').trim();
          const subj = String(rec.subject || '').trim();
          const compAt = String(rec.completedAt || rec.completed_at || '').trim();
          if (nisn && nisn !== '__CBT_STATE__' && nisn !== '__CBT_QUESTION_ROW__') {
            let q = this.client
              .from('cbt_exam_results')
              .delete()
              .eq('student_nisn', nisn)
              .neq('exam_title', '__CBT_LIVE_SESSION__');
            if (subj) q = q.eq('subject', subj);
            if (compAt) q = q.eq('completed_at', compAt);
            await q;
          }
        }
        // Bersihkan sesi completed yang terkait agar siswa dapat ikut ulang bila diperlukan & monitoring bersih
        const sessKeys = [...new Set(targetRecords.map(r => {
          const n = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
          const s = String(r.subject || '').trim().toLowerCase();
          return (n && s) ? `${n}__${s}` : '';
        }).filter(Boolean))];
        for (let i = 0; i < sessKeys.length; i += 100) {
          const chunk = sessKeys.slice(i, i + 100);
          await this.client
            .from('cbt_student_sessions')
            .delete()
            .in('session_key', chunk)
            .eq('status', 'completed');
        }
      } else {
        // Hapus seluruh hasil ujian asli di cbt_exam_results (pertahankan row __CBT_STATE__, __CBT_QUESTION_ROW__, __CBT_LIVE_SESSION__)
        await this.client
          .from('cbt_exam_results')
          .delete()
          .neq('student_nisn', '__CBT_STATE__')
          .neq('student_nisn', '__CBT_QUESTION_ROW__')
          .neq('exam_title', '__CBT_LIVE_SESSION__');

        await this.client
          .from('cbt_student_sessions')
          .delete()
          .eq('status', 'completed');
      }
      return { success: true };
    } catch (err) {
      console.warn('Gagal hapus hasil di cloud:', err);
      return { success: false, message: err.message };
    }
  }

  async fetchStudentAttemptsFromCloud(nisn) {
    if (!this.client || !this.isConnected || !nisn) return [];
    try {
      const { data, error } = await this.client
        .from('cbt_exam_results')
        .select('id, student_name, student_nisn, student_class, exam_title, subject, completed_at')
        .eq('student_nisn', String(nisn).trim())
        .neq('exam_title', '__CBT_LIVE_SESSION__');

      if (error || !Array.isArray(data)) return [];
      const deletedSigs = this._getDeletedResultSignatures();
      return data
        .filter(row => row.student_nisn !== '__CBT_STATE__' && row.student_nisn !== '__CBT_QUESTION_ROW__' && row.exam_title !== '__CBT_LIVE_SESSION__')
        .filter(row => !deletedSigs.has(`ROW:${row.id}`))
        .map(row => ({
          _cloudRowId: row.id,
          id: row.id,
          student: { name: row.student_name, nisn: row.student_nisn, class: row.student_class },
          subject: row.subject,
          completedAt: row.completed_at
        }));
    } catch (e) {
      return [];
    }
  }

  async deleteStudentResultsFromCloud(nisn, subject = null) {
    if (!this.client || !this.isConnected || !nisn) return { success: false };
    try {
      let query = this.client
        .from('cbt_exam_results')
        .delete()
        .eq('student_nisn', String(nisn).trim())
        .neq('exam_title', '__CBT_LIVE_SESSION__');
      if (subject) {
        query = query.eq('subject', String(subject).trim());
      }
      await query;
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Kirim Hasil Ujian Siswa ke Supabase Cloud
  async submitExamResult(resultRecord) {
    if (this.client && this.isConnected) {
      try {
        const payload = {
          student_name: resultRecord.student?.name || '-',
          student_nisn: resultRecord.student?.nisn || '-',
          student_class: resultRecord.student?.class || 'Umum',
          exam_title: resultRecord.examTitle,
          subject: resultRecord.subject,
          final_score: resultRecord.finalScore,
          correct_count: resultRecord.correctCount,
          incorrect_count: resultRecord.incorrectCount,
          unattempted_count: resultRecord.unattemptedCount,
          total_questions: resultRecord.totalQuestions,
          cheat_count: resultRecord.cheatCount || 0,
          completed_at: resultRecord.completedAt,
          finish_reason: resultRecord.finishReason,
          raw_data: resultRecord
        };

        const { error } = await this.client.from('cbt_exam_results').insert([payload]);
        if (error) {
          console.warn("Gagal simpan ke Supabase cloud (data tetap aman di lokal):", error);
        }
      } catch (err) {
        console.warn("Error kirim ke Supabase:", err);
      }
    }
  }

  async fetchCloudResults() {
    if (!this.client || !this.isConnected) {
      return { success: false, message: "Klien Supabase belum terhubung.", data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
    }

    try {
      const { data, error } = await this.client
        .from('cbt_exam_results')
        .select('*')
        .neq('student_nisn', '__CBT_STATE__')
        .neq('student_nisn', '__CBT_QUESTION_ROW__')
        .neq('exam_title', '__CBT_LIVE_SESSION__')
        .order('final_score', { ascending: false });

      if (error) {
        return { success: false, message: error.message, data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
      }

      const deletedSigs = this._getDeletedResultSignatures();
      const formatted = (data || [])
        .filter(row => row.student_nisn !== '__CBT_STATE__' && row.student_nisn !== '__CBT_QUESTION_ROW__' && row.exam_title !== '__CBT_LIVE_SESSION__')
        .map(row => {
          const base = row.raw_data && typeof row.raw_data === 'object'
            ? { ...row.raw_data }
            : {
                id: row.id,
                student: {
                  name: row.student_name,
                  nisn: row.student_nisn,
                  class: row.student_class
                },
                examTitle: row.exam_title,
                subject: row.subject,
                finalScore: row.final_score,
                correctCount: row.correct_count,
                incorrectCount: row.incorrect_count,
                unattemptedCount: row.unattempted_count,
                totalQuestions: row.total_questions,
                cheatCount: row.cheat_count,
                completedAt: row.completed_at,
                finishReason: row.finish_reason,
                detailedAnswers: []
              };
          base._cloudRowId = row.id;
          return base;
        })
        .filter(rec => {
          const sig = this._buildResultSignature(rec);
          return !deletedSigs.has(`ROW:${rec._cloudRowId}`) && (!sig || !deletedSigs.has(sig));
        });

      localStorage.setItem('cbt_exam_results', JSON.stringify(formatted));
      return { success: true, count: formatted.length, data: formatted };
    } catch (err) {
      return { success: false, message: err.message, data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
    }
  }

  // Subscribe ke Supabase Realtime (postgres_changes) untuk notifikasi instan pelanggaran, selesai ujian & perubahan soal per-baris
  subscribeToRealtimeNotifications(onSessionEvent, onResultEvent, onQuestionEvent) {
    this.unsubscribeRealtimeNotifications();
    if (!this.client || !this.isConnected || typeof this.client.channel !== 'function') {
      return null;
    }

    try {
      const channel = this.client
        .channel('cbt-admin-realtime-alerts-' + Date.now())
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cbt_student_sessions' },
          (payload) => {
            const row = payload && (payload.new || payload.record);
            if (!row || !row.student_nisn) return;
            const sessionObj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              nisn: row.student_nisn,
              name: row.student_name,
              class: row.student_class,
              subject: row.subject,
              status: row.status,
              attemptNumber: row.attempt_number,
              answeredCount: row.answered_count,
              totalQuestions: row.total_questions,
              remainingSeconds: row.remaining_seconds,
              cheatCount: row.cheat_count,
              finalScore: row.final_score,
              completedAt: row.completed_at,
              updatedAt: row.updated_at
            };
            if (typeof onSessionEvent === 'function') {
              onSessionEvent(sessionObj);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cbt_questions' },
          (payload) => {
            if (typeof onQuestionEvent === 'function') {
              onQuestionEvent(payload);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'cbt_exam_results' },
          (payload) => {
            const row = payload && payload.new;
            if (!row || row.student_nisn === '__CBT_STATE__') return;

            if (row.student_nisn === '__CBT_QUESTION_ROW__') {
              if (typeof onQuestionEvent === 'function') {
                onQuestionEvent(payload);
              }
              return;
            }

            if (row.exam_title === '__CBT_LIVE_SESSION__') {
              const sessionObj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
                nisn: row.student_nisn,
                name: row.student_name,
                class: row.student_class,
                subject: row.subject,
                status: row.finish_reason || 'logged_in',
                answeredCount: row.correct_count || 0,
                totalQuestions: row.total_questions || 0,
                cheatCount: row.cheat_count || 0,
                finalScore: row.final_score,
                updatedAt: row.completed_at
              };
              if (typeof onSessionEvent === 'function') {
                onSessionEvent(sessionObj);
              }
              return;
            }

            const resultObj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              id: row.id,
              student: {
                name: row.student_name,
                nisn: row.student_nisn,
                class: row.student_class
              },
              examTitle: row.exam_title,
              subject: row.subject,
              finalScore: row.final_score,
              cheatCount: row.cheat_count || 0,
              completedAt: row.completed_at,
              finishReason: row.finish_reason
            };
            if (typeof onResultEvent === 'function') {
              onResultEvent(resultObj);
            }
          }
        );

      channel.subscribe();
      this.realtimeChannel = channel;
      return channel;
    } catch (err) {
      console.warn('Supabase Realtime channel tidak tersedia, menggunakan polling sinkronisasi:', err);
      return null;
    }
  }

  unsubscribeRealtimeNotifications() {
    if (this.realtimeChannel && this.client && typeof this.client.removeChannel === 'function') {
      try {
        this.client.removeChannel(this.realtimeChannel);
      } catch (e) {}
    }
    this.realtimeChannel = null;
  }
}

if (typeof window !== 'undefined') {
  window.supabaseSync = new SupabaseSyncManager();
}
