import React, { useMemo, useState } from 'react';
import { ArrowRight, Grid3X3, Layers, Search, X } from 'lucide-react';
import { ClosenessScore, PeerRating, Student, Survey, SurveyResponse } from '../types';
import {
  computeClassAnalytics,
  detectFriendClusters,
  formatScoreLabel,
} from '../utils/sociometry';

interface ClosenessHeatmapProps {
  survey: Survey;
  students: Student[];
  responses: SurveyResponse[];
  onInspectStudent: (studentId: string) => void;
}

type HeatmapMode = 'directed' | 'strength' | 'gap';
type OrderMode = 'cluster' | 'number' | 'belonging' | 'influence' | 'gender';
type CellFilter = 'all' | 'strong' | 'positive' | 'negative';

function getDirectedCellStyle(score: ClosenessScore | null, dimmed: boolean): string {
  if (dimmed) return 'bg-slate-50 text-slate-300';
  if (score === 2) return 'bg-emerald-600 text-white font-bold';
  if (score === 1) return 'bg-sky-100 text-sky-900 font-semibold';
  if (score === 0) return 'bg-slate-50/70 text-slate-300';
  if (score === -1) return 'bg-amber-200 text-amber-950 font-semibold';
  if (score === -2) return 'bg-red-600 text-white font-bold';
  return 'bg-white text-slate-200';
}

function getStrengthCellStyle(sum: number | null, dimmed: boolean): string {
  if (dimmed || sum === null) return 'bg-slate-50 text-slate-300';
  if (sum >= 4) return 'bg-emerald-700 text-white font-bold';
  if (sum === 3) return 'bg-emerald-500 text-white font-bold';
  if (sum === 2) return 'bg-teal-200 text-teal-950 font-semibold';
  if (sum === 1) return 'bg-sky-100 text-sky-900 font-medium';
  if (sum === 0) return 'bg-slate-50/80 text-slate-300';
  if (sum === -1) return 'bg-amber-100 text-amber-900 font-medium';
  if (sum === -2) return 'bg-amber-300 text-amber-950 font-semibold';
  if (sum === -3) return 'bg-red-500 text-white font-bold';
  return 'bg-red-700 text-white font-bold';
}

function getGapCellStyle(gap: number | null, dimmed: boolean): string {
  if (dimmed || gap === null) return 'bg-slate-50 text-slate-300';
  if (gap >= 4) return 'bg-violet-700 text-white font-bold';
  if (gap === 3) return 'bg-violet-500 text-white font-bold';
  if (gap === 2) return 'bg-amber-300 text-amber-950 font-semibold';
  if (gap === 1) return 'bg-slate-100 text-slate-500';
  return 'bg-slate-50/60 text-slate-300';
}

export const ClosenessHeatmap: React.FC<ClosenessHeatmapProps> = ({
  survey,
  students,
  responses,
  onInspectStudent,
}) => {
  const [mode, setMode] = useState<HeatmapMode>('directed');
  const [orderMode, setOrderMode] = useState<OrderMode>('cluster');
  const [cellFilter, setCellFilter] = useState<CellFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const [lockedPair, setLockedPair] = useState<{ rowId: string; colId: string } | null>(null);

  const analytics = useMemo(
    () => computeClassAnalytics(students, responses, 'all'),
    [students, responses]
  );

  const clusters = useMemo(() => detectFriendClusters(analytics), [analytics]);

  const clusterInfoByStudent = useMemo(() => {
    const map: Record<string, { index: number; label: string; color: string }> = {};
    clusters.forEach((c, idx) => {
      c.memberIds.forEach((id) => {
        map[id] = { index: idx, label: c.label, color: c.color };
      });
    });
    return map;
  }, [clusters]);

  const ratingLookup = useMemo(() => {
    const map = new Map<string, PeerRating>();
    responses.forEach((resp) => {
      (resp.peerRatings || []).forEach((pr) => {
        map.set(`${resp.studentDocId}__${pr.targetId}`, pr);
      });
    });
    return map;
  }, [responses]);

  const orderedStudents = useMemo(() => {
    const list = [...students];
    list.sort((a, b) => {
      const ma = analytics.metricsById[a.id];
      const mb = analytics.metricsById[b.id];
      switch (orderMode) {
        case 'cluster': {
          const ca = clusterInfoByStudent[a.id]?.index ?? 999;
          const cb = clusterInfoByStudent[b.id]?.index ?? 999;
          if (ca !== cb) return ca - cb;
          return (mb?.belongingScore ?? 0) - (ma?.belongingScore ?? 0) || a.number - b.number;
        }
        case 'belonging':
          return (mb?.belongingScore ?? 0) - (ma?.belongingScore ?? 0) || a.number - b.number;
        case 'influence':
          return (mb?.influenceScore ?? 0) - (ma?.influenceScore ?? 0) || a.number - b.number;
        case 'gender':
          if (a.gender !== b.gender) return a.gender === '남' ? -1 : 1;
          return a.number - b.number;
        case 'number':
        default:
          return a.number - b.number;
      }
    });
    return list;
  }, [students, orderMode, analytics.metricsById, clusterInfoByStudent]);

  const matchedStudentIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    orderedStudents.forEach((s) => {
      if (s.name.toLowerCase().includes(q) || String(s.number) === q) {
        set.add(s.id);
      }
    });
    return set;
  }, [searchQuery, orderedStudents]);

  const getScore = (fromId: string, toId: string): ClosenessScore | null => {
    const pr = ratingLookup.get(`${fromId}__${toId}`);
    if (pr) return pr.score;
    const m = analytics.metricsById[fromId];
    if (!m?.responded) return null;
    if (m.chosePositive.includes(toId)) return 1;
    if (m.choseNegative.includes(toId)) return -1;
    return 0;
  };

  const activePair = useMemo(() => {
    if (lockedPair) {
      const rowStu = orderedStudents.find((s) => s.id === lockedPair.rowId);
      const colStu = orderedStudents.find((s) => s.id === lockedPair.colId);
      if (rowStu && colStu) return { rowStu, colStu, locked: true };
    }
    if (hoverCell) {
      const rowStu = orderedStudents[hoverCell.r];
      const colStu = orderedStudents[hoverCell.c];
      if (rowStu && colStu && rowStu.id !== colStu.id) {
        return { rowStu, colStu, locked: false };
      }
    }
    return null;
  }, [lockedPair, hoverCell, orderedStudents]);

  if (students.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <p className="text-base font-semibold text-slate-900">히트맵을 생성할 학생 명단이 없습니다</p>
        <p className="text-sm text-slate-500">
          학생 명단을 등록하고 응답이 모이면 친밀도 점수 기반 히트맵이 자동으로 시각화됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Grid3X3 className="w-4 h-4 text-blue-700 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                친밀도 점수 히트맵 · 연결 강도 행렬
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {survey.className} 학생 간 친밀도({responses.length}/{students.length}명 응답)를 색상
                강도로 시각화합니다. 또래 그룹순 정렬 시 친밀한 군집이 대각선 블록으로 나타납니다.
              </p>
            </div>
          </div>

          {/* Search Student Highlight */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="학생 이름·번호 강조..."
              className="pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-800 w-44 focus:outline-none focus:border-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="검색 지우기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'directed', label: '개별 방향 점수 (+2 ~ -2)' },
                  { id: 'strength', label: '쌍방 연결 강도 (+4 ~ -4)' },
                  { id: 'gap', label: '인식 온도차 (|A-B|)' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    mode === item.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Matrix Ordering */}
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={orderMode}
                onChange={(e) => setOrderMode(e.target.value as OrderMode)}
                aria-label="히트맵 학생 정렬 기준"
                className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-600"
              >
                <option value="cluster">또래 그룹·클러스터순 (군집 보기)</option>
                <option value="number">출석 번호순</option>
                <option value="belonging">소속감 지수 높은 순</option>
                <option value="influence">영향력 지수 높은 순</option>
                <option value="gender">성별 구분순 (남 · 여)</option>
              </select>
            </div>

            {/* Cell Threshold Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: '전체' },
                  { id: 'strong', label: '강한 연결만' },
                  { id: 'positive', label: '긍정만' },
                  { id: 'negative', label: '갈등·어색만' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCellFilter(f.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    cellFilter === f.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color Scale Legend */}
          <div className="flex items-center gap-2 text-[11px] text-slate-600 tabular-nums">
            {mode === 'directed' && (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-600 inline-block" /> +2 매우친함
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-sky-100 border border-sky-200 inline-block" /> +1 친함
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-amber-200 inline-block" /> -1 어색
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-red-600 inline-block" /> -2 불편
                </span>
              </>
            )}
            {mode === 'strength' && (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-700 inline-block" /> +4 단짝
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-500 inline-block" /> +3 강함
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-teal-200 inline-block" /> +2 우호
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-amber-300 inline-block" /> -2 주의
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-red-700 inline-block" /> -4 갈등
                </span>
              </>
            )}
            {mode === 'gap' && (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-violet-700 inline-block" /> 4단계 차
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-violet-500 inline-block" /> 3단계 차
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-amber-300 inline-block" /> 2단계 차
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Live Pair Inspector Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 min-h-[54px] flex flex-wrap items-center justify-between gap-3">
        {activePair ? (
          (() => {
            const { rowStu, colStu, locked } = activePair;
            const ab = ratingLookup.get(`${rowStu.id}__${colStu.id}`);
            const ba = ratingLookup.get(`${colStu.id}__${rowStu.id}`);
            const scoreAB = getScore(rowStu.id, colStu.id);
            const scoreBA = getScore(colStu.id, rowStu.id);
            const sum = scoreAB !== null && scoreBA !== null ? scoreAB + scoreBA : null;
            const gap = scoreAB !== null && scoreBA !== null ? Math.abs(scoreAB - scoreBA) : null;
            const tags = Array.from(new Set([...(ab?.tags || []), ...(ba?.tags || [])]));

            return (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                  <span className="font-bold text-slate-900 text-sm">
                    {rowStu.number}번 {rowStu.name}
                    <ArrowRight className="w-3.5 h-3.5 inline mx-1.5 text-slate-400" />
                    {colStu.number}번 {colStu.name}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-700">
                    응답: <strong>{formatScoreLabel(scoreAB)}</strong>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-700">
                    맞평가: <strong>{scoreBA !== null ? formatScoreLabel(scoreBA) : '미응답'}</strong>
                  </span>
                  {sum !== null && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-700">
                        합산 강도{' '}
                        <strong
                          className={
                            sum >= 3
                              ? 'text-emerald-700'
                              : sum <= -2
                              ? 'text-red-700'
                              : 'text-slate-900'
                          }
                        >
                          {sum > 0 ? `+${sum}` : sum}
                        </strong>
                      </span>
                    </>
                  )}
                  {gap !== null && gap >= 2 && (
                    <span className="text-amber-700 font-semibold">· 온도차 {gap}단계</span>
                  )}
                  {tags.length > 0 && (
                    <span className="text-slate-500">
                      · {tags.slice(0, 4).map((t) => `#${t}`).join(' ')}
                    </span>
                  )}
                  {(ab?.note || ba?.note) && (
                    <span className="text-blue-700 truncate max-w-xs">
                      · 메모: {ab?.note || ba?.note}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onInspectStudent(rowStu.id)}
                    className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    {rowStu.name} 응답 보기
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => onInspectStudent(colStu.id)}
                    className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    {colStu.name} 응답 보기
                  </button>
                  {locked && (
                    <button
                      type="button"
                      onClick={() => setLockedPair(null)}
                      className="ml-1 p-1 text-slate-400 hover:text-slate-800 cursor-pointer"
                      title="고정 해제"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </>
            );
          })()
        ) : (
          <p className="text-xs text-slate-500">
            히트맵 셀에 마우스를 올리면 두 학생 간의 쌍방 친밀도·연결 강도·태그를 실시간으로 확인하며,
            셀을 클릭하면 상단 비교 패널이 고정됩니다.
          </p>
        )}
      </div>

      {/* Color-Graded Heatmap Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="sticky left-0 z-20 bg-slate-50 py-2.5 px-3 text-left font-semibold text-slate-600 border-r border-slate-200 whitespace-nowrap min-w-[138px]">
                  응답 학생 \ 대상
                </th>
                {orderedStudents.map((col, cIdx) => {
                  const isHighlighted =
                    hoverCell?.c === cIdx ||
                    lockedPair?.colId === col.id ||
                    Boolean(matchedStudentIds?.has(col.id));
                  const cluster = clusterInfoByStudent[col.id];
                  return (
                    <th
                      key={col.id}
                      className={`py-2 px-1 text-center font-medium min-w-[38px] max-w-[46px] tabular-nums border-r border-slate-100 transition-colors ${
                        isHighlighted ? 'bg-blue-50 text-blue-900' : 'text-slate-600'
                      }`}
                      title={`${col.number}번 ${col.name} (${col.gender})${cluster ? ` · ${cluster.label}` : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => onInspectStudent(col.id)}
                        className="w-full flex flex-col items-center cursor-pointer hover:text-blue-700"
                      >
                        <span className="text-[10px] font-mono text-slate-400">{col.number}</span>
                        <span className="truncate max-w-[36px] text-[11px] font-semibold">
                          {col.name.slice(-2)}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th className="py-2 px-3 text-right font-semibold text-slate-600 border-l border-slate-200 whitespace-nowrap">
                  받은 평균
                </th>
                <th className="py-2 px-3 text-right font-semibold text-slate-600 whitespace-nowrap">
                  소속감
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderedStudents.map((row, rIdx) => {
                const rowMetric = analytics.metricsById[row.id];
                const cluster = clusterInfoByStudent[row.id];
                const isRowActive =
                  hoverCell?.r === rIdx ||
                  lockedPair?.rowId === row.id ||
                  Boolean(matchedStudentIds?.has(row.id));

                // Subtle group boundary divider when sorted by cluster or gender
                const prevRow = rIdx > 0 ? orderedStudents[rIdx - 1] : null;
                const isGroupBoundary =
                  prevRow &&
                  ((orderMode === 'cluster' &&
                    clusterInfoByStudent[prevRow.id]?.index !== cluster?.index) ||
                    (orderMode === 'gender' && prevRow.gender !== row.gender));

                return (
                  <tr
                    key={row.id}
                    className={isGroupBoundary ? 'border-t-2 border-slate-300' : ''}
                  >
                    <td
                      className={`sticky left-0 z-10 py-1.5 px-3 border-r border-slate-200 whitespace-nowrap transition-colors ${
                        isRowActive ? 'bg-blue-50 text-blue-950' : 'bg-white text-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onInspectStudent(row.id)}
                        className="flex items-center justify-between gap-2 w-full text-left cursor-pointer hover:text-blue-700"
                      >
                        <span className="truncate">
                          <span className="font-mono text-[11px] text-slate-400 mr-1.5 tabular-nums">
                            {String(row.number).padStart(2, '0')}
                          </span>
                          <span className="font-medium">{row.name}</span>
                        </span>
                        {orderMode === 'cluster' && cluster && (
                          <span
                            className="text-[10px] font-semibold shrink-0"
                            style={{ color: cluster.color }}
                          >
                            {cluster.label.replace('또래 그룹 ', '')}
                          </span>
                        )}
                      </button>
                    </td>

                    {orderedStudents.map((col, cIdx) => {
                      const isSelf = row.id === col.id;
                      const scoreAB = isSelf ? null : getScore(row.id, col.id);
                      const scoreBA = isSelf ? null : getScore(col.id, row.id);
                      const sum =
                        scoreAB !== null && scoreBA !== null
                          ? scoreAB + scoreBA
                          : scoreAB !== null
                          ? scoreAB
                          : null;
                      const gap =
                        scoreAB !== null && scoreBA !== null ? Math.abs(scoreAB - scoreBA) : null;

                      // Apply cell threshold filter
                      let passesFilter = true;
                      if (!isSelf) {
                        if (mode === 'directed') {
                          if (cellFilter === 'strong')
                            passesFilter = scoreAB === 2 || scoreAB === -2;
                          else if (cellFilter === 'positive') passesFilter = (scoreAB ?? 0) >= 1;
                          else if (cellFilter === 'negative') passesFilter = (scoreAB ?? 0) <= -1;
                        } else if (mode === 'strength') {
                          if (cellFilter === 'strong')
                            passesFilter = sum !== null && Math.abs(sum) >= 3;
                          else if (cellFilter === 'positive') passesFilter = (sum ?? 0) >= 1;
                          else if (cellFilter === 'negative') passesFilter = (sum ?? 0) <= -1;
                        } else {
                          if (cellFilter === 'strong') passesFilter = (gap ?? 0) >= 3;
                          else if (cellFilter === 'positive') passesFilter = (gap ?? 0) >= 2;
                          else if (cellFilter === 'negative') passesFilter = (gap ?? 0) >= 2;
                        }
                      }

                      const searchDimmed =
                        matchedStudentIds !== null &&
                        !matchedStudentIds.has(row.id) &&
                        !matchedStudentIds.has(col.id);
                      const dimmed = !passesFilter || searchDimmed;

                      const isLocked =
                        lockedPair?.rowId === row.id && lockedPair?.colId === col.id;
                      const isCrosshair =
                        hoverCell?.r === rIdx || hoverCell?.c === cIdx;

                      let cellClass = 'bg-slate-100 text-slate-300';
                      let cellLabel = '·';

                      if (!isSelf) {
                        if (mode === 'directed') {
                          cellClass = getDirectedCellStyle(scoreAB, dimmed);
                          cellLabel =
                            scoreAB === null
                              ? ''
                              : scoreAB === 0
                              ? ''
                              : scoreAB > 0
                              ? `+${scoreAB}`
                              : `${scoreAB}`;
                        } else if (mode === 'strength') {
                          cellClass = getStrengthCellStyle(sum, dimmed);
                          cellLabel =
                            sum === null || sum === 0 ? '' : sum > 0 ? `+${sum}` : `${sum}`;
                        } else {
                          cellClass = getGapCellStyle(gap, dimmed);
                          cellLabel = gap !== null && gap >= 2 ? `${gap}` : '';
                        }
                      }

                      return (
                        <td
                          key={col.id}
                          onMouseEnter={() => setHoverCell({ r: rIdx, c: cIdx })}
                          onMouseLeave={() => setHoverCell(null)}
                          onClick={() => {
                            if (isSelf) return;
                            setLockedPair((prev) =>
                              prev?.rowId === row.id && prev?.colId === col.id
                                ? null
                                : { rowId: row.id, colId: col.id }
                            );
                          }}
                          className={`p-0.5 text-center border-r border-slate-100/80 ${
                            isSelf ? 'bg-slate-100' : 'cursor-pointer'
                          } ${isCrosshair && !isSelf ? 'ring-1 ring-inset ring-blue-300/60' : ''}`}
                        >
                          <div
                            className={`h-7 min-w-[32px] rounded-[4px] flex items-center justify-center font-mono text-[11px] tabular-nums transition-opacity ${cellClass} ${
                              isLocked ? 'ring-2 ring-slate-900' : ''
                            }`}
                          >
                            {cellLabel}
                          </div>
                        </td>
                      );
                    })}

                    <td className="py-1.5 px-3 text-right font-mono text-xs font-semibold border-l border-slate-200 tabular-nums whitespace-nowrap">
                      {rowMetric?.avgClosenessReceived !== null &&
                      rowMetric?.avgClosenessReceived !== undefined ? (
                        <span
                          className={
                            rowMetric.avgClosenessReceived >= 0.4
                              ? 'text-emerald-700'
                              : rowMetric.avgClosenessReceived < 0
                              ? 'text-red-600'
                              : 'text-slate-700'
                          }
                        >
                          {rowMetric.avgClosenessReceived > 0 ? '+' : ''}
                          {rowMetric.avgClosenessReceived.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                      <span
                        className={
                          (rowMetric?.belongingScore ?? 0) >= 65
                            ? 'text-emerald-700'
                            : (rowMetric?.belongingScore ?? 0) < 35
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }
                      >
                        {rowMetric?.belongingScore ?? 0}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
