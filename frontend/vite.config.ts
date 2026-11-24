import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Restaurant Operations',
        short_name: 'RestaurantOS',
        description: 'Secure multi-branch restaurant operations platform',
        theme_color: '#ea580c',
        background_color: '#fffaf7',
        display: 'standalone',
        icons: [{ src: '/vite.svg', sizes: '192x192', type: 'image/svg+xml' }],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
})
