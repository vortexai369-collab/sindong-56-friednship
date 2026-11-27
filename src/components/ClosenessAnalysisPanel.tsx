import React, { useMemo, useState } from 'react';
import { ArrowRight, BarChart2, Compass, HeartHandshake, ShieldAlert, Tag } from 'lucide-react';
import { ClassAnalytics, ClosenessScore, StudentMetrics } from '../types';
import { formatScoreLabel } from '../utils/sociometry';

interface ClosenessAnalysisPanelProps {
  analytics: ClassAnalytics;
  onInspectStudent: (studentId: string) => void;
}

type ProfileSortMode =
  | 'receivedDesc'
  | 'receivedAsc'
  | 'veryCloseDesc'
  | 'negativeDesc'
  | 'gapDesc';

type PairTabMode = 'best' | 'friendly' | 'conflict';

const SCORE_LEVELS: Array<{
  score: ClosenessScore;
  label: string;
  short: string;
  barColor: string;
  textColor: string;
  activeBg: string;
  activeBorder: string;
}> = [
  {
    score: 2,
    label: '매우 친함',
    short: '+2',
    barColor: '#059669',
    textColor: 'text-emerald-700',
    activeBg: 'bg-emerald-50',
    activeBorder: 'border-emerald-300',
  },
  {
    score: 1,
    label: '친한 편',
    short: '+1',
    barColor: '#2563EB',
    textColor: 'text-blue-700',
    activeBg: 'bg-blue-50',
    activeBorder: 'border-blue-300',
  },
  {
    score: 0,
    label: '보통 / 잘 모름',
    short: '0',
    barColor: '#CBD5E1',
    textColor: 'text-slate-600',
    activeBg: 'bg-slate-100',
    activeBorder: 'border-slate-300',
  },
  {
    score: -1,
    label: '조금 어색함',
    short: '-1',
    barColor: '#D97706',
    textColor: 'text-amber-700',
    activeBg: 'bg-amber-50',
    activeBorder: 'border-amber-300',
  },
  {
    score: -2,
    label: '불편함 / 갈등',
    short: '-2',
    barColor: '#DC2626',
    textColor: 'text-red-700',
    activeBg: 'bg-red-50',
    activeBorder: 'border-red-300',
  },
];

function closenessDotColor(avgReceived: number | null): string {
  if (avgReceived === null) return '#94A3B8';
  if (avgReceived >= 0.45) return '#059669';
  if (avgReceived >= 0.1) return '#2563EB';
  if (avgReceived > -0.15) return '#64748B';
  if (avgReceived > -0.45) return '#D97706';
  return '#DC2626';
}

function formatSigned(val: number | null): string {
  if (val === null) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}`;
}

export const ClosenessAnalysisPanel: React.FC<ClosenessAnalysisPanelProps> = ({
  analytics,
  onInspectStudent,
}) => {
  const { closenessSummary, metricsList, metricsById } = analytics;
  const [selectedLevel, setSelectedLevel] = useState<ClosenessScore | null>(null);
  const [sortMode, setSortMode] = useState<ProfileSortMode>('receivedDesc');
  const [pairTab, setPairTab] = useState<PairTabMode>('best');
  const [hoveredDotId, setHoveredDotId] = useState<string | null>(null);

  const totalRatings = closenessSummary.totalRatingsCount;

  // Quadrant scatter plot points (students with both given and received closeness averages)
  const scatterData = useMemo(() => {
    const valid = metricsList.filter(
      (m) => m.avgClosenessReceived !== null && m.avgClosenessGiven !== null
    );
    const maxAbsVal = valid.reduce((acc, m) => {
      return Math.max(
        acc,
        Math.abs(m.avgClosenessGiven ?? 0),
        Math.abs(m.avgClosenessReceived ?? 0)
      );
    }, 0.8);
    // Round domain neatly up to 1.0, 1.5, or 2.0
    const domainMax = maxAbsVal <= 0.9 ? 1.0 : maxAbsVal <= 1.4 ? 1.5 : 2.0;

    // Classify students into 4 closeness quadrants relative to class average (or 0 if negative)
    const refLine = Math.max(0, closenessSummary.classAvgCloseness ?? 0);
    const quadrants = {
      stable: [] as StudentMetrics[],     // given >= ref, received >= ref
      eager: [] as StudentMetrics[],      // given >= ref, received < ref
      cautious: [] as StudentMetrics[],   // given < ref, received >= ref
      withdrawn: [] as StudentMetrics[],  // given < ref, received < ref
    };

    valid.forEach((m) => {
      const g = m.avgClosenessGiven ?? 0;
      const r = m.avgClosenessReceived ?? 0;
      if (g >= refLine && r >= refLine) quadrants.stable.push(m);
      else if (g >= refLine && r < refLine) quadrants.eager.push(m);
      else if (g < refLine && r >= refLine) quadrants.cautious.push(m);
      else quadrants.withdrawn.push(m);
    });

    quadrants.stable.sort((a, b) => (b.avgClosenessReceived ?? 0) - (a.avgClosenessReceived ?? 0));
    quadrants.eager.sort(
      (a, b) =>
        (b.avgClosenessGiven ?? 0) -
        (b.avgClosenessReceived ?? 0) -
        ((a.avgClosenessGiven ?? 0) - (a.avgClosenessReceived ?? 0))
    );
    quadrants.cautious.sort((a, b) => (b.avgClosenessReceived ?? 0) - (a.avgClosenessReceived ?? 0));
    quadrants.withdrawn.sort(
      (a, b) => (a.avgClosenessReceived ?? 0) - (b.avgClosenessReceived ?? 0)
    );

    return { valid, domainMax, refLine, quadrants };
  }, [metricsList, closenessSummary.classAvgCloseness]);

  // Sorted & filtered student closeness profile list
  const sortedProfiles = useMemo(() => {
    const filtered =
      selectedLevel !== null
        ? metricsList.filter((m) => m.receivedScoreCounts[selectedLevel] > 0)
        : [...metricsList];

    filtered.sort((a, b) => {
      if (selectedLevel !== null) {
        const diff = b.receivedScoreCounts[selectedLevel] - a.receivedScoreCounts[selectedLevel];
        if (diff !== 0) return diff;
      }
      switch (sortMode) {
        case 'receivedDesc':
          return (b.avgClosenessReceived ?? -9) - (a.avgClosenessReceived ?? -9);
        case 'receivedAsc':
          return (a.avgClosenessReceived ?? 9) - (b.avgClosenessReceived ?? 9);
        case 'veryCloseDesc':
          return (
            b.receivedScoreCounts[2] - a.receivedScoreCounts[2] ||
            (b.avgClosenessReceived ?? -9) - (a.avgClosenessReceived ?? -9)
          );
        case 'negativeDesc':
          return (
            b.receivedScoreCounts[-2] * 2 +
            b.receivedScoreCounts[-1] -
            (a.receivedScoreCounts[-2] * 2 + a.receivedScoreCounts[-1])
          );
        case 'gapDesc':
          return (
            Math.abs(b.closenessGap ?? 0) - Math.abs(a.closenessGap ?? 0) ||
            a.student.number - b.student.number
          );
      }
    });
    return filtered;
  }, [metricsList, selectedLevel, sortMode]);

  const positiveTags = useMemo(
    () => closenessSummary.tagStats.filter((t) => t.category === 'positive'),
    [closenessSummary.tagStats]
  );
  const negativeTags = useMemo(
    () => closenessSummary.tagStats.filter((t) => t.category === 'negative'),
    [closenessSummary.tagStats]
  );

  const activePairs =
    pairTab === 'best'
      ? closenessSummary.bestMutualPairs
      : pairTab === 'friendly'
      ? closenessSummary.friendlyMutualPairs
      : closenessSummary.conflictPairs;

  const nameOf = (id: string) => {
    const m = metricsById[id];
    return m ? `${m.student.number}번 ${m.student.name}` : id;
  };

  if (totalRatings === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <p className="text-base font-semibold text-slate-900">
          아직 5단계 친밀도 응답 데이터가 없습니다
        </p>
        <p className="text-sm text-slate-500">
          학생들이 1:1 친밀도 설문을 제출하면 5단계 분포, 준·받은 친밀도 4사분면 지도, 단짝·갈등 쌍
          분석이 자동으로 계산됩니다.
        </p>
      </div>
    );
  }

  // SVG Scatter geometry
  const W = 520;
  const H = 330;
  const PAD_L = 52;
  const PAD_R = 26;
  const PAD_T = 24;
  const PAD_B = 42;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const xScale = (val: number) =>
    PAD_L + ((val + scatterData.domainMax) / (2 * scatterData.domainMax)) * plotW;
  const yScale = (val: number) =>
    PAD_T + ((scatterData.domainMax - val) / (2 * scatterData.domainMax)) * plotH;

  const hoveredMetric = hoveredDotId ? metricsById[hoveredDotId] : null;
  const maxPosTagCount = Math.max(1, ...positiveTags.map((t) => t.totalCount));
  const maxNegTagCount = Math.max(1, ...negativeTags.map((t) => t.totalCount));

  return (
    <div className="space-y-6">
      {/* 1. Class-Wide 5-Level Closeness Distribution */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                학급 전체 5단계 친밀도 분포
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                단계 카드를 클릭하면 아래 학생별 친밀도 프로파일에서 해당 평가를 받은 학생만 모아볼
                수 있습니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5 text-xs tabular-nums">
            <div>
              <span className="text-slate-500 mr-1.5">학급 평균 친밀도</span>
              <strong
                className={`text-sm font-bold ${
                  (closenessSummary.classAvgCloseness ?? 0) >= 0.2
                    ? 'text-emerald-700'
                    : (closenessSummary.classAvgCloseness ?? 0) < 0
                    ? 'text-red-600'
                    : 'text-slate-900'
                }`}
              >
                {formatSigned(closenessSummary.classAvgCloseness)}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 mr-1.5">총 1:1 평가</span>
              <strong className="text-sm font-bold text-slate-900">{totalRatings}건</strong>
            </div>
          </div>
        </div>

        {/* Stacked Horizontal Bar */}
        <div
          className="h-5 w-full rounded-lg overflow-hidden flex bg-slate-100"
          role="img"
          aria-label="학급 전체 5단계 친밀도 비율 막대"
        >
          {SCORE_LEVELS.map((lvl) => {
            const count = closenessSummary.distribution[lvl.score];
            const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <button
                key={lvl.score}
                type="button"
                onClick={() =>
                  setSelectedLevel((prev) => (prev === lvl.score ? null : lvl.score))
                }
                style={{ width: `${pct}%`, backgroundColor: lvl.barColor }}
                title={`${lvl.label} (${lvl.short}): ${count}건 (${pct.toFixed(1)}%)`}
                className="h-full transition-opacity hover:opacity-85 cursor-pointer"
              />
            );
          })}
        </div>

        {/* 5-Level Clickable Filter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {SCORE_LEVELS.map((lvl) => {
            const count = closenessSummary.distribution[lvl.score];
            const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
            const isSelected = selectedLevel === lvl.score;
            return (
              <button
                key={lvl.score}
                type="button"
                onClick={() =>
                  setSelectedLevel((prev) => (prev === lvl.score ? null : lvl.score))
                }
                className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? `${lvl.activeBg} ${lvl.activeBorder}`
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: lvl.barColor }}
                    />
                    {lvl.label}
                  </span>
                  <span className={`font-mono text-xs font-bold tabular-nums ${lvl.textColor}`}>
                    {lvl.short}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between tabular-nums">
                  <span className="text-lg font-bold text-slate-900">{count}건</span>
                  <span className="text-xs text-slate-500">{pct.toFixed(1)}%</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Given vs Received Closeness Quadrant Map */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-blue-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                준 친밀도 vs 받은 친밀도 4사분면 분석
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                학생이 친구들에게 느끼는 친밀도(가로축)와 친구들로부터 받는 친밀도(세로축)를
                비교해 짝사랑형·신중형·갈등 주의군을 한눈에 파악합니다.
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            기준선: 학급 평균 ({formatSigned(scatterData.refLine)})
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* SVG Quadrant Chart */}
          <div className="lg:col-span-7 relative border border-slate-100 rounded-lg bg-slate-50/40 p-2">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto block select-none"
              role="img"
              aria-label="준 친밀도 대비 받은 친밀도 4사분면 산점도"
            >
              {/* Plot background */}
              <rect
                x={PAD_L}
                y={PAD_T}
                width={plotW}
                height={plotH}
                fill="#FFFFFF"
                stroke="#E2E8F0"
                strokeWidth={1}
              />

              {/* Subtle quadrant tints */}
              <rect
                x={xScale(scatterData.refLine)}
                y={PAD_T}
                width={PAD_L + plotW - xScale(scatterData.refLine)}
                height={yScale(scatterData.refLine) - PAD_T}
                fill="#ECFDF5"
                opacity={0.45}
              />
              <rect
                x={PAD_L}
                y={yScale(scatterData.refLine)}
                width={xScale(scatterData.refLine) - PAD_L}
                height={PAD_T + plotH - yScale(scatterData.refLine)}
                fill="#FEF2F2"
                opacity={0.45}
              />

              {/* Zero axes */}
              <line
                x1={xScale(0)}
                y1={PAD_T}
                x2={xScale(0)}
                y2={PAD_T + plotH}
                stroke="#CBD5E1"
                strokeWidth={1}
              />
              <line
                x1={PAD_L}
                y1={yScale(0)}
                x2={PAD_L + plotW}
                y2={yScale(0)}
                stroke="#CBD5E1"
                strokeWidth={1}
              />

              {/* Class avg reference dashed lines */}
              {scatterData.refLine !== 0 && (
                <>
                  <line
                    x1={xScale(scatterData.refLine)}
                    y1={PAD_T}
                    x2={xScale(scatterData.refLine)}
                    y2={PAD_T + plotH}
                    stroke="#94A3B8"
                    strokeWidth={1}
                    strokeDasharray="4,3"
                  />
                  <line
                    x1={PAD_L}
                    y1={yScale(scatterData.refLine)}
                    x2={PAD_L + plotW}
                    y2={yScale(scatterData.refLine)}
                    stroke="#94A3B8"
                    strokeWidth={1}
                    strokeDasharray="4,3"
                  />
                </>
              )}

              {/* Diagonal parity line (given === received) */}
              <line
                x1={xScale(-scatterData.domainMax)}
                y1={yScale(-scatterData.domainMax)}
                x2={xScale(scatterData.domainMax)}
                y2={yScale(scatterData.domainMax)}
                stroke="#E2E8F0"
                strokeWidth={1}
                strokeDasharray="3,3"
              />

              {/* Quadrant corner labels */}
              <text
                x={PAD_L + plotW - 8}
                y={PAD_T + 15}
                textAnchor="end"
                fill="#047857"
                fontSize={10}
                fontWeight={600}
              >
                상호 친밀 안정권
              </text>
              <text
                x={PAD_L + 8}
                y={PAD_T + 15}
                textAnchor="start"
                fill="#1D4ED8"
                fontSize={10}
                fontWeight={600}
              >
                신중 · 방어권
              </text>
              <text
                x={PAD_L + plotW - 8}
                y={PAD_T + plotH - 8}
                textAnchor="end"
                fill="#B45309"
                fontSize={10}
                fontWeight={600}
              >
                적극 접근 · 짝사랑권
              </text>
              <text
                x={PAD_L + 8}
                y={PAD_T + plotH - 8}
                textAnchor="start"
                fill="#B91C1C"
                fontSize={10}
                fontWeight={600}
              >
                관계 위축 · 갈등 주의권
              </text>

              {/* Axis tick labels */}
              {[-scatterData.domainMax, 0, scatterData.domainMax].map((tick) => (
                <g key={`tick-${tick}`}>
                  <text
                    x={xScale(tick)}
                    y={PAD_T + plotH + 15}
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize={10}
                  >
                    {tick > 0 ? `+${tick.toFixed(1)}` : tick.toFixed(1)}
                  </text>
                  <text
                    x={PAD_L - 8}
                    y={yScale(tick) + 3}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize={10}
                  >
                    {tick > 0 ? `+${tick.toFixed(1)}` : tick.toFixed(1)}
                  </text>
                </g>
              ))}

              {/* Axis Titles */}
              <text
                x={PAD_L + plotW / 2}
                y={H - 8}
                textAnchor="middle"
                fill="#475569"
                fontSize={11}
                fontWeight={600}
              >
                친구에게 준 평균 친밀도 →
              </text>
              <text
                x={14}
                y={PAD_T + plotH / 2}
                textAnchor="middle"
                fill="#475569"
                fontSize={11}
                fontWeight={600}
                transform={`rotate(-90, 14, ${PAD_T + plotH / 2})`}
              >
                친구에게 받은 평균 친밀도 →
              </text>

              {/* Student dots */}
              {scatterData.valid.map((m) => {
                const cx = xScale(m.avgClosenessGiven ?? 0);
                const cy = yScale(m.avgClosenessReceived ?? 0);
                const isHovered = hoveredDotId === m.student.id;
                const fill = closenessDotColor(m.avgClosenessReceived);
                return (
                  <g
                    key={m.student.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredDotId(m.student.id)}
                    onMouseLeave={() => setHoveredDotId(null)}
                    onClick={() => onInspectStudent(m.student.id)}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 8.5 : 6}
                      fill={fill}
                      stroke={isHovered ? '#0F172A' : '#FFFFFF'}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                    />
                    <text
                      x={cx}
                      y={cy - 9}
                      textAnchor="middle"
                      fill="#0F172A"
                      stroke="#FFFFFF"
                      strokeWidth={2.5}
                      paintOrder="stroke"
                      fontSize={10}
                      fontWeight={isHovered ? 700 : 500}
                    >
                      {m.student.name}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Summary Strip */}
            <div className="mt-2 px-3 py-1.5 text-xs text-slate-600 flex items-center justify-between gap-2 border-t border-slate-200/70 tabular-nums min-h-[28px]">
              {hoveredMetric ? (
                <>
                  <span className="font-semibold text-slate-900">
                    {hoveredMetric.student.number}번 {hoveredMetric.student.name}
                  </span>
                  <span>
                    준 평균 <strong>{formatSigned(hoveredMetric.avgClosenessGiven)}</strong> · 받은
                    평균 <strong>{formatSigned(hoveredMetric.avgClosenessReceived)}</strong> ·
                    매우친함 {hoveredMetric.receivedScoreCounts[2]}명 · 불편{' '}
                    {hoveredMetric.receivedScoreCounts[-2]}명
                  </span>
                </>
              ) : (
                <span className="text-slate-400">
                  학생 점에 마우스를 올리면 상세 수치를 보고, 클릭하면 1:1 개별 응답표로 이동합니다.
                </span>
              )}
            </div>
          </div>

          {/* 4-Quadrant Student Breakdown List */}
          <div className="lg:col-span-5 divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {(
              [
                {
                  key: 'stable',
                  title: '상호 친밀 안정권',
                  desc: '친구에게 잘 다가가고 호감도 높게 받음',
                  color: 'text-emerald-700',
                  list: scatterData.quadrants.stable,
                },
                {
                  key: 'eager',
                  title: '적극 접근 · 짝사랑권',
                  desc: '본인은 가깝게 느끼나 받은 친밀도는 낮음',
                  color: 'text-amber-700',
                  list: scatterData.quadrants.eager,
                },
                {
                  key: 'cautious',
                  title: '신중 · 방어권',
                  desc: '친구들의 호감에 비해 본인이 신중하게 평가',
                  color: 'text-blue-700',
                  list: scatterData.quadrants.cautious,
                },
                {
                  key: 'withdrawn',
                  title: '관계 위축 · 갈등 주의권',
                  desc: '준·받은 친밀도 모두 낮아 세심한 관찰 권장',
                  color: 'text-red-700',
                  list: scatterData.quadrants.withdrawn,
                },
              ] as const
            ).map((q) => (
              <div key={q.key} className="p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold ${q.color}`}>{q.title}</span>
                  <span className="text-xs font-mono font-semibold text-slate-500 tabular-nums">
                    {q.list.length}명
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">{q.desc}</p>
                {q.list.length === 0 ? (
                  <p className="text-xs text-slate-400">해당 학생 없음</p>
                ) : (
                  <div className="flex flex-wrap gap-x-2.5 gap-y-1 pt-0.5">
                    {q.list.map((m) => (
                      <button
                        key={m.student.id}
                        type="button"
                        onClick={() => onInspectStudent(m.student.id)}
                        onMouseEnter={() => setHoveredDotId(m.student.id)}
                        onMouseLeave={() => setHoveredDotId(null)}
                        className="text-xs font-medium text-slate-800 hover:text-blue-700 hover:underline cursor-pointer tabular-nums"
                      >
                        {m.student.number}번 {m.student.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Per-Student 5-Level Closeness Profile Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              학생별 친밀도 구성 프로파일
              {selectedLevel !== null && (
                <span className="ml-2 text-xs font-medium text-blue-700">
                  · 필터: {formatScoreLabel(selectedLevel)} 받은 학생
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              각 학생이 반 친구들로부터 받은 5단계 친밀도 비율 막대와 세부 건수를 비교합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedLevel !== null && (
              <button
                type="button"
                onClick={() => setSelectedLevel(null)}
                className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:underline cursor-pointer"
              >
                단계 필터 해제
              </button>
            )}
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as ProfileSortMode)}
              aria-label="친밀도 프로파일 정렬 기준"
              className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-600"
            >
              <option value="receivedDesc">받은 평균 친밀도 높은 순</option>
              <option value="receivedAsc">받은 평균 친밀도 낮은 순</option>
              <option value="veryCloseDesc">매우 친함(+2) 많이 받은 순</option>
              <option value="negativeDesc">어색·불편(-1/-2) 많이 받은 순</option>
              <option value="gapDesc">준-받은 친밀도 격차 큰 순</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4 text-left whitespace-nowrap">번호 · 이름</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">받은 평균</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">준 평균</th>
                <th className="py-2.5 px-4 text-left whitespace-nowrap min-w-[200px]">
                  받은 친밀도 5단계 분포
                </th>
                <th className="py-2.5 px-2.5 text-right text-emerald-700 whitespace-nowrap">+2</th>
                <th className="py-2.5 px-2.5 text-right text-blue-700 whitespace-nowrap">+1</th>
                <th className="py-2.5 px-2.5 text-right text-amber-700 whitespace-nowrap">-1</th>
                <th className="py-2.5 px-2.5 text-right text-red-700 whitespace-nowrap">-2</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">상호단짝</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">개별 응답</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedProfiles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-xs text-slate-500">
                    선택한 친밀도 단계에 해당하는 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                sortedProfiles.map((m) => {
                  const counts = m.receivedScoreCounts;
                  const totalRec =
                    counts[2] + counts[1] + counts[0] + counts[-1] + counts[-2];
                  return (
                    <tr key={m.student.id} className="hover:bg-slate-50/70 h-11">
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-400 mr-2 tabular-nums">
                          {String(m.student.number).padStart(2, '0')}
                        </span>
                        <span className="font-medium text-slate-900">{m.student.name}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs font-semibold tabular-nums">
                        <span
                          className={
                            (m.avgClosenessReceived ?? 0) >= 0.4
                              ? 'text-emerald-700'
                              : (m.avgClosenessReceived ?? 0) < 0
                              ? 'text-red-600'
                              : 'text-slate-700'
                          }
                        >
                          {formatSigned(m.avgClosenessReceived)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-slate-600 tabular-nums">
                        {formatSigned(m.avgClosenessGiven)}
                      </td>
                      <td className="py-2 px-4">
                        {totalRec > 0 ? (
                          <div
                            className="h-3 w-full max-w-[240px] rounded overflow-hidden flex bg-slate-100"
                            title={`+2: ${counts[2]}명, +1: ${counts[1]}명, 0: ${counts[0]}명, -1: ${counts[-1]}명, -2: ${counts[-2]}명`}
                          >
                            {SCORE_LEVELS.map((lvl) => {
                              const pct = (counts[lvl.score] / totalRec) * 100;
                              if (pct <= 0) return null;
                              return (
                                <div
                                  key={lvl.score}
                                  style={{ width: `${pct}%`, backgroundColor: lvl.barColor }}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                        {counts[2] || <span className="text-slate-300 font-normal">0</span>}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-xs text-blue-700 tabular-nums">
                        {counts[1] || <span className="text-slate-300">0</span>}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-xs text-amber-700 tabular-nums">
                        {counts[-1] || <span className="text-slate-300">0</span>}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-xs font-semibold text-red-700 tabular-nums">
                        {counts[-2] || <span className="text-slate-300 font-normal">0</span>}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        {m.bestFriendPairIds.length > 0 ? `${m.bestFriendPairIds.length}명` : '—'}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectStudent(m.student.id)}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          응답 보기
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Bottom 2-Column Grid: Closeness Pair Tiers + Tag Intensity Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Pair Tiers by Closeness */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {pairTab === 'conflict' ? (
                <ShieldAlert className="w-4 h-4 text-red-600" />
              ) : (
                <HeartHandshake className="w-4 h-4 text-emerald-700" />
              )}
              <h3 className="text-sm font-semibold text-slate-900">친밀도 단계별 관계 쌍</h3>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  {
                    id: 'best',
                    label: `핵심 단짝 +2↔+2 (${closenessSummary.bestMutualPairs.length})`,
                  },
                  {
                    id: 'friendly',
                    label: `우호 쌍 (${closenessSummary.friendlyMutualPairs.length})`,
                  },
                  {
                    id: 'conflict',
                    label: `갈등 주의 (${closenessSummary.conflictPairs.length})`,
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPairTab(t.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    pairTab === t.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {activePairs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              이 친밀도 단계에 해당하는 관계 쌍이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {activePairs.map((pair) => (
                <div
                  key={`${pair.aId}_${pair.bId}`}
                  className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <button
                        type="button"
                        onClick={() => onInspectStudent(pair.aId)}
                        className="hover:text-blue-700 cursor-pointer"
                      >
                        {nameOf(pair.aId)}
                      </button>
                      <span className="text-slate-400 text-xs">
                        {pair.category === 'severe_oneway_conflict' ? '→' : '↔'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onInspectStudent(pair.bId)}
                        className="hover:text-blue-700 cursor-pointer"
                      >
                        {nameOf(pair.bId)}
                      </button>
                    </div>
                    {pair.tags.length > 0 && (
                      <p className="text-xs text-slate-500 truncate">
                        {pair.tags.map((t) => `#${t}`).join('  ')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono font-semibold tabular-nums whitespace-nowrap">
                    <span
                      className={
                        pair.scoreAB >= 2
                          ? 'text-emerald-700'
                          : pair.scoreAB === 1
                          ? 'text-blue-700'
                          : pair.scoreAB === -1
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }
                    >
                      {pair.scoreAB > 0 ? `+${pair.scoreAB}` : pair.scoreAB}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-300" />
                    <span
                      className={
                        pair.scoreBA === null
                          ? 'text-slate-400 font-normal'
                          : pair.scoreBA >= 2
                          ? 'text-emerald-700'
                          : pair.scoreBA === 1
                          ? 'text-blue-700'
                          : pair.scoreBA === 0
                          ? 'text-slate-500'
                          : pair.scoreBA === -1
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }
                    >
                      {pair.scoreBA === null
                        ? '미응답'
                        : pair.scoreBA > 0
                        ? `+${pair.scoreBA}`
                        : pair.scoreBA}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Relationship Tag Breakdown by Closeness Intensity */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">친밀도별 관계 태그 분석</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                강한 친밀(+2)·불편(-2)과 일반 친밀(+1)·어색(-1)에서 선택된 이유 분포입니다.
              </p>
            </div>
          </div>

          {/* Positive Tags */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">긍정 관계 태그</span>
              <span className="text-slate-500 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                  매우 친함 +2
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                  친한 편 +1
                </span>
              </span>
            </div>

            {positiveTags.length === 0 ? (
              <p className="text-xs text-slate-400">선택된 긍정 태그가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {positiveTags.map((t) => {
                  const strongW = (t.strongCount / maxPosTagCount) * 100;
                  const mildW = (t.mildCount / maxPosTagCount) * 100;
                  return (
                    <div key={t.tag} className="space-y-1">
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="font-medium text-slate-700">#{t.tag}</span>
                        <span className="text-slate-500">
                          <strong className="text-slate-900">{t.totalCount}건</strong> (+2:{' '}
                          {t.strongCount} · +1: {t.mildCount})
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded overflow-hidden flex">
                        <div style={{ width: `${strongW}%` }} className="bg-emerald-600 h-full" />
                        <div style={{ width: `${mildW}%` }} className="bg-blue-500 h-full" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Negative Tags */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">갈등·어색 관계 태그</span>
              <span className="text-slate-500 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
                  불편함 -2
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  어색함 -1
                </span>
              </span>
            </div>

            {negativeTags.length === 0 ? (
              <p className="text-xs text-slate-400">선택된 갈등·어색 태그가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {negativeTags.map((t) => {
                  const strongW = (t.strongCount / maxNegTagCount) * 100;
                  const mildW = (t.mildCount / maxNegTagCount) * 100;
                  return (
                    <div key={t.tag} className="space-y-1">
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="font-medium text-slate-700">#{t.tag}</span>
                        <span className="text-slate-500">
                          <strong className="text-slate-900">{t.totalCount}건</strong> (-2:{' '}
                          {t.strongCount} · -1: {t.mildCount})
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded overflow-hidden flex">
                        <div style={{ width: `${strongW}%` }} className="bg-red-600 h-full" />
                        <div style={{ width: `${mildW}%` }} className="bg-amber-500 h-full" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
