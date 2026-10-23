import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const webSrc = `${webRoot}src`

/**
 * Deux alias :
 *   · `~/` : le code du site ;
 *   · `@/` : le code métier de l'app mobile (format des logs, PID,
 *     épreuves), recopié tel quel dans src/shared/ par `npm run sync:mobile`.
 *     Un log s'y décode exactement comme dans l'app.
 *
 * `/auth` est relayé vers Neon Auth : le cookie de session devient ainsi un
 * cookie du site lui-même, que les navigateurs ne bloquent pas comme un
 * cookie tiers. En production, c'est vercel.json qui fait ce relais.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, webRoot, '')
  const auth = env.TARMAC_AUTH_URL ? new URL(env.TARMAC_AUTH_URL) : null

  return {
    root: webRoot,
    envDir: webRoot,
    plugins: [react()],
    // Une seule copie de React et de three, pré-empaquetées ensemble : sans ça,
    // la découverte tardive de three.js (page chargée à la demande) fait
    // coexister deux React en dev.
    optimizeDeps: { include: ['three', '@react-three/fiber', '@react-three/drei'] },
    resolve: {
      dedupe: ['react', 'react-dom', 'three'],
      alias: [
        { find: /^~\//, replacement: `${webSrc}/` },
        { find: /^@\//, replacement: `${webSrc}/shared/` },
      ],
    },
    server: {
      port: 5173,
      proxy: auth
        ? {
            '/auth': {
              target: auth.origin,
              changeOrigin: true,
              cookieDomainRewrite: '',
              rewrite: (p) => p.replace(/^\/auth/, auth.pathname.replace(/\/+$/, '')),
            },
          }
        : undefined,
    },
  }
})
