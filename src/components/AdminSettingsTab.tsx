import { useState, type FormEvent } from 'react';
import { Check, Copy, Database, RefreshCw, Shuffle } from 'lucide-react';
import type { ExamConfig, Teacher } from '../types/cbt';
import { SUPABASE_SCHEMA_SQL } from '../data/defaults';

interface AdminSettingsTabProps {
  config: ExamConfig;
  currentTeacher: Teacher;
  supabaseConfigured: boolean;
  onSaveConfig: (config: ExamConfig, newPin?: string) => Promise<void>;
  onSyncCloud: () => Promise<string>;
}

export function AdminSettingsTab({
  config,
  currentTeacher,
  supabaseConfigured,
  onSaveConfig,
  onSyncCloud,
}: AdminSettingsTabProps) {
  const [examTitle, setExamTitle] = useState(config.examTitle);
  const [examSubtitle, setExamSubtitle] = useState(config.examSubtitle);
  const [activeSubject, setActiveSubject] = useState(config.activeSubject);
  const [durationMinutes, setDurationMinutes] = useState(config.durationMinutes);
  const [examToken, setExamToken] = useState(config.examToken);
  const [maxCheats, setMaxCheats] = useState(config.maxCheats);
  const [pin, setPin] = useState(currentTeacher.pin);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);

  function randomizeToken() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    setExamToken(out);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      await onSaveConfig(
        {
          examTitle: examTitle.trim(),
          examSubtitle: examSubtitle.trim(),
          activeSubject: activeSubject.trim(),
          durationMinutes: Math.max(1, Number(durationMinutes) || 80),
          examToken: examToken.trim().toUpperCase(),
          maxCheats: Math.max(1, Number(maxCheats) || 3),
        },
        pin.trim() !== currentTeacher.pin ? pin.trim() : undefined
      );
      setNotice('Pengaturan ujian dan PIN berhasil disimpan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCloudSync() {
    setSyncStatus('Menghubungkan ke Supabase...');
    const msg = await onSyncCloud();
    setSyncStatus(msg);
  }

  async function handleCopySql() {
    try {
      await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      setCopiedSql(true);
      window.setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Clipboard may be restricted
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left: Exam Schedule & Protection Config */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="pb-3 border-b border-slate-200 mb-4">
          <h3 className="text-base font-bold text-slate-900">
            Konfigurasi Jadwal &amp; Proteksi Ujian
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur judul ujian, token masuk peserta, alokasi waktu, dan batas pindah tab.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Judul Ujian
            </label>
            <input
              type="text"
              required
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Subjudul / Deskripsi Sesi
            </label>
            <input
              type="text"
              required
              value={examSubtitle}
              onChange={(e) => setExamSubtitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mata Pelajaran Aktif
              </label>
              <input
                type="text"
                required
                value={activeSubject}
                onChange={(e) => setActiveSubject(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alokasi Waktu (Menit)
              </label>
              <input
                type="number"
                min={1}
                max={300}
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 font-mono tabular-nums outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Token Masuk Ujian
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={examToken}
                onChange={(e) => setExamToken(e.target.value.toUpperCase())}
                className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 font-mono font-bold tracking-widest text-blue-700 uppercase outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={randomizeToken}
                className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Acak</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Toleransi Pindah Tab
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={maxCheats}
                onChange={(e) => setMaxCheats(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 font-mono tabular-nums outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                PIN Akun Saat Ini
              </label>
              <input
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 font-mono outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {notice && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-blue-700 hover:bg-blue-800 transition cursor-pointer"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan Pengaturan'}
          </button>
        </form>
      </div>

      {/* Right: Supabase Database Integration */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Database Cloud Supabase (cbt_exam_results)
              </h3>
              <p className="text-xs text-slate-500">
                Status:{' '}
                <span
                  className={`font-semibold ${
                    supabaseConfigured ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {supabaseConfigured
                    ? 'Terhubung via Environment Secrets'
                    : 'Mode Penyimpanan Server Lokal (Siap Sinkron Supabase)'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloudSync}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sinkron Sekarang</span>
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Seluruh hasil ujian siswa tersimpan otomatis di server aplikasi. Untuk mengaktifkan
          replikasi real-time ke proyek Supabase Anda, jalankan skrip SQL di bawah pada menu{' '}
          <strong className="text-slate-900">SQL Editor</strong> Supabase lalu atur variabel{' '}
          <code className="font-mono font-semibold text-slate-800">SUPABASE_URL</code> dan{' '}
          <code className="font-mono font-semibold text-slate-800">SUPABASE_ANON_KEY</code> pada
          panel Secrets.
        </p>

        {syncStatus && (
          <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-800">
            {syncStatus}
          </div>
        )}

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-700">
              supabase-schema.sql
            </span>
            <button
              type="button"
              onClick={handleCopySql}
              className="px-2.5 py-1 rounded text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer flex items-center gap-1"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin SQL</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-3.5 text-[11px] font-mono text-slate-800 bg-white overflow-x-auto max-h-72 leading-relaxed">
            {SUPABASE_SCHEMA_SQL}
          </pre>
        </div>
      </div>
    </div>
  );
}
