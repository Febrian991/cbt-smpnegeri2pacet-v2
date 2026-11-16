import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Download, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import type { OptionKey, Question, QuestionType, Teacher, TrueFalseStatement } from '../types/cbt';
import { DEFAULT_QUESTIONS } from '../data/defaults';
import { compressImageToDataUrl } from '../utils/exports';

interface AdminQuestionsTabProps {
  questions: Question[];
  activeSubject: string;
  currentTeacher: Teacher;
  onSaveQuestions: (questions: Question[]) => Promise<void>;
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E'];

export function AdminQuestionsTab({
  questions,
  activeSubject,
  currentTeacher,
  onSaveQuestions,
}: AdminQuestionsTabProps) {
  const isProktor = currentTeacher.role === 'proktor';
  const [subjectFilter, setSubjectFilter] = useState<string>(
    isProktor ? 'ALL' : currentTeacher.subject
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [qSubject, setQSubject] = useState(activeSubject);
  const [qType, setQType] = useState<QuestionType>('single');
  const [qText, setQText] = useState('');
  const [qImage, setQImage] = useState<string>('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [optE, setOptE] = useState('');
  const [correctSingle, setCorrectSingle] = useState<OptionKey>('A');
  const [correctMultiple, setCorrectMultiple] = useState<OptionKey[]>(['A']);
  const [tfStatements, setTfStatements] = useState<TrueFalseStatement[]>([
    { id: 'st-1', text: '', correct: 'B' },
    { id: 'st-2', text: '', correct: 'S' },
    { id: 'st-3', text: '', correct: 'B' },
  ]);
  const [qWeight, setQWeight] = useState(10);
  const [notice, setNotice] = useState('');

  const importJsonRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);

  const availableSubjects = useMemo(() => {
    const set = new Set<string>([activeSubject]);
    questions.forEach((q) => set.add(q.subject));
    return Array.from(set).sort();
  }, [activeSubject, questions]);

  const visibleQuestions = useMemo(() => {
    if (subjectFilter === 'ALL') return questions;
    return questions.filter(
      (q) => q.subject.toLowerCase() === subjectFilter.toLowerCase()
    );
  }, [questions, subjectFilter]);

  function openAddModal() {
    setEditingId(null);
    setQSubject(isProktor ? activeSubject : currentTeacher.subject);
    setQType('single');
    setQText('');
    setQImage('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setOptE('');
    setCorrectSingle('A');
    setCorrectMultiple(['A']);
    setTfStatements([
      { id: `st-${Date.now()}-1`, text: '', correct: 'B' },
      { id: `st-${Date.now()}-2`, text: '', correct: 'S' },
      { id: `st-${Date.now()}-3`, text: '', correct: 'B' },
    ]);
    setQWeight(10);
    setModalOpen(true);
  }

  function openEditModal(q: Question) {
    setEditingId(q.id);
    setQSubject(q.subject);
    setQType(q.type);
    setQText(q.text);
    setQImage(q.image ?? '');
    setOptA(q.options?.A ?? '');
    setOptB(q.options?.B ?? '');
    setOptC(q.options?.C ?? '');
    setOptD(q.options?.D ?? '');
    setOptE(q.options?.E ?? '');
    setCorrectSingle(q.correctSingle ?? 'A');
    setCorrectMultiple(q.correctMultiple ?? ['A']);
    setTfStatements(
      q.statements && q.statements.length > 0
        ? q.statements.map((s) => ({ ...s }))
        : [
            { id: `st-${Date.now()}-1`, text: '', correct: 'B' },
            { id: `st-${Date.now()}-2`, text: '', correct: 'S' },
          ]
    );
    setQWeight(q.weight || 10);
    setModalOpen(true);
  }

  async function handleImageSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setQImage(compressed);
    } catch {
      setNotice('Gagal memproses gambar lampiran.');
    }
    e.target.value = '';
  }

  async function handleSubmitQuestion(e: FormEvent) {
    e.preventDefault();
    const base: Question = {
      id: editingId ?? `q-${Date.now()}`,
      subject: qSubject.trim() || activeSubject,
      type: qType,
      text: qText.trim(),
      image: qImage || undefined,
      weight: Math.max(1, Number(qWeight) || 10),
    };

    if (qType === 'single' || qType === 'multiple') {
      base.options = {
        A: optA.trim() || 'Pilihan A',
        B: optB.trim() || 'Pilihan B',
        C: optC.trim() || 'Pilihan C',
        D: optD.trim() || 'Pilihan D',
        E: optE.trim(),
      };
      if (qType === 'single') {
        base.correctSingle = correctSingle;
      } else {
        base.correctMultiple = correctMultiple.length > 0 ? correctMultiple : ['A'];
      }
    } else {
      const validStatements = tfStatements.filter((s) => s.text.trim().length > 0);
      base.statements =
        validStatements.length > 0
          ? validStatements
          : [{ id: `st-${Date.now()}`, text: 'Pernyataan 1', correct: 'B' }];
    }

    const updated = editingId
      ? questions.map((item) => (item.id === editingId ? base : item))
      : [...questions, base];

    await onSaveQuestions(updated);
    setModalOpen(false);
    setNotice(editingId ? 'Butir soal berhasil diperbarui.' : 'Butir soal baru berhasil ditambahkan.');
  }

  async function handleDelete(id: string) {
    const updated = questions.filter((q) => q.id !== id);
    await onSaveQuestions(updated);
    setNotice('Butir soal dihapus.');
  }

  function handleExportJson() {
    const blob = new Blob([JSON.stringify(visibleQuestions, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bank-soal-cbt.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        await onSaveQuestions(parsed as Question[]);
        setNotice(`${parsed.length} soal berhasil diimpor dari berkas JSON.`);
      }
    } catch {
      setNotice('Berkas JSON tidak valid.');
    }
    e.target.value = '';
  }

  async function handleResetDefaults() {
    await onSaveQuestions(DEFAULT_QUESTIONS);
    setNotice('Bank soal dikembalikan ke 8 butir soal standar TKA.');
  }

  function toggleMultiKey(k: OptionKey) {
    setCorrectMultiple((prev) =>
      prev.includes(k) ? prev.filter((item) => item !== k) : [...prev, k]
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="text-sm font-bold text-slate-900 tabular-nums">
              {visibleQuestions.length} Butir Soal Tersedia
            </span>
            <p className="text-xs text-slate-500">
              Mendukung Pilihan Ganda Tunggal, Kompleks (&gt;1), &amp; Benar/Salah
            </p>
          </div>

          {isProktor && (
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-blue-700 bg-white outline-none"
            >
              <option value="ALL">Semua Mapel</option>
              {availableSubjects.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importJsonRef}
            type="file"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importJsonRef.current?.click()}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor JSON</span>
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor JSON</span>
          </button>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Soal</span>
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Soal</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
          {notice}
        </div>
      )}

      <div className="space-y-3">
        {visibleQuestions.map((q, idx) => (
          <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 mb-3">
              <div className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  No. {idx + 1}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-blue-700">
                  {q.type === 'single'
                    ? 'Pilihan Ganda Tunggal'
                    : q.type === 'multiple'
                    ? 'Pilihan Ganda Kompleks'
                    : 'Benar / Salah'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{q.subject}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">Bobot {q.weight}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(q)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 transition cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              </div>
            </div>

            <p className="text-sm text-slate-900 whitespace-pre-line leading-relaxed">{q.text}</p>

            {q.image && (
              <div className="mt-3 max-w-xs border border-slate-200 rounded-lg p-1.5 bg-slate-50">
                <img
                  src={q.image}
                  alt={`Gambar soal ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="max-h-36 object-contain mx-auto rounded"
                />
              </div>
            )}

            {q.options && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                {OPTION_KEYS.map((k) => {
                  const val = q.options?.[k];
                  if (!val) return null;
                  const isCorrect =
                    q.type === 'single'
                      ? q.correctSingle === k
                      : q.correctMultiple?.includes(k);
                  return (
                    <div
                      key={k}
                      className={`px-3 py-2 rounded-lg border ${
                        isCorrect
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="font-mono font-bold mr-1.5">{k}.</span>
                      {val}
                    </div>
                  );
                })}
              </div>
            )}

            {q.statements && (
              <div className="mt-3 space-y-1.5 text-xs">
                {q.statements.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200"
                  >
                    <span className="text-slate-800">{st.text}</span>
                    <span
                      className={`font-bold shrink-0 ${
                        st.correct === 'B' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {st.correct === 'B' ? 'Benar' : 'Salah'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add / Edit Question Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-base text-slate-900">
                {editingId ? 'Edit Butir Soal Ujian' : 'Tambah Butir Soal Ujian'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitQuestion} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Pelajaran
                  </label>
                  <input
                    type="text"
                    required
                    value={qSubject}
                    onChange={(e) => setQSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Format Tipe Soal
                  </label>
                  <select
                    value={qType}
                    onChange={(e) => setQType(e.target.value as QuestionType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-blue-700 outline-none"
                  >
                    <option value="single">Pilihan Ganda Tunggal (1 Kunci)</option>
                    <option value="multiple">Pilihan Ganda Kompleks (&gt; 1 Kunci)</option>
                    <option value="true_false">Tabel Pernyataan Benar / Salah</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teks Pertanyaan
                </label>
                <textarea
                  rows={3}
                  required
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="Tuliskan teks soal ujian di sini..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Direct Image Upload with Canvas Compression */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="block text-xs font-semibold text-slate-700 mb-2">
                  Upload File Gambar Lampiran (Opsional, Kompres Otomatis &le; 80KB)
                </span>
                <input
                  ref={imageUploadRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelected}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => imageUploadRef.current?.click()}
                    className="px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-700" />
                    <span>Pilih Gambar dari Perangkat</span>
                  </button>
                  {qImage && (
                    <button
                      type="button"
                      onClick={() => setQImage('')}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
                    >
                      Hapus Gambar
                    </button>
                  )}
                </div>
                {qImage && (
                  <div className="mt-3 p-2 bg-white border border-slate-200 rounded-lg max-w-xs mx-auto">
                    <img
                      src={qImage}
                      alt="Pratinjau lampiran soal"
                      className="max-h-36 object-contain mx-auto rounded"
                    />
                  </div>
                )}
              </div>

              {/* Options A-E */}
              {(qType === 'single' || qType === 'multiple') && (
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-slate-700">
                    Pilihan Jawaban (A - E)
                  </span>
                  {[
                    { key: 'A', val: optA, set: setOptA },
                    { key: 'B', val: optB, set: setOptB },
                    { key: 'C', val: optC, set: setOptC },
                    { key: 'D', val: optD, set: setOptD },
                    { key: 'E', val: optE, set: setOptE },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center gap-2">
                      <span className="w-6 font-mono font-bold text-slate-500 text-xs">
                        {item.key}
                      </span>
                      <input
                        type="text"
                        value={item.val}
                        onChange={(e) => item.set(e.target.value)}
                        placeholder={`Teks Pilihan ${item.key}${item.key === 'E' ? ' (Opsional)' : ''}`}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  ))}

                  {qType === 'single' ? (
                    <div className="pt-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kunci Jawaban Tunggal
                      </label>
                      <select
                        value={correctSingle}
                        onChange={(e) => setCorrectSingle(e.target.value as OptionKey)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-blue-700 outline-none"
                      >
                        {OPTION_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="pt-2">
                      <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Centang Kunci Jawaban Benar (&gt; 1):
                      </span>
                      <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        {OPTION_KEYS.map((k) => (
                          <label key={k} className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={correctMultiple.includes(k)}
                              onChange={() => toggleMultiKey(k)}
                              className="accent-blue-700"
                            />
                            <span>{k}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* True / False Matrix */}
              {qType === 'true_false' && (
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-slate-700">
                    Daftar Pernyataan &amp; Kunci Benar / Salah
                  </span>
                  {tfStatements.map((st, sIdx) => (
                    <div key={st.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={st.text}
                        onChange={(e) => {
                          const next = [...tfStatements];
                          next[sIdx] = { ...next[sIdx], text: e.target.value };
                          setTfStatements(next);
                        }}
                        placeholder={`Pernyataan ${sIdx + 1}`}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm outline-none"
                      />
                      <select
                        value={st.correct}
                        onChange={(e) => {
                          const next = [...tfStatements];
                          next[sIdx] = { ...next[sIdx], correct: e.target.value as 'B' | 'S' };
                          setTfStatements(next);
                        }}
                        className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 font-semibold bg-white text-xs"
                      >
                        <option value="B">Benar</option>
                        <option value="S">Salah</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bobot Nilai
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={qWeight}
                  onChange={(e) => setQWeight(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono tabular-nums outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 cursor-pointer"
                >
                  Simpan Soal Ujian
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
