/*
 * 이 파일은 React Router Data 관련 설정 파일입니다.
 * - 실제 `RouterProvider`를 마운트하는 파일입니다.
 * - 상세 라우트 정의는 같은 폴더의 `route-config.ts`로 분리해 두었습니다.
 */

import { RouterProvider } from 'react-router-dom';
import { createAppRouter } from './route-config';

const appRouter = createAppRouter();

export function AppRouterProvider() {
  return <RouterProvider router={appRouter} />;
}
