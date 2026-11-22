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

const CBT_OFFLINE_VAULT_STORAGE_KEY = 'cbt_offline_vault_v1';
const CBT_OFFLINE_VAULT_HDR = 'CBT_VAULT_V1:';
const CBT_OFFLINE_VAULT_SALT = 'SMPN2PACET_CBT_V338';

function encodeCbtOfflineVault(obj) {
  try {
    const jsonStr = JSON.stringify(obj || {});
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
      out += String.fromCharCode(rawBytes[i] ^ CBT_OFFLINE_VAULT_SALT.charCodeAt(i % CBT_OFFLINE_VAULT_SALT.length));
    }
    return CBT_OFFLINE_VAULT_HDR + btoa(out);
  } catch (e) {
    return null;
  }
}

function decodeCbtOfflineVault() {
  try {
    const raw = localStorage.getItem(CBT_OFFLINE_VAULT_STORAGE_KEY);
    if (!raw || !raw.startsWith(CBT_OFFLINE_VAULT_HDR)) return null;
    const bin = atob(raw.slice(CBT_OFFLINE_VAULT_HDR.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i) ^ CBT_OFFLINE_VAULT_SALT.charCodeAt(i % CBT_OFFLINE_VAULT_SALT.length);
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

class CBTAdmin {
  constructor() {
    this.currentTeacher = this.restoreSession();
    this.isAuthenticated = Boolean(this.currentTeacher);
    this.teachers = this.loadTeachers();
    if (this.currentTeacher && this.currentTeacher.id && Array.isArray(this.teachers) && this.isSuperAdminUser()) {
      const fresh = this.teachers.find(t => t.id === this.currentTeacher.id);
      if (fresh) this.currentTeacher = fresh;
    }
    this.schedules = this.loadSchedules();
    this.selectedSubjectFilter = 'ALL';
    this.selectedClassFilter = 'ALL';
  }

  _sanitizeTeachersListForGuru(list) {
    return (Array.isArray(list) ? list : []).map(t => ({
      id: t.id,
      nip: t.nip,
      name: t.name,
      subject: t.subject,
      classes: t.classes || '',
      role: t.role || 'guru'
    }));
  }

  _normalizeTeachersArray(list) {
    if (!Array.isArray(list) || list.length === 0) return [];
    let adminObj = null;
    const dedupMap = new Map();

    list.forEach(t => {
      if (!t || typeof t !== 'object') return;
      const isAdm = t.id === 'admin' || String(t.role || '').toLowerCase() === 'admin';
      if (isAdm) {
        adminObj = {
          ...(adminObj || {}),
          ...t,
          id: "admin",
          nip: t.nip ? String(t.nip).trim() : (adminObj?.nip || "198501012010011001"),
          name: t.name || adminObj?.name || "Proktor Utama / Admin",
          subject: t.subject || adminObj?.subject || "Semua Mata Pelajaran (Super Admin)",
          role: "admin",
          pin: t.pin ? String(t.pin).trim() : (adminObj?.pin || "admin123")
        };
        return;
      }

      const cleanNip = String(t.nip || '').trim();
      const cleanId = String(t.id || '').trim();
      const cleanName = String(t.name || '').trim();
      const cleanRole = String(t.role || '').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru';
      const dedupKey = cleanNip
        ? `NIP:${cleanNip.toLowerCase()}__${cleanRole}`
        : (cleanId ? `ID:${cleanId.toLowerCase()}` : `NAME:${cleanName.toLowerCase()}__${cleanRole}`);

      const prev = dedupMap.get(dedupKey);
      if (prev) {
        dedupMap.set(dedupKey, {
          ...prev,
          ...t,
          id: t.id || prev.id,
          nip: cleanNip || prev.nip,
          name: cleanName || prev.name,
          subject: (cleanRole === 'pengawas' && (!t.subject || String(t.subject).trim() === ''))
            ? (prev.subject || "Semua Mapel Aktif (Pengawas Ruang)")
            : (String(t.subject || '').trim() || prev.subject || ''),
          classes: t.classes !== undefined && String(t.classes).trim() !== '' ? String(t.classes).trim().toUpperCase() : (prev.classes || ''),
          role: cleanRole,
          pin: t.pin ? String(t.pin).trim() : (prev.pin || (cleanRole === 'pengawas' ? 'pengawas123' : 'guru123'))
        });
      } else {
        dedupMap.set(dedupKey, {
          ...t,
          nip: cleanNip,
          name: cleanName,
          classes: t.classes ? String(t.classes).trim().toUpperCase() : '',
          role: cleanRole
        });
      }
    });

    if (!adminObj) {
      adminObj = {
        id: "admin",
        nip: "198501012010011001",
        name: "Proktor Utama / Admin",
        subject: "Semua Mata Pelajaran (Super Admin)",
        role: "admin",
        pin: "admin123"
      };
    }

    return [adminObj, ...Array.from(dedupMap.values())];
  }

  _getOfflineCandidateTeachers() {
    const vault = decodeCbtOfflineVault();
    if (vault && Array.isArray(vault.teachers) && vault.teachers.length > 0) {
      return this._normalizeTeachersArray(vault.teachers);
    }
    const defaults = typeof DEFAULT_TEACHERS !== 'undefined' ? DEFAULT_TEACHERS : [];
    return this._normalizeTeachersArray(defaults);
  }

  restoreSession() {
    try {
      const persistent = localStorage.getItem('cbt_logged_teacher_session') || sessionStorage.getItem('cbt_logged_teacher');
      if (persistent) {
        const parsed = JSON.parse(persistent);
        if (parsed && parsed.id) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Gagal restore sesi login:", e);
    }
    return null;
  }

  loadTeachers() {
    if (!this.isAuthenticated || !this.currentTeacher) {
      try { localStorage.removeItem('cbt_teachers_list'); } catch (e) {}
      return [];
    }

    if (this.currentTeacher.role === 'admin' || this.currentTeacher.id === 'admin') {
      const saved = localStorage.getItem('cbt_teachers_list');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return this._normalizeTeachersArray(parsed);
          }
        } catch (e) {
          console.error("Gagal load teachers:", e);
        }
      }
      const candidates = this._getOfflineCandidateTeachers();
      try {
        localStorage.setItem('cbt_teachers_list', JSON.stringify(candidates));
      } catch (e) {}
      return candidates;
    }

    // Mode Guru Mapel: jangan menyimpan PIN seluruh guru ke localStorage
    try { localStorage.removeItem('cbt_teachers_list'); } catch (e) {}
    return [this.currentTeacher];
  }

  saveTeachers(teachersList, skipCloudPush = false) {
    const normalized = this._normalizeTeachersArray(teachersList);
    if (this.currentTeacher && this.currentTeacher.id) {
      const updatedSelf = normalized.find(t => t.id === this.currentTeacher.id);
      if (updatedSelf) {
        this.currentTeacher = updatedSelf;
        try {
          localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(updatedSelf));
          sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(updatedSelf));
        } catch (e) {}
      }
    }

    if (this.isSuperAdminUser()) {
      this.teachers = normalized;
      try {
        localStorage.setItem('cbt_teachers_list', JSON.stringify(this.teachers));
      } catch (e) {}
      if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
        window.supabaseSync.pushStateKey('cbt_teachers_list', this.teachers);
      }
      return;
    }

    try { localStorage.removeItem('cbt_teachers_list'); } catch (e) {}
    if (this.isAuthenticated) {
      this.teachers = this._sanitizeTeachersListForGuru(normalized);
    } else {
      this.teachers = [];
    }
  }

  getAuthRpcCredentials() {
    if (!this.isAuthenticated || !this.currentTeacher) return null;
    const identifier = String(this.currentTeacher.nip || this.currentTeacher.id || '').trim();
    const pin = String(this.currentTeacher.pin || '').trim();
    if (!identifier || !pin) return null;
    return { identifier, pin };
  }

  getAllTeachers() {
    return this.teachers;
  }

  splitSubjectTokens(rawStr) {
    const raw = String(rawStr || '').trim();
    if (!raw || raw === '-' || raw === '—') return [];
    const protectedStr = raw.replace(/Pendidikan Jasmani,\s*Olahraga/gi, 'Pendidikan Jasmani__COMMA__Olahraga');
    return protectedStr
      .split(/[,/;]+/)
      .map(s => s.replace(/__COMMA__/g, ', ').trim())
      .filter(s => {
        if (!s) return false;
        const low = s.toLowerCase();
        return low !== '-' && low !== '—' && low !== 'umum' && !low.includes('semua') && !low.includes('super admin');
      });
  }

  getAllSubjects() {
    const subjectsSet = new Set();

    if (window.examEngine && window.examEngine.config && window.examEngine.config.subject) {
      this.splitSubjectTokens(window.examEngine.config.subject).forEach(p => subjectsSet.add(p));
    }

    if (Array.isArray(this.teachers)) {
      this.teachers.forEach(t => {
        if (t.role !== 'admin' && t.role !== 'pengawas' && t.id !== 'admin' && t.subject && !t.subject.toLowerCase().includes('semua') && !t.subject.toLowerCase().includes('pengawas')) {
          this.splitSubjectTokens(t.subject).forEach(p => subjectsSet.add(p));
        }
      });
    }

    if (Array.isArray(this.schedules)) {
      this.schedules.forEach(s => {
        if (s.subject) {
          this.splitSubjectTokens(s.subject).forEach(p => subjectsSet.add(p));
        }
      });
    }

    try {
      if (window.examEngine && Array.isArray(window.examEngine.questions)) {
        window.examEngine.questions.forEach(q => {
          if (q.subject) {
            this.splitSubjectTokens(q.subject).forEach(p => subjectsSet.add(p));
          }
        });
      }
    } catch (e) {}

    try {
      const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      rawResults.forEach(r => {
        if (r.subject) {
          this.splitSubjectTokens(r.subject).forEach(p => subjectsSet.add(p));
        }
      });
    } catch (e) {}

    return Array.from(subjectsSet).filter(Boolean);
  }

  getTeacherSubjectsList(teacher = null) {
    const t = teacher || this.getCurrentTeacher();
    if (!t || t.role === 'admin' || t.id === 'admin' || String(t.role || '').toLowerCase() === 'pengawas') return [];
    return this.splitSubjectTokens(t.subject);
  }

  parseTeacherClasses(classesStr) {
    const raw = String(classesStr || "").trim().toUpperCase();
    if (!raw || raw === "SEMUA" || raw === "SEMUA KELAS" || raw === "ALL") return [];
    const norm = (tok) => (window.examEngine && typeof window.examEngine.normalizeClassToken === 'function')
      ? window.examEngine.normalizeClassToken(tok)
      : String(tok || '').trim().replace(/^KELAS\s+/i, '').replace(/[\s\-_]+/g, '');
    const result = [];
    raw.split(/[,;/]+/).forEach(token => {
      const part = token.trim().replace(/^KELAS\s+/i, '');
      if (!part) return;
      const mRange = part.match(/^([0-9IVX]+)\s*[- ]*\s*([A-Z])\s*(?:S\/D|SD|-|TO)\s*(?:[0-9IVX]+\s*[- ]*\s*)?([A-Z])$/i);
      if (mRange) {
        const grade = norm(mRange[1]).match(/^\d+/) ? norm(mRange[1]) : mRange[1];
        const startCode = mRange[2].toUpperCase().charCodeAt(0);
        const endCode = mRange[3].toUpperCase().charCodeAt(0);
        if (startCode <= endCode && endCode - startCode <= 12) {
          for (let c = startCode; c <= endCode; c++) {
            result.push(grade + String.fromCharCode(c));
          }
          return;
        }
      }
      const cleaned = norm(part);
      if (cleaned) result.push(cleaned);
    });
    return [...new Set(result)];
  }

  normalizePengawasRoomSchedule(rawSchedule) {
    const validDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const out = {};
    if (!rawSchedule || typeof rawSchedule !== 'object') return out;
    validDays.forEach(day => {
      const matchKey = Object.keys(rawSchedule).find(k => String(k).trim().toLowerCase() === day.toLowerCase());
      const val = matchKey ? String(rawSchedule[matchKey] || '').trim().toUpperCase() : '';
      if (val) out[day] = val;
    });
    return out;
  }

  hasPengawasWeeklySchedule(teacher = null) {
    const t = teacher || this.getCurrentTeacher();
    const norm = this.normalizePengawasRoomSchedule(t && t.roomSchedule);
    return Object.keys(norm).length > 0;
  }

  getLocalDateIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getPengawasSessionRoomKey(teacher = null) {
    const t = teacher || this.getCurrentTeacher();
    const tid = String((t && (t.id || t.nip)) || 'unknown').trim();
    return `cbt_pengawas_room_${tid}_${this.getLocalDateIso()}`;
  }

  getPengawasSessionRoom(teacher = null) {
    try {
      const key = this.getPengawasSessionRoomKey(teacher);
      return String(sessionStorage.getItem(key) || '').trim().toUpperCase();
    } catch (e) {
      return '';
    }
  }

  setPengawasSessionRoom(roomVal, teacher = null) {
    try {
      const key = this.getPengawasSessionRoomKey(teacher);
      const clean = String(roomVal || '').trim().toUpperCase();
      if (clean) sessionStorage.setItem(key, clean);
      else sessionStorage.removeItem(key);
    } catch (e) {}
  }

  getPengawasActiveDayName(teacher = null, activeSchedules = null) {
    const t = teacher || this.getCurrentTeacher();
    const normSched = this.normalizePengawasRoomSchedule(t && t.roomSchedule);
    const todayDay = this.getIndonesianDayName(this.getLocalDateIso()) || 'Senin';
    if (normSched[todayDay]) return todayDay;
    const activeList = Array.isArray(activeSchedules)
      ? activeSchedules
      : (this.getActiveSchedules ? this.getActiveSchedules() : []);
    const matchedActiveDay = activeList
      .map(s => String(s && s.day || '').trim())
      .find(d => d && normSched[d]);
    if (matchedActiveDay) return matchedActiveDay;
    const firstActiveDay = activeList.map(s => String(s && s.day || '').trim()).find(Boolean);
    return (todayDay === 'Minggu' && firstActiveDay) ? firstActiveDay : todayDay;
  }

  searchTeachers(query = "", roleFilter = "ALL") {
    const q = String(query || "").trim().toLowerCase();
    const rf = String(roleFilter || "ALL").trim().toLowerCase();
    return this.teachers.filter(t => {
      if (!t) return false;
      const isAdm = t.role === 'admin' || t.id === 'admin';
      const roleVal = isAdm ? 'admin' : (String(t.role || '').toLowerCase() === 'pengawas' ? 'pengawas' : 'guru');
      if (rf !== 'all' && roleVal !== rf) return false;
      if (!q) return true;
      const roomSchedText = t.roomSchedule ? Object.values(t.roomSchedule).join(' ').toLowerCase() : '';
      return (t.name && t.name.toLowerCase().includes(q)) ||
        (t.nip && String(t.nip).toLowerCase().includes(q)) ||
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (t.classes && String(t.classes).toLowerCase().includes(q)) ||
        (roomSchedText && roomSchedText.includes(q));
    });
  }

  addTeacher({ name, nip, subject, classes, pin, role = "guru", roomSchedule = null }) {
    const cleanName = String(name || "").trim();
    const cleanNip = String(nip || "").trim();
    const cleanRole = String(role || "guru").trim().toLowerCase() === "pengawas" ? "pengawas" : "guru";
    let cleanSubject = String(subject || "").trim();
    if (cleanRole === "pengawas" && !cleanSubject) {
      cleanSubject = "Semua Mapel Aktif (Pengawas Ruang)";
    }
    const cleanClasses = String(classes || "").trim().toUpperCase();
    const cleanPin = String(pin || (cleanRole === "pengawas" ? "pengawas123" : "guru123")).trim();

    if (!cleanName || !cleanNip || (cleanRole !== "pengawas" && !cleanSubject)) {
      return { success: false, message: cleanRole === "pengawas" ? "Nama Pengawas dan NIP/ID Login wajib diisi!" : "Nama Guru, NIP, dan Mata Pelajaran wajib diisi!" };
    }

    const existingSameRole = this.teachers.find(t =>
      t.role !== 'admin' && t.id !== 'admin' &&
      String(t.nip || '').trim().toLowerCase() === cleanNip.toLowerCase() &&
      (String(t.role || 'guru').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru') === cleanRole
    );
    if (existingSameRole) {
      const roleLbl = cleanRole === 'pengawas' ? 'Pengawas Ruang' : 'Guru Mapel';
      return { success: false, message: `NIP/ID ${cleanNip} sudah terdaftar sebagai ${roleLbl} (${existingSameRole.name})!` };
    }

    const existingOtherRole = this.teachers.find(t =>
      t.role !== 'admin' && t.id !== 'admin' &&
      String(t.nip || '').trim().toLowerCase() === cleanNip.toLowerCase() &&
      (String(t.role || 'guru').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru') !== cleanRole
    );
    if (existingOtherRole && String(existingOtherRole.pin || '').trim() === cleanPin) {
      const otherLbl = cleanRole === 'pengawas' ? 'Guru Mapel' : 'Pengawas Ruang';
      const suggestedPin = cleanRole === 'pengawas' ? 'pengawas123' : 'guru123';
      return {
        success: false,
        message: `NIP ${cleanNip} juga digunakan akun ${otherLbl} dengan PIN yang sama. Gunakan PIN berbeda untuk akun baru ini (misal: ${suggestedPin}) agar akun Guru dan Pengawas tidak bentrok saat login!`
      };
    }

    const newId = (cleanRole === 'pengawas' ? 'pengawas_' : 'guru_') + Date.now();
    const cleanRoomSchedule = cleanRole === 'pengawas' ? this.normalizePengawasRoomSchedule(roomSchedule) : {};
    const newTeacher = {
      id: newId,
      nip: cleanNip,
      name: cleanName,
      subject: cleanSubject,
      classes: cleanClasses,
      role: cleanRole,
      pin: cleanPin
    };
    if (Object.keys(cleanRoomSchedule).length > 0) {
      newTeacher.roomSchedule = cleanRoomSchedule;
    }

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
    return { success: true, message: `Akun ${teacher.name} berhasil dihapus.` };
  }

  updateTeacherProfile(teacherId, { name, nip, subject, classes, pin, role, roomSchedule }) {
    const target = this.teachers.find(t => t.id === teacherId);
    if (!target) {
      return { success: false, message: "Data guru tidak ditemukan!" };
    }

    const isSuperAdmin = target.role === 'admin' || target.id === 'admin';
    const nextRole = isSuperAdmin
      ? 'admin'
      : (role !== undefined ? (String(role).trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru') : (String(target.role || 'guru').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru'));
    const nextNip = nip ? String(nip).trim() : String(target.nip || '').trim();
    const nextPin = pin ? String(pin).trim() : String(target.pin || '').trim();

    if (!isSuperAdmin && nextNip) {
      const sameRoleDup = this.teachers.find(t =>
        t.id !== teacherId &&
        t.role !== 'admin' && t.id !== 'admin' &&
        String(t.nip || '').trim().toLowerCase() === nextNip.toLowerCase() &&
        (String(t.role || 'guru').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru') === nextRole
      );
      if (sameRoleDup) {
        const roleLbl = nextRole === 'pengawas' ? 'Pengawas Ruang' : 'Guru Mapel';
        return { success: false, message: `NIP/ID ${nextNip} sudah dipakai akun ${roleLbl} lain (${sameRoleDup.name})!` };
      }

      const otherRoleDup = this.teachers.find(t =>
        t.id !== teacherId &&
        t.role !== 'admin' && t.id !== 'admin' &&
        String(t.nip || '').trim().toLowerCase() === nextNip.toLowerCase() &&
        (String(t.role || 'guru').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru') !== nextRole
      );
      if (otherRoleDup && String(otherRoleDup.pin || '').trim() === nextPin) {
        const otherLbl = nextRole === 'pengawas' ? 'Guru Mapel' : 'Pengawas Ruang';
        return {
          success: false,
          message: `NIP ${nextNip} juga memiliki akun ${otherLbl} dengan PIN yang sama. Gunakan PIN berbeda agar saat login Guru & Pengawas tidak tertukar!`
        };
      }
    }

    this.teachers = this.teachers.map(t => {
      if (t.id === teacherId) {
        let nextSubject = subject !== undefined ? String(subject).trim() : t.subject;
        if (nextRole === 'pengawas' && !nextSubject) {
          nextSubject = t.subject || "Semua Mapel Aktif (Pengawas Ruang)";
        }
        const nextTeacherObj = {
          ...t,
          name: name ? String(name).trim() : t.name,
          nip: nextNip,
          subject: nextSubject,
          classes: classes !== undefined ? String(classes).trim().toUpperCase() : (t.classes || ""),
          role: nextRole,
          pin: nextPin
        };
        if (nextRole === 'pengawas') {
          const nextSchedRaw = roomSchedule !== undefined ? roomSchedule : t.roomSchedule;
          const normSched = this.normalizePengawasRoomSchedule(nextSchedRaw);
          if (Object.keys(normSched).length > 0) nextTeacherObj.roomSchedule = normSched;
          else delete nextTeacherObj.roomSchedule;
        } else {
          delete nextTeacherObj.roomSchedule;
        }
        return nextTeacherObj;
      }
      return t;
    });

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

  _completeStaffLogin(teacher, directoryPool = null) {
    this.isAuthenticated = true;
    this.currentTeacher = { ...teacher };
    this.selectedSubjectFilter = 'ALL';
    this.selectedClassFilter = 'ALL';

    try {
      localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(this.currentTeacher));
      sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(this.currentTeacher));
    } catch (e) {}

    const isSuperAdmin = this.currentTeacher.role === 'admin' || this.currentTeacher.id === 'admin';
    const vault = decodeCbtOfflineVault();
    const isOffline = !(typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured());

    if (isSuperAdmin) {
      const fullTeachers = Array.isArray(directoryPool) && directoryPool.length > 0
        ? this._normalizeTeachersArray(directoryPool)
        : (vault && Array.isArray(vault.teachers) && vault.teachers.length > 0
          ? this._normalizeTeachersArray(vault.teachers)
          : this._getOfflineCandidateTeachers());
      this.teachers = fullTeachers;
      try {
        localStorage.setItem('cbt_teachers_list', JSON.stringify(this.teachers));
      } catch (e) {}

      if (typeof window !== 'undefined' && window.studentManager) {
        if (isOffline && vault && Array.isArray(vault.students) && vault.students.length > 0) {
          window.studentManager.saveStudents(vault.students, true);
        } else {
          window.studentManager.students = window.studentManager.loadStudents();
        }
      }
    } else {
      try { localStorage.removeItem('cbt_teachers_list'); } catch (e) {}
      this.teachers = Array.isArray(directoryPool) && directoryPool.length > 0
        ? this._sanitizeTeachersListForGuru(directoryPool)
        : [this.currentTeacher];
    }

    if (isOffline && vault) {
      if (Array.isArray(vault.results)) {
        try {
          const curRes = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
          const mergedMap = new Map();
          [...(Array.isArray(curRes) ? curRes : []), ...(Array.isArray(vault.results) ? vault.results : [])].forEach(r => {
            if (!r || !r.id) return;
            const k = String(r.id);
            const prev = mergedMap.get(k);
            if (!prev || (prev.finalScore === undefined && r.finalScore !== undefined)) {
              mergedMap.set(k, r);
            }
          });
          localStorage.setItem('cbt_exam_results', JSON.stringify(Array.from(mergedMap.values())));
        } catch (e) {}
      }
      if (Array.isArray(vault.questions) && vault.questions.length > 0 && typeof window !== 'undefined' && window.examEngine) {
        window.examEngine.saveQuestions(vault.questions, true);
      }
    }

    if (!this.isPengawasUser(this.currentTeacher) && typeof window !== 'undefined' && window.examEngine && typeof window.examEngine.restorePrivilegedQuestionsMode === 'function') {
      window.examEngine.restorePrivilegedQuestionsMode();
    }

    return { success: true, teacher: this.currentTeacher };
  }

  login(identifier, pinInput, directoryOverride = null) {
    const cleanId = String(identifier || "").trim().toLowerCase();
    const cleanPin = String(pinInput || "").trim();

    if (!cleanId) {
      return { success: false, message: "Harap masukkan Username / NIP!" };
    }
    if (!cleanPin) {
      return { success: false, message: "Harap masukkan PIN / Kata Sandi!" };
    }

    const pool = (Array.isArray(directoryOverride) && directoryOverride.length > 0)
      ? this._normalizeTeachersArray(directoryOverride)
      : (this.teachers && this.teachers.length > 0 ? this.teachers : this._getOfflineCandidateTeachers());

    let teacher = null;
    const matchBuckets = [
      pool.filter(t => String(t.nip || '').trim().toLowerCase() === cleanId),
      pool.filter(t => String(t.id || '').trim().toLowerCase() === cleanId),
      pool.filter(t => String(t.name || '').trim().toLowerCase() === cleanId),
      cleanId.length >= 3 ? pool.filter(t => String(t.name || '').toLowerCase().includes(cleanId)) : []
    ];

    for (const candidates of matchBuckets) {
      if (candidates.length > 0) {
        const pinMatched = candidates.find(t => String(t.pin || '').trim() === cleanPin);
        if (pinMatched) {
          teacher = pinMatched;
          break;
        }
        if (!teacher) teacher = candidates[0];
      }
    }

    if (
      !teacher && (
        cleanId === 'admin' ||
        cleanId === 'proktor' ||
        cleanId === 'superadmin' ||
        cleanId === '198501012010011001' ||
        cleanId.includes('admin') ||
        cleanId.includes('proktor')
      )
    ) {
      teacher = pool.find(t => t.id === 'admin' || t.role === 'admin');
    }

    if (!teacher) {
      return {
        success: false,
        message: "Username / NIP tidak terdaftar! Periksa kembali atau hubungi Proktor."
      };
    }

    const expectedPin = String(teacher.pin || '').trim();
    if (!expectedPin || cleanPin !== expectedPin) {
      return { success: false, message: "PIN / Kata Sandi salah!" };
    }

    return this._completeStaffLogin(teacher, pool);
  }

  async loginWithCloud(identifier, pinInput) {
    const cleanId = String(identifier || "").trim();
    const cleanPin = String(pinInput || "").trim();
    if (!cleanId || !cleanPin) {
      return { success: false, message: "Harap masukkan Username / NIP dan PIN!" };
    }

    if (typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
      const rpcRes = await window.supabaseSync.verifyTeacherLoginRpc(cleanId, cleanPin);
      if (rpcRes && rpcRes.success && rpcRes.teacher) {
        const loggedTeacher = { ...rpcRes.teacher, pin: cleanPin };
        return this._completeStaffLogin(loggedTeacher, null);
      }
      if (rpcRes && !rpcRes.rpcUnavailable && !rpcRes.not_seeded) {
        return {
          success: false,
          message: rpcRes.message || "Username / NIP atau Kata Sandi (PIN) tidak sesuai!"
        };
      }

      // Mode Kompatibilitas Pra-SQL / Belum Ter-seed: tarik direktori ke memori sementara tanpa menulis localStorage pada login gagal
      if (typeof window.supabaseSync.pullAuthDirectoryFallback === 'function') {
        const dirRes = await window.supabaseSync.pullAuthDirectoryFallback();
        const cloudTeachers = dirRes && dirRes.state && Array.isArray(dirRes.state.cbt_teachers_list)
          ? dirRes.state.cbt_teachers_list
          : null;
        if (cloudTeachers && cloudTeachers.length > 0) {
          return this.login(cleanId, cleanPin, cloudTeachers);
        }
      }
    }

    return this.login(cleanId, cleanPin, this._getOfflineCandidateTeachers());
  }

  getCurrentTeacher() {
    if (!this.isAuthenticated) return null;
    if (!this.currentTeacher) {
      this.currentTeacher = this.restoreSession();
    } else if (
      this.currentTeacher.id &&
      (this.currentTeacher.role === 'admin' || this.currentTeacher.id === 'admin') &&
      Array.isArray(this.teachers)
    ) {
      const fresh = this.teachers.find(t => t.id === this.currentTeacher.id);
      if (fresh) this.currentTeacher = fresh;
    }
    return this.currentTeacher;
  }

  logout() {
    const isCloud = Boolean(typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured());
    if (!isCloud) {
      try {
        const prevVault = decodeCbtOfflineVault() || {};
        const curResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
        const vaultPayload = {
          teachers: this.isSuperAdminUser() && Array.isArray(this.teachers) && this.teachers.length > 0
            ? this.teachers
            : (Array.isArray(prevVault.teachers) ? prevVault.teachers : []),
          students: (this.isSuperAdminUser() && typeof window !== 'undefined' && window.studentManager)
            ? window.studentManager.getAllStudents()
            : (Array.isArray(prevVault.students) ? prevVault.students : []),
          questions: (typeof window !== 'undefined' && window.examEngine && Array.isArray(window.examEngine.questions))
            ? window.examEngine.questions
            : (Array.isArray(prevVault.questions) ? prevVault.questions : []),
          results: Array.isArray(curResults) && curResults.length > 0
            ? curResults
            : (Array.isArray(prevVault.results) ? prevVault.results : [])
        };
        const sealed = encodeCbtOfflineVault(vaultPayload);
        if (sealed) localStorage.setItem(CBT_OFFLINE_VAULT_STORAGE_KEY, sealed);
      } catch (e) {}
    } else {
      try { localStorage.removeItem(CBT_OFFLINE_VAULT_STORAGE_KEY); } catch (e) {}
    }

    this.isAuthenticated = false;
    this.currentTeacher = null;
    this.teachers = [];
    this.selectedSubjectFilter = 'ALL';
    this.selectedClassFilter = 'ALL';
    try {
      localStorage.removeItem('cbt_logged_teacher_session');
      localStorage.removeItem('cbt_active_admin_tab');
      localStorage.removeItem('cbt_teachers_list');
      localStorage.removeItem('cbt_students_list');
      localStorage.removeItem('cbt_exam_results');
      sessionStorage.removeItem('cbt_logged_teacher');
      sessionStorage.removeItem('cbt_guru_roster_cache');
    } catch (e) {}

    if (isCloud && Array.isArray(this.schedules)) {
      this.schedules = this.schedules.map(s => {
        if (!s || typeof s !== 'object') return s;
        const { token, ...rest } = s;
        return rest;
      });
    }

    if (typeof window !== 'undefined') {
      if (window.studentManager && typeof window.studentManager.scrubSensitiveDataForStudentMode === 'function') {
        window.studentManager.scrubSensitiveDataForStudentMode();
      }
      if (window.examEngine && typeof window.examEngine.enterStudentPrivacyMode === 'function') {
        window.examEngine.enterStudentPrivacyMode();
      }
    }
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

  isTrialQuestion(q) {
    if (!q || typeof q !== 'object') return false;
    if (q.isTrial === false || q.isTrial === 'false') return false;
    if (q.isTrial === true || q.isTrial === 'true') return true;
    return /^\[Soal\s+(?:Simulasi|Uji Coba)/i.test(String(q.question || '').trim());
  }

  _isQuestionOwnedByTeacher(q, teacher) {
    if (!q || !teacher) return false;
    if (teacher.role === 'admin' || teacher.id === 'admin') return true;
    const tId = String(teacher.id || '').trim();
    const tNip = String(teacher.nip || '').trim().toLowerCase();
    const tName = String(teacher.name || '').trim().toLowerCase();

    if (q.createdById && tId && String(q.createdById).trim() === tId) return true;
    if (q.createdByNip && tNip && String(q.createdByNip).trim().toLowerCase() === tNip) return true;
    if (q.createdBy && tName && String(q.createdBy).trim().toLowerCase() === tName) return true;

    // Jika soal eksplisit milik guru lain, tolak visibilitasnya di bank soal guru lain
    if (q.createdById || q.createdByNip) return false;
    const qCreator = String(q.createdBy || '').trim().toLowerCase();
    if (qCreator && qCreator !== 'proktor utama / admin' && !qCreator.includes('admin') && tName && qCreator !== tName) {
      return false;
    }

    // Soal simulasi/bawaan yang dibuat Admin/default (tanpa createdBy guru) tetap bisa dilihat jika mapel & kelas cocok
    const qCls = String(q.classLevel || '').trim().toLowerCase();
    const isAllClassQ = !qCls || qCls === 'semua' || qCls === 'semua kelas' || qCls === 'all';
    // Untuk soal ujian asli "Semua Kelas" yang dibuat admin/bawaan tanpa pemilik spesifik, tetap hanya jika bukan soal buatan guru lain
    if (isAllClassQ && qCreator && !qCreator.includes('admin')) return false;
    return true;
  }

  _normalizeRichQuestionFields(source = {}) {
    const cleanTable = (tbl) => {
      if (!tbl || typeof tbl !== 'object') return null;
      const headers = Array.isArray(tbl.headers) ? tbl.headers.map(h => String(h || '').trim()) : [];
      const rows = Array.isArray(tbl.rows)
        ? tbl.rows.map(r => Array.isArray(r) ? r.map(c => String(c || '').trim()) : [])
        : [];
      if (headers.length === 0 && rows.length === 0) return null;
      const hasContent = headers.some(Boolean) || rows.some(r => r.some(Boolean));
      return hasContent ? { headers, rows } : null;
    };

    const cleanChart = (ch) => {
      if (!ch || typeof ch !== 'object') return null;
      const layout = ['vertical', 'horizontal', 'hierarchy'].includes(String(ch.layout || '').toLowerCase())
        ? String(ch.layout).toLowerCase()
        : 'vertical';
      const nodes = Array.isArray(ch.nodes)
        ? ch.nodes
            .map((n, idx) => ({
              id: String(n?.id || `n${idx + 1}`).trim(),
              label: String(n?.label || '').trim(),
              sublabel: String(n?.sublabel || '').trim(),
              parentId: String(n?.parentId || '').trim(),
              tone: ['blue', 'emerald', 'amber', 'rose', 'violet', 'slate'].includes(String(n?.tone || '').toLowerCase())
                ? String(n.tone).toLowerCase()
                : 'blue'
            }))
            .filter(n => n.label || n.sublabel)
        : [];
      if (nodes.length === 0) return null;
      return {
        title: String(ch.title || '').trim(),
        layout,
        nodes
      };
    };

    let optionTables = null;
    if (source.optionTables && typeof source.optionTables === 'object') {
      const cleaned = {};
      ['A', 'B', 'C', 'D'].forEach(k => {
        const tbl = cleanTable(source.optionTables[k]);
        if (tbl) cleaned[k] = tbl;
      });
      if (Object.keys(cleaned).length > 0) optionTables = cleaned;
    }

    const passageGroupId = source.passageGroupId ? String(source.passageGroupId).trim() : '';
    const passageTitle = source.passageTitle ? String(source.passageTitle).trim() : '';
    const passageText = source.passageText ? String(source.passageText).trim() : '';
    const passageTable = cleanTable(source.passageTable);
    const passageChart = cleanChart(source.passageChart);
    const passageOrder = source.passageOrder ? Math.max(1, parseInt(source.passageOrder, 10) || 1) : undefined;
    const passageGroupSize = source.passageGroupSize ? Math.max(1, parseInt(source.passageGroupSize, 10) || 1) : undefined;

    return {
      tableData: cleanTable(source.tableData),
      optionTables,
      chartData: cleanChart(source.chartData),
      ...(passageGroupId ? { passageGroupId } : {}),
      ...(passageTitle ? { passageTitle } : {}),
      ...(passageText ? { passageText } : {}),
      ...(passageTable ? { passageTable } : {}),
      ...(passageChart ? { passageChart } : {}),
      ...(passageOrder ? { passageOrder } : {}),
      ...(passageGroupSize ? { passageGroupSize } : {})
    };
  }

  getQuestionsFiltered(subjectFilter = 'ALL', classFilter = 'ALL', categoryFilter = 'ALL') {
    const all = window.examEngine ? window.examEngine.questions : [];
    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    const teacherSubjects = this.getTeacherSubjectsList(cur);
    const normalizedCat = String(categoryFilter || 'ALL').trim().toLowerCase();

    const matchesSub = (qSub, target) => (window.examEngine && window.examEngine.matchesSubject)
      ? window.examEngine.matchesSubject(qSub, target)
      : String(qSub || '').toLowerCase() === String(target || '').toLowerCase();

    const matchesCls = (qCls, target) => (window.examEngine && window.examEngine.matchesClassLevel)
      ? window.examEngine.matchesClassLevel(qCls, target)
      : true;

    const filtered = all.filter(q => {
      const qSub = String(q.subject || 'Umum').trim();
      const qCls = String(q.classLevel || 'Semua Kelas').trim();

      if (!isAdmin && cur) {
        if (teacherSubjects.length > 0) {
          if (!q.subject || qSub.toLowerCase() === 'umum') return false;
          const ownsSubject = teacherSubjects.some(ts => matchesSub(qSub, ts));
          if (!ownsSubject) return false;
        }
        // Enforsir kepemilikan pembuat soal: soal dari guru lain (termasuk yang memilih "Semua Kelas") tidak tampil di akun guru lain
        if (!this._isQuestionOwnedByTeacher(q, cur)) return false;

        const teacherClasses = cur.classes ? this.parseTeacherClasses(cur.classes) : [];
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

      if (normalizedCat === 'trial') {
        if (!this.isTrialQuestion(q)) return false;
      } else if (normalizedCat === 'exam') {
        if (this.isTrialQuestion(q)) return false;
      }

      return true;
    });

    return (window.examEngine && typeof window.examEngine.groupPassageQuestionsOrder === 'function')
      ? window.examEngine.groupPassageQuestionsOrder(filtered)
      : filtered;
  }

  _buildQuestionEntity(questionData, id, cur, nowIso, existingQuestion = null) {
    const type = questionData.type || existingQuestion?.type || 'single';
    const richFields = this._normalizeRichQuestionFields(questionData);
    const createdBy = existingQuestion?.createdBy || questionData.createdBy || (cur ? cur.name : "Proktor Utama / Admin");
    const createdById = existingQuestion?.createdById || questionData.createdById || (cur ? cur.id : "admin");
    const createdByNip = existingQuestion?.createdByNip || questionData.createdByNip || (cur ? cur.nip : "");

    const qObj = {
      id,
      subject: String(questionData.subject || existingQuestion?.subject || "Umum").trim(),
      classLevel: String(questionData.classLevel || existingQuestion?.classLevel || "Semua Kelas").trim(),
      createdBy,
      createdById,
      createdByNip,
      type,
      isTrial: questionData.isTrial !== undefined
        ? Boolean(questionData.isTrial)
        : (existingQuestion ? this.isTrialQuestion(existingQuestion) : false),
      question: questionData.question !== undefined ? String(questionData.question) : (existingQuestion?.question || ''),
      image: questionData.image !== undefined ? questionData.image : (existingQuestion?.image || ""),
      weight: Math.max(1, parseInt(questionData.weight, 10) || existingQuestion?.weight || 10),
      updatedAt: nowIso
    };

    if (richFields.tableData) qObj.tableData = richFields.tableData;
    if (richFields.optionTables) qObj.optionTables = richFields.optionTables;
    if (richFields.chartData) qObj.chartData = richFields.chartData;
    if (richFields.passageGroupId) {
      qObj.passageGroupId = richFields.passageGroupId;
      if (richFields.passageTitle) qObj.passageTitle = richFields.passageTitle;
      if (richFields.passageText) qObj.passageText = richFields.passageText;
      if (richFields.passageTable) qObj.passageTable = richFields.passageTable;
      if (richFields.passageChart) qObj.passageChart = richFields.passageChart;
      if (richFields.passageOrder) qObj.passageOrder = richFields.passageOrder;
      if (richFields.passageGroupSize) qObj.passageGroupSize = richFields.passageGroupSize;
    }

    if (type === 'single') {
      qObj.options = questionData.options;
      qObj.correctAnswer = questionData.correctAnswer;
    } else if (type === 'multiple') {
      qObj.options = questionData.options;
      qObj.correctAnswer = Array.isArray(questionData.correctAnswer)
        ? questionData.correctAnswer
        : [questionData.correctAnswer];
    } else if (type === 'true_false') {
      qObj.statements = questionData.statements;
    }

    return qObj;
  }

  addQuestion(questionData) {
    const existing = [...window.examEngine.questions];
    const newId = typeof window.examEngine.generateUniqueQuestionId === 'function'
      ? window.examEngine.generateUniqueQuestionId(existing)
      : (Date.now() * 1000 + Math.floor(Math.random() * 1000));
    const cur = this.getCurrentTeacher();
    const nowIso = new Date().toISOString();

    const newQ = this._buildQuestionEntity(questionData, newId, cur, nowIso, null);
    const questions = [...existing, newQ];
    window.examEngine.saveQuestions(questions, true);

    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.upsertQuestionRow === 'function') {
      window.supabaseSync.upsertQuestionRow(newQ, existing);
    }
    return newQ;
  }

  addQuestionsBatch(questionsDataList = []) {
    if (!Array.isArray(questionsDataList) || questionsDataList.length === 0) {
      return { success: false, count: 0, questions: [], message: 'Daftar soal masih kosong.' };
    }
    const existing = [...window.examEngine.questions];
    const usedIds = new Set(existing.map(q => (q && q.id !== undefined && q.id !== null ? String(q.id) : '')));
    let nextId = Date.now() * 1000 + Math.floor(Math.random() * 500);
    const allocId = () => {
      while (usedIds.has(String(nextId))) nextId += 1;
      const assigned = nextId;
      usedIds.add(String(assigned));
      nextId += 1;
      return assigned;
    };
    const cur = this.getCurrentTeacher();
    const nowIso = new Date().toISOString();

    const createdList = questionsDataList.map(qd => this._buildQuestionEntity(qd, allocId(), cur, nowIso, null));
    const merged = [...existing, ...createdList];
    window.examEngine.saveQuestions(merged, true);

    if (typeof window !== 'undefined' && window.supabaseSync) {
      if (typeof window.supabaseSync.upsertQuestionRows === 'function') {
        window.supabaseSync.upsertQuestionRows(createdList, { seedFallback: merged });
      } else if (typeof window.supabaseSync.upsertQuestionRow === 'function') {
        createdList.forEach(q => window.supabaseSync.upsertQuestionRow(q, merged));
      }
    }
    return { success: true, count: createdList.length, questions: createdList };
  }

  updateQuestionsWeightBatch(questionIds = [], newWeight = 25) {
    const idSet = new Set((Array.isArray(questionIds) ? questionIds : []).map(String));
    const w = Math.max(1, Math.min(100, parseInt(newWeight, 10) || 25));
    if (idSet.size === 0) return { success: false, count: 0 };

    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    const nowIso = new Date().toISOString();
    const updatedRows = [];
    const nextList = [...window.examEngine.questions].map(q => {
      if (!q || !idSet.has(String(q.id))) return q;
      if (!isAdmin && cur && !this._isQuestionOwnedByTeacher(q, cur)) return q;
      const u = { ...q, weight: w, updatedAt: nowIso };
      updatedRows.push(u);
      return u;
    });

    if (updatedRows.length === 0) return { success: false, count: 0 };
    window.examEngine.saveQuestions(nextList, true);
    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.upsertQuestionRows === 'function') {
      window.supabaseSync.upsertQuestionRows(updatedRows, { seedFallback: nextList });
    }
    return { success: true, count: updatedRows.length, weight: w };
  }

  rebalanceQuestionsWeightTo100(questionIds = []) {
    const idList = (Array.isArray(questionIds) ? questionIds : []).map(String);
    if (idList.length === 0) return { success: false, count: 0 };
    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');

    const editableIds = window.examEngine.questions
      .filter(q => q && idList.includes(String(q.id)) && (isAdmin || !cur || this._isQuestionOwnedByTeacher(q, cur)))
      .map(q => String(q.id));
    if (editableIds.length === 0) return { success: false, count: 0 };

    const n = editableIds.length;
    const baseWeight = Math.floor(100 / n);
    const remainder = 100 - (baseWeight * n);
    const weightById = new Map();
    editableIds.forEach((id, idx) => {
      weightById.set(id, baseWeight + (idx < remainder ? 1 : 0));
    });

    const nowIso = new Date().toISOString();
    const updatedRows = [];
    const nextList = [...window.examEngine.questions].map(q => {
      if (!q || !weightById.has(String(q.id))) return q;
      const u = { ...q, weight: weightById.get(String(q.id)), updatedAt: nowIso };
      updatedRows.push(u);
      return u;
    });

    window.examEngine.saveQuestions(nextList, true);
    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.upsertQuestionRows === 'function') {
      window.supabaseSync.upsertQuestionRows(updatedRows, { seedFallback: nextList });
    }
    return { success: true, count: updatedRows.length, baseWeight };
  }

  updateQuestionsBatch(questionUpdates = []) {
    if (!Array.isArray(questionUpdates) || questionUpdates.length === 0) {
      return { success: false, count: 0, skippedCount: 0, message: 'Tidak ada data pembaruan soal.' };
    }
    const existingList = [...window.examEngine.questions];
    const indexById = new Map();
    existingList.forEach((q, idx) => {
      if (q && q.id !== undefined && q.id !== null) indexById.set(String(q.id), idx);
    });

    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    const nowIso = new Date().toISOString();
    const updatedRows = [];
    let skippedCount = 0;

    questionUpdates.forEach(upd => {
      if (!upd || upd.id === undefined || upd.id === null) return;
      const idx = indexById.get(String(upd.id));
      if (idx === undefined) {
        skippedCount += 1;
        return;
      }
      const existing = existingList[idx];
      if (!isAdmin && cur && !this._isQuestionOwnedByTeacher(existing, cur)) {
        skippedCount += 1;
        return;
      }
      const mergedInput = { ...existing, ...upd };
      if (upd.removeTable === true) delete mergedInput.tableData;
      if (upd.removeChart === true) delete mergedInput.chartData;
      if (upd.removePassage === true) {
        delete mergedInput.passageGroupId;
        delete mergedInput.passageTitle;
        delete mergedInput.passageText;
        delete mergedInput.passageTable;
        delete mergedInput.passageChart;
        delete mergedInput.passageOrder;
        delete mergedInput.passageGroupSize;
      }
      const rebuilt = this._buildQuestionEntity(mergedInput, existing.id, cur, nowIso, existing);
      existingList[idx] = rebuilt;
      updatedRows.push(rebuilt);
    });

    if (updatedRows.length === 0) {
      return {
        success: false,
        count: 0,
        skippedCount,
        message: skippedCount > 0
          ? 'Tidak ada soal yang dapat diperbarui (soal tidak ditemukan atau milik guru lain).'
          : 'Tidak ada perubahan soal.'
      };
    }

    window.examEngine.saveQuestions(existingList, true);
    if (typeof window !== 'undefined' && window.supabaseSync) {
      if (typeof window.supabaseSync.upsertQuestionRows === 'function') {
        window.supabaseSync.upsertQuestionRows(updatedRows, { seedFallback: existingList });
      } else if (typeof window.supabaseSync.upsertQuestionRow === 'function') {
        updatedRows.forEach(q => window.supabaseSync.upsertQuestionRow(q, existingList));
      }
    }
    return { success: true, count: updatedRows.length, skippedCount, questions: updatedRows };
  }

  bulkPatchQuestions(questionIds = [], patch = {}) {
    const idSet = new Set((Array.isArray(questionIds) ? questionIds : []).map(String));
    if (idSet.size === 0) {
      return { success: false, count: 0, skippedCount: 0, message: 'Belum ada soal yang dipilih.' };
    }
    const hasSubj = typeof patch.subject === 'string' && patch.subject.trim() !== '';
    const hasCls = typeof patch.classLevel === 'string' && patch.classLevel.trim() !== '';
    const hasTrial = patch.isTrial !== undefined;
    const hasWeight = patch.weight !== undefined && !Number.isNaN(parseInt(patch.weight, 10));
    const hasPassagePatch = patch.clearPassage === true || (typeof patch.passageGroupId === 'string' && patch.passageGroupId.trim() !== '');

    if (!hasSubj && !hasCls && !hasTrial && !hasWeight && !hasPassagePatch) {
      return { success: false, count: 0, skippedCount: 0, message: 'Tidak ada atribut yang diubah.' };
    }

    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    const nowIso = new Date().toISOString();
    const updatedRows = [];
    let skippedCount = 0;

    const nextList = [...window.examEngine.questions].map(q => {
      if (!q || !idSet.has(String(q.id))) return q;
      if (!isAdmin && cur && !this._isQuestionOwnedByTeacher(q, cur)) {
        skippedCount += 1;
        return q;
      }
      const u = { ...q, updatedAt: nowIso };
      if (hasSubj) u.subject = patch.subject.trim();
      if (hasCls) u.classLevel = patch.classLevel.trim();
      if (hasTrial) u.isTrial = Boolean(patch.isTrial);
      if (hasWeight) u.weight = Math.max(1, Math.min(100, parseInt(patch.weight, 10) || 10));
      if (patch.clearPassage === true) {
        delete u.passageGroupId;
        delete u.passageTitle;
        delete u.passageText;
        delete u.passageTable;
        delete u.passageChart;
        delete u.passageOrder;
        delete u.passageGroupSize;
      } else if (patch.passageGroupId) {
        u.passageGroupId = String(patch.passageGroupId).trim();
        if (patch.passageTitle !== undefined) u.passageTitle = String(patch.passageTitle).trim();
        if (patch.passageText !== undefined) u.passageText = String(patch.passageText);
      }
      updatedRows.push(u);
      return u;
    });

    if (updatedRows.length === 0) {
      return {
        success: false,
        count: 0,
        skippedCount,
        message: skippedCount > 0 ? 'Soal milik guru lain tidak dapat diubah.' : 'Tidak ada soal yang cocok.'
      };
    }

    window.examEngine.saveQuestions(nextList, true);
    if (typeof window !== 'undefined' && window.supabaseSync) {
      if (typeof window.supabaseSync.upsertQuestionRows === 'function') {
        window.supabaseSync.upsertQuestionRows(updatedRows, { seedFallback: nextList });
      } else if (typeof window.supabaseSync.upsertQuestionRow === 'function') {
        updatedRows.forEach(q => window.supabaseSync.upsertQuestionRow(q, nextList));
      }
    }
    return { success: true, count: updatedRows.length, skippedCount, questions: updatedRows };
  }

  updateQuestion(id, questionData) {
    const existingList = [...window.examEngine.questions];
    const targetIdx = existingList.findIndex(q => String(q.id) === String(id));
    if (targetIdx === -1) {
      return { success: false, message: "Butir soal tidak ditemukan di bank soal." };
    }

    const existing = existingList[targetIdx];
    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    if (!isAdmin && cur && !this._isQuestionOwnedByTeacher(existing, cur)) {
      return { success: false, message: "Anda tidak memiliki izin mengubah soal milik guru lain." };
    }
    const nowIso = new Date().toISOString();
    const updatedQ = this._buildQuestionEntity(questionData, existing.id, cur, nowIso, existing);

    existingList[targetIdx] = updatedQ;
    window.examEngine.saveQuestions(existingList, true);

    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.upsertQuestionRow === 'function') {
      window.supabaseSync.upsertQuestionRow(updatedQ, existingList);
    }
    return { success: true, question: updatedQ };
  }

  deleteQuestion(id) {
    const prevQuestions = [...window.examEngine.questions];
    const target = prevQuestions.find(q => String(q.id) === String(id));
    const cur = this.getCurrentTeacher();
    const isAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    if (target && !isAdmin && cur && !this._isQuestionOwnedByTeacher(target, cur)) {
      return { success: false, message: "Anda tidak dapat menghapus soal milik guru lain." };
    }
    const questions = prevQuestions.filter(q => String(q.id) !== String(id));
    window.examEngine.saveQuestions(questions, true);

    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.deleteQuestionRow === 'function') {
      window.supabaseSync.deleteQuestionRow(id, prevQuestions);
    }
    return { success: true };
  }

  resetToDefaultQuestions() {
    const nowIso = new Date().toISOString();
    const defaults = (typeof DEFAULT_QUESTIONS !== 'undefined' && Array.isArray(DEFAULT_QUESTIONS) ? DEFAULT_QUESTIONS : []).map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options.map(o => ({ ...o })) : undefined,
      correctAnswer: Array.isArray(q.correctAnswer) ? [...q.correctAnswer] : q.correctAnswer,
      statements: Array.isArray(q.statements) ? q.statements.map(s => ({ ...s })) : undefined,
      updatedAt: nowIso
    }));
    window.examEngine.saveQuestions(defaults, true);

    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.replaceAllQuestionRows === 'function') {
      window.supabaseSync.replaceAllQuestionRows(defaults);
    }
    return { success: true, count: defaults.length };
  }

  seedTrialQuestionsForTeachers(options = {}) {
    if (!window.examEngine) {
      return { success: false, addedCount: 0, affectedSubjects: [], message: 'Mesin ujian belum siap.' };
    }

    const onlyForCurrentTeacher = Boolean(options.onlyForCurrentTeacher);
    const onlyMissingSubjects = options.onlyMissingSubjects !== false;
    const targetSubjectFilter = options.targetSubject && options.targetSubject !== 'ALL' ? String(options.targetSubject).trim() : null;

    const existing = Array.isArray(window.examEngine.questions) ? [...window.examEngine.questions] : [];
    const workingList = [...existing];
    const usedIds = new Set(workingList.map(q => (q && q.id !== undefined && q.id !== null ? String(q.id) : '')));
    let nextId = Date.now() * 1000 + Math.floor(Math.random() * 500);
    const allocId = () => {
      while (usedIds.has(String(nextId))) nextId += 1;
      const id = nextId;
      usedIds.add(String(id));
      nextId += 1;
      return id;
    };

    const matchesSub = (qSub, target) => (window.examEngine && window.examEngine.matchesSubject)
      ? window.examEngine.matchesSubject(qSub, target)
      : String(qSub || '').toLowerCase() === String(target || '').toLowerCase();
    const matchesCls = (qCls, target) => (window.examEngine && window.examEngine.matchesClassLevel)
      ? window.examEngine.matchesClassLevel(qCls, target)
      : true;

    const cur = this.getCurrentTeacher();
    let teacherPool = [];
    if (onlyForCurrentTeacher && cur && cur.role !== 'admin' && cur.id !== 'admin') {
      teacherPool = [cur];
    } else {
      teacherPool = (Array.isArray(this.teachers) ? this.teachers : []).filter(t => t && t.role !== 'admin' && t.id !== 'admin');
      if (teacherPool.length === 0 && typeof DEFAULT_TEACHERS !== 'undefined' && Array.isArray(DEFAULT_TEACHERS)) {
        teacherPool = DEFAULT_TEACHERS.filter(t => t && t.role !== 'admin' && t.id !== 'admin');
      }
    }

    const defaultTemplates = (typeof DEFAULT_QUESTIONS !== 'undefined' && Array.isArray(DEFAULT_QUESTIONS)) ? DEFAULT_QUESTIONS : [];
    const nowIso = new Date().toISOString();
    const newQuestions = [];
    const affectedSubjectsSet = new Set();

    const buildFallbackTrialTemplates = (subjName) => [
      {
        type: 'single',
        question: `[Soal Simulasi - ${subjName}] Soal ini disediakan untuk menguji tampilan Pilihan Ganda Tunggal, navigasi nomor soal, serta perhitungan skor otomatis pada aplikasi CBT. Pilihlah pernyataan yang paling tepat mengenai fungsi soal simulasi:`,
        image: '',
        options: [
          { key: 'A', text: 'Memastikan soal tampil rapi, waktu berjalan akurat, dan nilai terekam di Rekap Nilai & Peringkat' },
          { key: 'B', text: 'Menghapus seluruh data siswa peserta ujian secara otomatis' },
          { key: 'C', text: 'Menonaktifkan fitur pengawasan dan penyimpanan hasil ujian' },
          { key: 'D', text: 'Mengubah token jadwal ujian tanpa persetujuan proktor' }
        ],
        correctAnswer: 'A',
        weight: 30
      },
      {
        type: 'multiple',
        question: `[Soal Simulasi - ${subjName}] Pilihlah SEMUA hal yang dapat diperiksa melalui soal simulasi Pilihan Ganda Kompleks pada sistem CBT sebelum hari pelaksanaan ujian:`,
        image: '',
        options: [
          { key: 'A', text: 'Kemampuan mencentang lebih dari satu pilihan jawaban pada perangkat siswa' },
          { key: 'B', text: 'Kesesuaian tampilan butir soal dan opsi jawaban di layar laptop maupun HP' },
          { key: 'C', text: 'Mengabaikan kunci jawaban agar nilai siswa selalu nol' },
          { key: 'D', text: 'Ketepatan sinkronisasi hasil jawaban siswa ke panel guru dan proktor' }
        ],
        correctAnswer: ['A', 'B', 'D'],
        weight: 35
      },
      {
        type: 'true_false',
        question: `[Soal Simulasi - ${subjName}] Tentukan kebenaran pernyataan mengenai alur pengerjaan ujian CBT oleh siswa berikut ini:`,
        image: '',
        statements: [
          { id: 's1', text: 'Siswa dapat meninjau kembali jawaban pada setiap nomor sebelum menekan tombol Selesai Ujian.', correct: 'B' },
          { id: 's2', text: 'Jawaban yang telah dikumpulkan oleh siswa otomatis masuk ke Rekap Nilai & Peringkat Guru Mata Pelajaran.', correct: 'B' },
          { id: 's3', text: 'Guru dapat mengedit atau mengganti soal simulasi ini dengan soal asli sebelum ujian dimulai.', correct: 'B' }
        ],
        weight: 35
      }
    ];

    teacherPool.forEach(t => {
      let subjects = this.getTeacherSubjectsList(t);
      if (targetSubjectFilter) {
        subjects = subjects.filter(s => matchesSub(s, targetSubjectFilter));
      }
      const teacherClasses = t.classes ? this.parseTeacherClasses(t.classes) : [];
      const classLevel = teacherClasses.length > 0 ? teacherClasses.join(', ') : 'Semua Kelas';
      const creatorName = t.name || 'Proktor Utama / Admin';

      subjects.forEach(subj => {
        const hasMatch = workingList.some(q => {
          const qSub = String(q.subject || '').trim();
          if (!qSub || qSub.toLowerCase() === 'umum') return false;
          if (!matchesSub(qSub, subj)) return false;
          if (teacherClasses.length > 0) {
            return matchesCls(q.classLevel || 'Semua Kelas', teacherClasses.join(', '));
          }
          return true;
        });

        if (onlyMissingSubjects && hasMatch) return;

        let matchedTemplates = defaultTemplates.filter(dq => dq.subject && matchesSub(dq.subject, subj));
        if (matchedTemplates.length === 0) {
          matchedTemplates = buildFallbackTrialTemplates(subj);
        }

        matchedTemplates.forEach(tpl => {
          const clone = {
            id: allocId(),
            subject: subj,
            classLevel,
            createdBy: creatorName,
            createdById: t.id || '',
            createdByNip: t.nip || '',
            type: tpl.type || 'single',
            isTrial: true,
            question: tpl.question,
            image: tpl.image || '',
            weight: parseInt(tpl.weight, 10) || 10,
            updatedAt: nowIso
          };
          if (clone.type === 'single') {
            clone.options = Array.isArray(tpl.options) ? tpl.options.map(o => ({ ...o })) : [];
            clone.correctAnswer = tpl.correctAnswer;
          } else if (clone.type === 'multiple') {
            clone.options = Array.isArray(tpl.options) ? tpl.options.map(o => ({ ...o })) : [];
            clone.correctAnswer = Array.isArray(tpl.correctAnswer) ? [...tpl.correctAnswer] : [tpl.correctAnswer];
          } else if (clone.type === 'true_false') {
            clone.statements = Array.isArray(tpl.statements) ? tpl.statements.map(s => ({ ...s })) : [];
          }
          newQuestions.push(clone);
          workingList.push(clone);
        });

        affectedSubjectsSet.add(subj);
      });
    });

    if (newQuestions.length === 0) {
      return {
        success: true,
        addedCount: 0,
        affectedSubjects: [],
        message: 'Semua bank soal guru sudah memiliki minimal 1 soal.'
      };
    }

    window.examEngine.saveQuestions(workingList, true);
    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.upsertQuestionRows === 'function') {
      window.supabaseSync.upsertQuestionRows(newQuestions, { seedFallback: workingList });
    }

    return {
      success: true,
      addedCount: newQuestions.length,
      affectedSubjects: Array.from(affectedSubjectsSet)
    };
  }

  clearTrialQuestions(subjectFilter = 'ALL', classFilter = 'ALL') {
    if (!window.examEngine) {
      return { success: false, deletedCount: 0, message: 'Mesin ujian belum siap.' };
    }
    const prevQuestions = [...(window.examEngine.questions || [])];
    const targetTrials = this.getQuestionsFiltered(subjectFilter, classFilter, 'trial');
    if (targetTrials.length === 0) {
      return { success: true, deletedCount: 0, remainingExamCount: this.getQuestionsFiltered(subjectFilter, classFilter, 'exam').length };
    }

    const deleteIdSet = new Set(targetTrials.map(q => String(q.id)));
    const deletedIds = targetTrials.map(q => q.id).filter(id => id !== undefined && id !== null);
    const remaining = prevQuestions.filter(q => !deleteIdSet.has(String(q.id)));

    window.examEngine.saveQuestions(remaining, true);

    if (typeof window !== 'undefined' && window.supabaseSync) {
      if (typeof window.supabaseSync.deleteQuestionRows === 'function') {
        window.supabaseSync.deleteQuestionRows(deletedIds, prevQuestions);
      } else if (typeof window.supabaseSync.deleteQuestionRow === 'function') {
        deletedIds.forEach(id => window.supabaseSync.deleteQuestionRow(id, prevQuestions));
      }
    }

    return {
      success: true,
      deletedCount: targetTrials.length,
      remainingTotalCount: remaining.length,
      remainingExamCount: this.getQuestionsFiltered(subjectFilter, classFilter, 'exam').length
    };
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
        const usedIds = new Set(existing.map(q => (q && q.id !== undefined && q.id !== null ? String(q.id) : '')));
        let nextId = Date.now() * 1000 + Math.floor(Math.random() * 500);
        const nowIso = new Date().toISOString();
        const fallbackSub = (defaultSubject && defaultSubject !== 'ALL' && defaultSubject !== 'UMUM') ? defaultSubject : 'Umum';
        const fallbackCls = (defaultClassLevel && defaultClassLevel !== 'ALL') ? defaultClassLevel : 'Semua Kelas';

        const cur = this.getCurrentTeacher();
        const normalized = parsed.map(item => {
          while (usedIds.has(String(nextId))) {
            nextId += 1;
          }
          const assignedId = nextId;
          usedIds.add(String(assignedId));
          nextId += 1;
          return {
            ...item,
            id: assignedId,
            subject: item.subject ? String(item.subject).trim() : fallbackSub,
            classLevel: item.classLevel ? String(item.classLevel).trim() : fallbackCls,
            createdBy: item.createdBy || (cur ? cur.name : "Proktor Utama / Admin"),
            createdById: item.createdById || (cur ? cur.id : "admin"),
            createdByNip: item.createdByNip || (cur ? cur.nip : ""),
            updatedAt: nowIso
          };
        });

        window.examEngine.saveQuestions([...existing, ...normalized], true);
        if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.upsertQuestionRows === 'function') {
          window.supabaseSync.upsertQuestionRows(normalized, { seedFallback: existing });
        }
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
    const matchesSub = (a, b) => {
      const sa = String(a || '').trim().toLowerCase();
      const sb = String(b || '').trim().toLowerCase();
      if (!sa || !sb || sa === '-' || sb === '-' || sa === '—' || sb === '—') return false;
      if (window.examEngine && typeof window.examEngine.matchesSubject === 'function') {
        return window.examEngine.matchesSubject(sa, sb);
      }
      return sa === sb || sa.includes(sb) || sb.includes(sa);
    };

    if (!isSuperAdmin) {
      const ownedSubjects = this.getTeacherSubjectsList(cur);
      if (ownedSubjects.length === 0) return [];
      filtered = filtered.filter(r => r.subject && ownedSubjects.some(os => matchesSub(r.subject, os)));

      if (sf && sf !== 'ALL') {
        if (!ownedSubjects.some(os => matchesSub(sf, os))) return [];
        filtered = filtered.filter(r => r.subject && matchesSub(r.subject, sf));
      }
    } else if (sf && sf !== 'ALL') {
      filtered = filtered.filter(r => r.subject && matchesSub(r.subject, sf));
    }

    const teacherClasses = (!isSuperAdmin && cur && cur.classes) ? this.parseTeacherClasses(cur.classes) : [];
    const matchesCls = (a, b) => (window.examEngine && typeof window.examEngine.matchesClassLevel === 'function')
      ? window.examEngine.matchesClassLevel(a, b)
      : String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

    if (cf && cf !== 'ALL') {
      filtered = filtered.filter(r => r.student?.class && matchesCls(cf, r.student.class));
    } else if (teacherClasses.length > 0) {
      filtered = filtered.filter(r => {
        const stuClass = String(r.student?.class || '').trim();
        return stuClass && matchesCls(teacherClasses.join(', '), stuClass);
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

  _removeResultsFromOfflineVault(predicateFn) {
    try {
      const vault = decodeCbtOfflineVault();
      if (!vault || !Array.isArray(vault.results)) return;
      vault.results = vault.results.filter(r => !predicateFn(r));
      const sealed = encodeCbtOfflineVault(vault);
      if (sealed) localStorage.setItem(CBT_OFFLINE_VAULT_STORAGE_KEY, sealed);
    } catch (e) {}
  }

  async deleteSingleResult(resultRecord) {
    if (!resultRecord) return { success: false };
    const targetId = String(resultRecord.id || '');
    const targetCloudId = resultRecord._cloudRowId !== undefined && resultRecord._cloudRowId !== null
      ? String(resultRecord._cloudRowId)
      : '';
    const targetNisn = String(resultRecord.student?.nisn || resultRecord.student_nisn || '').trim().toUpperCase();
    const targetSub = String(resultRecord.subject || '').trim().toLowerCase();
    const targetComp = String(resultRecord.completedAt || resultRecord.completed_at || '').trim();

    const isMatch = (r) => {
      if (!r) return false;
      if (targetCloudId && r._cloudRowId !== undefined && String(r._cloudRowId) === targetCloudId) return true;
      if (targetId && String(r.id || '') === targetId) {
        const rn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
        if (!targetNisn || !rn || rn === targetNisn) return true;
      }
      const rn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
      const rs = String(r.subject || '').trim().toLowerCase();
      const rc = String(r.completedAt || r.completed_at || '').trim();
      return Boolean(targetNisn && rn === targetNisn && rs === targetSub && rc === targetComp);
    };

    try {
      const localResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      const remaining = (Array.isArray(localResults) ? localResults : []).filter(r => !isMatch(r));
      localStorage.setItem('cbt_exam_results', JSON.stringify(remaining));
    } catch (e) {}

    this._removeResultsFromOfflineVault(isMatch);

    if (typeof window !== 'undefined' && window.supabaseSync) {
      if (typeof window.supabaseSync.deleteSingleResultFromCloud === 'function') {
        await window.supabaseSync.deleteSingleResultFromCloud(resultRecord);
      } else {
        await window.supabaseSync.deleteStudentResultsFromCloud(targetNisn, resultRecord.subject || null);
      }
      if (targetNisn && resultRecord.subject && typeof window.supabaseSync.removeStudentSession === 'function') {
        await window.supabaseSync.removeStudentSession(resultRecord.student?.nisn || targetNisn, resultRecord.subject);
      }
    }
    return { success: true };
  }

  async clearAllResults(options = {}) {
    const scopeOnlyFiltered = Boolean(options.scopeOnlyFiltered);
    const cur = this.getCurrentTeacher();
    const isSuperAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');
    const targetRecords = scopeOnlyFiltered || !isSuperAdmin
      ? this.getAllResultsSorted(options.subjectFilter || null, options.classFilter || null)
      : null;

    if (Array.isArray(targetRecords)) {
      const matchSet = new Set(targetRecords.map(r => {
        const cid = r._cloudRowId !== undefined && r._cloudRowId !== null ? `ROW:${r._cloudRowId}` : '';
        const nisn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
        const sub = String(r.subject || '').trim().toLowerCase();
        const comp = String(r.completedAt || r.completed_at || '').trim();
        return cid || `${r.id || ''}__${nisn}__${sub}__${comp}`;
      }));
      const isInTarget = (r) => {
        if (!r) return false;
        const cid = r._cloudRowId !== undefined && r._cloudRowId !== null ? `ROW:${r._cloudRowId}` : '';
        const nisn = String(r.student?.nisn || r.student_nisn || '').trim().toUpperCase();
        const sub = String(r.subject || '').trim().toLowerCase();
        const comp = String(r.completedAt || r.completed_at || '').trim();
        return (cid && matchSet.has(cid)) || matchSet.has(`${r.id || ''}__${nisn}__${sub}__${comp}`);
      };
      try {
        const localResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
        const remaining = (Array.isArray(localResults) ? localResults : []).filter(r => !isInTarget(r));
        localStorage.setItem('cbt_exam_results', JSON.stringify(remaining));
      } catch (e) {}
      this._removeResultsFromOfflineVault(isInTarget);
      if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.deleteAllResultsFromCloud === 'function') {
        await window.supabaseSync.deleteAllResultsFromCloud(targetRecords);
      }
      return { success: true, deletedCount: targetRecords.length };
    }

    localStorage.setItem('cbt_exam_results', '[]');
    this._removeResultsFromOfflineVault(() => true);
    if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.deleteAllResultsFromCloud === 'function') {
      await window.supabaseSync.deleteAllResultsFromCloud(null);
    }
    return { success: true };
  }

  async resetStudentAttempts(nisn, subject) {
    const cleanNisn = String(nisn || '').trim().toUpperCase();
    const cleanSub = String(subject || '').trim().toLowerCase();
    if (!cleanNisn) return { success: false };

    const isMatch = (r) => {
      const rNisn = String(r?.student?.nisn || r?.student_nisn || '').trim().toUpperCase();
      const rSub = String(r?.subject || '').trim().toLowerCase();
      return rNisn === cleanNisn && (!cleanSub || rSub === cleanSub);
    };

    try {
      const localResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      const filtered = (Array.isArray(localResults) ? localResults : []).filter(r => !isMatch(r));
      localStorage.setItem('cbt_exam_results', JSON.stringify(filtered));
    } catch (e) {}
    this._removeResultsFromOfflineVault(isMatch);

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
        ["Rank", "Nama Siswa", "NISN", "Kelas", "Nilai Akhir", "Status Remedial", "Jawaban Siswa (Benar & Salah per Nomor)", "Waktu Selesai", "B / S / K", "Keterangan Curang"]
      ];

      results.forEach((r, idx) => {
        const cheatLabel = (r.cheatCount || 0) > 0
          ? `${r.cheatCount}x Pindah Tab (${r.finishReason || 'Pelanggaran'})`
          : `Tertib (0) - ${r.finishReason || 'Selesai'}`;
        const remedialLabel = this.getRemedialStatusLabel(r.finalScore);

        aoaData.push([
          idx + 1,
          r.student?.name || '-',
          r.student?.nisn || '-',
          r.student?.class || 'Umum',
          r.finalScore,
          remedialLabel,
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
      ws['!merges'] = [{ s: { r: footerRowIdx, c: 0 }, e: { r: footerRowIdx, c: 9 } }];

      ws['!cols'] = [
        { wch: 7 },   // Rank
        { wch: 26 },  // Nama
        { wch: 16 },  // NISN
        { wch: 10 },  // Kelas
        { wch: 12 },  // Nilai
        { wch: 16 },  // Status Remedial
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
            <th>Rank</th><th>Nama Siswa</th><th>NISN</th><th>Kelas</th><th>Nilai Akhir</th><th>Status Remedial</th><th>Jawaban Siswa</th><th>Waktu Selesai</th><th>B/S/K</th><th>Keterangan Curang</th>
          </tr>
          ${results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.student?.name || '-'}</td>
              <td>'${r.student?.nisn || '-'}</td>
              <td>${r.student?.class || '-'}</td>
              <td><b>${r.finalScore}</b></td>
              <td><b>${this.getRemedialStatusLabel(r.finalScore)}</b></td>
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
  async exportResultsPDF(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      alert("Belum ada data nilai siswa untuk di-export ke PDF.");
      return;
    }

    const reportElement = document.getElementById('printableTeacherReport');
    if (reportElement) {
      this.populateReportHTML(reportElement, results, subjectFilter, classFilter);
    }

    if (typeof html2pdf === 'undefined') {
      if (reportElement) reportElement.classList.remove('hidden');
      document.body.classList.add('printing-report');
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          if (reportElement) reportElement.classList.add('hidden');
          document.body.classList.remove('printing-report');
        }, 1000);
      }, 200);
      return;
    }

    const btnPdf = document.getElementById('btnExportPDF');
    const prevBtnHtml = btnPdf ? btnPdf.innerHTML : '';
    if (btnPdf) {
      btnPdf.disabled = true;
      btnPdf.innerHTML = '<span>⏳ Membuat PDF...</span>';
    }

    const prevScrollX = window.scrollX || window.pageXOffset || 0;
    const prevScrollY = window.scrollY || window.pageYOffset || 0;
    const filename = `Laporan_Rekap_Nilai_CBT_${Date.now()}.pdf`;

    try {
      window.scrollTo(0, 0);
      const data = this.buildReportRenderData(results, subjectFilter, classFilter);
      const sheets = this.paginateReportSheets(data);

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
            clonedDoc.documentElement.classList.remove('dark');
            if (clonedDoc.body) {
              clonedDoc.body.classList.remove('dark');
              clonedDoc.body.style.background = '#ffffff';
              clonedDoc.body.style.backgroundImage = 'none';
              clonedDoc.body.style.color = '#0f172a';
            }
            const container = clonedDoc.querySelector('.html2pdf__container');
            if (container) {
              container.style.left = '0px';
              container.style.right = 'auto';
              container.style.top = '0px';
              container.style.margin = '0px';
              container.style.background = '#ffffff';
            }
          }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };

      const seedHtml = '<div style="width:10px;height:10px;background:#ffffff;"></div>';
      const pdfDoc = await html2pdf().set(sheetOpt).from(seedHtml).toPdf().get('pdf');

      for (let i = 0; i < sheets.length; i++) {
        const canvas = await html2pdf().set(sheetOpt).from(sheets[i]).toCanvas().get('canvas');
        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        if (i > 0) {
          pdfDoc.addPage('a4', 'landscape');
        }

        const pageW = 297;
        const maxPageH = 208;
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
      console.error("Gagal export PDF rekap:", err);
      if (reportElement) reportElement.classList.remove('hidden');
      document.body.classList.add('printing-report');
      window.print();
      setTimeout(() => {
        if (reportElement) reportElement.classList.add('hidden');
        document.body.classList.remove('printing-report');
      }, 1000);
    } finally {
      window.scrollTo(prevScrollX, prevScrollY);
      if (btnPdf) {
        btnPdf.disabled = false;
        btnPdf.innerHTML = prevBtnHtml;
      }
    }
  }

  buildReportRenderData(results, subjectFilter, classFilter = null) {
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

    const esc = (val) => this.escapePrintHtml(val);
    const safeSub = esc(cfg.schoolSubtitle || '');
    const safeSchool = esc(cfg.schoolName || '');
    const safeAddr = esc(cfg.schoolAddress || '');
    const safeTitle = esc(window.examEngine?.config?.examTitle || 'UJIAN SEKOLAH');
    const safeSubject = esc(subjectName || '-');
    const safeClassLabel = esc(classLabel);
    const safeTitiMangsa = esc(`${cfg.city || 'Pacet'}, ${cfg.date || ''}`);
    const safeHeadmaster = esc(cfg.headmasterName || 'Kepala Sekolah');
    const safeHeadmasterNip = esc(cfg.headmasterNip || '—');
    const safeTeacher = esc(teacherName);
    const safeTeacherNip = esc(teacherNip);
    const safeStamp = esc(this.getPrintStampText());

    const logoLeftHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Kiri" style="width:58px; height:58px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:56px; height:56px; border-radius:8px; background:#1e3a8a; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; flex-shrink:0;">DINAS</div>`;

    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo Kanan" style="width:58px; height:58px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:56px; height:56px; border-radius:50%; background:#059669; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; flex-shrink:0;">SMP</div>`;

    const kopHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #0f172a; padding-bottom:6px; margin-bottom:8px; gap:12px; background:#ffffff; color:#0f172a;">
        ${logoLeftHtml}
        <div style="text-align:center; flex:1; padding:0 12px;">
          <div style="font-size:10.5px; font-weight:700; color:#475569; text-transform:uppercase;">${safeSub}</div>
          <div style="font-size:17px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.6px; line-height:1.15;">${safeSchool}</div>
          <div style="font-size:9.5px; color:#334155; font-weight:600;">${safeAddr}</div>
          <div style="font-size:12.5px; font-weight:900; text-transform:uppercase; margin-top:3px; color:#1e3a8a;">LEMBAR REKAPITULASI RESMI HASIL UJIAN SEKOLAH</div>
          <div style="font-size:10.5px; font-weight:700; color:#334155;">${safeTitle} • Mapel: ${safeSubject}${safeClassLabel}</div>
        </div>
        ${logoRightHtml}
      </div>
    `;

    const buildContHeaderHtml = (pageNum, totalPages) => `
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #0f172a; padding-bottom:4px; margin-bottom:8px; background:#ffffff; color:#0f172a; font-size:10.5px;">
        <div style="font-weight:900; color:#0f172a; text-transform:uppercase;">${safeSchool} — LEMBAR REKAPITULASI HASIL UJIAN</div>
        <div style="font-weight:700; color:#334155;">Mapel: ${safeSubject}${safeClassLabel} &bull; Halaman ${pageNum} / ${totalPages}</div>
      </div>
    `;

    const summaryHtml = `
      <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:7px 9px; margin-bottom:8px; color:#0f172a;">
        <div style="font-size:10px; font-weight:800; text-transform:uppercase; color:#334155; margin-bottom:5px; border-bottom:1px solid #e2e8f0; padding-bottom:3px;">Ringkasan Statistik Rekapitulasi:</div>
        <table style="width:100%; border-collapse:separate; border-spacing:6px 0; text-align:center;">
          <tr>
            <td style="width:20%; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:5px 4px;">
              <span style="display:block; font-size:9.5px; color:#64748b;">Rata-Rata Nilai</span>
              <span style="font-size:13px; font-weight:900; color:#1d4ed8;">${esc(analytics.averageScore)}</span>
            </td>
            <td style="width:20%; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:5px 4px;">
              <span style="display:block; font-size:9.5px; color:#64748b;">Nilai Tertinggi</span>
              <span style="font-size:12px; font-weight:900; color:#047857;">${esc(analytics.highestScore)} (${esc(analytics.highestStudent)})</span>
            </td>
            <td style="width:20%; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:5px 4px;">
              <span style="display:block; font-size:9.5px; color:#64748b;">Nilai Terendah</span>
              <span style="font-size:12px; font-weight:900; color:#b45309;">${esc(analytics.lowestScore)} (${esc(analytics.lowestStudent)})</span>
            </td>
            <td style="width:20%; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:5px 4px;">
              <span style="display:block; font-size:9.5px; color:#64748b;">Total Peserta</span>
              <span style="font-size:13px; font-weight:900; color:#0f172a;">${esc(analytics.totalStudents)} Siswa</span>
            </td>
            <td style="width:20%; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:5px 4px;">
              <span style="display:block; font-size:9.5px; color:#64748b;">Ketuntasan (&ge;75)</span>
              <span style="font-size:13px; font-weight:900; color:#7e22ce;">${esc(analytics.passRatePercentage)}%</span>
            </td>
          </tr>
        </table>
      </div>
    `;

    const theadHtml = `
      <thead>
        <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1; font-weight:700; color:#334155; font-size:10px;">
          <th style="padding:5px 4px; border:1px solid #cbd5e1; text-align:center; width:34px; color:#334155;">Rank</th>
          <th style="padding:5px 5px; border:1px solid #cbd5e1; text-align:left; color:#334155;">Nama Siswa</th>
          <th style="padding:5px 5px; border:1px solid #cbd5e1; text-align:left; width:82px; color:#334155;">NISN</th>
          <th style="padding:5px 4px; border:1px solid #cbd5e1; text-align:center; width:46px; color:#334155;">Kelas</th>
          <th style="padding:5px 4px; border:1px solid #cbd5e1; text-align:center; width:50px; color:#334155;">Nilai Akhir</th>
          <th style="padding:5px 4px; border:1px solid #cbd5e1; text-align:center; width:76px; color:#334155;">Status Remedial</th>
          <th style="padding:5px 5px; border:1px solid #cbd5e1; text-align:left; color:#334155;">Jawaban Siswa (Per Nomor)</th>
          <th style="padding:5px 4px; border:1px solid #cbd5e1; text-align:center; width:96px; color:#334155;">Waktu Selesai</th>
          <th style="padding:5px 4px; border:1px solid #cbd5e1; text-align:center; width:54px; color:#334155;">B/S/K</th>
          <th style="padding:5px 4px; border:1px solid #cbd5e1; text-align:center; width:62px; color:#334155;">Ket. Curang</th>
        </tr>
      </thead>
    `;

    const rowsHtmlArray = results.map((r, idx) => {
      const items = this.getAnswerBreakdownItems(r);
      const ansHtml = items.length > 0
        ? items.map(it => {
            if (it.status === 'correct') {
              return `<span style="display:inline-block; margin:1px 2px; padding:1px 4px; border-radius:3px; background:#dcfce7; color:#166534; font-weight:700; font-size:8.5px;">${esc(it.num)}.${esc(it.studentVal)}&#10003;</span>`;
            }
            return `<span style="display:inline-block; margin:1px 2px; padding:1px 4px; border-radius:3px; background:#fee2e2; color:#991b1b; font-weight:700; font-size:8.5px;">${esc(it.num)}.${esc(it.studentVal)}&#10007;(${esc(it.correctVal)})</span>`;
          }).join('')
        : '<span style="color:#64748b; font-size:9px;">-</span>';

      const isRemedial = Number(r.finalScore || 0) < 75;
      const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      return `
        <tr style="background:${rowBg}; color:#0f172a; border-bottom:1px solid #cbd5e1; font-size:9.5px; break-inside:avoid; page-break-inside:avoid;">
          <td style="padding:4px 4px; border:1px solid #cbd5e1; text-align:center; font-weight:700; color:#0f172a;">${idx + 1}</td>
          <td style="padding:4px 5px; border:1px solid #cbd5e1; font-weight:700; color:#0f172a;">${esc(r.student?.name || '-')}</td>
          <td style="padding:4px 5px; border:1px solid #cbd5e1; font-family:monospace; color:#0f172a;">${esc(r.student?.nisn || '-')}</td>
          <td style="padding:4px 4px; border:1px solid #cbd5e1; text-align:center; color:#0f172a;">${esc(r.student?.class || '-')}</td>
          <td style="padding:4px 4px; border:1px solid #cbd5e1; text-align:center; font-weight:900; font-size:11.5px; color:${isRemedial ? '#dc2626' : '#15803d'};">${esc(r.finalScore)}</td>
          <td style="padding:4px 4px; border:1px solid #cbd5e1; text-align:center; font-weight:800; font-size:9.5px; color:${isRemedial ? '#dc2626' : '#15803d'}; white-space:nowrap;">${isRemedial ? 'Remedial' : 'Tidak Remedial'}</td>
          <td style="padding:4px 5px; border:1px solid #cbd5e1; line-height:1.35; color:#0f172a;">${ansHtml}</td>
          <td style="padding:4px 4px; border:1px solid #cbd5e1; text-align:center; color:#0f172a;">${esc(r.completedAt || '-')}</td>
          <td style="padding:4px 4px; border:1px solid #cbd5e1; text-align:center; color:#0f172a;">${esc(r.correctCount)} / ${esc(r.incorrectCount)} / ${esc(r.unattemptedCount)}</td>
          <td style="padding:4px 4px; border:1px solid #cbd5e1; text-align:center; color:#0f172a;">${(r.cheatCount || 0) > 0 ? esc(r.cheatCount) + 'x Tab' : 'Tertib'}</td>
        </tr>
      `;
    });

    const signatureWrapHtml = `
      <div style="background:#ffffff; color:#0f172a; padding-top:4px; padding-bottom:4px; break-inside:avoid; page-break-inside:avoid;">
        <table style="width:100%; border-collapse:collapse; border-top:1px solid #cbd5e1; font-size:11px; line-height:1.35; color:#0f172a;">
          <tr>
            <td style="width:50%; text-align:center; vertical-align:top; padding:7px 12px 2px 12px;">
              <div style="visibility:hidden; font-weight:500;">${safeTitiMangsa}</div>
              <div style="color:#1e293b;">Mengetahui,</div>
              <div style="font-weight:700; color:#0f172a;">Kepala Sekolah</div>
              <div style="height:36px;"></div>
              <div style="font-weight:700; text-decoration:underline; text-underline-offset:2px; color:#0f172a;">${safeHeadmaster}</div>
              <div style="font-size:10px; color:#475569; margin-top:3px;">NIP. ${safeHeadmasterNip}</div>
            </td>
            <td style="width:50%; text-align:center; vertical-align:top; padding:7px 12px 2px 12px;">
              <div style="font-weight:600; color:#1e293b;">${safeTitiMangsa}</div>
              <div style="color:#1e293b;">Dibuat Oleh,</div>
              <div style="font-weight:700; color:#0f172a;">Guru Mata Pelajaran</div>
              <div style="height:36px;"></div>
              <div style="font-weight:700; text-decoration:underline; text-underline-offset:2px; color:#0f172a;">${safeTeacher}</div>
              <div style="font-size:10px; color:#475569; margin-top:3px;">NIP. ${safeTeacherNip}</div>
            </td>
          </tr>
        </table>
        <div class="cbt-print-footer-note" style="font-size:8.5px; color:#1d4ed8; font-style:italic; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:5px; padding-top:4px; border-top:1px solid #e2e8f0;">${safeStamp}</div>
      </div>
    `;

    return {
      analytics,
      teacherName,
      teacherNip,
      subjectName,
      classLabel,
      cfg,
      kopHtml,
      buildContHeaderHtml,
      summaryHtml,
      theadHtml,
      rowsHtmlArray,
      signatureWrapHtml
    };
  }

  paginateReportSheets(data) {
    const measurer = document.createElement('div');
    measurer.className = 'cbt-light-paper';
    measurer.style.cssText = 'position:fixed; left:-99999px; top:0; width:297mm; padding:6mm 8mm 7mm 8mm; background:#ffffff; color:#0f172a; font-family:"Plus Jakarta Sans", Arial, sans-serif; box-sizing:border-box; visibility:hidden; pointer-events:none; z-index:-1;';
    document.body.appendChild(measurer);

    const wrapSheet = (innerHtml) => `
      <div class="cbt-report-paper-sheet cbt-light-paper" style="width:297mm; padding:6mm 8mm 7mm 8mm; background:#ffffff; color:#0f172a; font-family:'Plus Jakarta Sans', Arial, sans-serif; box-sizing:border-box;">
        ${innerHtml}
      </div>
    `;

    try {
      const sheetRectW = measurer.getBoundingClientRect().width || 1122;
      const pxPerMm = sheetRectW / 297;
      // Total tinggi A4 landscape = 210mm; padding atas+bawah = 13mm; sisakan 5mm ruang aman -> budget konten dalam 192mm
      const maxInnerPx = Math.floor(191 * pxPerMm);

      measurer.innerHTML = `
        <div class="_m_kop">${data.kopHtml}</div>
        <div class="_m_cont">${data.buildContHeaderHtml(2, 2)}</div>
        <div class="_m_sum">${data.summaryHtml}</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:6px;">
          ${data.theadHtml}
          <tbody class="_m_tbody">${data.rowsHtmlArray.join('')}</tbody>
        </table>
        <div class="_m_sig">${data.signatureWrapHtml}</div>
      `;

      const kopH = Math.ceil(measurer.querySelector('._m_kop')?.getBoundingClientRect().height || 95);
      const contH = Math.ceil(measurer.querySelector('._m_cont')?.getBoundingClientRect().height || 30);
      const sumH = Math.ceil(measurer.querySelector('._m_sum')?.getBoundingClientRect().height || 82);
      const theadH = Math.ceil(measurer.querySelector('thead')?.getBoundingClientRect().height || 28);
      const sigH = Math.ceil(measurer.querySelector('._m_sig')?.getBoundingClientRect().height || 135);
      const rowNodes = Array.from(measurer.querySelectorAll('._m_tbody tr'));
      const rowHeights = rowNodes.map(tr => Math.ceil(tr.getBoundingClientRect().height || 32));
      const tableMarginGap = 10;

      const pageGroups = [];
      let currentRows = [];
      let isFirstPage = true;
      let currentH = kopH + sumH + theadH + tableMarginGap;

      for (let i = 0; i < data.rowsHtmlArray.length; i++) {
        const rh = rowHeights[i] || 32;
        if (currentRows.length > 0 && currentH + rh > maxInnerPx) {
          pageGroups.push({ isFirst: isFirstPage, rows: currentRows, withSig: false });
          isFirstPage = false;
          currentRows = [];
          currentH = contH + theadH + tableMarginGap;
        }
        currentRows.push({ html: data.rowsHtmlArray[i], height: rh });
        currentH += rh;
      }

      if (currentH + sigH <= maxInnerPx) {
        pageGroups.push({ isFirst: isFirstPage, rows: currentRows, withSig: true });
      } else {
        // Jika titi mangsa tidak muat di halaman terakhir, pindahkan 1 baris terakhir (jika cukup & aman) agar halaman penutup tetap proporsional
        let carriedRows = [];
        if (currentRows.length > 1) {
          const lastItem = currentRows[currentRows.length - 1];
          if (contH + theadH + tableMarginGap + lastItem.height + sigH <= maxInnerPx) {
            carriedRows.push(currentRows.pop());
          }
        }
        pageGroups.push({ isFirst: isFirstPage, rows: currentRows, withSig: false });
        pageGroups.push({ isFirst: false, rows: carriedRows, withSig: true });
      }

      const totalPages = pageGroups.length;
      return pageGroups.map((pg, idx) => {
        const headerHtml = pg.isFirst
          ? `${data.kopHtml}${data.summaryHtml}`
          : data.buildContHeaderHtml(idx + 1, totalPages);
        const tableHtml = pg.rows.length > 0
          ? `<table style="width:100%; border-collapse:collapse; background:#ffffff; color:#0f172a; margin-bottom:6px;">${data.theadHtml}<tbody>${pg.rows.map(r => r.html).join('')}</tbody></table>`
          : '';
        const sigHtml = pg.withSig ? data.signatureWrapHtml : '';
        return wrapSheet(`${headerHtml}${tableHtml}${sigHtml}`);
      });
    } finally {
      measurer.remove();
    }
  }

  populateReportHTML(el, results, subjectFilter, classFilter = null) {
    const data = this.buildReportRenderData(results, subjectFilter, classFilter);
    const { analytics, teacherName, teacherNip, cfg, kopHtml, rowsHtmlArray } = data;

    const kopEl = document.getElementById('repKopSurat');
    if (kopEl) kopEl.innerHTML = kopHtml;

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
    if (tbody) tbody.innerHTML = rowsHtmlArray.join('');

    const repAutoNoteEl = document.getElementById('repAutoPrintNote');
    if (repAutoNoteEl) repAutoNoteEl.innerText = this.getPrintStampText();
  }

  // ===================== STATUS REMEDIAL & HAK AKSES TOMBOL =====================
  getRemedialStatusLabel(score) {
    return Number(score || 0) < 75 ? 'Remedial' : 'Tidak Remedial';
  }

  getDefaultButtonPermissions() {
    return {
      mode: 'disable', // 'disable' = kunci abu-abu tidak bisa diklik, 'hide' = sembunyikan total
      disabled: {}
    };
  }

  normalizeButtonPermissions(raw) {
    const def = this.getDefaultButtonPermissions();
    if (!raw || typeof raw !== 'object') return def;
    const mode = raw.mode === 'hide' ? 'hide' : 'disable';
    const disabledMap = {};
    if (raw.disabled && typeof raw.disabled === 'object') {
      Object.keys(raw.disabled).forEach(k => {
        if (raw.disabled[k] === true) disabledMap[k] = true;
      });
    }
    return { mode, disabled: disabledMap };
  }

  getButtonPermissionCatalog() {
    return {
      guru: [
        { key: 'guru_tab_results', group: 'Menu Sidebar Guru', label: 'Menu: Rekap Nilai & Peringkat', selector: '#adminTabBtnResults', tabId: 'tabResults' },
        { key: 'guru_tab_monitoring', group: 'Menu Sidebar Guru', label: 'Menu: Monitoring Login Siswa', selector: '#adminTabBtnMonitoring', tabId: 'tabMonitoring' },
        { key: 'guru_tab_questions', group: 'Menu Sidebar Guru', label: 'Menu: Bank Soal', selector: '#adminTabBtnQuestions', tabId: 'tabQuestions' },
        { key: 'guru_btn_refresh_dashboard', group: 'Dashboard Guru', label: 'Tombol: 🔄 Segarkan Data Dashboard', selector: '#btnRefreshDashboardOverview' },
        { key: 'guru_btn_dash_jumps', group: 'Dashboard Guru', label: 'Tombol Pintas Dashboard (Pantau / Rekap / Cek / Bank Soal)', selector: '.dash-jump-btn, #btnDashOpenPreExam' },
        { key: 'guru_btn_clear_results', group: 'Rekap Nilai Guru', label: 'Tombol: 🗑️ Hapus Rekap Nilai', selector: '#btnClearAllResults' },
        { key: 'guru_btn_export_excel', group: 'Rekap Nilai Guru', label: 'Tombol: Download Excel (.xlsx)', selector: '#btnExportExcel' },
        { key: 'guru_btn_export_pdf', group: 'Rekap Nilai Guru', label: 'Tombol: Download PDF (.pdf)', selector: '#btnExportPDF' },
        { key: 'guru_btn_save_attempt_rule', group: 'Monitoring Guru', label: 'Tombol: 💾 Simpan Batas Percobaan', selector: '#btnSaveAttemptRule' },
        { key: 'guru_btn_refresh_monitoring', group: 'Monitoring Guru', label: 'Tombol: 🔄 Refresh Pantauan', selector: '#btnRefreshMonitoring' },
        { key: 'guru_btn_reset_student_attempt', group: 'Monitoring Guru', label: 'Tombol Tabel: 🔄 Izinkan Ulang Siswa', selector: '.btn-reset-student-attempt' },
        { key: 'guru_btn_add_question', group: 'Bank Soal Guru', label: 'Tombol: + Tambah Soal', selector: '#btnOpenAddQuestion' },
        { key: 'guru_btn_edit_question', group: 'Bank Soal Guru', label: 'Tombol Kartu: ✏️ Edit Soal', selector: '.btn-edit-q' },
        { key: 'guru_btn_delete_question', group: 'Bank Soal Guru', label: 'Tombol Kartu: 🗑️ Hapus Soal', selector: '.btn-delete-q' },
        { key: 'guru_btn_seed_simulasi', group: 'Bank Soal Guru', label: 'Tombol: 🧪 Soal Simulasi', selector: '#btnSeedTrialQuestions' },
        { key: 'guru_btn_clear_simulasi', group: 'Bank Soal Guru', label: 'Tombol: 🗑️ Hapus Soal Simulasi', selector: '#btnClearTrialQuestions' },
        { key: 'guru_btn_print_questions', group: 'Bank Soal Guru', label: 'Tombol: 📄 Download Naskah Soal', selector: '#btnOpenPrintQuestions' },
        { key: 'guru_btn_item_analysis', group: 'Bank Soal Guru', label: 'Tombol: 📈 Analisis Butir Soal', selector: '#btnToggleItemAnalysis' },
        { key: 'guru_btn_pre_exam_audit', group: 'Bank Soal Guru', label: 'Tombol: 🛡️ Cek Pra-Ujian', selector: '#btnTogglePreExamAudit' },
        { key: 'guru_btn_refresh_questions', group: 'Bank Soal Guru', label: 'Tombol: 🔄 Segarkan Soal', selector: '#btnRefreshQuestionsCloud' }
      ],
      admin: [
        { key: 'admin_tab_results', group: 'Menu Sidebar Admin', label: 'Menu: Rekap Nilai & Peringkat', selector: '#adminTabBtnResults', tabId: 'tabResults' },
        { key: 'admin_tab_monitoring', group: 'Menu Sidebar Admin', label: 'Menu: Monitoring Login Siswa', selector: '#adminTabBtnMonitoring', tabId: 'tabMonitoring' },
        { key: 'admin_tab_schedules', group: 'Menu Sidebar Admin', label: 'Menu: Jadwal & Mata Pelajaran', selector: '#adminTabBtnSchedules', tabId: 'tabSchedules' },
        { key: 'admin_tab_questions', group: 'Menu Sidebar Admin', label: 'Menu: Bank Soal', selector: '#adminTabBtnQuestions', tabId: 'tabQuestions' },
        { key: 'admin_tab_students', group: 'Menu Sidebar Admin', label: 'Menu: Data Siswa', selector: '#adminTabBtnStudents', tabId: 'tabStudents' },
        { key: 'admin_tab_teachers', group: 'Menu Sidebar Admin', label: 'Menu: Data Guru', selector: '#adminTabBtnTeachers', tabId: 'tabTeachers' },
        { key: 'admin_tab_database', group: 'Menu Sidebar Admin', label: 'Menu: Manajemen Database', selector: '#adminTabBtnDatabase', tabId: 'tabDatabase' },
        { key: 'admin_tab_backup', group: 'Menu Sidebar Admin', label: 'Menu: Backup & Restore', selector: '#adminTabBtnBackup', tabId: 'tabBackup' },
        { key: 'admin_btn_refresh_dashboard', group: 'Dashboard & Rekap Admin', label: 'Tombol: 🔄 Segarkan Data Dashboard', selector: '#btnRefreshDashboardOverview' },
        { key: 'admin_btn_clear_results', group: 'Dashboard & Rekap Admin', label: 'Tombol: 🗑️ Hapus Rekap Nilai', selector: '#btnClearAllResults' },
        { key: 'admin_btn_export_excel', group: 'Dashboard & Rekap Admin', label: 'Tombol: Download Excel (.xlsx)', selector: '#btnExportExcel' },
        { key: 'admin_btn_export_pdf', group: 'Dashboard & Rekap Admin', label: 'Tombol: Download PDF (.pdf)', selector: '#btnExportPDF' },
        { key: 'admin_btn_save_attempt_rule', group: 'Monitoring Admin', label: 'Tombol: 💾 Simpan Batas Percobaan', selector: '#btnSaveAttemptRule' },
        { key: 'admin_btn_refresh_monitoring', group: 'Monitoring Admin', label: 'Tombol: 🔄 Refresh Pantauan', selector: '#btnRefreshMonitoring' },
        { key: 'admin_btn_reset_student_attempt', group: 'Monitoring Admin', label: 'Tombol Tabel: 🔄 Izinkan Ulang Siswa', selector: '.btn-reset-student-attempt' },
        { key: 'admin_btn_submit_schedule', group: 'Jadwal & Mapel Admin', label: 'Tombol: 💾 Simpan ke Daftar Jadwal', selector: '#btnSubmitSchedule' },
        { key: 'admin_btn_toggle_schedule', group: 'Jadwal & Mapel Admin', label: 'Tombol: ▶ Aktifkan / Nonaktifkan Mapel & Semua', selector: '#btnDeactivateAllSchedules, .btn-activate-schedule, .btn-deactivate-schedule' },
        { key: 'admin_btn_edit_schedule', group: 'Jadwal & Mapel Admin', label: 'Tombol Tabel: ✏️ Edit Jadwal', selector: '.btn-edit-schedule' },
        { key: 'admin_btn_delete_schedule', group: 'Jadwal & Mapel Admin', label: 'Tombol Tabel: 🗑️ Hapus Jadwal', selector: '.btn-delete-schedule' },
        { key: 'admin_btn_add_question', group: 'Bank Soal Admin', label: 'Tombol: + Tambah Soal', selector: '#btnOpenAddQuestion' },
        { key: 'admin_btn_edit_question', group: 'Bank Soal Admin', label: 'Tombol Kartu: ✏️ Edit Soal', selector: '.btn-edit-q' },
        { key: 'admin_btn_delete_question', group: 'Bank Soal Admin', label: 'Tombol Kartu: 🗑️ Hapus Soal', selector: '.btn-delete-q' },
        { key: 'admin_btn_seed_simulasi', group: 'Bank Soal Admin', label: 'Tombol: 🧪 Soal Simulasi', selector: '#btnSeedTrialQuestions' },
        { key: 'admin_btn_clear_simulasi', group: 'Bank Soal Admin', label: 'Tombol: 🗑️ Hapus Soal Simulasi', selector: '#btnClearTrialQuestions' },
        { key: 'admin_btn_reset_questions', group: 'Bank Soal Admin', label: 'Tombol: ↺ Reset Soal Bawaan', selector: '#btnResetDefaultQuestions' },
        { key: 'admin_btn_import_questions', group: 'Bank Soal Admin', label: 'Tombol: 📥 Impor JSON Soal', selector: '#btnImportQuestions' },
        { key: 'admin_btn_export_questions', group: 'Bank Soal Admin', label: 'Tombol: 📤 Ekspor JSON Soal', selector: '#btnExportQuestions' },
        { key: 'admin_btn_print_questions', group: 'Bank Soal Admin', label: 'Tombol: 📄 Download Naskah Soal', selector: '#btnOpenPrintQuestions' },
        { key: 'admin_btn_item_analysis', group: 'Bank Soal Admin', label: 'Tombol: 📈 Analisis Butir Soal', selector: '#btnToggleItemAnalysis' },
        { key: 'admin_btn_pre_exam_audit', group: 'Bank Soal Admin', label: 'Tombol: 🛡️ Cek Pra-Ujian', selector: '#btnTogglePreExamAudit' },
        { key: 'admin_btn_refresh_questions', group: 'Bank Soal Admin', label: 'Tombol: 🔄 Segarkan Soal', selector: '#btnRefreshQuestionsCloud' },
        { key: 'admin_btn_add_student', group: 'Data Siswa Admin', label: 'Tombol: + Tambah Siswa', selector: '#btnOpenAddStudent' },
        { key: 'admin_btn_edit_student', group: 'Data Siswa Admin', label: 'Tombol Tabel: ✏️ Edit Siswa', selector: '.btn-edit-student' },
        { key: 'admin_btn_delete_student', group: 'Data Siswa Admin', label: 'Tombol Tabel: 🗑️ Hapus Siswa', selector: '.btn-delete-student' },
        { key: 'admin_btn_import_export_students', group: 'Data Siswa Admin', label: 'Tombol: 📄 Template & 📥 Impor Excel Siswa', selector: '#btnDownloadStudentTemplate, #btnTriggerImportStudents' },
        { key: 'admin_btn_print_student_cards', group: 'Data Siswa Admin', label: 'Tombol: 🪪 Kartu Peserta Ujian', selector: '#btnPrintStudentCards' },
        { key: 'admin_btn_print_attendance', group: 'Data Siswa Admin', label: 'Tombol: 📋 Daftar Hadir Peserta', selector: '#btnOpenAttendanceSheet, #btnOpenAttendanceFromMonitoring' },
        { key: 'admin_btn_reset_student_passwords', group: 'Data Siswa Admin', label: 'Tombol: 🔄 Reset Password Siswa (123)', selector: '#btnResetAllStudentPasswords' },
        { key: 'admin_btn_demo_students', group: 'Data Siswa Admin', label: 'Tombol: 🎲 Isi 250 Siswa Demo', selector: '#btnGenerate250Demo' },
        { key: 'admin_btn_clear_students', group: 'Data Siswa Admin', label: 'Tombol: 🗑️ Hapus Semua Siswa', selector: '#btnClearStudents' },
        { key: 'admin_btn_add_teacher', group: 'Data Guru Admin', label: 'Tombol: + Tambah Guru Baru', selector: '#btnOpenAddTeacher' },
        { key: 'admin_btn_edit_teacher', group: 'Data Guru Admin', label: 'Tombol Tabel: ✏️ Edit Guru', selector: '.btn-edit-teacher' },
        { key: 'admin_btn_delete_teacher', group: 'Data Guru Admin', label: 'Tombol Tabel: 🗑️ Hapus Guru', selector: '.btn-delete-teacher' },
        { key: 'admin_btn_import_export_teachers', group: 'Data Guru Admin', label: 'Tombol: 📄 Template Guru/Pengawas & 📥 Impor Excel', selector: '#btnDownloadTeacherTemplate, #btnDownloadPengawasTemplate, #btnTriggerImportTeachers' },
        { key: 'admin_btn_print_teacher_cards', group: 'Data Guru Admin', label: 'Tombol: 🪪 Kartu Login Guru', selector: '#btnPrintTeacherCards' },
        { key: 'admin_btn_reset_teacher_passwords', group: 'Data Guru Admin', label: 'Tombol: 🔄 Reset Password Guru (guru123)', selector: '#btnResetAllTeacherPasswords' },
        { key: 'admin_btn_pull_cloud', group: 'Database & Backup Admin', label: 'Tombol: ⬇️ Ambil Data dari Cloud', selector: '#btnPullFromCloud' },
        { key: 'admin_btn_push_cloud', group: 'Database & Backup Admin', label: 'Tombol: ☁️ Kirim Semua Data ke Cloud', selector: '#btnPushAllToCloud' },
        { key: 'admin_btn_save_supabase', group: 'Database & Backup Admin', label: 'Tombol: 💾 Simpan & Sinkron Cloud', selector: '#formSupabaseConfig button[type="submit"]' },
        { key: 'admin_btn_export_backup', group: 'Database & Backup Admin', label: 'Tombol: 📥 Download Backup (.json)', selector: '#btnExportFullBackup' },
        { key: 'admin_btn_import_backup', group: 'Database & Backup Admin', label: 'Tombol: 📤 Pulihkan Data Backup (.json)', selector: '#btnTriggerImportFullBackup' }
      ]
    };
  }

  getButtonPermissions() {
    const cfg = this.getSchoolConfig();
    return this.normalizeButtonPermissions(cfg.buttonPermissions);
  }

  saveButtonPermissions(nextPerms, skipCloudPush = false) {
    const cfg = this.getSchoolConfig();
    cfg.buttonPermissions = this.normalizeButtonPermissions(nextPerms);
    return this.saveSchoolConfig(cfg, skipCloudPush);
  }

  isTabDisabledForRole(tabId, isAdmin) {
    if (!tabId || tabId === 'tabDashboard' || (isAdmin && tabId === 'tabSettings')) return false;
    if (!isAdmin && this.isPengawasUser() && tabId === 'tabMonitoring') return false;
    const perms = this.getButtonPermissions();
    const list = isAdmin ? this.getButtonPermissionCatalog().admin : this.getButtonPermissionCatalog().guru;
    const matched = list.find(item => item.tabId === tabId);
    return Boolean(matched && perms.disabled && perms.disabled[matched.key] === true);
  }

  // ===================== KONFIGURASI SEKOLAH & TITI MANGSA =====================
  getDefaultAttendanceIdentity(schoolCfg = null) {
    const cfg = schoolCfg || {};
    const schoolSub = String(cfg.schoolSubtitle || '').toUpperCase();
    let inferredCity = 'KABUPATEN CIANJUR';
    if (schoolSub.includes('MOJOKERTO')) inferredCity = 'KABUPATEN MOJOKERTO';
    else if (cfg.city && String(cfg.city).trim()) {
      const c = String(cfg.city).trim().toUpperCase();
      inferredCity = c.startsWith('KABUPATEN') || c.startsWith('KOTA') ? c : `KABUPATEN ${c}`;
    }
    return {
      docTitle: 'DAFTAR HADIR PESERTA',
      examTitle: 'ASESMEN SUMATIF AKHIR SEMESTER (ASAS)',
      academicYear: 'TAHUN PELAJARAN 2026/2027',
      cityRegency: inferredCity,
      cityCode: '15',
      schoolName: String(cfg.schoolName || 'SMP NEGERI 2 PACET').toUpperCase(),
      schoolCode: '1031',
      serverRoom: '',
      session: '1',
      dayText: '',
      dateText: '',
      timeRange: '07.30 - 09.30',
      subjectName: '',
      headmasterName: cfg.headmasterName || 'Drs. H. Mulyono, M.Pd.',
      headmasterNip: cfg.headmasterNip || '19680512 199403 1 004',
      pengawasName: '',
      pengawasNip: '',
      notes: '1. Dibuat rangkap 2 (dua), masing-masing untuk arsip sekolah dan panitia ujian.\n2. Pengawas ruang menyilang Nama Peserta yang tidak hadir.\n3. Daftar hadir diserahkan kepada panitia ujian setelah sesi selesai.',
      autoTotalStudents: true,
      paperSize: 'F4',
      rowsPerPage: 25
    };
  }

  getSchoolConfig() {
    try {
      const saved = localStorage.getItem('cbt_school_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        const baseCfg = {
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
          kopSuratImage: parsed.kopSuratImage || "",
          buttonPermissions: this.normalizeButtonPermissions(parsed.buttonPermissions)
        };
        const defAtt = this.getDefaultAttendanceIdentity(baseCfg);
        baseCfg.attendanceIdentity = (parsed.attendanceIdentity && typeof parsed.attendanceIdentity === 'object')
          ? { ...defAtt, ...parsed.attendanceIdentity }
          : defAtt;
        return baseCfg;
      }
    } catch (e) {}
    const fallback = {
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
      kopSuratImage: "",
      buttonPermissions: this.getDefaultButtonPermissions()
    };
    fallback.attendanceIdentity = this.getDefaultAttendanceIdentity(fallback);
    return fallback;
  }

  saveSchoolConfig(cfg, skipCloudPush = false) {
    try {
      const existing = this.getSchoolConfig();
      const normalizedCfg = {
        ...(cfg && typeof cfg === 'object' ? cfg : {}),
        buttonPermissions: this.normalizeButtonPermissions(cfg?.buttonPermissions || existing.buttonPermissions),
        attendanceIdentity: (cfg?.attendanceIdentity && typeof cfg.attendanceIdentity === 'object')
          ? { ...this.getDefaultAttendanceIdentity(cfg), ...cfg.attendanceIdentity }
          : existing.attendanceIdentity
      };
      localStorage.setItem('cbt_school_config', JSON.stringify(normalizedCfg));
      if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
        window.supabaseSync.pushStateKey('cbt_school_config', normalizedCfg);
      }
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ===================== IMPORT/EXPORT TEMPLATE GURU & PENGAWAS EXCEL =====================
  downloadTeacherExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert("Pustaka SheetJS belum termuat. Pastikan ada koneksi internet.");
      return;
    }
    const headers = [
      ["TEMPLATE PANGKALAN DATA GURU & PENGAWAS CBT - SMP NEGERI 2 PACET"],
      ["Petunjuk: Jangan ubah baris judul kolom di baris ke-3. Isi data mulai baris ke-4. Kolom Peran Akun diisi 'guru' atau 'pengawas' (kosong = guru)."],
      ["NIP / ID Pengguna (Wajib - Untuk Login)", "Nama Lengkap & Gelar (Wajib)", "Mata Pelajaran yang Diampu", "Password / PIN Login (Wajib)", "Kelas / Ruang Diampu (Opsional, misal: 7A atau 7B, 7C)", "Peran Akun (guru / pengawas)"],
      ["198003152006041002", "Budi Santoso, S.Pd.", "Bahasa Indonesia", "guru123", "", "guru"],
      ["197512022000032001", "Siti Rahmawati, M.Pd.", "Matematika", "guru123", "", "guru"],
      ["198506102010011003", "Rusi, S.Pd.", "Ilmu Pengetahuan Alam (IPA)", "guru123", "7B, 7C", "guru"],
      ["pengawas7a", "Pengawas Ruang Kelas 7A", "Semua Mapel Aktif (Pengawas Ruang)", "pengawas123", "7A", "pengawas"]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws['!cols'] = [
      { wch: 28 },
      { wch: 32 },
      { wch: 34 },
      { wch: 20 },
      { wch: 34 },
      { wch: 26 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Guru");
    XLSX.writeFile(wb, "Template_Daftar_Guru_CBT_SMPN2Pacet.xlsx");
  }

  downloadPengawasExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert("Pustaka SheetJS belum termuat. Pastikan ada koneksi internet.");
      return;
    }
    const schoolClasses = (typeof window !== 'undefined' && window.studentManager && typeof window.studentManager.getAllClasses === 'function')
      ? window.studentManager.getAllClasses().filter(Boolean)
      : [];
    const sampleClasses = schoolClasses.length > 0
      ? schoolClasses.slice(0, 12)
      : ["7A", "7B", "7C", "8A", "8B", "9A", "9B"];

    const exampleRows = sampleClasses.map((cls, idx) => {
      const slug = String(cls).toLowerCase().replace(/[^a-z0-9]+/g, '');
      const roomNo = String(idx + 1).padStart(2, '0');
      return [
        `pengawas_${slug || roomNo}`,
        `Pengawas Ruang ${idx + 1} (Kelas ${cls})`,
        String(cls),
        "pengawas123",
        "pengawas"
      ];
    });

    const headers = [
      ["TEMPLATE DATA PENGAWAS RUANG UJIAN CBT - SMP NEGERI 2 PACET"],
      ["Petunjuk: Jangan ubah judul kolom di baris ke-3. Isi daftar Pengawas mulai baris ke-4. Boleh memakai NIP Guru yang sama asal Password/PIN Pengawas berbeda dari PIN Guru (misal: pengawas123), atau pakai ID ruang (misal: pengawas_7a)."],
      [
        "ID / NIP Login Pengawas (Wajib)",
        "Nama Lengkap Pengawas / Ruang (Wajib)",
        "Kelas / Ruang yang Diawasi (contoh: 7A atau 7A, 7B)",
        "Password / PIN Login (Default: pengawas123)",
        "Peran Akun (Otomatis: pengawas)"
      ],
      ...exampleRows
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws['!cols'] = [
      { wch: 30 },
      { wch: 36 },
      { wch: 38 },
      { wch: 30 },
      { wch: 24 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Pengawas");
    XLSX.writeFile(wb, "Template_Daftar_Pengawas_CBT_SMPN2Pacet.xlsx");
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
        if (rowStr.includes('nip') || rowStr.includes('nama') || rowStr.includes('id login')) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return { success: false, message: "Kolom 'NIP / ID' atau 'Nama' tidak ditemukan pada file Excel!" };
      }

      const headerCells = (rows[headerRowIndex] || []).map(c => String(c || '').trim().toLowerCase());
      const findColIdx = (patterns, fallbackIdx, excludedIndices = []) => {
        for (const p of patterns) {
          const found = headerCells.findIndex((h, idx) => !excludedIndices.includes(idx) && h.includes(p));
          if (found !== -1) return found;
        }
        return fallbackIdx;
      };

      const isPengawasSheet =
        String(firstSheetName || '').toLowerCase().includes('pengawas') ||
        String((rows[0] || []).join(' ')).toLowerCase().includes('pengawas ruang') ||
        (!headerCells.some(h => h.includes('mapel') || h.includes('pelajaran')) &&
          headerCells.some(h => h.includes('kelas') || h.includes('pengawas')));

      const nipIdx = findColIdx(['nip', 'id login', 'id pengguna', 'username'], 0);
      const nameIdx = findColIdx(['nama'], 1, [nipIdx]);
      const subjectIdx = isPengawasSheet ? -1 : findColIdx(['mapel', 'pelajaran'], 2, [nipIdx, nameIdx]);
      const pinIdx = findColIdx(['password', 'pin'], isPengawasSheet ? 3 : 3, [nipIdx, nameIdx]);
      const classIdx = findColIdx(['kelas / ruang', 'kelas', 'ruang'], isPengawasSheet ? 2 : 4, [nipIdx, nameIdx, pinIdx]);
      const roleIdx = findColIdx(['peran', 'role'], isPengawasSheet ? 4 : 5, [nipIdx, nameIdx, pinIdx, classIdx]);

      const dataRows = rows.slice(headerRowIndex + 1);
      let importedCount = 0;
      let guruCount = 0;
      let pengawasCount = 0;
      let pinAdjustedCount = 0;

      dataRows.forEach(row => {
        if (!row || row.length === 0) return;
        const rawNip = row[nipIdx];
        const rawName = row[nameIdx];
        const rawSubject = subjectIdx >= 0 ? row[subjectIdx] : undefined;
        const rawPin = pinIdx >= 0 ? row[pinIdx] : undefined;
        const rawClasses = classIdx >= 0 ? row[classIdx] : undefined;
        const rawRole = roleIdx >= 0 ? row[roleIdx] : undefined;

        const cleanRole = isPengawasSheet
          ? (String(rawRole || '').trim().toLowerCase() === 'guru' ? 'guru' : 'pengawas')
          : (String(rawRole || '').trim().toLowerCase().includes('pengawas') ? 'pengawas' : 'guru');

        if (rawNip && rawName && (rawSubject || cleanRole === 'pengawas')) {
          const cleanNip = String(rawNip).trim();
          const cleanName = String(rawName).trim();
          const cleanSubject = rawSubject && cleanRole !== 'pengawas'
            ? String(rawSubject).trim()
            : "Semua Mapel Aktif (Pengawas Ruang)";
          let cleanPin = rawPin ? String(rawPin).trim() : (cleanRole === 'pengawas' ? "pengawas123" : "guru123");
          const cleanClasses = rawClasses ? String(rawClasses).trim().toUpperCase() : "";

          // Cegah bentrok PIN jika 1 NIP yang sama memiliki akun Guru dan akun Pengawas sekaligus
          const otherRoleDup = this.teachers.find(t =>
            t.role !== 'admin' && t.id !== 'admin' &&
            String(t.nip || '').trim().toLowerCase() === cleanNip.toLowerCase() &&
            (String(t.role || 'guru').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru') !== cleanRole
          );
          if (otherRoleDup && String(otherRoleDup.pin || '').trim() === cleanPin) {
            const altPin = cleanRole === 'pengawas' ? 'pengawas123' : 'guru123';
            cleanPin = (altPin !== cleanPin) ? altPin : `${cleanPin}_2`;
            pinAdjustedCount++;
          }

          const dupSameRole = this.teachers.find(t =>
            t.role !== 'admin' && t.id !== 'admin' &&
            String(t.nip || '').trim().toLowerCase() === cleanNip.toLowerCase() &&
            (String(t.role || 'guru').trim().toLowerCase() === 'pengawas' ? 'pengawas' : 'guru') === cleanRole
          );
          if (dupSameRole) {
            dupSameRole.name = cleanName;
            dupSameRole.subject = cleanSubject;
            dupSameRole.pin = cleanPin;
            dupSameRole.role = cleanRole;
            if (rawClasses !== undefined) dupSameRole.classes = cleanClasses;
            importedCount++;
            if (cleanRole === 'pengawas') pengawasCount++;
            else guruCount++;
          } else if (cleanNip.toLowerCase() !== 'admin' && cleanNip !== '198501012010011001') {
            this.teachers.push({
              id: (cleanRole === 'pengawas' ? 'pengawas_' : 'guru_') + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              nip: cleanNip,
              name: cleanName,
              subject: cleanSubject,
              classes: cleanClasses,
              role: cleanRole,
              pin: cleanPin
            });
            importedCount++;
            if (cleanRole === 'pengawas') pengawasCount++;
            else guruCount++;
          }
        }
      });

      this.saveTeachers(this.teachers);
      return { success: true, count: importedCount, guruCount, pengawasCount, pinAdjustedCount };

    } catch (err) {
      console.error("Gagal parse Excel guru/pengawas:", err);
      return { success: false, message: "Format Excel tidak dapat dibaca: " + err.message };
    }
  }

  // ===================== JADWAL UJIAN & AKTIFKAN MAPEL (KHUSUS ADMIN) =====================
  isSuperAdminUser() {
    const cur = this.getCurrentTeacher();
    return Boolean(cur && (cur.role === 'admin' || cur.id === 'admin'));
  }

  isPengawasUser(teacher = null) {
    const cur = teacher || this.getCurrentTeacher();
    if (!cur) return false;
    if (cur.role === 'admin' || cur.id === 'admin') return false;
    return String(cur.role || '').trim().toLowerCase() === 'pengawas';
  }

  getPengawasScope(teacher = null) {
    const cur = teacher || this.getCurrentTeacher();
    const staticClasses = (cur && cur.classes) ? this.parseTeacherClasses(cur.classes) : [];
    const weeklySchedule = this.normalizePengawasRoomSchedule(cur && cur.roomSchedule);
    const hasWeekly = Object.keys(weeklySchedule).length > 0;
    const explicitSubjects = cur ? this.getTeacherSubjectsList(cur) : [];
    const activeSchedules = this.getActiveSchedules ? this.getActiveSchedules() : [];
    const activeDay = this.getPengawasActiveDayName(cur, activeSchedules);
    const cfg = (typeof window !== 'undefined' && window.examEngine && window.examEngine.config) ? window.examEngine.config : {};

    let mode = 'flexible';
    let assignedClasses = [];
    let sessionSelectedRoom = '';

    if (hasWeekly) {
      mode = 'weekly';
      assignedClasses = weeklySchedule[activeDay] ? this.parseTeacherClasses(weeklySchedule[activeDay]) : [];
    } else if (staticClasses.length > 0) {
      mode = 'fixed';
      assignedClasses = staticClasses;
    } else {
      mode = 'flexible';
      sessionSelectedRoom = this.getPengawasSessionRoom(cur);
      assignedClasses = sessionSelectedRoom ? this.parseTeacherClasses(sessionSelectedRoom) : [];
    }

    const matchesRoom = (schedTargetClass) => {
      if (assignedClasses.length === 0) return false;
      const clsStr = String(schedTargetClass || '').trim();
      if (!clsStr || clsStr.toLowerCase().includes('semua')) return true;
      if (typeof window !== 'undefined' && window.examEngine && typeof window.examEngine.matchesClassLevel === 'function') {
        return window.examEngine.matchesClassLevel(clsStr, assignedClasses.join(', '));
      }
      return true;
    };

    const matchesExplicitSubject = (schedSubj) => {
      if (explicitSubjects.length === 0) return true;
      if (typeof window !== 'undefined' && window.examEngine && typeof window.examEngine.matchesSubject === 'function') {
        return explicitSubjects.some(es => window.examEngine.matchesSubject(schedSubj, es));
      }
      return explicitSubjects.some(es => String(es).toLowerCase() === String(schedSubj || '').toLowerCase());
    };

    const roomMatchedActiveSchedules = assignedClasses.length > 0
      ? activeSchedules.filter(s => matchesRoom(s.classLevel || s.targetClass) && matchesExplicitSubject(s.subject))
      : [];

    const subjectMap = new Map();
    if (assignedClasses.length > 0) {
      if (explicitSubjects.length > 0) {
        if (roomMatchedActiveSchedules.length > 0) {
          roomMatchedActiveSchedules.forEach(s => {
            const nm = String(s.subject || '').trim();
            if (nm && !subjectMap.has(nm.toLowerCase())) subjectMap.set(nm.toLowerCase(), nm);
          });
        } else {
          explicitSubjects.forEach(nm => {
            const clean = String(nm || '').trim();
            if (clean && !subjectMap.has(clean.toLowerCase())) subjectMap.set(clean.toLowerCase(), clean);
          });
        }
      } else if (roomMatchedActiveSchedules.length > 0) {
        roomMatchedActiveSchedules.forEach(s => {
          const nm = String(s.subject || '').trim();
          if (nm && !subjectMap.has(nm.toLowerCase())) subjectMap.set(nm.toLowerCase(), nm);
        });
      } else if (activeSchedules.length === 0 && cfg.subject) {
        const cfgSub = String(cfg.subject || '').trim();
        if (cfgSub && !cfgSub.toLowerCase().includes('semua') && matchesRoom(cfg.targetClass)) {
          subjectMap.set(cfgSub.toLowerCase(), cfgSub);
        }
      }
    }

    return {
      classes: assignedClasses,
      mode,
      activeDay,
      weeklySchedule,
      sessionSelectedRoom,
      subjects: Array.from(subjectMap.values()),
      explicitSubjects,
      matchedSchedules: roomMatchedActiveSchedules
    };
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
            questionCategory: this.normalizeQuestionCategory(s.questionCategory),
            isActive: hasExplicitFlag ? Boolean(s.isActive) : Boolean(activeId && s.id === activeId)
          }));
        }
      } catch (e) {
        console.error("Gagal load schedules:", e);
      }
    }
    localStorage.setItem('cbt_exam_schedules', JSON.stringify(DEFAULT_SCHEDULES));
    return DEFAULT_SCHEDULES.map(s => ({ ...s, questionCategory: this.normalizeQuestionCategory(s.questionCategory) }));
  }

  normalizeQuestionCategory(cat) {
    const val = String(cat || 'ALL').trim().toLowerCase();
    if (val === 'trial' || val === 'simulasi' || val === 'simulation' || val === 'ujicoba' || val === 'uji_coba') return 'trial';
    if (val === 'exam' || val === 'real' || val === 'asli') return 'exam';
    return 'ALL';
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

  addSchedule({ day, dateIso, subject, classLevel, timeRange, durationMinutes, token, maxAttempts, questionCategory }) {
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
    const cleanCategory = this.normalizeQuestionCategory(questionCategory);

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
      questionCategory: cleanCategory,
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
          questionCategory: payload.questionCategory !== undefined
            ? this.normalizeQuestionCategory(payload.questionCategory)
            : this.normalizeQuestionCategory(s.questionCategory),
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
        questionCategory: this.normalizeQuestionCategory(sched.questionCategory),
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
          questionCategory: this.normalizeQuestionCategory(next.questionCategory),
          showScoreToStudent: false
        });
      } else {
        window.examEngine.saveConfig({
          activeScheduleId: "",
          scheduleDay: "",
          scheduleDate: "",
          scheduleTime: "",
          targetClass: "Semua Kelas",
          questionCategory: "ALL",
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
        window.examEngine.saveQuestions(d.cbt_questions, true);
        if (typeof window !== 'undefined' && window.supabaseSync && typeof window.supabaseSync.replaceAllQuestionRows === 'function') {
          window.supabaseSync.replaceAllQuestionRows(d.cbt_questions);
        }
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
    return `<div class="cbt-print-footer-note" style="margin-top:10px; padding-top:4px; border-top:0.5px solid #cbd5e1; font-size:8.5px; color:#1d4ed8; font-style:italic; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${extraStyle}">${this.escapePrintHtml(this.getPrintStampText())}</div>`;
  }

  escapePrintHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderQuestionTableHtml(tableData, isPrint = false, extraClass = '') {
    if (!tableData || typeof tableData !== 'object') return '';
    const headers = Array.isArray(tableData.headers) ? tableData.headers : [];
    const rows = Array.isArray(tableData.rows) ? tableData.rows : [];
    if (headers.length === 0 && rows.length === 0) return '';

    const colCount = Math.max(headers.length, ...rows.map(r => (Array.isArray(r) ? r.length : 0)), 1);
    const padRow = (arr) => Array.from({ length: colCount }, (_, idx) => (arr && arr[idx] !== undefined ? String(arr[idx]) : ''));

    if (isPrint) {
      const theadHtml = headers.some(h => String(h || '').trim() !== '')
        ? `<thead class="cbt-rich-table-print"><tr>${padRow(headers).map(h => `<th style="border:1px solid #000000; padding:3px 5px; font-size:9.5px; font-weight:bold; text-align:left; background:#f1f5f9;">${this.escapePrintHtml(h)}</th>`).join('')}</tr></thead>`
        : '';
      const tbodyHtml = rows.map(r => `<tr>${padRow(r).map(c => `<td style="border:1px solid #000000; padding:3px 5px; font-size:9.5px; line-height:1.3; vertical-align:top; background:#ffffff;">${this.escapePrintHtml(c)}</td>`).join('')}</tr>`).join('');
      return `
        <div style="margin:4px 0 6px 0;">
          <table class="cbt-question-table cbt-rich-table-print" style="width:100%; border-collapse:collapse; border:1px solid #000000; background:#ffffff;">
            ${theadHtml}
            <tbody>${tbodyHtml}</tbody>
          </table>
        </div>
      `;
    }

    const theadHtml = headers.some(h => String(h || '').trim() !== '')
      ? `<thead><tr>${padRow(headers).map(h => `<th>${this.escapePrintHtml(h)}</th>`).join('')}</tr></thead>`
      : '';
    const tbodyHtml = rows.map(r => `<tr>${padRow(r).map(c => `<td>${this.escapePrintHtml(c)}</td>`).join('')}</tr>`).join('');
    return `
      <div class="cbt-rich-table-wrap ${extraClass}">
        <table class="cbt-rich-table cbt-question-table">
          ${theadHtml}
          <tbody>${tbodyHtml}</tbody>
        </table>
      </div>
    `;
  }

  renderChartSvgHtml(chartData, opts = {}) {
    if (!chartData || typeof chartData !== 'object' || !Array.isArray(chartData.nodes) || chartData.nodes.length === 0) return '';
    const isPrint = Boolean(opts.isPrint);
    const compact = Boolean(opts.compact);
    const layout = ['vertical', 'horizontal', 'hierarchy'].includes(String(chartData.layout || '').toLowerCase())
      ? String(chartData.layout).toLowerCase()
      : 'vertical';
    const title = String(chartData.title || '').trim();
    const nodes = chartData.nodes.filter(n => n && (String(n.label || '').trim() || String(n.sublabel || '').trim()));
    if (nodes.length === 0) return '';

    const tonePalette = {
      blue: { fill: '#eff6ff', stroke: '#2563eb', text: '#1e3a8a', sub: '#3b82f6' },
      emerald: { fill: '#ecfdf5', stroke: '#059669', text: '#065f46', sub: '#10b981' },
      amber: { fill: '#fffbeb', stroke: '#d97706', text: '#92400e', sub: '#b45309' },
      rose: { fill: '#fff1f2', stroke: '#e11d48', text: '#881337', sub: '#be123c' },
      violet: { fill: '#f5f3ff', stroke: '#7c3aed', text: '#4c1d95', sub: '#6d28d9' },
      slate: { fill: '#f8fafc', stroke: '#475569', text: '#0f172a', sub: '#475569' }
    };

    const wrapLines = (txt, maxChars = 22) => {
      const words = String(txt || '').trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const lines = [];
      let cur = '';
      words.forEach(w => {
        if ((cur + ' ' + w).trim().length <= maxChars) {
          cur = (cur + ' ' + w).trim();
        } else {
          if (cur) lines.push(cur);
          cur = w;
        }
      });
      if (cur) lines.push(cur);
      return lines.slice(0, 3);
    };

    const titleOffsetY = title ? 26 : 8;
    let svgW = 460;
    let svgH = 220;
    const boxes = [];
    const edges = [];

    if (layout === 'vertical') {
      const boxW = compact ? 220 : 280;
      const boxH = compact ? 46 : 54;
      const gapY = compact ? 22 : 28;
      svgW = boxW + 40;
      const centerX = svgW / 2;
      nodes.forEach((n, idx) => {
        const x = centerX - boxW / 2;
        const y = titleOffsetY + idx * (boxH + gapY);
        boxes.push({ node: n, x, y, w: boxW, h: boxH });
        if (idx > 0) {
          edges.push({ x1: centerX, y1: y - gapY, x2: centerX, y2: y });
        }
      });
      svgH = titleOffsetY + nodes.length * boxH + Math.max(0, nodes.length - 1) * gapY + 14;
    } else if (layout === 'horizontal') {
      const boxW = compact ? 115 : Math.max(115, Math.min(155, Math.floor(540 / Math.max(1, nodes.length))));
      const boxH = compact ? 54 : 62;
      const gapX = compact ? 22 : 28;
      svgW = 24 + nodes.length * boxW + Math.max(0, nodes.length - 1) * gapX;
      svgH = titleOffsetY + boxH + 20;
      nodes.forEach((n, idx) => {
        const x = 12 + idx * (boxW + gapX);
        const y = titleOffsetY + 6;
        boxes.push({ node: n, x, y, w: boxW, h: boxH });
        if (idx > 0) {
          edges.push({ x1: x - gapX, y1: y + boxH / 2, x2: x, y2: y + boxH / 2 });
        }
      });
    } else {
      // Hierarchy / Pohon
      const idSet = new Set(nodes.map(n => String(n.id)));
      const roots = nodes.filter((n, idx) => idx === 0 || !n.parentId || !idSet.has(String(n.parentId)));
      const rootNode = roots[0] || nodes[0];
      const depthMap = new Map([[String(rootNode.id), 0]]);
      let changed = true;
      let guard = 0;
      while (changed && guard < nodes.length + 2) {
        changed = false;
        guard += 1;
        nodes.forEach(n => {
          const nid = String(n.id);
          if (depthMap.has(nid)) return;
          const pid = String(n.parentId || '');
          if (pid && depthMap.has(pid)) {
            depthMap.set(nid, depthMap.get(pid) + 1);
            changed = true;
          }
        });
      }
      nodes.forEach(n => {
        if (!depthMap.has(String(n.id))) depthMap.set(String(n.id), n === rootNode ? 0 : 1);
      });

      const levels = new Map();
      nodes.forEach(n => {
        const lv = depthMap.get(String(n.id)) || 0;
        if (!levels.has(lv)) levels.set(lv, []);
        levels.get(lv).push(n);
      });
      const sortedLvKeys = Array.from(levels.keys()).sort((a, b) => a - b);
      const maxCols = Math.max(...sortedLvKeys.map(k => levels.get(k).length), 1);
      const boxW = compact ? 124 : 150;
      const boxH = compact ? 48 : 56;
      const gapX = 18;
      const gapY = 30;
      svgW = Math.max(340, 24 + maxCols * boxW + Math.max(0, maxCols - 1) * gapX);
      svgH = titleOffsetY + sortedLvKeys.length * boxH + Math.max(0, sortedLvKeys.length - 1) * gapY + 18;

      const posById = new Map();
      sortedLvKeys.forEach((lvKey, rowIdx) => {
        const lvNodes = levels.get(lvKey);
        const totalRowW = lvNodes.length * boxW + Math.max(0, lvNodes.length - 1) * gapX;
        const startX = (svgW - totalRowW) / 2;
        const y = titleOffsetY + rowIdx * (boxH + gapY);
        lvNodes.forEach((n, colIdx) => {
          const x = startX + colIdx * (boxW + gapX);
          const box = { node: n, x, y, w: boxW, h: boxH };
          boxes.push(box);
          posById.set(String(n.id), box);
        });
      });

      nodes.forEach(n => {
        if (String(n.id) === String(rootNode.id)) return;
        const childBox = posById.get(String(n.id));
        const parentBox = posById.get(String(n.parentId || '')) || posById.get(String(rootNode.id));
        if (childBox && parentBox && childBox !== parentBox) {
          edges.push({
            x1: parentBox.x + parentBox.w / 2,
            y1: parentBox.y + parentBox.h,
            x2: childBox.x + childBox.w / 2,
            y2: childBox.y,
            elbow: true
          });
        }
      });
    }

    const markerId = `cbtArrow_${Math.random().toString(36).slice(2, 8)}`;
    const edgePaths = edges.map(e => {
      if (e.elbow) {
        const midY = (e.y1 + e.y2) / 2;
        return `<path d="M ${e.x1} ${e.y1} L ${e.x1} ${midY} L ${e.x2} ${midY} L ${e.x2} ${e.y2 - 3}" fill="none" stroke="${isPrint ? '#1e293b' : '#64748b'}" stroke-width="1.8" marker-end="url(#${markerId})" />`;
      }
      return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${isPrint ? '#1e293b' : '#64748b'}" stroke-width="1.8" marker-end="url(#${markerId})" />`;
    }).join('');

    const boxesMarkup = boxes.map(b => {
      const pal = isPrint
        ? { fill: '#ffffff', stroke: '#0f172a', text: '#000000', sub: '#334155' }
        : (tonePalette[b.node.tone] || tonePalette.blue);
      const labelLines = wrapLines(b.node.label, layout === 'horizontal' ? 16 : 24);
      const subLines = wrapLines(b.node.sublabel, layout === 'horizontal' ? 18 : 26);
      const allLineCount = labelLines.length + subLines.length;
      const startTextY = b.y + (b.h / 2) - ((allLineCount - 1) * 6.5) + 3;
      let cursorY = startTextY;
      const labelSvg = labelLines.map(line => {
        const el = `<text x="${b.x + b.w / 2}" y="${cursorY}" text-anchor="middle" font-family="sans-serif" font-size="${compact ? 10.5 : 11.5}" font-weight="700" fill="${pal.text}">${this.escapePrintHtml(line)}</text>`;
        cursorY += 13;
        return el;
      }).join('');
      const subSvg = subLines.map(line => {
        const el = `<text x="${b.x + b.w / 2}" y="${cursorY}" text-anchor="middle" font-family="sans-serif" font-size="${compact ? 9 : 9.5}" font-weight="500" fill="${pal.sub}">${this.escapePrintHtml(line)}</text>`;
        cursorY += 11.5;
        return el;
      }).join('');

      return `
        <g>
          <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" ry="8" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.6" />
          ${labelSvg}
          ${subSvg}
        </g>
      `;
    }).join('');

    const titleSvg = title
      ? `<text x="${svgW / 2}" y="16" text-anchor="middle" font-family="sans-serif" font-size="11.5" font-weight="800" fill="${isPrint ? '#000000' : '#0f172a'}">${this.escapePrintHtml(title)}</text>`
      : '';

    const svgMarkup = `
      <svg class="cbt-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="max-width:100%; height:auto; display:block; margin:0 auto; background:#ffffff;">
        <defs>
          <marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,1 L7,4 L0,7 Z" fill="${isPrint ? '#1e293b' : '#64748b'}" />
          </marker>
        </defs>
        ${titleSvg}
        ${edgePaths}
        ${boxesMarkup}
      </svg>
    `;

    if (isPrint) {
      return `<div style="margin:5px 0 6px 0; padding:4px; border:1px solid #cbd5e1; border-radius:4px; background:#ffffff; text-align:center;">${svgMarkup}</div>`;
    }
    return `<div class="cbt-bagan-wrap">${svgMarkup}</div>`;
  }

  renderPassageStimulusHtml(q, rangeLabel = '', isPrint = false) {
    if (!q || (!q.passageText && !q.passageTable && !q.passageChart && !q.passageTitle)) return '';
    const titleStr = String(q.passageTitle || '').trim();
    const headerNote = rangeLabel
      ? `Bacalah stimulus / wacana berikut untuk menjawab soal ${rangeLabel}!`
      : 'Wacana / Stimulus Kelompok Soal';
    const textHtml = q.passageText
      ? `<div style="white-space:pre-line; line-height:1.48; ${isPrint ? 'font-size:10px;' : 'font-size:13px;'}">${this.escapePrintHtml(q.passageText)}</div>`
      : '';
    const tblHtml = q.passageTable ? this.renderQuestionTableHtml(q.passageTable, isPrint) : '';
    const chartHtml = q.passageChart ? this.renderChartSvgHtml(q.passageChart, { isPrint, compact: isPrint }) : '';

    if (isPrint) {
      return `
        <div class="naskah-stimulus-box" style="margin:6px 0 8px 0; padding:6px 8px; border:1px solid #000000; background:#ffffff; break-inside:avoid; page-break-inside:avoid;">
          <div style="font-weight:bold; font-size:10px; font-style:italic; margin-bottom:4px;">${this.escapePrintHtml(headerNote)}</div>
          ${titleStr ? `<div style="font-weight:bold; font-size:10.5px; text-align:center; margin-bottom:4px; text-transform:uppercase;">${this.escapePrintHtml(titleStr)}</div>` : ''}
          ${textHtml}
          ${tblHtml}
          ${chartHtml}
        </div>
      `;
    }

    return `
      <div class="cbt-wacana-card">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] font-extrabold text-blue-700 dark:text-blue-300 uppercase tracking-wide">📖 ${this.escapePrintHtml(headerNote)}</span>
          ${titleStr ? `<span class="text-xs font-bold text-slate-800 dark:text-slate-100">${this.escapePrintHtml(titleStr)}</span>` : ''}
        </div>
        <div class="text-slate-800 dark:text-slate-100 space-y-2">
          ${textHtml}
          ${tblHtml}
          ${chartHtml}
        </div>
      </div>
    `;
  }

  estimateQuestionHeightPx(q, layoutCols = 2) {
    const charsPerLine = layoutCols === 2 ? 56 : 112;
    const text = String(q.question || '');
    const explicitLines = text.split(/\r?\n/);
    let stemLines = 0;
    explicitLines.forEach(line => {
      stemLines += Math.max(1, Math.ceil(line.length / charsPerLine));
    });

    let h = 12 + stemLines * 14.5;
    if (q.image && String(q.image).trim() !== '') {
      h += layoutCols === 2 ? 142 : 220;
    }
    if (q.tableData && Array.isArray(q.tableData.rows)) {
      h += 28 + q.tableData.rows.length * 22;
    }
    if (q.chartData && Array.isArray(q.chartData.nodes)) {
      h += q.chartData.layout === 'horizontal' ? 110 : Math.max(120, q.chartData.nodes.length * 64);
    }

    const type = q.type || 'single';
    if (type === 'true_false') {
      const stmts = Array.isArray(q.statements) ? q.statements : [];
      h += 28 + stmts.length * 24;
    } else {
      const rawOpts = Array.isArray(q.options) ? q.options : [];
      const nonEmptyOpts = rawOpts.filter(opt => String(opt && opt.text ? opt.text : '').trim() !== '' || (q.optionTables && q.optionTables[opt?.key]));
      const opts = nonEmptyOpts.length > 0 ? nonEmptyOpts : rawOpts;
      const optCharsPerLine = layoutCols === 2 ? 50 : 104;
      opts.forEach(opt => {
        const oLen = String(opt.text || '').length;
        h += Math.max(1, Math.ceil(oLen / optCharsPerLine)) * 14.5 + 2;
        const optTbl = q.optionTables && q.optionTables[String(opt.key || '').toUpperCase()];
        if (optTbl && Array.isArray(optTbl.rows)) {
          h += 24 + optTbl.rows.length * 20;
        }
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
    const stemTableHtml = q.tableData ? this.renderQuestionTableHtml(q.tableData, true) : '';
    const stemChartHtml = q.chartData ? this.renderChartSvgHtml(q.chartData, { isPrint: true, compact: layoutCols === 2 }) : '';

    let bodyHtml = '';
    if (type === 'true_false') {
      const stmts = Array.isArray(q.statements) ? q.statements : [];
      const rows = stmts.map((st, idx) => `
        <tr>
          <td style="border:1px solid #000000; padding:3px 5px; font-size:10px; line-height:1.35; background:#ffffff;">${idx + 1}. ${this.escapePrintHtml(st.text || '')}</td>
          <td style="border:1px solid #000000; padding:3px 4px; width:24px; text-align:center; font-size:10px; background:#ffffff;"></td>
          <td style="border:1px solid #000000; padding:3px 4px; width:24px; text-align:center; font-size:10px; background:#ffffff;"></td>
        </tr>
      `).join('');
      bodyHtml = `
        <div style="padding:3px 1px 5px 1px;">
          <table class="cbt-question-table" style="width:100%; border-collapse:collapse; border:1px solid #000000; background:#ffffff;">
            <thead class="cbt-tf-print-thead">
              <tr style="background:#f1f5f9;">
                <th style="border:1px solid #000000; padding:3px 5px; font-size:9.5px; text-align:left; background:#f1f5f9;">Pernyataan</th>
                <th style="border:1px solid #000000; padding:3px 4px; width:24px; font-size:9.5px; text-align:center; background:#f1f5f9;">B</th>
                <th style="border:1px solid #000000; padding:3px 4px; width:24px; font-size:9.5px; text-align:center; background:#f1f5f9;">S</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    } else {
      const rawOpts = (Array.isArray(q.options) ? q.options : []).filter(opt => opt && String(opt.key || '').trim().toUpperCase() !== 'E');
      const nonEmptyOpts = rawOpts.filter(opt => String(opt.text || '').trim() !== '' || (q.optionTables && q.optionTables[String(opt.key || '').toUpperCase()]));
      const opts = nonEmptyOpts.length > 0 ? nonEmptyOpts : rawOpts;
      const optRows = opts.map(opt => {
        const upKey = String(opt.key || 'A').toUpperCase();
        const lowerKey = upKey.toLowerCase();
        const bullet = type === 'multiple' ? `☐ ${lowerKey}.` : `${lowerKey}.`;
        const optTbl = q.optionTables && q.optionTables[upKey] ? this.renderQuestionTableHtml(q.optionTables[upKey], true) : '';
        return `
          <tr style="background:transparent;">
            <td style="width:${type === 'multiple' ? '26px' : '16px'}; vertical-align:top; font-size:10.5px; line-height:1.38; padding:1.5px 0; background:transparent;">${bullet}</td>
            <td style="vertical-align:top; font-size:10.5px; line-height:1.38; padding:1.5px 0; background:transparent;">
              ${opt.text ? `<div>${this.escapePrintHtml(opt.text || '')}</div>` : ''}
              ${optTbl}
            </td>
          </tr>
        `;
      }).join('');
      bodyHtml = `<table class="naskah-clean-table cbt-question-table" style="width:100%; border-collapse:collapse; margin-top:2px; background:transparent;"><tbody>${optRows}</tbody></table>`;
    }

    return `
      <div class="naskah-soal-item" style="margin-bottom:7px; padding-bottom:3px; break-inside:avoid; page-break-inside:avoid; background:transparent;">
        <table class="naskah-clean-table cbt-question-table" style="width:100%; border-collapse:collapse; background:transparent;">
          <tbody>
            <tr style="background:transparent;">
              <td style="width:20px; vertical-align:top; font-size:10.5px; line-height:1.38; font-weight:normal; background:transparent;">${displayNumber}.</td>
              <td style="vertical-align:top; font-size:10.5px; line-height:1.38; background:transparent;">
                <div>${qText}</div>
                ${imgHtml}
                ${stemTableHtml}
                ${stemChartHtml}
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
        <table class="naskah-clean-table" style="width:100%; border-collapse:collapse; margin:0 0 2px 0;">
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
        <table class="naskah-clean-table" style="width:100%; border-collapse:collapse; font-size:10.5px; line-height:1.45;">
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

    const groupOrder = (list) => (window.examEngine && typeof window.examEngine.groupPassageQuestionsOrder === 'function')
      ? window.examEngine.groupPassageQuestionsOrder(list)
      : list;

    // Kelompokkan tipe soal berurutan (I. PG Tunggal, II. PG Kompleks, III. Benar/Salah) sambil menjaga kelompok wacana tetap berdekatan
    const singleQs = groupOrder(questionsList.filter(q => (q.type || 'single') === 'single'));
    const multiQs = groupOrder(questionsList.filter(q => q.type === 'multiple'));
    const tfQs = groupOrder(questionsList.filter(q => q.type === 'true_false'));

    const blocks = [];
    let numCounter = 1;
    const emittedPassages = new Set();

    const pushSectionQuestions = (sectionQs, getKeyText) => {
      sectionQs.forEach((q, localIdx) => {
        const gid = q.passageGroupId ? String(q.passageGroupId).trim() : '';
        if (gid && !emittedPassages.has(gid) && (q.passageText || q.passageTable || q.passageChart || q.passageTitle)) {
          emittedPassages.add(gid);
          const groupMembers = sectionQs.filter(item => String(item.passageGroupId || '').trim() === gid);
          const endNum = numCounter + groupMembers.length - 1;
          const rangeLabel = groupMembers.length > 1 ? `nomor ${numCounter} s.d. ${endNum}` : `nomor ${numCounter}`;
          const stimHtml = this.renderPassageStimulusHtml(q, rangeLabel, true);
          const estH = 60 + Math.ceil(String(q.passageText || '').length / (layoutCols === 2 ? 48 : 96)) * 13 + (q.passageTable ? 90 : 0) + (q.passageChart ? 130 : 0);
          blocks.push({
            isHeading: true,
            height: estH,
            html: stimHtml
          });
        }
        blocks.push({
          isHeading: false,
          height: this.estimateQuestionHeightPx(q, layoutCols),
          html: this.renderSingleQuestionPrintHtml(q, numCounter, layoutCols),
          answerKeyNum: numCounter,
          answerKeyText: getKeyText(q, localIdx)
        });
        numCounter += 1;
      });
    };

    if (singleQs.length > 0) {
      blocks.push({
        isHeading: true,
        height: 24,
        html: `<div style="font-weight:bold; font-size:11px; margin-bottom:6px;">I. Pilihlah satu jawaban yang paling tepat!</div>`
      });
      pushSectionQuestions(singleQs, (q) => q.correctAnswer || '-');
    }

    if (multiQs.length > 0) {
      blocks.push({
        isHeading: true,
        height: 28,
        html: `<div style="font-weight:bold; font-size:11px; margin:6px 0 6px 0;">${singleQs.length > 0 ? 'II' : 'I'}. Pilihan Ganda Kompleks (Pilihlah lebih dari satu jawaban yang benar!)</div>`
      });
      pushSectionQuestions(multiQs, (q) => {
        const rawAns = Array.isArray(q.correctAnswer)
          ? q.correctAnswer
          : (Array.isArray(q.correctAnswers) ? q.correctAnswers : (q.correctAnswer ? [q.correctAnswer] : []));
        return rawAns.length > 0 ? rawAns.join(', ') : '-';
      });
    }

    if (tfQs.length > 0) {
      const roman = (singleQs.length > 0 && multiQs.length > 0) ? 'III' : ((singleQs.length > 0 || multiQs.length > 0) ? 'II' : 'I');
      blocks.push({
        isHeading: true,
        height: 28,
        html: `<div style="font-weight:bold; font-size:11px; margin:6px 0 6px 0;">${roman}. Tentukan Benar (B) atau Salah (S) pada pernyataan berikut!</div>`
      });
      pushSectionQuestions(tfQs, (q) => (Array.isArray(q.statements) ? q.statements.map((s, idx) => `${idx + 1}:${s.correct || s.answer || '-'}`).join(', ') : '-'));
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
          <table class="naskah-clean-table" style="width:100%; border-collapse:collapse; table-layout:fixed; background:transparent;">
            <tbody>
              <tr style="background:transparent;">
                <td style="width:48.5%; vertical-align:top; padding-right:10px; padding-bottom:4px; background:transparent;">${pg.leftHtml}</td>
                <td style="width:3%; background:transparent;"></td>
                <td style="width:48.5%; vertical-align:top; padding-left:10px; padding-bottom:4px; background:transparent;">${pg.rightHtml}</td>
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
            clonedDoc.documentElement.classList.remove('dark');
            if (clonedDoc.body) {
              clonedDoc.body.classList.remove('dark');
              clonedDoc.body.style.background = '#ffffff';
              clonedDoc.body.style.backgroundImage = 'none';
            }
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

      // Konversi SVG Bagan/Diagram menjadi gambar PNG agar tampil rapi di Microsoft Word (.doc)
      const svgCharts = Array.from(tempDiv.querySelectorAll('svg.cbt-chart-svg'));
      for (const svgEl of svgCharts) {
        try {
          const wAttr = parseInt(svgEl.getAttribute('width') || '420', 10) || 420;
          const hAttr = parseInt(svgEl.getAttribute('height') || '200', 10) || 200;
          const svgStr = new XMLSerializer().serializeToString(svgEl);
          const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
          const blobUrl = URL.createObjectURL(svgBlob);
          const pngDataUrl = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = wAttr * 2;
                canvas.height = hAttr * 2;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/png'));
              } catch (err) {
                resolve('');
              }
            };
            img.onerror = () => resolve('');
            img.src = blobUrl;
          });
          URL.revokeObjectURL(blobUrl);
          if (pngDataUrl) {
            const imgNode = document.createElement('img');
            imgNode.setAttribute('src', pngDataUrl);
            imgNode.setAttribute('alt', 'Bagan Soal');
            imgNode.setAttribute('width', String(Math.min(wAttr, layoutCols === 2 ? 265 : 540)));
            const ratio = Math.min((layoutCols === 2 ? 265 : 540) / wAttr, 1);
            imgNode.setAttribute('height', String(Math.round(hAttr * ratio)));
            svgEl.replaceWith(imgNode);
          }
        } catch (err) {}
      }

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
            .cbt-print-footer-note { color: #1d4ed8 !important; font-style: italic !important; font-size: 8pt !important; text-align: center !important; white-space: nowrap !important; }
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

  // ===================== ANALISIS BUTIR SOAL (TINGKAT KESUKARAN & DAYA PEMBEDA) =====================
  computeItemAnalysis(questionsList = []) {
    const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
    const validResults = Array.isArray(rawResults)
      ? rawResults.filter(r => r && r.student?.nisn !== '__CBT_STATE__' && r.examTitle !== '__CBT_LIVE_SESSION__' && Array.isArray(r.detailedAnswers) && r.detailedAnswers.length > 0)
      : [];

    // Ambil 1 entri paling relevan (terbaru) per kombinasi siswa + mapel agar peserta pengulang tidak menggandakan bobot
    const uniqueResultMap = new Map();
    validResults.forEach(r => {
      const nisn = String(r.student?.nisn || r.student?.name || '').trim().toUpperCase();
      const subj = String(r.subject || '').trim().toLowerCase();
      const key = `${nisn}__${subj}`;
      if (!uniqueResultMap.has(key)) {
        uniqueResultMap.set(key, r);
      }
    });
    const dedupedResults = Array.from(uniqueResultMap.values());

    const normalizeText = (txt) => String(txt || '').replace(/\s+/g, ' ').trim().toLowerCase();

    const items = (questionsList || []).map((q, idx) => {
      const qId = q.id;
      const qTextNorm = normalizeText(q.question);
      const qSubjNorm = String(q.subject || '').trim().toLowerCase();

      const observations = [];

      dedupedResults.forEach(res => {
        const resSubjNorm = String(res.subject || '').trim().toLowerCase();
        const details = res.detailedAnswers || [];
        let matchedDetail = details.find(d => d && d.questionId && qId && String(d.questionId) === String(qId));

        if (!matchedDetail && qTextNorm) {
          const sameSubject = !qSubjNorm || qSubjNorm === 'umum' || resSubjNorm === qSubjNorm || resSubjNorm.includes(qSubjNorm) || qSubjNorm.includes(resSubjNorm);
          if (sameSubject) {
            matchedDetail = details.find(d => d && normalizeText(d.questionText) === qTextNorm);
          }
        }

        if (!matchedDetail) return;

        const maxScore = Number(matchedDetail.maxScore || q.weight || 10);
        let itemScore = 0;
        if (maxScore > 0 && matchedDetail.earnedScore !== undefined && matchedDetail.earnedScore !== null) {
          itemScore = Math.min(1, Math.max(0, Number(matchedDetail.earnedScore) / maxScore));
        } else {
          itemScore = (matchedDetail.isFullyCorrect || matchedDetail.status === 'correct') ? 1 : 0;
        }

        observations.push({
          nisn: String(res.student?.nisn || ''),
          totalScore: Number(res.finalScore || 0),
          itemScore,
          status: matchedDetail.status || (itemScore >= 0.999 ? 'correct' : 'incorrect')
        });
      });

      const n = observations.length;
      const correctCount = observations.filter(o => o.itemScore >= 0.999 || o.status === 'correct').length;
      const partialCount = observations.filter(o => o.itemScore > 0 && o.itemScore < 0.999).length;
      const unattemptedCount = observations.filter(o => o.status === 'unattempted').length;
      const incorrectCount = Math.max(0, n - correctCount - partialCount - unattemptedCount);

      let difficulty = null;
      let difficultyLabel = 'Belum Ada Data';
      let difficultyTone = 'slate';

      if (n > 0) {
        const sumScore = observations.reduce((acc, o) => acc + o.itemScore, 0);
        difficulty = Math.round((sumScore / n) * 100) / 100;
        if (difficulty < 0.30) {
          difficultyLabel = 'Sukar';
          difficultyTone = 'rose';
        } else if (difficulty <= 0.70) {
          difficultyLabel = 'Sedang';
          difficultyTone = 'emerald';
        } else {
          difficultyLabel = 'Mudah';
          difficultyTone = 'sky';
        }
      }

      let discrimination = null;
      let discriminationLabel = n === 1 ? 'Min. 2 Siswa' : 'Belum Ada Data';
      let discriminationTone = 'slate';
      let upperRate = null;
      let lowerRate = null;
      let groupSize = 0;

      if (n >= 2) {
        const sorted = [...observations].sort((a, b) => {
          if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
          return b.itemScore - a.itemScore;
        });
        groupSize = n >= 20 ? Math.max(1, Math.round(n * 0.27)) : Math.max(1, Math.floor(n / 2));
        const upperGroup = sorted.slice(0, groupSize);
        const lowerGroup = sorted.slice(sorted.length - groupSize);

        upperRate = upperGroup.reduce((acc, o) => acc + o.itemScore, 0) / groupSize;
        lowerRate = lowerGroup.reduce((acc, o) => acc + o.itemScore, 0) / groupSize;
        discrimination = Math.round((upperRate - lowerRate) * 100) / 100;

        if (discrimination < 0) {
          discriminationLabel = 'Negatif';
          discriminationTone = 'red';
        } else if (discrimination < 0.20) {
          discriminationLabel = 'Jelek';
          discriminationTone = 'orange';
        } else if (discrimination < 0.30) {
          discriminationLabel = 'Cukup';
          discriminationTone = 'amber';
        } else if (discrimination < 0.40) {
          discriminationLabel = 'Baik';
          discriminationTone = 'blue';
        } else {
          discriminationLabel = 'Sangat Baik';
          discriminationTone = 'emerald';
        }
      }

      let qualityStatus = 'no_data';
      let qualityLabel = 'Belum Ada Data';
      let recommendation = 'Belum ada data hasil ujian siswa yang memuat butir soal ini.';

      if (n === 1) {
        qualityStatus = 'no_data';
        qualityLabel = 'Data Minim (1 Siswa)';
        recommendation = 'Butuh minimal 2 siswa menyelesaikan ujian untuk menghitung daya pembeda.';
      } else if (n >= 2) {
        if (discrimination < 0) {
          qualityStatus = 'bad';
          qualityLabel = 'Bermasalah (D < 0)';
          recommendation = 'Periksa kunci jawaban atau redaksi soal — kelompok nilai rendah justru lebih banyak benar.';
        } else if (discrimination < 0.20) {
          qualityStatus = 'bad';
          qualityLabel = 'Revisi / Ganti';
          recommendation = 'Daya pembeda rendah (< 0,20). Soal belum mampu membedakan siswa paham dan belum paham.';
        } else if (discrimination < 0.30 || difficulty < 0.15 || difficulty > 0.90) {
          qualityStatus = 'revise';
          qualityLabel = 'Perlu Revisi';
          if (difficulty > 0.90) {
            recommendation = 'Soal terlalu mudah (P > 0,90). Pertajam opsi pengecoh agar lebih menantang.';
          } else if (difficulty < 0.15) {
            recommendation = 'Soal terlalu sukar (P < 0,15). Periksa kejelasan kalimat soal atau kesesuaian materi.';
          } else {
            recommendation = 'Daya pembeda cukup (0,20–0,29). Perbaiki pengecoh agar mendekati ≥ 0,30.';
          }
        } else {
          qualityStatus = 'good';
          qualityLabel = 'Layak / Baik';
          recommendation = 'Kualitas butir soal baik: tingkat kesukaran dan daya pembeda sudah ideal.';
        }
      }

      return {
        index: idx + 1,
        questionId: qId,
        subject: q.subject || 'Umum',
        classLevel: q.classLevel || 'Semua Kelas',
        type: q.type || 'single',
        questionText: q.question || '',
        n,
        correctCount,
        partialCount,
        incorrectCount,
        unattemptedCount,
        difficulty,
        difficultyLabel,
        difficultyTone,
        discrimination,
        discriminationLabel,
        discriminationTone,
        groupSize,
        upperRate: upperRate !== null ? Math.round(upperRate * 100) / 100 : null,
        lowerRate: lowerRate !== null ? Math.round(lowerRate * 100) / 100 : null,
        qualityStatus,
        qualityLabel,
        recommendation
      };
    });

    const summary = {
      totalQuestions: items.length,
      analyzedCount: items.filter(it => it.n >= 2).length,
      goodCount: items.filter(it => it.qualityStatus === 'good').length,
      reviseCount: items.filter(it => it.qualityStatus === 'revise').length,
      badCount: items.filter(it => it.qualityStatus === 'bad').length,
      noDataCount: items.filter(it => it.qualityStatus === 'no_data').length,
      totalUniqueRespondents: dedupedResults.length
    };

    return { items, summary };
  }

  exportItemAnalysisExcel(analysisItems = [], meta = {}) {
    if (typeof XLSX === 'undefined') {
      alert("Library Excel belum dimuat. Pastikan koneksi internet aktif.");
      return;
    }
    if (!analysisItems || analysisItems.length === 0) {
      alert("Belum ada butir soal untuk diekspor.");
      return;
    }

    const schoolCfg = this.getSchoolConfig();
    const typeLabel = (t) => t === 'multiple' ? 'PG Kompleks' : (t === 'true_false' ? 'Benar/Salah' : 'PG Tunggal');

    const rows = analysisItems.map(it => ({
      'No': it.index,
      'Mata Pelajaran': it.subject,
      'Tingkat/Kelas': it.classLevel,
      'Tipe Soal': typeLabel(it.type),
      'Ringkasan Soal': String(it.questionText || '').replace(/\s+/g, ' ').slice(0, 140),
      'Responden (N)': it.n,
      'Benar': it.correctCount,
      'Parsial': it.partialCount,
      'Salah': it.incorrectCount,
      'Kosong': it.unattemptedCount,
      'Tingkat Kesukaran (P)': it.difficulty !== null ? it.difficulty.toFixed(2) : '-',
      'Kategori Kesukaran': it.difficultyLabel,
      'Proporsi Kelompok Atas (PA)': it.upperRate !== null ? it.upperRate.toFixed(2) : '-',
      'Proporsi Kelompok Bawah (PB)': it.lowerRate !== null ? it.lowerRate.toFixed(2) : '-',
      'Daya Pembeda (D)': it.discrimination !== null ? it.discrimination.toFixed(2) : '-',
      'Kategori Daya Pembeda': it.discriminationLabel,
      'Status Kualitas': it.qualityLabel,
      'Rekomendasi Evaluasi': it.recommendation
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 46 },
      { wch: 13 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 18 },
      { wch: 20 }, { wch: 20 }, { wch: 45 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analisis Butir Soal');

    const slug = String(meta.subject || schoolCfg.schoolName || 'Bank_Soal').replace(/[^a-z0-9]+/gi, '_');
    XLSX.writeFile(wb, `Analisis_Butir_Soal_${slug}_${Date.now()}.xlsx`);
  }

  // ===================== CEK KELAYAKAN TEKNIS PRA-UJIAN =====================
  auditQuestionsPreExam(questionsList = []) {
    const normalizeText = (txt) => String(txt || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Deteksi duplikat teks soal pada mapel yang sama
    const questionTextCounts = new Map();
    (questionsList || []).forEach(q => {
      const qNorm = normalizeText(q.question);
      if (qNorm.length >= 15) {
        const key = `${normalizeText(q.subject || 'umum')}__${qNorm}`;
        questionTextCounts.set(key, (questionTextCounts.get(key) || 0) + 1);
      }
    });

    const items = (questionsList || []).map((q, idx) => {
      const errors = [];
      const warnings = [];
      const type = q.type || 'single';
      const qText = String(q.question || '').trim();
      const hasImage = Boolean(q.image && String(q.image).trim() !== '');
      const hasTable = Boolean(q.tableData && Array.isArray(q.tableData.rows) && q.tableData.rows.length > 0);
      const hasChart = Boolean(q.chartData && Array.isArray(q.chartData.nodes) && q.chartData.nodes.length > 0);
      const hasStimulus = Boolean(q.passageText || q.passageTable || q.passageChart);

      if (!qText && !hasImage && !hasTable && !hasChart && !hasStimulus) {
        errors.push('Teks pertanyaan, gambar, tabel, dan bagan sama-sama kosong.');
      } else if (qText && qText.length < 8 && !hasImage && !hasTable && !hasChart && !hasStimulus) {
        warnings.push('Teks pertanyaan terlalu singkat (< 8 karakter).');
      }

      const weight = Number(q.weight);
      if (!Number.isFinite(weight) || weight <= 0) {
        errors.push('Bobot nilai soal harus lebih dari 0.');
      }

      if (type === 'single' || type === 'multiple') {
        const opts = Array.isArray(q.options) ? q.options : [];
        if (opts.length < 2) {
          errors.push('Opsi pilihan jawaban kurang dari 2.');
        }

        const optTables = (q.optionTables && typeof q.optionTables === 'object') ? q.optionTables : {};
        const emptyKeys = opts
          .filter(o => {
            if (!o) return true;
            const k = String(o.key || '').trim().toUpperCase();
            const hasOptTxt = String(o.text || '').trim() !== '';
            const hasOptTbl = Boolean(optTables[k] && Array.isArray(optTables[k].rows) && optTables[k].rows.length > 0);
            return !hasOptTxt && !hasOptTbl;
          })
          .map(o => o?.key || '?');
        if (emptyKeys.length > 0) {
          errors.push(`Teks/tabel opsi ${emptyKeys.join(', ')} masih kosong.`);
        }

        const seenOptTexts = new Map();
        const dupPairs = [];
        opts.forEach(o => {
          const k = String(o?.key || '').trim().toUpperCase();
          if (optTables[k] && Array.isArray(optTables[k].rows) && optTables[k].rows.length > 0) return;
          const t = normalizeText(o?.text);
          if (!t) return;
          if (seenOptTexts.has(t)) {
            dupPairs.push(`${seenOptTexts.get(t)} & ${o.key || '?'}`);
          } else {
            seenOptTexts.set(t, o.key || '?');
          }
        });
        if (dupPairs.length > 0) {
          errors.push(`Opsi jawaban kembar (${dupPairs.join(', ')}).`);
        }

        const validKeys = opts.map(o => String(o?.key || '').trim().toUpperCase()).filter(Boolean);
        if (type === 'single') {
          const ansKey = String(q.correctAnswer || '').trim().toUpperCase();
          if (!ansKey) {
            errors.push('Kunci jawaban PG Tunggal belum dipilih.');
          } else if (!validKeys.includes(ansKey)) {
            errors.push(`Kunci jawaban "${ansKey}" tidak cocok dengan opsi tersedia.`);
          }
        } else {
          const ansKeys = Array.isArray(q.correctAnswer)
            ? q.correctAnswer.map(k => String(k || '').trim().toUpperCase()).filter(Boolean)
            : (q.correctAnswer ? [String(q.correctAnswer).trim().toUpperCase()] : []);
          if (ansKeys.length === 0) {
            errors.push('Kunci jawaban PG Kompleks belum dipilih.');
          } else {
            const missingKeys = ansKeys.filter(k => !validKeys.includes(k));
            if (missingKeys.length > 0) {
              errors.push(`Kunci "${missingKeys.join(', ')}" tidak ditemukan di opsi.`);
            }
            if (ansKeys.length === 1) {
              warnings.push('PG Kompleks hanya memiliki 1 kunci benar (sebaiknya ≥ 2).');
            }
          }
        }
      } else if (type === 'true_false') {
        const stmts = Array.isArray(q.statements) ? q.statements : [];
        if (stmts.length === 0) {
          errors.push('Belum ada pernyataan Benar/Salah.');
        } else {
          if (stmts.length < 2) {
            warnings.push('Pernyataan Benar/Salah baru 1 (disarankan minimal 2).');
          }
          const emptyStmtCount = stmts.filter(s => !s || String(s.text || '').trim() === '').length;
          if (emptyStmtCount > 0) {
            errors.push(`Ada ${emptyStmtCount} pernyataan yang teksnya masih kosong.`);
          }
          const invalidCorrectCount = stmts.filter(s => !s || !['B', 'S'].includes(String(s.correct || '').trim().toUpperCase())).length;
          if (invalidCorrectCount > 0) {
            errors.push(`Ada ${invalidCorrectCount} pernyataan yang belum punya kunci B/S.`);
          }
          const stmtNormSet = new Set();
          let hasDupStmt = false;
          stmts.forEach(s => {
            const t = normalizeText(s?.text);
            if (!t) return;
            if (stmtNormSet.has(t)) hasDupStmt = true;
            stmtNormSet.add(t);
          });
          if (hasDupStmt) {
            warnings.push('Ada pernyataan Benar/Salah yang redaksinya kembar.');
          }
        }
      } else {
        errors.push(`Tipe soal "${type}" tidak dikenal.`);
      }

      const subjClean = String(q.subject || '').trim();
      if (!subjClean || subjClean.toLowerCase() === 'umum') {
        warnings.push('Mata pelajaran masih Umum/belum ditentukan.');
      }

      const qNorm = normalizeText(q.question);
      if (qNorm.length >= 15) {
        const dupKey = `${normalizeText(q.subject || 'umum')}__${qNorm}`;
        if ((questionTextCounts.get(dupKey) || 0) > 1) {
          warnings.push('Redaksi pertanyaan terindikasi duplikat dengan soal lain.');
        }
      }

      let status = 'ready';
      let statusLabel = 'Siap Diujikan';
      if (errors.length > 0) {
        status = 'error';
        statusLabel = 'Perlu Perbaikan';
      } else if (warnings.length > 0) {
        status = 'warning';
        statusLabel = 'Perlu Dicek';
      }

      return {
        index: idx + 1,
        questionId: q.id,
        subject: q.subject || 'Umum',
        classLevel: q.classLevel || 'Semua Kelas',
        type,
        weight: Number.isFinite(weight) ? weight : 0,
        questionText: q.question || '',
        hasImage,
        errors,
        warnings,
        status,
        statusLabel
      };
    });

    const totalQuestions = items.length;
    const readyCount = items.filter(it => it.status === 'ready').length;
    const warningCount = items.filter(it => it.status === 'warning').length;
    const errorCount = items.filter(it => it.status === 'error').length;
    const totalWeight = items.reduce((acc, it) => acc + (it.weight > 0 ? it.weight : 0), 0);
    const readyPercent = totalQuestions > 0 ? Math.round((readyCount / totalQuestions) * 100) : 0;

    return {
      items,
      summary: {
        totalQuestions,
        readyCount,
        warningCount,
        errorCount,
        totalWeight,
        readyPercent
      }
    };
  }

  exportPreExamAuditExcel(auditItems = [], meta = {}) {
    if (typeof XLSX === 'undefined') {
      alert("Library Excel belum dimuat. Pastikan koneksi internet aktif.");
      return;
    }
    if (!auditItems || auditItems.length === 0) {
      alert("Belum ada butir soal untuk diekspor.");
      return;
    }

    const schoolCfg = this.getSchoolConfig();
    const typeLabel = (t) => t === 'multiple' ? 'PG Kompleks' : (t === 'true_false' ? 'Benar/Salah' : 'PG Tunggal');

    const rows = auditItems.map(it => ({
      'No': it.index,
      'Mata Pelajaran': it.subject,
      'Tingkat/Kelas': it.classLevel,
      'Tipe Soal': typeLabel(it.type),
      'Bobot': it.weight,
      'Ringkasan Soal': String(it.questionText || '').replace(/\s+/g, ' ').slice(0, 140),
      'Status Kelayakan': it.statusLabel,
      'Temuan Kritis (Wajib Perbaiki)': it.errors.length > 0 ? it.errors.join(' | ') : '-',
      'Catatan Tambahan': it.warnings.length > 0 ? it.warnings.join(' | ') : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
      { wch: 46 }, { wch: 18 }, { wch: 42 }, { wch: 38 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cek Kelayakan Pra-Ujian');

    const slug = String(meta.subject || schoolCfg.schoolName || 'Bank_Soal').replace(/[^a-z0-9]+/gi, '_');
    XLSX.writeFile(wb, `Cek_Pra_Ujian_${slug}_${Date.now()}.xlsx`);
  }

  getTeacherQuestionProgressList() {
    const allQuestions = window.examEngine && Array.isArray(window.examEngine.questions)
      ? window.examEngine.questions
      : [];
    const realQuestions = allQuestions.filter(q => q && !this.isTrialQuestion(q));
    const trialQuestions = allQuestions.filter(q => q && this.isTrialQuestion(q));

    const matchesSub = (qSub, target) => (window.examEngine && window.examEngine.matchesSubject)
      ? window.examEngine.matchesSubject(qSub, target)
      : String(qSub || '').toLowerCase() === String(target || '').toLowerCase();
    const matchesCls = (qCls, target) => (window.examEngine && window.examEngine.matchesClassLevel)
      ? window.examEngine.matchesClassLevel(qCls, target)
      : true;

    return (this.teachers || [])
      .filter(t => t && t.role !== 'admin' && t.role !== 'pengawas' && t.id !== 'admin')
      .map(t => {
        const subjects = this.getTeacherSubjectsList(t);
        const teacherClasses = t.classes ? this.parseTeacherClasses(t.classes) : [];
        const teacherNameLow = String(t.name || '').trim().toLowerCase();

        const isTeacherClassMatch = (q) => {
          if (teacherClasses.length === 0) return true;
          const qCls = String(q.classLevel || 'Semua Kelas').trim();
          return matchesCls(qCls, teacherClasses.join(', '));
        };

        const isCreatedByTeacher = (q) => {
          const cb = String(q.createdBy || '').trim().toLowerCase();
          return Boolean(teacherNameLow && cb && cb === teacherNameLow);
        };

        const subjectBreakdown = subjects.map(subj => {
          const qs = realQuestions.filter(q => {
            const qSub = String(q.subject || '').trim();
            if (!qSub || qSub.toLowerCase() === 'umum') return false;
            return matchesSub(qSub, subj) && isTeacherClassMatch(q);
          });
          return {
            subject: subj,
            total: qs.length,
            createdByMe: qs.filter(isCreatedByTeacher).length,
            single: qs.filter(q => (q.type || 'single') === 'single').length,
            multiple: qs.filter(q => q.type === 'multiple').length,
            trueFalse: qs.filter(q => q.type === 'true_false').length
          };
        });

        const uniqueMatchingIds = new Set();
        const matchingQuestions = [];
        realQuestions.forEach((q, idx) => {
          const qSub = String(q.subject || '').trim();
          if (!qSub || qSub.toLowerCase() === 'umum') return;
          if (!isTeacherClassMatch(q)) return;
          if (subjects.some(subj => matchesSub(qSub, subj))) {
            const key = q.id !== undefined ? String(q.id) : `idx_${idx}`;
            if (!uniqueMatchingIds.has(key)) {
              uniqueMatchingIds.add(key);
              matchingQuestions.push(q);
            }
          }
        });

        const uniqueTrialIds = new Set();
        trialQuestions.forEach((q, idx) => {
          const qSub = String(q.subject || '').trim();
          if (!qSub || qSub.toLowerCase() === 'umum') return;
          if (!isTeacherClassMatch(q)) return;
          if (subjects.some(subj => matchesSub(qSub, subj))) {
            const key = q.id !== undefined ? String(q.id) : `trial_${idx}`;
            uniqueTrialIds.add(key);
          }
        });

        const createdByCount = matchingQuestions.filter(isCreatedByTeacher).length;

        return {
          teacher: t,
          subjects,
          teacherClasses,
          totalQuestions: matchingQuestions.length,
          trialQuestionsCount: uniqueTrialIds.size,
          createdByCount,
          singleCount: matchingQuestions.filter(q => (q.type || 'single') === 'single').length,
          multipleCount: matchingQuestions.filter(q => q.type === 'multiple').length,
          trueFalseCount: matchingQuestions.filter(q => q.type === 'true_false').length,
          subjectBreakdown
        };
      })
      .sort((a, b) => String(a.teacher.name || '').localeCompare(String(b.teacher.name || ''), 'id'));
  }

  // ===================== CETAK & DOWNLOAD KARTU LOGIN GURU (9,0 x 5,3 CM) =====================
  generateTeacherCardsHtml(list = this.teachers, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER", startIndex = 0) {
    const teachersList = Array.isArray(list) ? list : [];
    if (teachersList.length === 0) {
      return '<div class="p-8 text-center text-slate-400 font-semibold">Belum ada data guru untuk ditampilkan.</div>';
    }

    const cfg = this.getSchoolConfig();
    const logoLeftHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Kiri" style="width:24px; height:24px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:23px; height:23px; border-radius:4px; background:#1e3a8a; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:7.5px; flex-shrink:0;">DINAS</div>`;

    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo Kanan" style="width:24px; height:24px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:23px; height:23px; border-radius:50%; background:#059669; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:7.5px; flex-shrink:0;">SMP</div>`;

    const safeSubtitle = this.escapePrintHtml(cfg.schoolSubtitle || 'PEMERINTAH KABUPATEN MOJOKERTO — DINAS PENDIDIKAN');
    const safeSchoolName = this.escapePrintHtml(cfg.schoolName || 'SMP NEGERI 2 PACET');
    const safeExamTitle = this.escapePrintHtml(examTitle || 'UJIAN SEKOLAH BERBASIS KOMPUTER');
    const safeCity = this.escapePrintHtml(cfg.city || 'Pacet');
    const safeDate = this.escapePrintHtml(cfg.date || '');
    const safeHeadmaster = this.escapePrintHtml(cfg.headmasterName || '');
    const safeHeadmasterNip = this.escapePrintHtml(cfg.headmasterNip || '');

    return teachersList.map((t, idx) => {
      const isAdmin = t && (t.role === 'admin' || t.id === 'admin');
      const isPengawas = Boolean(t && !isAdmin && String(t.role || '').toLowerCase() === 'pengawas');
      const roleLabel = isAdmin ? 'PROKTOR / ADMIN' : (isPengawas ? 'PENGAWAS RUANG' : 'GURU MAPEL');
      const roleDetail = isAdmin ? 'Proktor Utama / Admin' : (isPengawas ? 'Pengawas Ruang Ujian' : 'Guru Mata Pelajaran');
      const badgeBg = isAdmin ? '#f3e8ff' : (isPengawas ? '#ccfbf1' : '#dbeafe');
      const badgeText = isAdmin ? '#6b21a8' : (isPengawas ? '#0f766e' : '#1d4ed8');
      const badgeBorder = isAdmin ? '#c084fc' : (isPengawas ? '#5eead4' : '#93c5fd');

      const nipText = this.escapePrintHtml(t?.nip || (isAdmin ? 'admin' : '-'));
      const nameText = this.escapePrintHtml(t?.name || '-');
      const subjectTokens = typeof this.splitSubjectTokens === 'function' ? this.splitSubjectTokens(t?.subject || '') : [];
      const subjectText = isPengawas
        ? 'Semua Mapel Aktif (Pantau Ujian)'
        : this.escapePrintHtml(subjectTokens.length > 0 ? subjectTokens.join(', ') : (t?.subject || (isAdmin ? 'Semua Mapel' : '-')));
      const parsedClasses = t?.classes && typeof this.parseTeacherClasses === 'function' ? this.parseTeacherClasses(t.classes) : [];
      const classesText = this.escapePrintHtml(isAdmin ? 'Semua Kelas' : (parsedClasses.length > 0 ? parsedClasses.join(', ') : (t?.classes || 'Semua Kelas')));
      const pinText = this.escapePrintHtml(t?.pin || (isAdmin ? 'admin123' : (isPengawas ? 'pengawas123' : 'guru123')));

      return `
      <div class="exam-card-9x5" style="width:9.0cm; height:5.3cm; max-width:9.0cm; max-height:5.3cm; border:1.6px solid #0f172a; border-radius:8px; padding:5px 7px; background:#ffffff; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; font-family:'Plus Jakarta Sans', Arial, sans-serif; overflow:hidden; position:relative; page-break-inside:avoid; break-inside:avoid;">

        <!-- KOP SURAT KARTU LOGIN GURU / PENGAWAS -->
        <div style="border-bottom:1.5px solid #0f172a; padding-bottom:2.5px; display:flex; align-items:center; justify-content:space-between; gap:5px;">
          ${logoLeftHtml}
          <div style="flex:1; text-align:center; min-width:0;">
            <div style="font-size:6.4px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.2px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeSubtitle}</div>
            <div style="font-size:8.8px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.2px; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeSchoolName}</div>
            <div style="font-size:6.6px; font-weight:800; color:${isAdmin ? '#6b21a8' : (isPengawas ? '#0f766e' : '#2563eb')}; text-transform:uppercase; letter-spacing:0.2px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">KARTU LOGIN ${isAdmin ? 'PROKTOR / ADMIN' : (isPengawas ? 'PENGAWAS RUANG' : 'GURU')} &bull; ${safeExamTitle}</div>
          </div>
          ${logoRightHtml}
        </div>

        <!-- ISI DATA AKUN LOGIN GURU -->
        <div style="display:flex; gap:5px; align-items:stretch; margin-top:2px; flex:1; min-height:0;">

          <div style="flex:1; min-width:0; color:#0f172a;">
            <table style="width:100%; border-collapse:collapse; font-size:7.4px; line-height:1.22;">
              <tr>
                <td style="width:52px; color:#475569; font-weight:600; padding:1px 0; white-space:nowrap; vertical-align:top;">NIP / ID</td>
                <td style="width:6px; font-weight:700; padding:1px 0; vertical-align:top;">:</td>
                <td style="font-weight:900; color:#1d4ed8; font-family:monospace; font-size:8px; padding:1px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;">${nipText}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:1px 0; white-space:nowrap; vertical-align:top;">Nama Guru</td>
                <td style="font-weight:700; padding:1px 0; vertical-align:top;">:</td>
                <td style="font-weight:800; color:#0f172a; padding:1px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;">${nameText}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:1px 0; white-space:nowrap; vertical-align:top;">Status</td>
                <td style="font-weight:700; padding:1px 0; vertical-align:top;">:</td>
                <td style="color:#1e293b; font-weight:700; padding:1px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;">${roleDetail}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:1px 0; white-space:nowrap; vertical-align:top;">Mapel</td>
                <td style="font-weight:700; padding:1px 0; vertical-align:top;">:</td>
                <td style="color:#0f172a; font-weight:700; padding:1px 0; max-width:170px;">
                  <div style="font-size:7px; line-height:1.2; max-height:19px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${subjectText}</div>
                </td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:1px 0; white-space:nowrap; vertical-align:top;">Kelas</td>
                <td style="font-weight:700; padding:1px 0; vertical-align:top;">:</td>
                <td style="font-weight:800; color:#4338ca; padding:1px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; font-size:7.1px;">${classesText}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:1px 0; white-space:nowrap; vertical-align:top;">Password</td>
                <td style="font-weight:700; padding:1px 0; vertical-align:top;">:</td>
                <td style="font-weight:900; color:#047857; font-family:monospace; font-size:8px; padding:1px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;">${pinText}</td>
              </tr>
            </table>
          </div>

          <!-- KOLOM KANAN: BADGE ROLE + TANDA TANGAN KEPALA SEKOLAH -->
          <div style="width:74px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; flex-shrink:0;">
            <div style="width:100%; border:1px solid ${badgeBorder}; background:${badgeBg}; color:${badgeText}; border-radius:5px; padding:3px 2px; text-align:center;">
              <div style="font-size:6.2px; font-weight:900; letter-spacing:0.2px; line-height:1.1;">${roleLabel}</div>
              <div style="font-size:5.5px; font-weight:700; color:#475569; margin-top:1.5px; line-height:1.1;">Tab Admin/Guru</div>
            </div>

            <div style="text-align:center; font-size:5.9px; line-height:1.12; margin-top:2px; width:100%;">
              <div style="color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeCity}, ${safeDate}</div>
              <div style="font-weight:700; color:#0f172a;">Kepala Sekolah,</div>
              <div style="height:11px;"></div>
              <div style="font-weight:800; text-decoration:underline; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:74px;">${safeHeadmaster}</div>
              <div style="color:#64748b; font-size:5.1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:74px;">NIP. ${safeHeadmasterNip}</div>
            </div>
          </div>

        </div>

        <!-- FOOTER KARTU -->
        <div style="border-top:0.8px dashed #cbd5e1; padding-top:2px; display:flex; justify-content:flex-end; font-size:6.1px; color:#64748b; font-weight:600;">
          <span>No. Urut: ${startIndex + idx + 1}</span>
        </div>

      </div>
    `;
    }).join('');
  }

  buildPaginatedTeacherCardsPagesHtml(list, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER") {
    const items = Array.isArray(list) ? list : [];
    const perPage = 8; // 2 kolom x 4 baris agar presisi di A4 dan tidak pernah terpotong
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const cfg = this.getSchoolConfig();
    const safeSchoolName = this.escapePrintHtml(cfg.schoolName || 'SMP NEGERI 2 PACET');
    const stampText = this.escapePrintHtml(this.getPrintStampText());
    const pages = [];

    for (let p = 0; p < totalPages; p++) {
      const startIndex = p * perPage;
      const chunk = items.slice(startIndex, startIndex + perPage);
      const cardsHtml = this.generateTeacherCardsHtml(chunk, examTitle, startIndex);
      const pageBadge = totalPages > 1 ? ` &bull; Halaman ${p + 1} dari ${totalPages}` : '';
      const breakStyle = p < totalPages - 1 ? 'page-break-after:always; break-after:page;' : '';

      pages.push(`
        <div class="cbt-cards-page-sheet" style="width:210mm; margin:0 auto; padding:6mm 10mm; box-sizing:border-box; font-family:'Plus Jakarta Sans', Arial, sans-serif; background:#ffffff; color:#0f172a; ${breakStyle}">
          <div style="text-align:center; border-bottom:1.8px solid #0f172a; padding-bottom:4px; margin-bottom:7px;">
            <h2 style="font-size:12px; font-weight:900; margin:0; text-transform:uppercase; color:#0f172a;">${safeSchoolName} &mdash; KARTU LOGIN AKUN GURU (CBT)</h2>
            <p style="font-size:8.5px; color:#64748b; margin:2px 0 0 0;">Total: ${items.length} Akun${pageBadge}</p>
          </div>
          <div class="cards-grid-print" style="display:grid; grid-template-columns: repeat(2, 9.0cm); justify-content:center; gap:4.5mm 6mm;">
            ${cardsHtml}
          </div>
          <div class="cbt-print-footer-note" style="margin-top:8px; padding-top:3px; border-top:0.5px solid #cbd5e1; font-size:8px; color:#1d4ed8; font-style:italic; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${stampText}</div>
        </div>
      `);
    }

    return pages;
  }

  printTeacherCards(teachersToPrint, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER") {
    const printArea = document.getElementById('printableCardsArea');
    if (!printArea) return;

    const list = Array.isArray(teachersToPrint) ? teachersToPrint : this.getAllTeachers();
    if (list.length === 0) {
      alert("Belum ada data guru untuk dicetak kartu loginnya.");
      return;
    }

    const pagesHtml = this.buildPaginatedTeacherCardsPagesHtml(list, examTitle);
    printArea.innerHTML = pagesHtml.join('');

    document.body.classList.add('printing-cards');
    printArea.classList.remove('hidden');

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-cards');
        printArea.classList.add('hidden');
      }, 1000);
    }, 250);
  }

  async downloadTeacherCardsPdf(teachersToPrint, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER") {
    const list = Array.isArray(teachersToPrint) ? teachersToPrint : this.getAllTeachers();
    if (list.length === 0) {
      alert("Belum ada data guru untuk di-download kartu loginnya.");
      return;
    }

    if (typeof html2pdf === 'undefined') {
      this.printTeacherCards(list, examTitle);
      return;
    }

    const cfg = this.getSchoolConfig();
    const pagesHtml = this.buildPaginatedTeacherCardsPagesHtml(list, examTitle);
    const filename = `Kartu_Login_Guru_CBT_${(cfg.schoolName || 'SMPN2Pacet').replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    const prevScrollX = window.scrollX || window.pageXOffset || 0;
    const prevScrollY = window.scrollY || window.pageYOffset || 0;

    try {
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
            clonedDoc.documentElement.classList.remove('dark');
            if (clonedDoc.body) {
              clonedDoc.body.classList.remove('dark');
              clonedDoc.body.style.background = '#ffffff';
              clonedDoc.body.style.backgroundImage = 'none';
            }
            const container = clonedDoc.querySelector('.html2pdf__container');
            if (container) {
              container.style.left = '0px';
              container.style.right = 'auto';
              container.style.top = '0px';
              container.style.margin = '0px';
            }
          }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const seedHtml = '<div style="width:10px;height:10px;background:#ffffff;"></div>';
      const pdfDoc = await html2pdf().set(sheetOpt).from(seedHtml).toPdf().get('pdf');

      for (let i = 0; i < pagesHtml.length; i++) {
        const cleanPageHtml = pagesHtml[i]
          .replace(/page-break-after:\s*always;\s*/gi, '')
          .replace(/break-after:\s*page;\s*/gi, '');
        const canvas = await html2pdf().set(sheetOpt).from(cleanPageHtml).toCanvas().get('canvas');
        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        if (i > 0) {
          pdfDoc.addPage('a4', 'portrait');
        }

        const pageW = 210;
        const maxPageH = 295;
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
      console.error("Gagal download PDF kartu guru:", err);
      this.printTeacherCards(list, examTitle);
    } finally {
      window.scrollTo(prevScrollX, prevScrollY);
    }
  }

  // ===================== CETAK & DOWNLOAD DAFTAR HADIR PESERTA RESMI =====================
  buildAttendanceSheetHtml(studentsList = [], options = {}) {
    const cfg = this.getSchoolConfig();
    const savedAtt = cfg.attendanceIdentity || this.getDefaultAttendanceIdentity(cfg);
    const examCfg = (typeof window !== 'undefined' && window.examEngine && window.examEngine.config) ? window.examEngine.config : {};

    const list = Array.isArray(studentsList) ? studentsList : [];
    const docTitle = String(options.docTitle || savedAtt.docTitle || 'DAFTAR HADIR PESERTA').trim().toUpperCase();
    const examTitle = String(options.examTitle || savedAtt.examTitle || examCfg.examTitle || 'ASESMEN SUMATIF AKHIR SEMESTER (ASAS)').trim().toUpperCase();
    const academicYear = String(options.academicYear || savedAtt.academicYear || 'TAHUN PELAJARAN 2026/2027').trim().toUpperCase();

    const cityRegency = String(options.cityRegency || savedAtt.cityRegency || 'KABUPATEN CIANJUR').trim();
    const cityCode = String(options.cityCode !== undefined ? options.cityCode : (savedAtt.cityCode || '')).trim();
    const schoolName = String(options.schoolName || savedAtt.schoolName || cfg.schoolName || 'SMP NEGERI 2 PACET').trim();
    const schoolCode = String(options.schoolCode !== undefined ? options.schoolCode : (savedAtt.schoolCode || '')).trim();
    const classLabel = String(options.classLabel || '').trim();
    const serverRoom = String(options.serverRoom || savedAtt.serverRoom || (classLabel ? `Ruang Ujian ${classLabel}` : 'Ruang Ujian 1')).trim();
    const session = String(options.session !== undefined ? options.session : (savedAtt.session || '1')).trim();
    const dayText = String(options.dayText !== undefined ? options.dayText : (savedAtt.dayText || '')).trim() || '....................';
    const dateText = String(options.dateText !== undefined ? options.dateText : (savedAtt.dateText || '')).trim() || '..............................';
    const timeRange = String(options.timeRange !== undefined ? options.timeRange : (savedAtt.timeRange || '07.30 - 09.30')).trim();
    const subjectName = String(options.subjectName !== undefined ? options.subjectName : (savedAtt.subjectName || examCfg.subject || '')).trim() || 'Semua Mata Pelajaran';

    const headmasterName = String(options.headmasterName || savedAtt.headmasterName || cfg.headmasterName || 'Kepala Sekolah').trim();
    const headmasterNip = String(options.headmasterNip !== undefined ? options.headmasterNip : (savedAtt.headmasterNip || cfg.headmasterNip || '')).trim();
    const pengawasName = String(options.pengawasName !== undefined ? options.pengawasName : (savedAtt.pengawasName || '')).trim();
    const pengawasNip = String(options.pengawasNip !== undefined ? options.pengawasNip : (savedAtt.pengawasNip || '')).trim();

    const notesRaw = String(options.notes !== undefined ? options.notes : (savedAtt.notes || '')).trim();
    const notesLines = notesRaw
      ? notesRaw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      : [
          '1. Dibuat rangkap 2 (dua), masing-masing untuk arsip sekolah dan panitia ujian.',
          '2. Pengawas ruang menyilang Nama Peserta yang tidak hadir.',
          '3. Daftar hadir diserahkan kepada panitia ujian setelah sesi selesai.'
        ];
    const autoTotalStudents = options.autoTotalStudents !== undefined ? Boolean(options.autoTotalStudents) : Boolean(savedAtt.autoTotalStudents);
    const paperSize = String(options.paperSize || savedAtt.paperSize || 'F4').toUpperCase() === 'A4' ? 'A4' : 'F4';
    const reqRowsPerPage = parseInt(options.rowsPerPage || savedAtt.rowsPerPage || 25, 10);
    const rowsPerPage = (!isNaN(reqRowsPerPage) && reqRowsPerPage > 0) ? reqRowsPerPage : Math.max(list.length, 15);

    const customKopImg = options.kopSuratImage !== undefined ? options.kopSuratImage : (cfg.kopSuratImage || '');
    const logoLeftHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Dinas" style="width:62px; height:62px; object-fit:contain; display:block;">`
      : '';
    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo Sekolah" style="width:62px; height:62px; object-fit:contain; display:block; margin-left:auto;">`
      : '';

    const kopHtml = (customKopImg && String(customKopImg).trim() !== '')
      ? `
        <div style="width:100%; margin:0 0 6px 0; padding:0; text-align:center;">
          <img src="${customKopImg}" alt="Kop Surat Sekolah" style="width:100%; max-height:110px; height:auto; object-fit:contain; display:block; margin:0 auto;">
        </div>
      `
      : `
        <table style="width:100%; border-collapse:collapse; margin:0 0 2px 0;">
          <tbody>
            <tr>
              <td style="width:70px; vertical-align:middle; text-align:left; padding-bottom:4px;">
                ${logoLeftHtml || '<div style="width:56px;height:56px;"></div>'}
              </td>
              <td style="vertical-align:middle; text-align:center; padding-bottom:4px;">
                <div style="font-size:11.5px; font-weight:600; letter-spacing:0.4px; text-transform:uppercase; line-height:1.2;">${this.escapePrintHtml(cfg.schoolSubtitle || 'PEMERINTAH KABUPATEN CIANJUR — DINAS PENDIDIKAN')}</div>
                <div style="font-size:16.5px; font-weight:800; letter-spacing:0.6px; text-transform:uppercase; line-height:1.2; margin-top:1px;">${this.escapePrintHtml(schoolName)}</div>
                <div style="font-size:9.5px; line-height:1.25; margin-top:2px;">${this.escapePrintHtml(cfg.schoolAddress || '')}</div>
              </td>
              <td style="width:70px; vertical-align:middle; text-align:right; padding-bottom:4px;">
                ${logoRightHtml || '<div style="width:56px;height:56px;"></div>'}
              </td>
            </tr>
          </tbody>
        </table>
        <div style="border-top:2.2px solid #000000; border-bottom:1px solid #000000; height:2px; margin-bottom:7px;"></div>
      `;

    const buildHeaderAndMeta = (pageIdx, totalPages) => `
      ${kopHtml}
      <div style="text-align:center; font-weight:700; font-size:12px; line-height:1.3; text-transform:uppercase; margin-bottom:8px;">
        <div>${this.escapePrintHtml(docTitle)}</div>
        <div>${this.escapePrintHtml(examTitle)}</div>
        <div>${this.escapePrintHtml(academicYear)}${totalPages > 1 ? ` <span style="font-weight:normal; font-size:10px;">(Hal. ${pageIdx + 1}/${totalPages})</span>` : ''}</div>
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:10.5px; line-height:1.35; margin-bottom:7px;">
        <tbody>
          <tr>
            <td style="width:20%; padding:1.5px 4px 1.5px 0; font-weight:600; vertical-align:bottom;">KOTA/KABUPATEN</td>
            <td style="width:2%; padding:1.5px 3px; vertical-align:bottom;">:</td>
            <td style="width:41%; padding:1.5px 8px 1.5px 0; vertical-align:bottom;">
              <div style="border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(cityRegency)}</div>
            </td>
            <td style="width:4%;"></td>
            <td style="width:11%; padding:1.5px 4px 1.5px 0; font-weight:600; vertical-align:bottom;">KODE</td>
            <td style="width:2%; padding:1.5px 3px; vertical-align:bottom;">:</td>
            <td style="width:20%; padding:1.5px 0; vertical-align:bottom;">
              <div style="border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(cityCode) || '&nbsp;'}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:2px 4px 2px 0; font-weight:600; vertical-align:bottom;">SEKOLAH/MADRASAH</td>
            <td style="padding:2px 3px; vertical-align:bottom;">:</td>
            <td style="padding:2px 8px 2px 0; vertical-align:bottom;">
              <div style="border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(schoolName)}</div>
            </td>
            <td></td>
            <td style="padding:2px 4px 2px 0; font-weight:600; vertical-align:bottom;">KODE</td>
            <td style="padding:2px 3px; vertical-align:bottom;">:</td>
            <td style="padding:2px 0; vertical-align:bottom;">
              <div style="border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(schoolCode) || '&nbsp;'}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:2px 4px 2px 0; font-weight:600; vertical-align:bottom;">ID SERVER / RUANG</td>
            <td style="padding:2px 3px; vertical-align:bottom;">:</td>
            <td style="padding:2px 8px 2px 0; vertical-align:bottom;">
              <div style="border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(serverRoom)}</div>
            </td>
            <td></td>
            <td style="padding:2px 4px 2px 0; font-weight:600; vertical-align:bottom;">SESI</td>
            <td style="padding:2px 3px; vertical-align:bottom;">:</td>
            <td style="padding:2px 0; vertical-align:bottom;">
              <div style="border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(session) || '&nbsp;'}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:2px 4px 2px 0; font-weight:600; vertical-align:bottom;">HARI</td>
            <td style="padding:2px 3px; vertical-align:bottom;">:</td>
            <td style="padding:2px 8px 2px 0; vertical-align:bottom;">
              <table style="width:100%; border-collapse:collapse;">
                <tbody>
                  <tr>
                    <td style="width:36%; border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(dayText)}</td>
                    <td style="width:24%; padding:0 4px 1px 8px; font-weight:600; white-space:nowrap;">TANGGAL :</td>
                    <td style="width:40%; border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(dateText)}</td>
                  </tr>
                </tbody>
              </table>
            </td>
            <td></td>
            <td style="padding:2px 4px 2px 0; font-weight:600; vertical-align:bottom;">PUKUL</td>
            <td style="padding:2px 3px; vertical-align:bottom;">:</td>
            <td style="padding:2px 0; vertical-align:bottom;">
              <div style="border-bottom:1px solid #000000; padding-bottom:1px; font-weight:600;">${this.escapePrintHtml(timeRange)}</div>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const totalExpectedText = autoTotalStudents ? String(list.length) : '_____';
    const pengawasDisplay = pengawasName ? `(${this.escapePrintHtml(pengawasName)})` : '(................................................)';
    const pengawasNipDisplay = pengawasNip ? `NIP. ${this.escapePrintHtml(pengawasNip)}` : 'NIP. ........................................';
    const headmasterDisplay = headmasterName ? `(${this.escapePrintHtml(headmasterName)})` : '(................................................)';
    const headmasterNipDisplay = headmasterNip ? `NIP. ${this.escapePrintHtml(headmasterNip)}` : 'NIP. ........................................';

    const footerHtml = `
      <div style="margin-top:6px; font-size:10px; line-height:1.35; break-inside:avoid; page-break-inside:avoid;">
        <div style="font-weight:700; font-style:italic; margin-bottom:2px;">Keterangan :</div>
        <div style="margin-bottom:8px;">
          ${notesLines.map(line => `<div>${this.escapePrintHtml(line)}</div>`).join('')}
        </div>

        <table style="width:100%; border-collapse:collapse; margin-top:4px;">
          <tbody>
            <tr>
              <td style="width:46%; vertical-align:top; padding-right:10px;">
                <table style="width:100%; border-collapse:collapse; border:1.2px solid #000000; font-size:10px;">
                  <tbody>
                    <tr>
                      <td style="padding:3px 5px; border-bottom:1px solid #000000;">Jumlah Peserta yang Seharusnya Hadir</td>
                      <td style="padding:3px 2px; border-bottom:1px solid #000000; width:10px; text-align:center;">:</td>
                      <td style="padding:3px 6px; border-bottom:1px solid #000000; width:78px; white-space:nowrap;"><strong>${this.escapePrintHtml(totalExpectedText)}</strong> peserta</td>
                    </tr>
                    <tr>
                      <td style="padding:3px 5px; border-bottom:1px solid #000000;">Jumlah Peserta yang Tidak Hadir</td>
                      <td style="padding:3px 2px; border-bottom:1px solid #000000; text-align:center;">:</td>
                      <td style="padding:3px 6px; border-bottom:1px solid #000000; white-space:nowrap;">_____ peserta</td>
                    </tr>
                    <tr>
                      <td style="padding:3px 5px;">Jumlah Peserta Hadir</td>
                      <td style="padding:3px 2px; text-align:center;">:</td>
                      <td style="padding:3px 6px; white-space:nowrap;">_____ peserta</td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td style="width:27%; vertical-align:top; text-align:center; padding:0 6px;">
                <div style="font-weight:600; font-size:10.5px;">Kepala Sekolah</div>
                <div style="height:44px;"></div>
                <div style="font-weight:700; font-size:10.5px;">${headmasterDisplay}</div>
                <div style="font-size:10px; margin-top:2px;">${headmasterNipDisplay}</div>
              </td>
              <td style="width:27%; vertical-align:top; text-align:center; padding:0 4px;">
                <div style="font-weight:600; font-size:10.5px;">Pengawas</div>
                <div style="height:44px;"></div>
                <div style="font-weight:700; font-size:10.5px;">${pengawasDisplay}</div>
                <div style="font-size:10px; margin-top:2px;">${pengawasNipDisplay}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // Bagi peserta ke beberapa halaman sesuai rowsPerPage
    const chunks = [];
    if (list.length === 0) {
      chunks.push([]);
    } else {
      for (let i = 0; i < list.length; i += rowsPerPage) {
        chunks.push(list.slice(i, i + rowsPerPage));
      }
    }

    const totalPages = chunks.length;
    const sheetMinH = paperSize === 'A4' ? '297mm' : '330mm';
    const isDense = rowsPerPage >= 30;
    const cellPad = isDense ? '3px 5px' : '4.5px 6px';
    const rowFontSize = isDense ? '10px' : '10.5px';

    let globalIndex = 0;
    const pagesHtml = chunks.map((chunk, pageIdx) => {
      const rowsHtml = chunk.length > 0
        ? chunk.map((st) => {
            globalIndex++;
            const no = globalIndex;
            const isEven = no % 2 === 0;
            const sigHtml = isEven
              ? `<div style="display:flex; width:100%; align-items:center;"><span style="display:inline-block; width:50%;"></span><span style="display:inline-block; width:50%; text-align:left; font-size:${rowFontSize};">${no}.</span></div>`
              : `<div style="display:flex; width:100%; align-items:center;"><span style="display:inline-block; width:50%; text-align:left; font-size:${rowFontSize};">${no}.</span><span style="display:inline-block; width:50%;"></span></div>`;

            return `
              <tr>
                <td style="border:1px solid #000000; padding:${cellPad}; text-align:center; font-size:${rowFontSize};">${no}</td>
                <td style="border:1px solid #000000; padding:${cellPad}; font-size:${rowFontSize}; white-space:nowrap;">${this.escapePrintHtml(st.nisn || '-')}</td>
                <td style="border:1px solid #000000; padding:${cellPad}; font-size:${rowFontSize};">${this.escapePrintHtml(st.name || '-')}</td>
                <td style="border:1px solid #000000; padding:${cellPad}; vertical-align:middle;">${sigHtml}</td>
                <td style="border:1px solid #000000; padding:${cellPad}; font-size:${rowFontSize};">${this.escapePrintHtml(subjectName)}</td>
              </tr>
            `;
          }).join('')
        : `
          <tr>
            <td colspan="5" style="border:1px solid #000000; padding:18px; text-align:center; font-size:11px; color:#475569;">
              Tidak ada data peserta pada filter kelas ini.
            </td>
          </tr>
        `;

      const pageBreakClass = pageIdx > 0 ? ' attendance-page-break' : '';
      const showFooter = pageIdx === totalPages - 1;

      return `
        <div class="attendance-paper-sheet${pageBreakClass}" style="width:210mm; min-height:${sheetMinH}; margin:0 auto 16px auto; padding:10mm 12mm; background:#ffffff; color:#000000; font-family:Arial, Helvetica, sans-serif; box-shadow:0 4px 16px rgba(15,23,42,0.12); box-sizing:border-box;">
          ${buildHeaderAndMeta(pageIdx, totalPages)}
          <table style="width:100%; border-collapse:collapse; border:1.2px solid #000000;">
            <thead>
              <tr style="background:#ffffff;">
                <th style="border:1.2px solid #000000; padding:5px 4px; text-align:center; font-size:10.5px; font-weight:700; width:34px;">No.</th>
                <th style="border:1.2px solid #000000; padding:5px 6px; text-align:center; font-size:10.5px; font-weight:700; width:112px;">Username</th>
                <th style="border:1.2px solid #000000; padding:5px 6px; text-align:center; font-size:10.5px; font-weight:700;">Nama Peserta</th>
                <th style="border:1.2px solid #000000; padding:5px 6px; text-align:center; font-size:10.5px; font-weight:700; width:190px;">Tanda Tangan</th>
                <th style="border:1.2px solid #000000; padding:5px 6px; text-align:center; font-size:10.5px; font-weight:700; width:150px;">Mata Pelajaran</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          ${showFooter ? footerHtml : ''}
        </div>
      `;
    }).join('');

    return pagesHtml;
  }

  async downloadAttendancePDF(studentsList = [], options = {}) {
    if (!studentsList || studentsList.length === 0) {
      alert("Tidak ada data peserta untuk di-download daftar hadirnya.");
      return;
    }
    if (typeof html2pdf === 'undefined') {
      alert("Library pembuat PDF belum termuat. Silakan muat ulang halaman dan coba lagi.");
      return;
    }

    const btnPdf = document.getElementById('btnDownloadAttendancePdf');
    const prevBtnHtml = btnPdf ? btnPdf.innerHTML : '';
    if (btnPdf) {
      btnPdf.disabled = true;
      btnPdf.innerHTML = '<span>⏳ Membuat PDF...</span>';
    }

    const paperSize = String(options.paperSize || 'F4').toUpperCase() === 'A4' ? 'A4' : 'F4';
    const pdfHeightMm = paperSize === 'A4' ? 297 : 330;
    const prevScrollY = window.scrollY || window.pageYOffset || 0;
    const prevScrollX = window.scrollX || window.pageXOffset || 0;
    const roomSlug = String(options.classLabel || options.serverRoom || 'Semua_Kelas').replace(/[^a-z0-9]+/gi, '_');
    const filename = `Daftar_Hadir_${roomSlug}_${Date.now()}.pdf`;

    try {
      window.scrollTo(0, 0);
      const tempWrapper = document.createElement('div');
      tempWrapper.innerHTML = this.buildAttendanceSheetHtml(studentsList, options);
      const sheets = Array.from(tempWrapper.querySelectorAll('.attendance-paper-sheet'));
      if (sheets.length === 0) {
        throw new Error('Tidak ada halaman daftar hadir untuk diekspor.');
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
            clonedDoc.documentElement.classList.remove('dark');
            if (clonedDoc.body) {
              clonedDoc.body.classList.remove('dark');
              clonedDoc.body.style.background = '#ffffff';
              clonedDoc.body.style.backgroundImage = 'none';
            }
            const container = clonedDoc.querySelector('.html2pdf__container');
            if (container) {
              container.style.left = '0px';
              container.style.right = 'auto';
              container.style.top = '0px';
              container.style.margin = '0px';
            }
          }
        },
        jsPDF: { unit: 'mm', format: [210, pdfHeightMm], orientation: 'portrait' }
      };

      const seedHtml = '<div style="width:10px;height:10px;background:#ffffff;"></div>';
      const pdfDoc = await html2pdf().set(sheetOpt).from(seedHtml).toPdf().get('pdf');

      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        sheet.classList.remove('attendance-page-break');
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
          pdfDoc.addPage([210, pdfHeightMm], 'portrait');
        }

        const pageW = 210;
        const maxPageH = pdfHeightMm - 2;
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
      console.error("Gagal export Daftar Hadir PDF:", err);
      alert("Gagal mengunduh file PDF: " + (err && err.message ? err.message : "Terjadi kesalahan saat memproses PDF."));
    } finally {
      window.scrollTo(prevScrollX, prevScrollY);
      if (btnPdf) {
        btnPdf.disabled = false;
        btnPdf.innerHTML = prevBtnHtml;
      }
    }
  }

  async downloadAttendanceDOC(studentsList = [], options = {}) {
    if (!studentsList || studentsList.length === 0) {
      alert("Tidak ada data peserta untuk di-download daftar hadirnya.");
      return;
    }

    const btnDoc = document.getElementById('btnDownloadAttendanceDoc');
    const prevBtnHtml = btnDoc ? btnDoc.innerHTML : '';
    if (btnDoc) {
      btnDoc.disabled = true;
      btnDoc.innerHTML = '<span>⏳ Membuat Word...</span>';
    }

    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.buildAttendanceSheetHtml(studentsList, options);
      const sheets = Array.from(tempDiv.querySelectorAll('.attendance-paper-sheet'));
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

      const imgs = Array.from(tempDiv.querySelectorAll('img'));
      for (const img of imgs) {
        const alt = String(img.getAttribute('alt') || '');
        const src = img.getAttribute('src') || '';
        const dims = await this.measureImageDimensions(src);
        const natW = dims.width || 800;
        const natH = dims.height || 200;
        if (alt === 'Kop Surat Sekolah') {
          const ratio = Math.min(665 / natW, 105 / natH, 1);
          const targetW = Math.max(1, Math.round(natW * ratio));
          const targetH = Math.max(1, Math.round(natH * ratio));
          img.setAttribute('width', String(targetW));
          img.setAttribute('height', String(targetH));
          img.style.width = `${targetW}px`;
          img.style.height = `${targetH}px`;
        } else {
          img.setAttribute('width', '60');
          img.setAttribute('height', '60');
          img.style.width = '60px';
          img.style.height = '60px';
        }
      }

      const paperSize = String(options.paperSize || 'F4').toUpperCase() === 'A4' ? 'A4' : 'F4';
      const sizeCss = paperSize === 'A4' ? '21.0cm 29.7cm' : '21.0cm 33.0cm';
      const wordDocHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <title>Daftar Hadir Peserta</title>
          <style>
            @page Section1 {
              size: ${sizeCss};
              mso-page-orientation: portrait;
              margin: 0.9cm 1.2cm 0.9cm 1.2cm;
            }
            div.Section1 { page: Section1; }
            body { font-family: Arial, Helvetica, sans-serif; color: #000000; margin: 0; padding: 0; }
            .attendance-paper-sheet { width: 100% !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; min-height: auto !important; }
            .attendance-page-break { page-break-before: always; break-before: page; }
          </style>
        </head>
        <body><div class="Section1">${tempDiv.innerHTML}</div></body>
        </html>
      `;

      const roomSlug = String(options.classLabel || options.serverRoom || 'Semua_Kelas').replace(/[^a-z0-9]+/gi, '_');
      const blob = new Blob(['\ufeff', wordDocHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Daftar_Hadir_${roomSlug}_${Date.now()}.doc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Gagal export Daftar Hadir Word:", err);
      alert("Gagal mengunduh file Word: " + (err && err.message ? err.message : "Terjadi kesalahan."));
    } finally {
      if (btnDoc) {
        btnDoc.disabled = false;
        btnDoc.innerHTML = prevBtnHtml;
      }
    }
  }

  printAttendanceDirect(studentsList = [], options = {}) {
    if (!studentsList || studentsList.length === 0) {
      alert("Tidak ada data peserta untuk dicetak daftar hadirnya.");
      return;
    }
    const printArea = document.getElementById('printableAttendanceArea');
    if (!printArea) {
      window.print();
      return;
    }
    printArea.innerHTML = this.buildAttendanceSheetHtml(studentsList, options);
    printArea.classList.remove('hidden');
    document.body.classList.add('printing-attendance');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        printArea.classList.add('hidden');
        document.body.classList.remove('printing-attendance');
      }, 1000);
    }, 250);
  }
}

window.cbtAdmin = new CBTAdmin();
