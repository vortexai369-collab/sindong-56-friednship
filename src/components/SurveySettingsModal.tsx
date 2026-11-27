import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  DEFAULT_QUESTIONS,
  QuestionCategory,
  SCHEMA_LIMITS,
  Survey,
  SurveyQuestion,
} from '../types';
import { generateJoinCode } from '../utils/sociometry';

interface SurveySettingsModalProps {
  mode: 'create' | 'edit';
  initialSurvey?: Survey;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    className: string;
    academicYear: string;
    joinCode: string;
    questions: SurveyQuestion[];
    allowTeacherNote: boolean;
  }) => Promise<void>;
}

export const SurveySettingsModal: React.FC<SurveySettingsModalProps> = ({
  mode,
  initialSurvey,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState(
    initialSurvey?.title || '1학기 교우관계 조사'
  );
  const [className, setClassName] = useState(
    initialSurvey?.className || '5학년 1반'
  );
  const [academicYear, setAcademicYear] = useState(
    initialSurvey?.academicYear || '2026'
  );
  const [joinCode, setJoinCode] = useState(
    initialSurvey?.joinCode || generateJoinCode()
  );
  const [allowTeacherNote, setAllowTeacherNote] = useState(
    initialSurvey?.allowTeacherNote ?? true
  );
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    initialSurvey?.questions?.length ? initialSurvey.questions : DEFAULT_QUESTIONS
  );
  const [saving, setSaving] = useState(false);

  const handleQuestionChange = (
    idx: number,
    field: keyof SurveyQuestion,
    value: string | number
  ) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q))
    );
  };

  const handleAddQuestion = () => {
    if (questions.length >= SCHEMA_LIMITS.MAX_QUESTIONS) return;
    setQuestions((prev) => [
      ...prev,
      {
        id: `q${Date.now().toString(36).slice(-4)}`,
        text: '',
        category: 'positive',
        maxSelect: 3,
      },
    ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validQuestions = questions.filter((q) => q.text.trim().length > 0);
    if (!title.trim() || !className.trim() || validQuestions.length === 0) return;

    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        className: className.trim(),
        academicYear: academicYear.trim() || '2026',
        joinCode: joinCode.trim().toUpperCase(),
        questions: validQuestions,
        allowTeacherNote,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {mode === 'create' ? '새 교우관계 조사 만들기' : '조사 기본 정보 및 문항 설정'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              학급 정보와 긍정·갈등 조사 문항(최대 8문항)을 설정하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">조사 제목</label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 1학기 교우관계 조사"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">학년도</label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.ACADEMIC_YEAR_MAX}
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2026"
                className="w-full px-3 py-2 text-sm tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">학급명</label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.CLASS_NAME_MAX}
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="예: 5학년 3반"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                학급 초대 코드 (영문 대문자·숫자 4~16자)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  minLength={4}
                  maxLength={16}
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  className="flex-1 px-3 py-2 text-sm font-mono tracking-wider border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setJoinCode(generateJoinCode())}
                  className="px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  재생성
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-800">
                조사 문항 ({questions.length} / {SCHEMA_LIMITS.MAX_QUESTIONS})
              </p>
              <button
                type="button"
                onClick={handleAddQuestion}
                disabled={questions.length >= SCHEMA_LIMITS.MAX_QUESTIONS}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                문항 추가
              </button>
            </div>

            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-3.5 border border-slate-200 rounded-lg space-y-2.5 bg-slate-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500 tabular-nums">
                      문항 {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={q.category}
                        onChange={(e) =>
                          handleQuestionChange(
                            idx,
                            'category',
                            e.target.value as QuestionCategory
                          )
                        }
                        className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700"
                      >
                        <option value="positive">긍정 지명</option>
                        <option value="negative">갈등·불편 지명</option>
                      </select>

                      <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                        최대
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={q.maxSelect}
                          onChange={(e) =>
                            handleQuestionChange(
                              idx,
                              'maxSelect',
                              Math.max(1, Math.min(10, Number(e.target.value) || 1))
                            )
                          }
                          className="w-12 px-1.5 py-0.5 text-center border border-slate-200 rounded bg-white tabular-nums"
                        />
                        명
                      </label>

                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(idx)}
                          title="문항 삭제"
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.QUESTION_TEXT_MAX}
                    value={q.text}
                    onChange={(e) => handleQuestionChange(idx, 'text', e.target.value)}
                    placeholder="학생들에게 보여질 질문을 입력하세요"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 pt-2 border-t border-slate-100 cursor-pointer">
            <input
              type="checkbox"
              checked={allowTeacherNote}
              onChange={(e) => setAllowTeacherNote(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            <span className="text-sm text-slate-700">
              마지막 단계에 &ldquo;선생님께 전하고 싶은 말&rdquo; 비공개 자유 서술란 포함
            </span>
          </label>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
            >
              {saving ? '저장 중...' : mode === 'create' ? '조사 만들기' : '변경사항 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
