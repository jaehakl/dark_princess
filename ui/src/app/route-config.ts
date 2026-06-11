import { useEffect } from 'react';
import { createElement } from 'react';
import {
  createBrowserRouter,
  Navigate,
  useRouteError,
} from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from './layout';
import { LandingPage } from '../pages/landing/LandingPage';
import { PlayPage } from '../pages/play/PlayPage';

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
        element: createElement(LandingPage),
        handle: {
          breadcrumb: 'Create/Select Status',
          pageTitle: 'Create/Select Status',
        },
      },
      {
        path: 'play/:statusId',
        element: createElement(PlayPage),
        handle: {
          breadcrumb: 'Play',
          pageTitle: 'Play',
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
