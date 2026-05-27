/*
 * 이 파일은 프론트엔드 진입점입니다.
 * - 라우터 조립 진입점: `AppRouterProvider`를 마운트합니다.
 * - 상태관리 조립 진입점: 라우터 내부에서 Zustand store가 사용되도록 시작점을 제공합니다.
 * - Tailwind CSS 연결 지점: 전역 스타일 진입 파일을 import 합니다.
 */

import { createRoot } from 'react-dom/client';
import { AppRouterProvider } from './app/router';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('React 앱을 마운트할 #root 요소를 찾지 못했습니다.');
}

createRoot(rootElement).render(<AppRouterProvider />);
