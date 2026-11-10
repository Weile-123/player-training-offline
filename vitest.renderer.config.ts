import {defineConfig} from 'vitest/config';
import {rendererAliases} from './renderer.config';
export default defineConfig({resolve:{alias:rendererAliases},esbuild:{jsx:'automatic',jsxImportSource:'react'},test:{server:{deps:{inline:[/zustand/,/use-sync-external-store/]}},environment:'jsdom',include:['tests/renderer/**/*.test.tsx'],setupFiles:['tests/renderer/setup.ts'],maxWorkers:1}});
