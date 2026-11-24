import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Serves the Vercel functions in api/ during `vite dev` (same Web Request/Response handlers). */
function apiRoutes(): Plugin {
  return {
    name: 'api-routes',
    apply: 'serve',
    configureServer(server) {
      // The functions read DATABASE_URL and NOTES_SECRET from process.env, like on Vercel.
      for (const [key, value] of Object.entries(loadEnv(server.config.mode, process.cwd(), ''))) {
        process.env[key] ??= value
      }
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const match = url.pathname.match(/^\/api\/([\w-]+)$/)
        if (!match) return next()
        try {
          const module = await server.ssrLoadModule(`/api/${match[1]}.ts`)
          const handler = module[request.method ?? 'GET'] as ((request: Request) => Promise<Response>) | undefined
          if (!handler) {
            response.statusCode = 405
            return response.end()
          }
          const chunks: Buffer[] = []
          for await (const chunk of request) chunks.push(chunk as Buffer)
          const result = await handler(
            new Request(url, {
              method: request.method,
              headers: request.headers as Record<string, string>,
              body: chunks.length ? Buffer.concat(chunks) : undefined,
            }),
          )
          response.statusCode = result.status
          result.headers.forEach((value, key) => response.setHeader(key, value))
          if (result.body) {
            for await (const chunk of result.body) response.write(chunk)
          }
          response.end()
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiRoutes(),
    VitePWA({
      // Own service worker (src/sw.ts): app shell cache plus background checks for news.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Chamada — presença e prazos da UFSC',
        short_name: 'Chamada',
        description: 'Presença, aulas do dia e prazos do Moodle UFSC, num app só.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#f9f9fb',
        background_color: '#f9f9fb',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Portuguese only needs the latin subset of the font.
        globIgnores: ['**/geist-{cyrillic,cyrillic-ext,vietnamese,latin-ext}-*.woff2'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, './shared'),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change rarely: separate chunks stay cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
})
