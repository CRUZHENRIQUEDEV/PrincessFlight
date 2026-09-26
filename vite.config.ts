// Versão: 1.0
import { defineConfig } from 'vitest/config';

const travelpayoutsProxy = {
  '/tp-api': {
    target: 'https://api.travelpayouts.com',
    changeOrigin: true,
    secure: false,
    rewrite: (path: string) => path.replace(/^\/tp-api/, ''),
  },
};

export default defineConfig({
  base: './',
  server: { proxy: travelpayoutsProxy },
  preview: { proxy: travelpayoutsProxy },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
