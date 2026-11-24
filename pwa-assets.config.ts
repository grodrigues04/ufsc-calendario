import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// The logo already has its own dark background: maskable/apple icons are full-bleed.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#111113' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#111113' } },
  },
  images: ['public/logo.svg'],
})
