import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  FileSpreadsheet,
  KeyRound,
  Plus,
  Printer,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { ExamConfig, Student } from '../types/cbt';
import { generateDemo250Students } from '../data/defaults';
import { downloadStudentExcelTemplate, parseStudentsExcelFile } from '../utils/exports';

interface AdminStudentsTabProps {
  students: Student[];
  config: ExamConfig;
  onSaveStudents: (students: Student[]) => Promise<void>;
}

export function AdminStudentsTab({
  students,
  config,
  onSaveStudents,
}: AdminStudentsTabProps) {
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [cardsModalOpen, setCardsModalOpen] = useState(false);
  const [cardsClassFilter, setCardsClassFilter] = useState('ALL');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newNisn, setNewNisn] = useState('');
  const [newName, setNewName] = useState('');
  const [newClass, setNewClass] = useState('IX-A');
  const [newPass, setNewPass] = useState('123');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.nisn.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
    );
  }, [search, students]);

  const classList = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => set.add(s.className));
    return Array.from(set).sort();
  }, [students]);

  const previewCardsStudents = useMemo(() => {
    if (cardsClassFilter === 'ALL') return students;
    return students.filter((s) => s.className === cardsClassFilter);
  }, [cardsClassFilter, students]);

  async function handleImportExcel(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await parseStudentsExcelFile(file);
      if (imported.length === 0) {
        setNotice('Tidak ada baris siswa valid di berkas Excel.');
      } else {
        await onSaveStudents(imported);
        setNotice(`${imported.length} data siswa berhasil diimpor dari Excel.`);
      }
    } catch {
      setNotice('Gagal membaca berkas Excel (.xlsx).');
    }
    e.target.value = '';
  }

  async function handleGenerate250() {
    const demo = generateDemo250Students();
    await onSaveStudents(demo);
    setNotice('250 akun siswa demo lintas kelas IX-A s/d IX-H berhasil dibuat.');
  }

  async function handleResetAllPasswords() {
    const updated = students.map((s) => ({ ...s, password: '123' }));
    await onSaveStudents(updated);
    setNotice('Password seluruh siswa berhasil direset ke "123".');
  }

  async function handleClearAll() {
    await onSaveStudents([]);
    setNotice('Seluruh data siswa dikosongkan.');
  }

  async function handleDeleteOne(id: string) {
    await onSaveStudents(students.filter((s) => s.id !== id));
  }

  async function handleAddStudent(e: FormEvent) {
    e.preventDefault();
    if (!newNisn.trim() || !newName.trim()) return;
    const item: Student = {
      id: `s-${Date.now()}`,
      nisn: newNisn.trim(),
      name: newName.trim(),
      className: newClass.trim() || 'IX-A',
      password: newPass.trim() || '123',
    };
    await onSaveStudents([item, ...students]);
    setNewNisn('');
    setNewName('');
    setAddModalOpen(false);
    setNotice(`Siswa ${item.name} berhasil ditambahkan.`);
  }

  return (
    <div className="space-y-4">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900">
            Pangkalan Data Peserta Ujian
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Total terdaftar: <span className="font-bold text-blue-700">{students.length} Siswa</span> · Kapasitas 250+ peserta
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Siswa</span>
          </button>

          <button
            type="button"
            onClick={downloadStudentExcelTemplate}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Template Excel</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor Excel</span>
          </button>

          <button
            type="button"
            disabled={students.length === 0}
            onClick={() => setCardsModalOpen(true)}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Kartu Peserta</span>
          </button>

          <button
            type="button"
            disabled={students.length === 0}
            onClick={handleResetAllPasswords}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Reset Password (123)</span>
          </button>

          <button
            type="button"
            onClick={handleGenerate250}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Isi 250 Siswa Demo</span>
          </button>

          <button
            type="button"
            disabled={students.length === 0}
            onClick={handleClearAll}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus Semua</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 no-print">
          {notice}
        </div>
      )}

      {/* Search & Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
        <div className="p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, NISN, atau kelas..."
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm w-72 max-w-full outline-none focus:ring-2 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-500 tabular-nums">
            Menampilkan {filteredStudents.length} dari {students.length} siswa
          </span>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
              <tr>
                <th className="p-3 text-center w-14">No</th>
                <th className="p-3">NISN</th>
                <th className="p-3">Nama Lengkap Siswa</th>
                <th className="p-3">Kelas</th>
                <th className="p-3">Password Login</th>
                <th className="p-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStudents.map((s, idx) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="p-3 text-center font-mono text-slate-500 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="p-3 font-mono font-semibold text-slate-800 tabular-nums">
                    {s.nisn}
                  </td>
                  <td className="p-3 font-semibold text-slate-900">{s.name}</td>
                  <td className="p-3 text-slate-700">{s.className}</td>
                  <td className="p-3 font-mono text-slate-700">{s.password}</td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteOne(s.id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 cursor-pointer"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Tidak ada data siswa yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-base text-slate-900">Tambah Peserta Ujian</h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NISN</label>
                <input
                  type="text"
                  required
                  value={newNisn}
                  onChange={(e) => setNewNisn(e.target.value)}
                  placeholder="Contoh: 0081234513"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nama lengkap siswa"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                  <input
                    type="text"
                    required
                    value={newClass}
                    onChange={(e) => setNewClass(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <input
                    type="text"
                    required
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono outline-none"
                  />
                </div>
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 cursor-pointer"
                >
                  Simpan Siswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Participant Cards Modal & Print Sheet */}
      {cardsModalOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Pratinjau Cetak Kartu Peserta Ujian
                  </h3>
                  <p className="text-xs text-slate-500">
                    Format 2 kartu per baris · Siap potong dan bagikan ke siswa
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={cardsClassFilter}
                    onChange={(e) => setCardsClassFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-blue-700 bg-white outline-none"
                  >
                    <option value="ALL">Semua Kelas</option>
                    {classList.map((cls) => (
                      <option key={cls} value={cls}>
                        Kelas {cls}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setCardsModalOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {previewCardsStudents.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white border border-slate-300 rounded-lg p-4 text-xs"
                    >
                      <div className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-2 flex justify-between">
                        <span>KARTU PESERTA CBT</span>
                        <span className="text-blue-700">{s.className}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Nama:</span>
                          <span className="font-semibold text-slate-900">{s.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">NISN / Login:</span>
                          <span className="font-mono font-bold text-slate-900">{s.nisn}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Password:</span>
                          <span className="font-mono font-bold text-slate-900">{s.password}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Token Ujian:</span>
                          <span className="font-mono font-bold text-blue-700">
                            {config.examToken}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 tabular-nums">
                  Total kartu dicetak: {previewCardsStudents.length} Kartu
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCardsModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak Sekarang</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Dedicated Print-Only Area */}
          <div className="hidden print-only-block p-4">
            <div className="print-card-grid">
              {previewCardsStudents.map((s) => (
                <div
                  key={`print-${s.id}`}
                  className="print-card-item border border-slate-400 rounded-md p-3 text-xs"
                >
                  <div className="font-bold border-b border-slate-300 pb-1.5 mb-1.5 flex justify-between">
                    <span>{config.examTitle}</span>
                    <span>{s.className}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Nama:</span>
                      <span className="font-bold">{s.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>NISN:</span>
                      <span className="font-mono font-bold">{s.nisn}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Password:</span>
                      <span className="font-mono font-bold">{s.password}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Token:</span>
                      <span className="font-mono font-bold">{config.examToken}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
