// Data Manajemen Siswa Peserta Ujian (Kapasitas 250+ Siswa)
// Mendukung Impor Excel (.xlsx), Format Kartu Presisi 9,0 x 5,3 cm dengan Kop Surat, & Autentikasi NISN + Password

const SAMPLE_INITIAL_STUDENTS = [
  { nisn: "0081234501", name: "Ahmad Fauzan Pratama", class: "9A", birthPlaceDate: "Mojokerto, 12 Januari 2011", gender: "Laki-laki", address: "Ds. Pacet RT 02 RW 01, Kec. Pacet", password: "123" },
  { nisn: "0081234502", name: "Aisyah Putri Maharani", class: "9A", birthPlaceDate: "Mojokerto, 24 Maret 2011", gender: "Perempuan", address: "Ds. Claket RT 01 RW 03, Kec. Pacet", password: "123" },
  { nisn: "0081234503", name: "Bagus Setiawan", class: "9A", birthPlaceDate: "Mojokerto, 05 Juli 2011", gender: "Laki-laki", address: "Ds. Padusan RT 04 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234504", name: "Cantika Dewi Anggraini", class: "9A", birthPlaceDate: "Mojokerto, 18 Agustus 2011", gender: "Perempuan", address: "Ds. Cembor RT 03 RW 01, Kec. Pacet", password: "123" },
  { nisn: "0081234505", name: "Dimas Arya Pangestu", class: "9A", birthPlaceDate: "Mojokerto, 09 Februari 2011", gender: "Laki-laki", address: "Ds. Kembangbelor RT 02 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234506", name: "Eka Nur Safitri", class: "9B", birthPlaceDate: "Mojokerto, 15 September 2011", gender: "Perempuan", address: "Ds. Nogosari RT 01 RW 01, Kec. Pacet", password: "123" },
  { nisn: "0081234507", name: "Farhan Maulana", class: "9B", birthPlaceDate: "Mojokerto, 30 Mei 2011", gender: "Laki-laki", address: "Ds. Sajen RT 05 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234508", name: "Gita Permatasari", class: "9B", birthPlaceDate: "Mojokerto, 11 Oktober 2011", gender: "Perempuan", address: "Ds. Petak RT 02 RW 03, Kec. Pacet", password: "123" },
  { nisn: "0081234509", name: "Hafizh Al-Rasyid", class: "9B", birthPlaceDate: "Mojokerto, 22 April 2011", gender: "Laki-laki", address: "Ds. Pacet Selatan RT 03 RW 04, Kec. Pacet", password: "123" },
  { nisn: "0081234510", name: "Intan Berlian", class: "9C", birthPlaceDate: "Mojokerto, 03 Juni 2011", gender: "Perempuan", address: "Ds. Bendunganjati RT 01 RW 02, Kec. Pacet", password: "123" },
  { nisn: "0081234511", name: "Joko Supriyanto", class: "9C", birthPlaceDate: "Mojokerto, 19 November 2010", gender: "Laki-laki", address: "Ds. Wotanmas Jedong RT 03 RW 01, Kec. Ngoro", password: "123" },
  { nisn: "0081234512", name: "Khansa Nabila", class: "9C", birthPlaceDate: "Mojokerto, 28 Desember 2011", gender: "Perempuan", address: "Ds. Kesimantengah RT 02 RW 01, Kec. Pacet", password: "123" }
];

class StudentManager {
  constructor() {
    this.students = this.loadStudents();
  }

  loadStudents() {
    const saved = localStorage.getItem('cbt_students_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s, idx) => ({
            nisn: String(s.nisn || '').trim(),
            name: String(s.name || '').trim(),
            class: String(s.class || '9A').trim(),
            birthPlaceDate: s.birthPlaceDate || "Mojokerto, 10 Mei 2011",
            gender: s.gender || (idx % 2 === 0 ? "Laki-laki" : "Perempuan"),
            address: s.address || "Ds. Pacet, Kec. Pacet, Mojokerto",
            password: s.password ? String(s.password).trim() : "123"
          }));
        }
      } catch (e) {
        console.error("Gagal load students:", e);
      }
    }
    localStorage.setItem('cbt_students_list', JSON.stringify(SAMPLE_INITIAL_STUDENTS));
    return [...SAMPLE_INITIAL_STUDENTS];
  }

  saveStudents(studentsList) {
    this.students = studentsList;
    localStorage.setItem('cbt_students_list', JSON.stringify(this.students));
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

  getAllClasses() {
    const classSet = new Set();
    this.students.forEach(s => {
      if (s.class) classSet.add(String(s.class).trim());
    });
    return Array.from(classSet).sort();
  }

  authenticateStudent(nisn, password) {
    const cleanNisn = String(nisn || "").trim();
    const cleanPass = String(password || "").trim();
    
    const student = this.students.find(s => String(s.nisn).trim() === cleanNisn);
    if (!student) {
      return { success: false, message: "NISN tidak terdaftar di pangkalan data SMP NEGERI 2 PACET!" };
    }

    if (student.password && String(student.password).trim() !== cleanPass) {
      return { success: false, message: "Password akun siswa salah! Silakan periksa kartu peserta ujian Anda." };
    }

    return { success: true, student };
  }

  addStudent(studentData) {
    const cleanNisn = String(studentData.nisn || "").trim();
    if (!cleanNisn) return { success: false, message: "NISN wajib diisi!" };

    const exists = this.students.some(s => String(s.nisn).trim() === cleanNisn);
    if (exists) {
      return { success: false, message: `Siswa dengan NISN ${cleanNisn} sudah terdaftar!` };
    }

    this.students.push({
      nisn: cleanNisn,
      name: String(studentData.name || "").trim(),
      class: studentData.class ? String(studentData.class).trim() : "9A",
      birthPlaceDate: studentData.birthPlaceDate ? String(studentData.birthPlaceDate).trim() : "Mojokerto, 15 Januari 2011",
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
        return {
          ...s,
          name: updatedData.name ? String(updatedData.name).trim() : s.name,
          class: updatedData.class ? String(updatedData.class).trim() : s.class,
          birthPlaceDate: updatedData.birthPlaceDate ? String(updatedData.birthPlaceDate).trim() : s.birthPlaceDate,
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
      (s.address && s.address.toLowerCase().includes(q))
    );
  }

  generate250DemoStudents() {
    const classes = ["9A", "9B", "9C", "9D", "9E", "9F", "9G", "9H"];
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
      
      const birthDay = (i % 28) + 1;
      const birthMonth = months[(i % 12)];
      const birthYear = 2011;
      const birthPlaceDate = `Mojokerto, ${birthDay} ${birthMonth} ${birthYear}`;
      const address = villages[(i % villages.length)];

      generated.push({
        nisn: `0081234${padNum}`,
        name: `${fName} ${lName} (${padNum})`,
        class: assignedClass,
        birthPlaceDate: birthPlaceDate,
        gender: gender,
        address: address,
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
      ["Petunjuk: Jangan ubah baris judul kolom di baris ke-3. Isi data siswa mulai baris ke-4. Semua kolom wajib diisi."],
      [
        "NISN (Wajib)",
        "Nama Lengkap Siswa (Wajib)",
        "Kelas / Rombel (Wajib)",
        "Tempat Tanggal Lahir (Wajib)",
        "Jenis Kelamin (Laki-laki / Perempuan)",
        "Alamat Lengkap Siswa (Wajib)",
        "Password Login Siswa (Bawaan: 123)"
      ],
      ["0081234501", "Ahmad Fauzan Pratama", "9A", "Mojokerto, 12 Januari 2011", "Laki-laki", "Ds. Pacet RT 02 RW 01, Kec. Pacet", "123"],
      ["0081234502", "Aisyah Putri Maharani", "9A", "Mojokerto, 24 Maret 2011", "Perempuan", "Ds. Claket RT 01 RW 03, Kec. Pacet", "123"],
      ["0081234503", "Bagus Setiawan", "9B", "Mojokerto, 05 Juli 2011", "Laki-laki", "Ds. Padusan RT 04 RW 02, Kec. Pacet", "123"],
      ["0081234504", "Cantika Dewi Anggraini", "9B", "Mojokerto, 18 Agustus 2011", "Perempuan", "Ds. Cembor RT 03 RW 01, Kec. Pacet", "123"],
      ["0081234505", "Dimas Arya Pangestu", "9C", "Mojokerto, 09 Februari 2011", "Laki-laki", "Ds. Kembangbelor RT 02 RW 02, Kec. Pacet", "123"]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);

    ws['!cols'] = [
      { wch: 18 },
      { wch: 30 },
      { wch: 14 },
      { wch: 30 },
      { wch: 18 },
      { wch: 38 },
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
      
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
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

      const importedStudents = [];
      const dataRows = rows.slice(headerRowIndex + 1);

      dataRows.forEach(row => {
        if (!row || row.length === 0) return;
        const rawNisn = row[0];
        const rawName = row[1];
        const rawClass = row[2];
        const rawTtl = row[3];
        const rawJk = row[4];
        const rawAddress = row[5];
        const rawPass = row[6];

        if (rawNisn && rawName) {
          importedStudents.push({
            nisn: String(rawNisn).trim(),
            name: String(rawName).trim(),
            class: rawClass ? String(rawClass).trim() : "9A",
            birthPlaceDate: rawTtl ? String(rawTtl).trim() : "Mojokerto, 15 Januari 2011",
            gender: rawJk ? String(rawJk).trim() : "Laki-laki",
            address: rawAddress ? String(rawAddress).trim() : "Ds. Pacet, Kec. Pacet",
            password: rawPass ? String(rawPass).trim() : "123"
          });
        }
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
          city: parsed.city || "Pacet",
          date: parsed.date || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
          headmasterName: parsed.headmasterName || "Drs. H. Mulyono, M.Pd.",
          headmasterNip: parsed.headmasterNip || "19680512 199403 1 004",
          logoLeft: parsed.logoLeft || "",
          logoRight: parsed.logoRight || ""
        };
      }
    } catch (e) {}

    return {
      schoolName: "SMP NEGERI 2 PACET",
      city: "Pacet",
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      headmasterName: "Drs. H. Mulyono, M.Pd.",
      headmasterNip: "19680512 199403 1 004",
      logoLeft: "",
      logoRight: ""
    };
  }

  generateCardsHtml(list = this.students, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER") {
    if (!list || list.length === 0) {
      return '<div class="p-8 text-center text-slate-400 font-semibold">Belum ada data siswa untuk ditampilkan.</div>';
    }

    const cfg = this.getSchoolConfig();
    const logoLeftHtml = cfg.logoLeft 
      ? `<img src="${cfg.logoLeft}" alt="Logo" style="width:26px; height:26px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:24px; height:24px; border-radius:4px; background:#1e3a8a; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:9px; flex-shrink:0;">CBT</div>`;

    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo" style="width:26px; height:26px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:24px; height:24px; border-radius:50%; background:#059669; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:8px; flex-shrink:0;">SMP</div>`;

    return list.map((s, idx) => `
      <div class="exam-card-9x5" style="width:9.0cm; height:5.3cm; max-width:9.0cm; max-height:5.3cm; border:1.8px solid #0f172a; border-radius:8px; padding:6px 8px; background:#ffffff; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; font-family:'Plus Jakarta Sans', Arial, sans-serif; overflow:hidden; position:relative; page-break-inside:avoid; break-inside:avoid;">
        
        <!-- KOP SURAT KARTU UJIAN -->
        <div style="border-bottom:1.5px solid #0f172a; padding-bottom:3px; display:flex; align-items:center; justify-content:between; gap:6px;">
          ${logoLeftHtml}
          <div style="flex:1; text-align:center; min-width:0;">
            <div style="font-size:7.5px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.3px; line-height:1.1;">PEMERINTAH KABUPATEN MOJOKERTO</div>
            <div style="font-size:9.5px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.2px; line-height:1.15;">${cfg.schoolName}</div>
            <div style="font-size:7.5px; font-weight:800; color:#2563eb; text-transform:uppercase; letter-spacing:0.3px; line-height:1.1;">KARTU PESERTA ${examTitle} (CBT)</div>
          </div>
          ${logoRightHtml}
        </div>

        <!-- ISI DATA KARTU SISWA: NISN, NAMA, TTL, JENIS KELAMIN, ALAMAT -->
        <div style="display:flex; gap:6px; align-items:flex-start; margin-top:3px; flex:1; min-height:0;">
          
          <!-- Sisi Kiri: Biodata Siswa Format Resmi -->
          <div style="flex:1; min-width:0; font-size:8.2px; line-height:1.35; color:#0f172a;">
            <table style="width:100%; border-collapse:collapse; font-size:8px;">
              <tr>
                <td style="width:58px; color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">NISN</td>
                <td style="width:6px; font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:900; color:#1d4ed8; font-family:monospace; font-size:8.5px; padding:0.5px 0;">${s.nisn}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Nama</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:125px; padding:0.5px 0;">${s.name}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">TTL</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="color:#1e293b; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:125px; padding:0.5px 0;">${s.birthPlaceDate || '-'}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Jenis Kelamin</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="color:#1e293b; font-weight:700; padding:0.5px 0;">${s.gender || 'Laki-laki'}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Kelas / Rombel</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:800; color:#4338ca; padding:0.5px 0;">Kelas ${s.class || '9A'}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Alamat</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="color:#334155; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:125px; padding:0.5px 0;">${s.address || 'Pacet, Mojokerto'}</td>
              </tr>
              <tr>
                <td style="color:#475569; font-weight:600; padding:0.5px 0; white-space:nowrap;">Password Login</td>
                <td style="font-weight:700; padding:0.5px 0;">:</td>
                <td style="font-weight:900; color:#047857; font-family:monospace; padding:0.5px 0;">${s.password || '123'}</td>
              </tr>
            </table>
          </div>

          <!-- Sisi Kanan: Foto 2x3 & Blok Pengesahan Kepala Sekolah -->
          <div style="width:72px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; flex-shrink:0;">
            <div style="width:48px; height:58px; border:1px dashed #64748b; border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f8fafc; color:#94a3b8; font-size:7px; font-weight:700; text-align:center;">
              <span>FOTO</span>
              <span style="font-size:6.5px;">2 x 3</span>
            </div>
            
            <div style="text-align:center; font-size:6.5px; line-height:1.1; margin-top:2px; width:100%;">
              <div style="color:#475569;">${cfg.city}, ${cfg.date}</div>
              <div style="font-weight:700; color:#0f172a;">Kepala Sekolah,</div>
              <div style="height:14px;"></div>
              <div style="font-weight:800; text-decoration:underline; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72px;">${cfg.headmasterName}</div>
              <div style="color:#64748b; font-size:5.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72px;">NIP. ${cfg.headmasterNip}</div>
            </div>
          </div>

        </div>

        <!-- FOOTER KARTU (UKURAN PRESISI 9,0 x 5,3 CM) -->
        <div style="border-top:0.8px dashed #cbd5e1; padding-top:2px; display:flex; justify-content:space-between; font-size:6.5px; color:#64748b; font-weight:600;">
          <span>Ruang: Lab / HP • Ukuran: 9,0 x 5,3 cm</span>
          <span>No. Urut: ${idx + 1}</span>
        </div>

      </div>
    `).join('');
  }

  printExamCards(studentsToPrint, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER") {
    const printArea = document.getElementById('printableCardsArea');
    if (!printArea) return;

    const list = studentsToPrint || this.students;
    if (list.length === 0) {
      alert("Belum ada data siswa untuk dicetak kartu ujiannya.");
      return;
    }

    const cardsHtml = this.generateCardsHtml(list, examTitle);
    const cfg = this.getSchoolConfig();

    printArea.innerHTML = `
      <div style="width:100%; max-width:210mm; margin:0 auto; padding:4mm; font-family:'Plus Jakarta Sans', Arial, sans-serif; background:#ffffff;">
        <div style="text-align:center; border-bottom:2px solid #0f172a; padding-bottom:4px; margin-bottom:10px;">
          <h2 style="font-size:13px; font-weight:900; margin:0; text-transform:uppercase; color:#0f172a;">${cfg.schoolName} — KARTU PESERTA UJIAN SEKOLAH (CBT)</h2>
          <p style="font-size:9px; color:#64748b; margin:2px 0 0 0;">Total: ${list.length} Peserta Terdaftar • Format Kartu 9,0 x 5,3 cm (10 Kartu per Lembar A4)</p>
        </div>
        <div class="cards-grid-print" style="display:grid; grid-template-columns: repeat(2, 9.0cm); justify-content:center; gap:8mm 8mm;">
          ${cardsHtml}
        </div>
      </div>
    `;

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

  downloadCardsPdf(studentsToPrint, examTitle = "UJIAN SEKOLAH BERBASIS KOMPUTER") {
    const list = studentsToPrint || this.students;
    if (list.length === 0) {
      alert("Belum ada data siswa untuk di-download kartu ujiannya.");
      return;
    }

    const printArea = document.getElementById('printableCardsArea');
    if (!printArea) return;

    const cardsHtml = this.generateCardsHtml(list, examTitle);
    const cfg = this.getSchoolConfig();

    printArea.innerHTML = `
      <div id="pdfCardsWrapper" style="width:100%; max-width:200mm; margin:0 auto; padding:6mm; font-family:'Plus Jakarta Sans', Arial, sans-serif; background:#ffffff;">
        <div style="text-align:center; border-bottom:2px solid #0f172a; padding-bottom:4px; margin-bottom:8px;">
          <h2 style="font-size:12px; font-weight:900; margin:0; text-transform:uppercase; color:#0f172a;">${cfg.schoolName} — KARTU PESERTA UJIAN SEKOLAH (CBT)</h2>
          <p style="font-size:8.5px; color:#64748b; margin:2px 0 0 0;">Total: ${list.length} Peserta • Format Kartu Presisi 9,0 x 5,3 cm Siap Potong</p>
        </div>
        <div style="display:grid; grid-template-columns: repeat(2, 9.0cm); justify-content:center; gap:6mm 6mm;">
          ${cardsHtml}
        </div>
      </div>
    `;

    printArea.classList.remove('hidden');

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [6, 6, 6, 6],
        filename: `Kartu_Peserta_CBT_${(cfg.schoolName || 'SMPN2Pacet').replace(/\s+/g, '_')}_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(printArea).save().then(() => {
        printArea.classList.add('hidden');
      }).catch(err => {
        console.error("Gagal download PDF kartu:", err);
        printArea.classList.add('hidden');
        alert("Gagal mengunduh PDF secara otomatis. Membuka jendela cetak sistem...");
        this.printExamCards(list, examTitle);
      });
    } else {
      printArea.classList.add('hidden');
      this.printExamCards(list, examTitle);
    }
  }
}

if (typeof window !== 'undefined') {
  window.studentManager = new StudentManager();
}
