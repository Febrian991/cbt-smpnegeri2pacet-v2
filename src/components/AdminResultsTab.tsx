import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, RefreshCw, Trash2 } from 'lucide-react';
import type { ExamConfig, ExamResult, Teacher } from '../types/cbt';
import {
  computeResultStats,
  exportResultsToExcel,
  exportResultsToPDF,
  sortResultsByRank,
} from '../utils/exports';

interface AdminResultsTabProps {
  results: ExamResult[];
  config: ExamConfig;
  currentTeacher: Teacher;
  supabaseConfigured: boolean;
  onSyncCloud: () => Promise<string>;
  onClearResults: (subject: string) => Promise<void>;
}

export function AdminResultsTab({
  results,
  config,
  currentTeacher,
  supabaseConfigured,
  onSyncCloud,
  onClearResults,
}: AdminResultsTabProps) {
  const isProktor = currentTeacher.role === 'proktor';
  const [subjectFilter, setSubjectFilter] = useState<string>(
    isProktor ? 'ALL' : currentTeacher.subject
  );
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [syncNotice, setSyncNotice] = useState<string>('');
  const [syncing, setSyncing] = useState(false);

  const availableSubjects = useMemo(() => {
    const set = new Set<string>([config.activeSubject]);
    results.forEach((r) => set.add(r.subject));
    if (!isProktor) set.add(currentTeacher.subject);
    return Array.from(set).sort();
  }, [config.activeSubject, currentTeacher.subject, isProktor, results]);

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    results.forEach((r) => set.add(r.student_class));
    return Array.from(set).sort();
  }, [results]);

  const filteredResults = useMemo(() => {
    return sortResultsByRank(
      results.filter((r) => {
        const matchSub =
          subjectFilter === 'ALL' ||
          r.subject.toLowerCase().includes(subjectFilter.toLowerCase()) ||
          subjectFilter.toLowerCase().includes(r.subject.toLowerCase());
        const matchCls = classFilter === 'ALL' || r.student_class === classFilter;
        return matchSub && matchCls;
      })
    );
  }, [classFilter, results, subjectFilter]);

  const stats = useMemo(() => computeResultStats(filteredResults), [filteredResults]);

  async function handleSync() {
    setSyncing(true);
    setSyncNotice('');
    try {
      const msg = await onSyncCloud();
      setSyncNotice(msg);
    } finally {
      setSyncing(false);
    }
  }

  async function handleClear() {
    await onClearResults(subjectFilter);
    setSyncNotice('Rekap nilai pada filter terpilih berhasil dibersihkan.');
  }

  const activeSubjectLabel = subjectFilter === 'ALL' ? 'Semua Mata Pelajaran' : subjectFilter;

  return (
    <div className="space-y-5">
      {/* Filter & Cloud Sync Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm">
          <span className="font-semibold text-slate-700">Filter Rekap:</span>
          <select
            value={subjectFilter}
            disabled={!isProktor}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 font-semibold text-blue-700 bg-white outline-none disabled:bg-slate-100 disabled:text-slate-600"
          >
            {isProktor && <option value="ALL">Semua Mata Pelajaran</option>}
            {availableSubjects.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700 bg-white outline-none"
          >
            <option value="ALL">Semua Kelas</option>
            {availableClasses.map((cls) => (
              <option key={cls} value={cls}>
                Kelas {cls}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{supabaseConfigured ? 'Sinkron Cloud Supabase' : 'Muat Ulang Data Server'}</span>
        </button>
      </div>

      {syncNotice && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
          {syncNotice}
        </div>
      )}

      {/* 4 KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500 block">Rata-Rata Kelas</span>
          <div className="text-2xl font-bold text-blue-700 tabular-nums mt-1">{stats.avg}</div>
          <span className="text-xs text-slate-400 mt-0.5 block">Skala 0 - 100</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500 block">Nilai Tertinggi</span>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {stats.highest}
          </div>
          <span className="text-xs text-slate-500 truncate mt-0.5 block">
            {stats.highestStudent}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500 block">Nilai Terendah</span>
          <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {stats.lowest}
          </div>
          <span className="text-xs text-slate-500 truncate mt-0.5 block">
            {stats.lowestStudent}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500 block">Total Peserta</span>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {stats.total} Siswa
          </div>
          <span className="text-xs text-slate-600 tabular-nums mt-0.5 block">
            Ketuntasan (&ge;75): {stats.passRate}%
          </span>
        </div>
      </div>

      {/* Export & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Peringkat Hasil Ujian Siswa (Tertinggi ke Terendah)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Rekapitulasi otomatis siap unduh dalam format Microsoft Excel (.xlsx) maupun Dokumen PDF Resmi (.pdf).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filteredResults.length === 0}
            onClick={handleClear}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus Rekap</span>
          </button>

          <button
            type="button"
            disabled={filteredResults.length === 0}
            onClick={() => exportResultsToExcel(filteredResults, activeSubjectLabel, config.examTitle)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Download Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={filteredResults.length === 0}
            onClick={() =>
              exportResultsToPDF(
                filteredResults,
                activeSubjectLabel,
                config.examTitle,
                currentTeacher.name
              )
            }
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download PDF (.pdf)</span>
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredResults.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Belum ada hasil pengerjaan siswa untuk filter yang dipilih.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
                  <th className="p-3 text-center w-14">Rank</th>
                  <th className="p-3">Nama Siswa</th>
                  <th className="p-3">NISN</th>
                  <th className="p-3">Kelas</th>
                  <th className="p-3">Mata Pelajaran</th>
                  <th className="p-3 text-right">Nilai</th>
                  <th className="p-3 text-center">B / S / K</th>
                  <th className="p-3">Waktu Selesai</th>
                  <th className="p-3">Anti-Curang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredResults.map((r, idx) => {
                  const passed = r.final_score >= 75;
                  return (
                    <tr key={`${r.id}-${idx}`} className="hover:bg-slate-50">
                      <td className="p-3 text-center font-mono font-bold text-slate-700 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">{r.student_name}</td>
                      <td className="p-3 font-mono text-slate-600 tabular-nums">{r.student_nisn}</td>
                      <td className="p-3 text-slate-700 font-medium">{r.student_class}</td>
                      <td className="p-3 text-slate-600">{r.subject}</td>
                      <td className="p-3 text-right font-mono font-bold tabular-nums">
                        <span className={passed ? 'text-emerald-700' : 'text-amber-700'}>
                          {r.final_score}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-xs text-slate-600 tabular-nums">
                        {r.correct_count} / {r.incorrect_count} / {r.unattempted_count}
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-500 tabular-nums">
                        {r.completed_at}
                      </td>
                      <td className="p-3 text-xs font-semibold tabular-nums">
                        {r.cheat_count === 0 ? (
                          <span className="text-emerald-700">Bersih (0x)</span>
                        ) : (
                          <span className="text-red-700">
                            {r.cheat_count}x Pindah Tab
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
