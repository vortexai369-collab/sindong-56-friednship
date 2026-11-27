import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Lock, Send } from 'lucide-react';
import { SCHEMA_LIMITS, SurveyAnswer, SurveyInvite } from '../types';
import { fetchInviteByCodes, submitStudentResponse } from '../services/firestoreService';
import { sanitizeCode } from '../utils/sociometry';

interface StudentSurveyPortalProps {
  initialJoinCode?: string;
  initialAccessCode?: string;
  isKioskMode?: boolean;
  onExitToTeacher?: () => void;
}

export const StudentSurveyPortal: React.FC<StudentSurveyPortalProps> = ({
  initialJoinCode = '',
  initialAccessCode = '',
  isKioskMode = false,
  onExitToTeacher,
}) => {
  const [joinCodeInput, setJoinCodeInput] = useState(sanitizeCode(initialJoinCode));
  const [accessCodeInput, setAccessCodeInput] = useState(sanitizeCode(initialAccessCode));
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  const [invite, setInvite] = useState<SurveyInvite | null>(null);
  const [stepIndex, setStepIndex] = useState<number>(0); // 0..questions.length-1, plus note step if enabled
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const [teacherNote, setTeacherNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedDone, setSubmittedDone] = useState(false);

  const loadInvite = async (jCode: string, aCode: string) => {
    const cleanJoin = sanitizeCode(jCode);
    const cleanAccess = sanitizeCode(aCode);
    if (cleanJoin.length < 4 || cleanAccess.length < 4) {
      setLookupError('학급 코드와 개인 코드를 모두 정확히 입력해 주세요.');
      return;
    }

    setLoadingInvite(true);
    setLookupError(null);
    try {
      const found = await fetchInviteByCodes(cleanJoin, cleanAccess);
      if (!found) {
        setLookupError('일치하는 학생 정보를 찾을 수 없습니다. 코드를 다시 확인해 주세요.');
        return;
      }
      if (found.surveyStatus !== 'open') {
        setLookupError('현재 마감된 조사입니다. 선생님께 문의해 주세요.');
        return;
      }
      if (found.submitted) {
        setLookupError(
          `${found.studentNumber}번 ${found.studentName} 학생은 이미 응답을 완료했습니다.`
        );
        return;
      }

      setInvite(found);
      setStepIndex(0);
      setSelectedMap({});
      setTeacherNote('');
      setSubmittedDone(false);
    } catch {
      setLookupError('조사 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoadingInvite(false);
    }
  };

  // Auto-load when opened with both joinCode and accessCode
  useEffect(() => {
    if (initialJoinCode && initialAccessCode) {
      void loadInvite(initialJoinCode, initialAccessCode);
    }
  }, [initialJoinCode, initialAccessCode]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadInvite(joinCodeInput, accessCodeInput);
  };

  const toggleClassmate = (questionId: string, classmateId: string, maxSelect: number) => {
    setSelectedMap((prev) => {
      const current = prev[questionId] || [];
      if (current.includes(classmateId)) {
        return { ...prev, [questionId]: current.filter((id) => id !== classmateId) };
      }
      if (current.length >= maxSelect) {
        return prev;
      }
      return { ...prev, [questionId]: [...current, classmateId] };
    });
  };

  const handleFinalSubmit = async () => {
    if (!invite) return;
    setSubmitting(true);
    setLookupError(null);
    try {
      const answers: SurveyAnswer[] = invite.questions.map((q) => ({
        questionId: q.id,
        category: q.category,
        selectedIds: selectedMap[q.id] || [],
      }));
      await submitStudentResponse(invite, answers, teacherNote);
      setSubmittedDone(true);
    } catch {
      setLookupError('응답을 저장하지 못했습니다. 이미 제출되었거나 네트워크 연결을 확인해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForNextStudent = () => {
    setInvite(null);
    setAccessCodeInput('');
    setSelectedMap({});
    setTeacherNote('');
    setSubmittedDone(false);
    setLookupError(null);
    setStepIndex(0);
  };

  const totalSteps = invite
    ? invite.questions.length + (invite.allowTeacherNote ? 1 : 0)
    : 0;
  const isNoteStep = invite ? invite.allowTeacherNote && stepIndex === invite.questions.length : false;
  const currentQuestion = invite && !isNoteStep ? invite.questions[stepIndex] : null;
  const selectableClassmates = invite
    ? invite.classmates
        .filter((c) => c.id !== invite.studentDocId)
        .sort((a, b) => a.number - b.number)
    : [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Minimal Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold text-slate-900 whitespace-nowrap">
              7942 친구사이
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-600 whitespace-nowrap">
              {isKioskMode ? '교실 학생 응답 모드' : '학생 설문'}
            </span>
          </div>

          {onExitToTeacher && (
            <button
              type="button"
              onClick={onExitToTeacher}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              교사 대시보드로 돌아가기
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-5">
        {/* Step 0: Enter Class & Personal Code */}
        {!invite && (
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-7 space-y-6">
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-slate-900">교우관계 조사 참여하기</h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                선생님께 안내받은 학급 코드와 본인의 개인 코드를 입력해 주세요. 모든 응답은
                선생님만 확인할 수 있습니다.
              </p>
            </div>

            <form onSubmit={handleLookupSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="join-code"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  학급 코드
                </label>
                <input
                  id="join-code"
                  type="text"
                  required
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(sanitizeCode(e.target.value))}
                  placeholder="예: C5A8K2"
                  className="w-full px-3.5 py-2.5 text-base font-mono tracking-widest uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="access-code"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  개인 코드
                </label>
                <input
                  id="access-code"
                  type="text"
                  required
                  value={accessCodeInput}
                  onChange={(e) => setAccessCodeInput(sanitizeCode(e.target.value))}
                  placeholder="예: Y6Q2M"
                  className="w-full px-3.5 py-2.5 text-base font-mono tracking-widest uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              {lookupError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  {lookupError}
                </p>
              )}

              <button
                type="submit"
                disabled={loadingInvite}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loadingInvite ? '확인 중...' : '설문 시작하기'}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>비밀이 철저히 보장되며, 한 번 제출하면 다른 친구가 볼 수 없습니다.</span>
            </div>
          </div>
        )}

        {/* Step 2: Completed Screen */}
        {invite && submittedDone && (
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900">응답이 제출되었습니다</h2>
              <p className="text-sm text-slate-600">
                {invite.className} {invite.studentNumber}번 {invite.studentName} 학생, 솔직하게
                응답해 주어 고맙습니다.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleResetForNextStudent}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                다음 학생 응답하기
              </button>
              {onExitToTeacher && (
                <button
                  type="button"
                  onClick={onExitToTeacher}
                  className="w-full py-2 px-4 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  교사 대시보드로 돌아가기
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Active Survey Questions */}
        {invite && !submittedDone && (
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Progress & Student Identity Bar */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  {invite.className} · <strong className="text-slate-900">{invite.studentNumber}번 {invite.studentName}</strong>
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  단계 {stepIndex + 1} / {totalSteps}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-all duration-200"
                  style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <div className="p-6 space-y-6">
              {currentQuestion ? (
                <>
                  <div className="space-y-1.5">
                    <p
                      className={`text-xs font-semibold ${
                        currentQuestion.category === 'negative'
                          ? 'text-amber-700'
                          : 'text-blue-700'
                      }`}
                    >
                      문항 {stepIndex + 1} ·{' '}
                      {currentQuestion.category === 'negative'
                        ? `선택 사항 · 최대 ${currentQuestion.maxSelect}명`
                        : `최대 ${currentQuestion.maxSelect}명 선택`}
                    </p>
                    <h2 className="text-lg font-bold text-slate-900 leading-snug">
                      {currentQuestion.text}
                    </h2>
                    <p className="text-xs text-slate-500 tabular-nums">
                      현재 선택: {(selectedMap[currentQuestion.id] || []).length} /{' '}
                      {currentQuestion.maxSelect}명
                    </p>
                  </div>

                  {/* Classmate Selection Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {selectableClassmates.map((mate) => {
                      const currentSelected = selectedMap[currentQuestion.id] || [];
                      const isSelected = currentSelected.includes(mate.id);
                      const isMaxReached =
                        !isSelected && currentSelected.length >= currentQuestion.maxSelect;

                      return (
                        <button
                          key={mate.id}
                          type="button"
                          disabled={isMaxReached}
                          onClick={() =>
                            toggleClassmate(
                              currentQuestion.id,
                              mate.id,
                              currentQuestion.maxSelect
                            )
                          }
                          className={`min-h-[48px] px-3.5 py-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                            isSelected
                              ? currentQuestion.category === 'negative'
                                ? 'bg-amber-50 border-amber-500 text-amber-950'
                                : 'bg-blue-50 border-blue-600 text-blue-950'
                              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-xs text-slate-400 mr-1.5 tabular-nums">
                              {mate.number}
                            </span>
                            <span className="text-sm font-medium truncate">{mate.name}</span>
                          </div>
                          {isSelected && (
                            <Check
                              className={`w-4 h-4 shrink-0 ${
                                currentQuestion.category === 'negative'
                                  ? 'text-amber-700'
                                  : 'text-blue-700'
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                /* Teacher Note Final Step */
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-blue-700">마지막 단계 · 선택 사항</p>
                  <h2 className="text-lg font-bold text-slate-900">
                    선생님께 전하고 싶은 말이 있나요?
                  </h2>
                  <p className="text-sm text-slate-600">
                    요즘 학교 생활이나 친구 관계에서 고민이 있거나 선생님께 바라는 점이 있다면
                    편하게 적어 주세요. 이 내용은 담임 선생님만 읽습니다.
                  </p>
                  <textarea
                    rows={5}
                    maxLength={SCHEMA_LIMITS.NOTE_MAX}
                    value={teacherNote}
                    onChange={(e) => setTeacherNote(e.target.value)}
                    placeholder="비워두고 바로 제출해도 괜찮습니다."
                    className="w-full p-3.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <p className="text-right text-xs text-slate-400 tabular-nums">
                    {teacherNote.length} / {SCHEMA_LIMITS.NOTE_MAX}자
                  </p>
                </div>
              )}

              {lookupError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  {lookupError}
                </p>
              )}

              {/* Footer Nav Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (stepIndex === 0) {
                      setInvite(null);
                    } else {
                      setStepIndex((i) => i - 1);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {stepIndex === 0 ? '코드 다시 입력' : '이전 문항'}
                </button>

                {stepIndex < totalSteps - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStepIndex((i) => i + 1)}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                  >
                    다음으로
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    {submitting ? '제출 중...' : '설문 최종 제출'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
