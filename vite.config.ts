import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  resolve: {
    // sql.js main entry is Node-flavored; the -browser build finds its .wasm next to the script.
    // Absolute path so the ?url wasm subpath isn't rewritten under the alias too.
    alias: [
      { find: /^sql\.js$/, replacement: fileURLToPath(new URL('./node_modules/sql.js/dist/sql-wasm-browser.js', import.meta.url)) },
      { find: /^sql\.js\//, replacement: fileURLToPath(new URL('./node_modules/sql.js/', import.meta.url)) },
    ],
  },
});
