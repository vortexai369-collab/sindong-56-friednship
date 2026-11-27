import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  BarChart3,
  Check,
  Copy,
  Database,
  LogOut,
  Menu,
  Network,
  Plus,
  Settings,
  Share2,
  Table2,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Gender, Student, Survey, SurveyResponse } from '../types';
import {
  addStudent,
  bulkImportStudents,
  createSampleClassSurvey,
  createSurvey,
  deleteStudent,
  deleteSurveyCascade,
  resetStudentResponse,
  toggleSurveyStatus,
  updateStudentInfo,
  updateStudentMemo,
  updateSurveyDetails,
} from '../services/firestoreService';
import { ParsedRosterRow } from '../utils/sociometry';
import { SociogramCanvas } from './SociogramCanvas';
import { RosterManager } from './RosterManager';
import { AnalyticsView } from './AnalyticsView';
import { SurveySettingsModal } from './SurveySettingsModal';
import { StudentShareModal } from './StudentShareModal';

interface TeacherDashboardProps {
  user: User;
  onSignOut: () => Promise<void>;
  onOpenStudentPortal: (joinCode?: string, accessCode?: string, isKiosk?: boolean) => void;
}

type WorkspaceTab = 'sociogram' | 'roster' | 'analytics';

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  user,
  onSignOut,
  onOpenStudentPortal,
}) => {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loadingSurveys, setLoadingSurveys] = useState(true);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loadingSurveyData, setLoadingSurveyData] = useState(false);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('sociogram');
  const [focusedResponseStudentId, setFocusedResponseStudentId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [confirmDeleteSurvey, setConfirmDeleteSurvey] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [copiedJoinCode, setCopiedJoinCode] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Subscribe to teacher's surveys
  useEffect(() => {
    const path = 'surveys';
    const q = query(collection(db, path), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Survey[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: data.ownerId,
              title: data.title,
              className: data.className,
              academicYear: data.academicYear,
              joinCode: data.joinCode,
              status: data.status,
              questions: data.questions || [],
              allowTeacherNote: Boolean(data.allowTeacherNote),
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            };
          })
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

        setSurveys(list);
        setLoadingSurveys(false);
        setActiveSurveyId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [user.uid]);

  // Subscribe to active survey's students & responses
  useEffect(() => {
    setFocusedResponseStudentId(null);
    if (!activeSurveyId) {
      setStudents([]);
      setResponses([]);
      return;
    }

    setLoadingSurveyData(true);
    const studentsPath = `surveys/${activeSurveyId}/students`;
    const responsesPath = `surveys/${activeSurveyId}/responses`;

    const studentsQuery = query(
      collection(db, 'surveys', activeSurveyId, 'students'),
      where('ownerId', '==', user.uid)
    );
    const responsesQuery = query(
      collection(db, 'surveys', activeSurveyId, 'responses'),
      where('ownerId', '==', user.uid)
    );

    let studentsLoaded = false;
    let responsesLoaded = false;

    const unsubStudents = onSnapshot(
      studentsQuery,
      (snap) => {
        const list: Student[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: data.ownerId,
            surveyId: data.surveyId,
            studentCode: data.studentCode,
            number: data.number,
            name: data.name,
            gender: data.gender,
            accessCode: data.accessCode,
            status: data.status,
            memo: data.memo || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        setStudents(list);
        studentsLoaded = true;
        if (studentsLoaded && responsesLoaded) setLoadingSurveyData(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, studentsPath);
      }
    );

    const unsubResponses = onSnapshot(
      responsesQuery,
      (snap) => {
        const list: SurveyResponse[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: data.ownerId,
            surveyId: data.surveyId,
            studentDocId: data.studentDocId,
            studentCode: data.studentCode,
            inviteKey: data.inviteKey,
            submittedByUid: data.submittedByUid,
            answers: data.answers || [],
            peerRatings: data.peerRatings || [],
            teacherNote: data.teacherNote || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        setResponses(list);
        responsesLoaded = true;
        if (studentsLoaded && responsesLoaded) setLoadingSurveyData(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, responsesPath);
      }
    );

    return () => {
      unsubStudents();
      unsubResponses();
    };
  }, [activeSurveyId, user.uid]);

  const activeSurvey = useMemo(
    () => surveys.find((s) => s.id === activeSurveyId) || null,
    [surveys, activeSurveyId]
  );

  const respondedIds = useMemo(
    () => new Set(responses.map((r) => r.studentDocId)),
    [responses]
  );

  const runSafe = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '작업 처리 중 오류가 발생했습니다.';
      setActionError(
        msg.includes('Quota exceeded')
          ? 'Firestore 일일 무료 사용량을 초과했습니다.'
          : '요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
    }
  };

  const handleSeedSample = async () => {
    setSeedingSample(true);
    await runSafe(async () => {
      const created = await createSampleClassSurvey(user.uid);
      setActiveSurveyId(created.id);
      setActiveTab('sociogram');
    });
    setSeedingSample(false);
  };

  const handleCopyJoinCode = async () => {
    if (!activeSurvey) return;
    try {
      await navigator.clipboard.writeText(activeSurvey.joinCode);
      setCopiedJoinCode(true);
      setTimeout(() => setCopiedJoinCode(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const handleToggleStatus = async () => {
    if (!activeSurvey) return;
    setTogglingStatus(true);
    await runSafe(async () => {
      const next = activeSurvey.status === 'open' ? 'closed' : 'open';
      await toggleSurveyStatus(activeSurvey, next, students, respondedIds);
    });
    setTogglingStatus(false);
  };

  const handleDeleteSurvey = async () => {
    if (!activeSurvey) return;
    await runSafe(async () => {
      await deleteSurveyCascade(activeSurvey, students, responses);
      setConfirmDeleteSurvey(false);
    });
  };

  const handleViewStudentResponse = (studentId: string) => {
    setFocusedResponseStudentId(studentId);
    setActiveTab('analytics');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
          7942 친구사이
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden text-slate-500 hover:text-slate-800 cursor-pointer"
          aria-label="메뉴 닫기"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Views */}
      <div className="p-3 space-y-1 border-b border-slate-200">
        <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-slate-400">분석 워크스페이스</p>
        <button
          type="button"
          onClick={() => {
            setActiveTab('sociogram');
            setMobileMenuOpen(false);
          }}
          disabled={!activeSurvey}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 ${
            activeTab === 'sociogram'
              ? 'bg-blue-50 text-blue-800'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Network className="w-4 h-4 shrink-0" />
          교우관계망
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('roster');
            setMobileMenuOpen(false);
          }}
          disabled={!activeSurvey}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 ${
            activeTab === 'roster'
              ? 'bg-blue-50 text-blue-800'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Table2 className="w-4 h-4 shrink-0" />
          학생 명단 · 시트
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('analytics');
            setMobileMenuOpen(false);
          }}
          disabled={!activeSurvey}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 ${
            activeTab === 'analytics'
              ? 'bg-blue-50 text-blue-800'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          학생 응답 · 분석
        </button>
      </div>

      {/* Surveys List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="px-2.5 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-slate-400">내 학급 조사 ({surveys.length})</p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            title="새 조사 만들기"
            className="text-blue-700 hover:text-blue-900 p-1 rounded hover:bg-blue-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {loadingSurveys ? (
          <div className="space-y-2 px-2">
            <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
            <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
          </div>
        ) : surveys.length === 0 ? (
          <p className="px-2.5 py-3 text-xs text-slate-500">생성된 조사가 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {surveys.map((s) => {
              const isActive = s.id === activeSurveyId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setActiveSurveyId(s.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{s.className}</span>
                    <span
                      className={`text-[11px] shrink-0 ${
                        isActive
                          ? s.status === 'open'
                            ? 'text-emerald-300'
                            : 'text-slate-400'
                          : s.status === 'open'
                          ? 'text-emerald-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {s.status === 'open' ? '진행중' : '마감'}
                    </span>
                  </div>
                  <p
                    className={`text-xs truncate mt-0.5 ${
                      isActive ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {s.title}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 space-y-1.5">
          <button
            type="button"
            onClick={handleSeedSample}
            disabled={seedingSample}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <Database className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            {seedingSample ? '샘플 학급 생성 중...' : '샘플 학급 불러오기'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              if (activeSurvey) {
                setShowShareModal(true);
              } else {
                onOpenStudentPortal('', '', false);
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            학생 전용 입장 창 공유
          </button>
        </div>
      </div>

      {/* Teacher Profile & Sign Out */}
      <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || '교사 프로필'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
              {(user.displayName || 'T').slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">
              {user.displayName || '선생님'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="로그아웃"
          className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-64 bg-white h-full border-r border-slate-200">{sidebarContent}</div>
          <div
            className="flex-1 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Contextual Top Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
              aria-label="메뉴 열기"
            >
              <Menu className="w-5 h-5" />
            </button>

            {activeSurvey ? (
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="font-semibold text-slate-900 whitespace-nowrap">
                  {activeSurvey.className}
                </span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-600 truncate">{activeSurvey.title}</span>
                <span className="hidden md:inline text-slate-300">·</span>
                <span className="hidden md:inline text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  응답 {respondedIds.size}/{students.length}명
                </span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-slate-900">교우관계 조사 시작하기</span>
            )}
          </div>

          {activeSurvey && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyJoinCode}
                title="학급 코드 복사"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedJoinCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                )}
                학급코드 {activeSurvey.joinCode}
              </button>

              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={togglingStatus}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  activeSurvey.status === 'open'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {activeSurvey.status === 'open' ? '응답 접수 중' : '조사 마감됨'}
              </button>

              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                title="조사 문항 및 설정"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setConfirmDeleteSurvey(true)}
                title="조사 삭제"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                학생 입장 창 공유
              </button>
            </div>
          )}
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full mx-auto space-y-4">
          {actionError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-3">
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-red-500 hover:text-red-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loadingSurveys ? (
            <div className="space-y-4">
              <div className="h-14 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="h-[520px] bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : !activeSurvey ? (
            /* Clean Empty State */
            <div className="bg-white border border-slate-200 rounded-xl p-10 sm:p-14 max-w-2xl mx-auto mt-8 text-center space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-slate-900">
                  첫 교우관계 조사를 시작해 보세요
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
                  새 학급 조사를 만들어 구글 시트 명단(학생ID, 번호, 이름, 성별, 코드, 상태)을
                  붙여넣거나, 16명 샘플 학급 데이터를 불러와 소시오그램 분석 기능을 바로 체험할 수
                  있습니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  새 조사 만들기
                </button>
                <button
                  type="button"
                  onClick={handleSeedSample}
                  disabled={seedingSample}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Database className="w-4 h-4 text-blue-700" />
                  {seedingSample ? '샘플 생성 중...' : '샘플 학급 불러오기 (5학년 3반)'}
                </button>
              </div>
            </div>
          ) : loadingSurveyData ? (
            <div className="space-y-4">
              <div className="h-12 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="h-[520px] bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'sociogram' && (
                <SociogramCanvas
                  survey={activeSurvey}
                  students={students}
                  responses={responses}
                  onSaveMemo={async (studentId, memo) => {
                    await runSafe(() => updateStudentMemo(activeSurvey.id, studentId, memo));
                  }}
                  onViewStudentResponse={handleViewStudentResponse}
                />
              )}

              {activeTab === 'roster' && (
                <RosterManager
                  survey={activeSurvey}
                  students={students}
                  responses={responses}
                  onAddStudent={async (data: {
                    studentCode: string;
                    number: number;
                    name: string;
                    gender: Gender;
                    accessCode?: string;
                  }) => {
                    await runSafe(() => addStudent(activeSurvey, data, students, respondedIds));
                  }}
                  onUpdateStudent={async (student, updates) => {
                    await runSafe(() =>
                      updateStudentInfo(activeSurvey, student, updates, students, respondedIds)
                    );
                  }}
                  onDeleteStudent={async (student) => {
                    await runSafe(() =>
                      deleteStudent(activeSurvey, student, students, respondedIds)
                    );
                  }}
                  onResetResponse={async (student) => {
                    await runSafe(() =>
                      resetStudentResponse(activeSurvey, student, students, respondedIds)
                    );
                  }}
                  onBulkImport={async (rows: ParsedRosterRow[], replace: boolean) => {
                    await runSafe(() =>
                      bulkImportStudents(activeSurvey, rows, students, respondedIds, replace)
                    );
                  }}
                  onOpenStudentSurvey={(accessCode) =>
                    onOpenStudentPortal(activeSurvey.joinCode, accessCode, true)
                  }
                  onViewStudentResponse={handleViewStudentResponse}
                />
              )}

              {activeTab === 'analytics' && (
                <AnalyticsView
                  survey={activeSurvey}
                  students={students}
                  responses={responses}
                  initialSelectedStudentId={focusedResponseStudentId}
                  onSaveMemo={async (studentId, memo) => {
                    await runSafe(() => updateStudentMemo(activeSurvey.id, studentId, memo));
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Create Survey Modal */}
      {showCreateModal && (
        <SurveySettingsModal
          mode="create"
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (data) => {
            await runSafe(async () => {
              const created = await createSurvey(user.uid, data);
              setActiveSurveyId(created.id);
              setActiveTab('roster');
            });
          }}
        />
      )}

      {/* Edit Survey Modal */}
      {showEditModal && activeSurvey && (
        <SurveySettingsModal
          mode="edit"
          initialSurvey={activeSurvey}
          onClose={() => setShowEditModal(false)}
          onSubmit={async (data) => {
            await runSafe(() =>
              updateSurveyDetails(activeSurvey, data, students, respondedIds)
            );
          }}
        />
      )}

      {/* Student Entry Window Share Modal */}
      {showShareModal && activeSurvey && (
        <StudentShareModal
          survey={activeSurvey}
          totalStudents={students.length}
          respondedCount={respondedIds.size}
          onClose={() => setShowShareModal(false)}
          onOpenKioskInCurrentTab={() => onOpenStudentPortal(activeSurvey.joinCode, '', true)}
        />
      )}

      {/* Delete Survey Confirmation Modal */}
      {confirmDeleteSurvey && activeSurvey && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              이 교우관계 조사를 삭제할까요?
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>
                {activeSurvey.className} — {activeSurvey.title}
              </strong>
              의 학생 명단({students.length}명)과 제출된 응답({responses.length}건)이 영구적으로
              삭제되며 복구할 수 없습니다.
            </p>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSurvey(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteSurvey}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
