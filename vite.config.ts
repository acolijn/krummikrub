import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` controls the public path prefix injected into built asset URLs.
// Set BASE_PATH=/krummikrub/ at build time when deploying behind a subpath
// reverse-proxy. Defaults to '/' for local dev and root-domain deployments.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
})
