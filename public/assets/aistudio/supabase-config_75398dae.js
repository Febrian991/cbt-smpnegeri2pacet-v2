// Supabase Cloud Client & Real-Time Sync Manager
// Menyinkronkan Hasil Ujian 250 Siswa & Bank Soal 13 Guru ke Database Cloud Gratis (Supabase)

class SupabaseSyncManager {
  constructor() {
    this.config = this.loadConfig();
    this.client = null;
    this.isConnected = false;
    this.initClient();
  }

  loadConfig() {
    const saved = localStorage.getItem('cbt_supabase_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Gagal load supabase config", e);
      }
    }
    return {
      supabaseUrl: "",
      supabaseKey: "",
      enabled: false
    };
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
    localStorage.setItem('cbt_supabase_config', JSON.stringify(this.config));
    this.initClient();
  }

  initClient() {
    if (this.config.supabaseUrl && this.config.supabaseKey && typeof window.supabase !== 'undefined') {
      try {
        this.client = window.supabase.createClient(this.config.supabaseUrl, this.config.supabaseKey);
        this.isConnected = true;
        console.log("Supabase Client initialized successfully.");
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

  // Uji Koneksi ke Supabase
  async testConnection(url, key) {
    if (typeof window.supabase === 'undefined') {
      return { success: false, message: "Pustaka Supabase JS belum siap dimuat. Cek koneksi internet Anda." };
    }

    try {
      const testClient = window.supabase.createClient(url.trim(), key.trim());
      // Lakukan ping sederhana ke tabel cbt_exam_results atau auth
      const { data, error } = await testClient.from('cbt_exam_results').select('count', { count: 'exact', head: true });
      
      if (error && error.code !== 'PGRST116') {
        // Jika tabel belum dibuat, koneksi tetap valid jika errornya relation does not exist
        if (error.message && error.message.includes('relation "cbt_exam_results" does not exist')) {
          return { 
            success: true, 
            warning: true, 
            message: "Koneksi berhasil! Namun tabel 'cbt_exam_results' belum dibuat di Supabase SQL Editor. Jalankan script SQL yang disediakan." 
          };
        }
        return { success: false, message: "Gagal: " + error.message };
      }

      return { success: true, message: "Koneksi ke Supabase Cloud Berhasil! Database online siap digunakan." };
    } catch (err) {
      return { success: false, message: "Error: " + err.message };
    }
  }

  // Kirim Hasil Ujian Siswa ke Supabase Cloud
  async submitExamResult(resultRecord) {
    // 1. Simpan selalu ke LocalStorage sebagai backup lokal
    const localResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
    localResults.unshift(resultRecord);
    localStorage.setItem('cbt_exam_results', JSON.stringify(localResults));

    // 2. Jika Supabase terhubung, kirim ke Cloud
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
        } else {
          console.log("Hasil ujian berhasil dikirim ke Supabase Cloud.");
        }
      } catch (err) {
        console.warn("Error kirim ke Supabase:", err);
      }
    }
  }

  // Ambil Semua Hasil Ujian dari Supabase Cloud (untuk 13 Guru)
  async fetchCloudResults() {
    if (!this.client || !this.isConnected) {
      return { success: false, message: "Klien Supabase belum terhubung.", data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
    }

    try {
      const { data, error } = await this.client
        .from('cbt_exam_results')
        .select('*')
        .order('final_score', { ascending: false });

      if (error) {
        console.warn("Gagal fetch dari Supabase, menggunakan data lokal:", error);
        return { success: false, message: error.message, data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
      }

      const formatted = (data || []).map(row => {
        if (row.raw_data) return row.raw_data;
        return {
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
          finishReason: row.finish_reason
        };
      });

      localStorage.setItem('cbt_exam_results', JSON.stringify(formatted));
      return { success: true, count: formatted.length, data: formatted };
    } catch (err) {
      console.warn("Fetch cloud error:", err);
      return { success: false, message: err.message, data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
    }
  }
}

if (typeof window !== 'undefined') {
  window.supabaseSync = new SupabaseSyncManager();
}
