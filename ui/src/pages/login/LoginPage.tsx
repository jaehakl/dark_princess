import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, useBootstrapAuth } from '../../stores/authStore';

export function LoginPage() {
  useBootstrapAuth();
  const [searchParams] = useSearchParams();
  const authReady = useAuthStore((state) => state.authReady);
  const user = useAuthStore((state) => state.user);
  const startLogin = useAuthStore((state) => state.startLogin);
  const logoutUser = useAuthStore((state) => state.logoutUser);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isAdmin = user?.roles.includes('admin') === true;
  const rawFrom = searchParams.get('from');
  const redirectTo =
    rawFrom?.startsWith('/') &&
    !rawFrom.startsWith('//') &&
    !rawFrom.startsWith('/login')
      ? rawFrom
      : '/';

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)] px-6 text-[var(--app-text)]">
        <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-4 text-sm font-semibold shadow-sm">
          인증 상태 확인 중
        </div>
      </main>
    );
  }

  if (isAdmin) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleLogoutClick = () => {
    setIsLoggingOut(true);
    void logoutUser()
      .catch((error) => {
        console.error('로그아웃 중 오류가 발생했습니다.', error);
      })
      .finally(() => {
        setIsLoggingOut(false);
      });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-canvas)] px-5 py-10 text-[var(--app-text)]">
      <section className="w-full max-w-[26rem] rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-[var(--app-shadow)]">
        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--app-muted)]">
            ERP
          </p>
          <h1 className="text-2xl font-semibold">관리자 로그인</h1>
        </div>

        {user ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              접속 권한이 없습니다. 관리자에게 문의하세요.
            </div>
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-md px-4 transition disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoggingOut}
              onClick={handleLogoutClick}
            >
              {isLoggingOut ? '로그아웃 중' : '로그아웃'}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <p className="text-sm leading-6 text-[var(--app-muted)]">
              Google 계정으로 로그인하면 관리자 권한을 확인합니다.
            </p>
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 transition"
              onClick={startLogin}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full">
                G
              </span>
              Google로 로그인
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
