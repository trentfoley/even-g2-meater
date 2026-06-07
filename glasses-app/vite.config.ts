import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so assets resolve correctly inside the packaged .ehpk.
  base: './',
  server: {
    host: true, // expose on LAN so the Even app can load it via the QR URL
    port: 5173,
  },
})
