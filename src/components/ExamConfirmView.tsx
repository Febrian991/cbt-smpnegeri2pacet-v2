import { AlertTriangle, ArrowLeft, PlayCircle } from 'lucide-react';
import type { ExamConfig, Student } from '../types/cbt';

interface ExamConfirmViewProps {
  student: Student;
  config: ExamConfig;
  questionCount: number;
  onStartExam: () => void;
  onBack: () => void;
}

export function ExamConfirmView({
  student,
  config,
  questionCount,
  onStartExam,
  onBack,
}: ExamConfirmViewProps) {
  function handleStart() {
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // Fullscreen may be restricted in embedded preview frames
    }
    onStartExam();
  }

  return (
    <div className="w-full max-w-2xl mx-auto py-4 sm:py-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
        <div className="pb-5 border-b border-slate-200">
          <p className="text-xs font-semibold text-blue-700">Tahap Verifikasi Peserta</p>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            Konfirmasi Lembar Ujian
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Periksa kembali data identitas peserta dan aturan pengerjaan sebelum waktu dimulai.
          </p>
        </div>

        <dl className="divide-y divide-slate-200 text-sm my-5">
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-500">Nama Peserta</dt>
            <dd className="font-semibold text-slate-900 text-right">{student.name}</dd>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-500">NISN / No. Peserta</dt>
            <dd className="font-mono font-semibold text-slate-900 tabular-nums text-right">
              {student.nisn}
            </dd>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-500">Kelas / Rombel</dt>
            <dd className="font-semibold text-blue-700 text-right">{student.className}</dd>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-500">Mata Pelajaran</dt>
            <dd className="font-semibold text-slate-900 text-right">{config.activeSubject}</dd>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-500">Alokasi Waktu</dt>
            <dd className="font-semibold text-blue-700 tabular-nums text-right">
              {config.durationMinutes} Menit
            </dd>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <dt className="text-slate-500">Jumlah Soal</dt>
            <dd className="font-semibold text-slate-900 tabular-nums text-right">
              {questionCount} Butir Soal
            </dd>
          </div>
        </dl>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-xs sm:text-sm text-slate-800">
          <div className="flex items-center gap-2 font-bold text-red-700 mb-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Tata Tertib & Anti Tab Switch</span>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-700 leading-relaxed">
            <li>Ujian berjalan dalam mode Layar Penuh apabila didukung oleh perangkat Anda.</li>
            <li>
              Dilarang berpindah tab browser atau membuka aplikasi lain selama ujian berlangsung
              (batas toleransi {config.maxCheats} kali).
            </li>
            <li>
              Skor akhir dirahasiakan dari layar siswa dan dikirim otomatis ke rekap nilai guru
              pengampu.
            </li>
          </ul>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBack}
            className="py-3 px-5 rounded-lg font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="flex-1 py-3 px-5 rounded-lg font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Mulai Kerjakan Ujian ({config.durationMinutes} Menit)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
