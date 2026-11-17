// CBT Engine: Timer 80 Menit, Anti Tab Switch Ketat, Scoring Ujian Sekolah Multi-Format

class ExamEngine {
  constructor() {
    this.config = this.loadConfig();
    this.questions = this.loadQuestions();
    this.activeQuestions = null;
    this.activeExamConfig = null;
    this.attemptNumber = 1;
    this.startedAtIso = null;
    this.lastHeartbeatAt = 0;
    this.wakeLock = null;
    this.currentQuestionIndex = 0;
    this.student = null;
    this.answers = {};
    this.remainingSeconds = 0;
    this.timerInterval = null;
    this.cheatCount = 0;
    this.cheatLogs = [];
    this.isExamActive = false;
    this.fontScaleLevel = 1;
    this.fontScales = ['0.9rem', '1rem', '1.18rem'];

    this.audioCtx = null;
    this.initSecurity();
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
        if (parsed.examTitle && parsed.examTitle.includes('TKA')) {
          parsed.examTitle = "Asesmen Sumatif Akhir Semester I";
        }
        if (parsed.examToken && parsed.examToken.includes('TKA')) {
          parsed.examToken = "CBT80M";
        }
        parsed.showScoreToStudent = false;
        parsed.durationMinutes = parsed.durationMinutes || 80;
        this.saveConfig(parsed, true);
        return { ...DEFAULT_EXAM_CONFIG, ...parsed };
      } catch (e) {
        console.error("Gagal load config", e);
      }
    }
    return { ...DEFAULT_EXAM_CONFIG };
  }

  saveConfig(newConfig, skipCloudPush = false) {
    this.config = { ...this.config, ...newConfig, showScoreToStudent: false };
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
    const saved = localStorage.getItem('cbt_questions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = this.normalizeQuestionsList(parsed);
          return normalized;
        }
      } catch (e) {
        console.error("Gagal load questions", e);
      }
    }
    localStorage.setItem('cbt_questions', JSON.stringify(DEFAULT_QUESTIONS));
    return [...DEFAULT_QUESTIONS];
  }

  saveQuestions(newQuestions, skipCloudPush = false) {
    this.questions = this.normalizeQuestionsList(newQuestions);
    localStorage.setItem('cbt_questions', JSON.stringify(this.questions));
    if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
      window.supabaseSync.pushStateKey('cbt_questions', this.questions);
    }
  }

  matchesSubject(qSub, targetSub) {
    const a = String(qSub || '').trim().toLowerCase();
    const b = String(targetSub || '').trim().toLowerCase();
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  matchesClassLevel(qClass, targetClass) {
    const qcRaw = String(qClass || '').trim().toUpperCase();
    const tcRaw = String(targetClass || '').trim().toUpperCase();
    if (!qcRaw || qcRaw === 'SEMUA' || qcRaw === 'SEMUA KELAS' || qcRaw === 'ALL') return true;
    if (!tcRaw || tcRaw === 'SEMUA' || tcRaw === 'SEMUA KELAS' || tcRaw === 'ALL') return true;

    const splitTokens = (str) => str
      .split(/[,;/]+/)
      .map(s => s.trim().replace(/^KELAS\s+/i, '').replace(/\s+/g, ''))
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

  getQuestionsForExam(subjectOverride = null, classOverride = null) {
    const targetSubject = subjectOverride || (this.config && this.config.subject) || '';
    const targetClass = classOverride || (this.student && this.student.class) || (this.config && this.config.targetClass) || 'Semua Kelas';

    const matched = this.questions.filter(q => {
      const qSub = String(q.subject || '').trim();
      if (!qSub || qSub.toLowerCase() === 'umum') return false;
      if (!this.matchesSubject(qSub, targetSubject)) return false;
      return this.matchesClassLevel(q.classLevel || 'Semua Kelas', targetClass);
    });

    if (matched.length > 0) {
      return { questions: matched, isFallback: false };
    }

    const subjectOnly = this.questions.filter(q => {
      const qSub = String(q.subject || '').trim();
      if (!qSub || qSub.toLowerCase() === 'umum') return false;
      return this.matchesSubject(qSub, targetSubject);
    });

    if (subjectOnly.length > 0) {
      return { questions: subjectOnly, isFallback: false };
    }

    return { questions: [...this.questions], isFallback: true };
  }

  getExamQuestions() {
    if (Array.isArray(this.activeQuestions) && this.activeQuestions.length > 0) {
      return this.activeQuestions;
    }
    return this.getQuestionsForExam().questions;
  }

  checkActiveSession() {
    const session = localStorage.getItem('cbt_active_session');
    if (session) {
      try {
        const data = JSON.parse(session);
        if (data.isExamActive && data.remainingSeconds > 0) {
          return data;
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
      startedAt: this.startedAtIso || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  startExam(studentData, examOverride = null) {
    this.student = studentData;
    this.activeExamConfig = examOverride ? { ...examOverride } : (studentData && studentData.examConfig ? { ...studentData.examConfig } : null);
    this.attemptNumber = (studentData && parseInt(studentData.attemptNumber, 10)) || 1;
    this.startedAtIso = new Date().toISOString();
    this.answers = {};
    this.currentQuestionIndex = 0;
    this.cheatCount = 0;
    this.cheatLogs = [];
    this.isExamActive = true;

    const activeCfg = this.getActiveExamConfig();
    this.remainingSeconds = (activeCfg.durationMinutes || 80) * 60;

    const targetClass = (studentData && studentData.class) || activeCfg.targetClass || 'Semua Kelas';
    const examQResult = this.getQuestionsForExam(activeCfg.subject, targetClass);
    this.activeQuestions = examQResult.questions;

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
    this.student = sessionData.student;
    this.activeExamConfig = sessionData.activeExamConfig || (sessionData.student && sessionData.student.examConfig) || null;
    this.attemptNumber = sessionData.attemptNumber || (sessionData.student && sessionData.student.attemptNumber) || 1;
    this.startedAtIso = sessionData.startedAtIso || new Date().toISOString();
    this.answers = sessionData.answers || {};
    this.currentQuestionIndex = sessionData.currentQuestionIndex || 0;
    this.cheatCount = sessionData.cheatCount || 0;
    this.cheatLogs = sessionData.cheatLogs || [];
    const activeCfg = this.getActiveExamConfig();
    this.remainingSeconds = sessionData.remainingSeconds || ((activeCfg.durationMinutes || 80) * 60);
    this.isExamActive = true;

    if (Array.isArray(sessionData.activeQuestionIds) && sessionData.activeQuestionIds.length > 0) {
      const restored = sessionData.activeQuestionIds
        .map(id => this.questions.find(q => q.id === id))
        .filter(Boolean);
      this.activeQuestions = restored.length > 0
        ? restored
        : this.getQuestionsForExam(activeCfg.subject, this.student && this.student.class).questions;
    } else {
      this.activeQuestions = this.getQuestionsForExam(activeCfg.subject, this.student && this.student.class).questions;
    }

    this.acquireScreenLock();
    this.syncLiveStudentProgress(true);
    this.startTimer();
  }

  saveSession() {
    if (!this.isExamActive) return;
    const sessionData = {
      student: this.student,
      activeExamConfig: this.activeExamConfig,
      attemptNumber: this.attemptNumber,
      startedAtIso: this.startedAtIso,
      answers: this.answers,
      currentQuestionIndex: this.currentQuestionIndex,
      activeQuestionIds: this.getExamQuestions().map(q => q.id),
      remainingSeconds: this.remainingSeconds,
      cheatCount: this.cheatCount,
      cheatLogs: this.cheatLogs,
      isExamActive: this.isExamActive
    };
    localStorage.setItem('cbt_active_session', JSON.stringify(sessionData));
  }

  clearSession() {
    this.isExamActive = false;
    this.activeQuestions = null;
    this.activeExamConfig = null;
    this.releaseScreenLock();
    if (this.timerInterval) clearInterval(this.timerInterval);
    localStorage.removeItem('cbt_active_session');
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        this.saveSession();
        if (this.remainingSeconds % 20 === 0) {
          this.syncLiveStudentProgress(true);
        }
        window.dispatchEvent(new CustomEvent('cbt-timer-tick', {
          detail: { remainingSeconds: this.remainingSeconds }
        }));
      } else {
        clearInterval(this.timerInterval);
        this.finishExam('Waktu Ujian Habis! Sistem otomatis mengumpulkan lembar jawaban.');
      }
    }, 1000);
  }

  formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
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

    ['copy', 'cut', 'dragstart'].forEach((evt) => {
      document.addEventListener(evt, (e) => {
        if (this.isExamActive) e.preventDefault();
      });
    });

    const handleBlockedKeys = (e) => {
      if (!this.isExamActive) return;

      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44;
      const isOsScreenshot =
        (e.metaKey && e.shiftKey && ['S', 's', '3', '4', '5'].includes(e.key)) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) ||
        (e.ctrlKey && (e.key === 'p' || e.key === 'P'));

      if (isPrintScreen || isOsScreenshot) {
        e.preventDefault();
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('').catch(() => {});
          }
        } catch (err) {}
        this.triggerPrivacyShield('Tangkapan layar / pencetakan layar diblokir selama ujian berlangsung!');
        this.recordViolation('Terdeteksi percobaan tangkapan layar / print layar!');
        return;
      }

      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S'))
      ) {
        e.preventDefault();
        this.recordViolation('Mencoba membuka inspect element / devtools');
      }

      if (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V' || e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleBlockedKeys);
    document.addEventListener('keyup', (e) => {
      if (!this.isExamActive) return;
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44) {
        handleBlockedKeys(e);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (this.isExamActive && document.hidden) {
        this.triggerPrivacyShield('Layar soal disembunyikan karena Anda meninggalkan layar ujian.');
        this.recordViolation('Terdeteksi berpindah tab atau meminimalkan browser!');
      } else if (this.isExamActive && !document.hidden) {
        this.acquireScreenLock();
      }
    });

    window.addEventListener('blur', () => {
      if (this.isExamActive && !document.hidden) {
        this.triggerPrivacyShield('Layar soal dikunci sementara karena fokus layar berpindah / percobaan tangkapan layar.');
        this.recordViolation('Terdeteksi keluar dari fokus layar ujian!');
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (this.isExamActive && !document.fullscreenElement) {
        this.triggerPrivacyShield('Ujian wajib berjalan dalam mode Layar Penuh (Fullscreen).');
        this.recordViolation('Keluar dari mode Layar Penuh (Fullscreen)!');
      }
    });
  }

  recordViolation(reason) {
    if (!this.isExamActive) return;

    this.cheatCount++;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID');
    this.lastViolationReason = reason;
    this.lastViolationAt = now.toISOString();
    this.cheatLogs.push({ time: timeStr, reason });
    this.saveSession();

    this.playAlarmSound();
    // Kirim peringatan pelanggaran secara instan ke Supabase Cloud untuk dashboard Admin & Guru
    this.syncLiveStudentProgress(true);

    window.dispatchEvent(new CustomEvent('cbt-cheat-warning', {
      detail: {
        count: this.cheatCount,
        max: this.config.maxCheatViolations,
        reason: reason
      }
    }));

    if (this.cheatCount >= this.config.maxCheatViolations) {
      setTimeout(() => {
        this.finishExam(`Ujian dihentikan otomatis karena terdeteksi ${this.cheatCount} kali pelanggaran anti-curang tab switch.`);
      }, 1200);
    }
  }

  finishExam(reason = null) {
    if (!this.isExamActive) return;

    const activeQs = this.getExamQuestions();
    let totalPointsEarned = 0;
    let maxPossiblePoints = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const detailedAnswers = activeQs.map((q, qIdx) => {
      const type = q.type || 'single';
      const weight = q.weight || 10;
      maxPossiblePoints += weight;

      const studentAnsData = this.answers[q.id];
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
        const correctKeys = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
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
        const correctKeys = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
        const studentKeys = Array.isArray(studentAns) ? studentAns : [];

        const correctSelected = studentKeys.filter(k => correctKeys.includes(k)).length;
        const incorrectSelected = studentKeys.filter(k => !correctKeys.includes(k)).length;

        if (correctSelected === correctKeys.length && incorrectSelected === 0) {
          earned = weight;
          isFullyCorrect = true;
          correctCount++;
          status = 'correct';
        } else if (correctSelected > 0 && incorrectSelected === 0) {
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

    const activeCfg = this.getActiveExamConfig();
    const completedAtStr = new Date().toLocaleString('id-ID');
    const resultRecord = {
      id: 'RES_' + Date.now(),
      student: this.student,
      examTitle: activeCfg.examTitle,
      subject: activeCfg.subject,
      attemptNumber: this.attemptNumber || 1,
      completedAt: completedAtStr,
      durationUsedSeconds: ((activeCfg.durationMinutes || 80) * 60) - this.remainingSeconds,
      correctCount,
      incorrectCount,
      unattemptedCount,
      totalQuestions: activeQs.length,
      finalScore: finalScore,
      cheatCount: this.cheatCount,
      cheatLogs: this.cheatLogs,
      finishReason: reason || 'Selesai mandiri oleh peserta',
      detailedAnswers
    };

    const allResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
    allResults.unshift(resultRecord);
    localStorage.setItem('cbt_exam_results', JSON.stringify(allResults));

    if (typeof window.supabaseSync !== 'undefined') {
      window.supabaseSync.submitExamResult(resultRecord);
      window.supabaseSync.upsertStudentSession({
        nisn: this.student?.nisn,
        name: this.student?.name,
        class: this.student?.class,
        subject: activeCfg.subject,
        status: 'completed',
        attemptNumber: this.attemptNumber || 1,
        answeredCount: activeQs.length - unattemptedCount,
        totalQuestions: activeQs.length,
        remainingSeconds: this.remainingSeconds,
        cheatCount: this.cheatCount,
        lastViolationReason: this.lastViolationReason || null,
        finishReason: reason || 'Selesai mandiri oleh peserta',
        finalScore: finalScore,
        startedAt: this.startedAtIso,
        completedAt: completedAtStr,
        updatedAt: new Date().toISOString()
      });
    }

    this.clearSession();

    window.dispatchEvent(new CustomEvent('cbt-exam-finished', {
      detail: {
        result: resultRecord,
        showScore: false
      }
    }));

    return resultRecord;
  }
}

window.examEngine = new ExamEngine();
