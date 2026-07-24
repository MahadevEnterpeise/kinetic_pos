import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // This exposes the project on your local network
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173 // Forces the HMR to use the correct port
    }
  }
})
