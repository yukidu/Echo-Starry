import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    // stable-preview is a fixed, frequently redeployed test URL. Vite 8 uses
    // Rolldown; disable code splitting there so edit/admin modals are bundled
    // with the main frontend instead of depending on a separately fetched chunk.
    // Preserve source execution order as well; Rolldown documents this as the
    // safety switch when inlining modules that may have order-sensitive side effects.
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: false,
          strictExecutionOrder: true,
        },
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
