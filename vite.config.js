import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const issProxy = {
  '/api/iss-now': {
    target: 'http://api.open-notify.org',
    changeOrigin: true,
    rewrite: () => '/iss-now.json',
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: issProxy },
  preview: { proxy: issProxy },
});
