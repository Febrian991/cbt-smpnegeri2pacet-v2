export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E';

export type QuestionType = 'single' | 'multiple' | 'true_false';

export interface TrueFalseStatement {
  id: string;
  text: string;
  correct: 'B' | 'S';
}

export interface Question {
  id: string;
  subject: string;
  type: QuestionType;
  text: string;
  image?: string;
  options?: Record<OptionKey, string>;
  correctSingle?: OptionKey;
  correctMultiple?: OptionKey[];
  statements?: TrueFalseStatement[];
  weight: number;
}

export interface Student {
  id: string;
  nisn: string;
  name: string;
  className: string;
  password: string;
}

export type TeacherRole = 'proktor' | 'guru';

export interface Teacher {
  id: string;
  nip: string;
  name: string;
  subject: string;
  pin: string;
  role: TeacherRole;
}

export interface ExamConfig {
  examTitle: string;
  examSubtitle: string;
  activeSubject: string;
  durationMinutes: number;
  examToken: string;
  maxCheats: number;
}

export interface ExamResult {
  id: string | number;
  student_name: string;
  student_nisn: string;
  student_class: string;
  exam_title: string;
  subject: string;
  final_score: number;
  correct_count: number;
  incorrect_count: number;
  unattempted_count: number;
  total_questions: number;
  cheat_count: number;
  completed_at: string;
  finish_reason: string;
  raw_data?: Record<string, unknown>;
  created_at?: string;
  synced_cloud?: boolean;
}

export type StudentAnswerValue =
  | OptionKey
  | OptionKey[]
  | Record<string, 'B' | 'S'>;

export interface BootstrapPayload {
  config: ExamConfig;
  questions: Question[];
  students: Student[];
  teachers: Teacher[];
  results: ExamResult[];
  supabaseConfigured: boolean;
}
