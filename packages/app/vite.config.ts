import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Electron 패키징 시 file:// 경로에서 자산을 찾도록 상대 경로 사용.
  base: './',
  server: { port: 5173 },
});
