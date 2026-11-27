import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  auth,
  redirectResultPromise,
  signInWithGooglePopup,
  signInWithGoogleRedirect,
} from './firebase';
import { ensureUserProfile } from './services/firestoreService';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentSurveyPortal } from './components/StudentSurveyPortal';

interface StudentPortalState {
  active: boolean;
  joinCode: string;
  accessCode: string;
  isKiosk: boolean;
}

export interface AuthErrorState {
  message: string;
  code?: string;
  suggestRedirectOrNewTab?: boolean;
}

function readDeepLinkParams(): { joinCode: string; accessCode: string } {
  if (typeof window === 'undefined') return { joinCode: '', accessCode: '' };
  const params = new URLSearchParams(window.location.search);
  return {
    joinCode: (params.get('join') || '').trim(),
    accessCode: (params.get('code') || '').trim(),
  };
}

function formatAuthError(err: unknown): AuthErrorState {
  const code = (err as { code?: string })?.code || '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (code) {
    case 'auth/popup-blocked':
      return {
        code,
        message:
          '브라우저 또는 미리보기 창에서 Google 로그인 팝업이 차단되었습니다. 브라우저 팝업을 허용하거나 아래 버튼으로 새 탭 또는 현재 창에서 로그인해 주세요.',
        suggestRedirectOrNewTab: true,
      };
    case 'auth/popup-closed-by-user':
      return {
        code,
        message: 'Google 로그인 창이 완료 전에 닫혔습니다. 다시 시도해 주세요.',
        suggestRedirectOrNewTab: false,
      };
    case 'auth/cancelled-popup-request':
      return {
        code,
        message: '이전 로그인 요청이 취소되었습니다. 버튼을 한 번만 눌러 다시 시도해 주세요.',
        suggestRedirectOrNewTab: false,
      };
    case 'auth/unauthorized-domain':
      return {
        code,
        message: `현재 접속 도메인(${hostname})이 Firebase 인증 허용 도메인에 등록되지 않았습니다. Firebase Console > Authentication > Settings > Authorized domains에 도메인을 추가해 주세요.`,
        suggestRedirectOrNewTab: true,
      };
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return {
        code,
        message:
          '현재 브라우저 환경(또는 임베디드 미리보기)에서 서드파티 쿠키·저장소가 제한되어 로그인 창이 열리지 않습니다. 새 탭에서 앱을 열어 로그인해 주세요.',
        suggestRedirectOrNewTab: true,
      };
    case 'auth/network-request-failed':
      return {
        code,
        message: '네트워크 연결 문제로 Google 로그인 서버에 연결하지 못했습니다. 인터넷 상태를 확인해 주세요.',
        suggestRedirectOrNewTab: false,
      };
    default:
      return {
        code: code || 'unknown',
        message:
          'Google 로그인 창을 여는 중 문제가 발생했습니다. 미리보기 환경이라면 새 탭에서 열어 로그인하거나 현재 창 리디렉션 로그인을 시도해 주세요.',
        suggestRedirectOrNewTab: true,
      };
  }
}

function AppContent() {
  const deepLink = readDeepLinkParams();
  const hasStudentDeepLink = Boolean(deepLink.joinCode);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorState | null>(null);

  const [studentPortal, setStudentPortal] = useState<StudentPortalState>({
    active: hasStudentDeepLink,
    joinCode: deepLink.joinCode,
    accessCode: deepLink.accessCode,
    isKiosk: false,
  });

  useEffect(() => {
    // Wait for proactive redirect check / popup resolver warm-up
    void redirectResultPromise;

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setSigningIn(false);
        setAuthError(null);
      }
      if (nextUser && nextUser.emailVerified) {
        try {
          await ensureUserProfile(nextUser);
        } catch {
          // Non-fatal profile sync error logged inside handleFirestoreError
        }
      }
    });
    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    if (signingIn) return;

    // Trigger signInWithPopup synchronously at the start of the click handler
    // to preserve the browser's transient user-activation gesture for window.open.
    const popupPromise = signInWithGooglePopup();
    setSigningIn(true);
    setAuthError(null);

    try {
      await popupPromise;
    } catch (err) {
      console.error('Google Sign-In popup error:', err);
      setAuthError(formatAuthError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignInRedirect = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      console.error('Google Sign-In redirect error:', err);
      setAuthError(formatAuthError(err));
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setStudentPortal({ active: false, joinCode: '', accessCode: '', isKiosk: false });
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">인증 상태를 확인하는 중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LandingPage
        onSignIn={handleSignIn}
        onSignInRedirect={handleSignInRedirect}
        authError={authError}
        signingIn={signingIn}
        hasStudentDeepLink={hasStudentDeepLink}
      />
    );
  }

  if (studentPortal.active) {
    return (
      <StudentSurveyPortal
        initialJoinCode={studentPortal.joinCode}
        initialAccessCode={studentPortal.accessCode}
        isKioskMode={studentPortal.isKiosk}
        onExitToTeacher={() => {
          if (window.location.search) {
            window.history.replaceState({}, '', window.location.pathname);
          }
          setStudentPortal({ active: false, joinCode: '', accessCode: '', isKiosk: false });
        }}
      />
    );
  }

  return (
    <TeacherDashboard
      user={user}
      onSignOut={handleSignOut}
      onOpenStudentPortal={(joinCode = '', accessCode = '', isKiosk = false) =>
        setStudentPortal({
          active: true,
          joinCode,
          accessCode,
          isKiosk,
        })
      }
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
