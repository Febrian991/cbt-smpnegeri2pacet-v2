# 🎓 CBT TKA Pro - Aplikasi Ujian Sekolah Berbasis Komputer & Rekap Otomatis

Aplikasi CBT modern yang disesuaikan khusus untuk standar **Ujian Sekolah & Tes Kemampuan Akademik (TKA)** di Indonesia dengan fitur **Guru Terima Beres**, **Upload File Gambar Langsung**, dan **Ekspor Laporan dalam Format Excel (.xlsx) & PDF (.pdf)**.

---

## 🏆 Fitur Utama Sesuai Standar Sekolah

### 1. 🖼️ Upload Gambar Soal Langsung (Bukan URL)
- Guru dapat langsung memilih file gambar dari komputer atau galeri ponsel (format JPG, PNG, atau WEBP).
- Sistem secara otomatis mengompres gambar menggunakan HTML5 Canvas agar ukuran file tetap ringan ($\le$ 80KB) dan hemat kuota, namun tetap tajam dan jernih saat dibaca siswa.
- Dilengkapi pratinjau (*preview*) gambar langsung sebelum soal disimpan.

### 2. 📊 Rekap Otomatis — Ekspor Excel (.xlsx) & Dokumen PDF (.pdf)
Ketika ujian selesai, guru dapat langsung mengunduh laporan rekapitulasi tanpa perlu mengubah format lagi:
- **Download Excel (.xlsx)**: File lembar kerja Microsoft Excel resmi dengan format tabel bergaris, kolom rapi, dan ringkasan statistik kelas di baris teratas.
- **Download Dokumen PDF (.pdf)**: File PDF siap cetak lengkap dengan Kop Surat Resmi Ujian, Tabel Statistik Nilai (Rata-rata, Tertinggi, Terendah, Ketuntasan), Daftar Peringkat Siswa (Ranking 1 s/d N), serta kolom tanda tangan Kepala Sekolah dan Guru Pengawas.

### 3. 🔒 Kerahasiaan Nilai Siswa
- **Nilai Tidak Ditampilkan ke Siswa**: Setelah siswa mengklik *"Selesai Ujian"*, skor/nilai akhir dirahasiakan dan hanya menampilkan Tanda Terima Pengerjaan Resmi yang dapat dicetak/disimpan ke PDF.

### 4. 🚨 Sistem Proteksi Anti Tab Switch (Ketat)
- Siswa wajib berada dalam mode layar penuh (*Fullscreen*).
- Setiap kali siswa membuka tab baru, mencari contekan di Google, atau meminimalkan browser, sistem akan memicu alarm suara (*audio buzzer*), memunculkan layar merah peringatan, dan mencatat log pelanggaran.
- Toleransi maksimal 3 kali. Jika melanggar lebih dari 3 kali, ujian langsung dihentikan sepihak dan jawaban otomatis tersubmit.

### 5. ⏳ Alokasi Timer 80 Menit
- Alokasi waktu standar **80 Menit** (`01:20:00`) dengan peringatan merah saat sisa waktu kurang dari 5 menit dan auto-submit saat waktu habis.

### 6. 📝 Format Input Soal Berbasis TKA
Mendukung 3 format soal standar asesmen nasional:
1. **Pilihan Ganda Tunggal**: 1 jawaban benar (opsi A sampai E).
2. **Pilihan Ganda Kompleks**: Peserta dapat mencentang lebih dari 1 jawaban yang benar.
3. **Tabel Pernyataan Benar / Salah**: Peserta menentukan kebenaran tiap baris pernyataan.

---

## 🚀 Cara Menjalankan Langsung di Komputer (Offline / Lab)

1. Buka folder: `C:\Users\Pongo\.gemini\antigravity\scratch\cbt-app`
2. Klik ganda pada berkas **`index.html`**.
3. Aplikasi langsung terbuka di browser (Chrome / Edge / Firefox) tanpa perlu internet atau instalasi software tambahan.

---

## 🌐 Cara Meng-Online-kan ke GitHub & Vercel (100% Gratis)

1. **Upload ke GitHub**: Buat repositori baru di [github.com](https://github.com), lalu *drag-and-drop* seluruh berkas di folder `cbt-app` ini.
2. **Deploy di Vercel**: Buka [vercel.com](https://vercel.com), klik *"Add New Project"*, impor repositori GitHub tersebut, lalu klik *"Deploy"*.
3. Dalam 30 detik website ujian online Anda langsung aktif dengan tautan resmi HTTPS (contoh: `https://cbt-ujian-sekolah.vercel.app`).

---

## 🔑 Kredensial Bawaan (Default)

- **Token Ujian Siswa**: `TKA80M` *(dapat diubah / diacak di panel guru)*
- **PIN Pengawas / Guru**: `admin123` *(dapat diganti di panel guru)*
