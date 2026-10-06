import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true, // <--- MUST HAVE THIS so it works on npm run dev
        type: 'module'
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'My Vue POS',
        short_name: 'VuePOS',
        description: 'A fast and reliable Progressive Web App Point of Sale',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/logo3.png', // <--- MUST be a PNG or SVG, not jpg
            sizes: '192x192',
            type: 'image/png'  // <--- MUST be image/png
          },
          {
            src: '/logo3.png', // <--- MUST be a PNG or SVG, not jpg
            sizes: '512x512',
            type: 'image/png', // <--- MUST be image/png
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173
    }
  }
})
