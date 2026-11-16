// Data 13 Guru Mata Pelajaran + 1 Proktor / Admin Utama
// Sekolah: SMP NEGERI 2 PACET - Ujian Sekolah Berbasis Komputer (CBT)

const DEFAULT_TEACHERS = [
  {
    id: "admin",
    nip: "198501012010011001",
    name: "Proktor Utama / Admin",
    subject: "Semua Mata Pelajaran (Super Admin)",
    role: "admin",
    pin: "admin123"
  },
  {
    id: "guru_1",
    nip: "198003152006041002",
    name: "Budi Santoso, S.Pd.",
    subject: "Bahasa Indonesia",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_2",
    nip: "198207212008012003",
    name: "Siti Rahmawati, M.Pd.",
    subject: "Matematika",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_3",
    nip: "198411052009021004",
    name: "Dedi Irawan, S.Pd.",
    subject: "Bahasa Inggris",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_4",
    nip: "198305142007012005",
    name: "Nurul Hidayah, M.Si.",
    subject: "Ilmu Pengetahuan Alam (IPA)",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_5",
    nip: "198109282005011006",
    name: "Agus Pratama, S.Pd.",
    subject: "Ilmu Pengetahuan Sosial (IPS)",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_6",
    nip: "198602102011012007",
    name: "Dewi Lestari, S.Pd.",
    subject: "Pendidikan Pancasila & Kewarganegaraan (PPKn)",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_7",
    nip: "197904182003121008",
    name: "H. Ahmad Fauzi, S.Ag., M.Pd.I.",
    subject: "Pendidikan Agama & Budi Pekerti",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_8",
    nip: "198812032014021009",
    name: "Rian Hidayat, S.Pd.Jas.",
    subject: "Pendidikan Jasmani, Olahraga & Kesehatan (PJOK)",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_9",
    nip: "198506192010012010",
    name: "Sri Mulyani, S.Sn.",
    subject: "Seni Budaya & Prakarya",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_10",
    nip: "199008252015031011",
    name: "Fajar Nugraha, S.Kom.",
    subject: "Informatika / TIK",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_11",
    nip: "198703122011012012",
    name: "Endang Wulandari, S.Pd.",
    subject: "Prakarya & Kewirausahaan",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_12",
    nip: "198310072008011013",
    name: "Bambang Wijaya, S.Pd.",
    subject: "Bahasa Daerah / Muatan Lokal",
    role: "guru",
    pin: "guru123"
  },
  {
    id: "guru_13",
    nip: "198901152012022014",
    name: "Ratna Sari, S.Psi.",
    subject: "Bimbingan Konseling (BK) / Literasi",
    role: "guru",
    pin: "guru123"
  }
];

if (typeof window !== 'undefined') {
  window.DEFAULT_TEACHERS = DEFAULT_TEACHERS;
}
