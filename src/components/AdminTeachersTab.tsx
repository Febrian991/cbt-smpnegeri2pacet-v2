import { useMemo, useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Teacher } from '../types/cbt';

interface AdminTeachersTabProps {
  teachers: Teacher[];
  currentTeacher: Teacher;
  onSaveTeachers: (teachers: Teacher[]) => Promise<void>;
}

export function AdminTeachersTab({
  teachers,
  currentTeacher,
  onSaveTeachers,
}: AdminTeachersTabProps) {
  const isProktor = currentTeacher.role === 'proktor';
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [subject, setSubject] = useState('');
  const [pin, setPin] = useState('guru123');

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.nip.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
    );
  }, [search, teachers]);

  function openAdd() {
    setEditingId(null);
    setName('');
    setNip('');
    setSubject('');
    setPin('guru123');
    setModalOpen(true);
  }

  function openEdit(t: Teacher) {
    setEditingId(t.id);
    setName(t.name);
    setNip(t.nip);
    setSubject(t.subject);
    setPin(t.pin);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !nip.trim() || !subject.trim() || !pin.trim()) return;

    if (editingId) {
      const updated = teachers.map((t) =>
        t.id === editingId
          ? {
              ...t,
              name: name.trim(),
              nip: nip.trim(),
              subject: subject.trim(),
              pin: pin.trim(),
            }
          : t
      );
      await onSaveTeachers(updated);
      setNotice(`Data akun ${name.trim()} berhasil diperbarui.`);
    } else {
      const created: Teacher = {
        id: `t-${Date.now()}`,
        name: name.trim(),
        nip: nip.trim(),
        subject: subject.trim(),
        pin: pin.trim(),
        role: 'guru',
      };
      await onSaveTeachers([...teachers, created]);
      setNotice(`Akun guru baru ${created.name} berhasil ditambahkan.`);
    }
    setModalOpen(false);
  }

  async function handleResetAllPins() {
    const updated = teachers.map((t) =>
      t.role === 'guru' ? { ...t, pin: 'guru123' } : t
    );
    await onSaveTeachers(updated);
    setNotice('PIN seluruh 13 guru mata pelajaran berhasil direset ke "guru123".');
  }

  async function handleDelete(t: Teacher) {
    if (t.role === 'proktor') {
      setNotice('Akun Proktor Utama tidak dapat dihapus.');
      return;
    }
    await onSaveTeachers(teachers.filter((item) => item.id !== t.id));
    setNotice(`Akun guru ${t.name} dihapus.`);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900">
            Pangkalan Data Akun Guru &amp; Proktor
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isProktor
              ? 'Kelola akun guru mata pelajaran, NIP login, ampu mapel, dan reset PIN.'
              : 'Mode lihat akun pengampu mata pelajaran sekolah.'}
          </p>
        </div>

        {isProktor && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAdd}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Guru Baru</span>
            </button>
            <button
              type="button"
              onClick={handleResetAllPins}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Reset PIN Guru (guru123)</span>
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
          {notice}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, NIP, atau mata pelajaran..."
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm w-72 max-w-full outline-none focus:ring-2 focus:ring-blue-600"
          />
          <span className="text-xs font-semibold text-slate-600 tabular-nums">
            Total: {teachers.length} Akun ({teachers.filter((t) => t.role === 'guru').length} Guru)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
                <th className="p-3 text-center w-14">No</th>
                <th className="p-3">NIP / Username</th>
                <th className="p-3">Nama Lengkap Guru</th>
                <th className="p-3">Mata Pelajaran</th>
                <th className="p-3">PIN Login</th>
                {isProktor && <th className="p-3 text-center w-36">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTeachers.map((t, idx) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="p-3 text-center font-mono text-slate-500 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="p-3 font-mono font-semibold text-slate-800 tabular-nums">
                    {t.nip}
                  </td>
                  <td className="p-3 font-semibold text-slate-900">
                    {t.name}
                    {t.role === 'proktor' && (
                      <span className="ml-2 text-xs font-semibold text-blue-700">
                        · Proktor
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-700">
                    {t.subject === 'ALL' ? 'Semua Mata Pelajaran' : t.subject}
                  </td>
                  <td className="p-3 font-mono text-slate-700">
                    {isProktor || t.id === currentTeacher.id ? t.pin : '••••••'}
                  </td>
                  {isProktor && (
                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        {t.role !== 'proktor' && (
                          <button
                            type="button"
                            onClick={() => handleDelete(t)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Teacher Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-base text-slate-900">
                {editingId ? 'Edit Data & PIN Guru' : 'Tambah Guru Mata Pelajaran'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap &amp; Gelar
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Budi Santoso, S.Pd."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  NIP / ID Login
                </label>
                <input
                  type="text"
                  required
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mata Pelajaran yang Diampu
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Contoh: Matematika"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN / Password Akun
                </label>
                <input
                  type="text"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 cursor-pointer"
                >
                  Simpan Data Guru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
