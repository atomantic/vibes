import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 900,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    host: '0.0.0.0',
    // Tailscale MagicDNS addresses use the tailnet's *.ts.net suffix.
    allowedHosts: ['.ts.net'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.ts.net'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
