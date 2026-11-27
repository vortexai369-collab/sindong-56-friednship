import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Download,
  Lock,
  Plus,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlock,
  UserPlus,
  X,
} from 'lucide-react';
import { SociometricType, Student, Survey, SurveyResponse } from '../types';
import { computeClassAnalytics, triggerCsvDownload } from '../utils/sociometry';
import {
  evaluateClassPlacement,
  exportPlacementToCsv,
  ManualConstraint,
  optimizeClassPlacement,
  PlacementMap,
  PlacementStrategyId,
  PlacementWeights,
  rankClassesForStudent,
  STRATEGY_PRESETS,
} from '../utils/classPlacement';

interface ClassPlacementSimulatorProps {
  survey: Survey;
  students: Student[];
  responses: SurveyResponse[];
  onInspectStudent?: (studentId: string) => void;
}

type ControlPanelTab = 'strategy' | 'constraints' | 'theory';
type BoardFilter = 'all' | 'conflict' | 'vulnerable' | 'locked';

const TYPE_TEXT_COLOR: Record<SociometricType, string> = {
  인기형: 'text-emerald-700',
  평균형: 'text-blue-700',
  '고립·관심형': 'text-amber-700',
  '갈등·주의형': 'text-red-700',
  양면형: 'text-violet-700',
  미분류: 'text-slate-500',
};

const WEIGHT_FIELDS: Array<{
  key: keyof PlacementWeights;
  label: string;
  theory: string;
}> = [
  {
    key: 'conflictSeparation',
    label: '갈등·불편 관계 분리',
    theory: 'Coie & Dodge · 또래 거부 최소화',
  },
  {
    key: 'safeBaseSupport',
    label: '정서적 안전기지 확보',
    theory: 'Bowlby · Ladd 전환기 지지',
  },
  {
    key: 'cliqueDispersal',
    label: '과밀 소집단·파벌 분산',
    theory: 'Gest & Rodkin · 배타성 완화',
  },
  {
    key: 'leadershipBalance',
    label: '친사회적 리더·가교 균등',
    theory: '중심성·또래 영향력 분산',
  },
  {
    key: 'demographicBalance',
    label: '인원·성비·관심학생 균형',
    theory: '학급 분위기·지도 부담 균형',
  },
];

const PSYCHOLOGY_REFERENCES = [
  {
    principle: '1. 갈등·거부 관계 분리',
    scholar: 'Coie & Dodge (1983) · Ladd (2006)',
    mechanism: '상호 갈등(-1/-2) 및 강한 불편(-2) 보고 쌍을 서로 다른 반에 배치',
    effect: '새 학기 초반 또래 갈등의 재발과 정서적 위축·학교폭력 위험 요인을 선제적으로 차단합니다.',
  },
  {
    principle: '2. 정서적 안전기지 보장',
    scholar: 'Bowlby 애착이론 · Ladd 전환기 적응 연구',
    mechanism: '고립·관심형 및 소속감 저하 학생에게 최소 1명의 우호적 친구 또는 친사회적 가교 파트너를 동반 배치',
    effect: '낯선 학급 환경에서 발생하는 전환기 불안을 낮추고 초기 또래 관계 확장의 발판을 마련합니다.',
  },
  {
    principle: '3. 배타적 소집단·파벌 분산',
    scholar: 'Gest & Rodkin (2011) 학급 생태학 모델',
    mechanism: '상호 연결이 밀집된 3명 이상 또래 그룹을 학급별로 고르게 분산 배치',
    effect: '특정 집단의 배타적 주도권 독점을 막고 다양한 친구와 어울리는 개방적 학급 문화를 형성합니다.',
  },
  {
    principle: '4. 친사회적 리더·가교 균등 배치',
    scholar: 'Moreno 소시오메트리 · 네트워크 중심성 연구',
    mechanism: '영향력 지수 상위 학생과 집단 간 가교 학생을 학급별로 고르게 분배',
    effect: '모든 학급에 긍정적 또래 규범을 이끌고 소외 학생을 연결해 줄 수 있는 사회적 자본을 확보합니다.',
  },
  {
    principle: '5. 인원·성비·지도 난이도 균형',
    scholar: '학급 풍토(Classroom Climate) 균형 원리',
    mechanism: '학급당 인원(±1명), 성별 비율, 평균 소속감 및 주의 관찰 학생 수를 균등화',
    effect: '특정 학급에 생활지도 부담이 집중되지 않도록 예방하고 안정적인 교수·학습 환경을 조성합니다.',
  },
];

export const ClassPlacementSimulator: React.FC<ClassPlacementSimulatorProps> = ({
  survey,
  students,
  responses,
  onInspectStudent,
}) => {
  const analytics = useMemo(
    () => computeClassAnalytics(students, responses, 'all'),
    [students, responses]
  );

  const orderedStudents = useMemo(
    () => [...students].sort((a, b) => a.number - b.number),
    [students]
  );

  const maxAllowedClasses = Math.max(2, Math.min(6, Math.floor(students.length / 2) || 2));
  const defaultClassCount = students.length >= 15 ? 3 : 2;

  const [classCount, setClassCount] = useState<number>(defaultClassCount);
  const [strategyId, setStrategyId] = useState<PlacementStrategyId>('balanced');
  const [weights, setWeights] = useState<PlacementWeights>(STRATEGY_PRESETS[0].weights);
  const [constraints, setConstraints] = useState<ManualConstraint[]>([]);
  const [lockedAssignments, setLockedAssignments] = useState<PlacementMap>({});
  const [placement, setPlacement] = useState<PlacementMap>({});
  const [seed, setSeed] = useState<number>(1);

  const [controlTab, setControlTab] = useState<ControlPanelTab>('strategy');
  const [boardFilter, setBoardFilter] = useState<BoardFilter>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Manual constraint form state
  const [constraintA, setConstraintA] = useState<string>('');
  const [constraintB, setConstraintB] = useState<string>('');
  const [constraintType, setConstraintType] = useState<'separate' | 'together'>('separate');
  const [constraintReason, setConstraintReason] = useState<string>('');

  // Reset & run initial optimization whenever survey changes or roster size changes meaningfully
  const rosterKey = useMemo(
    () => `${survey.id}:${orderedStudents.map((s) => s.id).join(',')}:${responses.length}`,
    [survey.id, orderedStudents, responses.length]
  );

  useEffect(() => {
    if (orderedStudents.length < 2) {
      setPlacement({});
      return;
    }
    const clampedCount = Math.max(2, Math.min(maxAllowedClasses, classCount));
    if (clampedCount !== classCount) {
      setClassCount(clampedCount);
    }
    const validIds = new Set(orderedStudents.map((s) => s.id));
    const cleanedLocks: PlacementMap = {};
    Object.entries(lockedAssignments).forEach(([id, ci]) => {
      if (validIds.has(id)) {
        cleanedLocks[id] = Math.max(0, Math.min(clampedCount - 1, ci));
      }
    });
    const next = optimizeClassPlacement(
      students,
      responses,
      analytics,
      clampedCount,
      weights,
      constraints,
      cleanedLocks,
      seed
    );
    setPlacement(next);
    setSelectedStudentId(null);
    setHighlightedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey]);

  const runOptimization = (
    nextClassCount: number,
    nextWeights: PlacementWeights,
    nextConstraints: ManualConstraint[],
    nextLocks: PlacementMap,
    nextSeed: number
  ) => {
    if (orderedStudents.length < 2) return;
    const result = optimizeClassPlacement(
      students,
      responses,
      analytics,
      nextClassCount,
      nextWeights,
      nextConstraints,
      nextLocks,
      nextSeed
    );
    setPlacement(result);
    setHighlightedIds(new Set());
  };

  const handleClassCountChange = (nextCount: number) => {
    const safeCount = Math.max(2, Math.min(maxAllowedClasses, nextCount));
    setClassCount(safeCount);
    const clampedLocks: PlacementMap = {};
    Object.entries(lockedAssignments).forEach(([id, ci]) => {
      clampedLocks[id] = Math.max(0, Math.min(safeCount - 1, ci));
    });
    setLockedAssignments(clampedLocks);
    runOptimization(safeCount, weights, constraints, clampedLocks, seed);
  };

  const handleSelectStrategy = (id: PlacementStrategyId) => {
    const preset = STRATEGY_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setStrategyId(id);
    setWeights(preset.weights);
    runOptimization(classCount, preset.weights, constraints, lockedAssignments, seed);
  };

  const handleWeightChange = (key: keyof PlacementWeights, val: number) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
  };

  const handleExploreAlternative = () => {
    const nextSeed = seed + 1;
    setSeed(nextSeed);
    runOptimization(classCount, weights, constraints, lockedAssignments, nextSeed);
  };

  const handleReoptimizeCurrent = () => {
    runOptimization(classCount, weights, constraints, lockedAssignments, seed);
  };

  const handleMoveStudent = (studentId: string, targetClassIndex: number) => {
    setPlacement((prev) => ({ ...prev, [studentId]: targetClassIndex }));
    setLockedAssignments((prev) =>
      prev[studentId] !== undefined ? { ...prev, [studentId]: targetClassIndex } : prev
    );
  };

  const handleStudentRowClick = (studentId: string) => {
    if (!selectedStudentId) {
      setSelectedStudentId(studentId);
      return;
    }
    if (selectedStudentId === studentId) {
      setSelectedStudentId(null);
      return;
    }
    // Swap two students if they are in different classes; otherwise switch selection
    const classA = placement[selectedStudentId];
    const classB = placement[studentId];
    if (classA !== undefined && classB !== undefined && classA !== classB) {
      setPlacement((prev) => ({
        ...prev,
        [selectedStudentId]: classB,
        [studentId]: classA,
      }));
      setLockedAssignments((prev) => {
        const next = { ...prev };
        if (next[selectedStudentId] !== undefined) next[selectedStudentId] = classB;
        if (next[studentId] !== undefined) next[studentId] = classA;
        return next;
      });
      setSelectedStudentId(null);
    } else {
      setSelectedStudentId(studentId);
    }
  };

  const handleToggleLock = (studentId: string) => {
    setLockedAssignments((prev) => {
      const next = { ...prev };
      if (next[studentId] !== undefined) {
        delete next[studentId];
      } else {
        next[studentId] = placement[studentId] ?? 0;
      }
      return next;
    });
  };

  const handleAddConstraint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!constraintA || !constraintB || constraintA === constraintB) return;
    const exists = constraints.some(
      (c) =>
        (c.aId === constraintA && c.bId === constraintB) ||
        (c.aId === constraintB && c.bId === constraintA)
    );
    if (exists) return;

    const newItem: ManualConstraint = {
      id: `mc_${Date.now().toString(36)}`,
      aId: constraintA,
      bId: constraintB,
      type: constraintType,
      reason: constraintReason.trim().slice(0, 60),
    };
    const nextConstraints = [...constraints, newItem];
    setConstraints(nextConstraints);
    setConstraintReason('');
    runOptimization(classCount, weights, nextConstraints, lockedAssignments, seed);
  };

  const handleRemoveConstraint = (id: string) => {
    const nextConstraints = constraints.filter((c) => c.id !== id);
    setConstraints(nextConstraints);
    runOptimization(classCount, weights, nextConstraints, lockedAssignments, seed);
  };

  const evaluation = useMemo(() => {
    if (orderedStudents.length < 2) return null;
    return evaluateClassPlacement(
      students,
      responses,
      analytics,
      placement,
      classCount,
      weights,
      constraints
    );
  }, [orderedStudents.length, students, responses, analytics, placement, classCount, weights, constraints]);

  const selectedRankings = useMemo(() => {
    if (!selectedStudentId || orderedStudents.length < 2) return [];
    return rankClassesForStudent(
      selectedStudentId,
      students,
      responses,
      analytics,
      placement,
      classCount,
      weights,
      constraints
    );
  }, [selectedStudentId, orderedStudents.length, students, responses, analytics, placement, classCount, weights, constraints]);

  const activePreset = STRATEGY_PRESETS.find((p) => p.id === strategyId) || STRATEGY_PRESETS[0];
  const lockedCount = Object.keys(lockedAssignments).length;

  const nameOf = (id: string) => {
    const st = analytics.metricsById[id]?.student;
    return st ? `${st.number}번 ${st.name}` : id;
  };

  const handleExportCsv = () => {
    if (!evaluation) return;
    const csv = exportPlacementToCsv(evaluation, analytics, lockedAssignments);
    triggerCsvDownload(csv, `${survey.className}_반배정시뮬레이션_${classCount}개반.csv`);
  };

  if (students.length < 2) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <p className="text-base font-semibold text-slate-900">
          반배정 시뮬레이션을 실행하려면 최소 2명 이상의 학생이 필요합니다
        </p>
        <p className="text-sm text-slate-500">
          학생 명단을 등록하고 교우관계 설문 응답을 수집하면 교육심리학 기준에 따라 최적 반배정안을
          자동으로 설계할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{survey.academicYear}학년도</span>
            <span aria-hidden="true">·</span>
            <span>{survey.className}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              학생 {students.length}명 (설문 응답 {responses.length}명 반영)
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            교육심리학 기반 반배정 시뮬레이션
          </h1>
          <p className="text-xs text-slate-600 max-w-2xl">
            조사된 친밀도·갈등·소시오메트리 지표를 바탕으로 갈등 분리, 정서적 안전기지 확보, 파벌 분산,
            리더십·성비 균형을 고려해 최적의 반배정안을 도출하고 실시간으로 미세 조정합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span>목표 학급 수</span>
            <select
              value={classCount}
              onChange={(e) => handleClassCountChange(Number(e.target.value))}
              aria-label="목표 학급 수"
              className="bg-transparent font-semibold text-slate-900 focus:outline-none cursor-pointer tabular-nums"
            >
              {Array.from({ length: maxAllowedClasses - 1 }, (_, i) => i + 2).map((cnt) => (
                <option key={cnt} value={cnt}>
                  {cnt}개 반
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleReoptimizeCurrent}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            자동 배정 최적화
          </button>

          <button
            type="button"
            onClick={handleExploreAlternative}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            다른 대안 탐색
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            CSV 다운로드
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            배정안 인쇄
          </button>
        </div>
      </div>

      {/* 4-Column Psychological Evaluation KPI Strip */}
      {evaluation && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">교육심리 배정 적합도</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                evaluation.overallScore >= 85
                  ? 'text-emerald-700'
                  : evaluation.overallScore >= 70
                  ? 'text-blue-700'
                  : 'text-amber-700'
              }`}
            >
              {evaluation.overallScore}점
              <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>
            </p>
            <p className="text-xs text-slate-500 truncate">{activePreset.label}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">갈등·불편 쌍 분리율</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                evaluation.conflictSeparationRate === 100
                  ? 'text-emerald-700'
                  : evaluation.conflictSeparationRate >= 80
                  ? 'text-amber-700'
                  : 'text-red-600'
              }`}
            >
              {evaluation.conflictSeparationRate}%
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {evaluation.totalConflictPairs > 0
                ? `${evaluation.separatedConflictPairs} / ${evaluation.totalConflictPairs}쌍 다른 반 배치`
                : '조사된 갈등 쌍 없음'}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">정서적 안전기지 확보</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                evaluation.vulnerableSafeBaseRate >= 90
                  ? 'text-emerald-700'
                  : evaluation.vulnerableSafeBaseRate >= 70
                  ? 'text-blue-700'
                  : 'text-amber-700'
              }`}
            >
              {evaluation.vulnerableSafeBaseRate}%
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              고립·관심 {evaluation.vulnerableSecured}/{evaluation.vulnerableTotal}명 · 전체 동반{' '}
              {evaluation.allStudentsBuddyRate}%
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
            <p className="text-xs font-medium text-slate-500">학급 간 균형도</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {evaluation.balanceScore}점
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              인원 차 {evaluation.headcountSpread}명 · 성비 차 {evaluation.genderSpread}%p · 영향력 차{' '}
              {evaluation.influenceSpread}
            </p>
          </div>
        </div>
      )}

      {/* Simulation Controls: Strategy & Weights / Manual Constraints / Educational Psychology Basis */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'strategy', label: '배정 전략 · 심리 가중치', icon: SlidersHorizontal },
                {
                  id: 'constraints',
                  label: `교사 수동 제약 (${constraints.length})`,
                  icon: UserPlus,
                },
                { id: 'theory', label: '교육심리학적 근거', icon: BookOpen },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setControlTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    controlTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {responses.length === 0 && (
            <span className="text-xs text-amber-700">
              아직 제출된 설문 응답이 없어 인원·성비 균형 중심으로 배정됩니다.
            </span>
          )}
        </div>

        {/* Tab 1: Strategy Presets & Weight Sliders */}
        {controlTab === 'strategy' && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {STRATEGY_PRESETS.map((preset) => {
                const active = strategyId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectStrategy(preset.id)}
                    className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer space-y-1 ${
                      active
                        ? 'bg-blue-50/70 border-blue-600 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold ${
                        active ? 'text-blue-800' : 'text-slate-900'
                      }`}
                    >
                      {preset.label}
                    </p>
                    <p className="text-[11px] text-slate-500">{preset.shortDesc}</p>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">{activePreset.rationale}</p>

            <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {WEIGHT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800">{field.label}</span>
                    <span className="font-mono font-semibold text-blue-700 tabular-nums">
                      {weights[field.key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={weights[field.key]}
                    onChange={(e) => handleWeightChange(field.key, Number(e.target.value))}
                    aria-label={field.label}
                    className="w-full accent-blue-700 cursor-pointer"
                  />
                  <p className="text-[11px] text-slate-400">{field.theory}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                슬라이더 조정 후 &lsquo;자동 배정 최적화&rsquo;를 누르면 변경된 심리 가중치로 새
                배정안을 계산합니다.
              </p>
              <button
                type="button"
                onClick={handleReoptimizeCurrent}
                className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                가중치 반영 재계산
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Teacher Manual Constraints */}
        {controlTab === 'constraints' && (
          <div className="p-5 space-y-4">
            <form
              onSubmit={handleAddConstraint}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">학생 A</label>
                <select
                  value={constraintA}
                  onChange={(e) => setConstraintA(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-blue-600"
                >
                  <option value="">학생 선택…</option>
                  {orderedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.number}번 {s.name} ({s.gender})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">학생 B</label>
                <select
                  value={constraintB}
                  onChange={(e) => setConstraintB(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-blue-600"
                >
                  <option value="">학생 선택…</option>
                  {orderedStudents
                    .filter((s) => s.id !== constraintA)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.number}번 {s.name} ({s.gender})
                      </option>
                    ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">제약 유형</label>
                <select
                  value={constraintType}
                  onChange={(e) =>
                    setConstraintType(e.target.value as 'separate' | 'together')
                  }
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-blue-600"
                >
                  <option value="separate">필수 분리 (다른 반)</option>
                  <option value="together">필수 동반 (같은 반)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  사유 (선택)
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={constraintReason}
                  onChange={(e) => setConstraintReason(e.target.value)}
                  placeholder="예: 쌍둥이, 학부모 요청"
                  className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={!constraintA || !constraintB || constraintA === constraintB}
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  제약 추가
                </button>
              </div>
            </form>

            {constraints.length === 0 ? (
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                등록된 수동 제약이 없습니다. 쌍둥이 분리, 특별 지원 동반, 학부모 요청 등 설문 외
                현장 조건이 있다면 위에서 추가해 주세요.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {constraints.map((c) => {
                  const ca = placement[c.aId];
                  const cb = placement[c.bId];
                  const satisfied =
                    c.type === 'separate' ? ca !== cb : ca === cb;
                  return (
                    <div
                      key={c.id}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-semibold ${
                            c.type === 'separate' ? 'text-red-700' : 'text-blue-700'
                          }`}
                        >
                          {c.type === 'separate' ? '필수 분리' : '필수 동반'}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="font-medium text-slate-900">
                          {nameOf(c.aId)} ↔ {nameOf(c.bId)}
                        </span>
                        {c.reason && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-500">{c.reason}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-semibold ${
                            satisfied ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {satisfied ? '충족됨' : '위반 중'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveConstraint(c.id)}
                          title="제약 삭제"
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Educational Psychology Theoretical Basis */}
        {controlTab === 'theory' && (
          <div className="divide-y divide-slate-100">
            {PSYCHOLOGY_REFERENCES.map((ref) => (
              <div
                key={ref.principle}
                className="px-5 py-3.5 grid grid-cols-1 lg:grid-cols-12 gap-2 text-xs"
              >
                <div className="lg:col-span-3">
                  <p className="font-semibold text-slate-900">{ref.principle}</p>
                  <p className="text-[11px] text-blue-700 mt-0.5">{ref.scholar}</p>
                </div>
                <div className="lg:col-span-4 text-slate-700 leading-relaxed">{ref.mechanism}</div>
                <div className="lg:col-span-5 text-slate-500 leading-relaxed">{ref.effect}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Class Placement Board */}
      {evaluation && (
        <div className="space-y-3">
          {/* Board Utility Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                {(
                  [
                    { id: 'all', label: `전체 (${students.length})` },
                    { id: 'conflict', label: '갈등 주의' },
                    { id: 'vulnerable', label: '안전기지 필요' },
                    { id: 'locked', label: `고정됨 (${lockedCount})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setBoardFilter(f.id);
                      setHighlightedIds(new Set());
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      boardFilter === f.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {lockedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLockedAssignments({})}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  고정 전체 해제
                </button>
              )}

              {highlightedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setHighlightedIds(new Set())}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  강조 해제
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
              학생을 클릭한 뒤 다른 반 학생을 클릭하면 1:1 맞교환되며, 반 드롭다운으로 바로 이동할 수
              있습니다.
            </p>
          </div>

          {/* Selected Student Swap & Fit Recommendation Banner */}
          {selectedStudentId && analytics.metricsById[selectedStudentId] && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="space-y-0.5 text-xs">
                <p className="font-semibold text-blue-950">
                  맞교환 · 이동 대상 선택됨: {nameOf(selectedStudentId)} (현재{' '}
                  {(placement[selectedStudentId] ?? 0) + 1}반)
                </p>
                <p className="text-blue-800">
                  다른 반 학생을 클릭해 맞교환하거나, 아래 심리 적합도 추천 반으로 바로 이동하세요.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedRankings.map((r) => {
                  const isCurrent = r.classIndex === (placement[selectedStudentId] ?? 0);
                  return (
                    <button
                      key={r.classIndex}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => {
                        handleMoveStudent(selectedStudentId, r.classIndex);
                        setSelectedStudentId(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap tabular-nums cursor-pointer disabled:cursor-default ${
                        isCurrent
                          ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                          : 'bg-white border-blue-200 text-slate-800 hover:bg-blue-100/70'
                      }`}
                    >
                      {r.label}
                      {isCurrent ? ' (현재)' : ''} · 갈등 {r.conflictsInClass} · 지지{' '}
                      {r.supportsInClass}
                    </button>
                  );
                })}
                {onInspectStudent && (
                  <button
                    type="button"
                    onClick={() => onInspectStudent(selectedStudentId)}
                    className="px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    개별 응답 보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedStudentId(null)}
                  className="p-1 text-blue-700 hover:text-blue-950 cursor-pointer"
                  aria-label="선택 취소"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Class Columns Grid */}
          <div
            className={`grid grid-cols-1 gap-4 items-start ${
              classCount === 2
                ? 'md:grid-cols-2'
                : classCount === 3
                ? 'md:grid-cols-2 xl:grid-cols-3'
                : 'md:grid-cols-2 xl:grid-cols-4'
            }`}
          >
            {evaluation.buckets.map((bucket) => {
              const members = bucket.memberIds
                .map((id) => analytics.metricsById[id])
                .filter(Boolean)
                .sort((a, b) => a.student.number - b.student.number);

              const hasConflictInside = bucket.conflictPairsInside.length > 0;

              return (
                <div
                  key={bucket.classIndex}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
                >
                  {/* Class Bucket Header */}
                  <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-slate-900">{bucket.label}</h2>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums">
                        {bucket.memberIds.length}명 (남 {bucket.maleCount} / 여 {bucket.femaleCount})
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 tabular-nums">
                      <span>소속감 {bucket.avgBelonging}</span>
                      <span aria-hidden="true">·</span>
                      <span>영향력 {bucket.avgInfluence}</span>
                      <span aria-hidden="true">·</span>
                      <span>리더 {bucket.leaderCount}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          hasConflictInside
                            ? 'text-red-600 font-semibold'
                            : 'text-emerald-700 font-medium'
                        }
                      >
                        갈등 {bucket.conflictPairsInside.length}쌍
                      </span>
                    </div>
                  </div>

                  {/* Student Rows */}
                  <div className="divide-y divide-slate-100">
                    {members.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        배정된 학생이 없습니다.
                      </div>
                    ) : (
                      members.map((m) => {
                        const sid = m.student.id;
                        const diag = evaluation.diagnosticsById[sid];
                        const isLocked = lockedAssignments[sid] !== undefined;
                        const isSelected = selectedStudentId === sid;
                        const isHighlighted = highlightedIds.has(sid);

                        const hasAlert =
                          (diag?.conflictPeerIds.length ?? 0) > 0 ||
                          (diag?.violatedSeparateIds.length ?? 0) > 0 ||
                          (diag?.violatedTogetherIds.length ?? 0) > 0;
                        const missingSafeBase =
                          Boolean(diag?.isVulnerable) &&
                          !diag?.hasSafeBase;

                        // Filter dimming / hiding
                        const matchesFilter =
                          boardFilter === 'all' ||
                          (boardFilter === 'conflict' && hasAlert) ||
                          (boardFilter === 'vulnerable' && Boolean(diag?.isVulnerable)) ||
                          (boardFilter === 'locked' && isLocked);

                        if (!matchesFilter) return null;

                        return (
                          <div
                            key={sid}
                            className={`px-3.5 py-2.5 transition-colors ${
                              isSelected
                                ? 'bg-blue-50/90'
                                : isHighlighted
                                ? 'bg-amber-50/80'
                                : hasAlert
                                ? 'bg-red-50/35 hover:bg-red-50/60'
                                : 'bg-white hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleStudentRowClick(sid)}
                                className="flex items-center gap-2 min-w-0 text-left flex-1 cursor-pointer"
                              >
                                <span className="font-mono text-xs text-slate-400 w-5 shrink-0 tabular-nums">
                                  {String(m.student.number).padStart(2, '0')}
                                </span>
                                <span className="text-sm font-semibold text-slate-900 truncate">
                                  {m.student.name}
                                </span>
                                <span className="text-[11px] text-slate-400 shrink-0">
                                  {m.student.gender}
                                </span>
                                <span
                                  className={`text-[11px] font-medium shrink-0 ${
                                    TYPE_TEXT_COLOR[m.sociometricType]
                                  }`}
                                >
                                  {m.sociometricType}
                                </span>
                              </button>

                              <div className="flex items-center gap-1 shrink-0 no-print">
                                <button
                                  type="button"
                                  onClick={() => handleToggleLock(sid)}
                                  title={isLocked ? '배정 고정 해제' : '이 반에 고정'}
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    isLocked
                                      ? 'text-blue-700 bg-blue-50'
                                      : 'text-slate-300 hover:text-slate-600'
                                  }`}
                                >
                                  {isLocked ? (
                                    <Lock className="w-3.5 h-3.5" />
                                  ) : (
                                    <Unlock className="w-3.5 h-3.5" />
                                  )}
                                </button>

                                <select
                                  value={bucket.classIndex}
                                  onChange={(e) => handleMoveStudent(sid, Number(e.target.value))}
                                  aria-label={`${m.student.name} 반 이동`}
                                  className="text-[11px] text-slate-600 bg-transparent border border-slate-200 rounded px-1.5 py-0.5 hover:border-slate-300 focus:outline-none focus:border-blue-600 cursor-pointer tabular-nums"
                                >
                                  {evaluation.buckets.map((targetB) => (
                                    <option key={targetB.classIndex} value={targetB.classIndex}>
                                      {targetB.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Concise Educational Psychology Status Line */}
                            <div className="mt-1 pl-7 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                              <span
                                className={
                                  hasAlert
                                    ? 'text-red-700 font-medium'
                                    : missingSafeBase
                                    ? 'text-amber-700 font-medium'
                                    : diag?.isVulnerable && (diag?.supportPeerIds.length ?? 0) > 0
                                    ? 'text-emerald-700 font-medium'
                                    : 'text-slate-500'
                                }
                              >
                                {diag?.rationale}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
                                소속 {m.belongingScore} · 영향 {m.influenceScore}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Educational Psychology Live Audit & Verification Report */}
      {evaluation && evaluation.auditItems.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                현재 배정안 교육심리학 검증 결과
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                학생을 수동으로 이동하거나 맞교환할 때마다 아래 심리 기준 충족 여부가 실시간으로
                갱신됩니다.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {evaluation.auditItems.map((item) => (
              <div
                key={item.id}
                className="px-5 py-3.5 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        item.severity === '충족'
                          ? 'text-emerald-700'
                          : item.severity === '주의'
                          ? 'text-amber-700'
                          : 'text-red-600'
                      }`}
                    >
                      {item.severity}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{item.principle}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.detail}</p>
                </div>

                {item.studentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBoardFilter('all');
                      setHighlightedIds(new Set(item.studentIds));
                    }}
                    className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer no-print"
                  >
                    해당 학생 강조 ({item.studentIds.length}명)
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
