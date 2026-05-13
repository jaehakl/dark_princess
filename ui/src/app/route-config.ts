import { useEffect } from 'react';
import { createElement } from 'react';
import {
  createBrowserRouter,
  Navigate,
  useRouteError,
} from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from './layout';
import { ListEditPage } from '../pages/list-edit/ListEditPage';
import { PlayEditPage } from '../pages/play-edit/PlayEditPage';
import { SettingsPage } from '../pages/settings/SettingsPage';

function RouteErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    console.error('React Router route handling failed.', error);
  }, [error]);

  return null;
}

export const routeObjects: RouteObject[] = [
  {
    path: '/',
    element: createElement(AppLayout),
    errorElement: createElement(RouteErrorBoundary),
    children: [
      {
        index: true,
        element: createElement(Navigate, {
          to: '/play-edit',
          replace: true,
        }),
      },
      {
        path: 'list-edit',
        element: createElement(ListEditPage),
        handle: {
          breadcrumb: 'Table Edit',
          pageTitle: 'Table Edit',
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
        path: 'settings',
        element: createElement(SettingsPage),
        handle: {
          breadcrumb: '환경설정',
          pageTitle: '환경설정',
        },
      },
      {
        path: '*',
        element: createElement(Navigate, {
          to: '/play-edit',
          replace: true,
        }),
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routeObjects);
