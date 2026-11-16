import type { ExamConfig, ExamResult, Question, Student, Teacher } from '../types/cbt';

export const SUPABASE_SCHEMA_SQL = `-- =========================================================================
-- SKRIP SQL SUPABASE: APLIKASI CBT UJIAN SEKOLAH (13 GURU & 250 SISWA)
-- Salin (copy) seluruh teks ini dan tempel (paste) ke menu SQL Editor di Supabase
-- =========================================================================

CREATE TABLE IF NOT EXISTS cbt_exam_results (
  id BIGSERIAL PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_nisn TEXT NOT NULL,
  student_class TEXT DEFAULT 'Umum',
  exam_title TEXT NOT NULL,
  subject TEXT NOT NULL,
  final_score INTEGER NOT NULL,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  unattempted_count INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  cheat_count INTEGER DEFAULT 0,
  completed_at TEXT NOT NULL,
  finish_reason TEXT DEFAULT 'Selesai',
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cbt_exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert to exam results" ON cbt_exam_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on exam results" ON cbt_exam_results FOR SELECT USING (true);
CREATE POLICY "Allow public delete on exam results" ON cbt_exam_results FOR DELETE USING (true);`;

export const DEFAULT_CONFIG: ExamConfig = {
  examTitle: 'UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)',
  examSubtitle: 'Literasi, Numerasi & Sains Terpadu',
  activeSubject: 'Literasi & Numerasi',
  durationMinutes: 80,
  examToken: 'CBT80M',
  maxCheats: 3,
};

export const DEFAULT_TEACHERS: Teacher[] = [
  {
    id: 't-proktor',
    nip: 'admin',
    name: 'Proktor Utama Sekolah',
    subject: 'ALL',
    pin: 'admin123',
    role: 'proktor',
  },
  {
    id: 't-01',
    nip: '198103122005011001',
    name: 'Dra. Siti Aminah, M.Pd.',
    subject: 'Literasi & Numerasi',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-02',
    nip: '198407212008012002',
    name: 'Budi Santoso, S.Pd.',
    subject: 'Bahasa Indonesia',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-03',
    nip: '198211052006041003',
    name: 'Rina Kusumawardani, M.Si.',
    subject: 'Matematika',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-04',
    nip: '198602182010011004',
    name: 'Hendra Wijaya, S.Pd.',
    subject: 'Ilmu Pengetahuan Alam (IPA)',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-05',
    nip: '197909142004022005',
    name: 'Nurhayati Lestari, S.Sos.',
    subject: 'Ilmu Pengetahuan Sosial (IPS)',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-06',
    nip: '198805302011012006',
    name: 'Dewi Anggraini, S.Pd.',
    subject: 'Bahasa Inggris',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-07',
    nip: '198304112009021007',
    name: 'Ahmad Fauzan, S.Pd.',
    subject: 'Pendidikan Pancasila (PPKn)',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-08',
    nip: '198012252005011008',
    name: 'Ustadz Muhammad Ridwan, S.Ag.',
    subject: 'Pendidikan Agama Islam',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-09',
    nip: '199108172015021009',
    name: 'Dimas Pratama, S.Kom.',
    subject: 'Informatika',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-10',
    nip: '198706102012012010',
    name: 'Ratna Sari Dewi, S.Sn.',
    subject: 'Seni Budaya',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-11',
    nip: '198501192010011011',
    name: 'Eko Prasetyo, S.Or.',
    subject: 'PJOK',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-12',
    nip: '198903222014022012',
    name: 'Fitri Handayani, S.Pd.',
    subject: 'Prakarya',
    pin: 'guru123',
    role: 'guru',
  },
  {
    id: 't-13',
    nip: '198410082008012013',
    name: 'Endang Sulistyaningsih, S.Pd.',
    subject: 'Bahasa Daerah',
    pin: 'guru123',
    role: 'guru',
  },
];

export const DEFAULT_STUDENTS: Student[] = [
  { id: 's-01', nisn: '0081234501', name: 'Aditya Pratama Putra', className: 'IX-A', password: '123' },
  { id: 's-02', nisn: '0081234502', name: 'Aisyah Putri Maharani', className: 'IX-A', password: '123' },
  { id: 's-03', nisn: '0081234503', name: 'Bagas Kurniawan', className: 'IX-A', password: '123' },
  { id: 's-04', nisn: '0081234504', name: 'Citra Ayu Lestari', className: 'IX-B', password: '123' },
  { id: 's-05', nisn: '0081234505', name: 'Daffa Rizky Ramadhan', className: 'IX-B', password: '123' },
  { id: 's-06', nisn: '0081234506', name: 'Elsa Nabila Zahra', className: 'IX-B', password: '123' },
  { id: 's-07', nisn: '0081234507', name: 'Farhan Maulana Hakim', className: 'IX-C', password: '123' },
  { id: 's-08', nisn: '0081234508', name: 'Gita Permata Sari', className: 'IX-C', password: '123' },
  { id: 's-09', nisn: '0081234509', name: 'Hafizh Al-Farizi', className: 'IX-C', password: '123' },
  { id: 's-10', nisn: '0081234510', name: 'Intan Nuraini', className: 'IX-D', password: '123' },
  { id: 's-11', nisn: '0081234511', name: 'Jihan Khairunnisa', className: 'IX-D', password: '123' },
  { id: 's-12', nisn: '0081234512', name: 'Kevin Wijaya Kusuma', className: 'IX-D', password: '123' },
];

export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: 'q-01',
    subject: 'Literasi & Numerasi',
    type: 'single',
    text: 'Perpustakaan sekolah mencatat peminjaman buku selama 4 minggu berturut-turut: Minggu I sebanyak 120 buku, Minggu II sebanyak 150 buku, Minggu III sebanyak 135 buku, dan Minggu IV sebanyak 195 buku.\n\nBerapakah rata-rata peminjaman buku per minggu selama bulan tersebut?',
    options: {
      A: '140 buku',
      B: '145 buku',
      C: '150 buku',
      D: '155 buku',
      E: '160 buku',
    },
    correctSingle: 'C',
    weight: 10,
  },
  {
    id: 'q-02',
    subject: 'Literasi & Numerasi',
    type: 'single',
    text: 'Sebuah taman sekolah berbentuk persegi panjang dengan panjang 24 meter dan lebar 16 meter. Di sekeliling tepi taman akan ditanami pohon pucuk merah dengan jarak antar pohon 4 meter.\n\nBerapa banyak bibit pohon pucuk merah yang dibutuhkan?',
    options: {
      A: '16 pohon',
      B: '18 pohon',
      C: '20 pohon',
      D: '24 pohon',
      E: '32 pohon',
    },
    correctSingle: 'C',
    weight: 10,
  },
  {
    id: 'q-03',
    subject: 'Literasi & Numerasi',
    type: 'multiple',
    text: 'Program Bank Sampah Sekolah berhasil mengumpulkan 80 kg plastik, 45 kg kertas, dan 25 kg kaleng aluminium dalam satu bulan.\n\nManakah pernyataan berikut yang BENAR terkait data pengumpulan sampah tersebut? (Pilih lebih dari satu jawaban)',
    options: {
      A: 'Total seluruh sampah yang terkumpul adalah 150 kg',
      B: 'Persentase sampah plastik lebih dari 50% total sampah',
      C: 'Selisih berat sampah kertas dan kaleng adalah 25 kg',
      D: 'Sampah kaleng memiliki berat paling sedikit dibandingkan jenis lain',
      E: 'Rasio berat sampah kertas terhadap plastik adalah 1 : 2',
    },
    correctMultiple: ['A', 'B', 'D'],
    weight: 15,
  },
  {
    id: 'q-04',
    subject: 'Literasi & Numerasi',
    type: 'true_false',
    text: 'Bacalah informasi tarif parkir digital di kawasan edukasi berikut:\n- Sepeda motor: Rp2.000 untuk 2 jam pertama, lalu Rp1.000 setiap jam berikutnya.\n- Mobil pribadi: Rp5.000 untuk 2 jam pertama, lalu Rp2.000 setiap jam berikutnya.\n\nTentukan apakah setiap pernyataan di bawah ini Benar atau Salah!',
    statements: [
      { id: 'tf-4-1', text: 'Pengguna sepeda motor yang parkir selama 4 jam membayar Rp4.000.', correct: 'B' },
      { id: 'tf-4-2', text: 'Pengguna mobil yang parkir selama 3 jam membayar Rp9.000.', correct: 'S' },
      { id: 'tf-4-3', text: 'Selisih biaya parkir mobil dan motor untuk durasi 2 jam adalah Rp3.000.', correct: 'B' },
    ],
    weight: 15,
  },
  {
    id: 'q-05',
    subject: 'Literasi & Numerasi',
    type: 'single',
    text: 'Dalam teks laporan hasil observasi ekosistem mangrove, disebutkan bahwa akar napas pohon bakau berfungsi menyerap oksigen saat air laut surut sekaligus menahan sedimen lumpur agar tidak tergerus ombak.\n\nGagasan utama dari informasi tersebut adalah...',
    options: {
      A: 'Air laut pasang surut memengaruhi kehidupan ikan di muara',
      B: 'Akar napas mangrove memiliki fungsi respirasi dan pelindung abrasi',
      C: 'Ekosistem mangrove hanya dapat tumbuh di kawasan berlumpur dalam',
      D: 'Pohon bakau membutuhkan perawatan intensif dari masyarakat pesisir',
      E: 'Sedimen lumpur menghambat pertumbuhan akar tanaman pantai',
    },
    correctSingle: 'B',
    weight: 10,
  },
  {
    id: 'q-06',
    subject: 'Literasi & Numerasi',
    type: 'multiple',
    text: 'Sebuah tangki penampungan air hujan berkapasitas 1.200 liter terisi penuh pada pukul 06.00. Air digunakan untuk menyiram kebun sekolah dengan debit tetap 15 liter/menit selama 30 menit.\n\nPilihlah dua pernyataan yang tepat berdasarkan situasi di atas!',
    options: {
      A: 'Air yang digunakan untuk menyiram kebun sebanyak 450 liter',
      B: 'Sisa air di dalam tangki pada pukul 06.30 adalah 850 liter',
      C: 'Sisa air di dalam tangki pada pukul 06.30 adalah 750 liter',
      D: 'Lebih dari separuh kapasitas tangki telah habis digunakan',
      E: 'Tangki akan kosong sepenuhnya jika penyiraman berlanjut 40 menit lagi',
    },
    correctMultiple: ['A', 'C'],
    weight: 15,
  },
  {
    id: 'q-07',
    subject: 'Literasi & Numerasi',
    type: 'true_false',
    text: 'Sebuah panel surya sekolah menghasilkan energi listrik rata-rata 4,8 kWh per hari pada musim kemarau dan 3,2 kWh per hari pada musim hujan.\n\nEvaluasi kebenaran pernyataan berikut!',
    statements: [
      { id: 'tf-7-1', text: 'Dalam 5 hari musim kemarau, panel surya menghasilkan 24 kWh energi listrik.', correct: 'B' },
      { id: 'tf-7-2', text: 'Penurunan produksi energi saat musim hujan mencapai 50% dari musim kemarau.', correct: 'S' },
      { id: 'tf-7-3', text: 'Selisih energi harian antara musim kemarau dan musim hujan adalah 1,6 kWh.', correct: 'B' },
    ],
    weight: 15,
  },
  {
    id: 'q-08',
    subject: 'Literasi & Numerasi',
    type: 'single',
    text: 'Koperasi siswa membeli 5 lusin buku tulis seharga Rp180.000,00. Buku tersebut dijual kembali dengan harga Rp4.000,00 per buah.\n\nBerapa persentase keuntungan yang diperoleh koperasi siswa jika seluruh buku terjual habis?',
    options: {
      A: '25%',
      B: '30%',
      C: '33,3%',
      D: '35%',
      E: '40%',
    },
    correctSingle: 'C',
    weight: 10,
  },
];

export const DEFAULT_RESULTS: ExamResult[] = [
  {
    id: 'res-01',
    student_name: 'Aisyah Putri Maharani',
    student_nisn: '0081234502',
    student_class: 'IX-A',
    exam_title: 'UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)',
    subject: 'Literasi & Numerasi',
    final_score: 95,
    correct_count: 7,
    incorrect_count: 1,
    unattempted_count: 0,
    total_questions: 8,
    cheat_count: 0,
    completed_at: '14/11/2026 09:12:40',
    finish_reason: 'Selesai',
  },
  {
    id: 'res-02',
    student_name: 'Aditya Pratama Putra',
    student_nisn: '0081234501',
    student_class: 'IX-A',
    exam_title: 'UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)',
    subject: 'Literasi & Numerasi',
    final_score: 88,
    correct_count: 7,
    incorrect_count: 1,
    unattempted_count: 0,
    total_questions: 8,
    cheat_count: 0,
    completed_at: '14/11/2026 09:15:08',
    finish_reason: 'Selesai',
  },
  {
    id: 'res-03',
    student_name: 'Citra Ayu Lestari',
    student_nisn: '0081234504',
    student_class: 'IX-B',
    exam_title: 'UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)',
    subject: 'Literasi & Numerasi',
    final_score: 82,
    correct_count: 6,
    incorrect_count: 2,
    unattempted_count: 0,
    total_questions: 8,
    cheat_count: 1,
    completed_at: '14/11/2026 09:18:22',
    finish_reason: 'Selesai',
  },
  {
    id: 'res-04',
    student_name: 'Farhan Maulana Hakim',
    student_nisn: '0081234507',
    student_class: 'IX-C',
    exam_title: 'UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)',
    subject: 'Literasi & Numerasi',
    final_score: 76,
    correct_count: 6,
    incorrect_count: 2,
    unattempted_count: 0,
    total_questions: 8,
    cheat_count: 0,
    completed_at: '14/11/2026 09:20:54',
    finish_reason: 'Selesai',
  },
  {
    id: 'res-05',
    student_name: 'Daffa Rizky Ramadhan',
    student_nisn: '0081234505',
    student_class: 'IX-B',
    exam_title: 'UJIAN SEKOLAH BERBASIS KOMPUTER (CBT)',
    subject: 'Literasi & Numerasi',
    final_score: 68,
    correct_count: 5,
    incorrect_count: 3,
    unattempted_count: 0,
    total_questions: 8,
    cheat_count: 2,
    completed_at: '14/11/2026 09:24:11',
    finish_reason: 'Selesai',
  },
];

const FIRST_NAMES = [
  'Aditya', 'Aisyah', 'Bagas', 'Citra', 'Daffa', 'Elsa', 'Farhan', 'Gita',
  'Hafizh', 'Intan', 'Jihan', 'Kevin', 'Laila', 'Maulana', 'Nabila', 'Oktavia',
  'Putra', 'Qonita', 'Rafi', 'Salsa', 'Taufik', 'Umar', 'Vina', 'Wahyu', 'Zahra',
];

const LAST_NAMES = [
  'Pratama', 'Maharani', 'Kurniawan', 'Lestari', 'Ramadhan', 'Saputra',
  'Hidayat', 'Kusuma', 'Wijaya', 'Nugroho', 'Sari', 'Hakim', 'Permata', 'Fauzi',
];

const CLASS_LIST = ['IX-A', 'IX-B', 'IX-C', 'IX-D', 'IX-E', 'IX-F', 'IX-G', 'IX-H'];

export function generateDemo250Students(): Student[] {
  const list: Student[] = [];
  for (let i = 1; i <= 250; i++) {
    const first = FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
    const last = LAST_NAMES[Math.floor((i - 1) / 3) % LAST_NAMES.length];
    const className = CLASS_LIST[Math.floor((i - 1) / 32) % CLASS_LIST.length];
    const nisn = `0081234${String(500 + i).padStart(3, '0')}`;
    list.push({
      id: `s-demo-${i}`,
      nisn,
      name: `${first} ${last} ${i <= 25 ? '' : `(${className.replace('IX-', '')})`}`.trim(),
      className,
      password: '123',
    });
  }
  return list;
}
