import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const echoStarryBrandCompatibility = {
  name: 'echo-starry-brand-compatibility',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.endsWith('/src/App.tsx') && !id.endsWith('\\src\\App.tsx')) return null;
    if (!code.includes('繁星回聲')) return null;
    return {
      code: code.replaceAll('繁星回聲', 'Echo-Starry'),
      map: null,
    };
  },
};

export default defineConfig(() => {
  return {
    plugins: [echoStarryBrandCompatibility, react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
