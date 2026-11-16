import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  LayoutGrid,
  X,
} from 'lucide-react';
import type {
  ExamConfig,
  ExamResult,
  OptionKey,
  Question,
  Student,
  StudentAnswerValue,
} from '../types/cbt';
import { formatCountdown, formatTimeNowID, gradeExam, isQuestionAnswered } from '../utils/scoring';
import { playCheatWarningBeep } from '../utils/audio';

interface ExamRoomViewProps {
  student: Student;
  config: ExamConfig;
  questions: Question[];
  onFinishExam: (result: ExamResult) => Promise<void>;
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E'];

export function ExamRoomView({
  student,
  config,
  questions,
  onFinishExam,
}: ExamRoomViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerValue>>({});
  const [doubts, setDoubts] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(config.durationMinutes * 60);
  const [fontScale, setFontScale] = useState<'sm' | 'base' | 'lg'>('base');
  const [cheatCount, setCheatCount] = useState(0);
  const [cheatModalOpen, setCheatModalOpen] = useState(false);
  const [cheatReason, setCheatReason] = useState('');
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submittedRef = useRef(false);
  const lastCheatTimestampRef = useRef(0);
  const answersRef = useRef(answers);
  const cheatCountRef = useRef(cheatCount);
  answersRef.current = answers;
  cheatCountRef.current = cheatCount;

  const currentQuestion = questions[currentIndex];

  const triggerSubmit = useCallback(
    async (reason: string, finalCheats?: number) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);

      const usedCheats = finalCheats ?? cheatCountRef.current;
      const breakdown = gradeExam(questions, answersRef.current);

      const payload: ExamResult = {
        id: `res-${Date.now()}`,
        student_name: student.name,
        student_nisn: student.nisn,
        student_class: student.className,
        exam_title: config.examTitle,
        subject: config.activeSubject,
        final_score: breakdown.finalScore,
        correct_count: breakdown.correctCount,
        incorrect_count: breakdown.incorrectCount,
        unattempted_count: breakdown.unattemptedCount,
        total_questions: breakdown.totalQuestions,
        cheat_count: usedCheats,
        completed_at: formatTimeNowID(),
        finish_reason: reason,
        raw_data: {
          answers: answersRef.current,
        },
      };

      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch {
        // Ignore fullscreen exit errors
      }

      await onFinishExam(payload);
    },
    [config.activeSubject, config.examTitle, onFinishExam, questions, student.className, student.name, student.nisn]
  );

  // Countdown Timer
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          void triggerSubmit('Waktu Habis');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [triggerSubmit]);

  // Anti Tab Switch & Window Blur Detection
  useEffect(() => {
    function registerViolation(reason: string) {
      if (submittedRef.current) return;
      const now = Date.now();
      if (now - lastCheatTimestampRef.current < 1200) return;
      lastCheatTimestampRef.current = now;

      playCheatWarningBeep();
      setCheatCount((prev) => {
        const next = prev + 1;
        cheatCountRef.current = next;
        if (next > config.maxCheats) {
          void triggerSubmit('Auto-Submit Pelanggaran Tab', next);
        } else {
          setCheatReason(reason);
          setCheatModalOpen(true);
        }
        return next;
      });
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        registerViolation('Anda terdeteksi meninggalkan tab ujian.');
      }
    }

    function handleWindowBlur() {
      if (!document.hasFocus()) {
        registerViolation('Jendela ujian kehilangan fokus atau berpindah aplikasi.');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [config.maxCheats, triggerSubmit]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (finishModalOpen || cheatModalOpen) return;
      if (e.key === 'ArrowRight') {
        setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key.toLowerCase() === 'r' && currentQuestion) {
        setDoubts((prev) => ({
          ...prev,
          [currentQuestion.id]: !prev[currentQuestion.id],
        }));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cheatModalOpen, currentQuestion, finishModalOpen, questions.length]);

  if (!currentQuestion) {
    return null;
  }

  const answeredCount = questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length;
  const doubtCount = questions.filter((q) => doubts[q.id]).length;
  const unansweredCount = questions.length - answeredCount;
  const isTimeCritical = secondsLeft <= 300;

  function selectSingleOption(opt: OptionKey) {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }));
  }

  function toggleMultipleOption(opt: OptionKey) {
    setAnswers((prev) => {
      const existing = Array.isArray(prev[currentQuestion.id])
        ? ([...(prev[currentQuestion.id] as OptionKey[])] as OptionKey[])
        : [];
      const idx = existing.indexOf(opt);
      if (idx >= 0) existing.splice(idx, 1);
      else existing.push(opt);
      return { ...prev, [currentQuestion.id]: existing };
    });
  }

  function selectTrueFalse(statementId: string, val: 'B' | 'S') {
    setAnswers((prev) => {
      const existing =
        typeof prev[currentQuestion.id] === 'object' && !Array.isArray(prev[currentQuestion.id])
          ? { ...(prev[currentQuestion.id] as Record<string, 'B' | 'S'>) }
          : {};
      existing[statementId] = val;
      return { ...prev, [currentQuestion.id]: existing };
    });
  }

  function toggleCurrentDoubt() {
    setDoubts((prev) => ({
      ...prev,
      [currentQuestion.id]: !prev[currentQuestion.id],
    }));
  }

  const questionTypeLabel =
    currentQuestion.type === 'single'
      ? 'Pilihan Ganda Tunggal'
      : currentQuestion.type === 'multiple'
      ? 'Pilihan Ganda Kompleks (> 1 Jawaban)'
      : 'Tabel Pernyataan Benar / Salah';

  const proseSizeClass =
    fontScale === 'sm' ? 'text-sm' : fontScale === 'lg' ? 'text-lg' : 'text-base';

  function renderPaletteButtons(closeDrawerAfter = false) {
    return questions.map((q, idx) => {
      const isActive = idx === currentIndex;
      const isDoubt = Boolean(doubts[q.id]);
      const isAnswered = isQuestionAnswered(q, answers[q.id]);

      let style = 'bg-white text-slate-700 border-slate-300 hover:border-blue-500';
      if (isDoubt) {
        style = 'bg-amber-500 text-white border-amber-500';
      } else if (isAnswered) {
        style = 'bg-emerald-600 text-white border-emerald-600';
      }

      return (
        <button
          key={q.id}
          type="button"
          onClick={() => {
            setCurrentIndex(idx);
            if (closeDrawerAfter) setDrawerOpen(false);
          }}
          className={`h-10 rounded-lg border font-mono text-xs font-bold tabular-nums transition cursor-pointer flex items-center justify-center ${style} ${
            isActive ? 'ring-2 ring-blue-700 ring-offset-1' : ''
          }`}
        >
          {idx + 1}
        </button>
      );
    });
  }

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 select-none">
      {/* Top Exam Status Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{student.name}</div>
          <div className="text-xs text-slate-500 truncate">
            {student.className} · {config.activeSubject}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Font Scale Control */}
          <div className="hidden md:flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 text-xs font-bold text-slate-700">
            <button
              type="button"
              onClick={() => setFontScale('sm')}
              className={`px-2 py-1 rounded cursor-pointer ${
                fontScale === 'sm' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
              }`}
              title="Perkecil Teks"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontScale('base')}
              className={`px-2 py-1 rounded cursor-pointer ${
                fontScale === 'base' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
              }`}
              title="Ukuran Standar"
            >
              A
            </button>
            <button
              type="button"
              onClick={() => setFontScale('lg')}
              className={`px-2 py-1 rounded cursor-pointer ${
                fontScale === 'lg' ? 'bg-white text-blue-700 shadow-xs' : 'hover:text-slate-900'
              }`}
              title="Perbesar Teks"
            >
              A+
            </button>
          </div>

          {/* Violation Indicator */}
          <div
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold tabular-nums flex items-center gap-1.5 whitespace-nowrap ${
              cheatCount > 0
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              Pelanggaran {cheatCount}/{config.maxCheats}
            </span>
          </div>

          {/* Timer */}
          <div
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 whitespace-nowrap ${
              isTimeCritical
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span className="font-mono text-sm sm:text-base font-bold tabular-nums">
              {formatCountdown(secondsLeft)}
            </span>
          </div>

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Soal</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Exam Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Question Card (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 flex flex-col min-h-[500px]">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 mb-5">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-md bg-blue-700 text-white font-bold tabular-nums">
                Soal {currentIndex + 1} / {questions.length}
              </span>
              <span className="text-slate-600 font-semibold">{questionTypeLabel}</span>
            </div>

            <button
              type="button"
              onClick={() => setFinishModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer whitespace-nowrap"
            >
              Selesai Ujian
            </button>
          </div>

          {/* Question Body */}
          <div className="flex-1">
            <p className={`text-slate-900 font-medium leading-relaxed whitespace-pre-line ${proseSizeClass}`}>
              {currentQuestion.text}
            </p>

            {currentQuestion.image && (
              <div className="mt-4 max-w-lg mx-auto border border-slate-200 rounded-xl p-2 bg-slate-50">
                <img
                  src={currentQuestion.image}
                  alt={`Ilustrasi soal nomor ${currentIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-80 object-contain rounded-lg mx-auto"
                />
              </div>
            )}

            {/* Single Choice Options */}
            {currentQuestion.type === 'single' && currentQuestion.options && (
              <div className="mt-6 space-y-2.5">
                {OPTION_KEYS.map((key) => {
                  const text = currentQuestion.options?.[key];
                  if (!text) return null;
                  const selected = answers[currentQuestion.id] === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => selectSingleOption(key)}
                      className={`w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                        selected
                          ? 'border-blue-700 bg-blue-50/70 text-slate-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 border ${
                          selected
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {key}
                      </span>
                      <span className={`pt-0.5 leading-relaxed ${proseSizeClass}`}>{text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Multiple Choice Options */}
            {currentQuestion.type === 'multiple' && currentQuestion.options && (
              <div className="mt-6 space-y-2.5">
                <p className="text-xs font-semibold text-blue-700 mb-2">
                  Petunjuk: Centang semua pilihan jawaban yang benar (lebih dari satu).
                </p>
                {OPTION_KEYS.map((key) => {
                  const text = currentQuestion.options?.[key];
                  if (!text) return null;
                  const selectedArr = Array.isArray(answers[currentQuestion.id])
                    ? (answers[currentQuestion.id] as OptionKey[])
                    : [];
                  const checked = selectedArr.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleMultipleOption(key)}
                      className={`w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                        checked
                          ? 'border-blue-700 bg-blue-50/70 text-slate-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={checked}
                        className="mt-1 w-4 h-4 accent-blue-700 pointer-events-none shrink-0"
                      />
                      <span className="font-mono text-xs font-bold text-slate-500 pt-1 shrink-0">
                        {key}.
                      </span>
                      <span className={`leading-relaxed ${proseSizeClass}`}>{text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* True/False Matrix */}
            {currentQuestion.type === 'true_false' && currentQuestion.statements && (
              <div className="mt-6 overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                      <th className="p-3">Pernyataan</th>
                      <th className="p-3 text-center w-24">Benar</th>
                      <th className="p-3 text-center w-24">Salah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {currentQuestion.statements.map((st) => {
                      const map =
                        typeof answers[currentQuestion.id] === 'object' &&
                        !Array.isArray(answers[currentQuestion.id])
                          ? (answers[currentQuestion.id] as Record<string, 'B' | 'S'>)
                          : {};
                      const choice = map[st.id];
                      return (
                        <tr key={st.id} className="hover:bg-slate-50/70">
                          <td className={`p-3 text-slate-800 ${proseSizeClass}`}>{st.text}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => selectTrueFalse(st.id, 'B')}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                                choice === 'B'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              Benar
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => selectTrueFalse(st.id, 'S')}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                                choice === 'S'
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              Salah
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom Navigation Bar */}
          <div className="mt-8 pt-5 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>

            <button
              type="button"
              onClick={toggleCurrentDoubt}
              className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold border transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                doubts[currentQuestion.id]
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Ragu-ragu</span>
            </button>

            {currentIndex < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setFinishModalOpen(true)}
                className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer whitespace-nowrap"
              >
                Kumpulkan Ujian
              </button>
            )}
          </div>
        </div>

        {/* Desktop Question Palette (4 cols) */}
        <aside className="hidden lg:block lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
            <h3 className="font-bold text-sm text-slate-900">Navigasi Nomor Soal</h3>
            <span className="text-xs text-slate-500">Klik nomor untuk lompat</span>
          </div>

          <div className="grid grid-cols-5 gap-2.5 max-h-[360px] overflow-y-auto p-0.5">
            {renderPaletteButtons(false)}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-3.5 h-3.5 rounded bg-emerald-600 inline-block" />
                Sudah Dijawab
              </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {answeredCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-3.5 h-3.5 rounded bg-amber-500 inline-block" />
                Ditandai Ragu-ragu
              </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">{doubtCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="w-3.5 h-3.5 rounded border border-slate-300 bg-white inline-block" />
                Belum Dijawab
              </span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {unansweredCount}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile Question Palette Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
          <div className="bg-white w-80 max-w-full h-full p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-sm text-slate-900">Daftar Nomor Soal</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto flex-1">
              {renderPaletteButtons(true)}
            </div>
          </div>
        </div>
      )}

      {/* Finish Confirmation Modal */}
      {finishModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Kumpulkan Lembar Jawaban?</h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Pastikan Anda telah memeriksa kembali seluruh jawaban sebelum mengakhiri ujian.
            </p>

            <div className="grid grid-cols-3 gap-3 py-4 my-4 border-y border-slate-200 text-center">
              <div>
                <span className="text-xs text-slate-500 block">Dijawab</span>
                <span className="text-lg font-bold text-emerald-700 tabular-nums">
                  {answeredCount}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Ragu-ragu</span>
                <span className="text-lg font-bold text-amber-600 tabular-nums">{doubtCount}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Kosong</span>
                <span className="text-lg font-bold text-slate-600 tabular-nums">
                  {unansweredCount}
                </span>
              </div>
            </div>

            {(unansweredCount > 0 || doubtCount > 0) && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                Perhatian: Masih terdapat {unansweredCount} soal kosong dan {doubtCount} soal
                ditandai ragu-ragu.
              </p>
            )}

            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setFinishModalOpen(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void triggerSubmit('Selesai')}
                className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Ya, Selesaikan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anti-Cheat Warning Modal */}
      {cheatModalOpen && (
        <div className="fixed inset-0 z-50 bg-red-950/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center border-2 border-red-600">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-700 mx-auto flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-red-700">Peringatan Pindah Tab</h3>
            <p className="text-xs sm:text-sm text-slate-700 mt-2">{cheatReason}</p>

            <div className="my-4 p-3 rounded-lg bg-red-50 border border-red-200">
              <span className="text-sm font-bold text-red-800 tabular-nums block">
                Pelanggaran: {cheatCount} / {config.maxCheats}
              </span>
              <span className="text-xs text-red-700 mt-1 block">
                Jika melebihi {config.maxCheats} kali, ujian dihentikan otomatis dan jawaban langsung
                dikumpulkan.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setCheatModalOpen(false)}
              className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-red-600 hover:bg-red-700 transition cursor-pointer"
            >
              Kembali ke Lembar Soal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
