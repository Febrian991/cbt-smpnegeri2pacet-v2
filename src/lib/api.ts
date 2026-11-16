import type {
  BootstrapPayload,
  ExamConfig,
  ExamResult,
  Question,
  Student,
  Teacher,
} from '../types/cbt';

export async function fetchBootstrap(): Promise<BootstrapPayload> {
  const res = await fetch('/api/bootstrap');
  if (!res.ok) throw new Error('Gagal memuat data CBT dari server.');
  return res.json();
}

export async function saveConfigApi(config: ExamConfig): Promise<ExamConfig> {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Gagal menyimpan konfigurasi ujian.');
  const data = await res.json();
  return data.config;
}

export async function saveQuestionsApi(questions: Question[]): Promise<void> {
  const res = await fetch('/api/questions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(questions),
  });
  if (!res.ok) throw new Error('Gagal menyimpan bank soal.');
}

export async function saveStudentsApi(students: Student[]): Promise<void> {
  const res = await fetch('/api/students', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(students),
  });
  if (!res.ok) throw new Error('Gagal menyimpan data siswa.');
}

export async function saveTeachersApi(teachers: Teacher[]): Promise<void> {
  const res = await fetch('/api/teachers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teachers),
  });
  if (!res.ok) throw new Error('Gagal menyimpan data guru.');
}

export async function submitExamResultApi(
  result: ExamResult
): Promise<{ result: ExamResult; synced: boolean }> {
  const res = await fetch('/api/results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  });
  if (!res.ok) throw new Error('Gagal mengirim lembar jawaban.');
  return res.json();
}

export async function clearResultsApi(subject: string): Promise<ExamResult[]> {
  const res = await fetch(`/api/results?subject=${encodeURIComponent(subject)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Gagal menghapus rekap nilai.');
  const data = await res.json();
  return data.results;
}

export async function syncSupabaseApi(): Promise<{
  ok: boolean;
  supabaseConfigured: boolean;
  pushed?: number;
  total?: number;
  message?: string;
  results: ExamResult[];
}> {
  const res = await fetch('/api/supabase/sync', { method: 'POST' });
  return res.json();
}
