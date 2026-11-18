import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite-plus';

// Unit tests only exercise pure TypeScript (protocol, data validation, analysis). The app
// plugins (TanStack Start, Nitro websocket server, React compiler) cannot start inside Vitest,
// so they are skipped there.
const isVitest = Boolean(process.env.VITEST);

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node'
    },
    resolve: {
        tsconfigPaths: true
    },
    server: {
        port: 5780,
        watch: {
            usePolling: true,
            interval: 100
        }
    },
    css: {
        transformer: 'lightningcss',
        lightningcss: {
            cssModules: true
        }
    },
    plugins: isVitest
        ? []
        : [
              devtools({
                  consolePiping: { enabled: false }
              }),
              tanstackStart(),
              // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
              nitro({
                  features: { websocket: true }
              }),
              viteReact(),
              // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#react-compiler
              babel({
                  presets: [
                      reactCompilerPreset({
                          target: '19'
                      })
                  ]
              }),
              tailwindcss()
          ]
});
