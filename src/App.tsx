import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
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

function readDeepLinkParams(): { joinCode: string; accessCode: string } {
  if (typeof window === 'undefined') return { joinCode: '', accessCode: '' };
  const params = new URLSearchParams(window.location.search);
  return {
    joinCode: (params.get('join') || '').trim(),
    accessCode: (params.get('code') || '').trim(),
  };
}

function AppContent() {
  const deepLink = readDeepLinkParams();
  const hasStudentDeepLink = Boolean(deepLink.joinCode);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [studentPortal, setStudentPortal] = useState<StudentPortalState>({
    active: hasStudentDeepLink,
    joinCode: deepLink.joinCode,
    accessCode: deepLink.accessCode,
    isKiosk: false,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
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
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Google 로그인 창이 닫혔습니다. 다시 시도해 주세요.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('브라우저에서 팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.');
      } else {
        setAuthError('로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
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
