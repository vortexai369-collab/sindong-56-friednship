import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', isQuotaError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const raw = error?.message || '알 수 없는 오류가 발생했습니다.';
    const isQuotaError = raw.toLowerCase().includes('quota exceeded');
    let friendly = '데이터를 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';

    if (isQuotaError) {
      friendly =
        'Firestore 무료 사용량 한도를 초과했습니다. 내일 한도가 초기화되거나 Firebase 콘솔에서 요금제를 확인해 주세요.';
    } else if (raw.includes('Missing or insufficient permissions')) {
      friendly = '데이터 접근 권한을 확인하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.';
    }

    return { hasError: true, message: friendly, isQuotaError };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900">문제가 발생했습니다</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{this.state.message}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                화면 새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
