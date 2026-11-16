import { CheckCircle2, Printer } from 'lucide-react';
import type { ExamResult } from '../types/cbt';

interface ExamResultViewProps {
  result: ExamResult;
  onReturnHome: () => void;
}

export function ExamResultView({ result, onReturnHome }: ExamResultViewProps) {
  return (
    <div className="w-full max-w-xl mx-auto py-4 sm:py-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
        <div className="text-center pb-5 border-b border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center mb-3">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            Ujian Telah Diselesaikan
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Tanda terima resmi pengiriman lembar jawaban peserta.
          </p>
        </div>

        <div className="my-5 bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs sm:text-sm text-blue-900">
          <p className="font-bold">Kerahasiaan Nilai Peserta</p>
          <p className="text-blue-800 mt-1 leading-relaxed">
            Sesuai regulasi ujian sekolah, skor akhir tidak ditampilkan pada layar peserta dan telah
            direkap otomatis ke panel guru mata pelajaran.
          </p>
        </div>

        <dl className="divide-y divide-slate-200 text-sm mb-6">
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">Nama Peserta</dt>
            <dd className="font-semibold text-slate-900 text-right">{result.student_name}</dd>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">NISN / No. Peserta</dt>
            <dd className="font-mono font-semibold text-slate-900 tabular-nums text-right">
              {result.student_nisn}
            </dd>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">Kelas / Rombel</dt>
            <dd className="font-semibold text-blue-700 text-right">{result.student_class}</dd>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">Mata Pelajaran</dt>
            <dd className="font-semibold text-slate-900 text-right">{result.subject}</dd>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">Waktu Pengumpulan</dt>
            <dd className="font-mono font-semibold text-slate-900 tabular-nums text-right">
              {result.completed_at}
            </dd>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">Jumlah Butir Soal</dt>
            <dd className="font-semibold text-slate-900 tabular-nums text-right">
              {result.total_questions} Butir
            </dd>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">Catatan Anti-Curang</dt>
            <dd className="font-semibold text-slate-800 tabular-nums text-right">
              {result.cheat_count} Kali Pelanggaran
            </dd>
          </div>
          <div className="py-2.5 flex justify-between gap-4">
            <dt className="text-slate-500">Status Pengiriman</dt>
            <dd className="font-semibold text-emerald-700 text-right">
              Terverifikasi Masuk Server ({result.finish_reason})
            </dd>
          </div>
        </dl>

        <div className="flex flex-col sm:flex-row gap-3 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Bukti Ujian</span>
          </button>
          <button
            type="button"
            onClick={onReturnHome}
            className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-blue-700 hover:bg-blue-800 transition cursor-pointer whitespace-nowrap"
          >
            Keluar / Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
