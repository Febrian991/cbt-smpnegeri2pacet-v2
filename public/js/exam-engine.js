// CBT Engine v3.38: Timer Monotonik, Anti Tab-Switch & Anti-Tamper, Penilaian Aman Multi-Format

const _CBT_ENGINE_SALT = 'SMPN2PACET_CBT_V338';
const _CBT_KV_SESSION_KEY = 'cbt_exam_kv_seal';
const _CBT_DEVICE_ID_KEY = 'cbt_device_tab_id';
const _CBT_OFFLINE_VAULT_KEY = 'cbt_offline_vault_v1';
const _CBT_OFFLINE_VAULT_HDR = 'CBT_VAULT_V1:';

const _questionKeyVault = new Map();
let _fallbackDeviceId = null;

function _hasStaffSessionToken() {
  try {
    if (typeof window !== 'undefined' && window.cbtAdmin && typeof window.cbtAdmin.isAuthenticated === 'boolean') {
      return window.cbtAdmin.isAuthenticated && Boolean(window.cbtAdmin.getCurrentTeacher && window.cbtAdmin.getCurrentTeacher());
    }
    const raw = localStorage.getItem('cbt_logged_teacher_session') || sessionStorage.getItem('cbt_logged_teacher');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && parsed.id);
  } catch (e) {
    return false;
  }
}

function _getOrCreateDeviceId() {
  try {
    let existing = sessionStorage.getItem(_CBT_DEVICE_ID_KEY);
    if (existing && existing.trim()) return existing.trim();
    existing = 'DEV_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
    sessionStorage.setItem(_CBT_DEVICE_ID_KEY, existing);
    return existing;
  } catch (e) {
    if (!_fallbackDeviceId) {
      _fallbackDeviceId = 'DEV_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }
    return _fallbackDeviceId;
  }
}

function _xorEncode(obj, hdr) {
  try {
    const jsonStr = JSON.stringify(obj);
    let rawBytes;
    if (typeof TextEncoder !== 'undefined') {
      rawBytes = new TextEncoder().encode(jsonStr);
    } else {
      const binStr = unescape(encodeURIComponent(jsonStr));
      rawBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) rawBytes[i] = binStr.charCodeAt(i);
    }
    let out = '';
    for (let i = 0; i < rawBytes.length; i++) {
      out += String.fromCharCode(rawBytes[i] ^ _CBT_ENGINE_SALT.charCodeAt(i % _CBT_ENGINE_SALT.length));
    }
    return hdr + btoa(out);
  } catch (e) {
    return null;
  }
}

function _xorDecode(raw, hdr) {
  try {
    if (!raw || typeof raw !== 'string' || !raw.startsWith(hdr)) return null;
    const bin = atob(raw.slice(hdr.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i) ^ _CBT_ENGINE_SALT.charCodeAt(i % _CBT_ENGINE_SALT.length);
    }
    let jsonStr = '';
    if (typeof TextDecoder !== 'undefined') {
      jsonStr = new TextDecoder().decode(bytes);
    } else {
      jsonStr = decodeURIComponent(escape(Array.from(bytes).map(b => String.fromCharCode(b)).join('')));
    }
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function _questionHasKeyMaterial(q) {
  if (!q || typeof q !== 'object') return false;
  if (q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '') return true;
  if (Array.isArray(q.statements) && q.statements.some(s => s && s.correct !== undefined && s.correct !== null && s.correct !== '')) {
    return true;
  }
  return false;
}

function _stashQuestionKey(q) {
  if (!q || q.id === undefined || q.id === null) return;
  if (!_questionHasKeyMaterial(q)) return;
  const entry = {
    type: q.type || 'single',
    weight: q.weight || 10,
    correctAnswer: Array.isArray(q.correctAnswer) ? [...q.correctAnswer] : q.correctAnswer
  };
  if (Array.isArray(q.statements)) {
    entry.statements = q.statements.map(s => ({
      id: s && s.id !== undefined ? s.id : '',
      correct: s && s.correct !== undefined ? s.correct : undefined
    }));
  }
  _questionKeyVault.set(String(q.id), entry);
}

function _sealKvToSession(questionsList) {
  try {
    const bag = {};
    let count = 0;
    (Array.isArray(questionsList) ? questionsList : []).forEach(q => {
      if (!q || q.id === undefined || q.id === null) return;
      const k = String(q.id);
      const v = _questionKeyVault.get(k);
      if (v) {
        bag[k] = v;
        count++;
      } else if (_questionHasKeyMaterial(q)) {
        _stashQuestionKey(q);
        bag[k] = _questionKeyVault.get(k);
        count++;
      }
    });
    if (count > 0) {
      const sealed = _xorEncode(bag, 'CBT_KV_V1:');
      if (sealed) sessionStorage.setItem(_CBT_KV_SESSION_KEY, sealed);
    }
  } catch (e) {}
}

function _unsealKvFromSession() {
  try {
    const raw = sessionStorage.getItem(_CBT_KV_SESSION_KEY);
    if (!raw) return;
    const bag = _xorDecode(raw, 'CBT_KV_V1:');
    if (!bag) return;
    Object.keys(bag).forEach(k => {
      if (!_questionKeyVault.has(k) && bag[k]) {
        _questionKeyVault.set(k, bag[k]);
      }
    });
  } catch (e) {}
}

function _clearKvSeal() {
  try {
    sessionStorage.removeItem(_CBT_KV_SESSION_KEY);
  } catch (e) {}
}

function _computeSessionSig(data) {
  try {
    const canonical = [
      String(data?.student?.nisn || ''),
      String(data?.startedAtIso || ''),
      String(data?.startedAtMs || 0),
      String(data?.durationSeconds || 0),
      String(data?.deadlineEpochMs || 0),
      String(data?.attemptNumber || 1),
      String(data?.remainingSeconds || 0),
      String(data?.cheatCount || 0),
      JSON.stringify(data?.answers || {}),
      _CBT_ENGINE_SALT
    ].join('|');

    let h1 = 2166136261;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < canonical.length; i++) {
      const ch = canonical.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 16777619);
      h2 = Math.imul(h2 ^ ch, 0x85ebca6b) >>> 0;
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  } catch (e) {
    return '';
  }
}

function _appendOfflineResultToVault(resultRecord) {
  if (!resultRecord || !resultRecord.id) return;
  try {
    const existingRaw = localStorage.getItem(_CBT_OFFLINE_VAULT_KEY);
    const vault = (existingRaw ? _xorDecode(existingRaw, _CBT_OFFLINE_VAULT_HDR) : null) || {};
    const prevResults = Array.isArray(vault.results) ? vault.results : [];
    const nextResults = [resultRecord, ...prevResults.filter(r => r && String(r.id) !== String(resultRecord.id))];
    const updatedVault = {
      teachers: Array.isArray(vault.teachers) ? vault.teachers : [],
      students: Array.isArray(vault.students) ? vault.students : [],
      questions: Array.isArray(vault.questions) ? vault.questions : [],
      results: nextResults
    };
    const sealed = _xorEncode(updatedVault, _CBT_OFFLINE_VAULT_HDR);
    if (sealed) localStorage.setItem(_CBT_OFFLINE_VAULT_KEY, sealed);
  } catch (e) {}
}

function _hydrateOfflineFallbackKeys() {
  try {
    const raw = localStorage.getItem(_CBT_OFFLINE_VAULT_KEY);
    const vault = raw ? _xorDecode(raw, _CBT_OFFLINE_VAULT_HDR) : null;
    if (vault && Array.isArray(vault.questions)) {
      vault.questions.forEach(q => _stashQuestionKey(q));
    }
    if (typeof DEFAULT_QUESTIONS !== 'undefined' && Array.isArray(DEFAULT_QUESTIONS)) {
      DEFAULT_QUESTIONS.forEach(q => _stashQuestionKey(q));
    }
  } catch (e) {}
}

class ExamEngine {
  constructor() {
    this.config = this.loadConfig();
    this.questions = this.loadQuestions();
    this.activeQuestions = null;
    this.activeExamConfig = null;
    this.attemptNumber = 1;
    this.startedAtIso = null;
    this.startedAtMs = 0;
    this.durationSeconds = 0;
    this.deadlineEpochMs = 0;
    this.lastTickEpochMs = 0;
    this.lastHeartbeatAt = 0;
    this.wakeLock = null;
    this.currentQuestionIndex = 0;
    this.student = null;
    this.answers = {};
    this.remainingSeconds = 0;
    this.timerInterval = null;
    this.cheatCount = 0;
    this.cheatLogs = [];
    this.lastViolationReason = null;
    this.lastViolationAt = null;
    this.isExamActive = false;
    this._isFinishing = false;
    this._cheatLimitReached = false;
    this._lastScreenshotKeyAt = 0;
    this._lastFocusViolationAt = 0;
    this.fontScaleLevel = 1;
    this.fontScales = ['0.9rem', '1rem', '1.18rem'];

    this.audioCtx = null;
    this.initSecurity();
  }

  isPrivilegedStaffMode() {
    return _hasStaffSessionToken();
  }

  getDeviceId() {
    return _getOrCreateDeviceId();
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

  enterStudentPrivacyMode() {
    if (!this.isExamActive) {
      this.activeQuestions = null;
      _questionKeyVault.clear();
      _clearKvSeal();
    }
    if (Array.isArray(this.questions)) {
      this.questions = this.questions.map(q => this.stripQuestionKeys(q));
      try {
        localStorage.setItem('cbt_questions', JSON.stringify(this.questions));
      } catch (e) {}
    }
    if (this.config && 'adminPin' in this.config) {
      const { adminPin, ...cleanCfg } = this.config;
      this.config = cleanCfg;
      try {
        localStorage.setItem('cbt_config', JSON.stringify(this.config));
      } catch (e) {}
    }
  }

  restorePrivilegedQuestionsMode() {
    if (!this.isPrivilegedStaffMode()) return;
    _hydrateOfflineFallbackKeys();
    const defaultMap = new Map(
      (typeof DEFAULT_QUESTIONS !== 'undefined' && Array.isArray(DEFAULT_QUESTIONS) ? DEFAULT_QUESTIONS : [])
        .map(q => [String(q.id), q])
    );

    const rehydrated = (Array.isArray(this.questions) ? this.questions : []).map(q => {
      if (!q || q.id === undefined || q.id === null) return q;
      if (_questionHasKeyMaterial(q)) {
        _stashQuestionKey(q);
        return q;
      }
      const k = String(q.id);
      const kv = _questionKeyVault.get(k) || defaultMap.get(k);
      if (!kv) return q;
      const merged = { ...q };
      if (kv.correctAnswer !== undefined) {
        merged.correctAnswer = Array.isArray(kv.correctAnswer) ? [...kv.correctAnswer] : kv.correctAnswer;
      }
      if (Array.isArray(merged.statements) && Array.isArray(kv.statements)) {
        const stmtKeyMap = new Map(kv.statements.map(s => [String(s.id), s.correct]));
        merged.statements = merged.statements.map(s => ({
          ...s,
          correct: s.correct !== undefined ? s.correct : stmtKeyMap.get(String(s.id))
        }));
      }
      return merged;
    });

    if (rehydrated.length > 0) {
      this.questions = this.normalizeQuestionsList(rehydrated);
      try {
        localStorage.setItem('cbt_questions', JSON.stringify(this.questions));
      } catch (e) {}
    }
  }

  getActiveExamConfig() {
    return {
      ...this.config,
      ...(this.activeExamConfig || {})
    };
  }

  getMaxAttemptsForSubject(subject, scheduleObj = null) {
    const cleanSub = String(subject || '').trim().toLowerCase();
    const map = (this.config && this.config.subjectMaxAttempts && typeof this.config.subjectMaxAttempts === 'object')
      ? this.config.subjectMaxAttempts
      : {};

    for (const [k, v] of Object.entries(map)) {
      if (String(k).trim().toLowerCase() === cleanSub) {
        const parsed = parseInt(v, 10);
        if (parsed >= 1) return parsed;
      }
    }

    if (scheduleObj && parseInt(scheduleObj.maxAttempts, 10) >= 1) {
      return parseInt(scheduleObj.maxAttempts, 10);
    }

    return Math.max(1, parseInt(this.config?.maxAttempts, 10) || 1);
  }

  setMaxAttemptsForSubject(subject, maxAttempts, skipCloudPush = false) {
    const cleanSub = String(subject || '').trim();
    const val = Math.max(1, Math.min(20, parseInt(maxAttempts, 10) || 1));
    if (!cleanSub) return;
    const nextMap = {
      ...(this.config.subjectMaxAttempts || {}),
      [cleanSub]: val
    };
    this.saveConfig({ subjectMaxAttempts: nextMap }, skipCloudPush);
  }

  async getStudentAttemptStats(nisn, subject) {
    const targetNisn = String(nisn || '').trim().toUpperCase();
    const targetSub = String(subject || '').trim().toLowerCase();
    if (!targetNisn || !targetSub) return { count: 0, records: [] };

    let localResults = [];
    try {
      localResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      if (!Array.isArray(localResults)) localResults = [];
    } catch (e) {
      localResults = [];
    }

    let cloudResults = [];
    if (typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
      cloudResults = await window.supabaseSync.fetchStudentAttemptsFromCloud(targetNisn);
    }

    const combined = [...cloudResults, ...localResults];
    const deduped = new Map();
    combined.forEach(r => {
      if (!r) return;
      const rNisn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
      const rSub = String(r.subject || '').trim().toLowerCase();
      if (rNisn !== targetNisn) return;
      if (!(rSub === targetSub || this.matchesSubject(rSub, targetSub))) return;

      const sig = r.id ? String(r.id) : `${rNisn}__${rSub}__${r.completedAt || r.completed_at || ''}`;
      if (!deduped.has(sig)) {
        deduped.set(sig, r);
      }
    });

    const records = Array.from(deduped.values());
    return { count: records.length, records };
  }

  loadConfig() {
    const saved = localStorage.getItem('cbt_config');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        if (parsed && 'adminPin' in parsed) {
          delete parsed.adminPin;
        }
        if (parsed.examTitle && parsed.examTitle.includes('TKA')) {
          parsed.examTitle = "Asesmen Sumatif Akhir Semester I";
        }
        if (parsed.examToken && parsed.examToken.includes('TKA')) {
          parsed.examToken = "CBT80M";
        }
        parsed.showScoreToStudent = false;
        parsed.durationMinutes = parsed.durationMinutes || 80;
        const merged = { ...DEFAULT_EXAM_CONFIG, ...parsed };
        delete merged.adminPin;
        this.config = merged;
        try { localStorage.setItem('cbt_config', JSON.stringify(merged)); } catch (e) {}
        return merged;
      } catch (e) {
        console.error("Gagal load config", e);
      }
    }
    const cleanDefault = { ...DEFAULT_EXAM_CONFIG };
    delete cleanDefault.adminPin;
    return cleanDefault;
  }

  saveConfig(newConfig, skipCloudPush = false) {
    const merged = { ...this.config, ...newConfig, showScoreToStudent: false };
    delete merged.adminPin;
    this.config = merged;
    localStorage.setItem('cbt_config', JSON.stringify(this.config));
    if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
      window.supabaseSync.pushStateKey('cbt_config', this.config);
    }
  }

  normalizeQuestionsList(questionsList) {
    if (!Array.isArray(questionsList)) return [];
    return questionsList.map(q => {
      if (!q || !Array.isArray(q.options)) return q;
      const ansKeys = Array.isArray(q.correctAnswer)
        ? q.correctAnswer.map(k => String(k || '').trim().toUpperCase())
        : [String(q.correctAnswer || '').trim().toUpperCase()];
      const cleanedOpts = q.options.filter(opt => {
        if (!opt) return false;
        const k = String(opt.key || '').trim().toUpperCase();
        const t = String(opt.text || '').trim();
        if (k === 'E' && t === '' && !ansKeys.includes('E')) return false;
        return true;
      });
      return cleanedOpts.length === q.options.length ? q : { ...q, options: cleanedOpts };
    });
  }

  loadQuestions() {
    const isStaff = this.isPrivilegedStaffMode();
    const saved = localStorage.getItem('cbt_questions');
    let sourceList = null;

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sourceList = this.normalizeQuestionsList(parsed);
        }
      } catch (e) {
        console.error("Gagal load questions", e);
      }
    }

    if (!sourceList) {
      sourceList = this.normalizeQuestionsList(
        typeof DEFAULT_QUESTIONS !== 'undefined' && Array.isArray(DEFAULT_QUESTIONS) ? DEFAULT_QUESTIONS : []
      );
    }

    sourceList.forEach(q => _stashQuestionKey(q));
    if (!(typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured())) {
      _hydrateOfflineFallbackKeys();
    }

    if (isStaff) {
      try { localStorage.setItem('cbt_questions', JSON.stringify(sourceList)); } catch (e) {}
      return sourceList;
    }

    const stripped = sourceList.map(q => this.stripQuestionKeys(q));
    try { localStorage.setItem('cbt_questions', JSON.stringify(stripped)); } catch (e) {}
    return stripped;
  }

  generateUniqueQuestionId(existingList = null) {
    const list = Array.isArray(existingList)
      ? existingList
      : (Array.isArray(this.questions) ? this.questions : []);
    const used = new Set(list.map(q => (q && q.id !== undefined && q.id !== null ? String(q.id) : '')));
    let candidate = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    while (used.has(String(candidate))) {
      candidate += 1;
    }
    return candidate;
  }

  applyRemoteQuestions(remoteQuestions) {
    if (!Array.isArray(remoteQuestions)) return this.questions;
    let nextList = remoteQuestions;
    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.applyPendingQuestionOverlay === 'function') {
      nextList = window.supabaseSync.applyPendingQuestionOverlay(remoteQuestions);
    }
    this.saveQuestions(nextList, true);
    return this.questions;
  }

  saveQuestions(newQuestions, skipCloudPush = false) {
    const normalized = this.normalizeQuestionsList(newQuestions);
    normalized.forEach(q => _stashQuestionKey(q));

    if (this.isPrivilegedStaffMode()) {
      this.questions = normalized;
      try { localStorage.setItem('cbt_questions', JSON.stringify(this.questions)); } catch (e) {}
      if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
        if (typeof window.supabaseSync.upsertQuestionRows === 'function') {
          window.supabaseSync.upsertQuestionRows(this.questions, { skipMigrationCheck: true });
        } else {
          window.supabaseSync.pushStateKey('cbt_questions', this.questions);
        }
      }
      return;
    }

    this.questions = normalized.map(q => this.stripQuestionKeys(q));
    try { localStorage.setItem('cbt_questions', JSON.stringify(this.questions)); } catch (e) {}
  }

  matchesSubject(qSub, targetSub) {
    const a = String(qSub || '').trim().toLowerCase();
    const b = String(targetSub || '').trim().toLowerCase();
    if (!a || !b || a === '-' || b === '-' || a === '—' || b === '—') return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  normalizeClassToken(rawToken) {
    let s = String(rawToken || '').trim().toUpperCase();
    s = s.replace(/^KELAS\s+/i, '').replace(/[\s\-_]+/g, '');
    if (!s) return '';
    const romanPrefixes = [
      ['XII', '12'],
      ['XI', '11'],
      ['VIII', '8'],
      ['VII', '7'],
      ['VI', '6'],
      ['IX', '9'],
      ['IV', '4'],
      ['X', '10']
    ];
    for (const [rom, dig] of romanPrefixes) {
      if (s === rom || s.startsWith(rom)) {
        s = dig + s.slice(rom.length);
        break;
      }
    }
    return s;
  }

  matchesClassLevel(qClass, targetClass) {
    const qcRaw = String(qClass || '').trim().toUpperCase();
    const tcRaw = String(targetClass || '').trim().toUpperCase();
    if (!qcRaw || qcRaw === 'SEMUA' || qcRaw === 'SEMUA KELAS' || qcRaw === 'ALL') return true;
    if (!tcRaw || tcRaw === 'SEMUA' || tcRaw === 'SEMUA KELAS' || tcRaw === 'ALL') return true;

    const splitTokens = (str) => str
      .split(/[,;/]+/)
      .map(s => this.normalizeClassToken(s))
      .filter(Boolean);

    const qTokens = splitTokens(qcRaw);
    const tTokens = splitTokens(tcRaw);
    if (qTokens.length === 0 || tTokens.length === 0) return true;

    return qTokens.some(qc => tTokens.some(tc => {
      if (qc === tc) return true;
      const qcGrade = (qc.match(/^(\d+)/) || [])[1];
      const tcGrade = (tc.match(/^(\d+)/) || [])[1];
      if (qcGrade && tcGrade && qcGrade === tcGrade) {
        if (qc === qcGrade || tc === tcGrade) return true;
      }
      return false;
    }));
  }

  normalizeQuestionCategory(category) {
    const val = String(category || 'ALL').trim().toLowerCase();
    if (val === 'trial' || val === 'simulasi' || val === 'simulation' || val === 'ujicoba' || val === 'uji_coba') return 'trial';
    if (val === 'exam' || val === 'real' || val === 'asli') return 'exam';
    return 'ALL';
  }

  isTrialQuestion(q) {
    if (!q || typeof q !== 'object') return false;
    if (q.isTrial === false || q.isTrial === 'false') return false;
    if (q.isTrial === true || q.isTrial === 'true') return true;
    return /^\[Soal\s+(?:Simulasi|Uji Coba)/i.test(String(q.question || '').trim());
  }

  getQuestionsForExam(subjectOverride = null, classOverride = null, categoryOverride = null) {
    const targetSubject = subjectOverride || (this.config && this.config.subject) || '';
    const targetClass = classOverride || (this.student && this.student.class) || (this.config && this.config.targetClass) || 'Semua Kelas';
    const effectiveCategory = this.normalizeQuestionCategory(
      categoryOverride !== null && categoryOverride !== undefined
        ? categoryOverride
        : ((this.activeExamConfig && this.activeExamConfig.questionCategory) || (this.config && this.config.questionCategory) || 'ALL')
    );

    const matchesCategory = (q) => {
      if (effectiveCategory === 'trial') return this.isTrialQuestion(q);
      if (effectiveCategory === 'exam') return !this.isTrialQuestion(q);
      return true;
    };

    const matched = this.questions.filter(q => {
      const qSub = String(q.subject || '').trim();
      if (!qSub || qSub.toLowerCase() === 'umum') return false;
      if (!this.matchesSubject(qSub, targetSubject)) return false;
      if (!matchesCategory(q)) return false;
      return this.matchesClassLevel(q.classLevel || 'Semua Kelas', targetClass);
    });

    if (matched.length > 0) {
      return { questions: matched, isFallback: false, category: effectiveCategory };
    }

    const subjectOnly = this.questions.filter(q => {
      const qSub = String(q.subject || '').trim();
      if (!qSub || qSub.toLowerCase() === 'umum') return false;
      if (!matchesCategory(q)) return false;
      return this.matchesSubject(qSub, targetSubject);
    });

    if (subjectOnly.length > 0) {
      return { questions: subjectOnly, isFallback: false, category: effectiveCategory };
    }

    if (effectiveCategory !== 'ALL') {
      return { questions: [], isFallback: true, emptyForCategory: true, category: effectiveCategory };
    }

    return { questions: [...this.questions], isFallback: true, category: 'ALL' };
  }

  getExamQuestions() {
    if (Array.isArray(this.activeQuestions) && this.activeQuestions.length > 0) {
      return this.activeQuestions;
    }
    const activeCfg = this.getActiveExamConfig();
    return this.getQuestionsForExam(activeCfg.subject, activeCfg.targetClass, activeCfg.questionCategory || 'ALL').questions;
  }

  checkActiveSession() {
    const session = localStorage.getItem('cbt_active_session');
    if (session) {
      try {
        const data = JSON.parse(session);
        if (data && data.isExamActive && data.student && data.student.nisn) {
          const now = Date.now();
          let tampered = false;
          const durationSec = Number(data.durationSeconds || ((data.activeExamConfig?.durationMinutes || this.config.durationMinutes || 80) * 60));
          const startedAtMs = Number(data.startedAtMs || Date.parse(data.startedAtIso || '') || now);
          const deadlineMs = Number(data.deadlineEpochMs || (startedAtMs + durationSec * 1000));
          const lastTickMs = Number(data.lastTickEpochMs || now);

          const expectedSig = _computeSessionSig({
            ...data,
            startedAtMs,
            durationSeconds: durationSec,
            deadlineEpochMs: deadlineMs
          });

          if (!data.sessionSig || data.sessionSig !== expectedSig) {
            tampered = true;
          }

          const wallRemaining = Math.max(0, Math.ceil((deadlineMs - now) / 1000));
          const storedRem = Math.max(0, Number(data.remainingSeconds || 0));

          if (storedRem > wallRemaining + 5 || storedRem > durationSec || lastTickMs > now + 10000) {
            tampered = true;
          }

          const clampedRem = Math.min(storedRem, wallRemaining, durationSec);
          if (clampedRem > 0 || wallRemaining <= 0) {
            return {
              ...data,
              startedAtMs,
              durationSeconds: durationSec,
              deadlineEpochMs: deadlineMs,
              lastTickEpochMs: now,
              remainingSeconds: clampedRem,
              _tampered: tampered,
              _expired: clampedRem <= 0
            };
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  }

  async acquireScreenLock() {
    document.body.classList.add('exam-locked');
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {}
  }

  releaseScreenLock() {
    document.body.classList.remove('exam-locked');
    try {
      if (this.wakeLock) {
        this.wakeLock.release().catch(() => {});
        this.wakeLock = null;
      }
    } catch (e) {}
  }

  syncLiveStudentProgress(force = false) {
    if (!this.isExamActive || !this.student || typeof window === 'undefined' || !window.supabaseSync) return;
    const now = Date.now();
    if (!force && now - this.lastHeartbeatAt < 15000) return;
    this.lastHeartbeatAt = now;

    const activeCfg = this.getActiveExamConfig();
    const summary = this.getAnswerSummary();
    window.supabaseSync.upsertStudentSession({
      nisn: this.student.nisn,
      name: this.student.name,
      class: this.student.class,
      subject: activeCfg.subject,
      status: 'in_progress',
      attemptNumber: this.attemptNumber || 1,
      answeredCount: summary.answered + summary.doubt,
      totalQuestions: summary.total,
      remainingSeconds: this.remainingSeconds,
      cheatCount: this.cheatCount,
      lastViolationReason: this.lastViolationReason || null,
      lastViolationAt: this.lastViolationAt || null,
      cheatLogs: this.cheatLogs || [],
      deviceId: this.getDeviceId(),
      startedAt: this.startedAtIso || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  startExam(studentData, examOverride = null) {
    this._isFinishing = false;
    this._cheatLimitReached = false;
    this._lastScreenshotKeyAt = 0;
    this._lastFocusViolationAt = 0;
    this.student = studentData;
    this.activeExamConfig = examOverride ? { ...examOverride } : (studentData && studentData.examConfig ? { ...studentData.examConfig } : null);
    this.attemptNumber = (studentData && parseInt(studentData.attemptNumber, 10)) || 1;
    this.startedAtMs = Date.now();
    this.startedAtIso = new Date(this.startedAtMs).toISOString();
    this.answers = {};
    this.currentQuestionIndex = 0;
    this.cheatCount = 0;
    this.cheatLogs = [];
    this.lastViolationReason = null;
    this.lastViolationAt = null;
    this.isExamActive = true;

    const activeCfg = this.getActiveExamConfig();
    this.durationSeconds = Math.max(60, (activeCfg.durationMinutes || 80) * 60);
    this.deadlineEpochMs = this.startedAtMs + (this.durationSeconds * 1000);
    this.lastTickEpochMs = this.startedAtMs;
    this.remainingSeconds = this.durationSeconds;

    const targetClass = (studentData && studentData.class) || activeCfg.targetClass || 'Semua Kelas';
    const examQResult = this.getQuestionsForExam(activeCfg.subject, targetClass, activeCfg.questionCategory || 'ALL');
    const selectedRaw = Array.isArray(examQResult.questions) ? examQResult.questions : [];
    selectedRaw.forEach(q => _stashQuestionKey(q));
    if (!(typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured())) {
      _hydrateOfflineFallbackKeys();
    }

    if (!this.isPrivilegedStaffMode()) {
      _sealKvToSession(selectedRaw);
      this.activeQuestions = selectedRaw.map(q => this.stripQuestionKeys(q));
      this.enterStudentPrivacyMode();
    } else {
      this.activeQuestions = selectedRaw;
    }

    this.activeQuestions.forEach(q => {
      const type = q.type || 'single';
      if (type === 'multiple') {
        this.answers[q.id] = { answer: [], doubt: false };
      } else if (type === 'true_false') {
        this.answers[q.id] = { answer: {}, doubt: false };
      } else {
        this.answers[q.id] = { answer: null, doubt: false };
      }
    });

    this.acquireScreenLock();
    this.saveSession();
    this.syncLiveStudentProgress(true);
    this.startTimer();
  }

  resumeSession(sessionData) {
    this._isFinishing = false;
    this._cheatLimitReached = false;
    this._lastScreenshotKeyAt = 0;
    this._lastFocusViolationAt = 0;
    _unsealKvFromSession();
    this.student = sessionData.student;
    this.activeExamConfig = sessionData.activeExamConfig || (sessionData.student && sessionData.student.examConfig) || null;
    this.attemptNumber = sessionData.attemptNumber || (sessionData.student && sessionData.student.attemptNumber) || 1;
    this.startedAtIso = sessionData.startedAtIso || new Date().toISOString();
    const activeCfg = this.getActiveExamConfig();
    this.durationSeconds = Number(sessionData.durationSeconds || ((activeCfg.durationMinutes || 80) * 60));
    this.startedAtMs = Number(sessionData.startedAtMs || Date.parse(this.startedAtIso) || Date.now());
    this.deadlineEpochMs = Number(sessionData.deadlineEpochMs || (this.startedAtMs + this.durationSeconds * 1000));
    this.lastTickEpochMs = Date.now();
    this.answers = sessionData.answers || {};
    this.currentQuestionIndex = sessionData.currentQuestionIndex || 0;
    this.cheatCount = Number(sessionData.cheatCount || 0);
    this.cheatLogs = Array.isArray(sessionData.cheatLogs) ? sessionData.cheatLogs : [];
    this.remainingSeconds = Math.max(0, Number(sessionData.remainingSeconds ?? Math.ceil((this.deadlineEpochMs - Date.now()) / 1000)));
    this.isExamActive = true;

    let restoredList = [];
    if (Array.isArray(sessionData.activeQuestionIds) && sessionData.activeQuestionIds.length > 0) {
      const restored = sessionData.activeQuestionIds
        .map(id => this.questions.find(q => q.id === id))
        .filter(Boolean);
      restoredList = restored.length > 0
        ? restored
        : this.getQuestionsForExam(activeCfg.subject, this.student && this.student.class, activeCfg.questionCategory || 'ALL').questions;
    } else {
      restoredList = this.getQuestionsForExam(activeCfg.subject, this.student && this.student.class, activeCfg.questionCategory || 'ALL').questions;
    }

    if (!this.isPrivilegedStaffMode()) {
      this.activeQuestions = restoredList.map(q => this.stripQuestionKeys(q));
      this.enterStudentPrivacyMode();
    } else {
      this.activeQuestions = restoredList;
    }

    this.acquireScreenLock();
    this.saveSession();
    this.syncLiveStudentProgress(true);

    if (sessionData._tampered) {
      setTimeout(() => {
        if (this.isExamActive) {
          this.recordViolation('Terdeteksi manipulasi waktu atau data sesi ujian di browser!');
        }
      }, 450);
    }

    if (sessionData._expired || this.remainingSeconds <= 0) {
      setTimeout(() => {
        if (this.isExamActive) {
          this.finishExam('Waktu Ujian Habis! Sistem otomatis mengumpulkan lembar jawaban.');
        }
      }, 300);
      return;
    }

    this.startTimer();
  }

  saveSession() {
    if (!this.isExamActive) return;
    const basePayload = {
      student: this.student,
      activeExamConfig: this.activeExamConfig,
      attemptNumber: this.attemptNumber,
      startedAtIso: this.startedAtIso,
      startedAtMs: this.startedAtMs,
      durationSeconds: this.durationSeconds,
      deadlineEpochMs: this.deadlineEpochMs,
      lastTickEpochMs: this.lastTickEpochMs || Date.now(),
      deviceId: this.getDeviceId(),
      answers: this.answers,
      currentQuestionIndex: this.currentQuestionIndex,
      activeQuestionIds: this.getExamQuestions().map(q => q.id),
      remainingSeconds: this.remainingSeconds,
      cheatCount: this.cheatCount,
      cheatLogs: this.cheatLogs,
      isExamActive: this.isExamActive
    };
    basePayload.sessionSig = _computeSessionSig(basePayload);
    localStorage.setItem('cbt_active_session', JSON.stringify(basePayload));
  }

  clearSession() {
    this.isExamActive = false;
    this.activeQuestions = null;
    this.activeExamConfig = null;
    this.releaseScreenLock();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    localStorage.removeItem('cbt_active_session');
    _clearKvSeal();
    if (!this.isPrivilegedStaffMode()) {
      _questionKeyVault.clear();
    }
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isExamActive || this._isFinishing) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        return;
      }

      const now = Date.now();
      const wallRem = this.deadlineEpochMs > 0
        ? Math.max(0, Math.ceil((this.deadlineEpochMs - now) / 1000))
        : Math.max(0, this.remainingSeconds - 1);

      const nextRem = Math.min(Math.max(0, this.remainingSeconds - 1), wallRem);
      this.remainingSeconds = nextRem;
      this.lastTickEpochMs = now;

      if (this.remainingSeconds > 0) {
        this.saveSession();
        if (this.remainingSeconds % 20 === 0) {
          this.syncLiveStudentProgress(true);
        }
        window.dispatchEvent(new CustomEvent('cbt-timer-tick', {
          detail: { remainingSeconds: this.remainingSeconds }
        }));
      } else {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.finishExam('Waktu Ujian Habis! Sistem otomatis mengumpulkan lembar jawaban.');
      }
    }, 1000);
  }

  formatTime(seconds) {
    const safeSec = Math.max(0, parseInt(seconds, 10) || 0);
    const hrs = Math.floor(safeSec / 3600);
    const mins = Math.floor((safeSec % 3600) / 60);
    const secs = safeSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }

  getCurrentQuestion() {
    const activeQs = this.getExamQuestions();
    return activeQs[this.currentQuestionIndex];
  }

  selectSingleAnswer(optionKey) {
    const q = this.getCurrentQuestion();
    if (!q) return;

    if (!this.answers[q.id]) {
      this.answers[q.id] = { answer: null, doubt: false };
    }
    this.answers[q.id].answer = optionKey;
    this.saveSession();
  }

  toggleMultipleAnswer(optionKey) {
    const q = this.getCurrentQuestion();
    if (!q) return;

    if (!this.answers[q.id]) {
      this.answers[q.id] = { answer: [], doubt: false };
    }
    if (!Array.isArray(this.answers[q.id].answer)) {
      this.answers[q.id].answer = [];
    }

    const currentArr = this.answers[q.id].answer;
    const index = currentArr.indexOf(optionKey);
    if (index > -1) {
      currentArr.splice(index, 1);
    } else {
      currentArr.push(optionKey);
      currentArr.sort();
    }
    this.saveSession();
  }

  selectTrueFalseAnswer(statementId, value) {
    const q = this.getCurrentQuestion();
    if (!q) return;

    if (!this.answers[q.id]) {
      this.answers[q.id] = { answer: {}, doubt: false };
    }
    if (typeof this.answers[q.id].answer !== 'object' || Array.isArray(this.answers[q.id].answer)) {
      this.answers[q.id].answer = {};
    }

    this.answers[q.id].answer[statementId] = value;
    this.saveSession();
  }

  toggleDoubt() {
    const q = this.getCurrentQuestion();
    if (!q) return;

    if (!this.answers[q.id]) {
      this.answers[q.id] = { answer: null, doubt: false };
    }
    this.answers[q.id].doubt = !this.answers[q.id].doubt;
    this.saveSession();
  }

  goToQuestion(index) {
    const activeQs = this.getExamQuestions();
    if (index >= 0 && index < activeQs.length) {
      this.currentQuestionIndex = index;
      this.saveSession();
    }
  }

  nextQuestion() {
    const activeQs = this.getExamQuestions();
    if (this.currentQuestionIndex < activeQs.length - 1) {
      this.currentQuestionIndex++;
      this.saveSession();
      return true;
    }
    return false;
  }

  prevQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.saveSession();
      return true;
    }
    return false;
  }

  isQuestionAnswered(q) {
    const ansData = this.answers[q.id];
    if (!ansData || ansData.answer === null || ansData.answer === undefined) return false;

    const type = q.type || 'single';
    if (type === 'single') {
      return ansData.answer !== null;
    } else if (type === 'multiple') {
      return Array.isArray(ansData.answer) && ansData.answer.length > 0;
    } else if (type === 'true_false') {
      const statements = q.statements || [];
      const given = ansData.answer || {};
      return statements.length > 0 && statements.every(s => given[s.id] !== undefined);
    }
    return false;
  }

  getAnswerSummary() {
    const activeQs = this.getExamQuestions();
    let answered = 0;
    let doubt = 0;
    let unanswered = 0;

    activeQs.forEach(q => {
      const ans = this.answers[q.id];
      const hasAnswer = this.isQuestionAnswered(q);

      if (ans && ans.doubt) {
        doubt++;
      } else if (hasAnswer) {
        answered++;
      } else {
        unanswered++;
      }
    });

    return {
      total: activeQs.length,
      answered,
      doubt,
      unanswered
    };
  }

  changeFontSize(direction) {
    if (direction === 'increase' && this.fontScaleLevel < 2) {
      this.fontScaleLevel++;
    } else if (direction === 'decrease' && this.fontScaleLevel > 0) {
      this.fontScaleLevel--;
    } else if (direction === 'reset') {
      this.fontScaleLevel = 1;
    }
    document.documentElement.style.setProperty('--font-scale', this.fontScales[this.fontScaleLevel]);
    return this.fontScaleLevel;
  }

  playAlarmSound() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);
    } catch (e) {}
  }

  triggerPrivacyShield(reason) {
    if (!this.isExamActive) return;
    window.dispatchEvent(new CustomEvent('cbt-privacy-shield', {
      detail: { reason: reason || 'Layar dikunci untuk mencegah tangkapan layar atau perpindahan aplikasi.' }
    }));
  }

  initSecurity() {
    document.addEventListener('contextmenu', (e) => {
      if (this.isExamActive) e.preventDefault();
    });

    ['copy', 'cut', 'paste', 'dragstart'].forEach((evt) => {
      document.addEventListener(evt, (e) => {
        if (this.isExamActive) e.preventDefault();
      });
    });

    const isPrintScreenKey = (e) => {
      if (!e) return false;
      return (
        e.key === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        e.key === 'Snapshot' ||
        e.key === 'Print' ||
        e.keyCode === 44
      );
    };

    const triggerScreenshotOrFocusViolation = (shieldReason, violationReason, category) => {
      if (!this.isExamActive || this._isFinishing || this._cheatLimitReached) return;
      const now = Date.now();
      if (category === 'keyboard') {
        if (now - this._lastScreenshotKeyAt < 350) {
          this.triggerPrivacyShield(shieldReason);
          return;
        }
        this._lastScreenshotKeyAt = now;
      } else if (category === 'focus') {
        if (now - this._lastFocusViolationAt < 350) {
          this.triggerPrivacyShield(shieldReason);
          return;
        }
        this._lastFocusViolationAt = now;
      }
      this.triggerPrivacyShield(shieldReason);
      this.recordViolation(violationReason);
    };

    const clearClipboardSilently = () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('').catch(() => {});
        }
      } catch (err) {}
    };

    const handleBlockedKeys = (e) => {
      if (!this.isExamActive) return;

      const isPrintScreen = isPrintScreenKey(e);
      const isOsScreenshot =
        (e.metaKey && e.shiftKey && ['S', 's', '3', '4', '5', '6'].includes(e.key)) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) ||
        (e.ctrlKey && (e.key === 'p' || e.key === 'P')) ||
        (e.metaKey && (e.key === 'p' || e.key === 'P'));

      if (isPrintScreen || isOsScreenshot) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        clearClipboardSilently();
        triggerScreenshotOrFocusViolation(
          'Tangkapan layar / pencetakan layar diblokir selama ujian berlangsung!',
          isPrintScreen
            ? 'Terdeteksi menekan tombol PrintScreen (percobaan tangkapan layar)!'
            : 'Terdeteksi shortcut tangkapan layar / cetak layar!',
          'keyboard'
        );
        return;
      }

      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
        (e.metaKey && e.altKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
        ((e.ctrlKey || e.metaKey) && ['u', 'U', 's', 'S'].includes(e.key))
      ) {
        e.preventDefault();
        this.recordViolation('Mencoba membuka inspect element / devtools');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && ['a', 'A', 'c', 'C', 'v', 'V', 'x', 'X'].includes(e.key)) {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleBlockedKeys);
    document.addEventListener('keyup', (e) => {
      if (!this.isExamActive) return;
      if (isPrintScreenKey(e)) {
        handleBlockedKeys(e);
      }
    });

    window.addEventListener('beforeprint', () => {
      if (this.isExamActive) {
        triggerScreenshotOrFocusViolation(
          'Pencetakan halaman diblokir selama ujian berlangsung!',
          'Terdeteksi percobaan mencetak halaman soal!',
          'keyboard'
        );
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (this.isExamActive && (document.visibilityState === 'hidden' || document.hidden)) {
        triggerScreenshotOrFocusViolation(
          'Layar soal disembunyikan karena visibilitas halaman berubah atau Anda meninggalkan layar ujian.',
          'Terdeteksi perubahan visibilityState (hidden) / berpindah tab / meminimalkan browser!',
          'focus'
        );
      } else if (this.isExamActive && document.visibilityState === 'visible' && !document.hidden) {
        this.acquireScreenLock();
      }
    });

    window.addEventListener('blur', () => {
      if (this.isExamActive) {
        triggerScreenshotOrFocusViolation(
          'Layar soal dikunci sementara karena fokus layar berpindah / percobaan tangkapan layar.',
          'Terdeteksi kehilangan fokus layar (blur) / percobaan tangkapan layar!',
          'focus'
        );
      }
    });

    window.addEventListener('pagehide', () => {
      if (this.isExamActive) {
        triggerScreenshotOrFocusViolation(
          'Layar soal dikunci karena halaman ujian ditinggalkan.',
          'Terdeteksi meninggalkan halaman ujian (pagehide)!',
          'focus'
        );
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (this.isExamActive && !document.fullscreenElement) {
        triggerScreenshotOrFocusViolation(
          'Ujian wajib berjalan dalam mode Layar Penuh (Fullscreen).',
          'Keluar dari mode Layar Penuh (Fullscreen)!',
          'focus'
        );
      }
    });
  }

  recordViolation(reason) {
    if (!this.isExamActive || this._isFinishing || this._cheatLimitReached) return;

    const maxViolations = Math.max(1, Number((this.config && this.config.maxCheatViolations) || 3));
    this.cheatCount++;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID');
    this.lastViolationReason = reason;
    this.lastViolationAt = now.toISOString();
    this.cheatLogs.push({ time: timeStr, reason });
    this.saveSession();

    this.playAlarmSound();
    this.syncLiveStudentProgress(true);

    window.dispatchEvent(new CustomEvent('cbt-cheat-warning', {
      detail: {
        count: this.cheatCount,
        max: maxViolations,
        reason: reason
      }
    }));

    if (this.cheatCount >= maxViolations) {
      this._cheatLimitReached = true;
      setTimeout(() => {
        if (this.isExamActive && !this._isFinishing) {
          this.finishExam(`Ujian dihentikan otomatis karena terdeteksi ${this.cheatCount} kali pelanggaran anti-curang / tangkapan layar.`);
        }
      }, 1200);
    }
  }

  _buildRedactedReceipt(record) {
    return {
      id: record.id,
      student: record.student,
      examTitle: record.examTitle,
      subject: record.subject,
      attemptNumber: record.attemptNumber || 1,
      completedAt: record.completedAt,
      totalQuestions: record.totalQuestions,
      cheatCount: record.cheatCount || 0,
      finishReason: record.finishReason
    };
  }

  _saveStudentReceiptLocal(receiptOrRecord, isStaff) {
    try {
      const allResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      const list = Array.isArray(allResults) ? allResults : [];
      const toStore = isStaff ? receiptOrRecord : this._buildRedactedReceipt(receiptOrRecord);
      const filtered = list.filter(r => r && String(r.id) !== String(toStore.id));
      filtered.unshift(toStore);
      localStorage.setItem('cbt_exam_results', JSON.stringify(filtered));
    } catch (e) {}
  }

  _resolveKeyForQuestion(q) {
    const kv = q && q.id !== undefined && q.id !== null ? _questionKeyVault.get(String(q.id)) : null;
    if (!kv) return q;
    const merged = { ...q };
    if (merged.correctAnswer === undefined && kv.correctAnswer !== undefined) {
      merged.correctAnswer = kv.correctAnswer;
    }
    if (Array.isArray(merged.statements) && Array.isArray(kv.statements)) {
      const stmtMap = new Map(kv.statements.map(s => [String(s.id), s.correct]));
      merged.statements = merged.statements.map(s => ({
        ...s,
        correct: s.correct !== undefined ? s.correct : stmtMap.get(String(s.id))
      }));
    }
    return merged;
  }

  async finishExam(reason = null) {
    if (!this.isExamActive || this._isFinishing) return null;
    this._isFinishing = true;

    try {
      _unsealKvFromSession();

      const activeQs = this.getExamQuestions();
      const activeCfg = this.getActiveExamConfig();
      const completedAtStr = new Date().toLocaleString('id-ID');
      const finishReasonText = reason || 'Selesai mandiri oleh peserta';
      const totalSec = this.durationSeconds || ((activeCfg.durationMinutes || 80) * 60);
      const durationUsedSeconds = Math.max(0, totalSec - this.remainingSeconds);
      const studentSnap = this.student ? { ...this.student } : { nisn: '-', name: 'Peserta', class: 'Umum' };
      const answersSnap = JSON.parse(JSON.stringify(this.answers || {}));
      const attemptSnap = this.attemptNumber || 1;
      const cheatCountSnap = this.cheatCount || 0;
      const cheatLogsSnap = Array.isArray(this.cheatLogs) ? [...this.cheatLogs] : [];
      const remainingSnap = this.remainingSeconds;
      const startedAtIsoSnap = this.startedAtIso || new Date().toISOString();
      const isStaff = this.isPrivilegedStaffMode();
      const isCloud = Boolean(typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured());

      // Mode Server-Side Grading v3.38 (Supabase RPC SECURITY DEFINER)
      if (isCloud && !window.supabaseSync.securityRpcMissing && typeof window.supabaseSync.gradeAndSubmitExamRpc === 'function') {
        const rpcPayload = {
          id: 'RES_' + Date.now(),
          student: {
            nisn: studentSnap.nisn,
            name: studentSnap.name,
            class: studentSnap.class
          },
          examTitle: activeCfg.examTitle,
          subject: activeCfg.subject,
          attemptNumber: attemptSnap,
          startedAt: startedAtIsoSnap,
          completedAt: completedAtStr,
          durationUsedSeconds,
          remainingSeconds: remainingSnap,
          cheatCount: cheatCountSnap,
          cheatLogs: cheatLogsSnap,
          lastViolationReason: this.lastViolationReason || null,
          finishReason: finishReasonText,
          deviceId: this.getDeviceId(),
          questionIds: activeQs.map(q => q.id),
          answers: answersSnap
        };

        const rpcRes = await window.supabaseSync.gradeAndSubmitExamRpc(rpcPayload);
        if (rpcRes && rpcRes.success && rpcRes.receipt) {
          const receipt = {
            id: rpcRes.receipt.id || rpcPayload.id,
            student: rpcRes.receipt.student || rpcPayload.student,
            examTitle: rpcRes.receipt.examTitle || activeCfg.examTitle,
            subject: rpcRes.receipt.subject || activeCfg.subject,
            attemptNumber: rpcRes.receipt.attemptNumber || attemptSnap,
            completedAt: rpcRes.receipt.completedAt || completedAtStr,
            totalQuestions: rpcRes.receipt.totalQuestions || activeQs.length,
            cheatCount: rpcRes.receipt.cheatCount !== undefined ? rpcRes.receipt.cheatCount : cheatCountSnap,
            finishReason: rpcRes.receipt.finishReason || finishReasonText
          };

          this._saveStudentReceiptLocal(receipt, isStaff);
          this.clearSession();
          if (!isStaff) this.enterStudentPrivacyMode();

          window.dispatchEvent(new CustomEvent('cbt-exam-finished', {
            detail: {
              result: receipt,
              showScore: false
            }
          }));
          return receipt;
        }
      }

      // Mode Kompatibilitas Pra-SQL / Mode Offline
      if (!isCloud) {
        _hydrateOfflineFallbackKeys();
      }
      let totalPointsEarned = 0;
      let maxPossiblePoints = 0;
      let correctCount = 0;
      let incorrectCount = 0;
      let unattemptedCount = 0;

      const detailedAnswers = activeQs.map((rawQ, qIdx) => {
        const q = this._resolveKeyForQuestion(rawQ);
        const type = q.type || 'single';
        const weight = q.weight || 10;
        maxPossiblePoints += weight;

        const studentAnsData = answersSnap[q.id];
        const studentAns = studentAnsData?.answer;
        let earned = 0;
        let isFullyCorrect = false;
        let status = 'unattempted';
        let studentAnswerDisplay = '-';
        let correctAnswerDisplay = '-';

        if (type === 'single') {
          correctAnswerDisplay = q.correctAnswer || '-';
          studentAnswerDisplay = studentAns || '-';
        } else if (type === 'multiple') {
          const correctKeys = Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [q.correctAnswer] : []);
          const studentKeys = Array.isArray(studentAns) ? studentAns : [];
          correctAnswerDisplay = correctKeys.join(',');
          studentAnswerDisplay = studentKeys.length > 0 ? studentKeys.join(',') : '-';
        } else if (type === 'true_false') {
          const statements = q.statements || [];
          const given = (studentAns && typeof studentAns === 'object' && !Array.isArray(studentAns)) ? studentAns : {};
          correctAnswerDisplay = statements.map(s => s.correct).join(',');
          const givenArr = statements.map(s => given[s.id] || '-');
          studentAnswerDisplay = givenArr.some(v => v !== '-') ? givenArr.join(',') : '-';
        }

        if (!this.isQuestionAnswered(q)) {
          unattemptedCount++;
          status = 'unattempted';
        } else if (type === 'single') {
          if (studentAns === q.correctAnswer) {
            earned = weight;
            isFullyCorrect = true;
            correctCount++;
            status = 'correct';
          } else {
            incorrectCount++;
            status = 'incorrect';
          }
        } else if (type === 'multiple') {
          const correctKeys = Array.isArray(q.correctAnswer) ? q.correctAnswer : (q.correctAnswer ? [q.correctAnswer] : []);
          const studentKeys = Array.isArray(studentAns) ? studentAns : [];

          const correctSelected = studentKeys.filter(k => correctKeys.includes(k)).length;
          const incorrectSelected = studentKeys.filter(k => !correctKeys.includes(k)).length;

          if (correctKeys.length > 0 && correctSelected === correctKeys.length && incorrectSelected === 0) {
            earned = weight;
            isFullyCorrect = true;
            correctCount++;
            status = 'correct';
          } else if (correctKeys.length > 0 && correctSelected > 0 && incorrectSelected === 0) {
            earned = Math.round((correctSelected / correctKeys.length) * weight);
            if (earned > 0) correctCount++; else incorrectCount++;
            status = 'incorrect';
          } else {
            incorrectCount++;
            status = 'incorrect';
          }
        } else if (type === 'true_false') {
          const statements = q.statements || [];
          const given = studentAns || {};
          let stmtCorrect = 0;

          statements.forEach(stmt => {
            if (given[stmt.id] === stmt.correct) {
              stmtCorrect++;
            }
          });

          if (statements.length > 0) {
            earned = Math.round((stmtCorrect / statements.length) * weight);
            if (stmtCorrect === statements.length) {
              isFullyCorrect = true;
              correctCount++;
              status = 'correct';
            } else {
              incorrectCount++;
              status = 'incorrect';
            }
          }
        }

        totalPointsEarned += earned;

        return {
          questionNumber: qIdx + 1,
          questionId: q.id,
          type: type,
          questionText: q.question,
          studentAnswer: studentAns,
          correctAnswer: type === 'true_false' ? correctAnswerDisplay : q.correctAnswer,
          studentAnswerDisplay,
          correctAnswerDisplay,
          status,
          earnedScore: earned,
          maxScore: weight,
          isFullyCorrect: isFullyCorrect
        };
      });

      const finalScore = maxPossiblePoints > 0
        ? Math.round((totalPointsEarned / maxPossiblePoints) * 100)
        : 0;

      const resultRecord = {
        id: 'RES_' + Date.now(),
        student: studentSnap,
        examTitle: activeCfg.examTitle,
        subject: activeCfg.subject,
        attemptNumber: attemptSnap,
        completedAt: completedAtStr,
        durationUsedSeconds,
        correctCount,
        incorrectCount,
        unattemptedCount,
        totalQuestions: activeQs.length,
        finalScore,
        cheatCount: cheatCountSnap,
        cheatLogs: cheatLogsSnap,
        finishReason: finishReasonText,
        detailedAnswers
      };

      if (isCloud && typeof window.supabaseSync !== 'undefined') {
        await window.supabaseSync.submitExamResult(resultRecord);
        await window.supabaseSync.upsertStudentSession({
          nisn: studentSnap.nisn,
          name: studentSnap.name,
          class: studentSnap.class,
          subject: activeCfg.subject,
          status: 'completed',
          attemptNumber: attemptSnap,
          answeredCount: activeQs.length - unattemptedCount,
          totalQuestions: activeQs.length,
          remainingSeconds: remainingSnap,
          cheatCount: cheatCountSnap,
          lastViolationReason: this.lastViolationReason || null,
          finishReason: finishReasonText,
          finalScore,
          deviceId: this.getDeviceId(),
          startedAt: startedAtIsoSnap,
          completedAt: completedAtStr,
          updatedAt: new Date().toISOString()
        });
      } else {
        _appendOfflineResultToVault(resultRecord);
      }

      const publicViewRecord = isStaff ? resultRecord : this._buildRedactedReceipt(resultRecord);
      this._saveStudentReceiptLocal(resultRecord, isStaff);

      this.clearSession();
      if (!isStaff) this.enterStudentPrivacyMode();

      window.dispatchEvent(new CustomEvent('cbt-exam-finished', {
        detail: {
          result: publicViewRecord,
          showScore: false
        }
      }));

      return publicViewRecord;
    } finally {
      this._isFinishing = false;
    }
  }
}

window.examEngine = new ExamEngine();
