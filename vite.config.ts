import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
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
