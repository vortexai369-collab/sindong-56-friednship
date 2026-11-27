import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCopy,
  Compass,
  FileText,
  Grid3X3,
  Network,
  Printer,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { ClassAnalytics, IsolationRiskLevel, Student, Survey, SurveyResponse } from '../types';
import { computeClassAnalytics } from '../utils/sociometry';

interface SociometryReportPanelProps {
  survey: Survey;
  students: Student[];
  responses: SurveyResponse[];
  onInspectStudent: (studentId: string) => void;
  onNavigateTab: (tab: 'sociogram' | 'heatmap' | 'analytics') => void;
}

type IndexSortKey = 'belongingAsc' | 'influenceDesc' | 'bridgeDesc' | 'number';

const RISK_TEXT_STYLE: Record<IsolationRiskLevel, string> = {
  높음: 'text-red-700 font-semibold',
  주의: 'text-amber-700 font-semibold',
  안정: 'text-emerald-700 font-medium',
};

function buildPlainTextReport(survey: Survey, analytics: ClassAnalytics): string {
  const r = analytics.sociometryReport;
  const fmtList = (list: ClassAnalytics['metricsList']) =>
    list.length > 0
      ? list
          .map(
            (m) =>
              `${m.student.number}번 ${m.student.name}(소속감 ${m.belongingScore}, 영향력 ${m.influenceScore})`
          )
          .join(', ')
      : '해당 없음';

  const lines: string[] = [
    `[7942 교우관계 소시오메트리 요약 리포트]`,
    `학급: ${survey.className} (${survey.academicYear}) / 조사명: ${survey.title}`,
    `응답 현황: ${analytics.respondedCount} / ${analytics.totalStudents}명 (${analytics.responseRate}%)`,
    ``,
    `1. 핵심 학급 지표`,
    `- 학급 평균 소속감: ${r.classAvgBelonging}점 / 100점`,
    `- 학급 평균 친밀도: ${
      analytics.closenessSummary.classAvgCloseness !== null
        ? `${analytics.closenessSummary.classAvgCloseness > 0 ? '+' : ''}${analytics.closenessSummary.classAvgCloseness.toFixed(2)}`
        : '—'
    }`,
    `- 상호 호혜율: ${analytics.reciprocityRate}% (상호 친구 ${analytics.mutualPairCount}쌍, 핵심 단짝 ${analytics.closenessSummary.bestMutualPairs.length}쌍)`,
    `- 긍정 네트워크 밀도: ${r.networkDensity}% · 또래 그룹 ${r.clusterCount}개 · 영향력 분포: ${r.influenceConcentration}`,
    ``,
    `2. 주요 소시오메트리 역할군`,
    `- 핵심 영향력 리더: ${fmtList(r.topInfluencers)}`,
    `- 집단 간 가교 학생: ${fmtList(r.bridgeStudents)}`,
    `- 고립·소속감 저하 학생(${r.isolatedStudents.length}명): ${fmtList(r.isolatedStudents)}`,
    `- 갈등·주의 관찰 학생(${r.conflictRiskStudents.length}명): ${fmtList(r.conflictRiskStudents)}`,
    ``,
    `3. 자동 진단 핵심 소견`,
    ...r.findings.map((f, i) => `${i + 1}) [${f.severity}] ${f.title} — ${f.detail}`),
    ``,
    `4. 학급 지도 및 모둠 배정 제언`,
    ...r.recommendations.map((rec, i) => `${i + 1}) [${rec.priority}] ${rec.title} — ${rec.detail}`),
  ];
  return lines.join('\n');
}

export const SociometryReportPanel: React.FC<SociometryReportPanelProps> = ({
  survey,
  students,
  responses,
  onInspectStudent,
  onNavigateTab,
}) => {
  const [sortBy, setSortBy] = useState<IndexSortKey>('belongingAsc');
  const [copiedReport, setCopiedReport] = useState(false);

  const analytics = useMemo(
    () => computeClassAnalytics(students, responses, 'all'),
    [students, responses]
  );

  const report = analytics.sociometryReport;

  const sortedStudents = useMemo(() => {
    const arr = [...analytics.metricsList];
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'belongingAsc':
          return a.belongingScore - b.belongingScore || a.positiveIn - b.positiveIn;
        case 'influenceDesc':
          return b.influenceScore - a.influenceScore || b.positiveInTotal - a.positiveInTotal;
        case 'bridgeDesc':
          return b.bridgeScore - a.bridgeScore || b.influenceScore - a.influenceScore;
        case 'number':
        default:
          return a.student.number - b.student.number;
      }
    });
    return arr;
  }, [analytics.metricsList, sortBy]);

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainTextReport(survey, analytics));
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  if (students.length === 0 || responses.length < 2) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2.5">
        <p className="text-base font-semibold text-slate-900">
          소시오메트리 요약 리포트를 생성하려면 최소 2명 이상의 응답이 필요합니다
        </p>
        <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
          학생 응답이 수집되면 소속감 지수, 영향력 지수, 가교 역할, 고립·갈등 위험군과 맞춤형 모둠
          배정 제언이 자동으로 계산됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Report Header */}
      <section className="bg-white border border-slate-200 rounded-xl px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span className="font-semibold text-blue-700">자동 소시오메트리 분석 리포트</span>
            <span aria-hidden="true">·</span>
            <span>{survey.academicYear}</span>
            <span aria-hidden="true">·</span>
            <span>
              응답 {analytics.respondedCount}/{analytics.totalStudents}명 ({analytics.responseRate}%)
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {survey.className} — {survey.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => onNavigateTab('sociogram')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Network className="w-3.5 h-3.5 text-blue-700" />
            연결 강도망 보기
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('heatmap')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Grid3X3 className="w-3.5 h-3.5 text-emerald-700" />
            친밀도 히트맵
          </button>
          <button
            type="button"
            onClick={handleCopyReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            {copiedReport ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <ClipboardCopy className="w-3.5 h-3.5" />
            )}
            {copiedReport ? '요약 복사됨' : '리포트 텍스트 복사'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            리포트 인쇄
          </button>
        </div>
      </section>

      {/* 4-Column Core Sociometry KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">학급 평균 소속감</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {report.classAvgBelonging}
            <span className="text-sm font-normal text-slate-400 ml-1">/ 100</span>
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            안정 소속 {analytics.metricsList.filter((m) => m.isolationRisk === '안정').length}명 ·
            평균 친밀도{' '}
            {analytics.closenessSummary.classAvgCloseness !== null
              ? `${analytics.closenessSummary.classAvgCloseness > 0 ? '+' : ''}${analytics.closenessSummary.classAvgCloseness.toFixed(2)}`
              : '—'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">네트워크 응집 · 밀도</p>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums">
            {analytics.reciprocityRate}%
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            긍정 연결 밀도 {report.networkDensity}% · 또래 그룹 {report.clusterCount}개
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">영향력 구조</p>
          <p className="text-2xl font-bold text-blue-700 tabular-nums">
            {report.influenceConcentration}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            핵심 리더 {report.topInfluencers.length}명 · 가교 역할 {report.bridgeStudents.length}명
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">고립 · 갈등 관찰 필요</p>
          <p className="text-2xl font-bold text-amber-700 tabular-nums">
            {report.isolatedStudents.length + report.conflictRiskStudents.length}건
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            고립 위험 {report.isolatedStudents.length}명 · 갈등 주의{' '}
            {report.conflictRiskStudents.length}명
          </p>
        </div>
      </div>

      {/* Main Grid: Diagnostic Findings & Actionable Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Automated Diagnostic Findings */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 flex flex-col space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-700 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">학급 관계망 자동 진단 소견</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                소속감·영향력·연결 밀도·갈등 데이터를 종합해 자동으로 도출한 요약입니다.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {report.findings.map((finding) => (
              <div key={finding.id} className="py-3.5 first:pt-1 last:pb-0 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`font-semibold ${
                      finding.severity === '주의'
                        ? 'text-red-700'
                        : finding.severity === '관찰'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {finding.severity}
                  </span>
                  <span className="text-slate-300">·</span>
                  <h3 className="text-sm font-semibold text-slate-900">{finding.title}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{finding.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Actionable Classroom Guidance */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 flex flex-col space-y-4">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-700 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                맞춤형 학급 지도 · 모둠 배정 제언
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                고립 학생의 긍정 접점과 가교 학생 데이터를 기반으로 제안하는 실천 방안입니다.
              </p>
            </div>
          </div>

          {report.recommendations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8 text-xs text-slate-500">
              현재 시급한 개입이 필요한 위험 신호가 없습니다. 기존 학급 활동을 안정적으로 유지해
              주세요.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 flex-1">
              {report.recommendations.map((rec) => (
                <div key={rec.id} className="py-3.5 first:pt-1 last:pb-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        rec.priority === '우선'
                          ? 'text-red-700'
                          : rec.priority === '권장'
                          ? 'text-blue-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {rec.priority}
                    </span>
                    <span className="text-slate-300">·</span>
                    <h3 className="text-sm font-semibold text-slate-900">{rec.title}</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{rec.detail}</p>
                  {rec.targetStudentIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 no-print">
                      {Array.from(new Set(rec.targetStudentIds)).map((sid) => {
                        const m = analytics.metricsById[sid];
                        if (!m) return null;
                        return (
                          <button
                            key={sid}
                            type="button"
                            onClick={() => onInspectStudent(sid)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            {m.student.number}번 {m.student.name}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Bottom 2-Column Split: Student Sociometry Index Table + Key Role Groups */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left (8 cols): Student-by-Student Belonging / Influence / Bridge Index Comparison */}
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                학생별 소속감 · 영향력 · 가교 지표 분포
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                소속감(상호 유대·긍정 수용), 영향력(가중 호감·2단계 중심성), 가교(이질 집단 연결)를
                0~100점으로 산출했습니다.
              </p>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as IndexSortKey)}
              aria-label="소시오메트리 지표 정렬"
              className="text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-600 no-print"
            >
              <option value="belongingAsc">소속감 낮은 순 (고립 우선 점검)</option>
              <option value="influenceDesc">영향력 높은 순 (리더 파악)</option>
              <option value="bridgeDesc">가교 지수 높은 순</option>
              <option value="number">출석 번호순</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4 text-left whitespace-nowrap">학생</th>
                  <th className="py-2.5 px-3 text-left whitespace-nowrap min-w-[145px]">
                    소속감 지수
                  </th>
                  <th className="py-2.5 px-3 text-left whitespace-nowrap min-w-[145px]">
                    영향력 지수
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">가교</th>
                  <th className="py-2.5 px-3 text-left whitespace-nowrap">고립 위험</th>
                  <th className="py-2.5 px-3 text-left whitespace-nowrap">관계 유형</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap no-print">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedStudents.map((m) => (
                  <tr key={m.student.id} className="hover:bg-slate-50/70 h-11">
                    <td className="py-2 px-4 whitespace-nowrap">
                      <span className="font-mono text-slate-400 mr-2 tabular-nums">
                        {String(m.student.number).padStart(2, '0')}
                      </span>
                      <span className="font-medium text-slate-900">{m.student.name}</span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              m.belongingScore >= 60
                                ? 'bg-emerald-600'
                                : m.belongingScore >= 35
                                ? 'bg-blue-600'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${m.belongingScore}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold text-slate-800 w-7 text-right tabular-nums">
                          {m.belongingScore}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-slate-800"
                            style={{ width: `${m.influenceScore}%` }}
                          />
                        </div>
                        <span className="font-mono font-semibold text-slate-800 w-7 text-right tabular-nums">
                          {m.influenceScore}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {m.bridgeScore}
                    </td>
                    <td className={`py-2 px-3 whitespace-nowrap ${RISK_TEXT_STYLE[m.isolationRisk]}`}>
                      {m.isolationRisk}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                      {m.sociometricType}
                    </td>
                    <td className="py-2 px-4 text-right whitespace-nowrap no-print">
                      <button
                        type="button"
                        onClick={() => onInspectStudent(m.student.id)}
                        className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                      >
                        응답 보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right (4 cols): Role-Based Key Student Summary */}
        <section className="xl:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {/* Top Influencers */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <Users className="w-3.5 h-3.5 text-blue-700" />
                핵심 영향력 리더
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {report.topInfluencers.length}명
              </span>
            </div>
            {report.topInfluencers.length === 0 ? (
              <p className="text-xs text-slate-400">해당 학생 없음</p>
            ) : (
              <div className="space-y-1.5">
                {report.topInfluencers.map((m) => (
                  <button
                    key={m.student.id}
                    type="button"
                    onClick={() => onInspectStudent(m.student.id)}
                    className="w-full flex items-center justify-between text-xs py-1 hover:text-blue-700 cursor-pointer tabular-nums"
                  >
                    <span className="font-medium text-slate-800">
                      {m.student.number}번 {m.student.name}
                    </span>
                    <span className="text-slate-500">
                      영향력 <strong className="text-blue-700">{m.influenceScore}</strong> · 매우친함{' '}
                      {m.veryCloseIn}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bridge Students */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <Network className="w-3.5 h-3.5 text-emerald-700" />
                집단 간 가교 학생
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {report.bridgeStudents.length}명
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              서로 다른 또래 그룹·성별을 연결하는 소통 허브 역할을 합니다.
            </p>
            {report.bridgeStudents.length === 0 ? (
              <p className="text-xs text-slate-400">해당 학생 없음</p>
            ) : (
              <div className="space-y-1.5">
                {report.bridgeStudents.map((m) => (
                  <button
                    key={m.student.id}
                    type="button"
                    onClick={() => onInspectStudent(m.student.id)}
                    className="w-full flex items-center justify-between text-xs py-1 hover:text-blue-700 cursor-pointer tabular-nums"
                  >
                    <span className="font-medium text-slate-800">
                      {m.student.number}번 {m.student.name}
                    </span>
                    <span className="text-slate-500">
                      가교 <strong className="text-emerald-700">{m.bridgeScore}</strong> · 상호{' '}
                      {m.mutualIds.length}명
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Isolated Students */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                고립 · 소속감 저하 학생
              </span>
              <span className="text-xs font-mono text-amber-700 font-semibold tabular-nums">
                {report.isolatedStudents.length}명
              </span>
            </div>
            {report.isolatedStudents.length === 0 ? (
              <p className="text-xs text-emerald-700">고립 위험 학생이 감지되지 않았습니다.</p>
            ) : (
              <div className="space-y-2">
                {report.isolatedStudents.map((m) => {
                  const partners = m.recommendedPeerIds
                    .map((id) => analytics.metricsById[id]?.student.name)
                    .filter(Boolean);
                  return (
                    <div key={m.student.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => onInspectStudent(m.student.id)}
                        className="w-full flex items-center justify-between text-xs hover:text-blue-700 cursor-pointer tabular-nums"
                      >
                        <span className="font-semibold text-slate-900">
                          {m.student.number}번 {m.student.name}
                        </span>
                        <span className="text-amber-700 font-mono font-semibold">
                          소속감 {m.belongingScore} · 상호 {m.mutualIds.length}
                        </span>
                      </button>
                      {partners.length > 0 && (
                        <p className="text-[11px] text-slate-500">
                          추천 모둠 파트너: {partners.join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conflict Risk Students */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-800">
                <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                갈등 · 주의 관찰 학생
              </span>
              <span className="text-xs font-mono text-red-700 font-semibold tabular-nums">
                {report.conflictRiskStudents.length}명
              </span>
            </div>
            {report.conflictRiskStudents.length === 0 ? (
              <p className="text-xs text-slate-400">갈등 주의 학생이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {report.conflictRiskStudents.map((m) => (
                  <button
                    key={m.student.id}
                    type="button"
                    onClick={() => onInspectStudent(m.student.id)}
                    className="w-full flex items-center justify-between text-xs py-1 hover:text-blue-700 cursor-pointer tabular-nums"
                  >
                    <span className="font-semibold text-slate-900">
                      {m.student.number}번 {m.student.name}
                    </span>
                    <span className="text-red-700 font-mono">
                      불편(-2) {m.receivedScoreCounts[-2]} · 어색 {m.receivedScoreCounts[-1]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
