import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    allowedHosts: ['brian-desktop-nixos.tail106e8.ts.net'],
    watch: {
      ignored: ['**/.direnv/**', '**/.pnpm-home/**', '**/node_modules/**', '**/dist/**'],
    },
  },
});
