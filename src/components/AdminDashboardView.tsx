import { useState } from 'react';
import { BarChart3, BookOpen, GraduationCap, Settings, Users } from 'lucide-react';
import type { ExamConfig, ExamResult, Question, Student, Teacher } from '../types/cbt';
import { AdminResultsTab } from './AdminResultsTab';
import { AdminQuestionsTab } from './AdminQuestionsTab';
import { AdminStudentsTab } from './AdminStudentsTab';
import { AdminTeachersTab } from './AdminTeachersTab';
import { AdminSettingsTab } from './AdminSettingsTab';

type AdminTab = 'results' | 'questions' | 'students' | 'teachers' | 'settings';

interface AdminDashboardViewProps {
  currentTeacher: Teacher;
  config: ExamConfig;
  questions: Question[];
  students: Student[];
  teachers: Teacher[];
  results: ExamResult[];
  supabaseConfigured: boolean;
  onSaveConfig: (config: ExamConfig, newPin?: string) => Promise<void>;
  onSaveQuestions: (questions: Question[]) => Promise<void>;
  onSaveStudents: (students: Student[]) => Promise<void>;
  onSaveTeachers: (teachers: Teacher[]) => Promise<void>;
  onClearResults: (subject: string) => Promise<void>;
  onSyncCloud: () => Promise<string>;
}

export function AdminDashboardView({
  currentTeacher,
  config,
  questions,
  students,
  teachers,
  results,
  supabaseConfigured,
  onSaveConfig,
  onSaveQuestions,
  onSaveStudents,
  onSaveTeachers,
  onClearResults,
  onSyncCloud,
}: AdminDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('results');

  const tabs: { id: AdminTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'results', label: 'Rekap Nilai', icon: BarChart3 },
    { id: 'questions', label: 'Bank Soal', icon: BookOpen },
    { id: 'students', label: 'Data Siswa', icon: Users },
    { id: 'teachers', label: 'Data Guru', icon: GraduationCap },
    { id: 'settings', label: 'Pengaturan & Cloud', icon: Settings },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {/* Admin Header Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <div className="text-xs font-semibold text-blue-700">
            {currentTeacher.role === 'proktor' ? 'Proktor Utama Sekolah' : 'Guru Mata Pelajaran'}
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
            {currentTeacher.name}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentTeacher.subject === 'ALL'
              ? 'Akses penuh seluruh mata pelajaran, bank soal, data peserta, dan konfigurasi.'
              : `Mata Pelajaran Diampu: ${currentTeacher.subject}`}
          </p>
        </div>

        {/* Segmented Tab Bar */}
        <nav className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active Tab Content */}
      <div>
        {activeTab === 'results' && (
          <AdminResultsTab
            results={results}
            config={config}
            currentTeacher={currentTeacher}
            supabaseConfigured={supabaseConfigured}
            onSyncCloud={onSyncCloud}
            onClearResults={onClearResults}
          />
        )}

        {activeTab === 'questions' && (
          <AdminQuestionsTab
            questions={questions}
            activeSubject={config.activeSubject}
            currentTeacher={currentTeacher}
            onSaveQuestions={onSaveQuestions}
          />
        )}

        {activeTab === 'students' && (
          <AdminStudentsTab
            students={students}
            config={config}
            onSaveStudents={onSaveStudents}
          />
        )}

        {activeTab === 'teachers' && (
          <AdminTeachersTab
            teachers={teachers}
            currentTeacher={currentTeacher}
            onSaveTeachers={onSaveTeachers}
          />
        )}

        {activeTab === 'settings' && (
          <AdminSettingsTab
            config={config}
            currentTeacher={currentTeacher}
            supabaseConfigured={supabaseConfigured}
            onSaveConfig={onSaveConfig}
            onSyncCloud={onSyncCloud}
          />
        )}
      </div>
    </div>
  );
}
