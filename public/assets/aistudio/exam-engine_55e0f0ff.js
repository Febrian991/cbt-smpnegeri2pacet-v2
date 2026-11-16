// CBT Engine: Timer 80 Menit, Anti Tab Switch Ketat, Scoring Ujian Sekolah Multi-Format

class ExamEngine {
  constructor() {
    this.config = this.loadConfig();
    this.questions = this.loadQuestions();
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

  loadConfig() {
    const saved = localStorage.getItem('cbt_config');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        // Pembersihan otomatis jika masih ada teks TKA dari cache sebelumnya
        if (parsed.examTitle && parsed.examTitle.includes('TKA')) {
          parsed.examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)";
        }
        if (parsed.examToken && parsed.examToken.includes('TKA')) {
          parsed.examToken = "CBT80M";
        }
        parsed.showScoreToStudent = false;
        parsed.durationMinutes = parsed.durationMinutes || 80;
        this.saveConfig(parsed);
        return { ...DEFAULT_EXAM_CONFIG, ...parsed };
      } catch (e) {
        console.error("Gagal load config", e);
      }
    }
    return { ...DEFAULT_EXAM_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig, showScoreToStudent: false };
    localStorage.setItem('cbt_config', JSON.stringify(this.config));
  }

  loadQuestions() {
    const saved = localStorage.getItem('cbt_questions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Gagal load questions", e);
      }
    }
    localStorage.setItem('cbt_questions', JSON.stringify(DEFAULT_QUESTIONS));
    return [...DEFAULT_QUESTIONS];
  }

  saveQuestions(newQuestions) {
    this.questions = newQuestions;
    localStorage.setItem('cbt_questions', JSON.stringify(this.questions));
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

  startExam(studentData) {
    this.student = studentData;
    this.answers = {};
    this.currentQuestionIndex = 0;
    this.cheatCount = 0;
    this.cheatLogs = [];
    this.isExamActive = true;
    this.remainingSeconds = (this.config.durationMinutes || 80) * 60;

    this.questions.forEach(q => {
      const type = q.type || 'single';
      if (type === 'multiple') {
        this.answers[q.id] = { answer: [], doubt: false };
      } else if (type === 'true_false') {
        this.answers[q.id] = { answer: {}, doubt: false };
      } else {
        this.answers[q.id] = { answer: null, doubt: false };
      }
    });

    this.saveSession();
    this.startTimer();
  }

  resumeSession(sessionData) {
    this.student = sessionData.student;
    this.answers = sessionData.answers || {};
    this.currentQuestionIndex = sessionData.currentQuestionIndex || 0;
    this.cheatCount = sessionData.cheatCount || 0;
    this.cheatLogs = sessionData.cheatLogs || [];
    this.remainingSeconds = sessionData.remainingSeconds || (this.config.durationMinutes * 60);
    this.isExamActive = true;

    this.startTimer();
  }

  saveSession() {
    if (!this.isExamActive) return;
    const sessionData = {
      student: this.student,
      answers: this.answers,
      currentQuestionIndex: this.currentQuestionIndex,
      remainingSeconds: this.remainingSeconds,
      cheatCount: this.cheatCount,
      cheatLogs: this.cheatLogs,
      isExamActive: this.isExamActive
    };
    localStorage.setItem('cbt_active_session', JSON.stringify(sessionData));
  }

  clearSession() {
    this.isExamActive = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    localStorage.removeItem('cbt_active_session');
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        this.saveSession();
        window.dispatchEvent(new CustomEvent('cbt-timer-tick', { 
          detail: { remainingSeconds: this.remainingSeconds } 
        }));
      } else {
        clearInterval(this.timerInterval);
        this.finishExam('Waktu Ujian 80 Menit Telah Habis! Sistem otomatis mengumpulkan lembar jawaban.');
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
    return this.questions[this.currentQuestionIndex];
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
    if (index >= 0 && index < this.questions.length) {
      this.currentQuestionIndex = index;
      this.saveSession();
    }
  }

  nextQuestion() {
    if (this.currentQuestionIndex < this.questions.length - 1) {
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
    let answered = 0;
    let doubt = 0;
    let unanswered = 0;

    this.questions.forEach(q => {
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
      total: this.questions.length,
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

  initSecurity() {
    document.addEventListener('contextmenu', (e) => {
      if (this.isExamActive) e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isExamActive) return;

      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S'))
      ) {
        e.preventDefault();
        this.recordViolation('Mencoba membuka inspect element / devtools');
      }

      if (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (this.isExamActive && document.hidden) {
        this.recordViolation('Terdeteksi berpindah tab atau meminimalkan browser!');
      }
    });

    window.addEventListener('blur', () => {
      if (this.isExamActive && !document.hidden) {
        this.recordViolation('Terdeteksi keluar dari fokus layar ujian!');
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (this.isExamActive && !document.fullscreenElement) {
        this.recordViolation('Keluar dari mode Layar Penuh (Fullscreen)!');
      }
    });
  }

  recordViolation(reason) {
    if (!this.isExamActive) return;

    this.cheatCount++;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID');
    this.cheatLogs.push({ time: timeStr, reason });
    this.saveSession();

    this.playAlarmSound();

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

    let totalPointsEarned = 0;
    let maxPossiblePoints = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    const detailedAnswers = this.questions.map(q => {
      const type = q.type || 'single';
      const weight = q.weight || 10;
      maxPossiblePoints += weight;

      const studentAnsData = this.answers[q.id];
      const studentAns = studentAnsData?.answer;
      let earned = 0;
      let isFullyCorrect = false;

      if (!this.isQuestionAnswered(q)) {
        unattemptedCount++;
      } else if (type === 'single') {
        if (studentAns === q.correctAnswer) {
          earned = weight;
          isFullyCorrect = true;
          correctCount++;
        } else {
          incorrectCount++;
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
        } else if (correctSelected > 0 && incorrectSelected === 0) {
          earned = Math.round((correctSelected / correctKeys.length) * weight);
          if (earned > 0) correctCount++; else incorrectCount++;
        } else {
          incorrectCount++;
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
          } else {
            incorrectCount++;
          }
        }
      }

      totalPointsEarned += earned;

      return {
        questionId: q.id,
        type: type,
        questionText: q.question,
        studentAnswer: studentAns,
        correctAnswer: q.correctAnswer,
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
      student: this.student,
      examTitle: this.config.examTitle,
      subject: this.config.subject,
      completedAt: new Date().toLocaleString('id-ID'),
      durationUsedSeconds: (this.config.durationMinutes * 60) - this.remainingSeconds,
      correctCount,
      incorrectCount,
      unattemptedCount,
      totalQuestions: this.questions.length,
      finalScore: finalScore,
      cheatCount: this.cheatCount,
      cheatLogs: this.cheatLogs,
      finishReason: reason || 'Selesai mandiri oleh peserta',
      detailedAnswers
    };

    const allResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
    allResults.unshift(resultRecord);
    localStorage.setItem('cbt_exam_results', JSON.stringify(allResults));

    // Kirim ke database cloud Supabase jika terhubung (Sinkronisasi 250 siswa ke laptop guru)
    if (typeof window.supabaseSync !== 'undefined') {
      window.supabaseSync.submitExamResult(resultRecord);
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
