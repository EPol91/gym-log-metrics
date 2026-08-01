import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// base '/gym-log-metrics/' in produzione (GitHub Pages project site), '/' in dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/gym-log-metrics/' : '/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' + injectRegister false: la registrazione la fa src/util/pwaUpdate.ts,
      // che controlla gli aggiornamenti e decide QUANDO ricaricare (mai a metà allenamento).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'ETP HEALTH',
        short_name: 'ETP HEALTH',
        description: 'Allenamento, alimentazione, recupero e abitudini in un posto solo. Offline-first.',
        theme_color: '#0e0e10',
        background_color: '#0e0e10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Maskable a parte: Android ritaglia, e l'immagine quadrata piena si
          // faceva mangiare cornice e scritta dai bordi.
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // offline-first: cache dell'app shell
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}))
