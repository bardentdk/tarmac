# Tarmac — site web

Le site de l'app Tarmac : vitrine et téléchargement, espace pilote (logs,
runs, garage, compte) et espace mappeur (logs reçus, dossiers, clients).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Ce qu'il faut savoir

- **Code partagé avec l'app.** L'alias `@/` pointe sur `src/shared/` : le
  format des logs, les PID et les épreuves, recopiés tels quels de l'app
  mobile pour que la branche `web` se construise seule (Vercel). Ne pas les
  modifier ici : modifier l'app, puis `npm run sync:mobile` (avec le dossier
  `Tarmac` à côté). `npm run sync:mobile -- --check` signale une divergence.
  Le code du site utilise l'alias `~/`.
- **Base.** Même Data API Neon et même RLS que l'app. L'espace mappeur
  demande la migration `Tarmac/db/migrations/0007_mappeurs.sql`.
- **Auth.** Les appels Neon Auth passent par `/auth`, relayé par le serveur
  de dev Vite (voir `vite.config.ts`) et, en production, par `vercel.json` :
  le cookie de session est ainsi un cookie du site, pas un cookie tiers. Le
  domaine du site doit figurer dans les domaines de confiance de Neon Auth.
- **Vercel.** Déclarer les variables `VITE_*` de `.env.example` dans le projet
  Vercel (le `.env` n'est pas versionné).
- **Variables.** `.env` ne contient que des valeurs publiques (`VITE_*`,
  embarquées dans le JS) et `TARMAC_AUTH_URL`, lue par le serveur de dev.
  Aucun secret (DATABASE_URL, Resend, Cloudflare) n'a sa place ici.
- **Boîtier 3D (accueil).** `public/models/tarmac-box.glb` est le modèle de
  `../tarmac-box/` compressé en Meshopt (`npx @gltf-transform/cli optimize …
  --compress meshopt`). La scène (`src/ui/BoxScene.tsx`, three.js via
  @react-three/fiber et drei) est chargée à la demande ; l'image
  `tarmac-box-poster.png` s'affiche pendant le chargement ou sans WebGL.
