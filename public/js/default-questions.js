// Bank Soal Uji Coba Aplikasi CBT (Mencakup 13 Mata Pelajaran Guru)
// Mendukung 3 Tipe Soal di setiap Mapel:
// 1. 'single'     : Pilihan Ganda Tunggal (1 jawaban benar, bobot 30)
// 2. 'multiple'   : Pilihan Ganda Kompleks (>= 2 jawaban benar, bobot 35)
// 3. 'true_false' : Tabel Pernyataan Benar / Salah (3 pernyataan, bobot 35)

const DEFAULT_EXAM_CONFIG = {
  examTitle: "Uji Coba Asesmen Sumatif CBT",
  subject: "Bahasa Indonesia",
  targetClass: "Semua Kelas",
  scheduleDay: "",
  scheduleDate: "",
  scheduleTime: "",
  activeScheduleId: "",
  durationMinutes: 80,
  examToken: "CBT80M",
  showScoreToStudent: false,
  maxCheatViolations: 3,
  maxAttempts: 1,
  subjectMaxAttempts: {}
};

const DEFAULT_QUESTIONS = [
  // ===================== 1. BAHASA INDONESIA (Budi Santoso, S.Pd.) =====================
  {
    id: 101,
    subject: "Bahasa Indonesia",
    classLevel: "Semua Kelas",
    createdBy: "Budi Santoso, S.Pd.",
    type: "single",
    question: "[Soal Uji Coba] Bacalah paragraf berikut:\n\n'Kebersihan lingkungan sekolah adalah tanggung jawab bersama seluruh warga sekolah. Dengan menjaga kebersihan kelas dan halaman, proses belajar mengajar menjadi lebih nyaman, sehat, dan kondusif.'\n\nGagasan utama paragraf tersebut adalah...",
    image: "",
    options: [
      { key: "A", text: "Jadwal piket kelas harus dibuat setiap hari Senin" },
      { key: "B", text: "Kebersihan lingkungan sekolah merupakan tanggung jawab bersama warga sekolah" },
      { key: "C", text: "Halaman sekolah hanya dibersihkan oleh petugas kebersihan" },
      { key: "D", text: "Siswa dilarang membawa makanan ke dalam lingkungan sekolah" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 102,
    subject: "Bahasa Indonesia",
    classLevel: "Semua Kelas",
    createdBy: "Budi Santoso, S.Pd.",
    type: "multiple",
    question: "[Soal Uji Coba] Manakah kalimat di bawah ini yang menggunakan huruf kapital dan ejaan bahasa Indonesia secara tepat? (Pilih semua jawaban yang benar):",
    image: "",
    options: [
      { key: "A", text: "Siswa SMP Negeri 2 Pacet mengikuti upacara bendera setiap hari Senin." },
      { key: "B", text: "Ibu membeli gula jawa dan pisang ambon di pasar tradisional." },
      { key: "C", text: "pada hari sabtu kami berkunjung ke gunung bromo bersama keluarga." },
      { key: "D", text: "Prof. Dr. Rahmat Hidayat menghadiri seminar pendidikan di Surabaya." }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 103,
    subject: "Bahasa Indonesia",
    classLevel: "Semua Kelas",
    createdBy: "Budi Santoso, S.Pd.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan mengenai struktur dan kaidah teks dalam Bahasa Indonesia berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Teks berita disusun berdasarkan fakta yang bersifat aktual dan dapat dipertanggungjawabkan.", correct: "B" },
      { id: "s2", text: "Kata depan 'di' yang menunjukkan tempat ditulis terpisah dengan kata yang mengikutinya, seperti 'di sekolah'.", correct: "B" },
      { id: "s3", text: "Teks prosedur selalu berisi kisah fiksi rekaan pengarang tanpa langkah kerja yang berurutan.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 2. MATEMATIKA (Siti Rahmawati, M.Pd.) =====================
  {
    id: 104,
    subject: "Matematika",
    classLevel: "Semua Kelas",
    createdBy: "Siti Rahmawati, M.Pd.",
    type: "single",
    question: "[Soal Uji Coba] Sebuah toko memberikan diskon 20% untuk sebuah tas sekolah dengan harga awal Rp150.000,00. Berapakah harga tas tersebut setelah mendapat diskon?",
    image: "",
    options: [
      { key: "A", text: "Rp110.000,00" },
      { key: "B", text: "Rp120.000,00" },
      { key: "C", text: "Rp125.000,00" },
      { key: "D", text: "Rp130.000,00" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 105,
    subject: "Matematika",
    classLevel: "Semua Kelas",
    createdBy: "Siti Rahmawati, M.Pd.",
    type: "multiple",
    question: "[Soal Uji Coba] Perhatikan himpunan bilangan bulat berikut! Pilihlah SEMUA bilangan yang merupakan bilangan prima:",
    image: "",
    options: [
      { key: "A", text: "2" },
      { key: "B", text: "9" },
      { key: "C", text: "17" },
      { key: "D", text: "29" }
    ],
    correctAnswer: ["A", "C", "D"],
    weight: 35
  },
  {
    id: 106,
    subject: "Matematika",
    classLevel: "Semua Kelas",
    createdBy: "Siti Rahmawati, M.Pd.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran dari pernyataan bangun datar dan aljabar sederhana berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Jumlah besar ketiga sudut dalam sebuah segitiga selalu 180 derajat.", correct: "B" },
      { id: "s2", text: "Jika 3x + 5 = 20, maka nilai x adalah 5.", correct: "B" },
      { id: "s3", text: "Keliling persegi dengan panjang sisi 8 cm adalah 64 cm.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 3. BAHASA INGGRIS (Dedi Irawan, S.Pd.) =====================
  {
    id: 107,
    subject: "Bahasa Inggris",
    classLevel: "Semua Kelas",
    createdBy: "Dedi Irawan, S.Pd.",
    type: "single",
    question: "[Soal Uji Coba] Read the dialogue carefully:\n\nRani: \"What does your father do every morning before going to work?\"\nBagus: \"He usually ___ a cup of coffee and reads the newspaper.\"\n\nChoose the best verb to complete the sentence:",
    image: "",
    options: [
      { key: "A", text: "drink" },
      { key: "B", text: "drinks" },
      { key: "C", text: "drinking" },
      { key: "D", text: "drank" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 108,
    subject: "Bahasa Inggris",
    classLevel: "Semua Kelas",
    createdBy: "Dedi Irawan, S.Pd.",
    type: "multiple",
    question: "[Soal Uji Coba] Which expressions below are polite ways to ask for permission in English? (Choose all correct answers):",
    image: "",
    options: [
      { key: "A", text: "May I go to the restroom, please?" },
      { key: "B", text: "Could I borrow your dictionary for a moment?" },
      { key: "C", text: "Give me your pen right now!" },
      { key: "D", text: "Would it be okay if I open the window?" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 109,
    subject: "Bahasa Inggris",
    classLevel: "Semua Kelas",
    createdBy: "Dedi Irawan, S.Pd.",
    type: "true_false",
    question: "[Soal Uji Coba] Determine whether each statement about English grammar and text types is True (B) or False (S):",
    image: "",
    statements: [
      { id: "s1", text: "Simple Past Tense is used to describe events that happened and finished in the past.", correct: "B" },
      { id: "s2", text: "The past tense (V2) of the irregular verb 'go' is 'went'.", correct: "B" },
      { id: "s3", text: "A notice saying 'Keep Silent' inside a library means visitors must talk loudly.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 4. ILMU PENGETAHUAN ALAM (IPA) (Nurul Hidayah, M.Si.) =====================
  {
    id: 110,
    subject: "Ilmu Pengetahuan Alam (IPA)",
    classLevel: "Semua Kelas",
    createdBy: "Nurul Hidayah, M.Si.",
    type: "single",
    question: "[Soal Uji Coba] Dalam sistem peredaran darah manusia, pembuluh darah yang berfungsi mengalirkan darah kaya oksigen keluar dari jantung menuju ke seluruh tubuh adalah...",
    image: "",
    options: [
      { key: "A", text: "Vena kava superior" },
      { key: "B", text: "Arteri pulmonalis" },
      { key: "C", text: "Aorta (pembuluh nadi utama)" },
      { key: "D", text: "Vena pulmonalis" }
    ],
    correctAnswer: "C",
    weight: 30
  },
  {
    id: 111,
    subject: "Ilmu Pengetahuan Alam (IPA)",
    classLevel: "Semua Kelas",
    createdBy: "Nurul Hidayah, M.Si.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA faktor yang secara langsung memengaruhi kelancaran proses fotosintesis pada tumbuhan hijau:",
    image: "",
    options: [
      { key: "A", text: "Ketersediaan gas Karbon Dioksida (CO₂)" },
      { key: "B", text: "Intensitas cahaya matahari yang cukup" },
      { key: "C", text: "Ketiadaan zat hijau daun (klorofil)" },
      { key: "D", text: "Ketersediaan air (H₂O) yang diserap akar" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 112,
    subject: "Ilmu Pengetahuan Alam (IPA)",
    classLevel: "Semua Kelas",
    createdBy: "Nurul Hidayah, M.Si.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan mengenai besaran fisika dan tata surya berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Satuan Internasional (SI) untuk besaran suhu adalah Kelvin (K).", correct: "B" },
      { id: "s2", text: "Peristiwa terjadinya siang dan malam disebabkan oleh rotasi bumi pada porosnya.", correct: "B" },
      { id: "s3", text: "Perubahan wujud benda dari padat langsung menjadi gas disebut mengembun.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 5. ILMU PENGETAHUAN SOSIAL (IPS) (Agus Pratama, S.Pd.) =====================
  {
    id: 113,
    subject: "Ilmu Pengetahuan Sosial (IPS)",
    classLevel: "Semua Kelas",
    createdBy: "Agus Pratama, S.Pd.",
    type: "single",
    question: "[Soal Uji Coba] Letak geografis Indonesia yang berada di antara dua benua (Asia dan Australia) serta dua samudra (Hindia dan Pasifik) memberikan keuntungan besar bagi Indonesia terutama di bidang...",
    image: "",
    options: [
      { key: "A", text: "Terjadinya musim dingin bersalju sepanjang tahun" },
      { key: "B", text: "Jalur persimpangan perdagangan internasional dan keragaman budaya" },
      { key: "C", text: "Menjadikan seluruh wilayah Indonesia berupa gurun pasir" },
      { key: "D", text: "Terputusnya hubungan pelayaran dengan negara tetangga" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 114,
    subject: "Ilmu Pengetahuan Sosial (IPS)",
    classLevel: "Semua Kelas",
    createdBy: "Agus Pratama, S.Pd.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA negara yang merupakan pendiri organisasi kerja sama kawasan ASEAN pada Deklarasi Bangkok tahun 1967:",
    image: "",
    options: [
      { key: "A", text: "Indonesia" },
      { key: "B", text: "Malaysia" },
      { key: "C", text: "Jepang" },
      { key: "D", text: "Thailand" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 115,
    subject: "Ilmu Pengetahuan Sosial (IPS)",
    classLevel: "Semua Kelas",
    createdBy: "Agus Pratama, S.Pd.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan mengenai kegiatan ekonomi dan sejarah Indonesia berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Kegiatan menyalurkan barang dari produsen hingga sampai ke tangan konsumen disebut distribusi.", correct: "B" },
      { id: "s2", text: "Peristiwa Sumpah Pemuda diperingati oleh bangsa Indonesia setiap tanggal 28 Oktober.", correct: "B" },
      { id: "s3", text: "Kebutuhan primer manusia meliputi barang-barang mewah seperti perhiasan berlian dan mobil sport.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 6. PPKn (Dewi Lestari, S.Pd.) =====================
  {
    id: 116,
    subject: "Pendidikan Pancasila & Kewarganegaraan (PPKn)",
    classLevel: "Semua Kelas",
    createdBy: "Dewi Lestari, S.Pd.",
    type: "single",
    question: "[Soal Uji Coba] Pengambilan keputusan bersama melalui musyawarah untuk mencapai mufakat sesuai dengan nilai-nilai Pancasila khususnya sila ke...",
    image: "",
    options: [
      { key: "A", text: "Sila Kedua" },
      { key: "B", text: "Sila Ketiga" },
      { key: "C", text: "Sila Keempat" },
      { key: "D", text: "Sila Kelima" }
    ],
    correctAnswer: "C",
    weight: 30
  },
  {
    id: 117,
    subject: "Pendidikan Pancasila & Kewarganegaraan (PPKn)",
    classLevel: "Semua Kelas",
    createdBy: "Dewi Lestari, S.Pd.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA contoh perilaku yang mencerminkan semangat persatuan dan kesatuan di lingkungan sekolah:",
    image: "",
    options: [
      { key: "A", text: "Bekerja sama membersihkan ruang kelas tanpa membeda-bedakan latar belakang teman" },
      { key: "B", text: "Menghargai pendapat teman saat berdiskusi kelompok" },
      { key: "C", text: "Memilih teman bermain hanya yang berasal dari daerah yang sama" },
      { key: "D", text: "Menjenguk teman sekelas yang sedang sakit sebagai wujud kepedulian" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 118,
    subject: "Pendidikan Pancasila & Kewarganegaraan (PPKn)",
    classLevel: "Semua Kelas",
    createdBy: "Dewi Lestari, S.Pd.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan terkait konstitusi dan tata negara Indonesia berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Undang-Undang Dasar Negara Republik Indonesia Tahun 1945 disahkan oleh PPKI pada tanggal 18 Agustus 1945.", correct: "B" },
      { id: "s2", text: "Semboyan Bhinneka Tunggal Ika memiliki makna berbeda-beda tetapi tetap satu jua.", correct: "B" },
      { id: "s3", text: "Bentuk negara Indonesia berdasarkan Pasal 1 Ayat 1 UUD 1945 adalah Negara Serikat (Federal).", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 7. PENDIDIKAN AGAMA & BUDI PEKERTI (H. Ahmad Fauzi, S.Ag., M.Pd.I.) =====================
  {
    id: 119,
    subject: "Pendidikan Agama & Budi Pekerti",
    classLevel: "Semua Kelas",
    createdBy: "H. Ahmad Fauzi, S.Ag., M.Pd.I.",
    type: "single",
    question: "[Soal Uji Coba] Sifat jujur, dapat dipercaya, dan menjaga titipan orang lain dengan penuh tanggung jawab dalam perilaku akhlak mulia disebut...",
    image: "",
    options: [
      { key: "A", text: "Amanah" },
      { key: "B", text: "Takabur" },
      { key: "C", text: "Hasad" },
      { key: "D", text: "Riya" }
    ],
    correctAnswer: "A",
    weight: 30
  },
  {
    id: 120,
    subject: "Pendidikan Agama & Budi Pekerti",
    classLevel: "Semua Kelas",
    createdBy: "H. Ahmad Fauzi, S.Ag., M.Pd.I.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA perilaku terpuji (akhlakul karimah) yang wajib diterapkan pelajar terhadap orang tua dan guru:",
    image: "",
    options: [
      { key: "A", text: "Berbicara dengan tutur kata yang sopan dan santun" },
      { key: "B", text: "Mematuhi nasihat baik dan mendoakan keduanya" },
      { key: "C", text: "Membantah perkataan guru ketika diingatkan saat belajar" },
      { key: "D", text: "Menjaga nama baik keluarga dan sekolah di mana pun berada" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 121,
    subject: "Pendidikan Agama & Budi Pekerti",
    classLevel: "Semua Kelas",
    createdBy: "H. Ahmad Fauzi, S.Ag., M.Pd.I.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan mengenai sikap jujur, disiplin, dan toleransi beragama berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Menyontek saat ujian merupakan perbuatan yang bertentangan dengan nilai kejujuran.", correct: "B" },
      { id: "s2", text: "Toleransi berarti saling menghormati antarumat beragama agar tercipta kerukunan.", correct: "B" },
      { id: "s3", text: "Menolong sesama manusia yang tertimpa musibah hanya boleh dilakukan jika diberi imbalan uang.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 8. PJOK (Rian Hidayat, S.Pd.Jas.) =====================
  {
    id: 122,
    subject: "Pendidikan Jasmani, Olahraga & Kesehatan (PJOK)",
    classLevel: "Semua Kelas",
    createdBy: "Rian Hidayat, S.Pd.Jas.",
    type: "single",
    question: "[Soal Uji Coba] Tujuan utama melakukan gerakan pemanasan (warming up) sebelum berolahraga inti adalah...",
    image: "",
    options: [
      { key: "A", text: "Membuat otot cepat lelah sebelum bertanding" },
      { key: "B", text: "Meningkatkan suhu tubuh, melenturkan otot, dan mengurangi risiko cedera" },
      { key: "C", text: "Menghentikan detak jantung selama berolahraga" },
      { key: "D", text: "Menggantikan seluruh kebutuhan air minum harian" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 123,
    subject: "Pendidikan Jasmani, Olahraga & Kesehatan (PJOK)",
    classLevel: "Semua Kelas",
    createdBy: "Rian Hidayat, S.Pd.Jas.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA teknik dasar yang terdapat dalam permainan bola basket:",
    image: "",
    options: [
      { key: "A", text: "Dribbling (menggiring bola)" },
      { key: "B", text: "Passing (mengoper bola seperti chest pass dan bounce pass)" },
      { key: "C", text: "Shooting (menembak bola ke arah ring)" },
      { key: "D", text: "Heading (menyundul bola dengan kepala ke gawang)" }
    ],
    correctAnswer: ["A", "B", "C"],
    weight: 35
  },
  {
    id: 124,
    subject: "Pendidikan Jasmani, Olahraga & Kesehatan (PJOK)",
    classLevel: "Semua Kelas",
    createdBy: "Rian Hidayat, S.Pd.Jas.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan seputar kebugaran jasmani dan pola hidup sehat berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Jumlah pemain inti dalam satu regu permainan bola voli di lapangan adalah 6 orang.", correct: "B" },
      { id: "s2", text: "Istirahat tidur yang cukup dan konsumsi gizi seimbang membantu menjaga daya tahan tubuh.", correct: "B" },
      { id: "s3", text: "Cabang olahraga lari jarak pendek (sprint) lebih mengutamakan gerakan berjalan santai daripada kecepatan.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 9. SENI BUDAYA & PRAKARYA (Sri Mulyani, S.Sn.) =====================
  {
    id: 125,
    subject: "Seni Budaya & Prakarya",
    classLevel: "Semua Kelas",
    createdBy: "Sri Mulyani, S.Sn.",
    type: "single",
    question: "[Soal Uji Coba] Dalam teori warna seni rupa, tiga warna pokok (warna primer) yang dapat dicampur untuk menghasilkan warna lainnya adalah...",
    image: "",
    options: [
      { key: "A", text: "Hijau, Ungu, dan Oranye" },
      { key: "B", text: "Merah, Kuning, dan Biru" },
      { key: "C", text: "Hitam, Abu-abu, dan Cokelat" },
      { key: "D", text: "Putih, Merah Muda, dan Emas" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 126,
    subject: "Seni Budaya & Prakarya",
    classLevel: "Semua Kelas",
    createdBy: "Sri Mulyani, S.Sn.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA alat musik tradisional khas Indonesia yang dimainkan dengan cara dipukul atau ditabuh:",
    image: "",
    options: [
      { key: "A", text: "Gamelan (Saron / Bonang)" },
      { key: "B", text: "Kendang" },
      { key: "C", text: "Sasando" },
      { key: "D", text: "Kolintang" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 127,
    subject: "Seni Budaya & Prakarya",
    classLevel: "Semua Kelas",
    createdBy: "Sri Mulyani, S.Sn.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan mengenai cabang seni rupa, musik, dan tari daerah berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Karya seni rupa tiga dimensi memiliki ukuran panjang, lebar, dan tinggi (volume) sehingga dapat dilihat dari berbagai sisi.", correct: "B" },
      { id: "s2", text: "Batik Indonesia telah diakui oleh UNESCO sebagai Warisan Budaya Takbenda Dunia.", correct: "B" },
      { id: "s3", text: "Teknik arsir dalam menggambar dilakukan dengan memotong kertas menjadi potongan kecil lalu menempelkannya.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 10. INFORMATIKA / TIK (Fajar Nugraha, S.Kom.) =====================
  {
    id: 128,
    subject: "Informatika / TIK",
    classLevel: "Semua Kelas",
    createdBy: "Fajar Nugraha, S.Kom.",
    type: "single",
    question: "[Soal Uji Coba] Komponen perangkat keras komputer yang berfungsi sebagai otak pemroses instruksi program dan perhitungan logika disebut...",
    image: "",
    options: [
      { key: "A", text: "Printer" },
      { key: "B", text: "CPU (Central Processing Unit)" },
      { key: "C", text: "Monitor" },
      { key: "D", text: "Keyboard" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 129,
    subject: "Informatika / TIK",
    classLevel: "Semua Kelas",
    createdBy: "Fajar Nugraha, S.Kom.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA contoh tindakan keamanan digital (cyber safety) yang baik ketika menggunakan internet:",
    image: "",
    options: [
      { key: "A", text: "Menggunakan kata sandi yang kuat dan tidak dibagikan kepada orang asing" },
      { key: "B", text: "Mewaspadai tautan mencurigakan (phishing) yang meminta kode OTP atau PIN" },
      { key: "C", text: "Menuliskan password akun pribadi di kolom komentar media sosial" },
      { key: "D", text: "Melakukan logout setelah selesai menggunakan komputer umum di laboratorium" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 130,
    subject: "Informatika / TIK",
    classLevel: "Semua Kelas",
    createdBy: "Fajar Nugraha, S.Kom.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan mengenai jaringan internet dan perangkat lunak berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Protokol HTTPS mengenkripsi pengiriman data sehingga lebih aman dibanding HTTP biasa.", correct: "B" },
      { id: "s2", text: "Sistem bilangan biner yang digunakan komputer hanya terdiri dari dua angka, yaitu 0 dan 1.", correct: "B" },
      { id: "s3", text: "Mouse dan scanner termasuk perangkat lunak (software) yang tidak memiliki bentuk fisik.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 11. PRAKARYA & KEWIRAUSAHAAN (Endang Wulandari, S.Pd.) =====================
  {
    id: 131,
    subject: "Prakarya & Kewirausahaan",
    classLevel: "Semua Kelas",
    createdBy: "Endang Wulandari, S.Pd.",
    type: "single",
    question: "[Soal Uji Coba] Pemanfaatan botol plastik bekas minuman menjadi pot tanaman hias atau tempat alat tulis merupakan penerapan prinsip pengolahan limbah yang disebut...",
    image: "",
    options: [
      { key: "A", text: "Recycle (mendaur ulang / mengolah kembali)" },
      { key: "B", text: "Pembuangan bebas ke sungai" },
      { key: "C", text: "Pembakaran sampah terbuka" },
      { key: "D", text: "Penimbunan plastik di halaman kelas" }
    ],
    correctAnswer: "A",
    weight: 30
  },
  {
    id: 132,
    subject: "Prakarya & Kewirausahaan",
    classLevel: "Semua Kelas",
    createdBy: "Endang Wulandari, S.Pd.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA bahan alam yang umum digunakan untuk membuat produk kerajinan anyaman tradisional di Indonesia:",
    image: "",
    options: [
      { key: "A", text: "Bambu yang diiris tipis" },
      { key: "B", text: "Rotan" },
      { key: "C", text: "Daun pandan kering" },
      { key: "D", text: "Kaca lembaran padat" }
    ],
    correctAnswer: ["A", "B", "C"],
    weight: 35
  },
  {
    id: 133,
    subject: "Prakarya & Kewirausahaan",
    classLevel: "Semua Kelas",
    createdBy: "Endang Wulandari, S.Pd.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan mengenai pengolahan pangan dan kewirausahaan berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Kemasan produk yang rapi, bersih, dan informatif dapat meningkatkan daya tarik pembeli.", correct: "B" },
      { id: "s2", text: "Salah satu sikap penting seorang wirausaha adalah kreatif, ulet, dan berani mencoba hal baru.", correct: "B" },
      { id: "s3", text: "Prinsip Reduce berarti memperbanyak jumlah sampah plastik sekali pakai setiap hari.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 12. BAHASA DAERAH / MUATAN LOKAL (Bambang Wijaya, S.Pd.) =====================
  {
    id: 134,
    subject: "Bahasa Daerah / Muatan Lokal",
    classLevel: "Semua Kelas",
    createdBy: "Bambang Wijaya, S.Pd.",
    type: "single",
    question: "[Soal Uji Coba] Dalam tata krama berbahasa daerah di Jawa Timur (Basa Jawa), ragam bahasa halus yang digunakan siswa ketika berbicara dengan guru atau orang yang lebih tua disebut...",
    image: "",
    options: [
      { key: "A", text: "Ngoko kasar" },
      { key: "B", text: "Krama alus / Krama inggil" },
      { key: "C", text: "Bahasa prokem / gaul" },
      { key: "D", text: "Bahasa asing" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 135,
    subject: "Bahasa Daerah / Muatan Lokal",
    classLevel: "Semua Kelas",
    createdBy: "Bambang Wijaya, S.Pd.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA contoh tembang Macapat yang merupakan bagian dari karya sastra tradisi Jawa:",
    image: "",
    options: [
      { key: "A", text: "Pocung" },
      { key: "B", text: "Sinom" },
      { key: "C", text: "Haiku" },
      { key: "D", text: "Dhandhanggula" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 136,
    subject: "Bahasa Daerah / Muatan Lokal",
    classLevel: "Semua Kelas",
    createdBy: "Bambang Wijaya, S.Pd.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan tentang pelestarian bahasa daerah dan budaya lokal berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Unggah-ungguh atau tata krama berbicara membantu menjaga rasa hormat kepada orang yang lebih tua.", correct: "B" },
      { id: "s2", text: "Aksara Jawa merupakan salah satu warisan aksara tradisional Nusantara yang perlu dilestarikan.", correct: "B" },
      { id: "s3", text: "Bahasa daerah hanya boleh digunakan oleh orang lanjut usia dan dilarang dipelajari oleh siswa SMP.", correct: "S" }
    ],
    weight: 35
  },

  // ===================== 13. BIMBINGAN KONSELING (BK) / LITERASI (Ratna Sari, S.Psi.) =====================
  {
    id: 137,
    subject: "Bimbingan Konseling (BK) / Literasi",
    classLevel: "Semua Kelas",
    createdBy: "Ratna Sari, S.Psi.",
    type: "single",
    question: "[Soal Uji Coba] Langkah terbaik ketika menghadapi perbedaan pendapat dengan teman sebaya di kelas agar tidak terjadi perundungan (bullying) atau pertengkaran adalah...",
    image: "",
    options: [
      { key: "A", text: "Menyebarkan rumor buruk tentang teman tersebut di media sosial" },
      { key: "B", text: "Berdiskusi secara tenang, saling mendengarkan, dan mencari jalan keluar bersama" },
      { key: "C", text: "Membalas dengan ejekan di depan siswa lain" },
      { key: "D", text: "Memaksakan kehendak pribadi agar selalu dituruti" }
    ],
    correctAnswer: "B",
    weight: 30
  },
  {
    id: 138,
    subject: "Bimbingan Konseling (BK) / Literasi",
    classLevel: "Semua Kelas",
    createdBy: "Ratna Sari, S.Psi.",
    type: "multiple",
    question: "[Soal Uji Coba] Pilihlah SEMUA kebiasaan belajar efektif dan literasi yang membantu meningkatkan kesiapan menghadapi ujian sekolah:",
    image: "",
    options: [
      { key: "A", text: "Membuat jadwal belajar teratur serta meringkas poin penting materi" },
      { key: "B", text: "Membaca soal dan instruksi dengan teliti sebelum memilih jawaban" },
      { key: "C", text: "Begadang semalaman suntuk sebelum ujian tanpa istirahat sama sekali" },
      { key: "D", text: "Berlatih mengerjakan variasi soal literasi dan numerasi secara berkala" }
    ],
    correctAnswer: ["A", "B", "D"],
    weight: 35
  },
  {
    id: 139,
    subject: "Bimbingan Konseling (BK) / Literasi",
    classLevel: "Semua Kelas",
    createdBy: "Ratna Sari, S.Psi.",
    type: "true_false",
    question: "[Soal Uji Coba] Tentukan kebenaran pernyataan terkait etika pelajar, kesehatan mental, dan literasi digital berikut:",
    image: "",
    statements: [
      { id: "s1", text: "Memeriksa kebenaran sumber informasi sebelum membagikannya membantu mencegah penyebaran hoaks.", correct: "B" },
      { id: "s2", text: "Berani bercerita kepada guru BK atau orang tua saat mengalami kesulitan belajar merupakan sikap yang bijak.", correct: "B" },
      { id: "s3", text: "Perundungan siber (cyberbullying) di grup pesan tidak berdampak apa-apa bagi perasaan korban.", correct: "S" }
    ],
    weight: 35
  }
];
