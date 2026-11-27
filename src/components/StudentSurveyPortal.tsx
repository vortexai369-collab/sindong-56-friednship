import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Send,
} from 'lucide-react';
import {
  CLOSENESS_OPTIONS,
  ClosenessScore,
  NEGATIVE_RELATION_TAGS,
  PeerRating,
  POSITIVE_RELATION_TAGS,
  SCHEMA_LIMITS,
  SurveyInvite,
} from '../types';
import { fetchInviteByCodes, submitStudentResponse } from '../services/firestoreService';
import { sanitizeCode } from '../utils/sociometry';

interface StudentSurveyPortalProps {
  initialJoinCode?: string;
  initialAccessCode?: string;
  isKioskMode?: boolean;
  standaloneMode?: boolean;
  onExitToTeacher?: () => void;
  onExitToLanding?: () => void;
}

interface DraftRating {
  score: ClosenessScore;
  tags: string[];
  note: string;
}

function getScoreBadgeClasses(score: ClosenessScore | undefined): string {
  switch (score) {
    case 2:
      return 'text-emerald-700 font-semibold';
    case 1:
      return 'text-blue-700 font-semibold';
    case 0:
      return 'text-slate-600 font-medium';
    case -1:
      return 'text-amber-700 font-semibold';
    case -2:
      return 'text-red-700 font-semibold';
    default:
      return 'text-slate-400';
  }
}

function getScoreShortText(score: ClosenessScore | undefined): string {
  switch (score) {
    case 2:
      return '매우 친함 +2';
    case 1:
      return '친한 편 +1';
    case 0:
      return '보통 0';
    case -1:
      return '어색함 -1';
    case -2:
      return '불편함 -2';
    default:
      return '미선택';
  }
}

function getOptionActiveStyle(score: ClosenessScore): string {
  switch (score) {
    case 2:
      return 'bg-emerald-50 border-emerald-600 text-emerald-950';
    case 1:
      return 'bg-blue-50 border-blue-600 text-blue-950';
    case 0:
      return 'bg-slate-100 border-slate-600 text-slate-900';
    case -1:
      return 'bg-amber-50 border-amber-500 text-amber-950';
    case -2:
      return 'bg-red-50 border-red-600 text-red-950';
  }
}

export const StudentSurveyPortal: React.FC<StudentSurveyPortalProps> = ({
  initialJoinCode = '',
  initialAccessCode = '',
  isKioskMode = false,
  standaloneMode = false,
  onExitToTeacher,
  onExitToLanding,
}) => {
  const [joinCodeInput, setJoinCodeInput] = useState(sanitizeCode(initialJoinCode));
  const [accessCodeInput, setAccessCodeInput] = useState(sanitizeCode(initialAccessCode));
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  const [invite, setInvite] = useState<SurveyInvite | null>(null);
  const [stage, setStage] = useState<'rating' | 'review'>('rating');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [ratingsMap, setRatingsMap] = useState<Record<string, DraftRating>>({});
  const [teacherNote, setTeacherNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedDone, setSubmittedDone] = useState(false);

  const accessCodeRef = useRef<HTMLInputElement | null>(null);
  const hasPrefilledJoin = Boolean(sanitizeCode(initialJoinCode));

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
      setStage('rating');
      setActiveIndex(0);
      setRatingsMap({});
      setTeacherNote('');
      setSubmittedDone(false);
    } catch {
      setLookupError('조사 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoadingInvite(false);
    }
  };

  useEffect(() => {
    const cleanJoin = sanitizeCode(initialJoinCode);
    const cleanAccess = sanitizeCode(initialAccessCode);
    setJoinCodeInput(cleanJoin);
    setAccessCodeInput(cleanAccess);

    if (cleanJoin && cleanAccess) {
      void loadInvite(cleanJoin, cleanAccess);
    } else if (cleanJoin && !cleanAccess) {
      setTimeout(() => accessCodeRef.current?.focus(), 60);
    }
  }, [initialJoinCode, initialAccessCode]);

  const selectableClassmates = useMemo(() => {
    if (!invite) return [];
    return invite.classmates
      .filter((c) => c.id !== invite.studentDocId)
      .sort((a, b) => a.number - b.number);
  }, [invite]);

  const activeClassmate = selectableClassmates[activeIndex] || null;
  const activeRating = activeClassmate ? ratingsMap[activeClassmate.id] : undefined;

  const ratedCount = useMemo(
    () => selectableClassmates.filter((c) => ratingsMap[c.id] !== undefined).length,
    [selectableClassmates, ratingsMap]
  );
  const allRated = selectableClassmates.length > 0 && ratedCount === selectableClassmates.length;

  const summaryCounts = useMemo(() => {
    const counts: Record<ClosenessScore, number> = { 2: 0, 1: 0, 0: 0, [-1]: 0, [-2]: 0 };
    selectableClassmates.forEach((c) => {
      const r = ratingsMap[c.id];
      if (r) counts[r.score] += 1;
    });
    return counts;
  }, [selectableClassmates, ratingsMap]);

  const handleSelectScore = (targetId: string, score: ClosenessScore) => {
    setRatingsMap((prev) => {
      const existing = prev[targetId];
      // Clear incompatible tags if switching polarity (positive <-> negative <-> neutral)
      const prevPolarity = existing ? Math.sign(existing.score) : 0;
      const nextPolarity = Math.sign(score);
      const nextTags =
        nextPolarity === 0 || prevPolarity !== nextPolarity ? [] : existing?.tags || [];
      return {
        ...prev,
        [targetId]: {
          score,
          tags: nextTags,
          note: existing?.note || '',
        },
      };
    });
  };

  const handleToggleTag = (targetId: string, tag: string) => {
    setRatingsMap((prev) => {
      const existing = prev[targetId];
      if (!existing) return prev;
      const has = existing.tags.includes(tag);
      const nextTags = has
        ? existing.tags.filter((t) => t !== tag)
        : existing.tags.length < SCHEMA_LIMITS.MAX_PEER_TAGS
        ? [...existing.tags, tag]
        : existing.tags;
      return {
        ...prev,
        [targetId]: { ...existing, tags: nextTags },
      };
    });
  };

  const handlePeerNoteChange = (targetId: string, note: string) => {
    setRatingsMap((prev) => {
      const existing = prev[targetId];
      if (!existing) return prev;
      return {
        ...prev,
        [targetId]: { ...existing, note: note.slice(0, SCHEMA_LIMITS.PEER_NOTE_MAX) },
      };
    });
  };

  const handleFillRemainingNeutral = () => {
    setRatingsMap((prev) => {
      const next = { ...prev };
      selectableClassmates.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = { score: 0, tags: [], note: '' };
        }
      });
      return next;
    });
  };

  const handleNextUnratedOrNext = () => {
    if (selectableClassmates.length === 0) return;
    // Look ahead for next unrated classmate
    for (let offset = 1; offset <= selectableClassmates.length; offset++) {
      const idx = (activeIndex + offset) % selectableClassmates.length;
      if (!ratingsMap[selectableClassmates[idx].id]) {
        setActiveIndex(idx);
        return;
      }
    }
    // If all rated, go to next index or review stage
    if (activeIndex < selectableClassmates.length - 1) {
      setActiveIndex(activeIndex + 1);
    } else {
      setStage('review');
    }
  };

  const handleFinalSubmit = async () => {
    if (!invite) return;
    setSubmitting(true);
    setLookupError(null);
    try {
      const peerRatings: PeerRating[] = selectableClassmates.map((c) => {
        const draft = ratingsMap[c.id];
        return {
          targetId: c.id,
          score: draft ? draft.score : 0,
          tags: draft ? draft.tags : [],
          note: draft ? draft.note : '',
        };
      });
      await submitStudentResponse(invite, peerRatings, teacherNote);
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
    setRatingsMap({});
    setTeacherNote('');
    setSubmittedDone(false);
    setLookupError(null);
    setStage('rating');
    setActiveIndex(0);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Minimal Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold text-slate-900 whitespace-nowrap">
              7942 친구사이
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-600 whitespace-nowrap">
              {isKioskMode
                ? '교실 키오스크 모드'
                : standaloneMode
                ? '학생 전용 설문 창'
                : '학생 교우관계 조사'}
            </span>
          </div>

          {onExitToTeacher ? (
            <button
              type="button"
              onClick={onExitToTeacher}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              교사 대시보드로 돌아가기
            </button>
          ) : onExitToLanding ? (
            <button
              type="button"
              onClick={onExitToLanding}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              처음 화면으로
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              <Lock className="w-3.5 h-3.5 text-emerald-700" />
              비공개 학생 전용 창
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {/* Step 0: Enter Class & Personal Code */}
        {!invite && (
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-7 space-y-6">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-blue-700">
                Google 로그인 없이 코드만으로 참여
              </p>
              <h1 className="text-xl font-bold text-slate-900">학생 교우관계 설문 입장</h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                선생님께 안내받은 학급 코드와 본인의 개인 코드를 입력하면 설문이 바로 시작됩니다.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-slate-100 text-center text-[11px] text-slate-600">
              <div>
                <span className="block font-semibold text-slate-900">1. 코드 입력</span>
                <span>학급·개인 코드</span>
              </div>
              <div>
                <span className="block font-semibold text-slate-900">2. 친구별 응답</span>
                <span>5단계 친밀도</span>
              </div>
              <div>
                <span className="block font-semibold text-slate-900">3. 비공개 제출</span>
                <span>선생님만 열람</span>
              </div>
            </div>

            {hasPrefilledJoin && joinCodeInput === sanitizeCode(initialJoinCode) && (
              <div className="px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                학급 코드(<strong className="font-mono">{joinCodeInput}</strong>)가 자동으로
                입력되었습니다. 선생님께 받은 <strong>개인 코드</strong>만 입력해 주세요.
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadInvite(joinCodeInput, accessCodeInput);
              }}
              className="space-y-4"
            >
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
                  ref={accessCodeRef}
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

            <div className="pt-4 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                응답 내용은 담임 선생님만 열람할 수 있으며, 다른 친구의 응답은 볼 수 없습니다.
              </span>
            </div>
          </div>
        )}

        {/* Step 3: Submitted Screen */}
        {invite && submittedDone && (
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">응답이 안전하게 제출되었습니다</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {invite.className} {invite.studentNumber}번 {invite.studentName} 학생, 솔직하게
                응답해 주어 고맙습니다. 작성한 내용은 선생님께만 비공개로 전달됩니다.
              </p>
              {!isKioskMode && (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  제출이 완료되었습니다. 개인 기기라면 이제 브라우저 창을 닫아도 됩니다.
                </p>
              )}
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleResetForNextStudent}
                className={`w-full py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                  isKioskMode
                    ? 'text-white bg-slate-900 hover:bg-slate-800'
                    : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {isKioskMode ? '다음 학생 응답하기' : '같은 기기에서 다른 학생 응답하기'}
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

        {/* Step 1: 1-by-1 Classmate Clickable Rating Workspace */}
        {invite && !submittedDone && stage === 'rating' && (
          <div className="w-full max-w-5xl space-y-4">
            {/* Progress & Identity Header */}
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">
                    {invite.className} · {invite.surveyTitle}
                  </p>
                  <h1 className="text-base font-bold text-slate-900 mt-0.5">
                    {invite.studentNumber}번 {invite.studentName} 학생의 교우관계 설문
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">
                    완료 {ratedCount} / {selectableClassmates.length}명
                  </span>
                  {ratedCount > 0 && !allRated && (
                    <button
                      type="button"
                      onClick={handleFillRemainingNeutral}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      남은 친구 &lsquo;보통(0)&rsquo;으로 채우기
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!allRated}
                    onClick={() => setStage('review')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    마지막 단계로
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-all duration-200"
                  style={{
                    width: `${
                      selectableClassmates.length > 0
                        ? (ratedCount / selectableClassmates.length) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* 2-Column Interactive Rating Body */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left: Clickable Classmate Roster */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">
                    반 친구 목록 (클릭하여 응답)
                  </p>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {selectableClassmates.length}명
                  </span>
                </div>
                <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                  {selectableClassmates.map((mate, idx) => {
                    const r = ratingsMap[mate.id];
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={mate.id}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        className={`w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-50/90 text-blue-950'
                            : 'bg-white hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs text-slate-400 w-5 tabular-nums">
                            {mate.number}
                          </span>
                          <span className="text-sm font-medium truncate">{mate.name}</span>
                        </div>
                        <span className={`text-xs whitespace-nowrap ${getScoreBadgeClasses(r?.score)}`}>
                          {getScoreShortText(r?.score)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Active Classmate Evaluation Card */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                {activeClassmate ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div>
                        <p className="text-xs font-medium text-blue-700 tabular-nums">
                          {activeIndex + 1} / {selectableClassmates.length}번째 친구
                        </p>
                        <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                          {activeClassmate.number}번 {activeClassmate.name} 친구와는 어떤 사이인가요?
                        </h2>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveIndex((i) =>
                              i > 0 ? i - 1 : selectableClassmates.length - 1
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          이전
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveIndex((i) =>
                              i < selectableClassmates.length - 1 ? i + 1 : 0
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          다음
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 1. 5-Level Closeness Selector */}
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold text-slate-700">
                        1. 친밀도 선택 (필수)
                      </p>
                      <div className="space-y-2">
                        {CLOSENESS_OPTIONS.map((opt) => {
                          const selected = activeRating?.score === opt.score;
                          return (
                            <button
                              key={opt.score}
                              type="button"
                              onClick={() => handleSelectScore(activeClassmate.id, opt.score)}
                              className={`w-full px-4 py-3 rounded-lg border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                selected
                                  ? getOptionActiveStyle(opt.score)
                                  : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold tabular-nums">
                                    {opt.score > 0 ? `+${opt.score}` : opt.score}
                                  </span>
                                  <span className="text-sm font-semibold">{opt.label}</span>
                                </div>
                                <p className="text-xs opacity-80">{opt.description}</p>
                              </div>
                              {selected && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Conditional Relationship Tags (only shown when +2, +1, -1, or -2 is selected) */}
                    {activeRating && activeRating.score !== 0 && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-700">
                            2.{' '}
                            {activeRating.score > 0
                              ? '함께할 때 어떤 점이 좋은가요? (복수 선택 · 선택 사항)'
                              : '어색하거나 불편한 이유가 있다면 선택해 주세요 (복수 선택 · 선생님만 확인)'}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(activeRating.score > 0
                              ? POSITIVE_RELATION_TAGS
                              : NEGATIVE_RELATION_TAGS
                            ).map((tag) => {
                              const isPicked = activeRating.tags.includes(tag);
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => handleToggleTag(activeClassmate.id, tag)}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                                    isPicked
                                      ? activeRating.score > 0
                                        ? 'bg-blue-700 border-blue-700 text-white'
                                        : 'bg-red-600 border-red-600 text-white'
                                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  #{tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor="peer-note-input"
                            className="block text-xs font-medium text-slate-600"
                          >
                            이 친구와 관련해 선생님께만 알리고 싶은 짧은 메모 (선택 · 최대 200자)
                          </label>
                          <input
                            id="peer-note-input"
                            type="text"
                            maxLength={SCHEMA_LIMITS.PEER_NOTE_MAX}
                            value={activeRating.note}
                            onChange={(e) =>
                              handlePeerNoteChange(activeClassmate.id, e.target.value)
                            }
                            placeholder="예: 모둠 활동 때 잘 도와줘요 / 최근 체육 시간에 다퉜어요"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>
                    )}

                    {/* Bottom Action Footer */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setInvite(null)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        코드 다시 입력
                      </button>

                      <div className="flex items-center gap-2">
                        {allRated ? (
                          <button
                            type="button"
                            onClick={() => setStage('review')}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer"
                          >
                            모든 친구 완료 · 최종 확인하기
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!activeRating}
                            onClick={handleNextUnratedOrNext}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            다음 미응답 친구로 이동
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">응답할 학급 친구 명단이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Summary Review & Teacher Note */}
        {invite && !submittedDone && stage === 'review' && (
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-700">마지막 단계 · 최종 제출</p>
              <h2 className="text-xl font-bold text-slate-900">
                응답 요약을 확인하고 제출해 주세요
              </h2>
              <p className="text-sm text-slate-600">
                {invite.className} {invite.studentNumber}번 {invite.studentName} 학생의 응답은 담임
                선생님만 확인할 수 있습니다.
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2 text-center py-4 border-y border-slate-100 tabular-nums">
              <div>
                <p className="text-xs text-emerald-700 font-medium">매우 친함</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{summaryCounts[2]}명</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 font-medium">친한 편</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{summaryCounts[1]}명</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">보통</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{summaryCounts[0]}명</p>
              </div>
              <div>
                <p className="text-xs text-amber-700 font-medium">어색함</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{summaryCounts[-1]}명</p>
              </div>
              <div>
                <p className="text-xs text-red-700 font-medium">불편함</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{summaryCounts[-2]}명</p>
              </div>
            </div>

            {invite.allowTeacherNote && (
              <div className="space-y-2">
                <label
                  htmlFor="final-teacher-note"
                  className="block text-sm font-semibold text-slate-900"
                >
                  선생님께 전하고 싶은 말 (선택 사항)
                </label>
                <p className="text-xs text-slate-500">
                  학급 생활이나 친구 관계에 대해 고민이 있거나 짝·모둠 활동 바람이 있다면 편하게
                  적어 주세요.
                </p>
                <textarea
                  id="final-teacher-note"
                  rows={4}
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

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStage('rating')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                응답 수정하기
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
                {submitting ? '제출 중...' : '설문 최종 제출'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
