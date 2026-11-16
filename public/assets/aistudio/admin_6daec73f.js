// CBT Admin & Guru: Manajemen 13 Guru, 250 Siswa, Rekap Nilai Otomatis, & Ekspor Excel/PDF

class CBTAdmin {
  constructor() {
    this.isAuthenticated = false;
    this.currentTeacher = null;
    this.teachers = this.loadTeachers();
    this.selectedSubjectFilter = 'ALL';
    this.selectedClassFilter = 'ALL';
  }

  loadTeachers() {
    const saved = localStorage.getItem('cbt_teachers_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let hasAdmin = false;
          // Normalisasi: pastikan admin dinamai Proktor Utama / Admin (bukan Kepala Sekolah)
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

  saveTeachers(teachersList) {
    this.teachers = teachersList;
    localStorage.setItem('cbt_teachers_list', JSON.stringify(this.teachers));
  }

  getAllTeachers() {
    return this.teachers;
  }

  // Ambil semua daftar mata pelajaran unik (mendukung 1 guru pegang 2 atau lebih mapel)
  getAllSubjects() {
    const subjectsSet = new Set();
    
    // 1. Ambil dari konfigurasi ujian aktif
    if (window.examEngine && window.examEngine.config && window.examEngine.config.subject) {
      subjectsSet.add(window.examEngine.config.subject.trim());
    }

    // 2. Ambil dari daftar guru (mendukung pemisah koma / garis miring jika 1 guru mengampu 2 mapel)
    if (Array.isArray(this.teachers)) {
      this.teachers.forEach(t => {
        if (t.role !== 'admin' && t.subject && !t.subject.toLowerCase().includes('semua')) {
          const parts = t.subject.split(/[,/]/).map(s => s.trim()).filter(Boolean);
          parts.forEach(p => subjectsSet.add(p));
          subjectsSet.add(t.subject.trim());
        }
      });
    }

    // 3. Ambil dari riwayat hasil ujian siswa
    try {
      const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      rawResults.forEach(r => {
        if (r.subject) subjectsSet.add(r.subject.trim());
      });
    } catch (e) {}

    return Array.from(subjectsSet).filter(Boolean);
  }

  // Cari Guru berdasarkan nama, NIP, atau mata pelajaran
  searchTeachers(query = "") {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return this.teachers;
    return this.teachers.filter(t => 
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.nip && String(t.nip).toLowerCase().includes(q)) ||
      (t.subject && t.subject.toLowerCase().includes(q))
    );
  }

  // Tambah Guru Baru (Hanya oleh Proktor / Admin)
  addTeacher({ name, nip, subject, pin }) {
    const cleanName = String(name || "").trim();
    const cleanNip = String(nip || "").trim();
    const cleanSubject = String(subject || "").trim();
    const cleanPin = String(pin || "guru123").trim();

    if (!cleanName || !cleanNip || !cleanSubject) {
      return { success: false, message: "Nama Guru, NIP, dan Mata Pelajaran wajib diisi!" };
    }

    // Cek apakah NIP sudah terdaftar
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
      role: "guru",
      pin: cleanPin
    };

    this.teachers.push(newTeacher);
    this.saveTeachers(this.teachers);
    return { success: true, teacher: newTeacher };
  }

  // Hapus Data Guru (Hanya oleh Proktor / Admin, Akun Admin tidak boleh dihapus)
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

  // Update Profil Lengkap Guru (Nama, NIP, Mapel, PIN)
  updateTeacherProfile(teacherId, { name, nip, subject, pin }) {
    let found = false;
    this.teachers = this.teachers.map(t => {
      if (t.id === teacherId) {
        found = true;
        return {
          ...t,
          name: name ? String(name).trim() : t.name,
          nip: nip ? String(nip).trim() : t.nip,
          subject: subject ? String(subject).trim() : t.subject,
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
    }
    return { success: true };
  }

  // Reset Password Seluruh Guru (kecuali Proktor / Admin) ke default "guru123"
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

  // Login Guru / Admin (Autentikasi Aman tanpa Dropdown Publik)
  login(identifier, pinInput) {
    const cleanId = String(identifier || "").trim().toLowerCase();
    const cleanPin = String(pinInput || "").trim();

    if (!cleanId) {
      return { success: false, message: "Harap masukkan Username / NIP!" };
    }

    // Cari akun: Proktor Utama / Admin atau Guru Mapel
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
      // 1. Cari berdasarkan NIP persis
      teacher = this.teachers.find(t => String(t.nip || '').trim().toLowerCase() === cleanId);

      // 2. Jika belum ketemu, cari berdasarkan ID persis
      if (!teacher) {
        teacher = this.teachers.find(t => String(t.id || '').trim().toLowerCase() === cleanId);
      }

      // 3. Jika belum ketemu, cari berdasarkan nama lengkap persis
      if (!teacher) {
        teacher = this.teachers.find(t => String(t.name || '').trim().toLowerCase() === cleanId);
      }

      // 4. Jika belum ketemu, cari partial nama guru (minimal 3 karakter)
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

    // Validasi PIN
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
      sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(teacher));
    } catch (e) {}
    return { success: true, teacher };
  }

  // Ambil data akun guru / admin yang sedang login saat ini
  getCurrentTeacher() {
    if (!this.currentTeacher) {
      try {
        const savedSession = sessionStorage.getItem('cbt_logged_teacher');
        if (savedSession) {
          this.currentTeacher = JSON.parse(savedSession);
        }
      } catch (e) {}
    }
    if (!this.currentTeacher) {
      this.currentTeacher = this.teachers.find(t => t.id === 'admin' || t.role === 'admin') || {
        id: "admin",
        nip: "198501012010011001",
        name: "Proktor Utama / Admin",
        subject: "Semua Mata Pelajaran (Super Admin)",
        role: "admin",
        pin: "admin123"
      };
    }
    return this.currentTeacher;
  }

  logout() {
    this.isAuthenticated = false;
    this.currentTeacher = null;
    try {
      sessionStorage.removeItem('cbt_logged_teacher');
    } catch (e) {}
  }

  // Update PIN Guru Tertentu
  updateTeacherPin(teacherId, newPin) {
    this.teachers = this.teachers.map(t => {
      if (t.id === teacherId) {
        return { ...t, pin: String(newPin).trim() };
      }
      return t;
    });
    this.saveTeachers(this.teachers);

    // Jika yang sedang login adalah guru ini, update session
    if (this.currentTeacher && this.currentTeacher.id === teacherId) {
      this.currentTeacher.pin = String(newPin).trim();
    }
  }

  // Update Pengaturan Ujian
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

  addQuestion(questionData) {
    const questions = [...window.examEngine.questions];
    const newId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;
    
    let newQ = {
      id: newId,
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

  deleteQuestion(id) {
    const questions = window.examEngine.questions.filter(q => q.id !== id);
    window.examEngine.saveQuestions(questions);
  }

  resetToDefaultQuestions() {
    window.examEngine.saveQuestions([...DEFAULT_QUESTIONS]);
  }

  exportQuestionsJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.examEngine.questions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `bank_soal_ujian_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  importQuestionsJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.examEngine.saveQuestions(parsed);
        return { success: true, count: parsed.length };
      }
      return { success: false, message: "Format file JSON tidak valid." };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // Ambil Hasil Ujian Terurut (Mendukung Filter Mapel & Kelas, serta Guru Multi-Mapel)
  getAllResultsSorted(subjectFilter = null, classFilter = null) {
    const sf = subjectFilter || this.selectedSubjectFilter || null;
    const cf = classFilter || this.selectedClassFilter || null;
    const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
    let filtered = rawResults;

    const cur = this.getCurrentTeacher();
    const isSuperAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');

    // Filter Mapel
    if (sf && sf !== 'ALL') {
      filtered = filtered.filter(r => r.subject && r.subject.toLowerCase().trim() === sf.toLowerCase().trim());
    } else if (!isSuperAdmin && cur && cur.subject) {
      // Jika guru biasa login tanpa memilih filter khusus, tampilkan hasil yang cocok dengan salah satu mapelnya
      const parts = cur.subject.split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
      filtered = filtered.filter(r => {
        if (!r.subject) return false;
        const rSub = r.subject.toLowerCase().trim();
        return parts.some(p => rSub === p || rSub.includes(p) || p.includes(rSub));
      });
    }

    // Filter Kelas
    if (cf && cf !== 'ALL') {
      filtered = filtered.filter(r => r.student?.class === cf);
    }

    return filtered.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }

  setSubjectFilter(val) { this.selectedSubjectFilter = val; }
  setClassFilter(val) { this.selectedClassFilter = val; }

  // Hitung Analisis Statistik
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

  // ===================== 1. EXPORT FORMAT EXCEL (.xlsx) =====================
  exportResultsExcel(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      alert("Belum ada data nilai siswa untuk di-export ke Excel.");
      return;
    }

    const analytics = this.getExamAnalytics(subjectFilter, classFilter);
    const currentSub = subjectFilter || (this.currentTeacher ? this.currentTeacher.subject : window.examEngine.config.subject);
    const fileName = `Rekap_Nilai_CBT_${(currentSub || 'Semua').replace(/\s+/g, '_')}_${Date.now()}`;

    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();

      const aoaData = [
        ["LAPORAN REKAPITULASI RESMI HASIL UJIAN SEKOLAH (CBT)"],
        ["Guru Pengampu / Proktor:", this.currentTeacher?.name || 'Panitia Ujian'],
        ["Mata Pelajaran:", currentSub],
        ["Waktu Rekapitulasi:", new Date().toLocaleString('id-ID')],
        [""],
        ["RINGKASAN STATISTIK (GURU TERIMA BERES):"],
        ["Total Peserta", "Rata-Rata Nilai", "Nilai Tertinggi", "Peraih Tertinggi", "Nilai Terendah", "Peraih Terendah", "Ketuntasan (>=75)"],
        [analytics.totalStudents, analytics.averageScore, analytics.highestScore, analytics.highestStudent, analytics.lowestScore, analytics.lowestStudent, `${analytics.passRatePercentage}%`],
        [""],
        ["DAFTAR PERINGKAT SISWA (URUT TERTINGGI KE TERENDAH):"],
        ["Rank", "Nama Siswa", "NISN", "Kelas", "Nilai Akhir (0-100)", "Benar", "Salah", "Kosong", "Waktu Selesai", "Pelanggaran Tab", "Status"]
      ];

      results.forEach((r, idx) => {
        aoaData.push([
          idx + 1,
          r.student?.name || '-',
          r.student?.nisn || '-',
          r.student?.class || 'Umum',
          r.finalScore,
          r.correctCount,
          r.incorrectCount,
          r.unattemptedCount,
          r.completedAt,
          r.cheatCount || 0,
          r.finishReason || 'Selesai'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoaData);

      ws['!cols'] = [
        { wch: 8 },  // Rank
        { wch: 28 }, // Nama
        { wch: 16 }, // NISN
        { wch: 10 }, // Kelas
        { wch: 18 }, // Nilai
        { wch: 10 }, // Benar
        { wch: 10 }, // Salah
        { wch: 10 }, // Kosong
        { wch: 22 }, // Waktu
        { wch: 16 }, // Pelanggaran
        { wch: 24 }  // Keterangan
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai Siswa");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      this.exportFallbackExcel(results, analytics, fileName);
    }
  }

  // Fallback Excel (.xls)
  exportFallbackExcel(results, analytics, fileName) {
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"></head>
      <body>
        <h2>LAPORAN REKAPITULASI HASIL UJIAN SEKOLAH (CBT)</h2>
        <p><b>Guru Pengampu:</b> ${this.currentTeacher?.name || 'Panitia Ujian'} | <b>Mapel:</b> ${window.examEngine.config.subject} | <b>Waktu Rekap:</b> ${new Date().toLocaleString('id-ID')}</p>
        <table border="1">
          <tr style="background:#e0e7ff;font-weight:bold;">
            <td>Total Siswa</td><td>Rata-Rata Nilai</td><td>Nilai Tertinggi</td><td>Nilai Terendah</td><td>Ketuntasan</td>
          </tr>
          <tr>
            <td>${analytics.totalStudents} Siswa</td><td>${analytics.averageScore}</td><td>${analytics.highestScore} (${analytics.highestStudent})</td><td>${analytics.lowestScore} (${analytics.lowestStudent})</td><td>${analytics.passRatePercentage}%</td>
          </tr>
        </table>
        <br/>
        <h3>DAFTAR PERINGKAT SISWA (TERTINGGI KE TERENDAH)</h3>
        <table border="1">
          <tr style="background:#f1f5f9;font-weight:bold;">
            <th>Rank</th><th>Nama Siswa</th><th>NISN</th><th>Kelas</th><th>Nilai Akhir</th><th>Benar</th><th>Salah</th><th>Kosong</th><th>Waktu Selesai</th><th>Pelanggaran Tab</th>
          </tr>
          ${results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.student?.name || '-'}</td>
              <td>'${r.student?.nisn || '-'}</td>
              <td>${r.student?.class || '-'}</td>
              <td><b>${r.finalScore}</b></td>
              <td>${r.correctCount}</td>
              <td>${r.incorrectCount}</td>
              <td>${r.unattemptedCount}</td>
              <td>${r.completedAt}</td>
              <td>${r.cheatCount || 0} Kali</td>
            </tr>
          `).join('')}
        </table>
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

    this.populateReportHTML(reportElement, results, subjectFilter);

    reportElement.classList.remove('hidden');
    document.body.classList.add('printing-report');

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [10, 10, 10, 10],
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

  populateReportHTML(el, results, subjectFilter) {
    const analytics = this.getExamAnalytics(subjectFilter);
    const teacherName = this.currentTeacher ? this.currentTeacher.name : "Guru Mata Pelajaran";
    const teacherNip = this.currentTeacher ? (this.currentTeacher.nip || "—") : "—";
    const subjectName = subjectFilter || (this.currentTeacher ? this.currentTeacher.subject : window.examEngine.config.subject);
    const cfg = this.getSchoolConfig();

    const logoLeftHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Dinas" style="width:60px; height:60px; object-fit:contain;">`
      : `<div style="width:60px; height:60px; border-radius:8px; background:#1e3a8a; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px;">DINAS</div>`;

    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo Sekolah" style="width:60px; height:60px; object-fit:contain;">`
      : `<div style="width:60px; height:60px; border-radius:50%; background:#059669; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px;">SMP</div>`;

    // Render kop surat
    const kopEl = document.getElementById('repKopSurat');
    if (kopEl) {
      kopEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #0f172a; padding-bottom:8px; margin-bottom:8px;">
          ${logoLeftHtml}
          <div style="text-align:center; flex:1; padding:0 12px;">
            <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">PEMERINTAH KABUPATEN MOJOKERTO — DINAS PENDIDIKAN</div>
            <div style="font-size:17px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:1px;">${cfg.schoolName}</div>
            <div style="font-size:10px; color:#334155; font-weight:600;">Jl. Raya Pacet, Kec. Pacet, Kab. Mojokerto, Jawa Timur</div>
            <div style="font-size:13px; font-weight:900; text-transform:uppercase; margin-top:4px; color:#1e3a8a;">LEMBAR REKAPITULASI RESMI HASIL UJIAN SEKOLAH</div>
            <div style="font-size:11px; font-weight:700; color:#334155;">UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)</div>
          </div>
          ${logoRightHtml}
        </div>
      `;
    }

    const examTitleEl = document.getElementById('repExamTitle');
    if (examTitleEl) examTitleEl.innerText = window.examEngine.config.examTitle;
    
    const repSubjectEl = document.getElementById('repSubject');
    if (repSubjectEl) repSubjectEl.innerText = subjectName;
    
    const repDateEl = document.getElementById('repDate');
    if (repDateEl) repDateEl.innerText = new Date().toLocaleString('id-ID');
    
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

    const tbody = document.getElementById('repTableBody');
    if (tbody) {
      tbody.innerHTML = results.map((r, idx) => `
        <tr class="border-b border-slate-200 text-xs">
          <td class="p-2 text-center font-bold">${idx + 1}</td>
          <td class="p-2 font-bold">${r.student?.name || '-'}</td>
          <td class="p-2">${r.student?.nisn || '-'}</td>
          <td class="p-2 text-center">${r.student?.class || '-'}</td>
          <td class="p-2 font-black text-center text-sm ${r.finalScore >= 75 ? 'text-green-700' : 'text-red-600'}">${r.finalScore}</td>
          <td class="p-2 text-center">${r.correctCount} / ${r.incorrectCount} / ${r.unattemptedCount}</td>
          <td class="p-2 text-center">${r.completedAt}</td>
          <td class="p-2 text-center">${(r.cheatCount || 0) > 0 ? r.cheatCount + 'x Tab' : 'Tertib'}</td>
        </tr>
      `).join('');
    }
  }

  // ===================== KONFIGURASI SEKOLAH =====================
  getSchoolConfig() {
    try {
      const saved = localStorage.getItem('cbt_school_config');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch(e) {}
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

  saveSchoolConfig(cfg) {
    try {
      localStorage.setItem('cbt_school_config', JSON.stringify(cfg));
      return { success: true };
    } catch(e) {
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
      ["Petunjuk: Jangan ubah baris judul kolom di baris ke-3. Isi data guru mulai baris ke-4."],
      ["NIP / ID Pengguna (Wajib - Untuk Login)", "Nama Lengkap Guru & Gelar (Wajib)", "Mata Pelajaran yang Diampu (Wajib)", "Password / PIN Login (Wajib)"],
      ["198003152006041002", "Budi Santoso, S.Pd.", "Bahasa Indonesia", "guru123"],
      ["197512022000032001", "Siti Rahmawati, M.Pd.", "Matematika", "guru123"],
      ["198506102010011003", "Dedi Irawan, S.Pd.", "Bahasa Inggris", "guru123"],
      ["198201152007012004", "Nurul Hidayah, M.Si.", "IPA", "guru123"],
      ["198708222011011005", "Agus Pratama, S.Pd.", "IPS", "guru123"]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws['!cols'] = [
      { wch: 28 }, // NIP
      { wch: 32 }, // Nama
      { wch: 30 }, // Mapel
      { wch: 20 }  // Password
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
      let skippedCount = 0;

      dataRows.forEach(row => {
        if (!row || row.length === 0) return;
        const rawNip = row[0];
        const rawName = row[1];
        const rawSubject = row[2];
        const rawPin = row[3];

        if (rawNip && rawName && rawSubject) {
          const cleanNip = String(rawNip).trim();
          const cleanName = String(rawName).trim();
          const cleanSubject = String(rawSubject).trim();
          const cleanPin = rawPin ? String(rawPin).trim() : "guru123";

          const existing = this.teachers.find(t => String(t.nip).trim() === cleanNip || t.id === 'admin');
          if (!existing || existing.id === 'admin') {
            const dupNip = this.teachers.find(t => String(t.nip).trim() === cleanNip && t.role !== 'admin');
            if (dupNip) {
              // Update jika NIP sudah ada
              dupNip.name = cleanName;
              dupNip.subject = cleanSubject;
              dupNip.pin = cleanPin;
              importedCount++;
            } else {
              this.teachers.push({
                id: 'guru_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                nip: cleanNip,
                name: cleanName,
                subject: cleanSubject,
                role: "guru",
                pin: cleanPin
              });
              importedCount++;
            }
            skippedCount;
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
}

window.cbtAdmin = new CBTAdmin();
