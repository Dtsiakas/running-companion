import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Paths the server answers itself. The service worker must never answer them with the cached app shell. */
const SERVER_PATHS = [/^\/api\//, /^\/login/, /^\/logout/, /^\/oauth\//, /^\/authorize/, /^\/token/, /^\/register/, /^\/revoke/, /^\/mcp/, /^\/\.well-known\//, /^\/healthz/];
const SERVER = 'http://localhost:8787';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new version activates on its own the next time the app opens: no "refresh to update" prompt.
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Running Companion',
        short_name: 'Companion',
        description: 'Your training, recovery and health, measured against your own baseline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0e171d',
        theme_color: '#0e171d',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: SERVER_PATHS,
        runtimeCaching: [
          {
            // Data: try the network first (fresh numbers), fall back to the last copy when offline or slow.
            urlPattern: ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 86_400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // In development the API, login and OAuth pages come from `npm start` on port 8787.
    proxy: Object.fromEntries(['/api', '/login', '/logout', '/healthz'].map((path) => [path, SERVER])),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Libraries (React, Recharts, ...) in their own file. It only changes when a dependency is upgraded, so an
    // ordinary update of the app re-downloads the small app file and keeps the large vendor file from the cache.
    rolldownOptions: {
      output: {
        // Libraries in one long-cached file, except Leaflet: only the map pages need it, so it stays in their lazy chunk.
        codeSplitting: { groups: [{ name: (id: string) => (id.includes('node_modules') && !id.includes('node_modules/leaflet') ? 'vendor' : null), debugName: 'vendor' }] },
      },
    },
    // The vendor file is about 230 KB compressed, downloaded once and then cached. Fine for an installed app.
    chunkSizeWarningLimit: 900,
  },
});
