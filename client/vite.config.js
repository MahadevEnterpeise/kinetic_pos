import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
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
            src: '/logo3.jpg',
            sizes: '192x192',
            type: 'image/jpg'
          },
          {
            src: '/logo3.jpg',
            sizes: '512x512',
            type: 'image/jpg',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true, // This exposes the project on your local network
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173 // Forces the HMR to use the correct port
    }
  }
})
