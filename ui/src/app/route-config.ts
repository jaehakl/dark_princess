import { useEffect } from 'react';
import { createElement } from 'react';
import {
  createBrowserRouter,
  Navigate,
  useRouteError,
} from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { AppLayout } from './layout';
import { ImageManagerPage } from '../pages/image-manager/ImageManagerPage';
import { LandingPage } from '../pages/landing/LandingPage';
import { PlayPage } from '../pages/play/PlayPage';
import { CutWizardPage } from '../pages/cut_wizard/CutWizardPage';

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
        path: 'cut-wizard',
        element: createElement(CutWizardPage),
        handle: {
          breadcrumb: 'Cut Wizard',
          pageTitle: 'Cut Wizard',
        },
      },
      {
        path: 'image-manager',
        element: createElement(ImageManagerPage),
        handle: {
          breadcrumb: 'Image 관리',
          pageTitle: 'Image 관리',
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
