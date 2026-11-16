import type { OptionKey, Question, StudentAnswerValue } from '../types/cbt';

export interface GradeBreakdown {
  finalScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  totalQuestions: number;
}

export function isQuestionAnswered(question: Question, answer: StudentAnswerValue | undefined): boolean {
  if (!answer) return false;
  if (question.type === 'single') {
    return typeof answer === 'string' && answer.length > 0;
  }
  if (question.type === 'multiple') {
    return Array.isArray(answer) && answer.length > 0;
  }
  if (question.type === 'true_false') {
    if (typeof answer !== 'object' || Array.isArray(answer)) return false;
    const totalRows = question.statements?.length ?? 0;
    if (totalRows === 0) return false;
    return Object.keys(answer).length > 0;
  }
  return false;
}

export function gradeExam(
  questions: Question[],
  answers: Record<string, StudentAnswerValue>
): GradeBreakdown {
  let totalWeight = 0;
  let earnedWeight = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  for (const q of questions) {
    const weight = q.weight > 0 ? q.weight : 10;
    totalWeight += weight;

    const ans = answers[q.id];
    if (!isQuestionAnswered(q, ans)) {
      unattemptedCount++;
      continue;
    }

    if (q.type === 'single') {
      if (ans === q.correctSingle) {
        earnedWeight += weight;
        correctCount++;
      } else {
        incorrectCount++;
      }
    } else if (q.type === 'multiple') {
      const selected = Array.isArray(ans) ? ans : [];
      const keys = (q.correctMultiple ?? []) as OptionKey[];
      if (keys.length === 0) {
        incorrectCount++;
        continue;
      }
      let hits = 0;
      let misses = 0;
      for (const s of selected) {
        if (keys.includes(s)) hits++;
        else misses++;
      }
      const ratio = Math.max(0, (hits - misses) / keys.length);
      earnedWeight += weight * ratio;
      if (ratio >= 0.99) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    } else if (q.type === 'true_false') {
      const statements = q.statements ?? [];
      const map = (typeof ans === 'object' && !Array.isArray(ans) ? ans : {}) as Record<string, 'B' | 'S'>;
      if (statements.length === 0) {
        incorrectCount++;
        continue;
      }
      let rowCorrect = 0;
      for (const st of statements) {
        if (map[st.id] === st.correct) {
          rowCorrect++;
        }
      }
      const ratio = rowCorrect / statements.length;
      earnedWeight += weight * ratio;
      if (rowCorrect === statements.length) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    }
  }

  const finalScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  return {
    finalScore,
    correctCount,
    incorrectCount,
    unattemptedCount,
    totalQuestions: questions.length,
  };
}

export function formatTimeNowID(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
