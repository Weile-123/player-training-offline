import {rendererAliases} from './renderer.config';
import { defineConfig } from 'vite';
export default defineConfig({
  resolve:{alias:rendererAliases},
  // Keep the store's hook imports on the same source module graph as the app.
  // Prebundling Zustand alone embeds a second copy of the local renderer.
  optimizeDeps:{exclude:['zustand','zustand/vanilla']},
  esbuild:{jsx:'automatic',jsxImportSource:'react'},
  build:{copyPublicDir:false,modulePreload:{polyfill:false}},
  base: './',
  // Runtime config is polled; do not reload the page and discard flying balls on save.
  server: {
    host: '127.0.0.1',
    port: 8800,
    strictPort: true,
    watch: { ignored: ['**/public/config/animation.json','**/.tmp/**','**/output/**','**/hupu-skills/skills/**'] },
    fs: { deny: ['**/.git/**','**/.env*','**/credentials.json','**/debug-context.json','**/debug-logs.json','**/hupu-skills/skills/**','**/.tmp/**'] },
  },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
