// Bank Soal Ujian Sekolah
// Mendukung 3 Tipe Soal:
// 1. 'single'     : Pilihan Ganda Tunggal (1 jawaban benar)
// 2. 'multiple'   : Pilihan Ganda Kompleks (Jawaban lebih dari 1)
// 3. 'true_false' : Tabel Pernyataan Benar / Salah

const DEFAULT_EXAM_CONFIG = {
  examTitle: "Asesmen Sumatif Akhir Semester I",
  subject: "Literasi, Numerasi & Pengetahuan Umum",
  targetClass: "Semua Kelas",
  scheduleDay: "",
  scheduleDate: "",
  scheduleTime: "",
  activeScheduleId: "",
  durationMinutes: 80, // Alokasi waktu 80 menit
  examToken: "CBT80M",
  showScoreToStudent: false, // Nilai dirahasiakan dari siswa
  maxCheatViolations: 3,
  maxAttempts: 1,
  subjectMaxAttempts: {},
  adminPin: "admin123"
};

const DEFAULT_QUESTIONS = [
  // TIPE 1: Pilihan Ganda Tunggal
  {
    id: 1,
    type: "single",
    question: "Sebuah partikel bergerak lurus dengan persamaan posisi s(t) = 3t² + 2t - 5 (s dalam meter, t dalam sekon). Kecepatan sesaat partikel pada detik ke-4 (t = 4s) adalah...",
    image: "",
    options: [
      { key: "A", text: "20 m/s" },
      { key: "B", text: "24 m/s" },
      { key: "C", text: "26 m/s" },
      { key: "D", text: "30 m/s" },
      { key: "E", text: "32 m/s" }
    ],
    correctAnswer: "C",
    weight: 10
  },

  // TIPE 2: Pilihan Ganda Kompleks (Centang lebih dari 1)
  {
    id: 2,
    type: "multiple",
    question: "Perhatikan faktor-faktor lingkungan berikut!\nPilihlah SEMUA faktor yang secara langsung memicu peningkatan laju fotosintesis pada tumbuhan hijau (Jawaban lebih dari 1):",
    image: "",
    options: [
      { key: "A", text: "Peningkatan konsentrasi gas Karbon Dioksida (CO₂) hingga titik optimum" },
      { key: "B", text: "Intensitas cahaya matahari yang cukup" },
      { key: "C", text: "Ketiadaan klorofil pada sel daun" },
      { key: "D", text: "Ketersediaan air tanah yang memadai" },
      { key: "E", text: "Suhu ekstrem di atas 60°C" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 15
  },

  // TIPE 3: Pernyataan Benar / Salah
  {
    id: 3,
    type: "true_false",
    question: "Tentukan kebenaran dari masing-masing pernyataan terkait kemerdekaan dan hukum dasar negara Republik Indonesia berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Undang-Undang Dasar 1945 disahkan secara resmi oleh PPKI pada tanggal 18 Agustus 1945.", correct: "B" },
      { id: "s2", text: "Pancasila tercantum dalam alinea keempat Pembukaan UUD Negara Republik Indonesia Tahun 1945.", correct: "B" },
      { id: "s3", text: "Bentuk negara Indonesia berdasarkan pasal 1 ayat 1 UUD 1945 adalah Negara Serikat / Federal.", correct: "S" }
    ],
    weight: 15
  },

  // TIPE 1: Pilihan Ganda Tunggal
  {
    id: 4,
    type: "single",
    question: "Bacalah kutipan bacaan berikut:\n\n'Pemanfaatan teknologi digital dalam dunia pendidikan terbukti mempercepat akses terhadap sumber belajar berkualitas. Model pembelajaran interaktif memungkinkan siswa memahami konsep abstrak secara lebih konkret dan mandiri.'\n\nSimpulan utama yang paling logis dari bacaan di atas adalah...",
    image: "",
    options: [
      { key: "A", text: "Tenaga pendidik tidak lagi dibutuhkan di era digital" },
      { key: "B", text: "Teknologi digital membantu mempermudah akses dan pemahaman konsep belajar siswa" },
      { key: "C", text: "Semua sekolah diwajibkan menutup perpustakaan konvensional" },
      { key: "D", text: "Siswa hanya bisa belajar jika memiliki perangkat komputer canggih" },
      { key: "E", text: "Buku cetak sudah tidak memiliki manfaat sama sekali" }
    ],
    correctAnswer: "B",
    weight: 10
  },

  // TIPE 2: Pilihan Ganda Kompleks
  {
    id: 5,
    type: "multiple",
    question: "Manakah di antara bilangan-bilangan di bawah ini yang merupakan bilangan prima? (Pilihlah semua jawaban yang benar):",
    image: "",
    options: [
      { key: "A", text: "2" },
      { key: "B", text: "9" },
      { key: "C", text: "17" },
      { key: "D", text: "29" },
      { key: "E", text: "33" }
    ],
    correctAnswer: ["A", "C", "D"],
    weight: 15
  },

  // TIPE 3: Benar / Salah
  {
    id: 6,
    type: "true_false",
    question: "Tentukan apakah pernyataan mengenai jaringan komputer dan internet berikut Benar (B) atau Salah (S):",
    image: "",
    statements: [
      { id: "s1", text: "Protokol HTTPS mengenkripsi paket data sehingga lebih aman dari intersepsi pihak luar dibanding HTTP biasa.", correct: "B" },
      { id: "s2", text: "Alamat IP versi 4 (IPv4) tersusun atas alamat biner berukuran 128-bit.", correct: "S" },
      { id: "s3", text: "Phishing adalah metode penipuan digital yang memancing korban untuk memberikan data sensitif seperti kata sandi.", correct: "B" }
    ],
    weight: 15
  },

  // TIPE 1: Pilihan Ganda Tunggal
  {
    id: 7,
    type: "single",
    question: "Dalam sebuah kantong terdapat 4 bola merah, 5 bola biru, dan 3 bola kuning. Jika diambil satu bola secara acak, berapakah peluang terambilnya bola BUKAN warna kuning?",
    image: "",
    options: [
      { key: "A", text: "1/4" },
      { key: "B", text: "1/3" },
      { key: "C", text: "1/2" },
      { key: "D", text: "3/4" },
      { key: "E", text: "5/12" }
    ],
    correctAnswer: "D",
    weight: 10
  },

  // TIPE 2: Pilihan Ganda Kompleks
  {
    id: 8,
    type: "multiple",
    question: "Pilihlah SEMUA fenomena alam di bawah ini yang terjadi akibat rotasi bumi (Bumi berputar pada porosnya):",
    image: "",
    options: [
      { key: "A", text: "Terjadinya siang dan malam secara bergantian" },
      { key: "B", text: "Gerak semu harian matahari dari timur ke barat" },
      { key: "C", text: "Pergantian empat musim di daerah subtropis" },
      { key: "D", text: "Perbedaan zona waktu di berbagai belahan bumi" },
      { key: "E", text: "Perubahan lamanya waktu siang dan malam sepanjang tahun" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 10
  }
];
