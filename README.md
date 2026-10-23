# Tarmac — site web

Le site de l'app Tarmac : vitrine et téléchargement, espace pilote (logs,
runs, garage, compte) et espace mappeur (logs reçus, dossiers, clients).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Ce qu'il faut savoir

- **Code partagé avec l'app.** L'alias `@/` pointe sur `../Tarmac/src` : le
  format des logs, les PID, les épreuves sont lus dans les fichiers de l'app
  mobile, sans copie. Le dossier `Tarmac` doit donc être à côté de celui-ci
  (en local comme en CI). Le code du site utilise l'alias `~/`.
- **Base.** Même Data API Neon et même RLS que l'app. L'espace mappeur
  demande la migration `Tarmac/db/migrations/0007_mappeurs.sql`.
- **Auth.** Les appels Neon Auth passent par `/auth`, relayé par le serveur
  de dev Vite (voir `vite.config.ts`) : le cookie de session est ainsi un
  cookie du site, pas un cookie tiers. En production, il faudra le même relais
  (fonction Cloudflare Pages par exemple) et ajouter le domaine du site aux
  domaines de confiance de Neon Auth.
- **Variables.** `.env` ne contient que des valeurs publiques (`VITE_*`,
  embarquées dans le JS) et `TARMAC_AUTH_URL`, lue par le serveur de dev.
  Aucun secret (DATABASE_URL, Resend, Cloudflare) n'a sa place ici.
- **Boîtier 3D (accueil).** `public/models/tarmac-box.glb` est le modèle de
  `../tarmac-box/` compressé en Meshopt (`npx @gltf-transform/cli optimize …
  --compress meshopt`). La scène (`src/ui/BoxScene.tsx`, three.js via
  @react-three/fiber et drei) est chargée à la demande ; l'image
  `tarmac-box-poster.png` s'affiche pendant le chargement ou sans WebGL.
