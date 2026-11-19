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

    return {
      nisn: String(s.nisn || '').trim(),
      name: String(s.name || '').trim(),
      class: String(s.class || '9A').trim(),
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

    // Mode Guru Mapel: hanya simpan daftar nama/kelas tanpa password di sessionStorage/memori
    try { localStorage.removeItem('cbt_students_list'); } catch (e) {}
    if (this._hasStaffSession()) {
      try {
        const cachedRoster = sessionStorage.getItem('cbt_guru_roster_cache');
        if (cachedRoster) {
          const parsed = JSON.parse(cachedRoster);
          if (Array.isArray(parsed)) {
            return parsed.map(s => ({
              nisn: String(s.nisn || '').trim(),
              name: String(s.name || '').trim(),
              class: String(s.class || 'Umum').trim()
            }));
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
      this.students = list.map(s => ({
        nisn: String(s.nisn || '').trim(),
        name: String(s.name || '').trim(),
        class: String(s.class || 'Umum').trim()
      }));
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
        class: String(student.class || 'Umum').trim()
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
            class: String(rpcRes.student.class || 'Umum').trim()
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
            class: String(s.class || 'Umum').trim()
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
      return { found: true, name: localMatch.name, class: localMatch.class };
    }

    if (typeof window !== 'undefined' && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
      if (typeof window.supabaseSync.lookupStudentHintRpc === 'function' && !window.supabaseSync.securityRpcMissing) {
        const res = await window.supabaseSync.lookupStudentHintRpc(cleanNisn);
        if (res && res.found) {
          return { found: true, name: res.name, class: res.class };
        }
        if (res && !res.rpcUnavailable) {
          return { found: false };
        }
      }

      if (Array.isArray(this._hintMemoryList)) {
        const cached = this._hintMemoryList.find(s => s.nisn === cleanNisn);
        return cached ? { found: true, name: cached.name, class: cached.class } : { found: false };
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
            class: String(s.class || 'Umum').trim()
          }));
          const found = this._hintMemoryList.find(s => s.nisn === cleanNisn);
          return found ? { found: true, name: found.name, class: found.class } : { found: false };
        }
      }
    }

    const offlineMatch = this._getOfflineCandidateStudents().find(s => s.nisn === cleanNisn);
    return offlineMatch ? { found: true, name: offlineMatch.name, class: offlineMatch.class } : { found: false };
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

    this.students.push({
      nisn: cleanNisn,
      name: String(studentData.name || "").trim(),
      class: studentData.class ? String(studentData.class).trim() : "9A",
      birthPlace,
      birthDate,
      birthPlaceDate: buildBirthPlaceDate(birthPlace, birthDate),
      gender: studentData.gender ? String(studentData.gender).trim() : "Laki-laki",
      address: studentData.address ? String(studentData.address).trim() : "Ds. Pacet, Kec. Pacet",
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
        return {
          ...s,
          name: updatedData.name ? String(updatedData.name).trim() : s.name,
          class: updatedData.class ? String(updatedData.class).trim() : s.class,
          birthPlace: nextPlace,
          birthDate: nextDate,
          birthPlaceDate: buildBirthPlaceDate(nextPlace, nextDate, updatedData.birthPlaceDate || s.birthPlaceDate),
          gender: updatedData.gender ? String(updatedData.gender).trim() : s.gender,
          address: updatedData.address ? String(updatedData.address).trim() : s.address,
          password: updatedData.password ? String(updatedData.password).trim() : s.password
        };
      }
      return s;
    });
    this.saveStudents(this.students);
    return { success: true };
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

  downloadExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert("Pustaka SheetJS belum termuat. Pastikan ada koneksi internet.");
      return;
    }

    const headers = [
      ["TEMPLATE PANGKALAN DATA PESERTA UJIAN SEKOLAH (CBT) - SMP NEGERI 2 PACET"],
      ["Petunjuk: Jangan ubah baris judul kolom di baris ke-3. Kolom Tempat Lahir & Tanggal Lahir terpisah. Isi data siswa mulai baris ke-4."],
      [
        "NISN (Wajib)",
        "Nama Lengkap Siswa (Wajib)",
        "Kelas / Rombel (Wajib)",
        "Tempat Lahir (Wajib)",
        "Tanggal Lahir (Wajib)",
        "Jenis Kelamin (Laki-laki / Perempuan)",
        "Alamat Lengkap Siswa (Wajib)",
        "Password Login Siswa (Bawaan: 123)"
      ],
      ["0081234501", "Ahmad Fauzan Pratama", "9A", "Mojokerto", "12 Januari 2011", "Laki-laki", "Ds. Pacet RT 02 RW 01, Kec. Pacet", "123"],
      ["0081234502", "Aisyah Putri Maharani", "9A", "Mojokerto", "24 Maret 2011", "Perempuan", "Ds. Claket RT 01 RW 03, Kec. Pacet", "123"],
      ["0081234503", "Bagus Setiawan", "8A", "Mojokerto", "05 Juli 2012", "Laki-laki", "Ds. Padusan RT 04 RW 02, Kec. Pacet", "123"],
      ["0081234504", "Cantika Dewi Anggraini", "8B", "Mojokerto", "18 Agustus 2012", "Perempuan", "Ds. Cembor RT 03 RW 01, Kec. Pacet", "123"],
      ["0081234505", "Dimas Arya Pangestu", "7A", "Mojokerto", "09 Februari 2013", "Laki-laki", "Ds. Kembangbelor RT 02 RW 02, Kec. Pacet", "123"]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);

    ws['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 14 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 },
      { wch: 36 },
      { wch: 18 }
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
        let rawJk, rawAddress, rawPass;

        if (hasSplitColumns) {
          birthPlace = row[3] ? String(row[3]).trim() : "Mojokerto";
          birthDate = row[4] ? String(row[4]).trim() : "15 Januari 2011";
          rawJk = row[5];
          rawAddress = row[6];
          rawPass = row[7];
        } else {
          const parsedTtl = splitBirthPlaceDate(row[3]);
          birthPlace = parsedTtl.birthPlace;
          birthDate = parsedTtl.birthDate;
          rawJk = row[4];
          rawAddress = row[5];
          rawPass = row[6];
        }

        importedStudents.push({
          nisn: String(rawNisn).trim(),
          name: String(rawName).trim(),
          class: rawClass ? String(rawClass).trim() : "9A",
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
      const safeAddress = this.escapeHtml(s.address || 'Pacet, Mojokerto');
      const safePassword = this.escapeHtml(s.password || '123');

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
        <div style="border-top:0.8px dashed #cbd5e1; padding-top:2px; display:flex; justify-content:flex-end; font-size:6.1px; color:#64748b; font-weight:600;">
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
    const shouldGroupByClass = Boolean(!explicitClass && options && options.groupByClass !== false && items.length > 0);

    let sections = [];
    if (shouldGroupByClass) {
      const grouped = new Map();
      items.forEach(s => {
        const cls = String(s.class || 'Umum').trim() || 'Umum';
        if (!grouped.has(cls)) grouped.set(cls, []);
        grouped.get(cls).push(s);
      });
      const sortedClassKeys = Array.from(grouped.keys()).sort((a, b) => this.compareClassNames(a, b));
      sections = sortedClassKeys.map(cls => ({
        classLabel: cls,
        students: grouped.get(cls)
      }));
    } else {
      sections = [{
        classLabel: explicitClass,
        students: items
      }];
    }

    const totalPagesAll = sections.reduce((sum, sec) => sum + Math.max(1, Math.ceil(sec.students.length / perPage)), 0);
    const pages = [];
    let globalPageIndex = 0;

    sections.forEach(sec => {
      const secItems = sec.students;
      const secPages = Math.max(1, Math.ceil(secItems.length / perPage));
      const classPrefix = sec.classLabel ? `Kelas ${this.escapeHtml(sec.classLabel)} &bull; ` : '';

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
            <div class="cbt-print-footer-note" style="margin-top:8px; padding-top:3px; border-top:0.5px solid #cbd5e1; font-size:8px; color:#1d4ed8; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeStamp}</div>
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
    const scopeSlug = classLabel
      ? `Kelas_${classLabel.replace(/[^a-zA-Z0-9_-]+/g, '_')}`
      : 'Semua_Kelas';
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
}

if (typeof window !== 'undefined') {
  window.studentManager = new StudentManager();
}
