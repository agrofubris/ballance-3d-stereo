import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import {ivpAssets} from './scripts/ivp-assets.ts'
import {localOriginalAssets} from './scripts/local-original-assets.ts'

// Development serves the local pack directly; the deploy script stages it after building.
export default defineConfig(async ({command})=>({
  plugins: [react(), await ivpAssets(command), localOriginalAssets(), cloudflare()],
}))
