import { useEffect, useMemo, useState } from 'react';
import type {
  ExamConfig,
  ExamResult,
  Question,
  Student,
  Teacher,
} from './types/cbt';
import {
  DEFAULT_CONFIG,
  DEFAULT_QUESTIONS,
  DEFAULT_RESULTS,
  DEFAULT_STUDENTS,
  DEFAULT_TEACHERS,
} from './data/defaults';
import {
  clearResultsApi,
  fetchBootstrap,
  saveConfigApi,
  saveQuestionsApi,
  saveStudentsApi,
  saveTeachersApi,
  submitExamResultApi,
  syncSupabaseApi,
} from './lib/api';
import { TopBar } from './components/TopBar';
import { StudentLoginView } from './components/StudentLoginView';
import { ExamConfirmView } from './components/ExamConfirmView';
import { ExamRoomView } from './components/ExamRoomView';
import { ExamResultView } from './components/ExamResultView';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminDashboardView } from './components/AdminDashboardView';

type AppView = 'login' | 'confirm' | 'exam' | 'result' | 'admin';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>('login');

  const [config, setConfig] = useState<ExamConfig>(DEFAULT_CONFIG);
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const [students, setStudents] = useState<Student[]>(DEFAULT_STUDENTS);
  const [teachers, setTeachers] = useState<Teacher[]>(DEFAULT_TEACHERS);
  const [results, setResults] = useState<ExamResult[]>(DEFAULT_RESULTS);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);

  const [activeStudent, setActiveStudent] = useState<Student | null>(null);
  const [lastResult, setLastResult] = useState<ExamResult | null>(null);
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchBootstrap()
      .then((data) => {
        if (!mounted) return;
        setConfig(data.config);
        setQuestions(data.questions);
        setStudents(data.students);
        setTeachers(data.teachers);
        setResults(data.results);
        setSupabaseConfigured(data.supabaseConfigured);
      })
      .catch(() => {
        // Fallback to defaults already initialized in state
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const examQuestions = useMemo(() => {
    const matched = questions.filter(
      (q) => q.subject.toLowerCase() === config.activeSubject.toLowerCase()
    );
    return matched.length > 0 ? matched : questions;
  }, [config.activeSubject, questions]);

  async function handleSaveConfig(nextConfig: ExamConfig, newPin?: string) {
    const saved = await saveConfigApi(nextConfig);
    setConfig(saved);

    if (newPin && currentTeacher) {
      const updatedTeachers = teachers.map((t) =>
        t.id === currentTeacher.id ? { ...t, pin: newPin } : t
      );
      await saveTeachersApi(updatedTeachers);
      setTeachers(updatedTeachers);
      setCurrentTeacher({ ...currentTeacher, pin: newPin });
    }
  }

  async function handleSaveQuestions(next: Question[]) {
    setQuestions(next);
    await saveQuestionsApi(next);
  }

  async function handleSaveStudents(next: Student[]) {
    setStudents(next);
    await saveStudentsApi(next);
  }

  async function handleSaveTeachers(next: Teacher[]) {
    setTeachers(next);
    await saveTeachersApi(next);
  }

  async function handleFinishExam(result: ExamResult) {
    try {
      const resp = await submitExamResultApi(result);
      setResults((prev) => [resp.result, ...prev]);
      setLastResult(resp.result);
    } catch {
      setResults((prev) => [result, ...prev]);
      setLastResult(result);
    }
    setView('result');
  }

  async function handleClearResults(subject: string) {
    const remaining = await clearResultsApi(subject);
    setResults(remaining);
  }

  async function handleSyncCloud(): Promise<string> {
    try {
      const resp = await syncSupabaseApi();
      setResults(resp.results);
      if (!resp.supabaseConfigured) {
        const fresh = await fetchBootstrap();
        setResults(fresh.results);
        return 'Data server lokal dimuat ulang. Untuk sinkronisasi lintas perangkat, atur SUPABASE_URL & SUPABASE_ANON_KEY pada Secrets.';
      }
      if (!resp.ok) {
        return resp.message ?? 'Sinkronisasi Supabase gagal.';
      }
      return `Sinkronisasi Supabase berhasil (${resp.pushed ?? 0} data diunggah, total ${resp.total ?? resp.results.length} rekap).`;
    } catch {
      return 'Gagal menghubungi server sinkronisasi.';
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopBar
        currentTeacher={currentTeacher}
        inExamRoom={view === 'exam'}
        supabaseConfigured={supabaseConfigured}
        onOpenAdminLogin={() => setAdminLoginOpen(true)}
        onAdminLogout={() => {
          setCurrentTeacher(null);
          setView('login');
        }}
      />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="max-w-6xl mx-auto py-16 text-center text-sm text-slate-500">
            Memuat pangkalan data ujian CBT...
          </div>
        ) : (
          <>
            {view === 'login' && (
              <StudentLoginView
                config={config}
                students={students}
                questions={questions}
                onAuthenticated={(student) => {
                  setActiveStudent(student);
                  setView('confirm');
                }}
              />
            )}

            {view === 'confirm' && activeStudent && (
              <ExamConfirmView
                student={activeStudent}
                config={config}
                questionCount={examQuestions.length}
                onBack={() => {
                  setActiveStudent(null);
                  setView('login');
                }}
                onStartExam={() => setView('exam')}
              />
            )}

            {view === 'exam' && activeStudent && (
              <ExamRoomView
                student={activeStudent}
                config={config}
                questions={examQuestions}
                onFinishExam={handleFinishExam}
              />
            )}

            {view === 'result' && lastResult && (
              <ExamResultView
                result={lastResult}
                onReturnHome={() => {
                  setActiveStudent(null);
                  setLastResult(null);
                  setView('login');
                }}
              />
            )}

            {view === 'admin' && currentTeacher && (
              <AdminDashboardView
                currentTeacher={currentTeacher}
                config={config}
                questions={questions}
                students={students}
                teachers={teachers}
                results={results}
                supabaseConfigured={supabaseConfigured}
                onSaveConfig={handleSaveConfig}
                onSaveQuestions={handleSaveQuestions}
                onSaveStudents={handleSaveStudents}
                onSaveTeachers={handleSaveTeachers}
                onClearResults={handleClearResults}
                onSyncCloud={handleSyncCloud}
              />
            )}
          </>
        )}
      </main>

      <AdminLoginModal
        open={adminLoginOpen}
        teachers={teachers}
        onClose={() => setAdminLoginOpen(false)}
        onSuccess={(teacher) => {
          setCurrentTeacher(teacher);
          setAdminLoginOpen(false);
          setView('admin');
        }}
      />
    </div>
  );
}
