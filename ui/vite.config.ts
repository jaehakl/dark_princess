/*
 * 이 파일은 UI 빌드 도구의 중심 설정 파일입니다.
 * - React 관련 설정: `@vitejs/plugin-react` 플러그인을 연결합니다.
 * - Tailwind CSS 관련 설정: `@tailwindcss/vite` 플러그인을 연결합니다.
 */

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
