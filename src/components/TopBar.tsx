import { Lock, LogOut } from 'lucide-react';
import type { Teacher } from '../types/cbt';

interface TopBarProps {
  currentTeacher: Teacher | null;
  inExamRoom: boolean;
  supabaseConfigured: boolean;
  onOpenAdminLogin: () => void;
  onAdminLogout: () => void;
}

export function TopBar({
  currentTeacher,
  inExamRoom,
  supabaseConfigured,
  onOpenAdminLogin,
  onAdminLogout,
}: TopBarProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-blue-700 text-white font-extrabold text-sm tracking-tight flex items-center justify-center">
            CBT
          </div>
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            CBT Computer Based Test
          </span>
        </div>

        {/* Zone 2: Clean Context Metadata (No pills) */}
        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-500 truncate">
          {currentTeacher ? (
            <>
              <span className="text-slate-700 font-semibold truncate max-w-[220px]">
                {currentTeacher.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[200px]">
                {currentTeacher.role === 'proktor'
                  ? 'Proktor Utama (Semua Mapel)'
                  : `Mapel: ${currentTeacher.subject}`}
              </span>
            </>
          ) : (
            <>
              <span>13 Guru Mapel</span>
              <span aria-hidden="true">·</span>
              <span>Kapasitas 250 Siswa</span>
              <span aria-hidden="true">·</span>
              <span>{supabaseConfigured ? 'Cloud Supabase Aktif' : 'Penyimpanan Server Lokal'}</span>
            </>
          )}
        </div>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          {currentTeacher ? (
            <button
              type="button"
              onClick={onAdminLogout}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Panel</span>
            </button>
          ) : (
            !inExamRoom && (
              <button
                type="button"
                onClick={onOpenAdminLogin}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Panel Proktor & Guru</span>
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
