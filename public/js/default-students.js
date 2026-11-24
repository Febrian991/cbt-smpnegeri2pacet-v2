// Data Manajemen Siswa Peserta Ujian (Kapasitas 250+ Siswa)
// Mendukung Impor Excel (.xlsx) dengan Kolom Tempat Lahir & Tanggal Lahir Terpisah, Kartu Presisi 9,0 x 5,3 cm dengan Kop Surat, & Autentikasi NISN + Password

function splitBirthPlaceDate(raw) {
  const txt = String(raw || "").trim();
  if (!txt) return { birthPlace: "Mojokerto", birthDate: "10 Mei 2011" };
  const idx = txt.indexOf(',');
  if (idx > -1) {
    return {
      birthPlace: txt.slice(0, idx).trim() || "Mojokerto",
      birthDate: txt.slice(idx + 1).trim() || "10 Mei 2011"
    };
  }
  return { birthPlace: txt, birthDate: "-" };
}

function buildBirthPlaceDate(birthPlace, birthDate, fallbackRaw = "") {
  const p = String(birthPlace || "").trim();
  const d = String(birthDate || "").trim();
  if (p && d && d !== "-") return `${p}, ${d}`;
  if (p) return p;
  if (d) return d;
  return String(fallbackRaw || "").trim() || "-";
}

function normalizeExamRoomDisplay(raw) {
  const txt = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!txt || txt === '-' || /^belum\s+diatur$/i.test(txt)) return '';
  return txt;
}

function normalizeExamRoomKey(raw) {
  const s = normalizeExamRoomDisplay(raw).toUpperCase();
  if (!s) return '';
  return s
    .replace(/^RUANGAN?\b/i, 'RUANG')
    .replace(/[\s._-]+/g, '')
    .replace(/([A-Z])0+(\d+)/g, '$1$2');
}

const SAMPLE_INITIAL_STUDENTS = [
  { nisn: "0081234501", name: "Ahmad Fauzan Pratama", class: "9A", birthPlace: "Mojokerto", birthDate: "12 Januari 2011", birthPlaceDate: "Mojokerto, 12 Januari 2011", gender: "Laki-laki", address: "Ds. Pacet RT 02 RW 01, Kec. Pacet", password: "123" },
  { nisn: "0081234502", name: "Aisyah Putri Maharani", class: "9A", birthPlace: "Mojokerto", birthDate: "24 Maret 2011", birthPlaceDate: "Mojokerto, 24 Maret 2011", gender: "Perempuan", address: "Ds. Claket RT 01 RW 03, Kec. Pacet", password: "123" },
  { nisn: "0081234503", name: "Bagus Setiawan", class: "9A", birthPlace: "Mojokerto", birthDate: "05 Juli 2011", birthPlaceDate: "Mojokerto, 05 Juli 2011", gender: "Laki-laki", address: "Ds. Padusan RT 04 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234504", name: "Cantika Dewi Anggraini", class: "9A", birthPlace: "Mojokerto", birthDate: "18 Agustus 2011", birthPlaceDate: "Mojokerto, 18 Agustus 2011", gender: "Perempuan", address: "Ds. Cembor RT 03 RW 01, Kec. Pacet", password: "123" },
  { nisn: "0081234505", name: "Dimas Arya Pangestu", class: "9A", birthPlace: "Mojokerto", birthDate: "09 Februari 2011", birthPlaceDate: "Mojokerto, 09 Februari 2011", gender: "Laki-laki", address: "Ds. Kembangbelor RT 02 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234506", name: "Eka Nur Safitri", class: "9B", birthPlace: "Mojokerto", birthDate: "15 September 2011", birthPlaceDate: "Mojokerto, 15 September 2011", gender: "Perempuan", address: "Ds. Nogosari RT 01 RW 01, Kec. Pacet", password: "123" },
  { nisn: "0081234507", name: "Farhan Maulana", class: "9B", birthPlace: "Mojokerto", birthDate: "30 Mei 2011", birthPlaceDate: "Mojokerto, 30 Mei 2011", gender: "Laki-laki", address: "Ds. Sajen RT 05 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234508", name: "Gita Permatasari", class: "9B", birthPlace: "Mojokerto", birthDate: "11 Oktober 2011", birthPlaceDate: "Mojokerto, 11 Oktober 2011", gender: "Perempuan", address: "Ds. Petak RT 02 RW 03, Kec. Pacet", password: "123" },
  { nisn: "0081234509", name: "Hafizh Al-Rasyid", class: "9B", birthPlace: "Mojokerto", birthDate: "22 April 2011", birthPlaceDate: "Mojokerto, 22 April 2011", gender: "Laki-laki", address: "Ds. Pacet Selatan RT 03 RW 04, Kec. Pacet", password: "123" },
  { nisn: "0081234510", name: "Intan Berlian", class: "9C", birthPlace: "Mojokerto", birthDate: "03 Juni 2011", birthPlaceDate: "Mojokerto, 03 Juni 2011", gender: "Perempuan", address: "Ds. Bendunganjati RT 01 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234511", name: "Joko Supriyanto", class: "9C", birthPlace: "Mojokerto", birthDate: "19 November 2010", birthPlaceDate: "Mojokerto, 19 November 2010", gender: "Laki-laki", address: "Ds. Wotanmas Jedong RT 03 RW 01, Kec. Ngoro", password: "123" },
  { nisn: "0081234512", name: "Khansa Nabila", class: "9C", birthPlace: "Mojokerto", birthDate: "28 Desember 2011", birthPlaceDate: "Mojokerto, 28 Desember 2011", gender: "Perempuan", address: "Ds. Kesimantengah RT 02 RW 01, Kec. Pacet", password: "123" }
];

const CBT_OFFLINE_VAULT_KEY = 'cbt_offline_vault_v1';
const CBT_OFFLINE_VAULT_PREFIX = 'CBT_VAULT_V1:';

function decodeOfflineVaultSafe() {
  try {
    const raw = localStorage.getItem(CBT_OFFLINE_VAULT_KEY);
    if (!raw || !raw.startsWith(CBT_OFFLINE_VAULT_PREFIX)) return null;
    const b64 = raw.slice(CBT_OFFLINE_VAULT_PREFIX.length);
    const bin = atob(b64);
    const salt = 'SMPN2PACET_CBT_V338';
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i) ^ salt.charCodeAt(i % salt.length);
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

class StudentManager {
  constructor() {
    this._hintMemoryList = null;
    this.students = this.loadStudents();
  }

  _getCurrentStaffSessionRaw() {
    try {
      if (typeof window !== 'undefined' && window.cbtAdmin && typeof window.cbtAdmin.getCurrentTeacher === 'function') {
        if (window.cbtAdmin.isAuthenticated) {
          return window.cbtAdmin.getCurrentTeacher();
        }
        return null;
      }
      const raw = localStorage.getItem('cbt_logged_teacher_session') || sessionStorage.getItem('cbt_logged_teacher');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.id ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  _hasStaffSession() {
    return Boolean(this._getCurrentStaffSessionRaw());
  }

  _hasSuperAdminSession() {
    const s = this._getCurrentStaffSessionRaw();
    return Boolean(s && (s.role === 'admin' || s.id === 'admin'));
  }

  _getOfflineCandidateStudents() {
    const vault = decodeOfflineVaultSafe();
    if (vault && Array.isArray(vault.students) && vault.students.length > 0) {
      return vault.students.map((s, idx) => this.normalizeStudent(s, idx));
    }
    return SAMPLE_INITIAL_STUDENTS.map((s, idx) => this.normalizeStudent(s, idx));
  }

  normalizeStudent(s, idx = 0) {
    const split = splitBirthPlaceDate(s.birthPlaceDate);
    const birthPlace = s.birthPlace ? String(s.birthPlace).trim() : split.birthPlace;
    const birthDate = s.birthDate ? String(s.birthDate).trim() : split.birthDate;
    const birthPlaceDate = buildBirthPlaceDate(birthPlace, birthDate, s.birthPlaceDate);
    const examRoom = normalizeExamRoomDisplay(s.examRoom !== undefined ? s.examRoom : (s.room !== undefined ? s.room : s.ruang));
    const rawSeat = s.seatOrder !== undefined ? s.seatOrder : (s.seatNo !== undefined ? s.seatNo : s.noKursi);
    const seatNum = parseInt(rawSeat, 10);
    const seatOrder = Number.isFinite(seatNum) && seatNum > 0 ? seatNum : 0;

    return {
      nisn: String(s.nisn || '').trim(),
      name: String(s.name || '').trim(),
      class: String(s.class || '9A').trim(),
      examRoom,
      seatOrder,
      birthPlace,
      birthDate,
      birthPlaceDate,
      gender: s.gender || (idx % 2 === 0 ? "Laki-laki" : "Perempuan"),
      address: s.address || "Ds. Pacet, Kec. Pacet, Mojokerto",
      password: s.password ? String(s.password).trim() : "123"
    };
  }

  loadStudents() {
    if (this._hasSuperAdminSession()) {
      const saved = localStorage.getItem('cbt_students_list');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((s, idx) => this.normalizeStudent(s, idx));
          }
        } catch (e) {
          console.error("Gagal load students:", e);
        }
      }
      const candidates = this._getOfflineCandidateStudents();
      try {
        localStorage.setItem('cbt_students_list', JSON.stringify(candidates));
      } catch (e) {}
      return candidates;
    }

    // Mode Guru Mapel & Pengawas: simpan daftar nama/kelas/ruang tanpa password di sessionStorage/memori
    try { localStorage.removeItem('cbt_students_list'); } catch (e) {}
    if (this._hasStaffSession()) {
      try {
        const cachedRoster = sessionStorage.getItem('cbt_guru_roster_cache');
        if (cachedRoster) {
          const parsed = JSON.parse(cachedRoster);
          if (Array.isArray(parsed)) {
            return parsed.map(s => {
              const rawSeat = s.seatOrder !== undefined ? s.seatOrder : (s.seatNo !== undefined ? s.seatNo : s.noKursi);
              const seatNum = parseInt(rawSeat, 10);
              return {
                nisn: String(s.nisn || '').trim(),
                name: String(s.name || '').trim(),
                class: String(s.class || 'Umum').trim(),
                examRoom: normalizeExamRoomDisplay(s.examRoom !== undefined ? s.examRoom : (s.room !== undefined ? s.room : s.ruang)),
                seatOrder: Number.isFinite(seatNum) && seatNum > 0 ? seatNum : 0
              };
            });
          }
        }
      } catch (e) {}
      return [];
    }

    // Mode Login / Siswa: jangan pernah menyimpan daftar 250 siswa & password ke localStorage
    try { sessionStorage.removeItem('cbt_guru_roster_cache'); } catch (e) {}
    return [];
  }

  saveStudents(studentsList, skipCloudPush = false) {
    const list = Array.isArray(studentsList) ? studentsList : [];
    if (this._hasSuperAdminSession()) {
      this.students = list.map((s, idx) => this.normalizeStudent(s, idx));
      try {
        localStorage.setItem('cbt_students_list', JSON.stringify(this.students));
      } catch (e) {}
      if (!skipCloudPush && typeof window !== 'undefined' && window.supabaseSync) {
        window.supabaseSync.pushStateKey('cbt_students_list', this.students);
      }
      return;
    }

    try { localStorage.removeItem('cbt_students_list'); } catch (e) {}
    if (this._hasStaffSession()) {
      this.students = list.map(s => {
        const rawSeat = s.seatOrder !== undefined ? s.seatOrder : (s.seatNo !== undefined ? s.seatNo : s.noKursi);
        const seatNum = parseInt(rawSeat, 10);
        return {
          nisn: String(s.nisn || '').trim(),
          name: String(s.name || '').trim(),
          class: String(s.class || 'Umum').trim(),
          examRoom: normalizeExamRoomDisplay(s.examRoom !== undefined ? s.examRoom : (s.room !== undefined ? s.room : s.ruang)),
          seatOrder: Number.isFinite(seatNum) && seatNum > 0 ? seatNum : 0
        };
      });
      try {
        sessionStorage.setItem('cbt_guru_roster_cache', JSON.stringify(this.students));
      } catch (e) {}
      return;
    }

    this.students = [];
    try { sessionStorage.removeItem('cbt_guru_roster_cache'); } catch (e) {}
  }

  scrubSensitiveDataForStudentMode() {
    this.students = [];
    this._hintMemoryList = null;
    try {
      localStorage.removeItem('cbt_students_list');
      sessionStorage.removeItem('cbt_guru_roster_cache');
    } catch (e) {}
  }

  getAllStudents() {
    return this.students;
  }

  getStudentCount() {
    return this.students.length;
  }

  getStudentByNisn(nisn) {
    const cleanNisn = String(nisn || "").trim();
    if (!cleanNisn) return null;
    return this.students.find(s => String(s.nisn).trim() === cleanNisn) || null;
  }

  compareClassNames(a, b) {
    const parseCls = (val) => {
      const s = String(val || '').trim();
      const m = s.match(/^(VIII|VII|IX|[0-9]+)\s*[-\s_]*([A-Za-z0-9]*)$/i);
      if (!m) return { grade: 99, suffix: s.toUpperCase() };
      const rawGrade = m[1].toUpperCase();
      const romanMap = { VII: 7, VIII: 8, IX: 9 };
      const grade = romanMap[rawGrade] !== undefined ? romanMap[rawGrade] : (parseInt(rawGrade, 10) || 99);
      return { grade, suffix: String(m[2] || '').toUpperCase() };
    };
    const pa = parseCls(a);
    const pb = parseCls(b);
    if (pa.grade !== pb.grade) return pa.grade - pb.grade;
    return pa.suffix.localeCompare(pb.suffix, 'id', { numeric: true });
  }

  getAllClasses() {
    const classSet = new Set();
    this.students.forEach(s => {
      if (s.class) classSet.add(String(s.class).trim());
    });
    return Array.from(classSet).sort((a, b) => this.compareClassNames(a, b));
  }

  normalizeRoomDisplay(raw) {
    return normalizeExamRoomDisplay(raw);
  }

  normalizeRoomKey(raw) {
    return normalizeExamRoomKey(raw);
  }

  compareRoomNames(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'id', { numeric: true, sensitivity: 'base' });
  }

  getAllRooms() {
    const roomMap = new Map();
    this.students.forEach(s => {
      const disp = normalizeExamRoomDisplay(s && (s.examRoom || s.room || s.ruang));
      const key = normalizeExamRoomKey(disp);
      if (disp && key && !roomMap.has(key)) {
        roomMap.set(key, disp);
      }
    });
    return Array.from(roomMap.values()).sort((a, b) => this.compareRoomNames(a, b));
  }

  matchesRoom(studentRoom, targetRoom) {
    const k1 = normalizeExamRoomKey(studentRoom);
    const k2 = normalizeExamRoomKey(targetRoom);
    return Boolean(k1 && k2 && k1 === k2);
  }

  isKnownRoom(token) {
    const k = normalizeExamRoomKey(token);
    if (!k) return false;
    return this.getAllRooms().some(r => normalizeExamRoomKey(r) === k);
  }

  sortRoomStudents(list = []) {
    const items = Array.isArray(list) ? [...list] : [];
    if (items.length <= 1) return items;
    const hasSeatOrder = items.some(s => Number(s && s.seatOrder) > 0);
    if (hasSeatOrder) {
      return items.sort((a, b) => {
        const sa = Number(a && a.seatOrder) > 0 ? Number(a.seatOrder) : 999999;
        const sb = Number(b && b.seatOrder) > 0 ? Number(b.seatOrder) : 999999;
        if (sa !== sb) return sa - sb;
        return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'id');
      });
    }
    return this._interleaveRoomMembers(items, { randomize: false });
  }

  getStudentsByRoom(roomName) {
    const key = normalizeExamRoomKey(roomName);
    if (!key) return [];
    const members = this.students.filter(s => normalizeExamRoomKey(s.examRoom) === key);
    return this.sortRoomStudents(members);
  }

  getClassesInRoom(roomName) {
    const inRoom = this.getStudentsByRoom(roomName);
    const clsSet = new Set();
    inRoom.forEach(s => {
      if (s.class) clsSet.add(String(s.class).trim());
    });
    return Array.from(clsSet).sort((a, b) => this.compareClassNames(a, b));
  }

  authenticateStudent(nisn, password, directoryOverride = null) {
    const cleanNisn = String(nisn || "").trim();
    const cleanPass = String(password || "").trim();

    const pool = (Array.isArray(directoryOverride) && directoryOverride.length > 0)
      ? directoryOverride
      : (this.students && this.students.length > 0 ? this.students : this._getOfflineCandidateStudents());

    const student = pool.find(s => String(s.nisn || '').trim() === cleanNisn);
    if (!student) {
      return { success: false, message: "NISN tidak terdaftar di pangkalan data SMP NEGERI 2 PACET!" };
    }

    const expectedPass = String(student.password || '123').trim();
    if (expectedPass !== cleanPass) {
      return { success: false, message: "Password akun siswa salah! Silakan periksa kartu peserta ujian Anda." };
    }

    return {
      success: true,
      student: {
        nisn: String(student.nisn || '').trim(),
        name: String(student.name || '-').trim(),
        class: String(student.class || 'Umum').trim(),
        examRoom: normalizeExamRoomDisplay(student.examRoom || student.room || student.ruang || '')
      }
    };
  }

  async authenticateStudentWithCloud(nisn, password) {
    const cleanNisn = String(nisn || "").trim();
    const cleanPass = String(password || "").trim();
    if (!cleanNisn || !cleanPass) {
      return { success: false, message: "Harap lengkapi NISN dan kata sandi!" };
    }

    if (typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
      const rpcRes = await window.supabaseSync.verifyStudentLoginRpc(cleanNisn, cleanPass);
      if (rpcRes && rpcRes.success && rpcRes.student) {
        return {
          success: true,
          student: {
            nisn: String(rpcRes.student.nisn || cleanNisn).trim(),
            name: String(rpcRes.student.name || '-').trim(),
            class: String(rpcRes.student.class || 'Umum').trim(),
            examRoom: normalizeExamRoomDisplay(rpcRes.student.examRoom || rpcRes.student.room || '')
          }
        };
      }
      if (rpcRes && !rpcRes.rpcUnavailable && !rpcRes.not_seeded) {
        return {
          success: false,
          message: rpcRes.message || "NISN atau Password akun siswa salah!"
        };
      }

      // Mode Kompatibilitas Pra-SQL / Belum Ter-seed: cek ke direktori Cloud di memori sementara TANPA simpan ke localStorage
      if (typeof window.supabaseSync.pullAuthDirectoryFallback === 'function') {
        const dirRes = await window.supabaseSync.pullAuthDirectoryFallback();
        const cloudStudents = dirRes && dirRes.state && Array.isArray(dirRes.state.cbt_students_list)
          ? dirRes.state.cbt_students_list
          : null;
        if (cloudStudents && cloudStudents.length > 0) {
          this._hintMemoryList = cloudStudents.map(s => ({
            nisn: String(s.nisn || '').trim(),
            name: String(s.name || '').trim(),
            class: String(s.class || 'Umum').trim(),
            examRoom: normalizeExamRoomDisplay(s.examRoom || s.room || s.ruang || '')
          }));
          return this.authenticateStudent(cleanNisn, cleanPass, cloudStudents);
        }
      }
    }

    return this.authenticateStudent(cleanNisn, cleanPass, this._getOfflineCandidateStudents());
  }

  async lookupStudentHintWithCloud(nisn) {
    const cleanNisn = String(nisn || "").trim();
    if (cleanNisn.length < 4) return { found: false };

    const localMatch = this.getStudentByNisn(cleanNisn);
    if (localMatch) {
      return { found: true, name: localMatch.name, class: localMatch.class, examRoom: localMatch.examRoom || '' };
    }

    if (typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
      if (typeof window.supabaseSync.lookupStudentHintRpc === 'function' && !window.supabaseSync.securityRpcMissing) {
        const res = await window.supabaseSync.lookupStudentHintRpc(cleanNisn);
        if (res && res.found) {
          return { found: true, name: res.name, class: res.class, examRoom: normalizeExamRoomDisplay(res.examRoom || res.room || '') };
        }
        if (res && !res.rpcUnavailable) {
          return { found: false };
        }
      }

      if (Array.isArray(this._hintMemoryList)) {
        const cached = this._hintMemoryList.find(s => s.nisn === cleanNisn);
        return cached ? { found: true, name: cached.name, class: cached.class, examRoom: cached.examRoom || '' } : { found: false };
      }

      if (typeof window.supabaseSync.pullAuthDirectoryFallback === 'function') {
        const dirRes = await window.supabaseSync.pullAuthDirectoryFallback();
        const cloudStudents = dirRes && dirRes.state && Array.isArray(dirRes.state.cbt_students_list)
          ? dirRes.state.cbt_students_list
          : [];
        if (cloudStudents.length > 0) {
          this._hintMemoryList = cloudStudents.map(s => ({
            nisn: String(s.nisn || '').trim(),
            name: String(s.name || '').trim(),
            class: String(s.class || 'Umum').trim(),
            examRoom: normalizeExamRoomDisplay(s.examRoom || s.room || s.ruang || '')
          }));
          const found = this._hintMemoryList.find(s => s.nisn === cleanNisn);
          return found ? { found: true, name: found.name, class: found.class, examRoom: found.examRoom || '' } : { found: false };
        }
      }
    }

    const offlineMatch = this._getOfflineCandidateStudents().find(s => s.nisn === cleanNisn);
    return offlineMatch ? { found: true, name: offlineMatch.name, class: offlineMatch.class, examRoom: offlineMatch.examRoom || '' } : { found: false };
  }

  addStudent(studentData) {
    const cleanNisn = String(studentData.nisn || "").trim();
    if (!cleanNisn) return { success: false, message: "NISN wajib diisi!" };

    const exists = this.students.some(s => String(s.nisn).trim() === cleanNisn);
    if (exists) {
      return { success: false, message: `Siswa dengan NISN ${cleanNisn} sudah terdaftar!` };
    }

    const birthPlace = studentData.birthPlace ? String(studentData.birthPlace).trim() : splitBirthPlaceDate(studentData.birthPlaceDate).birthPlace;
    const birthDate = studentData.birthDate ? String(studentData.birthDate).trim() : splitBirthPlaceDate(studentData.birthPlaceDate).birthDate;
    const examRoom = normalizeExamRoomDisplay(studentData.examRoom !== undefined ? studentData.examRoom : (studentData.room || ''));
    const rawSeat = parseInt(studentData.seatOrder, 10);
    let seatOrder = Number.isFinite(rawSeat) && rawSeat > 0 ? rawSeat : 0;
    if (examRoom && seatOrder === 0) {
      const existingInRoom = this.getStudentsByRoom(examRoom);
      const maxSeat = existingInRoom.reduce((m, s) => Math.max(m, Number(s.seatOrder) || 0), 0);
      seatOrder = Math.max(existingInRoom.length, maxSeat) + 1;
    }

    this.students.push({
      nisn: cleanNisn,
      name: String(studentData.name || "").trim(),
      class: studentData.class ? String(studentData.class).trim() : "7A",
      examRoom,
      seatOrder,
      birthPlace: birthPlace || '-',
      birthDate: birthDate || '-',
      birthPlaceDate: (birthPlace || birthDate) ? buildBirthPlaceDate(birthPlace, birthDate) : '-',
      gender: studentData.gender ? String(studentData.gender).trim() : "Laki-laki",
      address: studentData.address ? String(studentData.address).trim() : "-",
      password: studentData.password ? String(studentData.password).trim() : "123"
    });
    this.saveStudents(this.students);
    return { success: true };
  }

  deleteStudent(nisn) {
    this.students = this.students.filter(s => String(s.nisn).trim() !== String(nisn).trim());
    this.saveStudents(this.students);
  }

  resetAllStudentPasswords(defaultPass = "123") {
    let count = 0;
    this.students = this.students.map(s => {
      count++;
      return { ...s, password: defaultPass };
    });
    this.saveStudents(this.students);
    return { success: true, count };
  }

  updateStudentProfile(nisn, updatedData) {
    this.students = this.students.map(s => {
      if (String(s.nisn).trim() === String(nisn).trim()) {
        const nextPlace = updatedData.birthPlace !== undefined ? String(updatedData.birthPlace).trim() : s.birthPlace;
        const nextDate = updatedData.birthDate !== undefined ? String(updatedData.birthDate).trim() : s.birthDate;
        const nextRoom = updatedData.examRoom !== undefined
          ? normalizeExamRoomDisplay(updatedData.examRoom)
          : (s.examRoom || '');
        const rawSeat = updatedData.seatOrder !== undefined ? parseInt(updatedData.seatOrder, 10) : Number(s.seatOrder || 0);
        let nextSeat = Number.isFinite(rawSeat) && rawSeat > 0 ? rawSeat : 0;
        if (!nextRoom) {
          nextSeat = 0;
        } else if (updatedData.examRoom !== undefined && normalizeExamRoomKey(nextRoom) !== normalizeExamRoomKey(s.examRoom) && nextSeat === 0) {
          const existingInRoom = this.getStudentsByRoom(nextRoom);
          const maxSeat = existingInRoom.reduce((m, item) => Math.max(m, Number(item.seatOrder) || 0), 0);
          nextSeat = Math.max(existingInRoom.length, maxSeat) + 1;
        }
        return {
          ...s,
          name: updatedData.name ? String(updatedData.name).trim() : s.name,
          class: updatedData.class ? String(updatedData.class).trim() : s.class,
          examRoom: nextRoom,
          seatOrder: nextSeat,
          birthPlace: nextPlace || '-',
          birthDate: nextDate || '-',
          birthPlaceDate: buildBirthPlaceDate(nextPlace, nextDate, updatedData.birthPlaceDate || s.birthPlaceDate),
          gender: updatedData.gender ? String(updatedData.gender).trim() : s.gender,
          address: updatedData.address !== undefined ? (String(updatedData.address).trim() || '-') : s.address,
          password: updatedData.password ? String(updatedData.password).trim() : s.password
        };
      }
      return s;
    });
    this.saveStudents(this.students);
    return { success: true };
  }

  _getGradeBucket(clsStr) {
    const m = String(clsStr || '').trim().match(/^(VIII|VII|IX|[0-9]+)/i);
    if (!m) return 'LAIN';
    const tok = m[1].toUpperCase();
    if (tok === 'VII') return '7';
    if (tok === 'VIII') return '8';
    if (tok === 'IX') return '9';
    return tok;
  }

  _interleaveRoomMembers(members = [], { randomize = true } = {}) {
    const list = Array.isArray(members) ? [...members] : [];
    if (list.length <= 1) return list;

    const fisherYates = (arr) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const classBucketMap = new Map();
    list.forEach(stu => {
      const clsKey = String((stu && stu.class) || 'Umum').trim().toUpperCase();
      if (!classBucketMap.has(clsKey)) {
        classBucketMap.set(clsKey, {
          clsKey,
          grade: this._getGradeBucket(stu && stu.class),
          items: []
        });
      }
      classBucketMap.get(clsKey).items.push(stu);
    });

    const buckets = Array.from(classBucketMap.values()).map(b => {
      const ordered = randomize
        ? fisherYates(b.items)
        : [...b.items].sort((a, c) => String((a && a.name) || '').localeCompare(String((c && c.name) || ''), 'id'));
      return {
        clsKey: b.clsKey,
        grade: b.grade,
        items: ordered,
        initialLen: ordered.length
      };
    });

    const result = [];
    let prevCls = '';
    let prevGrade = '';

    for (let step = 0; step < list.length; step++) {
      let bestBucket = null;
      let bestScore = -Infinity;

      buckets.forEach((b, idx) => {
        if (b.items.length === 0) return;
        let score = b.items.length / b.initialLen;
        if (b.clsKey === prevCls) {
          score -= 10;
        } else if (b.grade === prevGrade) {
          score -= 0.35;
        }
        if (randomize) {
          score += Math.random() * 0.08;
        } else {
          // Tie-breaker deterministik yang tetap menyelingi kelas
          score += ((idx + step) % buckets.length) * 0.001;
        }
        if (score > bestScore) {
          bestScore = score;
          bestBucket = b;
        }
      });

      if (!bestBucket) break;
      const picked = bestBucket.items.shift();
      result.push(picked);
      prevCls = bestBucket.clsKey;
      prevGrade = bestBucket.grade;
    }

    return result;
  }

  _resolveEffectiveCapacities(totalStudents, safeCount, roomCapacities = null) {
    const count = Math.max(1, safeCount);
    const total = Math.max(0, totalStudents);
    if (!Array.isArray(roomCapacities) || roomCapacities.length === 0) {
      const base = Math.floor(total / count);
      const rem = total % count;
      return Array.from({ length: count }, (_, idx) => base + (idx < rem ? 1 : 0));
    }

    const raw = Array.from({ length: count }, (_, idx) => {
      const n = parseInt(roomCapacities[idx], 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    const sum = raw.reduce((a, b) => a + b, 0);
    if (sum === total) return raw;

    const caps = [...raw];
    if (sum === 0) {
      const base = Math.floor(total / count);
      const rem = total % count;
      return Array.from({ length: count }, (_, idx) => base + (idx < rem ? 1 : 0));
    }

    if (sum < total) {
      // Kelebihan siswa dibanding total kuota: tambahkan dari ruang akhir ke depan agar kuota ruang awal (misal 32, 32, 40) tetap terjaga
      let diff = total - sum;
      let step = 0;
      while (diff > 0) {
        const idx = count - 1 - (step % count);
        caps[idx] += 1;
        diff--;
        step++;
      }
    } else {
      // Kekurangan siswa dibanding total kuota: isi penuh mulai Ruang 1..dst sesuai kuota, sisa kursi kosong ditaruh di ruang paling akhir agar mudah diisi siswa baru manual
      let diff = sum - total;
      for (let idx = count - 1; idx >= 0 && diff > 0; idx--) {
        const take = Math.min(caps[idx], diff);
        caps[idx] -= take;
        diff -= take;
      }
    }
    return caps;
  }

  _buildRoomAllocationMap({ mode = 'mixed_random', roomCount = 8, roomPrefix = 'Ruang', roomCapacities = null, randomize = true } = {}) {
    const hasCustomCaps = Array.isArray(roomCapacities) && roomCapacities.length > 0;
    const safeCount = hasCustomCaps
      ? Math.max(1, Math.min(50, roomCapacities.length))
      : Math.max(1, Math.min(50, parseInt(roomCount, 10) || 8));
    const safePrefix = normalizeExamRoomDisplay(roomPrefix || 'Ruang') || 'Ruang';
    const roomLabels = Array.from({ length: safeCount }, (_, i) => `${safePrefix} ${i + 1}`);

    const fisherYatesShuffle = (arr) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const assignedRoomByNisn = new Map();
    const assignedSeatByNisn = new Map();
    if (mode === 'clear') {
      return { roomCount: 0, roomPrefix: safePrefix, roomLabels: [], assignedRoomByNisn, assignedSeatByNisn, effectiveCapacities: [] };
    }

    const effectiveCapacities = this._resolveEffectiveCapacities(this.students.length, safeCount, roomCapacities);

    if (mode === 'by_class_sequential') {
      const sorted = [...this.students].sort((a, b) => {
        const cmp = this.compareClassNames(a.class, b.class);
        if (cmp !== 0) return cmp;
        return String(a.name || '').localeCompare(String(b.name || ''), 'id');
      });
      let cursor = 0;
      for (let rIdx = 0; rIdx < safeCount; rIdx++) {
        const cap = effectiveCapacities[rIdx] || 0;
        for (let k = 0; k < cap && cursor < sorted.length; k++) {
          const nisnKey = String(sorted[cursor].nisn).trim();
          assignedRoomByNisn.set(nisnKey, roomLabels[rIdx]);
          assignedSeatByNisn.set(nisnKey, k + 1);
          cursor++;
        }
      }
    } else {
      // Acak Campur Lintas Kelas (7-8-9) proporsional sesuai kuota tiap ruang + acak urutan tempat duduk
      const gradeMap = new Map();
      this.students.forEach(s => {
        const g = this._getGradeBucket(s.class);
        if (!gradeMap.has(g)) gradeMap.set(g, []);
        gradeMap.get(g).push(s);
      });
      const gradeKeys = Array.from(gradeMap.keys()).sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true }));
      const totalAll = Math.max(1, this.students.length);

      // Hitung matriks kuota [gradeIdx][roomIdx] agar jumlah per ruang TEPAT sesuai effectiveCapacities & tiap jenjang proporsional
      const matrix = gradeKeys.map(g => {
        const gLen = gradeMap.get(g).length;
        const raw = effectiveCapacities.map((cap, rIdx) => {
          const exact = (gLen * cap) / totalAll;
          return { rIdx, floorVal: Math.floor(exact), frac: exact - Math.floor(exact) };
        });
        const row = raw.map(item => item.floorVal);
        let rem = gLen - row.reduce((a, b) => a + b, 0);
        const byFrac = [...raw].sort((a, b) => (b.frac - a.frac) || (a.rIdx - b.rIdx));
        for (let k = 0; k < rem; k++) {
          row[byFrac[k % safeCount].rIdx] += 1;
        }
        return row;
      });

      const colSum = (rIdx) => matrix.reduce((sum, row) => sum + (row[rIdx] || 0), 0);
      let guard = 0;
      while (guard < totalAll * 4 + 100) {
        const overIdx = effectiveCapacities.findIndex((cap, rIdx) => colSum(rIdx) > cap);
        const underIdx = effectiveCapacities.findIndex((cap, rIdx) => colSum(rIdx) < cap);
        if (overIdx === -1 || underIdx === -1) break;
        let bestG = -1;
        let bestVal = 0;
        for (let gIdx = 0; gIdx < matrix.length; gIdx++) {
          if (matrix[gIdx][overIdx] > bestVal) {
            bestVal = matrix[gIdx][overIdx];
            bestG = gIdx;
          }
        }
        if (bestG === -1) break;
        matrix[bestG][overIdx] -= 1;
        matrix[bestG][underIdx] += 1;
        guard++;
      }

      const roomMembersMap = new Map(roomLabels.map(lbl => [lbl, []]));
      gradeKeys.forEach((g, gIdx) => {
        const list = randomize
          ? fisherYatesShuffle(gradeMap.get(g))
          : [...gradeMap.get(g)].sort((a, b) => this.compareClassNames(a.class, b.class));
        let cursor = 0;
        for (let rIdx = 0; rIdx < safeCount; rIdx++) {
          const take = matrix[gIdx][rIdx] || 0;
          const targetRoom = roomLabels[rIdx];
          for (let t = 0; t < take && cursor < list.length; t++) {
            const stu = list[cursor++];
            assignedRoomByNisn.set(String(stu.nisn).trim(), targetRoom);
            roomMembersMap.get(targetRoom).push(stu);
          }
        }
      });

      // Susun urutan tempat duduk (seatOrder 1..M) di tiap ruang agar kelas 7-8-9 terseling acak & tidak mengelompok
      roomLabels.forEach(lbl => {
        const orderedMembers = this._interleaveRoomMembers(roomMembersMap.get(lbl) || [], { randomize });
        orderedMembers.forEach((stu, idx) => {
          assignedSeatByNisn.set(String(stu.nisn).trim(), idx + 1);
        });
      });
    }

    return { roomCount: safeCount, roomPrefix: safePrefix, roomLabels, assignedRoomByNisn, assignedSeatByNisn, effectiveCapacities };
  }

  _summarizeRoomAllocations(studentsList, roomLabels = null) {
    const labels = Array.isArray(roomLabels) && roomLabels.length > 0
      ? roomLabels
      : (() => {
          const map = new Map();
          (studentsList || []).forEach(s => {
            const disp = normalizeExamRoomDisplay(s && (s.examRoom || s.room || s.ruang));
            const key = normalizeExamRoomKey(disp);
            if (disp && key && !map.has(key)) map.set(key, disp);
          });
          return Array.from(map.values()).sort((a, b) => this.compareRoomNames(a, b));
        })();

    return labels.map(lbl => {
      const members = this.sortRoomStudents((studentsList || []).filter(s => this.matchesRoom(s.examRoom, lbl)));
      const gradeCounts = {};
      members.forEach(m => {
        const g = `Kls ${this._getGradeBucket(m.class)}`;
        gradeCounts[g] = (gradeCounts[g] || 0) + 1;
      });
      const sampleSeats = members.slice(0, 6).map((m, idx) => ({
        seatOrder: Number(m.seatOrder) > 0 ? Number(m.seatOrder) : (idx + 1),
        class: String(m.class || '').trim(),
        name: String(m.name || '').trim()
      }));
      return { room: lbl, total: members.length, gradeCounts, sampleSeats };
    });
  }

  previewExamRoomsAllocation(options = {}) {
    if (!Array.isArray(this.students) || this.students.length === 0) {
      return { totalStudents: 0, mode: String(options.mode || 'mixed_random'), roomCount: 0, roomPrefix: 'Ruang', roomsSummary: [], effectiveCapacities: [] };
    }
    const mode = String(options.mode || 'mixed_random').trim();
    const { roomCount, roomPrefix, roomLabels, assignedRoomByNisn, assignedSeatByNisn, effectiveCapacities } = this._buildRoomAllocationMap({
      mode,
      roomCount: options.roomCount,
      roomPrefix: options.roomPrefix,
      roomCapacities: options.roomCapacities,
      randomize: false
    });
    if (mode === 'clear') {
      return { totalStudents: this.students.length, mode, roomCount: 0, roomPrefix, roomsSummary: [], effectiveCapacities: [] };
    }
    const simulated = this.students.map(s => {
      const k = String(s.nisn).trim();
      return {
        ...s,
        examRoom: assignedRoomByNisn.get(k) || roomLabels[0],
        seatOrder: assignedSeatByNisn.get(k) || 0
      };
    });
    return {
      totalStudents: this.students.length,
      mode,
      roomCount,
      roomPrefix,
      effectiveCapacities,
      roomsSummary: this._summarizeRoomAllocations(simulated, roomLabels)
    };
  }

  assignExamRooms(options = {}) {
    if (!Array.isArray(this.students) || this.students.length === 0) {
      return { success: false, message: "Belum ada data siswa untuk dibagi ruang ujian." };
    }
    const mode = String(options.mode || 'mixed_random').trim();
    if (mode === 'clear') {
      const next = this.students.map(s => ({ ...s, examRoom: '', seatOrder: 0 }));
      this.saveStudents(next);
      return { success: true, mode: 'clear', assignedCount: next.length, roomCount: 0, roomsSummary: [] };
    }

    const { roomCount, roomPrefix, roomLabels, assignedRoomByNisn, assignedSeatByNisn, effectiveCapacities } = this._buildRoomAllocationMap({
      mode,
      roomCount: options.roomCount,
      roomPrefix: options.roomPrefix,
      roomCapacities: options.roomCapacities,
      randomize: true
    });

    const nextStudents = this.students.map(s => {
      const k = String(s.nisn).trim();
      return {
        ...s,
        examRoom: assignedRoomByNisn.get(k) || roomLabels[0],
        seatOrder: assignedSeatByNisn.get(k) || 0
      };
    });
    this.saveStudents(nextStudents);

    return {
      success: true,
      mode,
      roomCount,
      roomPrefix,
      effectiveCapacities,
      assignedCount: nextStudents.length,
      roomsSummary: this._summarizeRoomAllocations(nextStudents, roomLabels)
    };
  }

  assignStudentsManualToRoom({ roomName, nisns = [], interleave = true } = {}) {
    const targetRoom = normalizeExamRoomDisplay(roomName);
    if (!targetRoom) {
      return { success: false, message: "Nama Ruang Ujian tujuan wajib diisi." };
    }
    const targetKey = normalizeExamRoomKey(targetRoom);
    const nisnSet = new Set((Array.isArray(nisns) ? nisns : []).map(n => String(n || '').trim()).filter(Boolean));
    if (nisnSet.size === 0) {
      return { success: false, message: "Pilih minimal 1 peserta untuk dimasukkan ke ruang." };
    }

    const touchedRoomKeys = new Set([targetKey]);
    let movedCount = 0;

    let nextStudents = this.students.map(s => {
      const k = String(s.nisn || '').trim();
      if (nisnSet.has(k)) {
        const prevKey = normalizeExamRoomKey(s.examRoom);
        if (prevKey) touchedRoomKeys.add(prevKey);
        movedCount++;
        return { ...s, examRoom: targetRoom, seatOrder: 0 };
      }
      return { ...s };
    });

    touchedRoomKeys.forEach(rKey => {
      const members = nextStudents.filter(s => normalizeExamRoomKey(s.examRoom) === rKey);
      const ordered = interleave
        ? this._interleaveRoomMembers(members, { randomize: false })
        : this.sortRoomStudents(members);
      const seatMap = new Map(ordered.map((m, idx) => [String(m.nisn).trim(), idx + 1]));
      nextStudents = nextStudents.map(s => {
        const sk = String(s.nisn || '').trim();
        return seatMap.has(sk) ? { ...s, seatOrder: seatMap.get(sk) } : s;
      });
    });

    this.saveStudents(nextStudents);
    return {
      success: true,
      roomName: targetRoom,
      movedCount,
      roomTotal: nextStudents.filter(s => normalizeExamRoomKey(s.examRoom) === targetKey).length
    };
  }

  removeStudentsFromRoom(nisns = []) {
    const nisnSet = new Set((Array.isArray(nisns) ? nisns : []).map(n => String(n || '').trim()).filter(Boolean));
    if (nisnSet.size === 0) return { success: false, removedCount: 0 };

    const touchedRoomKeys = new Set();
    let removedCount = 0;
    let nextStudents = this.students.map(s => {
      const k = String(s.nisn || '').trim();
      if (nisnSet.has(k) && s.examRoom) {
        const prevKey = normalizeExamRoomKey(s.examRoom);
        if (prevKey) touchedRoomKeys.add(prevKey);
        removedCount++;
        return { ...s, examRoom: '', seatOrder: 0 };
      }
      return { ...s };
    });

    touchedRoomKeys.forEach(rKey => {
      const members = this.sortRoomStudents(nextStudents.filter(s => normalizeExamRoomKey(s.examRoom) === rKey));
      const seatMap = new Map(members.map((m, idx) => [String(m.nisn).trim(), idx + 1]));
      nextStudents = nextStudents.map(s => {
        const sk = String(s.nisn || '').trim();
        return seatMap.has(sk) ? { ...s, seatOrder: seatMap.get(sk) } : s;
      });
    });

    this.saveStudents(nextStudents);
    return { success: true, removedCount };
  }

  clearAllStudents() {
    this.students = [];
    this.saveStudents([]);
  }

  searchStudents(query = "") {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return this.students;
    return this.students.filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.nisn && s.nisn.toLowerCase().includes(q)) ||
      (s.class && s.class.toLowerCase().includes(q)) ||
      (s.examRoom && s.examRoom.toLowerCase().includes(q)) ||
      (s.birthPlace && s.birthPlace.toLowerCase().includes(q)) ||
      (s.birthDate && s.birthDate.toLowerCase().includes(q)) ||
      (s.address && s.address.toLowerCase().includes(q))
    );
  }

  generate250DemoStudents() {
    const classes = ["7A", "7B", "7C", "8A", "8B", "8C", "9A", "9B", "9C"];
    const maleFirstNames = ["Ahmad", "Budi", "Bagus", "Dimas", "Eko", "Farhan", "Hafizh", "Joko", "Muhammad", "Rian", "Wahyu", "Yusuf", "Fajar", "Aditya", "Rizky", "Bambang", "Danu"];
    const femaleFirstNames = ["Aisyah", "Cantika", "Dewi", "Eka", "Gita", "Intan", "Khansa", "Lestari", "Nurul", "Putri", "Siti", "Tri", "Zahra", "Nabila", "Dini", "Rina", "Anisa"];
    const lastNames = ["Pratama", "Saputra", "Wijaya", "Kusuma", "Santoso", "Hidayat", "Lestari", "Rahmawati", "Firmansyah", "Nugroho", "Wulandari", "Maulana", "Setiawan", "Utami", "Pangestu", "Kurniawan", "Suharto"];

    const villages = [
      "Ds. Pacet RT 01 RW 01, Kec. Pacet",
      "Ds. Claket RT 02 RW 03, Kec. Pacet",
      "Ds. Padusan RT 03 RW 02, Kec. Pacet",
      "Ds. Cembor RT 01 RW 02, Kec. Pacet",
      "Ds. Kembangbelor RT 04 RW 01, Kec. Pacet",
      "Ds. Nogosari RT 02 RW 01, Kec. Pacet",
      "Ds. Sajen RT 03 RW 03, Kec. Pacet",
      "Ds. Petak RT 01 RW 04, Kec. Pacet",
      "Ds. Bendunganjati RT 02 RW 02, Kec. Pacet",
      "Ds. Kesimantengah RT 01 RW 01, Kec. Pacet"
    ];

    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    const generated = [];
    for (let i = 1; i <= 250; i++) {
      const padNum = String(i).padStart(3, '0');
      const isMale = (i % 2 !== 0);
      const gender = isMale ? "Laki-laki" : "Perempuan";
      const fName = isMale
        ? maleFirstNames[Math.floor(Math.random() * maleFirstNames.length)]
        : femaleFirstNames[Math.floor(Math.random() * femaleFirstNames.length)];
      const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const assignedClass = classes[Math.floor((i - 1) / (250 / classes.length)) % classes.length];

      const birthDay = String((i % 28) + 1).padStart(2, '0');
      const birthMonth = months[(i % 12)];
      const birthYear = assignedClass.startsWith('7') ? 2013 : assignedClass.startsWith('8') ? 2012 : 2011;
      const birthPlace = "Mojokerto";
      const birthDate = `${birthDay} ${birthMonth} ${birthYear}`;
      const address = villages[(i % villages.length)];

      generated.push({
        nisn: `0081234${padNum}`,
        name: `${fName} ${lName} (${padNum})`,
        class: assignedClass,
        birthPlace,
        birthDate,
        birthPlaceDate: `${birthPlace}, ${birthDate}`,
        gender,
        address,
        password: "123"
      });
    }

    this.saveStudents(generated);
    return { success: true, count: generated.length };
  }

  downloadRoomExcelTemplate(options = {}) {
    if (typeof XLSX === 'undefined') {
      alert("Pustaka SheetJS belum termuat. Pastikan ada koneksi internet.");
      return { success: false, message: "Pustaka SheetJS belum termuat." };
    }

    const preShuffleRandom = Boolean(options.preShuffleRandom);
    const roomCount = Math.max(1, Math.min(50, parseInt(options.roomCount, 10) || 8));
    const roomPrefix = normalizeExamRoomDisplay(options.roomPrefix || 'Ruang') || 'Ruang';

    const hasRealStudents = Array.isArray(this.students) && this.students.length > 0;
    let sourceStudents = hasRealStudents
      ? [...this.students]
      : [
          { nisn: "0081234501", name: "Contoh Siswa Kelas 7A", class: "7A", gender: "Laki-laki", examRoom: "Ruang 1", seatOrder: 1 },
          { nisn: "0081234503", name: "Contoh Siswa Kelas 8A", class: "8A", gender: "Laki-laki", examRoom: "Ruang 1", seatOrder: 2 },
          { nisn: "0081234505", name: "Contoh Siswa Kelas 9A", class: "9A", gender: "Laki-laki", examRoom: "Ruang 1", seatOrder: 3 },
          { nisn: "0081234502", name: "Contoh Siswa Kelas 7B", class: "7B", gender: "Perempuan", examRoom: "Ruang 2", seatOrder: 1 },
          { nisn: "0081234504", name: "Contoh Siswa Kelas 8B", class: "8B", gender: "Perempuan", examRoom: "Ruang 2", seatOrder: 2 },
          { nisn: "0081234506", name: "Contoh Siswa Kelas 9B", class: "9B", gender: "Perempuan", examRoom: "Ruang 2", seatOrder: 3 }
        ];

    let shuffledAlloc = null;
    if (preShuffleRandom && hasRealStudents) {
      shuffledAlloc = this._buildRoomAllocationMap({
        mode: 'mixed_random',
        roomCount,
        roomPrefix,
        roomCapacities: options.roomCapacities,
        randomize: true
      });
      sourceStudents = sourceStudents.map(s => {
        const k = String(s.nisn || '').trim();
        return {
          ...s,
          _exportRoom: shuffledAlloc.assignedRoomByNisn.get(k) || `${roomPrefix} 1`,
          _exportSeat: shuffledAlloc.assignedSeatByNisn.get(k) || 0
        };
      });
      // Urutkan berdasarkan Ruang -> No. Urut Duduk agar urutan di Excel sudah terseling acak 7-8-9
      sourceStudents.sort((a, b) => {
        const rCmp = this.compareRoomNames(a._exportRoom, b._exportRoom);
        if (rCmp !== 0) return rCmp;
        return (a._exportSeat || 999999) - (b._exportSeat || 999999);
      });
    } else if (hasRealStudents) {
      sourceStudents = sourceStudents.map(s => ({
        ...s,
        _exportRoom: normalizeExamRoomDisplay(s.examRoom || ''),
        _exportSeat: Number(s.seatOrder) > 0 ? Number(s.seatOrder) : ''
      }));
      sourceStudents.sort((a, b) => {
        if (a._exportRoom && b._exportRoom) {
          const rCmp = this.compareRoomNames(a._exportRoom, b._exportRoom);
          if (rCmp !== 0) return rCmp;
          if (a._exportSeat && b._exportSeat) return a._exportSeat - b._exportSeat;
        } else if (a._exportRoom !== b._exportRoom) {
          return a._exportRoom ? -1 : 1;
        }
        const cmp = this.compareClassNames(a.class, b.class);
        if (cmp !== 0) return cmp;
        return String(a.name || '').localeCompare(String(b.name || ''), 'id');
      });
    } else {
      sourceStudents = sourceStudents.map(s => ({
        ...s,
        _exportRoom: s.examRoom || '',
        _exportSeat: s.seatOrder || ''
      }));
    }

    const rows = [
      ["TEMPLATE PEMBAGIAN RUANG UJIAN SISWA (CBT) - SMP NEGERI 2 PACET"],
      ["Petunjuk: Isi/ubah kolom 'Ruang Ujian' (misal: Ruang 1). Kolom 'No. Urut Duduk' mengatur urutan di Daftar Hadir & Kartu Ujian (jika dikosongkan, sistem menyeling acak kelas 7-8-9 otomatis)."],
      ["No", "NISN", "Nama Lengkap Siswa", "Kelas Asli", "Jenis Kelamin", "Ruang Ujian", "No. Urut Duduk"]
    ];

    sourceStudents.forEach((s, idx) => {
      const nisnStr = String(s.nisn || '').trim();
      rows.push([
        idx + 1,
        nisnStr,
        String(s.name || '').trim(),
        String(s.class || '').trim(),
        String(s.gender || '').trim(),
        s._exportRoom || '',
        s._exportSeat || ''
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Pastikan kolom NISN bertipe teks agar angka 0 di depan tidak hilang saat dibuka di Excel
    for (let r = 3; r < rows.length; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws[cellRef]) {
        ws[cellRef].t = 's';
        ws[cellRef].v = String(ws[cellRef].v || '');
        ws[cellRef].z = '@';
      }
    }

    ws['!cols'] = [
      { wch: 6 },
      { wch: 16 },
      { wch: 30 },
      { wch: 13 },
      { wch: 15 },
      { wch: 20 },
      { wch: 16 }
    ];

    const guideRows = [
      ["PANDUAN SINGKAT PENGISIAN RUANG UJIAN & URUTAN DUDUK"],
      [""],
      ["1. Jangan mengubah kolom NISN dan baris judul kolom (baris ke-3 pada sheet 'Atur Ruang Ujian')."],
      ["2. Kolom 'Kelas Asli' (misal 7A, 8B, 9C) dibiarkan apa adanya agar siswa tetap mendapat soal sesuai tingkat kelasnya."],
      ["3. Isi atau edit kolom 'Ruang Ujian', contoh: Ruang 1, Ruang 2, Ruang 3, atau Lab IPA."],
      ["4. Kolom 'No. Urut Duduk' (opsional) menentukan urutan peserta di Daftar Hadir & Kartu Ujian. Jika Anda memakai 'Unduh Sudah Diacak di Excel', urutannya sudah terseling acak (7-8-9 tidak berurutan per kelas)."],
      ["5. Jika kolom 'No. Urut Duduk' dikosongkan, Daftar Hadir otomatis menyeling kelas 7, 8, dan 9 agar 7A tidak berurutan."],
      ["6. Setelah selesai disimpan (.xlsx), buka menu Data Siswa -> Atur / Acak Ruang -> tab Template & Import Excel -> Upload file ini."]
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
    wsGuide['!cols'] = [{ wch: 105 }];

    XLSX.utils.book_append_sheet(wb, ws, "Atur Ruang Ujian");
    XLSX.utils.book_append_sheet(wb, wsGuide, "Panduan Singkat");

    const fileName = preShuffleRandom && hasRealStudents
      ? `Template_Ruang_Ujian_Teracak_${roomCount}Ruang.xlsx`
      : "Template_Atur_Ruang_Ujian_Siswa.xlsx";
    XLSX.writeFile(wb, fileName);

    return { success: true, count: sourceStudents.length, preShuffleRandom, fileName };
  }

  importRoomAssignmentsFromExcel(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      return { success: false, message: "Pustaka SheetJS tidak tersedia." };
    }
    if (!Array.isArray(this.students) || this.students.length === 0) {
      return {
        success: false,
        message: "Belum ada data siswa di aplikasi. Silakan impor data siswa lengkap terlebih dahulu."
      };
    }

    try {
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      if (!rows || rows.length < 2) {
        return { success: false, message: "File Excel kosong atau tidak memiliki baris data." };
      }

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(12, rows.length); i++) {
        const rowCells = (rows[i] || []).map(c => String(c || '').toLowerCase().trim());
        const hasNisnCol = rowCells.some(c => c.includes('nisn'));
        const hasNameAndRoom = rowCells.some(c => c.includes('nama')) && rowCells.some(c => c.includes('ruang') || c.includes('room'));
        if (hasNisnCol || hasNameAndRoom) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return {
          success: false,
          message: "Baris judul kolom tidak ditemukan. Pastikan menggunakan Template Excel Ruang Ujian (memiliki kolom NISN dan Ruang Ujian)."
        };
      }

      const headerRow = (rows[headerRowIndex] || []).map(c => String(c || '').toLowerCase().trim());
      const nisnIdx = headerRow.findIndex(h => h.includes('nisn'));
      const nameIdx = headerRow.findIndex(h => h.includes('nama'));
      const classIdx = headerRow.findIndex(h => h.includes('kelas'));
      const roomIdx = headerRow.findIndex(h => h.includes('ruang') || h.includes('room'));
      const seatIdx = (() => {
        const direct = headerRow.findIndex(h => h.includes('kursi') || h.includes('duduk') || h.includes('seat'));
        if (direct >= 0) return direct;
        return headerRow.findIndex((h, idx) => idx > 0 && h.includes('urut') && h !== 'no' && h !== 'no.');
      })();

      if (roomIdx === -1) {
        return {
          success: false,
          message: "Kolom 'Ruang Ujian' tidak ditemukan di file Excel. Gunakan Template Ruang Ujian agar kolomnya sesuai."
        };
      }
      if (nisnIdx === -1 && nameIdx === -1) {
        return {
          success: false,
          message: "Kolom 'NISN' atau 'Nama' tidak ditemukan untuk mencocokkan siswa."
        };
      }

      const normalizeName = (val) => String(val || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const normalizeClass = (val) => String(val || '').replace(/[\s_-]+/g, '').trim().toUpperCase();
      const stripZero = (val) => String(val || '').trim().replace(/^0+/, '');

      const exactNisnMap = new Map();
      const noZeroNisnMap = new Map();
      const noZeroDupes = new Set();
      const nameClassMap = new Map();
      const nameOnlyMap = new Map();
      const nameDupes = new Set();

      this.students.forEach((s, idx) => {
        const nisn = String(s.nisn || '').trim();
        if (nisn) {
          exactNisnMap.set(nisn, idx);
          const nz = stripZero(nisn);
          if (nz) {
            if (noZeroNisnMap.has(nz)) noZeroDupes.add(nz);
            else noZeroNisnMap.set(nz, idx);
          }
        }
        const nKey = normalizeName(s.name);
        const cKey = normalizeClass(s.class);
        if (nKey) {
          if (cKey) nameClassMap.set(`${nKey}__${cKey}`, idx);
          if (nameOnlyMap.has(nKey)) nameDupes.add(nKey);
          else nameOnlyMap.set(nKey, idx);
        }
      });
      noZeroDupes.forEach(k => noZeroNisnMap.delete(k));
      nameDupes.forEach(k => nameOnlyMap.delete(k));

      const nextStudents = this.students.map(s => ({ ...s }));
      const matchedIndices = new Set();
      let matchedCount = 0;
      let assignedRoomCount = 0;
      let clearedCount = 0;
      let unmatchedCount = 0;
      const unmatchedSamples = [];

      const dataRows = rows.slice(headerRowIndex + 1);
      dataRows.forEach(row => {
        if (!row || row.length === 0) return;
        const rawNisn = nisnIdx >= 0 ? String(row[nisnIdx] == null ? '' : row[nisnIdx]).trim() : '';
        const rawName = nameIdx >= 0 ? String(row[nameIdx] == null ? '' : row[nameIdx]).trim() : '';
        const rawClass = classIdx >= 0 ? String(row[classIdx] == null ? '' : row[classIdx]).trim() : '';
        const rawRoom = row[roomIdx];
        const rawSeat = seatIdx >= 0 ? parseInt(row[seatIdx], 10) : NaN;

        if (!rawNisn && !rawName) return;

        let targetIdx = -1;
        if (rawNisn && exactNisnMap.has(rawNisn)) {
          targetIdx = exactNisnMap.get(rawNisn);
        } else if (rawNisn && noZeroNisnMap.has(stripZero(rawNisn))) {
          targetIdx = noZeroNisnMap.get(stripZero(rawNisn));
        } else if (rawName) {
          const nKey = normalizeName(rawName);
          const cKey = normalizeClass(rawClass);
          if (cKey && nameClassMap.has(`${nKey}__${cKey}`)) {
            targetIdx = nameClassMap.get(`${nKey}__${cKey}`);
          } else if (nameOnlyMap.has(nKey)) {
            targetIdx = nameOnlyMap.get(nKey);
          }
        }

        if (targetIdx === -1) {
          unmatchedCount++;
          if (unmatchedSamples.length < 5) {
            unmatchedSamples.push(rawName || rawNisn);
          }
          return;
        }

        const normalizedRoom = normalizeExamRoomDisplay(rawRoom);
        nextStudents[targetIdx].examRoom = normalizedRoom;
        nextStudents[targetIdx].seatOrder = (normalizedRoom && Number.isFinite(rawSeat) && rawSeat > 0) ? rawSeat : 0;
        matchedIndices.add(targetIdx);
        matchedCount++;
        if (normalizedRoom) assignedRoomCount++;
        else clearedCount++;
      });

      if (matchedIndices.size === 0) {
        return {
          success: false,
          message: "Tidak ada baris siswa di Excel yang cocok dengan NISN atau Nama siswa yang terdaftar."
        };
      }

      this.saveStudents(nextStudents);

      return {
        success: true,
        matchedCount: matchedIndices.size,
        updatedCount: matchedIndices.size,
        assignedRoomCount,
        clearedCount,
        unmatchedCount,
        unmatchedSamples,
        roomsSummary: this._summarizeRoomAllocations(nextStudents)
      };
    } catch (err) {
      console.error("Gagal impor ruang ujian Excel:", err);
      return { success: false, message: "Format file Excel tidak dapat dibaca: " + err.message };
    }
  }

  downloadExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert("Pustaka SheetJS belum termuat. Pastikan ada koneksi internet.");
      return;
    }

    const headers = [
      ["TEMPLATE PANGKALAN DATA PESERTA UJIAN SEKOLAH (CBT) - SMP NEGERI 2 PACET"],
      ["Petunjuk: Jangan ubah baris judul kolom di baris ke-3. Kolom Ruang Ujian bersifat opsional (isi misal: Ruang 1 jika siswa diacak lintas kelas 7-8-9)."],
      [
        "NISN (Wajib)",
        "Nama Lengkap Siswa (Wajib)",
        "Kelas / Rombel (Wajib)",
        "Tempat Lahir (Wajib)",
        "Tanggal Lahir (Wajib)",
        "Jenis Kelamin (Laki-laki / Perempuan)",
        "Alamat Lengkap Siswa (Wajib)",
        "Password Login Siswa (Bawaan: 123)",
        "Ruang Ujian (Opsional, misal: Ruang 1)"
      ],
      ["0081234501", "Ahmad Fauzan Pratama", "9A", "Mojokerto", "12 Januari 2011", "Laki-laki", "Ds. Pacet RT 02 RW 01, Kec. Pacet", "123", "Ruang 1"],
      ["0081234502", "Aisyah Putri Maharani", "9A", "Mojokerto", "24 Maret 2011", "Perempuan", "Ds. Claket RT 01 RW 03, Kec. Pacet", "123", "Ruang 2"],
      ["0081234503", "Bagus Setiawan", "8A", "Mojokerto", "05 Juli 2012", "Laki-laki", "Ds. Padusan RT 04 RW 02, Kec. Pacet", "123", "Ruang 1"],
      ["0081234504", "Cantika Dewi Anggraini", "8B", "Mojokerto", "18 Agustus 2012", "Perempuan", "Ds. Cembor RT 03 RW 01, Kec. Pacet", "123", "Ruang 2"],
      ["0081234505", "Dimas Arya Pangestu", "7A", "Mojokerto", "09 Februari 2013", "Laki-laki", "Ds. Kembangbelor RT 02 RW 02, Kec. Pacet", "123", "Ruang 1"]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);

    for (let r = 3; r < headers.length; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[cellRef]) {
        ws[cellRef].t = 's';
        ws[cellRef].v = String(ws[cellRef].v || '');
        ws[cellRef].z = '@';
      }
    }

    ws['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 14 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 },
      { wch: 36 },
      { wch: 18 },
      { wch: 22 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Daftar Siswa");
    XLSX.writeFile(wb, "Template_Daftar_Siswa_CBT_SMPN2Pacet.xlsx");
  }

  importFromExcel(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      return { success: false, message: "Pustaka SheetJS tidak tersedia." };
    }

    try {
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      if (!rows || rows.length < 3) {
        return { success: false, message: "File Excel kosong atau format tidak sesuai." };
      }

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowStr = (rows[i] || []).join(' ').toLowerCase();
        if (rowStr.includes('nisn')) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return { success: false, message: "Kolom 'NISN' tidak ditemukan pada file Excel!" };
      }

      const headerRow = (rows[headerRowIndex] || []).map(c => String(c || '').toLowerCase());
      const hasSplitColumns =
        headerRow.some(h => h.includes('tempat lahir')) ||
        headerRow.some(h => h.includes('tanggal lahir')) ||
        headerRow.length >= 8;
      const roomColIdx = headerRow.findIndex(h => h.includes('ruang'));

      const importedStudents = [];
      const dataRows = rows.slice(headerRowIndex + 1);

      dataRows.forEach(row => {
        if (!row || row.length === 0) return;
        const rawNisn = row[0];
        const rawName = row[1];
        const rawClass = row[2];

        if (!rawNisn || !rawName) return;

        let birthPlace = "Mojokerto";
        let birthDate = "15 Januari 2011";
        let rawJk, rawAddress, rawPass, rawRoom;

        if (hasSplitColumns) {
          birthPlace = row[3] ? String(row[3]).trim() : "Mojokerto";
          birthDate = row[4] ? String(row[4]).trim() : "15 Januari 2011";
          rawJk = row[5];
          rawAddress = row[6];
          rawPass = row[7];
          rawRoom = roomColIdx >= 0 ? row[roomColIdx] : row[8];
        } else {
          const parsedTtl = splitBirthPlaceDate(row[3]);
          birthPlace = parsedTtl.birthPlace;
          birthDate = parsedTtl.birthDate;
          rawJk = row[4];
          rawAddress = row[5];
          rawPass = row[6];
          rawRoom = roomColIdx >= 0 ? row[roomColIdx] : row[7];
        }

        importedStudents.push({
          nisn: String(rawNisn).trim(),
          name: String(rawName).trim(),
          class: rawClass ? String(rawClass).trim() : "9A",
          examRoom: normalizeExamRoomDisplay(rawRoom || ''),
          birthPlace,
          birthDate,
          birthPlaceDate: buildBirthPlaceDate(birthPlace, birthDate),
          gender: rawJk ? String(rawJk).trim() : "Laki-laki",
          address: rawAddress ? String(rawAddress).trim() : "Ds. Pacet, Kec. Pacet",
          password: rawPass ? String(rawPass).trim() : "123"
        });
      });

      if (importedStudents.length === 0) {
        return { success: false, message: "Tidak ada baris data siswa yang valid ditemukan." };
      }

      this.saveStudents(importedStudents);
      return { success: true, count: importedStudents.length };

    } catch (err) {
      console.error("Gagal parse Excel:", err);
      return { success: false, message: "Format Excel tidak dapat dibaca: " + err.message };
    }
  }

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
          logoCbt: parsed.logoCbt || ""
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
      logoCbt: ""
    };
  }

  escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  generateCardsHtml(list = this.students, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER", startIndex = 0) {
    if (!list || list.length === 0) {
      return '<div class="p-8 text-center text-slate-400 font-semibold">Belum ada data siswa untuk ditampilkan.</div>';
    }

    const cfg = this.getSchoolConfig();
    const logoLeftHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Kiri" style="width:24px; height:24px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:23px; height:23px; border-radius:4px; background:#1e3a8a; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:7.5px; flex-shrink:0;">DINAS</div>`;

    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo Kanan" style="width:24px; height:24px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:23px; height:23px; border-radius:50%; background:#059669; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:7.5px; flex-shrink:0;">SMP</div>`;

    const safeSubtitle = this.escapeHtml(cfg.schoolSubtitle || 'PEMERINTAH KABUPATEN MOJOKERTO — DINAS PENDIDIKAN');
    const safeSchoolName = this.escapeHtml(cfg.schoolName || 'SMP NEGERI 2 PACET');
    const safeExamTitle = this.escapeHtml(examTitle || 'UJIAN SEKOLAH BERBASIS KOMPUTER');
    const safeCity = this.escapeHtml(cfg.city || 'Pacet');
    const safeDate = this.escapeHtml(cfg.date || '');
    const safeHeadmaster = this.escapeHtml(cfg.headmasterName || '');
    const safeHeadmasterNip = this.escapeHtml(cfg.headmasterNip || '');

    return list.map((s, idx) => {
      const ttlDisplay = this.escapeHtml(buildBirthPlaceDate(s.birthPlace, s.birthDate, s.birthPlaceDate));
      const safeNisn = this.escapeHtml(s.nisn || '-');
      const safeName = this.escapeHtml(s.name || '-');
      const safeGender = this.escapeHtml(s.gender || 'Laki-laki');
      const safeClass = this.escapeHtml(s.class || '9A');
      const safeExamRoom = this.escapeHtml(normalizeExamRoomDisplay(s.examRoom || ''));
      const safeAddress = this.escapeHtml(s.address || 'Pacet, Mojokerto');
      const safePassword = this.escapeHtml(s.password || '123');
      const roomFooterHtml = safeExamRoom
        ? `<span style="color:#4338ca; font-weight:800;">Ruang: ${safeExamRoom}</span>`
        : `<span></span>`;

      return `
      <div class="exam-card-9x5" style="width:9.0cm; height:5.3cm; max-width:9.0cm; max-height:5.3cm; border:1.6px solid #0f172a; border-radius:8px; padding:5px 7px; background:#ffffff; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; font-family:'Plus Jakarta Sans', Arial, sans-serif; overflow:hidden; position:relative; page-break-inside:avoid; break-inside:avoid;">
        
        <!-- KOP SURAT KARTU UJIAN -->
        <div style="border-bottom:1.5px solid #0f172a; padding-bottom:2.5px; display:flex; align-items:center; justify-content:space-between; gap:5px;">
          ${logoLeftHtml}
          <div style="flex:1; text-align:center; min-width:0;">
            <div style="font-size:6.4px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.2px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeSubtitle}</div>
            <div style="font-size:8.8px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.2px; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeSchoolName}</div>
            <div style="font-size:6.6px; font-weight:800; color:#2563eb; text-transform:uppercase; letter-spacing:0.2px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">KARTU PESERTA ${safeExamTitle}</div>
          </div>
          ${logoRightHtml}
        </div>

        <!-- ISI DATA KARTU SISWA: NISN, NAMA, TTL, JENIS KELAMIN, ALAMAT -->
        <div style="display:flex; gap:5px; align-items:stretch; margin-top:2px; flex:1; min-height:0;">
          
          <div style="flex:1; min-width:0; color:#0f172a;">
            <table style="width:100%; border-collapse:collapse; font-size:7.4px; line-height:1.22;">
              <tr>
                <td style="width:52px; color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">NISN</td>
                <td style="width:6px; font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:900; color:#1d4ed8; font-family:monospace; font-size:8px; padding:0.5px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;">${safeNisn}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Nama</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; padding:0.5px 0;">${safeName}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">TTL</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="color:#1e293b; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; padding:0.5px 0;">${ttlDisplay}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">J. Kelamin</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="color:#1e293b; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; padding:0.5px 0;">${safeGender}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Kelas</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:800; color:#4338ca; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; padding:0.5px 0;">Kelas ${safeClass}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Alamat</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="color:#334155; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; padding:0.5px 0;">${safeAddress}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Password</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:900; color:#047857; font-family:monospace; font-size:7.8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px; padding:0.5px 0;">${safePassword}</td>
              </tr>
            </table>
          </div>

          <div style="width:72px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; flex-shrink:0;">
            <div style="width:42px; height:48px; border:1px dashed #64748b; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f8fafc; color:#94a3b8; font-size:6.8px; font-weight:700; text-align:center;">
              <span>FOTO</span>
              <span style="font-size:6px;">2 x 3</span>
            </div>
            
            <div style="text-align:center; font-size:5.9px; line-height:1.12; margin-top:2px; width:100%;">
              <div style="color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeCity}, ${safeDate}</div>
              <div style="font-weight:700; color:#0f172a;">Kepala Sekolah,</div>
              <div style="height:11px;"></div>
              <div style="font-weight:800; text-decoration:underline; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72px;">${safeHeadmaster}</div>
              <div style="color:#64748b; font-size:5.1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72px;">NIP. ${safeHeadmasterNip}</div>
            </div>
          </div>

        </div>

        <!-- FOOTER KARTU -->
        <div style="border-top:0.8px dashed #cbd5e1; padding-top:2px; display:flex; justify-content:space-between; align-items:center; font-size:6.1px; color:#64748b; font-weight:600;">
          ${roomFooterHtml}
          <span>No. Urut: ${startIndex + idx + 1}</span>
        </div>

      </div>
    `;
    }).join('');
  }

  getCardsFooterNote() {
    if (typeof window !== 'undefined' && window.cbtAdmin && typeof window.cbtAdmin.getPrintStampText === 'function') {
      return window.cbtAdmin.getPrintStampText();
    }
    const now = new Date();
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const d = now.getDate();
    const m = months[now.getMonth()];
    const y = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `Dokumen ini dicetak secara otomatis melalui sistem aplikasi CBT - Computer Based Test. pada ${d} ${m} ${y} pukul ${hh}:${mm} WIB.`;
  }

  buildPaginatedCardsPagesHtml(list, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER", options = {}) {
    const items = Array.isArray(list) ? list : [];
    const perPage = 8; // 2 kolom x 4 baris agar presisi di A4 dan tidak pernah terpotong
    const cfg = this.getSchoolConfig();
    const safeSchoolName = this.escapeHtml(cfg.schoolName || 'SMP NEGERI 2 PACET');
    const safeStamp = this.escapeHtml(this.getCardsFooterNote());

    const explicitClass = options && options.classLabel ? String(options.classLabel).trim() : '';
    const explicitRoom = options && options.roomLabel ? String(options.roomLabel).trim() : '';
    const shouldGroupByRoom = Boolean(!explicitClass && !explicitRoom && options && options.groupByRoom && items.length > 0);
    const shouldGroupByClass = Boolean(!explicitClass && !explicitRoom && !shouldGroupByRoom && options && options.groupByClass !== false && items.length > 0);

    let sections = [];
    if (shouldGroupByRoom) {
      const grouped = new Map();
      items.forEach(s => {
        const rm = normalizeExamRoomDisplay(s.examRoom) || 'Belum Diatur Ruang';
        if (!grouped.has(rm)) grouped.set(rm, []);
        grouped.get(rm).push(s);
      });
      const sortedRoomKeys = Array.from(grouped.keys()).sort((a, b) => this.compareRoomNames(a, b));
      sections = sortedRoomKeys.map(rm => ({
        sectionPrefix: `${this.escapeHtml(rm)} &bull; `,
        students: this.sortRoomStudents(grouped.get(rm))
      }));
    } else if (shouldGroupByClass) {
      const grouped = new Map();
      items.forEach(s => {
        const cls = String(s.class || 'Umum').trim() || 'Umum';
        if (!grouped.has(cls)) grouped.set(cls, []);
        grouped.get(cls).push(s);
      });
      const sortedClassKeys = Array.from(grouped.keys()).sort((a, b) => this.compareClassNames(a, b));
      sections = sortedClassKeys.map(cls => ({
        sectionPrefix: `Kelas ${this.escapeHtml(cls)} &bull; `,
        students: grouped.get(cls)
      }));
    } else {
      const lbl = explicitRoom
        ? `${this.escapeHtml(explicitRoom)} &bull; `
        : (explicitClass ? `Kelas ${this.escapeHtml(explicitClass)} &bull; ` : '');
      sections = [{
        sectionPrefix: lbl,
        students: items
      }];
    }

    const totalPagesAll = sections.reduce((sum, sec) => sum + Math.max(1, Math.ceil(sec.students.length / perPage)), 0);
    const pages = [];
    let globalPageIndex = 0;

    sections.forEach(sec => {
      const secItems = sec.students;
      const secPages = Math.max(1, Math.ceil(secItems.length / perPage));
      const classPrefix = sec.sectionPrefix || '';

      for (let p = 0; p < secPages; p++) {
        const startIndex = p * perPage;
        const chunk = secItems.slice(startIndex, startIndex + perPage);
        const cardsHtml = this.generateCardsHtml(chunk, examTitle, startIndex);
        const pageBadge = secPages > 1 ? ` &bull; Halaman ${p + 1} dari ${secPages}` : '';
        const isLastPageOverall = globalPageIndex === totalPagesAll - 1;
        const breakStyle = !isLastPageOverall ? 'page-break-after:always; break-after:page;' : '';

        pages.push(`
          <div class="cbt-cards-page-sheet" style="width:210mm; margin:0 auto; padding:6mm 10mm; box-sizing:border-box; font-family:'Plus Jakarta Sans', Arial, sans-serif; background:#ffffff; color:#0f172a; ${breakStyle}">
            <div style="text-align:center; border-bottom:1.8px solid #0f172a; padding-bottom:4px; margin-bottom:7px;">
              <h2 style="font-size:12px; font-weight:900; margin:0; text-transform:uppercase; color:#0f172a;">${safeSchoolName} &mdash; KARTU PESERTA UJIAN SEKOLAH (CBT)</h2>
              <p style="font-size:8.5px; color:#64748b; margin:2px 0 0 0;">${classPrefix}Total: ${secItems.length} Peserta${pageBadge}</p>
            </div>
            <div class="cards-grid-print" style="display:grid; grid-template-columns: repeat(2, 9.0cm); justify-content:center; gap:4.5mm 6mm;">
              ${cardsHtml}
            </div>
            <div class="cbt-print-footer-note" style="margin-top:8px; padding-top:3px; border-top:0.5px solid #cbd5e1; font-size:8px; color:#1d4ed8; font-style:italic; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeStamp}</div>
          </div>
        `);
        globalPageIndex++;
      }
    });

    return pages;
  }

  printExamCards(studentsToPrint, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER", options = {}) {
    const printArea = document.getElementById('printableCardsArea');
    if (!printArea) return;

    const list = studentsToPrint || this.students;
    if (list.length === 0) {
      alert("Belum ada data siswa untuk dicetak kartu ujiannya.");
      return;
    }

    const pagesHtml = this.buildPaginatedCardsPagesHtml(list, examTitle, options);
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

  async downloadCardsPdf(studentsToPrint, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER", options = {}) {
    const list = studentsToPrint || this.students;
    if (list.length === 0) {
      alert("Belum ada data siswa untuk di-download kartu ujiannya.");
      return;
    }

    if (typeof html2pdf === 'undefined') {
      this.printExamCards(list, examTitle, options);
      return;
    }

    const cfg = this.getSchoolConfig();
    const pagesHtml = this.buildPaginatedCardsPagesHtml(list, examTitle, options);
    const schoolSlug = (cfg.schoolName || 'SMPN2Pacet').replace(/\s+/g, '_');
    const classLabel = options && options.classLabel ? String(options.classLabel).trim() : '';
    const roomLabel = options && options.roomLabel ? String(options.roomLabel).trim() : '';
    const scopeSlug = roomLabel
      ? `Ruang_${roomLabel.replace(/[^a-zA-Z0-9_-]+/g, '_')}`
      : (classLabel
        ? `Kelas_${classLabel.replace(/[^a-zA-Z0-9_-]+/g, '_')}`
        : 'Semua_Peserta');
    const filename = `Kartu_Peserta_CBT_${scopeSlug}_${schoolSlug}_${Date.now()}.pdf`;
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
      console.error("Gagal download PDF kartu peserta:", err);
      this.printExamCards(list, examTitle, options);
    } finally {
      window.scrollTo(prevScrollX, prevScrollY);
    }
  }

  async downloadCardsPerClassSeparatePdfs(studentsList, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER", onProgress) {
    const list = Array.isArray(studentsList) && studentsList.length > 0 ? studentsList : this.students;
    if (list.length === 0) {
      alert("Belum ada data siswa untuk di-download kartu ujiannya.");
      return;
    }

    const grouped = new Map();
    list.forEach(s => {
      const cls = String(s.class || 'Umum').trim() || 'Umum';
      if (!grouped.has(cls)) grouped.set(cls, []);
      grouped.get(cls).push(s);
    });
    const sortedClasses = Array.from(grouped.keys()).sort((a, b) => this.compareClassNames(a, b));

    for (let i = 0; i < sortedClasses.length; i++) {
      const cls = sortedClasses[i];
      if (typeof onProgress === 'function') {
        onProgress(i + 1, sortedClasses.length, cls);
      }
      await this.downloadCardsPdf(grouped.get(cls), examTitle, { classLabel: cls, groupByClass: false });
      if (i < sortedClasses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 450));
      }
    }
  }

  async downloadCardsPerRoomSeparatePdfs(studentsList, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER", onProgress) {
    const list = Array.isArray(studentsList) && studentsList.length > 0 ? studentsList : this.students;
    if (list.length === 0) {
      alert("Belum ada data siswa untuk di-download kartu ujiannya.");
      return;
    }

    const grouped = new Map();
    const displayMap = new Map();
    list.forEach(s => {
      const rm = normalizeExamRoomDisplay(s.examRoom) || 'Belum_Diatur_Ruang';
      const k = normalizeExamRoomKey(rm) || rm;
      if (!grouped.has(k)) {
        grouped.set(k, []);
        displayMap.set(k, rm);
      }
      grouped.get(k).push(s);
    });
    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => this.compareRoomNames(displayMap.get(a), displayMap.get(b)));

    for (let i = 0; i < sortedKeys.length; i++) {
      const key = sortedKeys[i];
      const disp = displayMap.get(key);
      if (typeof onProgress === 'function') {
        onProgress(i + 1, sortedKeys.length, disp);
      }
      await this.downloadCardsPdf(grouped.get(key), examTitle, { roomLabel: disp, groupByClass: false });
      if (i < sortedKeys.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 450));
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.studentManager = new StudentManager();
}
