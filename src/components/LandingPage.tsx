import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  Network,
  UserCheck,
  Users,
} from 'lucide-react';
import type { AuthErrorState } from '../App';

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  onSignInRedirect: () => Promise<void>;
  onOpenStudentEntry: () => void;
  authError: AuthErrorState | null;
  signingIn: boolean;
}

const PREVIEW_NODES = [
  { id: '1', label: '김도윤', x: 175, y: 120, r: 22, gender: '남', mutual: 3 },
  { id: '2', label: '이서준', x: 95, y: 78, r: 17, gender: '남', mutual: 2 },
  { id: '3', label: '박하준', x: 105, y: 178, r: 16, gender: '남', mutual: 2 },
  { id: '4', label: '김서연', x: 278, y: 135, r: 21, gender: '여', mutual: 3 },
  { id: '5', label: '이하윤', x: 358, y: 84, r: 18, gender: '여', mutual: 2 },
  { id: '6', label: '박지우', x: 365, y: 192, r: 16, gender: '여', mutual: 2 },
  { id: '7', label: '최은우', x: 224, y: 232, r: 14, gender: '남', mutual: 0 },
];

const PREVIEW_EDGES = [
  { from: 0, to: 1, type: 'mutual' },
  { from: 0, to: 2, type: 'mutual' },
  { from: 1, to: 2, type: 'mutual' },
  { from: 0, to: 3, type: 'mutual' },
  { from: 3, to: 4, type: 'mutual' },
  { from: 3, to: 5, type: 'mutual' },
  { from: 4, to: 5, type: 'mutual' },
  { from: 6, to: 0, type: 'oneway' },
  { from: 6, to: 3, type: 'oneway' },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  onSignInRedirect,
  onOpenStudentEntry,
  authError,
  signingIn,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isEmbeddedIframe =
    typeof window !== 'undefined' && window.self !== window.top;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            7942 친구사이
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#workflow"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              조사 흐름
            </a>
            <a
              href="#sheet-sync"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              시트 명단 연동
            </a>
            <a
              href="#sociogram"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              교우관계망
            </a>
            <a
              href="#privacy"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              데이터 보안
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenStudentEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-700" />
              학생 설문 입장
            </button>
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {signingIn ? '로그인 창 여는 중...' : '교사 로그인'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Top Auth Feedback Banner (always visible regardless of which button was clicked) */}
        {authError && (
          <div className="bg-red-50 border-b border-red-200">
            <div className="max-w-6xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5 text-sm text-red-900">
                <p className="font-medium">{authError.message}</p>
                {authError.code && (
                  <p className="text-xs font-mono text-red-700">오류 코드: {authError.code}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {authError.suggestRedirectOrNewTab && (
                  <>
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      새 탭에서 열기
                    </a>
                    {!isEmbeddedIframe && (
                      <button
                        type="button"
                        onClick={onSignInRedirect}
                        disabled={signingIn}
                        className="px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 whitespace-nowrap cursor-pointer"
                      >
                        현재 창에서 로그인
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={signingIn}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-800 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 whitespace-nowrap cursor-pointer"
                >
                  팝업 다시 시도
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hero Split */}
        <section className="max-w-6xl mx-auto px-6 pt-14 pb-16 lg:pt-20 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-sm font-medium text-blue-700">
                초·중·고 학급 경영을 위한 교우관계 조사 플랫폼
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-900 leading-[1.2]">
                시트 명단 붙여넣기부터 교우관계망 분석까지 한 화면에서
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                교사는 Google 계정으로 학급 명단을 관리하고, 학생은 별도의 로그인 없이 전용 입장
                창에서 학급 코드와 개인 코드만으로 안전하게 응답합니다.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 5.04c1.94 0 3.51.68 4.75 1.81l3.48-3.48C18.14 1.38 15.33 0 12 0 7.31 0 3.25 2.69 1.28 6.6l4.06 3.15C6.31 6.86 8.92 5.04 12 5.04z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.72 2.89c2.17-2 3.7-4.95 3.7-8.71z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.34 14.25c-.24-.73-.38-1.51-.38-2.25s.14-1.52.38-2.25L1.28 6.6C.46 8.24 0 10.06 0 12s.46 3.76 1.28 5.4l4.06-3.15z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.72-2.89c-1.07.72-2.45 1.15-4.21 1.15-3.08 0-5.69-1.82-6.66-4.71L1.28 17.4C3.25 21.31 7.31 24 12 24z"
                    />
                  </svg>
                  {signingIn ? 'Google 로그인 창 여는 중...' : '교사 Google 로그인'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenStudentEntry}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  학생 설문 입장 (코드 입력)
                </button>
              </div>

              {isEmbeddedIframe && (
                <div>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    교사 로그인 팝업이 안 뜨면 새 탭에서 열기
                  </a>
                </div>
              )}
            </div>

            {/* Interactive Sociogram Preview Panel */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">학급 교우관계망 미리보기</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    노드에 마우스를 올려 상호 친구와 일방 선택을 확인하세요
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-emerald-600 inline-block" />
                    상호 선택
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-slate-400 inline-block" />
                    일방 선택
                  </span>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center min-h-[260px]">
                <svg
                  viewBox="0 0 460 280"
                  className="w-full h-auto max-h-[290px]"
                  role="img"
                  aria-label="학급 교우관계망 예시 그래프"
                >
                  <defs>
                    <marker
                      id="landing-arrow"
                      viewBox="0 0 10 10"
                      refX="22"
                      refY="5"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
                    </marker>
                  </defs>
                  {PREVIEW_EDGES.map((edge, idx) => {
                    const a = PREVIEW_NODES[edge.from];
                    const b = PREVIEW_NODES[edge.to];
                    const isHighlighted =
                      !hoveredId || hoveredId === a.id || hoveredId === b.id;
                    return (
                      <line
                        key={idx}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={edge.type === 'mutual' ? '#059669' : '#94A3B8'}
                        strokeWidth={edge.type === 'mutual' ? 2.4 : 1.4}
                        strokeDasharray={edge.type === 'oneway' ? '4 3' : undefined}
                        markerEnd={edge.type === 'oneway' ? 'url(#landing-arrow)' : undefined}
                        opacity={isHighlighted ? 0.9 : 0.18}
                        className="transition-opacity duration-150"
                      />
                    );
                  })}

                  {PREVIEW_NODES.map((node) => {
                    const isHighlighted = !hoveredId || hoveredId === node.id;
                    const fill =
                      node.mutual === 0
                        ? '#D97706'
                        : node.gender === '남'
                        ? '#2563EB'
                        : '#DB2777';
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onMouseEnter={() => setHoveredId(node.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className="cursor-pointer transition-opacity duration-150"
                        opacity={isHighlighted ? 1 : 0.3}
                      >
                        <circle
                          r={node.r}
                          fill={fill}
                          stroke="#FFFFFF"
                          strokeWidth={2.5}
                        />
                        <text
                          y={node.r + 14}
                          textAnchor="middle"
                          className="fill-slate-800 text-[11px] font-medium select-none"
                        >
                          {node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                <span>남학생(파랑) · 여학생(분홍) · 관심필요(황색)</span>
                <span>상호 연결 7쌍 · 관심 대상 1명</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Column Feature Row */}
        <section id="workflow" className="border-t border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="mb-10 max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                기존 7942 구글 시트 방식을 그대로 옮기고 실시간 분석을 더했습니다
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                복잡한 앱스크립트 배포나 권한 오류 없이, 학급 명단 입력부터 학생 코드 배부,
                소시오그램 시각화까지 즉시 동작합니다.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div id="sheet-sync" className="space-y-2.5">
                <FileSpreadsheet className="w-5 h-5 text-blue-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  구글 시트 명단 완벽 호환
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  학생ID, 번호, 이름, 성별, 코드, 상태 열을 그대로 복사해 붙여넣거나 CSV로
                  가져오고 내보낼 수 있습니다.
                </p>
              </div>

              <div className="space-y-2.5">
                <Users className="w-5 h-5 text-blue-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  개별 코드표 인쇄 및 키오스크
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  학생별 고유 접속 코드를 자동 생성하고 교실 배부용 코드표를 인쇄하거나 공용
                  태블릿 키오스크 모드로 응답을 받습니다.
                </p>
              </div>

              <div id="sociogram" className="space-y-2.5">
                <Network className="w-5 h-5 text-blue-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  인터랙티브 소시오그램
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  상호 선택, 일방 선택, 갈등 지명을 선 스타일로 구분하고 특정 학생 클릭 시
                  연결된 친구 관계만 집중 분석합니다.
                </p>
              </div>

              <div id="privacy" className="space-y-2.5">
                <Lock className="w-5 h-5 text-blue-700" />
                <h3 className="text-base font-semibold text-slate-900">
                  담임 교사 전용 데이터 격리
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  모든 응답과 상담 메모는 Firebase 보안 규칙으로 담임 교사 계정에서만 열람되며,
                  학생은 타인의 응답을 조회할 수 없습니다.
                </p>
              </div>
            </div>

            {/* Sheet Schema Reference Strip */}
            <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">지원하는 시트 기본 열 구조</p>
                <p className="font-mono text-sm text-slate-800">
                  학생ID , 번호 , 이름 , 성별 , 코드 , 상태
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  샘플 5학년 3반 학급 데이터 즉시 체험 가능
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-6">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>7942 친구사이 · 학급 교우관계 조사 및 소시오메트리 분석 도구</span>
          <span>교사 인증 기반 보안 저장소 연동</span>
        </div>
      </footer>
    </div>
  );
};
