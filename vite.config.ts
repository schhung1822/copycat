import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = `http://localhost:${env.PORT || 4000}`;

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Chuyển tiếp API và file ảnh về server Express, nhờ vậy trình duyệt coi
      // web và API cùng một origin nên cookie đăng nhập hoạt động bình thường.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/files': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Tách thư viện ra chunk riêng để lần deploy sau trình duyệt chỉ tải lại mã ứng dụng.
          manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
