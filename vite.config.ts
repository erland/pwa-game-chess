import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// IMPORTANT: GitHub Pages serves this app from /pwa-game-chess/
// (the repository name). Keep this in sync with your repo name.
export default defineConfig({
  base: '/pwa-game-chess/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'PWA Chess',
        short_name: 'Chess',
        description: 'A simple chess game as a Progressive Web App.',
        theme_color: '#111827',
        background_color: '#0b0f19',
        display: 'standalone',
        scope: '/pwa-game-chess/',
        start_url: '/pwa-game-chess/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
