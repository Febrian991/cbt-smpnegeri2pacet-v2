import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type {
  BootstrapPayload,
  ExamConfig,
  ExamResult,
  Question,
  Student,
  Teacher,
} from './src/types/cbt.ts';
import {
  DEFAULT_CONFIG,
  DEFAULT_QUESTIONS,
  DEFAULT_RESULTS,
  DEFAULT_STUDENTS,
  DEFAULT_TEACHERS,
  SUPABASE_SCHEMA_SQL,
} from './src/data/defaults.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'cbt-store.json');

interface StoreData {
  config: ExamConfig;
  questions: Question[];
  students: Student[];
  teachers: Teacher[];
  results: ExamResult[];
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

let writeQueue: Promise<void> = Promise.resolve();

async function ensureStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      config: parsed.config ?? DEFAULT_CONFIG,
      questions: Array.isArray(parsed.questions) ? parsed.questions : DEFAULT_QUESTIONS,
      students: Array.isArray(parsed.students) ? parsed.students : DEFAULT_STUDENTS,
      teachers: Array.isArray(parsed.teachers) ? parsed.teachers : DEFAULT_TEACHERS,
      results: Array.isArray(parsed.results) ? parsed.results : DEFAULT_RESULTS,
    };
  } catch {
    const initial: StoreData = {
      config: DEFAULT_CONFIG,
      questions: DEFAULT_QUESTIONS,
      students: DEFAULT_STUDENTS,
      teachers: DEFAULT_TEACHERS,
      results: DEFAULT_RESULTS,
    };
    await saveStore(initial);
    return initial;
  }
}

async function saveStore(data: StoreData): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  });
  await writeQueue;
}

function resultSignature(r: ExamResult): string {
  return `${r.student_nisn}__${r.subject}__${r.completed_at}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      supabaseConfigured: Boolean(getSupabaseClient()),
    });
  });

  app.get('/api/bootstrap', async (_req, res) => {
    try {
      const store = await ensureStore();
      const payload: BootstrapPayload = {
        ...store,
        supabaseConfigured: Boolean(getSupabaseClient()),
      };
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal memuat data.' });
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const store = await ensureStore();
      store.config = req.body as ExamConfig;
      await saveStore(store);
      res.json({ ok: true, config: store.config });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi.' });
    }
  });

  app.put('/api/questions', async (req, res) => {
    try {
      const store = await ensureStore();
      store.questions = Array.isArray(req.body) ? (req.body as Question[]) : store.questions;
      await saveStore(store);
      res.json({ ok: true, count: store.questions.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal menyimpan soal.' });
    }
  });

  app.put('/api/students', async (req, res) => {
    try {
      const store = await ensureStore();
      store.students = Array.isArray(req.body) ? (req.body as Student[]) : store.students;
      await saveStore(store);
      res.json({ ok: true, count: store.students.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal menyimpan data siswa.' });
    }
  });

  app.put('/api/teachers', async (req, res) => {
    try {
      const store = await ensureStore();
      store.teachers = Array.isArray(req.body) ? (req.body as Teacher[]) : store.teachers;
      await saveStore(store);
      res.json({ ok: true, count: store.teachers.length });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal menyimpan data guru.' });
    }
  });

  app.post('/api/results', async (req, res) => {
    try {
      const store = await ensureStore();
      const entry = req.body as ExamResult;
      const supabase = getSupabaseClient();
      let synced = false;

      if (supabase) {
        const { error } = await supabase.from('cbt_exam_results').insert([
          {
            student_name: entry.student_name,
            student_nisn: entry.student_nisn,
            student_class: entry.student_class,
            exam_title: entry.exam_title,
            subject: entry.subject,
            final_score: entry.final_score,
            correct_count: entry.correct_count,
            incorrect_count: entry.incorrect_count,
            unattempted_count: entry.unattempted_count,
            total_questions: entry.total_questions,
            cheat_count: entry.cheat_count,
            completed_at: entry.completed_at,
            finish_reason: entry.finish_reason,
            raw_data: entry.raw_data ?? null,
          },
        ]);
        if (!error) {
          synced = true;
        }
      }

      const savedEntry: ExamResult = {
        ...entry,
        synced_cloud: synced,
      };
      store.results = [savedEntry, ...store.results];
      await saveStore(store);

      res.json({ ok: true, result: savedEntry, synced });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal menyimpan hasil ujian.' });
    }
  });

  app.delete('/api/results', async (req, res) => {
    try {
      const subject = typeof req.query.subject === 'string' ? req.query.subject : 'ALL';
      const store = await ensureStore();
      if (subject === 'ALL') {
        store.results = [];
      } else {
        store.results = store.results.filter((r) => r.subject !== subject);
      }
      await saveStore(store);

      const supabase = getSupabaseClient();
      if (supabase) {
        if (subject === 'ALL') {
          await supabase.from('cbt_exam_results').delete().neq('id', 0);
        } else {
          await supabase.from('cbt_exam_results').delete().eq('subject', subject);
        }
      }

      res.json({ ok: true, results: store.results });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal menghapus rekap nilai.' });
    }
  });

  app.post('/api/supabase/sync', async (_req, res) => {
    const supabase = getSupabaseClient();
    const store = await ensureStore();

    if (!supabase) {
      res.status(400).json({
        ok: false,
        supabaseConfigured: false,
        message: 'Variabel SUPABASE_URL dan SUPABASE_ANON_KEY belum dikonfigurasi pada Secrets.',
        results: store.results,
      });
      return;
    }

    try {
      const { data: remoteRows, error: fetchError } = await supabase
        .from('cbt_exam_results')
        .select('*')
        .order('id', { ascending: false });

      if (fetchError) {
        res.status(500).json({ ok: false, message: fetchError.message, results: store.results });
        return;
      }

      const remoteList = (remoteRows ?? []) as ExamResult[];
      const remoteSigs = new Set(remoteList.map(resultSignature));

      const toPush = store.results.filter((r) => !remoteSigs.has(resultSignature(r)));
      if (toPush.length > 0) {
        await supabase.from('cbt_exam_results').insert(
          toPush.map((r) => ({
            student_name: r.student_name,
            student_nisn: r.student_nisn,
            student_class: r.student_class,
            exam_title: r.exam_title,
            subject: r.subject,
            final_score: r.final_score,
            correct_count: r.correct_count,
            incorrect_count: r.incorrect_count,
            unattempted_count: r.unattempted_count,
            total_questions: r.total_questions,
            cheat_count: r.cheat_count,
            completed_at: r.completed_at,
            finish_reason: r.finish_reason,
            raw_data: r.raw_data ?? null,
          }))
        );
      }

      const { data: refreshedRows } = await supabase
        .from('cbt_exam_results')
        .select('*')
        .order('id', { ascending: false });

      const merged = ((refreshedRows ?? remoteList) as ExamResult[]).map((row) => ({
        ...row,
        synced_cloud: true,
      }));
      store.results = merged;
      await saveStore(store);

      res.json({
        ok: true,
        supabaseConfigured: true,
        pushed: toPush.length,
        total: merged.length,
        results: merged,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'Sinkronisasi Supabase gagal.',
        results: store.results,
      });
    }
  });

  app.get('/api/supabase/schema', (_req, res) => {
    res.type('text/plain').send(SUPABASE_SCHEMA_SQL);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CBT Ujian Sekolah Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
