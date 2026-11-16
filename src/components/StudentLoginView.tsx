import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Clock, Laptop, ShieldAlert } from 'lucide-react';
import type { ExamConfig, Question, Student } from '../types/cbt';

interface StudentLoginViewProps {
  config: ExamConfig;
  students: Student[];
  questions: Question[];
  onAuthenticated: (student: Student) => void;
}

export function StudentLoginView({
  config,
  students,
  questions,
  onAuthenticated,
}: StudentLoginViewProps) {
  const [nisn, setNisn] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const trimmedNisn = nisn.trim();
  const matchedStudent = trimmedNisn
    ? students.find((s) => s.nisn.toLowerCase() === trimmedNisn.toLowerCase())
    : undefined;

  const activeQuestionsCount = questions.filter(
    (q) => q.subject.toLowerCase() === config.activeSubject.toLowerCase()
  ).length;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (!matchedStudent) {
      setErrorMsg('NISN / Nomor Peserta tidak ditemukan dalam daftar peserta.');
      return;
    }

    if (password !== matchedStudent.password) {
      setErrorMsg('Password akun siswa tidak sesuai. Periksa kembali kartu peserta Anda.');
      return;
    }

    if (token.trim().toUpperCase() !== config.examToken.trim().toUpperCase()) {
      setErrorMsg(`Token ujian tidak valid. Pastikan Anda memasukkan token aktif dari pengawas.`);
      return;
    }

    if (activeQuestionsCount === 0 && questions.length === 0) {
      setErrorMsg('Belum ada butir soal yang tersedia untuk ujian ini.');
      return;
    }

    onAuthenticated(matchedStudent);
  }

  return (
    <div className="w-full max-w-6xl mx-auto py-4 sm:py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
        {/* Left Column: Institutional Briefing */}
        <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div>
            <p className="text-xs font-semibold text-blue-700 tracking-wide">
              Portal Asesmen Digital Sekolah
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 leading-tight text-balance">
              {config.examTitle}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-3 leading-relaxed">
              {config.examSubtitle} — Sistem ujian terpadu dengan koreksi otomatis,
              dukungan multi-format soal TKA, dan pengamanan integritas pengerjaan.
            </p>

            <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-3 gap-4">
              <div>
                <span className="text-xs text-slate-500 block">Mata Pelajaran</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {config.activeSubject}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Alokasi Waktu</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block tabular-nums">
                  {config.durationMinutes} Menit
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Jumlah Butir</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block tabular-nums">
                  {activeQuestionsCount > 0 ? activeQuestionsCount : questions.length} Soal
                </span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200 space-y-3.5 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-900">Proteksi Anti Tab Switch:</span>{' '}
                  Dilarang berpindah tab atau keluar dari jendela ujian (batas toleransi{' '}
                  <span className="font-mono tabular-nums font-semibold">{config.maxCheats}</span>{' '}
                  kali).
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-900">Timer Terpusat & Auto-Submit:</span>{' '}
                  Lembar jawaban otomatis tersimpan dan terkirim saat waktu berakhir.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Laptop className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-900">Kompatibel Semua Perangkat:</span>{' '}
                  Optimal pada Laptop, Chromebook, Tablet, dan Ponsel sekolah.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Contoh NISN uji coba: <code className="font-mono font-semibold text-slate-800">0081234501</code></span>
            <span>Password: <code className="font-mono font-semibold text-slate-800">123</code></span>
            <span>Token: <code className="font-mono font-semibold text-blue-700">{config.examToken}</code></span>
          </div>
        </div>

        {/* Right Column: Login Form */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Masuk Peserta Ujian</h2>
            <p className="text-sm text-slate-500 mt-1">
              Masukkan NISN, password kartu peserta, dan token ujian aktif.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="studentNisn"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                NISN / Nomor Peserta
              </label>
              <input
                id="studentNisn"
                type="text"
                required
                value={nisn}
                onChange={(e) => setNisn(e.target.value)}
                placeholder="Contoh: 0081234501"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm font-mono tabular-nums outline-none transition"
              />
              {matchedStudent && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Terdaftar: {matchedStudent.name} · Kelas {matchedStudent.className}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="studentPassword"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Password Akun Siswa
              </label>
              <input
                id="studentPassword"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password kartu peserta"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm outline-none transition"
              />
            </div>

            <div>
              <label
                htmlFor="studentToken"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Token Masuk Ujian
              </label>
              <input
                id="studentToken"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="Masukkan token dari pengawas"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm font-mono font-bold tracking-widest text-blue-700 uppercase outline-none transition"
              />
              <p className="text-xs text-slate-500 mt-1.5">
                Token aktif sesi ini: <span className="font-mono font-semibold text-slate-800">{config.examToken}</span>
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-2 py-3 px-4 rounded-lg font-semibold text-sm text-white bg-blue-700 hover:bg-blue-800 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>Masuk ke Lembar Konfirmasi</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
