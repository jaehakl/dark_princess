/*
 * 이 파일은 React Router Data 기반 라우트 정의 파일입니다.
 * - 상세 페이지 라우트 정의를 한 곳에서 관리합니다.
 * - `router.tsx`는 이 파일의 라우트 정의를 받아 실제 `RouterProvider`를 구성합니다.
 */

import { useEffect } from 'react';
import { createElement } from 'react';
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useRouteError,
} from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from './layout';
import { HomePage } from '../pages/home/HomePage';
import { ListEditPage } from '../pages/list-edit/ListEditPage';
import { LoginPage } from '../pages/login/LoginPage';
import { PlayEditPage } from '../pages/play-edit/PlayEditPage';
import { useAuthStore, useBootstrapAuth } from '../stores/authStore';

function AdminRouteShell() {
  useBootstrapAuth();
  const location = useLocation();
  const authReady = useAuthStore((state) => state.authReady);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.roles.includes('admin') === true;

  if (!authReady) {
    return createElement(
      'div',
      {
        className:
          'flex min-h-screen items-center justify-center bg-[var(--app-canvas)] px-6 text-[var(--app-text)]',
      },
      createElement(
        'div',
        {
          className:
            'rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-4 text-sm font-semibold shadow-sm',
        },
        '인증 상태 확인 중'
      )
    );
  }

  if (!isAdmin) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    const search = new URLSearchParams({ from });

    return createElement(Navigate, {
      to: `/login?${search.toString()}`,
      replace: true,
    });
  }

  return createElement(AppLayout);
}

function RouteErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    console.error('React Router 경로 처리 중 오류가 발생했습니다.', error);
  }, [error]);

  return null;
}

export const routeObjects: RouteObject[] = [
  {
    path: '/login',
    element: createElement(LoginPage),
    errorElement: createElement(RouteErrorBoundary),
  },
  {
    path: '/',
    element: createElement(AdminRouteShell),
    errorElement: createElement(RouteErrorBoundary),
    children: [
      {
        index: true,
        element: createElement(HomePage),
        handle: {
          breadcrumb: '홈',
          pageTitle: '홈',
        },
      },
      {
        path: 'list-edit',
        element: createElement(ListEditPage),
        handle: {
          breadcrumb: '테이블 편집',
          pageTitle: '테이블 편집',
        },
      },
      {
        path: 'play-edit',
        element: createElement(PlayEditPage),
        handle: {
          breadcrumb: 'Play+Edit',
          pageTitle: 'Play+Edit',
        },
      },
      {
        path: '*',
        element: createElement(Navigate, {
          to: '/',
          replace: true,
        }),
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routeObjects);
