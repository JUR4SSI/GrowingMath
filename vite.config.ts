import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          teacher: path.resolve(__dirname, 'teacher.html'),
        },
        output: {
          manualChunks: undefined, // Disable manual chunk splitting to reduce memory usage
        },
      },
      dynamicImportVarsOptions: {
        warnOnError: true,
      },
      terserOptions: {
        compress: true,
        mangle: true,
      },
      sourcemap: false, // Disable source maps to reduce memory usage
      chunkSizeWarningLimit: 1000, // Increase chunk size warning limit
    },
    // NAO reintroduzir um `define` com GEMINI_API_KEY: o valor seria embutido em texto
    // claro no bundle do cliente e distribuido no instalador. A chave e usada apenas no
    // servidor (server.ts), que a le em runtime do .env.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
