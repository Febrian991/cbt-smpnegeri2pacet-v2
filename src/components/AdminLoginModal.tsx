import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, X } from 'lucide-react';
import type { Teacher } from '../types/cbt';

interface AdminLoginModalProps {
  open: boolean;
  teachers: Teacher[];
  onClose: () => void;
  onSuccess: (teacher: Teacher) => void;
}

export function AdminLoginModal({
  open,
  teachers,
  onClose,
  onSuccess,
}: AdminLoginModalProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const normalized = username.trim().toLowerCase();
    const matched = teachers.find(
      (t) => t.nip.toLowerCase() === normalized || t.name.toLowerCase() === normalized
    );

    if (!matched || matched.pin !== pin) {
      setError('Username/NIP atau PIN tidak sesuai. Periksa kembali kredensial Anda.');
      return;
    }

    setUsername('');
    setPin('');
    onSuccess(matched);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Autentikasi Proktor & Guru</h3>
              <p className="text-xs text-slate-500">Masuk dengan NIP / Username & PIN</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label
              htmlFor="adminUsernameInput"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Username / NIP Guru
            </label>
            <input
              id="adminUsernameInput"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Contoh: admin atau NIP guru"
              autoComplete="username"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="adminPinInput" className="text-xs font-semibold text-slate-700">
                PIN / Kata Sandi
              </label>
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="text-xs text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPin ? 'Sembunyikan' : 'Lihat PIN'}</span>
              </button>
            </div>
            <input
              id="adminPinInput"
              type={showPin ? 'text' : 'password'}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Masukkan PIN"
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm font-mono tracking-wider outline-none"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <div>
              Proktor Utama: <code className="font-mono font-semibold text-slate-900">admin</code> ·
              PIN: <code className="font-mono font-semibold text-slate-900">admin123</code>
            </div>
            <div>
              Guru Mapel (NIP contoh):{' '}
              <code className="font-mono font-semibold text-slate-900">198103122005011001</code> ·
              PIN: <code className="font-mono font-semibold text-slate-900">guru123</code>
            </div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 transition cursor-pointer"
            >
              Masuk Panel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
