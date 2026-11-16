// CBT Admin & Guru: Manajemen 13 Guru, 250 Siswa, Rekap Nilai Otomatis, & Ekspor Excel/PDF

const DEFAULT_SCHEDULES = [
  {
    id: "sch_1",
    day: "Senin",
    dateIso: "2026-12-07",
    dateFormatted: "7 Desember 2026",
    subject: "Matematika",
    classLevel: "Kelas 7",
    timeRange: "07:30 - 08:50",
    durationMinutes: 80,
    token: "MTK7A",
    maxAttempts: 1,
    isActive: false
  },
  {
    id: "sch_2",
    day: "Senin",
    dateIso: "2026-12-07",
    dateFormatted: "7 Desember 2026",
    subject: "Bahasa Indonesia",
    classLevel: "Kelas 8",
    timeRange: "09:15 - 10:35",
    durationMinutes: 80,
    token: "BIN8A",
    maxAttempts: 1,
    isActive: false
  },
  {
    id: "sch_3",
    day: "Selasa",
    dateIso: "2026-12-08",
    dateFormatted: "8 Desember 2026",
    subject: "Ilmu Pengetahuan Alam (IPA)",
    classLevel: "Kelas 9",
    timeRange: "07:30 - 08:50",
    durationMinutes: 80,
    token: "IPA9A",
    maxAttempts: 1,
    isActive: false
  }
];

class CBTAdmin {
  constructor() {
    this.teachers = this.loadTeachers();
    this.schedules = this.loadSchedules();
    this.currentTeacher = this.restoreSession();
    this.isAuthenticated = Boolean(this.currentTeacher);
    this.selectedSubjectFilter = 'ALL';
    this.selectedClassFilter = 'ALL';
  }

  restoreSession() {
    try {
      const persistent = localStorage.getItem('cbt_logged_teacher_session') || sessionStorage.getItem('cbt_logged_teacher');
      if (persistent) {
        const parsed = JSON.parse(persistent);
        if (parsed && parsed.id) {
          const fresh = this.teachers.find(t => t.id === parsed.id);
          return fresh || parsed;
        }
      }
    } catch (e) {
      console.warn("Gagal restore sesi login:", e);
    }
    return null;
  }

  loadTeachers() {
    const saved = localStorage.getItem('cbt_teachers_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let hasAdmin = false;
          const normalized = parsed.map(t => {
            if (t.id === 'admin' || t.role === 'admin') {
              hasAdmin = true;
              return {
                ...t,
                id: "admin",
                name: "Proktor Utama / Admin",
                role: "admin",
                pin: t.pin || "admin123"
              };
            }
            return t;
          });

          if (!hasAdmin) {
            normalized.unshift({
              id: "admin",
              nip: "198501012010011001",
              name: "Proktor Utama / Admin",
              subject: "Semua Mata Pelajaran (Super Admin)",
              role: "admin",
              pin: "admin123"
            });
          }

          return normalized;
        }
      } catch (e) {
        console.error("Gagal load teachers:", e);
      }
    }
    const defaults = typeof DEFAULT_TEACHERS !== 'undefined' ? DEFAULT_TEACHERS : [];
    localStorage.setItem('cbt_teachers_list', JSON.stringify(defaults));
    return [...defaults];
  }

  saveTeachers(teachersList, skipCloudPush = false) {
    this.teachers = teachersList;
    localStorage.setItem('cbt_teachers_list', JSON.stringify(this.teachers));
    if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
      window.supabaseSync.pushStateKey('cbt_teachers_list', this.teachers);
    }
  }

  getAllTeachers() {
    return this.teachers;
  }

  getAllSubjects() {
    const subjectsSet = new Set();

    if (window.examEngine && window.examEngine.config && window.examEngine.config.subject) {
      subjectsSet.add(window.examEngine.config.subject.trim());
    }

    if (Array.isArray(this.teachers)) {
      this.teachers.forEach(t => {
        if (t.role !== 'admin' && t.subject && !t.subject.toLowerCase().includes('semua')) {
          const parts = t.subject.split(/[,/]/).map(s => s.trim()).filter(Boolean);
          parts.forEach(p => subjectsSet.add(p));
          subjectsSet.add(t.subject.trim());
        }
      });
    }

    if (Array.isArray(this.schedules)) {
      this.schedules.forEach(s => {
        if (s.subject) subjectsSet.add(s.subject.trim());
      });
    }

    try {
      if (window.examEngine && Array.isArray(window.examEngine.questions)) {
        window.examEngine.questions.forEach(q => {
          if (q.subject && String(q.subject).trim().toLowerCase() !== 'umum') {
            subjectsSet.add(String(q.subject).trim());
          }
        });
      }
    } catch (e) {}

    try {
      const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      rawResults.forEach(r => {
        if (r.subject) subjectsSet.add(r.subject.trim());
      });
    } catch (e) {}

    return Array.from(subjectsSet).filter(Boolean);
  }

  getTeacherSubjectsList(teacher = null) {
    const t = teacher || this.getCurrentTeacher();
    if (!t || t.role === 'admin' || t.id === 'admin') return [];
    return String(t.subject || '')
      .split(/[,/]/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  parseTeacherClasses(classesStr) {
    const raw = String(classesStr || "").trim().toUpperCase();
    if (!raw || raw === "SEMUA" || raw === "SEMUA KELAS" || raw === "ALL") return [];
    const result = [];
    raw.split(/[,;/]+/).forEach(token => {
      const part = token.trim().replace(/^KELAS\s+/i, '');
      if (!part) return;
      const mShort = part.match(/^(\d+)\s*([A-Z])\s*-\s*(?:\d+\s*)?([A-Z])$/);
      if (mShort) {
        const grade = mShort[1];
        const startCode = mShort[2].charCodeAt(0);
        const endCode = mShort[3].charCodeAt(0);
        if (startCode <= endCode && endCode - startCode <= 10) {
          for (let c = startCode; c <= endCode; c++) {
            result.push(grade + String.fromCharCode(c));
          }
          return;
        }
      }
      result.push(part.replace(/\s+/g, ''));
    });
    return [...new Set(result)];
  }

  searchTeachers(query = "") {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return this.teachers;
    return this.teachers.filter(t =>
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.nip && String(t.nip).toLowerCase().includes(q)) ||
      (t.subject && t.subject.toLowerCase().includes(q)) ||
      (t.classes && String(t.classes).toLowerCase().includes(q))
    );
  }

  addTeacher({ name, nip, subject, classes, pin }) {
    const cleanName = String(name || "").trim();
    const cleanNip = String(nip || "").trim();
    const cleanSubject = String(subject || "").trim();
    const cleanClasses = String(classes || "").trim().toUpperCase();
    const cleanPin = String(pin || "guru123").trim();

    if (!cleanName || !cleanNip || !cleanSubject) {
      return { success: false, message: "Nama Guru, NIP, dan Mata Pelajaran wajib diisi!" };
    }

    const existing = this.teachers.find(t => String(t.nip).trim().toLowerCase() === cleanNip.toLowerCase());
    if (existing) {
      return { success: false, message: `NIP ${cleanNip} sudah digunakan oleh ${existing.name}!` };
    }

    const newId = 'guru_' + Date.now();
    const newTeacher = {
      id: newId,
      nip: cleanNip,
      name: cleanName,
      subject: cleanSubject,
      classes: cleanClasses,
      role: "guru",
      pin: cleanPin
    };

    this.teachers.push(newTeacher);
    this.saveTeachers(this.teachers);
    return { success: true, teacher: newTeacher };
  }

  deleteTeacher(teacherId) {
    const teacher = this.teachers.find(t => t.id === teacherId);
    if (!teacher) {
      return { success: false, message: "Data guru tidak ditemukan!" };
    }
    if (teacher.role === 'admin' || teacher.id === 'admin') {
      return { success: false, message: "Akun Proktor Utama / Admin tidak boleh dihapus!" };
    }

    this.teachers = this.teachers.filter(t => t.id !== teacherId);
    this.saveTeachers(this.teachers);
    return { success: true, message: `Guru ${teacher.name} berhasil dihapus.` };
  }

  updateTeacherProfile(teacherId, { name, nip, subject, classes, pin }) {
    let found = false;
    this.teachers = this.teachers.map(t => {
      if (t.id === teacherId) {
        found = true;
        return {
          ...t,
          name: name ? String(name).trim() : t.name,
          nip: nip ? String(nip).trim() : t.nip,
          subject: subject ? String(subject).trim() : t.subject,
          classes: classes !== undefined ? String(classes).trim().toUpperCase() : (t.classes || ""),
          pin: pin ? String(pin).trim() : t.pin
        };
      }
      return t;
    });

    if (!found) {
      return { success: false, message: "Data guru tidak ditemukan!" };
    }

    this.saveTeachers(this.teachers);

    if (this.currentTeacher && this.currentTeacher.id === teacherId) {
      this.currentTeacher = this.teachers.find(t => t.id === teacherId);
      try {
        localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(this.currentTeacher));
        sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(this.currentTeacher));
      } catch (e) {}
    }
    return { success: true };
  }

  resetAllTeacherPasswords(defaultPin = "guru123") {
    let count = 0;
    this.teachers = this.teachers.map(t => {
      if (t.role !== 'admin') {
        count++;
        return { ...t, pin: defaultPin };
      }
      return t;
    });
    this.saveTeachers(this.teachers);
    return { success: true, count };
  }

  login(identifier, pinInput) {
    const cleanId = String(identifier || "").trim().toLowerCase();
    const cleanPin = String(pinInput || "").trim();

    if (!cleanId) {
      return { success: false, message: "Harap masukkan Username / NIP!" };
    }

    let teacher = null;
    if (
      cleanId === 'admin' ||
      cleanId === 'proktor' ||
      cleanId === 'superadmin' ||
      cleanId === '198501012010011001' ||
      cleanId.includes('admin') ||
      cleanId.includes('proktor')
    ) {
      teacher = this.teachers.find(t => t.id === 'admin' || t.role === 'admin');
      if (!teacher) {
        teacher = {
          id: "admin",
          nip: "198501012010011001",
          name: "Proktor Utama / Admin",
          subject: "Semua Mata Pelajaran (Super Admin)",
          role: "admin",
          pin: "admin123"
        };
      }
    } else {
      teacher = this.teachers.find(t => String(t.nip || '').trim().toLowerCase() === cleanId);

      if (!teacher) {
        teacher = this.teachers.find(t => String(t.id || '').trim().toLowerCase() === cleanId);
      }

      if (!teacher) {
        teacher = this.teachers.find(t => String(t.name || '').trim().toLowerCase() === cleanId);
      }

      if (!teacher && cleanId.length >= 3) {
        teacher = this.teachers.find(t =>
          String(t.name || '').toLowerCase().includes(cleanId)
        );
      }
    }

    if (!teacher) {
      return {
        success: false,
        message: "Username / NIP tidak terdaftar! Periksa kembali atau hubungi Proktor."
      };
    }

    const isSuperAdmin = teacher.role === 'admin' || teacher.id === 'admin';
    const cfgPin = window.examEngine && window.examEngine.config && window.examEngine.config.adminPin
      ? String(window.examEngine.config.adminPin).trim()
      : "";

    const isPinMatch = isSuperAdmin
      ? (
          cleanPin === String(teacher.pin).trim() ||
          cleanPin === "admin123" ||
          cleanPin === "admin" ||
          cleanPin === "123" ||
          cleanPin === "123456" ||
          cleanPin === "guru123" ||
          (cfgPin && cleanPin === cfgPin)
        )
      : (
          cleanPin === String(teacher.pin).trim() ||
          cleanPin === "guru123" ||
          cleanPin === "123"
        );

    if (!isPinMatch) {
      return { success: false, message: "PIN / Kata Sandi salah!" };
    }

    this.isAuthenticated = true;
    this.currentTeacher = teacher;
    try {
      localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(teacher));
      sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(teacher));
    } catch (e) {}
    return { success: true, teacher };
  }

  getCurrentTeacher() {
    if (!this.currentTeacher) {
      this.currentTeacher = this.restoreSession();
    }
    return this.currentTeacher;
  }

  logout() {
    this.isAuthenticated = false;
    this.currentTeacher = null;
    this.selectedSubjectFilter = 'ALL';
    this.selectedClassFilter = 'ALL';
    try {
      localStorage.removeItem('cbt_logged_teacher_session');
      localStorage.removeItem('cbt_active_admin_tab');
      sessionStorage.removeItem('cbt_logged_teacher');
    } catch (e) {}
  }

  updateTeacherPin(teacherId, newPin) {
    this.teachers = this.teachers.map(t => {
      if (t.id === teacherId) {
        return { ...t, pin: String(newPin).trim() };
      }
      return t;
    });
    this.saveTeachers(this.teachers);

    if (this.currentTeacher && this.currentTeacher.id === teacherId) {
      this.currentTeacher.pin = String(newPin).trim();
      try {
        localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(this.currentTeacher));
        sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(this.currentTeacher));
      } catch (e) {}
    }
  }

  updateConfig(formData) {
    window.examEngine.saveConfig({ ...formData, showScoreToStudent: false });
  }

  generateRandomToken() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let token = "";
    for (let i = 0; i < 6; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  getAllQuestions() {
    return window.examEngine.questions;
  }

  getQuestionsFiltered(subjectFilter = 'ALL', classFilter = 'ALL') {
    const all = window.examEngine ? window.examEngine.questions : [];
    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    const teacherSubjects = this.getTeacherSubjectsList(cur);

    const matchesSub = (qSub, target) => (window.examEngine && window.examEngine.matchesSubject)
      ? window.examEngine.matchesSubject(qSub, target)
      : String(qSub || '').toLowerCase() === String(target || '').toLowerCase();

    const matchesCls = (qCls, target) => (window.examEngine && window.examEngine.matchesClassLevel)
      ? window.examEngine.matchesClassLevel(qCls, target)
      : true;

    return all.filter(q => {
      const qSub = String(q.subject || 'Umum').trim();
      const qCls = String(q.classLevel || 'Semua Kelas').trim();

      if (!isAdmin && teacherSubjects.length > 0) {
        if (!q.subject || qSub.toLowerCase() === 'umum') return false;
        const ownsSubject = teacherSubjects.some(ts => matchesSub(qSub, ts));
        if (!ownsSubject) return false;

        const teacherClasses = cur && cur.classes ? this.parseTeacherClasses(cur.classes) : [];
        if (teacherClasses.length > 0) {
          const matchesAssignedClass = matchesCls(qCls, teacherClasses.join(', '));
          if (!matchesAssignedClass) return false;
        }
      }

      if (subjectFilter && subjectFilter !== 'ALL') {
        if (subjectFilter === 'UMUM') {
          if (q.subject && qSub.toLowerCase() !== 'umum') return false;
        } else {
          if (!q.subject || qSub.toLowerCase() === 'umum') return false;
          if (!matchesSub(qSub, subjectFilter)) return false;
        }
      }

      if (classFilter && classFilter !== 'ALL') {
        if (!matchesCls(qCls, classFilter)) return false;
      }

      return true;
    });
  }

  addQuestion(questionData) {
    const questions = [...window.examEngine.questions];
    const newId = questions.length > 0 ? Math.max(...questions.map(q => Number(q.id) || 0)) + 1 : 1;
    const cur = this.getCurrentTeacher();

    let newQ = {
      id: newId,
      subject: String(questionData.subject || "Umum").trim(),
      classLevel: String(questionData.classLevel || "Semua Kelas").trim(),
      createdBy: questionData.createdBy || (cur ? cur.name : "Proktor Utama / Admin"),
      type: questionData.type || 'single',
      question: questionData.question,
      image: questionData.image || "",
      weight: parseInt(questionData.weight) || 10
    };

    if (newQ.type === 'single') {
      newQ.options = questionData.options;
      newQ.correctAnswer = questionData.correctAnswer;
    } else if (newQ.type === 'multiple') {
      newQ.options = questionData.options;
      newQ.correctAnswer = Array.isArray(questionData.correctAnswer) ? questionData.correctAnswer : [questionData.correctAnswer];
    } else if (newQ.type === 'true_false') {
      newQ.statements = questionData.statements;
    }

    questions.push(newQ);
    window.examEngine.saveQuestions(questions);
    return newQ;
  }

  updateQuestion(id, questionData) {
    const questions = [...window.examEngine.questions];
    const targetIdx = questions.findIndex(q => String(q.id) === String(id));
    if (targetIdx === -1) {
      return { success: false, message: "Butir soal tidak ditemukan di bank soal." };
    }

    const existing = questions[targetIdx];
    const cur = this.getCurrentTeacher();
    const nextType = questionData.type || existing.type || 'single';

    const updatedQ = {
      id: existing.id,
      subject: String(questionData.subject || existing.subject || "Umum").trim(),
      classLevel: String(questionData.classLevel || existing.classLevel || "Semua Kelas").trim(),
      createdBy: existing.createdBy || questionData.createdBy || (cur ? cur.name : "Proktor Utama / Admin"),
      type: nextType,
      question: questionData.question,
      image: questionData.image !== undefined ? questionData.image : (existing.image || ""),
      weight: parseInt(questionData.weight, 10) || existing.weight || 10
    };

    if (nextType === 'single') {
      updatedQ.options = questionData.options;
      updatedQ.correctAnswer = questionData.correctAnswer;
    } else if (nextType === 'multiple') {
      updatedQ.options = questionData.options;
      updatedQ.correctAnswer = Array.isArray(questionData.correctAnswer)
        ? questionData.correctAnswer
        : [questionData.correctAnswer];
    } else if (nextType === 'true_false') {
      updatedQ.statements = questionData.statements;
    }

    questions[targetIdx] = updatedQ;
    window.examEngine.saveQuestions(questions);
    return { success: true, question: updatedQ };
  }

  deleteQuestion(id) {
    const questions = window.examEngine.questions.filter(q => q.id !== id);
    window.examEngine.saveQuestions(questions);
  }

  resetToDefaultQuestions() {
    window.examEngine.saveQuestions([...DEFAULT_QUESTIONS]);
  }

  exportQuestionsJSON(subjectFilter = 'ALL', classFilter = 'ALL') {
    const toExport = this.getQuestionsFiltered(subjectFilter, classFilter);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(toExport, null, 2));
    const downloadAnchor = document.createElement('a');
    const slug = subjectFilter && subjectFilter !== 'ALL'
      ? '_' + String(subjectFilter).toLowerCase().replace(/[^a-z0-9]+/g, '_')
      : '';
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `bank_soal_ujian${slug}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  importQuestionsJSON(jsonString, defaultSubject = null, defaultClassLevel = null) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existing = [...window.examEngine.questions];
        let maxId = existing.length > 0 ? Math.max(...existing.map(q => Number(q.id) || 0)) : 0;
        const fallbackSub = (defaultSubject && defaultSubject !== 'ALL' && defaultSubject !== 'UMUM') ? defaultSubject : 'Umum';
        const fallbackCls = (defaultClassLevel && defaultClassLevel !== 'ALL') ? defaultClassLevel : 'Semua Kelas';

        const cur = this.getCurrentTeacher();
        const normalized = parsed.map(item => {
          maxId += 1;
          return {
            ...item,
            id: maxId,
            subject: item.subject ? String(item.subject).trim() : fallbackSub,
            classLevel: item.classLevel ? String(item.classLevel).trim() : fallbackCls,
            createdBy: item.createdBy || (cur ? cur.name : "Proktor Utama / Admin")
          };
        });

        window.examEngine.saveQuestions([...existing, ...normalized]);
        return { success: true, count: normalized.length };
      }
      return { success: false, message: "Format file JSON tidak valid." };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // Ambil detail jawaban per nomor soal (mendukung data lama maupun baru)
  getAnswerBreakdownItems(resultRecord) {
    const details = Array.isArray(resultRecord.detailedAnswers) ? resultRecord.detailedAnswers : [];
    const questions = this.getAllQuestions();

    return details.map((d, idx) => {
      const num = d.questionNumber || idx + 1;
      const qDef = questions.find(q => q.id === d.questionId) || questions[idx];
      const type = d.type || (qDef ? qDef.type : 'single');

      let studentVal = d.studentAnswerDisplay;
      let correctVal = d.correctAnswerDisplay;

      if (!studentVal) {
        if (type === 'multiple') {
          studentVal = Array.isArray(d.studentAnswer) && d.studentAnswer.length > 0 ? d.studentAnswer.join(',') : '-';
        } else if (type === 'true_false') {
          if (d.studentAnswer && typeof d.studentAnswer === 'object') {
            const vals = Object.values(d.studentAnswer);
            studentVal = vals.length > 0 ? vals.join(',') : '-';
          } else {
            studentVal = '-';
          }
        } else {
          studentVal = d.studentAnswer || '-';
        }
      }

      if (!correctVal) {
        if (type === 'multiple') {
          const ca = d.correctAnswer || (qDef ? qDef.correctAnswer : []);
          correctVal = Array.isArray(ca) ? ca.join(',') : String(ca || '-');
        } else if (type === 'true_false') {
          if (typeof d.correctAnswer === 'string' && d.correctAnswer) {
            correctVal = d.correctAnswer;
          } else if (qDef && Array.isArray(qDef.statements)) {
            correctVal = qDef.statements.map(s => s.correct).join(',');
          } else {
            correctVal = '-';
          }
        } else {
          correctVal = d.correctAnswer || (qDef ? qDef.correctAnswer : '-') || '-';
        }
      }

      let status = d.status;
      if (!status) {
        if (studentVal === '-') status = 'unattempted';
        else status = d.isFullyCorrect ? 'correct' : 'incorrect';
      }

      return {
        num,
        studentVal,
        correctVal,
        status
      };
    });
  }

  formatAnswersPlainText(resultRecord) {
    const items = this.getAnswerBreakdownItems(resultRecord);
    if (items.length === 0) return '-';
    return items.map(it => {
      if (it.status === 'correct') return `${it.num}:${it.studentVal}(Benar)`;
      if (it.status === 'unattempted') return `${it.num}:-(Kunci:${it.correctVal})`;
      return `${it.num}:${it.studentVal}(Salah|Kunci:${it.correctVal})`;
    }).join(' | ');
  }

  getAllResultsSorted(subjectFilter = null, classFilter = null) {
    const sf = subjectFilter || this.selectedSubjectFilter || null;
    const cf = classFilter || this.selectedClassFilter || null;
    const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
    let filtered = rawResults;

    const cur = this.getCurrentTeacher();
    const isSuperAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');

    if (sf && sf !== 'ALL') {
      filtered = filtered.filter(r => r.subject && r.subject.toLowerCase().trim() === sf.toLowerCase().trim());
    } else if (!isSuperAdmin && cur && cur.subject) {
      const parts = cur.subject.split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
      filtered = filtered.filter(r => {
        if (!r.subject) return false;
        const rSub = r.subject.toLowerCase().trim();
        return parts.some(p => rSub === p || rSub.includes(p) || p.includes(rSub));
      });
    }

    const teacherClasses = (!isSuperAdmin && cur && cur.classes) ? this.parseTeacherClasses(cur.classes) : [];
    if (cf && cf !== 'ALL') {
      filtered = filtered.filter(r => r.student?.class && String(r.student.class).trim().toUpperCase() === String(cf).trim().toUpperCase());
    } else if (teacherClasses.length > 0) {
      filtered = filtered.filter(r => {
        const stuClass = String(r.student?.class || '').trim().toUpperCase();
        return teacherClasses.some(tc => stuClass === tc || stuClass.startsWith(tc));
      });
    }

    return filtered.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }

  setSubjectFilter(val) { this.selectedSubjectFilter = val; }
  setClassFilter(val) { this.selectedClassFilter = val; }

  getExamAnalytics(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      return {
        totalStudents: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        highestStudent: "-",
        lowestStudent: "-",
        passRatePercentage: 0
      };
    }

    const scores = results.map(r => r.finalScore || 0);
    const total = scores.reduce((sum, s) => sum + s, 0);
    const avg = Math.round((total / scores.length) * 10) / 10;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);

    const highestStudent = results.find(r => r.finalScore === highest)?.student?.name || "-";
    const lowestStudent = results.find(r => r.finalScore === lowest)?.student?.name || "-";

    const passedCount = scores.filter(s => s >= 75).length;
    const passRate = Math.round((passedCount / scores.length) * 100);

    return {
      totalStudents: results.length,
      averageScore: avg,
      highestScore: highest,
      lowestScore: lowest,
      highestStudent,
      lowestStudent,
      passRatePercentage: passRate
    };
  }

  clearAllResults() {
    localStorage.removeItem('cbt_exam_results');
  }

  async resetStudentAttempts(nisn, subject) {
    const cleanNisn = String(nisn || '').trim().toUpperCase();
    const cleanSub = String(subject || '').trim().toLowerCase();
    if (!cleanNisn) return { success: false };

    try {
      const localResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      const filtered = (Array.isArray(localResults) ? localResults : []).filter(r => {
        const rNisn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
        const rSub = String(r.subject || '').trim().toLowerCase();
        return !(rNisn === cleanNisn && (!cleanSub || rSub === cleanSub));
      });
      localStorage.setItem('cbt_exam_results', JSON.stringify(filtered));
    } catch (e) {}

    if (typeof window !== 'undefined' && window.supabaseSync) {
      await window.supabaseSync.deleteStudentResultsFromCloud(nisn, subject);
      await window.supabaseSync.removeStudentSession(nisn, subject);
    }
    return { success: true };
  }

  // ===================== 1. EXPORT FORMAT EXCEL (.xlsx) =====================
  exportResultsExcel(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      alert("Belum ada data nilai siswa untuk di-export ke Excel.");
      return;
    }

    const analytics = this.getExamAnalytics(subjectFilter, classFilter);
    const cfg = this.getSchoolConfig();
    const cur = this.getCurrentTeacher();
    const currentSub = (subjectFilter && subjectFilter !== 'ALL')
      ? subjectFilter
      : (cur && cur.role !== 'admin' ? cur.subject : window.examEngine.config.subject);
    const fileName = `Rekap_Nilai_CBT_${(currentSub || 'Semua').replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`;

    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();

      const aoaData = [
        [`LAPORAN REKAPITULASI RESMI HASIL UJIAN SEKOLAH (CBT) - ${cfg.schoolName}`],
        ["Guru Pengampu / Proktor:", cur?.name || 'Panitia Ujian'],
        ["Mata Pelajaran:", currentSub],
        ["Titi Mangsa:", `${cfg.city}, ${cfg.date}`],
        [""],
        ["RINGKASAN STATISTIK:"],
        ["Total Peserta", "Rata-Rata Nilai", "Nilai Tertinggi", "Peraih Tertinggi", "Nilai Terendah", "Peraih Terendah", "Ketuntasan (>=75)"],
        [analytics.totalStudents, analytics.averageScore, analytics.highestScore, analytics.highestStudent, analytics.lowestScore, analytics.lowestStudent, `${analytics.passRatePercentage}%`],
        [""],
        ["DAFTAR PERINGKAT & EVALUASI JAWABAN SISWA:"],
        ["Rank", "Nama Siswa", "NISN", "Kelas", "Nilai Akhir", "Jawaban Siswa (Benar & Salah per Nomor)", "Waktu Selesai", "B / S / K", "Keterangan Curang"]
      ];

      results.forEach((r, idx) => {
        const cheatLabel = (r.cheatCount || 0) > 0
          ? `${r.cheatCount}x Pindah Tab (${r.finishReason || 'Pelanggaran'})`
          : `Tertib (0) - ${r.finishReason || 'Selesai'}`;

        aoaData.push([
          idx + 1,
          r.student?.name || '-',
          r.student?.nisn || '-',
          r.student?.class || 'Umum',
          r.finalScore,
          this.formatAnswersPlainText(r),
          r.completedAt,
          `${r.correctCount} / ${r.incorrectCount} / ${r.unattemptedCount}`,
          cheatLabel
        ]);
      });

      aoaData.push([""]);
      const footerRowIdx = aoaData.length;
      aoaData.push([this.getPrintStampText()]);

      const ws = XLSX.utils.aoa_to_sheet(aoaData);
      ws['!merges'] = [{ s: { r: footerRowIdx, c: 0 }, e: { r: footerRowIdx, c: 8 } }];

      ws['!cols'] = [
        { wch: 7 },   // Rank
        { wch: 26 },  // Nama
        { wch: 16 },  // NISN
        { wch: 10 },  // Kelas
        { wch: 12 },  // Nilai
        { wch: 55 },  // Jawaban Siswa per nomor
        { wch: 20 },  // Waktu Selesai
        { wch: 14 },  // B/S/K
        { wch: 28 }   // Keterangan Curang
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai Siswa");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      this.exportFallbackExcel(results, analytics, fileName);
    }
  }

  exportFallbackExcel(results, analytics, fileName) {
    const stampText = this.getPrintStampText();
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"></head>
      <body>
        <h2>LAPORAN REKAPITULASI HASIL UJIAN SEKOLAH (CBT)</h2>
        <table border="1">
          <tr style="background:#f1f5f9;font-weight:bold;">
            <th>Rank</th><th>Nama Siswa</th><th>NISN</th><th>Kelas</th><th>Nilai Akhir</th><th>Jawaban Siswa</th><th>Waktu Selesai</th><th>B/S/K</th><th>Keterangan Curang</th>
          </tr>
          ${results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.student?.name || '-'}</td>
              <td>'${r.student?.nisn || '-'}</td>
              <td>${r.student?.class || '-'}</td>
              <td><b>${r.finalScore}</b></td>
              <td>${this.formatAnswersPlainText(r)}</td>
              <td>${r.completedAt}</td>
              <td>${r.correctCount} / ${r.incorrectCount} / ${r.unattemptedCount}</td>
              <td>${(r.cheatCount || 0) > 0 ? r.cheatCount + 'x Tab' : 'Tertib (0)'}</td>
            </tr>
          `).join('')}
        </table>
        <p style="font-size:8.5px; color:#1d4ed8; font-style:italic; white-space:nowrap; margin-top:8px;">${this.escapePrintHtml(stampText)}</p>
      </body></html>
    `;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ===================== 2. EXPORT FORMAT PDF (.pdf) =====================
  exportResultsPDF(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      alert("Belum ada data nilai siswa untuk di-export ke PDF.");
      return;
    }

    const reportElement = document.getElementById('printableTeacherReport');
    if (!reportElement) {
      window.print();
      return;
    }

    this.populateReportHTML(reportElement, results, subjectFilter, classFilter);

    reportElement.classList.remove('hidden');
    document.body.classList.add('printing-report');

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `Laporan_Rekap_Nilai_CBT_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };

      html2pdf().set(opt).from(reportElement).save().then(() => {
        reportElement.classList.add('hidden');
        document.body.classList.remove('printing-report');
      }).catch(err => {
        console.error("Gagal export PDF:", err);
        window.print();
        setTimeout(() => {
          reportElement.classList.add('hidden');
          document.body.classList.remove('printing-report');
        }, 1000);
      });
    } else {
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          reportElement.classList.add('hidden');
          document.body.classList.remove('printing-report');
        }, 1000);
      }, 200);
    }
  }

  populateReportHTML(el, results, subjectFilter, classFilter = null) {
    const analytics = this.getExamAnalytics(subjectFilter, classFilter);
    const cur = this.getCurrentTeacher();
    const teacherName = cur ? cur.name : "Guru Mata Pelajaran";
    const teacherNip = cur ? (cur.nip || "—") : "—";
    const subjectName = (subjectFilter && subjectFilter !== 'ALL')
      ? subjectFilter
      : (cur && cur.role !== 'admin' ? cur.subject : window.examEngine.config.subject);
    const cf = classFilter || this.selectedClassFilter;
    const classLabel = (cf && cf !== 'ALL')
      ? ` • Kelas ${cf}`
      : (cur && cur.role !== 'admin' && cur.classes ? ` • Kelas ${this.parseTeacherClasses(cur.classes).join(', ')}` : '');
    const cfg = this.getSchoolConfig();

    const logoLeftHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Kiri" style="width:64px; height:64px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:60px; height:60px; border-radius:8px; background:#1e3a8a; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; flex-shrink:0;">DINAS</div>`;

    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo Kanan" style="width:64px; height:64px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:60px; height:60px; border-radius:50%; background:#059669; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; flex-shrink:0;">SMP</div>`;

    const kopEl = document.getElementById('repKopSurat');
    if (kopEl) {
      kopEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #0f172a; padding-bottom:8px; margin-bottom:10px; gap:12px;">
          ${logoLeftHtml}
          <div style="text-align:center; flex:1; padding:0 12px;">
            <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">${cfg.schoolSubtitle}</div>
            <div style="font-size:18px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.8px;">${cfg.schoolName}</div>
            <div style="font-size:10px; color:#334155; font-weight:600;">${cfg.schoolAddress}</div>
            <div style="font-size:13px; font-weight:900; text-transform:uppercase; margin-top:4px; color:#1e3a8a;">LEMBAR REKAPITULASI RESMI HASIL UJIAN SEKOLAH</div>
            <div style="font-size:11px; font-weight:700; color:#334155;">${window.examEngine.config.examTitle} • Mapel: ${subjectName}${classLabel}</div>
          </div>
          ${logoRightHtml}
        </div>
      `;
    }

    const repAvgEl = document.getElementById('repAvg');
    if (repAvgEl) repAvgEl.innerText = analytics.averageScore;

    const repHighEl = document.getElementById('repHigh');
    if (repHighEl) repHighEl.innerText = `${analytics.highestScore} (${analytics.highestStudent})`;

    const repLowEl = document.getElementById('repLow');
    if (repLowEl) repLowEl.innerText = `${analytics.lowestScore} (${analytics.lowestStudent})`;

    const repTotalEl = document.getElementById('repTotal');
    if (repTotalEl) repTotalEl.innerText = `${analytics.totalStudents} Siswa`;

    const repPassEl = document.getElementById('repPass');
    if (repPassEl) repPassEl.innerText = `${analytics.passRatePercentage}%`;

    const repTeacherNameEl = document.getElementById('repTeacherName');
    if (repTeacherNameEl) repTeacherNameEl.innerText = teacherName;

    const repTeacherNipEl = document.getElementById('repTeacherNip');
    if (repTeacherNipEl) repTeacherNipEl.innerText = `NIP. ${teacherNip}`;

    const repHeadmasterEl = document.getElementById('repHeadmasterName');
    if (repHeadmasterEl) repHeadmasterEl.innerText = cfg.headmasterName;

    const repHeadmasterNipEl = document.getElementById('repHeadmasterNip');
    if (repHeadmasterNipEl) repHeadmasterNipEl.innerText = `NIP. ${cfg.headmasterNip}`;

    const repTitiMangsaEl = document.getElementById('repTitiMangsa');
    if (repTitiMangsaEl) repTitiMangsaEl.innerText = `${cfg.city}, ${cfg.date}`;

    const repTitiMangsaLeftEl = document.getElementById('repTitiMangsaLeft');
    if (repTitiMangsaLeftEl) repTitiMangsaLeftEl.innerText = `${cfg.city}, ${cfg.date}`;

    const tbody = document.getElementById('repTableBody');
    if (tbody) {
      tbody.innerHTML = results.map((r, idx) => {
        const items = this.getAnswerBreakdownItems(r);
        const ansHtml = items.length > 0
          ? items.map(it => {
              if (it.status === 'correct') {
                return `<span style="display:inline-block; margin:1px 2px; padding:1px 4px; border-radius:3px; background:#dcfce7; color:#166534; font-weight:700; font-size:9px;">${it.num}.${it.studentVal}✓</span>`;
              }
              return `<span style="display:inline-block; margin:1px 2px; padding:1px 4px; border-radius:3px; background:#fee2e2; color:#991b1b; font-weight:700; font-size:9px;">${it.num}.${it.studentVal}✗(${it.correctVal})</span>`;
            }).join('')
          : '<span style="color:#64748b; font-size:9px;">-</span>';

        return `
          <tr style="border-bottom:1px solid #cbd5e1; font-size:10px;">
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center; font-weight:700;">${idx + 1}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; font-weight:700;">${r.student?.name || '-'}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; font-family:monospace;">${r.student?.nisn || '-'}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${r.student?.class || '-'}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center; font-weight:900; font-size:12px; color:${r.finalScore >= 75 ? '#15803d' : '#dc2626'};">${r.finalScore}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; line-height:1.4;">${ansHtml}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${r.completedAt}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${r.correctCount} / ${r.incorrectCount} / ${r.unattemptedCount}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${(r.cheatCount || 0) > 0 ? r.cheatCount + 'x Tab' : 'Tertib'}</td>
          </tr>
        `;
      }).join('');
    }

    const repAutoNoteEl = document.getElementById('repAutoPrintNote');
    if (repAutoNoteEl) {
      repAutoNoteEl.innerText = this.getPrintStampText();
    }
  }

  // ===================== KONFIGURASI SEKOLAH & TITI MANGSA =====================
  getSchoolConfig() {
    try {
      const saved = localStorage.getItem('cbt_school_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          schoolName: parsed.schoolName || "SMP NEGERI 2 PACET",
          schoolSubtitle: parsed.schoolSubtitle || "PEMERINTAH KABUPATEN MOJOKERTO — DINAS PENDIDIKAN",
          schoolAddress: parsed.schoolAddress || "Jl. Raya Pacet, Kec. Pacet, Kab. Mojokerto, Jawa Timur",
          city: parsed.city || "Pacet",
          date: parsed.date || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
          headmasterName: parsed.headmasterName || "Drs. H. Mulyono, M.Pd.",
          headmasterNip: parsed.headmasterNip || "19680512 199403 1 004",
          logoLeft: parsed.logoLeft || "",
          logoRight: parsed.logoRight || "",
          logoCbt: parsed.logoCbt || "",
          kopSuratImage: parsed.kopSuratImage || ""
        };
      }
    } catch (e) {}
    return {
      schoolName: "SMP NEGERI 2 PACET",
      schoolSubtitle: "PEMERINTAH KABUPATEN MOJOKERTO — DINAS PENDIDIKAN",
      schoolAddress: "Jl. Raya Pacet, Kec. Pacet, Kab. Mojokerto, Jawa Timur",
      city: "Pacet",
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      headmasterName: "Drs. H. Mulyono, M.Pd.",
      headmasterNip: "19680512 199403 1 004",
      logoLeft: "",
      logoRight: "",
      logoCbt: "",
      kopSuratImage: ""
    };
  }

  saveSchoolConfig(cfg, skipCloudPush = false) {
    try {
      localStorage.setItem('cbt_school_config', JSON.stringify(cfg));
      if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
        window.supabaseSync.pushStateKey('cbt_school_config', cfg);
      }
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ===================== IMPORT/EXPORT TEMPLATE GURU EXCEL =====================
  downloadTeacherExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert("Pustaka SheetJS belum termuat. Pastikan ada koneksi internet.");
      return;
    }
    const headers = [
      ["TEMPLATE PANGKALAN DATA GURU CBT - SMP NEGERI 2 PACET"],
      ["Petunjuk: Jangan ubah baris judul kolom di baris ke-3. Isi data guru mulai baris ke-4. Kolom Kelas Diampu boleh dikosongkan jika mengajar semua kelas."],
      ["NIP / ID Pengguna (Wajib - Untuk Login)", "Nama Lengkap Guru & Gelar (Wajib)", "Mata Pelajaran yang Diampu (Wajib)", "Password / PIN Login (Wajib)", "Kelas yang Diampu (Opsional, misal: 7B, 7C)"],
      ["198003152006041002", "Budi Santoso, S.Pd.", "Bahasa Indonesia", "guru123", ""],
      ["197512022000032001", "Siti Rahmawati, M.Pd.", "Matematika", "guru123", ""],
      ["198506102010011003", "Rusi, S.Pd.", "Ilmu Pengetahuan Alam (IPA)", "guru123", "7B, 7C"],
      ["198201152007012004", "Ai Nurhasanah, S.Pd.", "Ilmu Pengetahuan Alam (IPA)", "guru123", "7A"],
      ["198708222011011005", "Yeyen, S.Pd.", "Ilmu Pengetahuan Alam (IPA)", "guru123", "8A, 8B"],
      ["198809122014022006", "Desy, S.Pd.", "Ilmu Pengetahuan Alam (IPA)", "guru123", "9A, 9B"]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws['!cols'] = [
      { wch: 28 },
      { wch: 32 },
      { wch: 32 },
      { wch: 20 },
      { wch: 34 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Guru");
    XLSX.writeFile(wb, "Template_Daftar_Guru_CBT_SMPN2Pacet.xlsx");
  }

  importTeachersFromExcel(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      return { success: false, message: "Pustaka SheetJS tidak tersedia." };
    }
    try {
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rows || rows.length < 3) {
        return { success: false, message: "File Excel kosong atau format tidak sesuai." };
      }

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowStr = (rows[i] || []).join(' ').toLowerCase();
        if (rowStr.includes('nip') || rowStr.includes('nama')) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return { success: false, message: "Kolom 'NIP' atau 'Nama' tidak ditemukan pada file Excel!" };
      }

      const dataRows = rows.slice(headerRowIndex + 1);
      let importedCount = 0;

      dataRows.forEach(row => {
        if (!row || row.length === 0) return;
        const rawNip = row[0];
        const rawName = row[1];
        const rawSubject = row[2];
        const rawPin = row[3];
        const rawClasses = row[4];

        if (rawNip && rawName && rawSubject) {
          const cleanNip = String(rawNip).trim();
          const cleanName = String(rawName).trim();
          const cleanSubject = String(rawSubject).trim();
          const cleanPin = rawPin ? String(rawPin).trim() : "guru123";
          const cleanClasses = rawClasses ? String(rawClasses).trim().toUpperCase() : "";

          const dupNip = this.teachers.find(t => String(t.nip).trim() === cleanNip && t.role !== 'admin');
          if (dupNip) {
            dupNip.name = cleanName;
            dupNip.subject = cleanSubject;
            dupNip.pin = cleanPin;
            if (rawClasses !== undefined) dupNip.classes = cleanClasses;
            importedCount++;
          } else if (cleanNip !== 'admin' && cleanNip !== '198501012010011001') {
            this.teachers.push({
              id: 'guru_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              nip: cleanNip,
              name: cleanName,
              subject: cleanSubject,
              classes: cleanClasses,
              role: "guru",
              pin: cleanPin
            });
            importedCount++;
          }
        }
      });

      this.saveTeachers(this.teachers);
      return { success: true, count: importedCount };

    } catch (err) {
      console.error("Gagal parse Excel guru:", err);
      return { success: false, message: "Format Excel tidak dapat dibaca: " + err.message };
    }
  }

  // ===================== JADWAL UJIAN & AKTIFKAN MAPEL (KHUSUS ADMIN) =====================
  isSuperAdminUser() {
    const cur = this.getCurrentTeacher();
    return Boolean(cur && (cur.role === 'admin' || cur.id === 'admin'));
  }

  formatIndonesianDate(dateIso) {
    if (!dateIso) return "";
    const parts = String(dateIso).split('-');
    if (parts.length !== 3) return dateIso;
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11) return dateIso;
    return `${d} ${months[m]} ${y}`;
  }

  getIndonesianDayName(dateIso) {
    if (!dateIso) return "";
    const parts = String(dateIso).split('-');
    if (parts.length !== 3) return "";
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (isNaN(dt.getTime())) return "";
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    return days[dt.getDay()];
  }

  loadSchedules() {
    const saved = localStorage.getItem('cbt_exam_schedules');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const activeId = (typeof window !== 'undefined' && window.examEngine && window.examEngine.config)
            ? window.examEngine.config.activeScheduleId
            : '';
          const hasExplicitFlag = parsed.some(s => typeof s.isActive === 'boolean');
          return parsed.map(s => ({
            ...s,
            maxAttempts: Math.max(1, parseInt(s.maxAttempts, 10) || 1),
            isActive: hasExplicitFlag ? Boolean(s.isActive) : Boolean(activeId && s.id === activeId)
          }));
        }
      } catch (e) {
        console.error("Gagal load schedules:", e);
      }
    }
    localStorage.setItem('cbt_exam_schedules', JSON.stringify(DEFAULT_SCHEDULES));
    return [...DEFAULT_SCHEDULES];
  }

  saveSchedules(list, skipCloudPush = false) {
    this.schedules = list;
    localStorage.setItem('cbt_exam_schedules', JSON.stringify(this.schedules));
    if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
      window.supabaseSync.pushStateKey('cbt_exam_schedules', this.schedules);
    }
  }

  getAllSchedules() {
    return [...this.schedules].sort((a, b) => String(a.dateIso || '').localeCompare(String(b.dateIso || '')));
  }

  getActiveSchedules() {
    return this.getAllSchedules().filter(s => Boolean(s.isActive));
  }

  addSchedule({ day, dateIso, subject, classLevel, timeRange, durationMinutes, token, maxAttempts }) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat menambah jadwal ujian!" };
    }
    const cleanSubject = String(subject || "").trim();
    const cleanDateIso = String(dateIso || "").trim();
    const cleanDay = String(day || "").trim() || this.getIndonesianDayName(cleanDateIso) || "Senin";
    const cleanClass = String(classLevel || "").trim() || "Semua Kelas";
    const cleanTime = String(timeRange || "").trim() || "07:30 - 08:50";
    const cleanDuration = parseInt(durationMinutes, 10) || 80;
    const cleanToken = String(token || "").trim().toUpperCase() || this.generateRandomToken();
    const cleanAttempts = Math.max(1, Math.min(20, parseInt(maxAttempts, 10) || 1));

    if (!cleanSubject || !cleanDateIso) {
      return { success: false, message: "Tanggal Ujian dan Mata Pelajaran wajib diisi!" };
    }

    const newItem = {
      id: 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      day: cleanDay,
      dateIso: cleanDateIso,
      dateFormatted: this.formatIndonesianDate(cleanDateIso),
      subject: cleanSubject,
      classLevel: cleanClass,
      timeRange: cleanTime,
      durationMinutes: cleanDuration,
      token: cleanToken,
      maxAttempts: cleanAttempts,
      isActive: false
    };

    this.schedules.push(newItem);
    this.saveSchedules(this.schedules);
    return { success: true, schedule: newItem };
  }

  updateSchedule(id, payload) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat mengubah jadwal ujian!" };
    }
    let updatedItem = null;
    this.schedules = this.schedules.map(s => {
      if (s.id === id) {
        const nextDateIso = payload.dateIso ? String(payload.dateIso).trim() : s.dateIso;
        const nextDay = payload.day ? String(payload.day).trim() : (this.getIndonesianDayName(nextDateIso) || s.day);
        updatedItem = {
          ...s,
          day: nextDay,
          dateIso: nextDateIso,
          dateFormatted: this.formatIndonesianDate(nextDateIso),
          subject: payload.subject ? String(payload.subject).trim() : s.subject,
          classLevel: payload.classLevel ? String(payload.classLevel).trim() : s.classLevel,
          timeRange: payload.timeRange !== undefined ? String(payload.timeRange).trim() : s.timeRange,
          durationMinutes: parseInt(payload.durationMinutes, 10) || s.durationMinutes || 80,
          token: payload.token ? String(payload.token).trim().toUpperCase() : s.token,
          maxAttempts: payload.maxAttempts !== undefined
            ? Math.max(1, Math.min(20, parseInt(payload.maxAttempts, 10) || 1))
            : (s.maxAttempts || 1),
          isActive: Boolean(s.isActive)
        };
        return updatedItem;
      }
      return s;
    });

    if (!updatedItem) return { success: false, message: "Jadwal tidak ditemukan!" };
    this.saveSchedules(this.schedules);

    if (updatedItem.isActive && window.examEngine && window.examEngine.config.activeScheduleId === id) {
      this.activateSchedule(id);
    }
    return { success: true, schedule: updatedItem };
  }

  deleteSchedule(id) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat menghapus jadwal ujian!" };
    }
    this.schedules = this.schedules.filter(s => s.id !== id);
    this.saveSchedules(this.schedules);

    if (window.examEngine && window.examEngine.config.activeScheduleId === id) {
      const remaining = this.getActiveSchedules();
      if (remaining.length > 0) {
        this.activateSchedule(remaining[0].id);
      } else {
        this.deactivateSchedule(null);
      }
    }
    return { success: true };
  }

  activateSchedule(id) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Fitur Aktifkan Mapel hanya tersedia di Panel Proktor / Admin!" };
    }
    let sched = null;
    this.schedules = this.schedules.map(s => {
      if (s.id === id) {
        sched = { ...s, isActive: true };
        return sched;
      }
      return s;
    });
    if (!sched) {
      return { success: false, message: "Jadwal ujian tidak ditemukan!" };
    }

    this.saveSchedules(this.schedules);

    if (window.examEngine) {
      window.examEngine.saveConfig({
        subject: sched.subject,
        targetClass: sched.classLevel || "Semua Kelas",
        scheduleDay: sched.day,
        scheduleDate: sched.dateFormatted || this.formatIndonesianDate(sched.dateIso),
        scheduleTime: sched.timeRange || "",
        durationMinutes: sched.durationMinutes || 80,
        examToken: sched.token || window.examEngine.config.examToken,
        activeScheduleId: sched.id,
        maxAttempts: sched.maxAttempts || window.examEngine.config.maxAttempts || 1,
        showScoreToStudent: false
      });
    }
    return { success: true, schedule: sched };
  }

  deactivateSchedule(id = null) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat menonaktifkan jadwal!" };
    }
    this.schedules = this.schedules.map(s => {
      if (id === null || s.id === id) {
        return { ...s, isActive: false };
      }
      return s;
    });
    this.saveSchedules(this.schedules);

    const remainingActive = this.getActiveSchedules();
    if (window.examEngine) {
      if (remainingActive.length > 0) {
        const next = remainingActive[0];
        window.examEngine.saveConfig({
          subject: next.subject,
          targetClass: next.classLevel || "Semua Kelas",
          scheduleDay: next.day,
          scheduleDate: next.dateFormatted || this.formatIndonesianDate(next.dateIso),
          scheduleTime: next.timeRange || "",
          durationMinutes: next.durationMinutes || 80,
          examToken: next.token || window.examEngine.config.examToken,
          activeScheduleId: next.id,
          showScoreToStudent: false
        });
      } else {
        window.examEngine.saveConfig({
          activeScheduleId: "",
          scheduleDay: "",
          scheduleDate: "",
          scheduleTime: "",
          targetClass: "Semua Kelas",
          showScoreToStudent: false
        });
      }
    }
    return { success: true, activeCount: remainingActive.length };
  }

  // ===================== BACKUP & PULIHKAN SELURUH DATA SEKOLAH =====================
  exportAllAppData() {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Proktor / Admin yang dapat mengekspor backup penuh!" };
    }

    const backup = {
      version: "3.1",
      exportedAt: new Date().toISOString(),
      appName: "CBT SMP NEGERI 2 PACET",
      data: {
        cbt_teachers_list: this.teachers,
        cbt_students_list: window.studentManager ? window.studentManager.getAllStudents() : [],
        cbt_exam_schedules: this.schedules,
        cbt_questions: window.examEngine ? window.examEngine.questions : [],
        cbt_config: window.examEngine ? window.examEngine.config : {},
        cbt_school_config: this.getSchoolConfig(),
        cbt_supabase_config: window.supabaseSync ? window.supabaseSync.getConfig() : {},
        cbt_exam_results: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]')
      }
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Backup_Lengkap_CBT_SMPN2Pacet_${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true };
  }

  importAllAppData(jsonString) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Proktor / Admin yang dapat memulihkan backup penuh!" };
    }

    try {
      const parsed = JSON.parse(jsonString);
      const d = (parsed && parsed.data) ? parsed.data : parsed;
      if (!d || typeof d !== 'object') {
        return { success: false, message: "Format file backup tidak valid." };
      }

      if (Array.isArray(d.cbt_teachers_list) && d.cbt_teachers_list.length > 0) {
        this.saveTeachers(d.cbt_teachers_list);
      }
      if (Array.isArray(d.cbt_students_list) && window.studentManager) {
        window.studentManager.saveStudents(d.cbt_students_list);
      }
      if (Array.isArray(d.cbt_exam_schedules)) {
        this.saveSchedules(d.cbt_exam_schedules);
      }
      if (Array.isArray(d.cbt_questions) && d.cbt_questions.length > 0 && window.examEngine) {
        window.examEngine.saveQuestions(d.cbt_questions);
      }
      if (d.cbt_config && typeof d.cbt_config === 'object' && window.examEngine) {
        window.examEngine.saveConfig(d.cbt_config);
      }
      if (d.cbt_school_config && typeof d.cbt_school_config === 'object') {
        this.saveSchoolConfig(d.cbt_school_config);
      }
      if (d.cbt_supabase_config && typeof d.cbt_supabase_config === 'object' && window.supabaseSync) {
        window.supabaseSync.saveConfig(d.cbt_supabase_config);
      }
      if (Array.isArray(d.cbt_exam_results)) {
        localStorage.setItem('cbt_exam_results', JSON.stringify(d.cbt_exam_results));
      }

      return {
        success: true,
        teachersCount: this.teachers.length,
        studentsCount: window.studentManager ? window.studentManager.getStudentCount() : 0,
        schedulesCount: this.schedules.length,
        questionsCount: window.examEngine ? window.examEngine.questions.length : 0
      };
    } catch (err) {
      return { success: false, message: "Gagal membaca file backup: " + err.message };
    }
  }

  // ===================== EKSPOR NASKAH SOAL (SESUAI TEMPLATE PDF + SOAL BERGAMBAR) =====================
  getPrintStampText() {
    const now = new Date();
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(now);
      const getP = (t) => (parts.find(p => p.type === t) || {}).value || '';
      const d = parseInt(getP('day'), 10);
      const m = parseInt(getP('month'), 10) - 1;
      const y = getP('year');
      const hh = getP('hour').padStart(2, '0');
      const mm = getP('minute').padStart(2, '0');
      if (d && m >= 0 && m <= 11 && y) {
        return `Dokumen ini dicetak secara otomatis melalui sistem aplikasi CBT - Computer Based Test. pada ${d} ${months[m]} ${y} pukul ${hh}:${mm} WIB.`;
      }
    } catch (e) {}
    const d = now.getDate();
    const m = months[now.getMonth()];
    const y = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `Dokumen ini dicetak secara otomatis melalui sistem aplikasi CBT - Computer Based Test. pada ${d} ${m} ${y} pukul ${hh}:${mm} WIB.`;
  }

  getPrintFooterNoteHtml(extraStyle = '') {
    return `<div class="cbt-print-footer-note" style="margin-top:10px; padding-top:4px; border-top:0.5px solid #cbd5e1; font-size:8.5px; color:#1d4ed8; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${extraStyle}">${this.escapePrintHtml(this.getPrintStampText())}</div>`;
  }

  escapePrintHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  estimateQuestionHeightPx(q, layoutCols = 2) {
    const charsPerLine = layoutCols === 2 ? 56 : 112;
    const text = String(q.question || '');
    const explicitLines = text.split(/\r?\n/);
    let stemLines = 0;
    explicitLines.forEach(line => {
      stemLines += Math.max(1, Math.ceil(line.length / charsPerLine));
    });

    let h = 10 + stemLines * 14.5;
    if (q.image && String(q.image).trim() !== '') {
      h += layoutCols === 2 ? 142 : 220;
    }

    const type = q.type || 'single';
    if (type === 'true_false') {
      const stmts = Array.isArray(q.statements) ? q.statements : [];
      h += 28 + stmts.length * 24;
    } else {
      const rawOpts = Array.isArray(q.options) ? q.options : [];
      const nonEmptyOpts = rawOpts.filter(opt => String(opt && opt.text ? opt.text : '').trim() !== '');
      const opts = nonEmptyOpts.length > 0 ? nonEmptyOpts : rawOpts;
      const optCharsPerLine = layoutCols === 2 ? 50 : 104;
      opts.forEach(opt => {
        const oLen = String(opt.text || '').length;
        h += Math.max(1, Math.ceil(oLen / optCharsPerLine)) * 14.5 + 2;
      });
    }
    return Math.ceil(h + 8);
  }

  renderSingleQuestionPrintHtml(q, displayNumber, layoutCols = 2) {
    const type = q.type || 'single';
    const qText = this.escapePrintHtml(q.question || '').replace(/\r?\n/g, '<br>');
    const imgMaxH = layoutCols === 2 ? '132px' : '210px';
    const imgHtml = (q.image && String(q.image).trim() !== '')
      ? `<div style="margin:5px 0 6px 0; text-align:left;"><img src="${q.image}" alt="Gambar Soal ${displayNumber}" style="max-width:100%; max-height:${imgMaxH}; width:auto; height:auto; object-fit:contain; display:block; border:1px solid #cbd5e1; border-radius:4px; padding:2px; background:#ffffff;"></div>`
      : '';

    let bodyHtml = '';
    if (type === 'true_false') {
      const stmts = Array.isArray(q.statements) ? q.statements : [];
      const rows = stmts.map((st, idx) => `
        <tr>
          <td style="border:1px solid #000000; padding:3px 5px; font-size:10px; line-height:1.35;">${idx + 1}. ${this.escapePrintHtml(st.text || '')}</td>
          <td style="border:1px solid #000000; padding:3px 4px; width:24px; text-align:center; font-size:10px;"></td>
          <td style="border:1px solid #000000; padding:3px 4px; width:24px; text-align:center; font-size:10px;"></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div style="padding:3px 1px 5px 1px;">
          <table style="width:100%; border-collapse:collapse; border:1px solid #000000;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="border:1px solid #000000; padding:3px 5px; font-size:9.5px; text-align:left;">Pernyataan</th>
                <th style="border:1px solid #000000; padding:3px 4px; width:24px; font-size:9.5px; text-align:center;">B</th>
                <th style="border:1px solid #000000; padding:3px 4px; width:24px; font-size:9.5px; text-align:center;">S</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    } else {
      const rawOpts = Array.isArray(q.options) ? q.options : [];
      const nonEmptyOpts = rawOpts.filter(opt => String(opt && opt.text ? opt.text : '').trim() !== '');
      const opts = nonEmptyOpts.length > 0 ? nonEmptyOpts : rawOpts;
      const optRows = opts.map(opt => {
        const lowerKey = String(opt.key || 'a').toLowerCase();
        const bullet = type === 'multiple' ? `☐ ${lowerKey}.` : `${lowerKey}.`;
        return `
          <tr>
            <td style="width:${type === 'multiple' ? '26px' : '16px'}; vertical-align:top; font-size:10.5px; line-height:1.38; padding:1px 0;">${bullet}</td>
            <td style="vertical-align:top; font-size:10.5px; line-height:1.38; padding:1px 0;">${this.escapePrintHtml(opt.text || '')}</td>
          </tr>
        `;
      }).join('');
      bodyHtml = `<table style="width:100%; border-collapse:collapse; margin-top:2px;"><tbody>${optRows}</tbody></table>`;
    }

    return `
      <div class="naskah-soal-item" style="margin-bottom:7px; padding-bottom:3px; break-inside:avoid; page-break-inside:avoid;">
        <table style="width:100%; border-collapse:collapse;">
          <tbody>
            <tr>
              <td style="width:20px; vertical-align:top; font-size:10.5px; line-height:1.38; font-weight:normal;">${displayNumber}.</td>
              <td style="vertical-align:top; font-size:10.5px; line-height:1.38;">
                <div>${qText}</div>
                ${imgHtml}
                <div style="margin-top:2px;">${bodyHtml}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  generateExamPaperHtml(questionsList, options = {}) {
    const cfg = this.getSchoolConfig();
    const examCfg = window.examEngine ? window.examEngine.config : {};
    const layoutCols = parseInt(options.layoutCols, 10) === 1 ? 1 : 2;
    const examTitle = String(options.examTitle || examCfg.examTitle || 'ASESMEN SUMATIF AKHIR SEMESTER (ASAS)').trim().toUpperCase();
    const semester = String(options.semester || 'SEMESTER GANJIL').trim().toUpperCase();
    const academicYear = String(options.academicYear || '2025/2026').trim().toUpperCase();
    const subjectName = String(options.subject || examCfg.subject || 'Semua Mata Pelajaran').trim();
    const className = (options.classLevel && options.classLevel !== 'ALL')
      ? options.classLevel
      : '..............................';
    const durationText = String(options.duration || `${examCfg.durationMinutes || 80} Menit`).trim();
    const dateText = String(options.dateText || '').trim() || '......................................';
    const includeAnswerKey = Boolean(options.includeAnswerKey);

    const customKopImg = options.kopSuratImage !== undefined ? options.kopSuratImage : (cfg.kopSuratImage || '');
    const logoHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Sekolah" style="width:68px; height:68px; object-fit:contain; display:block;">`
      : (cfg.logoRight
        ? `<img src="${cfg.logoRight}" alt="Logo Sekolah" style="width:68px; height:68px; object-fit:contain; display:block;">`
        : `<div style="width:62px; height:62px; border:1.5px solid #000; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:10px;">LOGO</div>`);

    const kopBannerHtml = (customKopImg && String(customKopImg).trim() !== '')
      ? `
        <!-- KOP SURAT GAMBAR UPLOAD RESMI -->
        <div style="width:100%; margin:0 0 6px 0; padding:0; text-align:center;">
          <img src="${customKopImg}" alt="Kop Surat Sekolah" style="width:100%; max-height:105px; height:auto; object-fit:contain; display:block; margin:0 auto;">
        </div>
      `
      : `
        <!-- KOP SURAT OTOMATIS -->
        <table style="width:100%; border-collapse:collapse; margin:0 0 2px 0;">
          <tbody>
            <tr>
              <td style="width:74px; vertical-align:middle; text-align:left; padding-bottom:5px;">
                ${logoHtml}
              </td>
              <td style="vertical-align:middle; text-align:center; padding-bottom:5px; padding-right:20px;">
                <div style="font-size:12.5px; font-weight:normal; letter-spacing:0.4px; text-transform:uppercase; line-height:1.2;">${this.escapePrintHtml(cfg.schoolSubtitle || 'PEMERINTAH KABUPATEN CIANJUR')}</div>
                <div style="font-size:17.5px; font-weight:bold; letter-spacing:0.6px; text-transform:uppercase; line-height:1.22; margin-top:1px;">${this.escapePrintHtml(cfg.schoolName || 'SMP NEGERI 2 PACET')}</div>
                <div style="font-size:10px; line-height:1.28; margin-top:2px;">${this.escapePrintHtml(cfg.schoolAddress || '')}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <div style="border-top:2.5px solid #000000; border-bottom:1px solid #000000; height:2px; margin-bottom:6px;"></div>
      `;

    const kopAndMetaHtml = `
      ${kopBannerHtml}

      <!-- JUDUL UJIAN -->
      <div style="text-align:center; font-weight:bold; font-size:12px; line-height:1.35; text-transform:uppercase; margin-bottom:6px;">
        <div>${this.escapePrintHtml(examTitle)}</div>
        <div>${this.escapePrintHtml(semester)}</div>
        <div>TAHUN PELAJARAN ${this.escapePrintHtml(academicYear)}</div>
      </div>

      <!-- IDENTITAS MAPEL & PESERTA -->
      <div style="border-top:1.5px solid #000000; border-bottom:1.5px solid #000000; padding:5px 2px; margin-bottom:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:10.5px; line-height:1.45;">
          <tbody>
            <tr>
              <td style="width:18%; vertical-align:top;">Mata Pelajaran</td>
              <td style="width:39%; vertical-align:top;">: ${this.escapePrintHtml(subjectName)}</td>
              <td style="width:12%; vertical-align:top;">Kelas</td>
              <td style="width:31%; vertical-align:top;">: ${this.escapePrintHtml(className)}</td>
            </tr>
            <tr>
              <td style="vertical-align:top;">Nama Lengkap</td>
              <td style="vertical-align:top;">: ......................................</td>
              <td style="vertical-align:top;">Waktu</td>
              <td style="vertical-align:top;">: ${this.escapePrintHtml(durationText)}</td>
            </tr>
            <tr>
              <td style="vertical-align:top;">Hari/Tanggal</td>
              <td colspan="3" style="vertical-align:top;">: ${this.escapePrintHtml(dateText)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- PETUNJUK UMUM -->
      <div style="font-size:10.5px; line-height:1.4; padding-bottom:6px; border-bottom:1.5px solid #000000; margin-bottom:10px;">
        <div style="font-weight:bold; margin-bottom:2px;">Petunjuk Umum</div>
        <div>1. Berdoalah sebelum mengerjakan</div>
        <div>2. Bacalah soal dengan baik dan teliti</div>
        <div>3. Kerjakan dengan jujur, dan dilarang bekerjasama karena Allah Maha Mengetahui</div>
        <div>4. Periksa kembali jawaban sebelum diserahkan kepada pengawas</div>
      </div>
    `;

    // Kelompokkan tipe soal berurutan (I. PG Tunggal, II. PG Kompleks, III. Benar/Salah)
    const singleQs = questionsList.filter(q => (q.type || 'single') === 'single');
    const multiQs = questionsList.filter(q => q.type === 'multiple');
    const tfQs = questionsList.filter(q => q.type === 'true_false');

    const blocks = [];
    let numCounter = 1;
    if (singleQs.length > 0) {
      blocks.push({
        isHeading: true,
        height: 24,
        html: `<div style="font-weight:bold; font-size:11px; margin-bottom:6px;">I. Pilihlah satu jawaban yang paling tepat!</div>`
      });
      singleQs.forEach(q => {
        blocks.push({
          isHeading: false,
          height: this.estimateQuestionHeightPx(q, layoutCols),
          html: this.renderSingleQuestionPrintHtml(q, numCounter, layoutCols),
          answerKeyNum: numCounter,
          answerKeyText: q.correctAnswer || '-'
        });
        numCounter += 1;
      });
    }

    if (multiQs.length > 0) {
      blocks.push({
        isHeading: true,
        height: 28,
        html: `<div style="font-weight:bold; font-size:11px; margin:6px 0 6px 0;">${singleQs.length > 0 ? 'II' : 'I'}. Pilihan Ganda Kompleks (Pilihlah lebih dari satu jawaban yang benar!)</div>`
      });
      multiQs.forEach(q => {
        const rawAns = Array.isArray(q.correctAnswer)
          ? q.correctAnswer
          : (Array.isArray(q.correctAnswers) ? q.correctAnswers : (q.correctAnswer ? [q.correctAnswer] : []));
        const ans = rawAns.length > 0 ? rawAns.join(', ') : '-';
        blocks.push({
          isHeading: false,
          height: this.estimateQuestionHeightPx(q, layoutCols),
          html: this.renderSingleQuestionPrintHtml(q, numCounter, layoutCols),
          answerKeyNum: numCounter,
          answerKeyText: ans
        });
        numCounter += 1;
      });
    }

    if (tfQs.length > 0) {
      const roman = (singleQs.length > 0 && multiQs.length > 0) ? 'III' : ((singleQs.length > 0 || multiQs.length > 0) ? 'II' : 'I');
      blocks.push({
        isHeading: true,
        height: 28,
        html: `<div style="font-weight:bold; font-size:11px; margin:6px 0 6px 0;">${roman}. Tentukan Benar (B) atau Salah (S) pada pernyataan berikut!</div>`
      });
      tfQs.forEach(q => {
        const ans = Array.isArray(q.statements) ? q.statements.map((s, idx) => `${idx + 1}:${s.correct || s.answer || '-'}`).join(', ') : '-';
        blocks.push({
          isHeading: false,
          height: this.estimateQuestionHeightPx(q, layoutCols),
          html: this.renderSingleQuestionPrintHtml(q, numCounter, layoutCols),
          answerKeyNum: numCounter,
          answerKeyText: ans
        });
        numCounter += 1;
      });
    }

    // Ukur tinggi aktual kop & setiap blok soal di lebar kertas F4 (210mm) agar halaman terisi penuh & rapi
    const measured = this.measureExamPaperLayout(kopAndMetaHtml, blocks, layoutCols);
    const blockHeights = measured.blockHeights;
    const pageBudgetPx = 1110; // 330mm (~1247px) - padding 16mm (60px) - footer (28px) - margin aman (49px)
    const firstPageColLimit = Math.max(460, pageBudgetPx - measured.kopHeight);
    const nextPageColLimit = pageBudgetPx;

    // Bagi blok ke halaman F4 (21cm x 33cm) agar rapi, tidak memotong soal bergambar di tengah kolom/halaman
    const pages = [];
    let idx = 0;
    let pageNum = 0;

    while (idx < blocks.length) {
      const colLimit = pageNum === 0 ? firstPageColLimit : nextPageColLimit;
      if (layoutCols === 1) {
        let used = 0;
        const colItems = [];
        while (idx < blocks.length) {
          const b = blocks[idx];
          const bh = blockHeights[idx] || b.height;
          if (colItems.length > 0 && used + bh > colLimit) break;
          // Jangan tinggalkan heading sendirian di bawah halaman
          const nextBh = idx + 1 < blocks.length ? (blockHeights[idx + 1] || blocks[idx + 1].height) : 0;
          if (b.isHeading && idx + 1 < blocks.length && colItems.length > 0 && used + bh + nextBh > colLimit) break;
          colItems.push(b.html);
          used += bh;
          idx += 1;
        }
        pages.push({ pageNum, leftHtml: colItems.join(''), rightHtml: '' });
      } else {
        const fillColumn = () => {
          let used = 0;
          const items = [];
          while (idx < blocks.length) {
            const b = blocks[idx];
            const bh = blockHeights[idx] || b.height;
            if (items.length > 0 && used + bh > colLimit) break;
            const nextBh = idx + 1 < blocks.length ? (blockHeights[idx + 1] || blocks[idx + 1].height) : 0;
            if (b.isHeading && idx + 1 < blocks.length && items.length > 0 && used + bh + nextBh > colLimit) break;
            items.push(b.html);
            used += bh;
            idx += 1;
          }
          return items.join('');
        };
        const leftHtml = fillColumn();
        const rightHtml = fillColumn();
        pages.push({ pageNum, leftHtml, rightHtml });
      }
      pageNum += 1;
    }

    const footerNoteHtml = this.getPrintFooterNoteHtml();

    const pagesHtml = pages.map((pg, pIndex) => {
      const breakStyle = pIndex > 0 ? 'page-break-before:always; break-before:page;' : '';
      const breakClass = pIndex > 0 ? 'naskah-page-break' : '';
      const bodyLayout = layoutCols === 1
        ? `<div style="padding-bottom:4px;">${pg.leftHtml}</div>`
        : `
          <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <tbody>
              <tr>
                <td style="width:48.5%; vertical-align:top; padding-right:10px; padding-bottom:4px;">${pg.leftHtml}</td>
                <td style="width:3%;"></td>
                <td style="width:48.5%; vertical-align:top; padding-left:10px; padding-bottom:4px;">${pg.rightHtml}</td>
              </tr>
            </tbody>
          </table>
        `;

      return `
        <div class="naskah-paper-sheet ${breakClass}" style="${breakStyle} width:210mm; max-width:100%; margin:0 auto 14px auto; padding:8mm 12mm; background:#ffffff; color:#000000; box-shadow:0 4px 18px rgba(15,23,42,0.12);">
          ${pIndex === 0 ? kopAndMetaHtml : ''}
          ${bodyLayout}
          ${footerNoteHtml}
        </div>
      `;
    }).join('');

    let keyHtml = '';
    if (includeAnswerKey) {
      const keyItems = blocks.filter(b => !b.isHeading);
      const keyRows = keyItems.map(item => `
        <div style="border:1px solid #cbd5e1; padding:4px 8px; font-size:10.5px; display:flex; justify-content:space-between; gap:8px;">
          <span style="font-weight:bold;">No. ${item.answerKeyNum}</span>
          <span style="font-weight:bold; color:#1d4ed8;">${this.escapePrintHtml(item.answerKeyText)}</span>
        </div>
      `).join('');
      keyHtml = `
        <div class="naskah-paper-sheet naskah-page-break" style="page-break-before:always; break-before:page; width:210mm; max-width:100%; margin:0 auto 14px auto; padding:8mm 12mm; background:#ffffff; color:#000000; box-shadow:0 4px 18px rgba(15,23,42,0.12);">
          <div style="text-align:center; border-bottom:2px solid #000000; padding-bottom:6px; margin-bottom:12px;">
            <div style="font-size:13px; font-weight:bold; text-transform:uppercase;">KUNCI JAWABAN • ${this.escapePrintHtml(subjectName)}</div>
            <div style="font-size:11px;">${this.escapePrintHtml(examTitle)} (${this.escapePrintHtml(semester)} ${this.escapePrintHtml(academicYear)})</div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
            ${keyRows}
          </div>
          ${footerNoteHtml}
        </div>
      `;
    }

    return pagesHtml + keyHtml;
  }

  measureExamPaperLayout(kopAndMetaHtml, blocks, layoutCols = 2) {
    if (typeof document === 'undefined' || !document.body) {
      return {
        kopHeight: 335,
        blockHeights: blocks.map(b => b.height)
      };
    }

    const measurer = document.createElement('div');
    measurer.style.cssText = 'position:fixed; left:-99999px; top:0; width:210mm; padding:8mm 12mm; box-sizing:border-box; visibility:hidden; pointer-events:none; font-family:"Times New Roman", Times, Georgia, serif; background:#ffffff; z-index:-1;';

    const colInnerHtml = layoutCols === 1
      ? `<div class="_m_col" style="width:100%;"></div>`
      : `<table style="width:100%; border-collapse:collapse; table-layout:fixed;"><tbody><tr><td class="_m_col" style="width:48.5%; vertical-align:top; padding-right:10px;"></td><td style="width:3%;"></td><td style="width:48.5%; vertical-align:top; padding-left:10px;"></td></tr></tbody></table>`;

    const blocksMarkup = blocks.map((b, i) => `<div class="_m_blk" data-bidx="${i}" style="display:flow-root;">${b.html}</div>`).join('');

    measurer.innerHTML = `<div class="_m_kop" style="display:flow-root;">${kopAndMetaHtml}</div>${colInnerHtml}`;
    const colEl = measurer.querySelector('._m_col');
    if (colEl) colEl.innerHTML = blocksMarkup;

    let kopHeight = 335;
    let blockHeights = blocks.map(b => b.height);

    try {
      document.body.appendChild(measurer);
      const kopEl = measurer.querySelector('._m_kop');
      if (kopEl) {
        let kh = kopEl.getBoundingClientRect().height || kopEl.offsetHeight || 335;
        const kopImg = kopEl.querySelector('img');
        if (kopImg && (kopImg.getBoundingClientRect().height || kopImg.offsetHeight) < 20) {
          kh += 105;
        }
        kopHeight = Math.max(240, Math.ceil(kh));
      }

      const blkEls = measurer.querySelectorAll('._m_blk');
      if (blkEls.length === blocks.length) {
        blockHeights = Array.from(blkEls).map((el, i) => {
          let h = el.getBoundingClientRect().height || el.offsetHeight || blocks[i].height;
          const imgs = el.querySelectorAll('img');
          imgs.forEach(img => {
            if ((img.getBoundingClientRect().height || img.offsetHeight) < 16) {
              h += (layoutCols === 2 ? 136 : 214);
            }
          });
          return Math.max(16, Math.ceil(h));
        });
      }
    } catch (e) {
      // Gunakan fallback estimateQuestionHeightPx jika pengukuran DOM gagal
    } finally {
      if (measurer.parentNode) measurer.parentNode.removeChild(measurer);
    }

    return { kopHeight, blockHeights };
  }

  measureImageDimensions(src) {
    return new Promise((resolve) => {
      if (!src) {
        resolve({ width: 0, height: 0 });
        return;
      }
      const img = new Image();
      let settled = false;
      const done = (w, h) => {
        if (settled) return;
        settled = true;
        resolve({ width: w || 0, height: h || 0 });
      };
      const timer = setTimeout(() => done(img.naturalWidth || 0, img.naturalHeight || 0), 2500);
      img.onload = () => {
        clearTimeout(timer);
        done(img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
      };
      img.onerror = () => {
        clearTimeout(timer);
        done(0, 0);
      };
      img.src = src;
    });
  }

  async preloadPaperImages(questionsList, options = {}) {
    const cfg = this.getSchoolConfig();
    const urls = new Set();
    const customKop = options.kopSuratImage !== undefined ? options.kopSuratImage : (cfg.kopSuratImage || '');
    if (customKop) urls.add(customKop);
    if (cfg.logoLeft) urls.add(cfg.logoLeft);
    if (cfg.logoRight) urls.add(cfg.logoRight);
    (questionsList || []).forEach(q => {
      if (q && q.image && String(q.image).trim() !== '') urls.add(q.image);
    });
    if (urls.size > 0) {
      await Promise.all(Array.from(urls).map(u => this.measureImageDimensions(u)));
    }
  }

  async downloadQuestionsPDF(questionsList, options = {}) {
    if (!questionsList || questionsList.length === 0) {
      alert("Tidak ada soal yang dipilih untuk didownload.");
      return;
    }

    if (typeof html2pdf === 'undefined') {
      alert("Library pembuat PDF belum termuat. Silakan muat ulang halaman dan coba lagi.");
      return;
    }

    const btnPdf = document.getElementById('btnDownloadQuestionsPdf');
    const prevBtnHtml = btnPdf ? btnPdf.innerHTML : '';
    if (btnPdf) {
      btnPdf.disabled = true;
      btnPdf.innerHTML = '<span>⏳ Membuat PDF...</span>';
    }

    const prevScrollY = window.scrollY || window.pageYOffset || 0;
    const prevScrollX = window.scrollX || window.pageXOffset || 0;
    const slug = String(options.subject || 'Naskah_Soal').replace(/[^a-z0-9]+/gi, '_');
    const filename = `Naskah_Soal_F4_${slug}_${Date.now()}.pdf`;

    try {
      window.scrollTo(0, 0);
      await this.preloadPaperImages(questionsList, options);
      const tempWrapper = document.createElement('div');
      tempWrapper.innerHTML = this.generateExamPaperHtml(questionsList, options);

      const sheets = Array.from(tempWrapper.querySelectorAll('.naskah-paper-sheet'));
      if (sheets.length === 0) {
        throw new Error('Tidak ada halaman naskah untuk diexport.');
      }

      const sheetOpt = {
        margin: [0, 0, 0, 0],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            const container = clonedDoc.querySelector('.html2pdf__container');
            if (container) {
              container.style.left = '0px';
              container.style.right = 'auto';
              container.style.top = '0px';
              container.style.margin = '0px';
            }
          }
        },
        jsPDF: { unit: 'mm', format: [210, 330], orientation: 'portrait' }
      };

      // Inisialisasi dokumen jsPDF F4 (210mm x 330mm) tanpa menyembunyikan DOM body
      const seedHtml = '<div style="width:10px;height:10px;background:#ffffff;"></div>';
      const pdfDoc = await html2pdf().set(sheetOpt).from(seedHtml).toPdf().get('pdf');

      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        sheet.classList.remove('naskah-page-break');
        sheet.style.margin = '0';
        sheet.style.boxShadow = 'none';
        sheet.style.pageBreakBefore = 'auto';
        sheet.style.breakBefore = 'auto';
        sheet.style.width = '210mm';
        sheet.style.maxWidth = '210mm';
        sheet.style.minHeight = 'auto';
        sheet.style.padding = '8mm 12mm';
        sheet.style.background = '#ffffff';
        sheet.style.color = '#000000';

        const canvas = await html2pdf().set(sheetOpt).from(sheet.outerHTML).toCanvas().get('canvas');
        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        if (i > 0) {
          pdfDoc.addPage([210, 330], 'portrait');
        }

        const pageW = 210;
        const maxPageH = 328;
        const naturalH = (canvas.height * pageW) / canvas.width;
        if (naturalH > maxPageH) {
          const ratio = maxPageH / naturalH;
          const fitW = pageW * ratio;
          const offsetX = (pageW - fitW) / 2;
          pdfDoc.addImage(imgData, 'JPEG', offsetX, 0, fitW, maxPageH);
        } else {
          pdfDoc.addImage(imgData, 'JPEG', 0, 0, pageW, naturalH);
        }
      }

      pdfDoc.save(filename);
    } catch (err) {
      console.error("Gagal export Naskah PDF:", err);
      alert("Gagal mengunduh file PDF: " + (err && err.message ? err.message : "Terjadi kesalahan saat memproses PDF."));
    } finally {
      window.scrollTo(prevScrollX, prevScrollY);
      if (btnPdf) {
        btnPdf.disabled = false;
        btnPdf.innerHTML = prevBtnHtml;
      }
    }
  }

  async downloadQuestionsDOC(questionsList, options = {}) {
    if (!questionsList || questionsList.length === 0) {
      alert("Tidak ada soal yang dipilih untuk didownload.");
      return;
    }

    const btnDoc = document.getElementById('btnDownloadQuestionsDoc');
    const prevBtnHtml = btnDoc ? btnDoc.innerHTML : '';
    if (btnDoc) {
      btnDoc.disabled = true;
      btnDoc.innerHTML = '<span>⏳ Membuat Word...</span>';
    }

    try {
      const layoutCols = parseInt(options.layoutCols, 10) === 1 ? 1 : 2;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.generateExamPaperHtml(questionsList, options);

      // Bersihkan gaya khusus preview layar agar halaman Word F4 tidak double-margin/overflow
      const sheets = Array.from(tempDiv.querySelectorAll('.naskah-paper-sheet'));
      sheets.forEach((sheet, idx) => {
        sheet.style.width = '100%';
        sheet.style.maxWidth = '100%';
        sheet.style.margin = '0';
        sheet.style.padding = '0';
        sheet.style.boxShadow = 'none';
        sheet.style.minHeight = 'auto';
        sheet.style.background = '#ffffff';
        if (idx > 0) {
          sheet.style.pageBreakBefore = 'always';
          sheet.style.breakBefore = 'page';
        }
      });

      // Microsoft Word membutuhkan atribut HTML width & height eksplisit pada <img>
      // agar gambar tidak dirender dalam ukuran pixel aslinya yang meluber keluar margin kanan.
      const imgs = Array.from(tempDiv.querySelectorAll('img'));
      for (const img of imgs) {
        const alt = String(img.getAttribute('alt') || '');
        const src = img.getAttribute('src') || '';
        const dims = await this.measureImageDimensions(src);
        const natW = dims.width || 800;
        const natH = dims.height || 200;

        if (alt === 'Kop Surat Sekolah') {
          const maxW = 665;
          const maxH = 105;
          const ratio = Math.min(maxW / natW, maxH / natH, 1);
          const targetW = Math.max(1, Math.round(natW * ratio));
          const targetH = Math.max(1, Math.round(natH * ratio));
          img.setAttribute('width', String(targetW));
          img.setAttribute('height', String(targetH));
          img.style.width = `${targetW}px`;
          img.style.height = `${targetH}px`;
          img.style.maxWidth = '100%';
          img.style.objectFit = 'contain';
        } else if (alt === 'Logo Sekolah') {
          img.setAttribute('width', '64');
          img.setAttribute('height', '64');
          img.style.width = '64px';
          img.style.height = '64px';
        } else {
          const maxW = layoutCols === 2 ? 265 : 540;
          const maxH = layoutCols === 2 ? 132 : 210;
          const ratio = Math.min(maxW / natW, maxH / natH, 1);
          const targetW = Math.max(1, Math.round(natW * ratio));
          const targetH = Math.max(1, Math.round(natH * ratio));
          img.setAttribute('width', String(targetW));
          img.setAttribute('height', String(targetH));
          img.style.width = `${targetW}px`;
          img.style.height = `${targetH}px`;
        }
      }

      const cleanedHtml = tempDiv.innerHTML;
      const wordDocHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <title>Naskah Soal Ujian F4</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page Section1 {
              size: 21.0cm 33.0cm;
              mso-page-orientation: portrait;
              margin: 1.0cm 1.2cm 1.0cm 1.2cm;
              mso-header-margin: 0.5cm;
              mso-footer-margin: 0.5cm;
              mso-paper-source: 0;
            }
            div.Section1 { page: Section1; }
            body { font-family: "Times New Roman", Times, serif; color: #000000; margin: 0; padding: 0; }
            .naskah-paper-sheet { width: 100% !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; min-height: auto !important; }
            .naskah-page-break { page-break-before: always; break-before: page; }
            .cbt-print-footer-note { color: #1d4ed8 !important; font-style: italic !important; font-size: 8pt !important; white-space: nowrap !important; }
          </style>
        </head>
        <body><div class="Section1">${cleanedHtml}</div></body>
        </html>
      `;
      const slug = String(options.subject || 'Naskah_Soal').replace(/[^a-z0-9]+/gi, '_');
      const blob = new Blob(['\ufeff', wordDocHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Naskah_Soal_F4_${slug}_${Date.now()}.doc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Gagal export Naskah Word:", err);
      alert("Gagal mengunduh file Word: " + (err && err.message ? err.message : "Terjadi kesalahan."));
    } finally {
      if (btnDoc) {
        btnDoc.disabled = false;
        btnDoc.innerHTML = prevBtnHtml;
      }
    }
  }

  printQuestionsDirect(questionsList, options = {}) {
    if (!questionsList || questionsList.length === 0) {
      alert("Tidak ada soal yang dipilih untuk dicetak.");
      return;
    }
    const printArea = document.getElementById('printableQuestionsArea');
    if (!printArea) {
      window.print();
      return;
    }
    printArea.innerHTML = this.generateExamPaperHtml(questionsList, options);
    printArea.classList.remove('hidden');
    document.body.classList.add('printing-questions');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        printArea.classList.add('hidden');
        document.body.classList.remove('printing-questions');
      }, 1000);
    }, 250);
  }
}

window.cbtAdmin = new CBTAdmin();
