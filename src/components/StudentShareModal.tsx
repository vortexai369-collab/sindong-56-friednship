import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Lock, MonitorPlay, Share2, X } from 'lucide-react';
import { Survey } from '../types';

interface StudentShareModalProps {
  survey: Survey;
  totalStudents: number;
  respondedCount: number;
  onClose: () => void;
  onOpenKioskInCurrentTab: () => void;
}

export function buildStudentEntryUrl(joinCode: string, accessCode?: string): string {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams();
  params.set('mode', 'student');
  if (joinCode) params.set('join', joinCode);
  if (accessCode) params.set('code', accessCode);
  return `${base}?${params.toString()}`;
}

export const StudentShareModal: React.FC<StudentShareModalProps> = ({
  survey,
  totalStudents,
  respondedCount,
  onClose,
  onOpenKioskInCurrentTab,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [boardView, setBoardView] = useState(false);

  const studentClassUrl = buildStudentEntryUrl(survey.joinCode);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(studentClassUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(survey.joinCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  if (boardView) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between p-8 sm:p-12">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-300">7942 친구사이 · 학생 설문 안내</p>
            <h2 className="text-2xl sm:text-3xl font-bold">
              {survey.className} — {survey.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setBoardView(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
            칠판 안내 닫기
          </button>
        </div>

        <div className="max-w-3xl mx-auto w-full text-center space-y-8 my-auto py-8">
          <div className="space-y-2">
            <p className="text-base sm:text-lg text-slate-300">
              1. 선생님께 받은 설문 주소로 접속하세요 (로그인 불필요)
            </p>
            <p className="text-sm sm:text-base font-mono text-blue-300 break-all bg-slate-900 border border-slate-800 rounded-xl px-5 py-3">
              {studentClassUrl}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-base sm:text-lg text-slate-300">
              2. 아래 학급 코드와 본인의 개인 코드(5자리)를 입력하세요
            </p>
            <div className="inline-block bg-white text-slate-950 rounded-2xl px-12 py-6">
              <p className="text-xs font-semibold text-slate-500 mb-1">학급 코드</p>
              <p className="text-5xl sm:text-6xl font-mono font-bold tracking-[0.22em]">
                {survey.joinCode}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-400">
            응답 내용은 담임 선생님께만 전달되며, 다른 친구들은 절대 볼 수 없습니다.
          </p>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
          <span>
            실시간 응답 현황: {respondedCount} / {totalStudents}명 완료
          </span>
          <span>학생 전용 입장 주소로 자동 연결됩니다</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-5 h-5 text-blue-700 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-slate-900">학생 전용 설문 입장 창 공유</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {survey.className} · {survey.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {survey.status !== 'open' && (
          <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            현재 조사가 <strong>마감</strong> 상태입니다. 학생들이 응답할 수 있도록 상단에서 상태를
            &lsquo;응답 접수 중&rsquo;으로 열어 주세요.
          </div>
        )}

        {/* Standalone Student URL Box */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            학생 전용 입장 주소 (Google 로그인 불필요 · 학급 코드 자동 입력)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={studentClassUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedUrl ? '복사됨' : '주소 복사'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            이 주소로 접속하면 교사 화면이나 로그인 창 없이 바로 학생 전용 설문 입력 창이 열립니다.
          </p>
        </div>

        {/* Classroom Join Code + Big Board Preview */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">학급 코드</p>
            <p className="text-2xl font-mono font-bold tracking-widest text-slate-900 mt-0.5">
              {survey.joinCode}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap cursor-pointer"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              코드 복사
            </button>
            <button
              type="button"
              onClick={() => setBoardView(true)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 whitespace-nowrap cursor-pointer"
            >
              칠판·TV 크게 띄우기
            </button>
          </div>
        </div>

        {/* Direct Launch Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <a
            href={studentClassUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            새 탭에서 학생 창 열기
          </a>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenKioskInCurrentTab();
            }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            현재 창에서 키오스크 모드로 열기
          </button>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
          <span>
            학생별 개별 링크나 인쇄용 코드표는 좌측 <strong>학생 명단 · 시트</strong> 메뉴에서
            바로 복사하거나 인쇄할 수 있습니다. 학생은 본인의 코드로 1회만 제출하며 타인의 응답은
            볼 수 없습니다.
          </span>
        </div>
      </div>
    </div>
  );
};
