import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Download, MessageSquare, Save, Scale, UserSearch } from 'lucide-react';
import {
  ClosenessScore,
  PeerRating,
  SociometricType,
  Student,
  Survey,
  SurveyResponse,
} from '../types';
import {
  computeClassAnalytics,
  exportAnalyticsToCsv,
  formatScoreLabel,
  triggerCsvDownload,
} from '../utils/sociometry';
import { ClosenessAnalysisPanel } from './ClosenessAnalysisPanel';
import { ClosenessHeatmap } from './ClosenessHeatmap';

interface AnalyticsViewProps {
  survey: Survey;
  students: Student[];
  responses: SurveyResponse[];
  initialSelectedStudentId?: string | null;
  onSaveMemo: (studentId: string, memo: string) => Promise<void>;
}

type SortKey =
  | 'number'
  | 'belonging'
  | 'influence'
  | 'avgCloseness'
  | 'positiveIn'
  | 'mutual'
  | 'negativeIn';
type AnalyticsSubTab = 'closeness' | 'responses' | 'asymmetric' | 'metrics' | 'matrix' | 'notes';

const TYPE_TEXT_COLOR: Record<SociometricType, string> = {
  인기형: 'text-emerald-700',
  평균형: 'text-blue-700',
  '고립·관심형': 'text-amber-700',
  '갈등·주의형': 'text-red-700',
  양면형: 'text-violet-700',
  미분류: 'text-slate-500',
};

function scoreColorClass(score: ClosenessScore | undefined | null): string {
  if (score === 2) return 'text-emerald-700 font-semibold';
  if (score === 1) return 'text-blue-700 font-semibold';
  if (score === 0) return 'text-slate-500';
  if (score === -1) return 'text-amber-700 font-semibold';
  if (score === -2) return 'text-red-700 font-semibold';
  return 'text-slate-400';
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  survey,
  students,
  responses,
  initialSelectedStudentId = null,
  onSaveMemo,
}) => {
  const [subTab, setSubTab] = useState<AnalyticsSubTab>(
    initialSelectedStudentId ? 'responses' : 'closeness'
  );
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Individual student response viewer state
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    initialSelectedStudentId
  );
  const [scoreFilter, setScoreFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
  const [memoDraft, setMemoDraft] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [memoSaved, setMemoSaved] = useState(false);

  const analytics = useMemo(
    () => computeClassAnalytics(students, responses, 'all'),
    [students, responses]
  );

  const orderedStudents = useMemo(
    () => [...students].sort((a, b) => a.number - b.number),
    [students]
  );

  const responseByStudentId = useMemo(() => {
    const map: Record<string, SurveyResponse> = {};
    responses.forEach((r) => {
      map[r.studentDocId] = r;
    });
    return map;
  }, [responses]);

  // Sync external navigation to a specific student's response
  useEffect(() => {
    if (initialSelectedStudentId) {
      setSelectedStudentId(initialSelectedStudentId);
      setSubTab('responses');
    }
  }, [initialSelectedStudentId]);

  // Default select first responded student
  useEffect(() => {
    if (!selectedStudentId && orderedStudents.length > 0) {
      const firstResponded = orderedStudents.find((s) => responseByStudentId[s.id]);
      setSelectedStudentId(firstResponded?.id || orderedStudents[0].id);
    }
  }, [selectedStudentId, orderedStudents, responseByStudentId]);

  const selectedStudent = orderedStudents.find((s) => s.id === selectedStudentId) || null;
  const selectedResponse = selectedStudent ? responseByStudentId[selectedStudent.id] : null;
  const selectedMetric = selectedStudent ? analytics.metricsById[selectedStudent.id] : null;

  useEffect(() => {
    if (selectedStudent) {
      setMemoDraft(selectedStudent.memo || '');
      setMemoSaved(false);
    }
  }, [selectedStudent?.id, selectedStudent?.memo]);

  // Helper to look up pairwise rating from A -> B
  const getRatingBetween = (fromId: string, toId: string): PeerRating | null => {
    const resp = responseByStudentId[fromId];
    if (!resp?.peerRatings?.length) return null;
    return resp.peerRatings.find((r) => r.targetId === toId) || null;
  };

  // Build rows for selected student's 1:1 responses
  const selectedStudentRatingRows = useMemo(() => {
    if (!selectedStudent || !selectedResponse) return [];
    const peerRatings = selectedResponse.peerRatings || [];

    // If new peerRatings exist, show all rated classmates with reciprocal score
    if (peerRatings.length > 0) {
      const ratingByTarget: Record<string, PeerRating> = {};
      peerRatings.forEach((r) => {
        ratingByTarget[r.targetId] = r;
      });

      return orderedStudents
        .filter((m) => m.id !== selectedStudent.id)
        .map((target) => {
          const given = ratingByTarget[target.id] || null;
          const reverse = getRatingBetween(target.id, selectedStudent.id);
          const gap =
            given && reverse ? Math.abs(given.score - reverse.score) : null;
          return { target, given, reverse, gap };
        })
        .filter((row) => {
          const sc = row.given?.score ?? 0;
          if (scoreFilter === 'positive') return sc >= 1;
          if (scoreFilter === 'negative') return sc <= -1;
          if (scoreFilter === 'neutral') return sc === 0;
          return true;
        })
        .sort((a, b) => (b.given?.score ?? -99) - (a.given?.score ?? -99) || a.target.number - b.target.number);
    }

    return [];
  }, [selectedStudent, selectedResponse, orderedStudents, scoreFilter, responseByStudentId]);

  const sortedMetrics = useMemo(() => {
    const arr = [...analytics.metricsList];
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'number':
          diff = a.student.number - b.student.number;
          break;
        case 'belonging':
          diff = a.belongingScore - b.belongingScore;
          break;
        case 'influence':
          diff = a.influenceScore - b.influenceScore;
          break;
        case 'avgCloseness':
          diff = (a.avgClosenessReceived ?? -9) - (b.avgClosenessReceived ?? -9);
          break;
        case 'positiveIn':
          diff = a.positiveIn - b.positiveIn;
          break;
        case 'mutual':
          diff = a.mutualIds.length - b.mutualIds.length;
          break;
        case 'negativeIn':
          diff = a.negativeIn - b.negativeIn;
          break;
      }
      return sortAsc ? diff : -diff;
    });
    return arr;
  }, [analytics.metricsList, sortKey, sortAsc]);

  // Combine general teacherNote AND per-friend private notes
  const allPrivateNotes = useMemo(() => {
    const list: Array<{
      id: string;
      student: Student;
      sociometricType: SociometricType;
      targetName?: string;
      score?: ClosenessScore;
      text: string;
    }> = [];

    orderedStudents.forEach((stu) => {
      const resp = responseByStudentId[stu.id];
      const metric = analytics.metricsById[stu.id];
      if (!resp || !metric) return;

      if (resp.teacherNote?.trim()) {
        list.push({
          id: `${stu.id}_general`,
          student: stu,
          sociometricType: metric.sociometricType,
          text: resp.teacherNote.trim(),
        });
      }

      (resp.peerRatings || []).forEach((pr) => {
        if (pr.note?.trim()) {
          const target = analytics.metricsById[pr.targetId]?.student;
          list.push({
            id: `${stu.id}_${pr.targetId}`,
            student: stu,
            sociometricType: metric.sociometricType,
            targetName: target ? `${target.number}번 ${target.name}` : pr.targetId,
            score: pr.score,
            text: pr.note.trim(),
          });
        }
      });
    });

    return list;
  }, [orderedStudents, responseByStudentId, analytics.metricsById]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'number');
    }
  };

  const handleDownloadCsv = () => {
    const csv = exportAnalyticsToCsv(analytics);
    triggerCsvDownload(csv, `${survey.className}_교우관계분석.csv`);
  };

  const handleSaveMemoClick = async () => {
    if (!selectedStudent) return;
    setSavingMemo(true);
    try {
      await onSaveMemo(selectedStudent.id, memoDraft);
      setMemoSaved(true);
    } finally {
      setSavingMemo(false);
    }
  };

  const nameOf = (id: string) => {
    const m = analytics.metricsById[id];
    return m ? `${m.student.number}번 ${m.student.name}` : id;
  };

  if (students.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <p className="text-base font-semibold text-slate-900">분석할 학생 데이터가 없습니다</p>
        <p className="text-sm text-slate-500">
          학생 명단을 등록하고 설문 응답이 수집되면 교사 전용 개별 응답표와 관계 분석이 자동으로
          생성됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">응답 완료율</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {analytics.responseRate}%
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {analytics.respondedCount} / {analytics.totalStudents}명 응답
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">학급 평균 친밀도</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              (analytics.closenessSummary.classAvgCloseness ?? 0) >= 0.2
                ? 'text-emerald-700'
                : (analytics.closenessSummary.classAvgCloseness ?? 0) < 0
                ? 'text-red-600'
                : 'text-slate-900'
            }`}
          >
            {analytics.closenessSummary.classAvgCloseness !== null
              ? `${analytics.closenessSummary.classAvgCloseness > 0 ? '+' : ''}${analytics.closenessSummary.classAvgCloseness.toFixed(2)}`
              : '—'}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            핵심 단짝(+2↔+2) {analytics.closenessSummary.bestMutualPairs.length}쌍 · 응집도{' '}
            {analytics.reciprocityRate}%
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">관계 온도차 감지</p>
          <p className="text-2xl font-bold text-blue-700 tabular-nums">
            {analytics.asymmetricPairs.length}쌍
          </p>
          <p className="text-xs text-slate-500">친밀도 인식 차이 2단계 이상</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">관심 관찰 대상</p>
          <p className="text-2xl font-bold text-amber-700 tabular-nums">
            {analytics.attentionStudents.length}명
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            고립 {analytics.typeCounts['고립·관심형']} · 갈등 {analytics.typeCounts['갈등·주의형']} ·
            양면 {analytics.typeCounts['양면형']}
          </p>
        </div>
      </div>

      {/* Sub-navigation + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(
            [
              { id: 'closeness', label: '친밀도 분석' },
              { id: 'responses', label: `학생별 응답 보기 (${responses.length})` },
              { id: 'asymmetric', label: `관계 온도차 (${analytics.asymmetricPairs.length})` },
              { id: 'metrics', label: '학생별 지표표' },
              { id: 'matrix', label: '친밀도 히트맵' },
              { id: 'notes', label: `비공개 메모 (${allPrivateNotes.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleDownloadCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          분석 결과 CSV 다운로드
        </button>
      </div>

      {/* SubTab 0: Comprehensive 5-Level Closeness Analytics */}
      {subTab === 'closeness' && (
        <ClosenessAnalysisPanel
          analytics={analytics}
          onInspectStudent={(studentId) => {
            setSelectedStudentId(studentId);
            setSubTab('responses');
          }}
        />
      )}

      {/* SubTab 1: Teacher Individual Student Response Viewer */}
      {subTab === 'responses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Student Picker */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <UserSearch className="w-3.5 h-3.5 text-slate-500" />
              학생 선택 (교사 전용 열람)
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {orderedStudents.map((stu) => {
                const hasResp = Boolean(responseByStudentId[stu.id]);
                const isSelected = stu.id === selectedStudentId;
                return (
                  <button
                    key={stu.id}
                    type="button"
                    onClick={() => setSelectedStudentId(stu.id)}
                    className={`w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white'
                        : 'bg-white hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`font-mono text-xs w-5 tabular-nums ${
                          isSelected ? 'text-slate-400' : 'text-slate-400'
                        }`}
                      >
                        {stu.number}
                      </span>
                      <span className="text-sm font-medium truncate">{stu.name}</span>
                    </div>
                    <span
                      className={`text-[11px] whitespace-nowrap ${
                        isSelected
                          ? hasResp
                            ? 'text-emerald-300'
                            : 'text-slate-400'
                          : hasResp
                          ? 'text-emerald-700 font-medium'
                          : 'text-slate-400'
                      }`}
                    >
                      {hasResp ? '응답완료' : '미응답'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Detailed Individual Response Sheet */}
          <div className="lg:col-span-9 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            {selectedStudent ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {selectedStudent.studentCode} · {selectedStudent.number}번 ·{' '}
                      {selectedStudent.gender} ·{' '}
                      <span
                        className={`font-semibold ${
                          TYPE_TEXT_COLOR[selectedMetric?.sociometricType || '미분류']
                        }`}
                      >
                        {selectedMetric?.sociometricType || '미분류'}
                      </span>
                    </p>
                    <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                      {selectedStudent.name} 학생의 개별 설문 응답
                    </h2>
                  </div>

                  {selectedMetric && (
                    <div className="flex items-center gap-5 text-xs tabular-nums">
                      <div>
                        <span className="text-slate-500 block">받은 평균 친밀도</span>
                        <span className="text-base font-bold text-slate-900">
                          {selectedMetric.avgClosenessReceived !== null
                            ? `${selectedMetric.avgClosenessReceived > 0 ? '+' : ''}${selectedMetric.avgClosenessReceived.toFixed(2)}`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">상호 친구</span>
                        <span className="text-base font-bold text-emerald-700">
                          {selectedMetric.mutualIds.length}명
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">불편·어색 받음</span>
                        <span className="text-base font-bold text-red-600">
                          {selectedMetric.negativeIn}명
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {!selectedResponse ? (
                  <div className="py-10 text-center text-sm text-slate-500">
                    {selectedStudent.name} 학생은 아직 설문 응답을 제출하지 않았습니다.
                  </div>
                ) : (
                  <>
                    {/* Teacher-configured Survey Questions Answers */}
                    {selectedResponse.answers.length > 0 && (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">
                            조사 문항별 응답 ({selectedResponse.answers.length}문항)
                          </p>
                          <span className="text-[11px] text-slate-500">
                            선생님이 설정한 문항별 학생 선택 결과
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {selectedResponse.answers.map((ans, idx) => {
                            const qObj = survey.questions.find((q) => q.id === ans.questionId);
                            const isNeg = (qObj?.category || ans.category) === 'negative';
                            return (
                              <div
                                key={ans.questionId}
                                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-600">
                                    <span className="font-mono text-slate-400 mr-1.5">
                                      Q{idx + 1}
                                    </span>
                                    <span
                                      className={`font-semibold mr-1.5 ${
                                        isNeg ? 'text-red-600' : 'text-blue-700'
                                      }`}
                                    >
                                      [{isNeg ? '갈등·불편' : '긍정'}]
                                    </span>
                                    {qObj?.text || ans.questionId}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs shrink-0">
                                  {ans.selectedIds.length > 0 ? (
                                    ans.selectedIds.map((targetId) => (
                                      <button
                                        key={targetId}
                                        type="button"
                                        onClick={() => setSelectedStudentId(targetId)}
                                        className={`font-semibold hover:underline cursor-pointer ${
                                          isNeg ? 'text-red-700' : 'text-slate-900'
                                        }`}
                                      >
                                        {nameOf(targetId)}
                                      </button>
                                    ))
                                  ) : (
                                    <span className="text-slate-400">해당 없음 (선택 안 함)</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 1:1 Peer Ratings Section */}
                    {selectedResponse.peerRatings && selectedResponse.peerRatings.length > 0 && (
                      <div className="space-y-3">
                        {/* Filter by Score */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                            {(
                              [
                                { id: 'all', label: '전체 친구' },
                                { id: 'positive', label: '친함 (+1/+2)' },
                                { id: 'negative', label: '어색·불편 (-1/-2)' },
                                { id: 'neutral', label: '보통 (0)' },
                              ] as const
                            ).map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => setScoreFilter(f.id)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                                  scoreFilter === f.id
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                          <span className="text-xs text-slate-500 tabular-nums">
                            친구별 친밀도 표시 {selectedStudentRatingRows.length}명
                          </span>
                        </div>

                        {/* 1:1 Peer Ratings Table */}
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                                <th className="py-2.5 px-3 whitespace-nowrap">대상 친구</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">
                                  {selectedStudent.name}의 평가
                                </th>
                                <th className="py-2.5 px-3 whitespace-nowrap">상대방의 맞평가</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">관계 태그</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">개별 메모</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedStudentRatingRows.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="py-8 text-center text-xs text-slate-500"
                                  >
                                    선택한 필터에 해당하는 친구가 없습니다.
                                  </td>
                                </tr>
                              ) : (
                                selectedStudentRatingRows.map(({ target, given, reverse, gap }) => (
                                  <tr key={target.id} className="hover:bg-slate-50/70">
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedStudentId(target.id)}
                                        className="text-left hover:text-blue-700 cursor-pointer"
                                      >
                                        <span className="font-mono text-xs text-slate-400 mr-1.5 tabular-nums">
                                          {target.number}
                                        </span>
                                        <span className="font-medium text-slate-900">
                                          {target.name}
                                        </span>
                                      </button>
                                    </td>
                                    <td
                                      className={`py-2.5 px-3 text-xs whitespace-nowrap tabular-nums ${scoreColorClass(
                                        given?.score
                                      )}`}
                                    >
                                      {formatScoreLabel(given?.score)}
                                    </td>
                                    <td className="py-2.5 px-3 text-xs whitespace-nowrap tabular-nums">
                                      <span className={scoreColorClass(reverse?.score)}>
                                        {reverse ? formatScoreLabel(reverse.score) : '미응답'}
                                      </span>
                                      {gap !== null && gap >= 2 && (
                                        <span className="ml-2 text-amber-700 font-semibold">
                                          · 온도차 {gap}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-xs text-slate-700">
                                      {given?.tags?.length
                                        ? given.tags.map((t) => `#${t}`).join('  ')
                                        : '—'}
                                    </td>
                                    <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[220px]">
                                      {given?.note ? given.note : '—'}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Student General Note + Teacher Counseling Memo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-blue-700">
                      {selectedStudent.name} 학생이 선생님께 남긴 말
                    </p>
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70 text-sm text-slate-700 min-h-[88px] whitespace-pre-wrap">
                      {selectedResponse?.teacherNote?.trim()
                        ? selectedResponse.teacherNote
                        : '작성된 메시지가 없습니다.'}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="analytics-memo-input"
                        className="text-xs font-semibold text-slate-700"
                      >
                        교사 비공개 상담 메모
                      </label>
                      {memoSaved && (
                        <span className="text-xs font-medium text-emerald-700">저장됨</span>
                      )}
                    </div>
                    <textarea
                      id="analytics-memo-input"
                      rows={3}
                      maxLength={500}
                      value={memoDraft}
                      onChange={(e) => {
                        setMemoDraft(e.target.value);
                        setMemoSaved(false);
                      }}
                      placeholder="이 학생의 교우관계 관찰 내용이나 상담 기록을 남겨두세요..."
                      className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 resize-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveMemoClick}
                      disabled={savingMemo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingMemo ? '저장 중...' : '메모 저장'}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* SubTab 2: Asymmetric Temperature-Gap Analysis */}
      {subTab === 'asymmetric' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-700" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  관계 온도차 (인식 비대칭 쌍) 자동 분석
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  서로 응답한 두 학생 사이에서 친밀도 평가가 2단계 이상 차이나는 쌍을 자동으로
                  추출합니다.
                </p>
              </div>
            </div>
          </div>

          {analytics.asymmetricPairs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              친밀도 평가가 2단계 이상 차이나는 비대칭 관계 쌍이 아직 발견되지 않았습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4 whitespace-nowrap">학생 A → 학생 B</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">A의 평가</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">B의 맞평가</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">온도차</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">선택 태그 비교</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.asymmetricPairs.map((pair) => (
                    <tr
                      key={`${pair.fromId}_${pair.toId}`}
                      className="hover:bg-slate-50/70 h-12"
                    >
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {nameOf(pair.fromId)} <span className="text-slate-400 mx-1">↔</span>{' '}
                        {nameOf(pair.toId)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-xs whitespace-nowrap tabular-nums ${scoreColorClass(
                          pair.scoreFromTo
                        )}`}
                      >
                        {formatScoreLabel(pair.scoreFromTo)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-xs whitespace-nowrap tabular-nums ${scoreColorClass(
                          pair.scoreToFrom
                        )}`}
                      >
                        {formatScoreLabel(pair.scoreToFrom)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-amber-700 tabular-nums">
                        {pair.gap}단계
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        {pair.tagsFromTo.length > 0 && (
                          <span>A: {pair.tagsFromTo.map((t) => `#${t}`).join(' ')}</span>
                        )}
                        {pair.tagsFromTo.length > 0 && pair.tagsToFrom.length > 0 && (
                          <span className="mx-1.5 text-slate-300">/</span>
                        )}
                        {pair.tagsToFrom.length > 0 && (
                          <span>B: {pair.tagsToFrom.map((t) => `#${t}`).join(' ')}</span>
                        )}
                        {pair.tagsFromTo.length === 0 && pair.tagsToFrom.length === 0 && '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(pair.fromId);
                            setSubTab('responses');
                          }}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          응답 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SubTab 3: Metrics Table */}
      {subTab === 'metrics' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 text-left whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('number')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      번호 · 이름
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-left whitespace-nowrap">성별</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('belonging')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      소속감
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('influence')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      영향력
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('avgCloseness')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      평균 친밀도
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('positiveIn')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      긍정 받음 (+2)
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('mutual')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      상호 친구
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('negativeIn')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      불편·어색 받음
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-left whitespace-nowrap">관계 유형</th>
                  <th className="py-2.5 px-4 text-left whitespace-nowrap">주요 받은 태그</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">개별 응답</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedMetrics.map((m) => (
                  <tr key={m.student.id} className="hover:bg-slate-50/70 h-11">
                    <td className="py-2 px-4 whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-400 mr-2 tabular-nums">
                        {String(m.student.number).padStart(2, '0')}
                      </span>
                      <span className="font-medium text-slate-900">{m.student.name}</span>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-600">{m.student.gender}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs font-semibold tabular-nums">
                      <span
                        className={
                          m.belongingScore >= 60
                            ? 'text-emerald-700'
                            : m.belongingScore < 35
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }
                      >
                        {m.belongingScore}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-blue-700 tabular-nums">
                      {m.influenceScore}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs font-semibold tabular-nums">
                      {m.avgClosenessReceived !== null ? (
                        <span
                          className={
                            m.avgClosenessReceived >= 0.4
                              ? 'text-emerald-700'
                              : m.avgClosenessReceived < 0
                              ? 'text-red-600'
                              : 'text-slate-700'
                          }
                        >
                          {m.avgClosenessReceived > 0 ? '+' : ''}
                          {m.avgClosenessReceived.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-xs text-slate-900 tabular-nums">
                      <strong>{m.positiveIn}</strong>
                      <span className="text-slate-400 ml-1">({m.veryCloseIn})</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                      {m.mutualIds.length}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono text-sm tabular-nums ${
                        m.negativeIn >= 2
                          ? 'text-red-600 font-semibold'
                          : m.negativeIn > 0
                          ? 'text-red-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {m.negativeIn}
                    </td>
                    <td
                      className={`py-2 px-4 text-xs font-semibold whitespace-nowrap ${
                        TYPE_TEXT_COLOR[m.sociometricType]
                      }`}
                    >
                      {m.sociometricType}
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-600 max-w-[200px] truncate">
                      {m.topPositiveTags.length > 0
                        ? m.topPositiveTags.slice(0, 2).map((t) => `#${t.tag}`).join(' ')
                        : m.topNegativeTags.length > 0
                        ? m.topNegativeTags.slice(0, 2).map((t) => `#${t.tag}`).join(' ')
                        : '—'}
                    </td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudentId(m.student.id);
                          setSubTab('responses');
                        }}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                      >
                        {m.responded ? '응답 보기' : '미응답'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 4: Closeness Heatmap Matrix */}
      {subTab === 'matrix' && (
        <ClosenessHeatmap
          survey={survey}
          students={students}
          responses={responses}
          onInspectStudent={(studentId) => {
            setSelectedStudentId(studentId);
            setSubTab('responses');
          }}
        />
      )}

      {/* SubTab 5: All Private Messages & Per-Friend Notes */}
      {subTab === 'notes' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {allPrivateNotes.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              학생들이 선생님께 남긴 비공개 메시지나 친구별 메모가 아직 없습니다.
            </div>
          ) : (
            allPrivateNotes.map((item) => (
              <div key={item.id} className="p-5 flex items-start gap-4">
                <MessageSquare className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900 text-sm">
                      {item.student.number}번 {item.student.name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-medium ${TYPE_TEXT_COLOR[item.sociometricType]}`}>
                      {item.sociometricType}
                    </span>
                    {item.targetName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700 font-medium">
                          대상: {item.targetName} ({formatScoreLabel(item.score)})
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {item.text}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
