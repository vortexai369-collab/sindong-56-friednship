import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Download, MessageSquare } from 'lucide-react';
import { SociometricType, Student, Survey, SurveyResponse } from '../types';
import {
  computeClassAnalytics,
  exportAnalyticsToCsv,
  triggerCsvDownload,
} from '../utils/sociometry';

interface AnalyticsViewProps {
  survey: Survey;
  students: Student[];
  responses: SurveyResponse[];
}

type SortKey = 'number' | 'positiveIn' | 'positiveOut' | 'mutual' | 'negativeIn';

const TYPE_TEXT_COLOR: Record<SociometricType, string> = {
  인기형: 'text-emerald-700',
  평균형: 'text-blue-700',
  '고립·관심형': 'text-amber-700',
  '갈등·주의형': 'text-red-700',
  양면형: 'text-violet-700',
  미분류: 'text-slate-500',
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  survey,
  students,
  responses,
}) => {
  const [subTab, setSubTab] = useState<'metrics' | 'matrix' | 'notes'>('metrics');
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);

  const analytics = useMemo(
    () => computeClassAnalytics(students, responses, 'all'),
    [students, responses]
  );

  const sortedMetrics = useMemo(() => {
    const arr = [...analytics.metricsList];
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'number':
          diff = a.student.number - b.student.number;
          break;
        case 'positiveIn':
          diff = a.positiveIn - b.positiveIn;
          break;
        case 'positiveOut':
          diff = a.positiveOut - b.positiveOut;
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

  const orderedStudents = useMemo(
    () => [...students].sort((a, b) => a.number - b.number),
    [students]
  );

  const notesList = useMemo(
    () =>
      analytics.metricsList
        .filter((m) => m.teacherNote.trim().length > 0)
        .sort((a, b) => a.student.number - b.student.number),
    [analytics.metricsList]
  );

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

  if (students.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <p className="text-base font-semibold text-slate-900">분석할 학생 데이터가 없습니다</p>
        <p className="text-sm text-slate-500">
          학생 명단을 등록하고 설문 응답이 수집되면 소시오메트리 분석 결과가 자동으로 계산됩니다.
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
          <p className="text-xs font-medium text-slate-500">상호 선택률 (학급 응집도)</p>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums">
            {analytics.reciprocityRate}%
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            쌍방 친구 연결 {analytics.mutualPairCount}쌍
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">학생당 평균 긍정 지명</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {analytics.avgPositiveIn}명
          </p>
          <p className="text-xs text-slate-500">고유 친구 기준 평균 선택받음</p>
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
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('metrics')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'metrics'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            학생별 지표표
          </button>
          <button
            type="button"
            onClick={() => setSubTab('matrix')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'matrix'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            교우관계 행렬표 (Matrix)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('notes')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'notes'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            선생님께 남긴 말 ({notesList.length})
          </button>
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

      {/* SubTab 1: Metrics Table */}
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
                  <th className="py-2.5 px-3 text-left whitespace-nowrap">응답</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('positiveIn')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      긍정 선택받음
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('positiveOut')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      긍정 선택함
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
                      갈등 지명받음
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-left whitespace-nowrap">관계 유형</th>
                  <th className="py-2.5 px-4 text-left whitespace-nowrap">교사 메모</th>
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
                    <td className="py-2 px-3 text-xs">
                      {m.responded ? (
                        <span className="text-emerald-700 font-medium">완료</span>
                      ) : (
                        <span className="text-slate-400">미응답</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {m.positiveIn}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-slate-600 tabular-nums">
                      {m.positiveOut}
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
                    <td className={`py-2 px-4 text-xs font-semibold whitespace-nowrap ${TYPE_TEXT_COLOR[m.sociometricType]}`}>
                      {m.sociometricType}
                    </td>
                    <td className="py-2 px-4 text-xs text-slate-600 max-w-[240px] truncate">
                      {m.student.memo || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/40 text-xs text-slate-500">
            유형 분류는 학급 내 표준점수(사회적 선호도·영향력)를 기반으로 3명 이상 응답 시 자동 산출됩니다.
          </div>
        </div>
      )}

      {/* SubTab 2: Adjacency Matrix */}
      {subTab === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>가로행(선택한 학생) → 세로열(선택받은 학생)</span>
            <div className="flex items-center gap-4">
              <span className="text-emerald-700 font-semibold">★ 상호 선택</span>
              <span className="text-blue-700 font-semibold">● 일방 긍정</span>
              <span className="text-red-600 font-semibold">× 갈등 지명</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-slate-50 py-2 px-3 text-left font-semibold text-slate-600 border-r border-slate-200 whitespace-nowrap">
                    선택자 \ 대상
                  </th>
                  {orderedStudents.map((col, cIdx) => (
                    <th
                      key={col.id}
                      className={`py-2 px-1.5 text-center font-medium min-w-[38px] tabular-nums ${
                        hoverCell?.c === cIdx ? 'bg-blue-50 text-blue-800' : 'text-slate-600'
                      }`}
                      title={`${col.number}번 ${col.name}`}
                    >
                      <div className="text-[10px] text-slate-400">{col.number}</div>
                      <div className="truncate max-w-[38px]">{col.name.slice(-2)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderedStudents.map((row, rIdx) => {
                  const rowMetric = analytics.metricsById[row.id];
                  return (
                    <tr key={row.id}>
                      <td
                        className={`sticky left-0 z-10 py-1.5 px-3 border-r border-slate-200 whitespace-nowrap font-medium ${
                          hoverCell?.r === rIdx
                            ? 'bg-blue-50 text-blue-900'
                            : 'bg-white text-slate-800'
                        }`}
                      >
                        <span className="font-mono text-slate-400 mr-1.5 tabular-nums">
                          {row.number}
                        </span>
                        {row.name}
                      </td>
                      {orderedStudents.map((col, cIdx) => {
                        const isSelf = row.id === col.id;
                        const isMutual = rowMetric?.mutualIds.includes(col.id);
                        const isPos = rowMetric?.chosePositive.includes(col.id);
                        const isNeg = rowMetric?.choseNegative.includes(col.id);
                        const isCrosshair = hoverCell?.r === rIdx || hoverCell?.c === cIdx;

                        return (
                          <td
                            key={col.id}
                            onMouseEnter={() => setHoverCell({ r: rIdx, c: cIdx })}
                            onMouseLeave={() => setHoverCell(null)}
                            className={`py-1.5 px-1 text-center border-r border-slate-50 ${
                              isSelf
                                ? 'bg-slate-100'
                                : isCrosshair
                                ? 'bg-blue-50/40'
                                : ''
                            }`}
                          >
                            {isSelf ? (
                              <span className="text-slate-300">·</span>
                            ) : isMutual ? (
                              <span className="text-emerald-600 font-bold" title={`${row.name} ↔ ${col.name} 상호 친구`}>
                                ★
                              </span>
                            ) : isPos ? (
                              <span className="text-blue-600" title={`${row.name} → ${col.name} 긍정 선택`}>
                                ●
                              </span>
                            ) : isNeg ? (
                              <span className="text-red-600 font-bold" title={`${row.name} → ${col.name} 갈등 지명`}>
                                ×
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 3: Student Private Notes to Teacher */}
      {subTab === 'notes' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {notesList.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              학생들이 선생님께 남긴 비공개 메시지가 아직 없습니다.
            </div>
          ) : (
            notesList.map((m) => (
              <div key={m.student.id} className="p-5 flex items-start gap-4">
                <MessageSquare className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900 text-sm">
                      {m.student.number}번 {m.student.name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{m.student.gender}</span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-medium ${TYPE_TEXT_COLOR[m.sociometricType]}`}>
                      {m.sociometricType}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {m.teacherNote}
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
