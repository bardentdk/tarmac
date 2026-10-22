# Prompt — App mobile Tarmac (React Native) · Connexion OBD multi-boîtiers fiable

> **Comment utiliser ce fichier** : colle-le en entier comme premier message à ton agent de code (Claude Code, Cursor…), ou place-le à la racine du projet sous le nom `PROMPT.md` et demande à l'agent de le suivre. Les sections sont dans l'ordre où l'agent doit travailler.

---

## 1. Ton rôle

Tu es un développeur mobile senior spécialisé en **React Native + Bluetooth (BLE et Classic) + diagnostic automobile OBD-II / ELM327**. Tu travailles avec un développeur qui vient du web (React, PHP) et qui apprend le mobile et l'embarqué.

**Règles de travail obligatoires :**

1. **Code écrit comme par un humain, très commenté en français** : chaque fichier commence par un commentaire qui explique son rôle avec une analogie simple, chaque fonction non triviale a un commentaire « pourquoi » (pas seulement « quoi »).
2. **Toutes les étapes, de l'installation jusqu'au test** : pour chaque jalon, donne les commandes exactes à taper, ce qu'on doit voir à l'écran, et comment vérifier que ça marche.
3. **Un jalon à la fois.** Tu ne passes au jalon suivant que lorsque les critères de validation du jalon courant sont remplis. À la fin de chaque jalon, fais un résumé de ce qui a été fait et de ce qu'il faut tester sur le vrai téléphone.
4. **Pas de dépendance ajoutée sans la justifier** en une phrase. Utilise les **dernières versions stables** compatibles entre elles et avec le SDK Expo choisi ; vérifie la compatibilité avec la New Architecture de React Native. Si une lib n'est pas compatible, dis-le et propose une alternative au lieu de bricoler.
5. **Ne jamais inventer** une valeur technique (UUID, identifiant UDS, formule) : si tu n'es pas sûr, mets-la dans un fichier de configuration avec un commentaire `// À VÉRIFIER` et signale-la.
6. TypeScript strict partout.

---

## 2. Le contexte du projet

**Tarmac** est une app de **mesure de performance (drag race) et de santé moteur**, concurrente de Draggy. Elle se connecte à la prise OBD de la voiture via un boîtier :

- **Aujourd'hui** : des boîtiers **ELM327 du commerce**, très souvent des **clones chinois** (« ELM327 v1.5 », « v2.1 ») au comportement imprévisible.
- **Demain** : le boîtier maison **Tarmac Box** (ESP32-S3 + transceiver CAN, en BLE), plus rapide. L'app doit être **compatible avec tous les boîtiers** mais **meilleure avec la Tarmac Box**.

**Voiture de test** : Seat Ibiza 6F FR 1.5 TSI DSG 2021 (groupe VW, CAN 11 bits 500 kbit/s, calculateur moteur Bosch MG1, passerelle/gateway devant la prise OBD).

**Pourquoi React Native** : une première version en NativePHP n'arrivait à se connecter au boîtier qu'**une fois sur 15**. L'objectif numéro 1 de ce projet est donc une **connexion fiable, qui ne décroche pas**, même avec un clone bas de gamme.

---

## 3. Périmètre

### Phase 1 (ce prompt) — le socle de connexion

1. Trouver et se connecter à un boîtier : **ELM327 BLE**, **ELM327 Bluetooth Classic** (Android uniquement), **ELM327 Wi-Fi**, et un **boîtier simulé** pour développer sans voiture.
2. Initialiser l'ELM327 de façon robuste, **même sur un clone**.
3. Lire des données moteur en direct (régime, vitesse, températures, charge, avance, pression d'admission, tension batterie…) le plus vite possible.
4. **Ne jamais décrocher** : maintien de connexion, reconnexion automatique, fonctionnement écran éteint / app en arrière-plan.
5. Une **console de diagnostic** qui affiche et exporte tout ce qui est envoyé et reçu (indispensable pour déboguer les clones).

### Phases suivantes (à ne PAS coder maintenant, mais l'architecture doit les permettre)

- Lecture et effacement des codes défaut, expliqués en langage simple.
- Bilans de santé au quotidien.
- Chronos multi-modes (0-100, 100-200, 402 m…) avec le **GPS du téléphone** + la vitesse OBD, et analyse « pourquoi ce run est lent ».
- Estimation de puissance (dyno virtuel).
- Rapport partageable au mappeur / mécanicien.
- Compte client avec login et abonnement.
- Protocole binaire rapide de la Tarmac Box.

---

## 4. Stack imposée

| Besoin | Choix | Pourquoi |
|---|---|---|
| Base | **Expo (SDK stable le plus récent) + TypeScript**, en **development build** (`expo-dev-client`, `npx expo prebuild`) | Expo Go ne peut pas charger les modules Bluetooth natifs. |
| Navigation | `expo-router` | Navigation par fichiers, simple à comprendre pour un dev web. |
| BLE (iOS + Android) | `react-native-ble-plx` (+ son plugin Expo) | Lib BLE la plus éprouvée. |
| Bluetooth Classic / SPP (Android) | `react-native-bluetooth-classic` | Beaucoup de clones ELM327 sont en Bluetooth Classic. iOS ne permet pas le Classic sans certification Apple MFi : **ces boîtiers ne marcheront jamais sur iPhone**, l'app doit l'expliquer à l'utilisateur. |
| Wi-Fi | `react-native-tcp-socket` | ELM327 Wi-Fi = socket TCP, en général `192.168.0.10:35000`. |
| État global | `zustand` | Simple, et permet de lire l'état **hors de React** (important pour la performance). |
| Service au premier plan (Android) | `@notifee/react-native` (foreground service) | Empêche Android de tuer la connexion quand l'écran s'éteint. |
| Écran allumé pendant un run | `expo-keep-awake` | — |
| GPS (plus tard) | `expo-location` | — |
| Stockage local | `react-native-mmkv` | Rapide, synchrone (dernier boîtier utilisé, réglages). |
| Tests | `jest` + `@testing-library/react-native` | — |

---

## 5. Architecture

Pense l'app comme une **chaîne en 4 étages**. Chaque étage ne parle qu'à ses voisins, comme dans une cuisine : le livreur (transport) apporte les ingrédients, le traducteur (protocole ELM327) comprend la commande, le chef (planificateur) décide quoi cuisiner en priorité, le serveur (UI) affiche le résultat.

```
src/
  transport/            # Étage 1 — "le livreur" : transporte des octets, ne comprend rien
    types.ts            # Interface ObdTransport commune
    BleTransport.ts     # ELM327 BLE (+ futur Tarmac Box)
    ClassicTransport.ts # ELM327 Bluetooth Classic (Android)
    WifiTransport.ts    # ELM327 Wi-Fi (TCP)
    MockTransport.ts    # Faux ELM327 en mémoire, pour développer sans voiture
    bleProfiles.ts      # Table des profils BLE connus (UUID)
  elm/                  # Étage 2 — "le traducteur"
    ElmProtocol.ts      # File de commandes, attente du prompt '>', timeouts
    ElmInit.ts          # Séquence d'initialisation robuste + détection des capacités du clone
    sanitize.ts         # Nettoyage des réponses (écho, SEARCHING..., espaces…)
    capabilities.ts     # Ce que CE boîtier sait faire (multi-PID, ATST, ATAT…)
  obd/                  # Étage 3 — "le chef"
    pids.ts             # Définition + formules des PID standards
    decode.ts           # Décodage des réponses mode 01 / 03 / 09
    PollingScheduler.ts # Boucle d'interrogation avec priorités
    safety.ts           # Liste blanche des services autorisés
  connection/
    ConnectionManager.ts# Machine à états : scan → connexion → init → prêt → reconnexion
    keepAlive.ts
    foregroundService.ts
  store/                # Données live hors React (ring buffer) + état de connexion
  app/                  # Écrans (expo-router)
  ui/                   # Composants + tokens de la charte
  debug/
    ConsoleLog.ts       # Journal TX/RX horodaté, exportable
```

### 5.1 Étage 1 — L'interface transport commune

Tous les boîtiers implémentent **exactement** cette interface. Le reste de l'app ne sait jamais si on parle en BLE, en Classic ou en Wi-Fi.

```ts
// src/transport/types.ts

/** Les états possibles d'un "tuyau" vers le boîtier. */
export type TransportState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'error';

/** Un boîtier trouvé pendant la recherche. */
export interface DiscoveredDevice {
  id: string;                 // adresse MAC (Android) ou UUID (iOS) ou "ip:port"
  name: string | null;
  kind: 'ble' | 'classic' | 'wifi' | 'mock';
  rssi?: number;              // force du signal (BLE)
  likelyObd: boolean;         // le nom ressemble à un boîtier OBD ("OBD", "ELM", "Vgate", "Veepeak", "Tarmac"…)
}

/** Le contrat que chaque transport doit respecter. */
export interface ObdTransport {
  readonly kind: DiscoveredDevice['kind'];
  readonly state: TransportState;

  connect(deviceId: string, opts?: { timeoutMs?: number }): Promise<void>;
  disconnect(): Promise<void>;

  /** Envoie des octets bruts. Le transport découpe lui-même selon le MTU. */
  write(data: Uint8Array): Promise<void>;

  /** Reçoit des octets bruts, morceau par morceau (une réponse peut arriver en plusieurs morceaux). */
  onData(listener: (chunk: Uint8Array) => void): () => void;

  /** Prévient quand l'état change (surtout : déconnexion inattendue). */
  onStateChange(listener: (state: TransportState, error?: Error) => void): () => void;
}
```

### 5.2 Profils BLE connus des ELM327

Les ELM327 BLE n'utilisent pas tous les mêmes « portes » (services et caractéristiques). Mets ces profils dans `bleProfiles.ts` et essaie-les dans l'ordre :

| Profil | Service | Notification (lecture) | Écriture |
|---|---|---|---|
| HM-10 / la plupart des clones | `FFE0` | `FFE1` | `FFE1` (même caractéristique) |
| Variante FFF0 | `FFF0` | `FFF1` | `FFF2` |
| Variante 18F0 (certains Vgate) | `18F0` | `2AF0` | `2AF1` |
| Nordic UART (NUS) — aussi utilisé par la future Tarmac Box | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` | `6E400003-…` | `6E400002-…` |

**Si aucun profil ne correspond : détection automatique.** Parcours tous les services découverts et choisis une caractéristique avec la propriété `notify` (ou `indicate`) et une avec `write` ou `writeWithoutResponse`. Enregistre le couple trouvé pour ce boîtier (MMKV) pour ne pas refaire la recherche à chaque connexion.

**Règles BLE :**
- Après la connexion : `discoverAllServicesAndCharacteristics()`, **puis** activer les notifications, **puis seulement** envoyer la première commande. (C'est l'ordre le plus souvent raté, et il donne une connexion « qui marche une fois sur N ».)
- Android : demander un MTU plus grand (`requestMTU(185)`), sans échouer si le boîtier refuse. iOS négocie tout seul.
- Découper chaque écriture à `MTU - 3` octets (20 octets si le MTU est inconnu).
- Utiliser `writeWithoutResponse` si la caractéristique le permet, sinon `writeWithResponse`. Certains clones n'acceptent que l'un des deux : détecter via les propriétés.
- Toujours `connectToDevice(id, { autoConnect: false, timeout })` pour la connexion initiale (plus rapide et plus prévisible).
- Ne **jamais** scanner pendant qu'on se connecte : arrêter le scan d'abord.

### 5.3 Bluetooth Classic (Android)

- Lister d'abord les **appareils déjà appairés** (l'utilisateur appaire le boîtier une fois dans les réglages Android, code PIN `1234`, `0000` ou `6789`). C'est beaucoup plus fiable qu'une recherche dans l'app. Prévoir un écran d'aide qui l'explique.
- **Annuler toute découverte Bluetooth en cours avant de se connecter** (sinon la connexion RFCOMM échoue souvent sur Android).
- Si la connexion sécurisée échoue, réessayer en mode non sécurisé (certains clones ne supportent que celui-là).
- Lire les données en flux brut et laisser l'étage ELM327 gérer le découpage sur `>`.

### 5.4 Wi-Fi

- Socket TCP vers `192.168.0.10:35000` par défaut (configurable).
- Prévenir l'utilisateur que le téléphone n'aura plus Internet sur ce Wi-Fi.
- iOS : ajouter les clés de réseau local nécessaires dans `Info.plist` (via `app.json`).

### 5.5 Étage 2 — Le protocole ELM327 (le cœur de la fiabilité)

L'ELM327 est un **guichet à une seule file** : on pose une question, on attend le caractère `>` (« j'ai fini, au suivant »), puis seulement on pose la suivante. Envoyer deux commandes en même temps est **la cause n°1 des réponses mélangées et des boîtiers qui se bloquent**.

**`ElmProtocol` doit :**
1. Gérer une **file d'attente stricte** : une seule commande en vol à la fois.
2. Ajouter `\r` à chaque commande, en ASCII.
3. **Accumuler** les morceaux reçus dans un tampon jusqu'à voir `>` (en BLE, une réponse arrive souvent en 2 à 5 notifications).
4. Avoir un **timeout par commande** (par défaut 2 s, 5 s pour `ATZ` et pour la première requête OBD qui déclenche la recherche de protocole). En cas de timeout : vider le tampon, envoyer un `\r` seul pour « débloquer » le boîtier, attendre `>`, puis réessayer une fois.
5. **Nettoyer** chaque réponse : retirer l'écho de la commande, les `\r`, `\n`, espaces, `SEARCHING...`, `BUS INIT: ...OK`, et le `>` final.
6. Reconnaître les réponses d'erreur et les transformer en erreurs typées : `NO DATA`, `?` (commande inconnue), `UNABLE TO CONNECT`, `CAN ERROR`, `BUS ERROR`, `BUFFER FULL`, `STOPPED`, `ERROR`.
7. Gérer les **réponses multi-trames** (VIN, liste de codes défaut) au format `0:… 1:… 2:…` produit par l'ELM327.
8. Tout journaliser dans la console de diagnostic (TX, RX brut, durée de chaque commande).

**Séquence d'initialisation (`ElmInit`)**, chaque étape avec gestion d'erreur :

| Étape | Commande | Rôle | Si le clone répond `?` |
|---|---|---|---|
| 1 | `\r` puis attendre `>` (vider tout ce qui arrive) | Réveiller le boîtier et purger les déchets | — |
| 2 | `ATZ` (attendre jusqu'à 5 s) | Remise à zéro | Si `ATZ` fait décrocher le boîtier (observé sur certains clones), utiliser `ATD` puis `ATWS` à la place |
| 3 | `ATE0` | Pas d'écho | Bloquant : échec de l'init |
| 4 | `ATL0` | Pas de saut de ligne | Ignorer |
| 5 | `ATS0` | Pas d'espaces (réponses plus courtes, donc plus rapides) | Ignorer, le nettoyage gère les espaces |
| 6 | `ATH0` | Pas d'en-têtes | Ignorer |
| 7 | `ATI` et `AT@1` | Lire la version annoncée (les clones mentent souvent : « v1.5 », « v2.1 ») | Ignorer |
| 8 | `ATSP6` (ou `ATSP0` en automatique si l'utilisateur choisit « autre voiture ») | ISO 15765-4 CAN 11 bits 500 kbit/s : le protocole des VW récentes, évite une recherche lente | Revenir à `ATSP0` |
| 9 | `ATAT1` | Délai adaptatif : le boîtier attend moins longtemps les réponses | Marquer la capacité `adaptiveTiming = false` |
| 10 | `ATSH7E0` | Viser directement le calculateur moteur, au lieu de questionner tous les calculateurs | Marquer `headerSet = false` |
| 11 | `0100` | Premier vrai échange OBD + liste des PID supportés | Si `UNABLE TO CONNECT` : contact mis ? réessayer avec `ATSP0` |
| 12 | `ATRV` | Tension batterie lue par le boîtier | Ignorer |

**Détection des capacités du clone (`capabilities.ts`)**, après l'init. Teste et mémorise (par boîtier) :
- **Multi-PID** : envoyer `010C0D05` (3 PID d'un coup). Si la réponse contient les 3 valeurs → `multiPid = true` (jusqu'à 6 PID par requête en CAN).
- **Suffixe « nombre de réponses »** : envoyer `010C1`. Si on reçoit une réponse valide plus vite qu'avec `010C` → `responseCountHint = true`. Ce suffixe dit au boîtier « n'attends pas d'autres calculateurs », ce qui fait gagner beaucoup de temps.
- **ATST** (réglage du timeout) supporté ou non.
- Les PID supportés (`0100`, `0120`, `0140`, `0160`, masques de bits).

Toutes les optimisations sont **activées seulement si le test réussit**. Sinon, repli sur le mode le plus simple. Un clone lent mais stable vaut mieux qu'un clone rapide qui plante.

### 5.6 Étage 3 — Le planificateur d'interrogation

- **Deux vitesses** : PID « rapides » interrogés à chaque tour (régime `0C`, vitesse `0D`, pression admission `0B`, avance `0E`, papillon `11`, charge `04`), PID « lents » une fois par seconde (températures `05`, `0F`, `5C`, pression atmo `33`, tension `42`).
- **Grouper** les PID rapides en une seule requête quand `multiPid = true`.
- La boucle tourne **en continu, indépendamment de l'interface**. Elle écrit dans un **ring buffer** horodaté (timestamp de réception, en millisecondes).
- Mesurer et afficher le **débit réel** (requêtes/s et valeurs/s) dans la console de diagnostic.
- Prévoir la place pour les requêtes constructeur UDS (service `22`, identifiants dans un fichier de config `vagDids.ts`, tous marqués `// À VÉRIFIER`).

**Formules des PID standards (mode 01) :**

| PID | Donnée | Formule | Unité |
|---|---|---|---|
| `04` | Charge moteur | A × 100 / 255 | % |
| `05` | Liquide de refroidissement | A − 40 | °C |
| `0B` | Pression admission (MAP) | A | kPa |
| `0C` | Régime | (256A + B) / 4 | tr/min |
| `0D` | Vitesse | A | km/h |
| `0E` | Avance à l'allumage | A / 2 − 64 | ° |
| `0F` | Air d'admission | A − 40 | °C |
| `10` | Débit d'air (MAF) | (256A + B) / 100 | g/s |
| `11` | Papillon | A × 100 / 255 | % |
| `33` | Pression atmosphérique | A | kPa |
| `42` | Tension calculateur | (256A + B) / 1000 | V |
| `5C` | Huile moteur | A − 40 | °C (souvent non supporté) |

Pression de suralimentation affichée = MAP − pression atmosphérique (en bar : ÷ 100).

### 5.7 Règles de sécurité (non négociables)

`safety.ts` contient une **liste blanche**. Tout le reste est refusé avant même d'atteindre le boîtier :
- Autorisés : commandes `AT…` de configuration, services OBD `01`, `02`, `03`, `07`, `09`, `0A`, et UDS `22` (lecture seule).
- `04` (effacement des codes défaut) : autorisé **uniquement** depuis un écran dédié, après confirmation explicite, moteur coupé, contact mis. (Phase suivante, mais la règle existe dès maintenant.)
- **Interdits, toujours** : `10` (changement de session), `11` (reset calculateur), `2E` (écriture), `27` (accès sécurisé), `31` (routines), `34`/`36`/`37` (programmation), `ATMA` (écoute du bus : sature les clones avec `BUFFER FULL`).

---

## 6. Ne jamais décrocher : la stratégie de connexion

### 6.1 Machine à états (`ConnectionManager`)

```
idle → scanning → connecting → discovering → initializing → ready ⇄ polling
                       ↑                                         │
                       └──────── reconnecting (backoff) ←────────┘ (déconnexion inattendue)
```

- Une seule instance, en dehors de React (singleton), pour qu'un changement d'écran ou un re-render **ne coupe jamais** la connexion.
- Chaque transition est journalisée.
- Aucune action utilisateur ne peut lancer deux connexions en parallèle (verrou).

### 6.2 Reconnexion automatique

- Sur déconnexion **non demandée par l'utilisateur** : passer en `reconnecting`, réessayer avec un délai croissant (0,5 s → 1 s → 2 s → 4 s → 8 s, plafonné à 10 s), **sans limite** tant que l'utilisateur n'a pas appuyé sur « Déconnecter ».
- Après chaque reconnexion : **refaire l'init complète** (le boîtier a pu redémarrer), puis reprendre l'interrogation là où elle s'était arrêtée.
- Mémoriser le dernier boîtier (MMKV) et s'y reconnecter automatiquement à l'ouverture de l'app.
- L'interface affiche un état clair : « Connecté », « Reconnexion… (essai 3) », « Boîtier introuvable : est-il branché et le contact mis ? ».

### 6.3 Maintien de connexion

- Si aucune commande n'est partie depuis 2 s (app ouverte mais pas d'interrogation), envoyer un **battement de cœur** léger (`ATRV`). Certains clones se mettent en veille ou coupent le lien quand ils ne reçoivent plus rien.
- Ne jamais laisser la file de commandes bloquée : un **chien de garde** vérifie toutes les 5 s qu'une réponse est arrivée récemment. Sinon : `\r`, purge, et si ça ne suffit pas, reconnexion propre.

### 6.4 Écran éteint et arrière-plan

- **Android** : service au premier plan (Notifee) avec une notification « Tarmac connecté au boîtier », type `connectedDevice` (permission `FOREGROUND_SERVICE_CONNECTED_DEVICE` requise sur Android 14+). Il démarre quand la connexion est prête et s'arrête à la déconnexion volontaire.
- **iOS** : `UIBackgroundModes` → `bluetooth-central` (BLE uniquement).
- Pendant un run ou un écran de données live : `expo-keep-awake`.

### 6.5 Permissions (à déclarer dans `app.json` / plugins)

- Android 12+ : `BLUETOOTH_SCAN` (avec `neverForLocation`), `BLUETOOTH_CONNECT`. Android 11 et moins : `ACCESS_FINE_LOCATION`, `BLUETOOTH`, `BLUETOOTH_ADMIN`. Plus `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `POST_NOTIFICATIONS`.
- iOS : `NSBluetoothAlwaysUsageDescription` (texte en français qui explique pourquoi), `NSLocalNetworkUsageDescription` pour le Wi-Fi.
- Demander les permissions **au moment où elles servent**, avec un écran qui explique pourquoi, et gérer proprement le refus (bouton vers les réglages).

---

## 7. Performance de l'interface

- Les données live **ne passent pas par le state React** à chaque valeur. Elles vont dans le ring buffer ; l'interface les lit **10 à 20 fois par seconde** maximum (abonnement throttlé, `useSyncExternalStore` ou sélecteurs zustand).
- Aucun calcul lourd dans les composants. Le décodage se fait dans l'étage 3.
- Viser 60 fps sur l'écran de données live, même avec l'interrogation au maximum.

---

## 8. Écrans de la phase 1

Reprendre la charte graphique Tarmac (thème sombre par défaut) :

```ts
// src/ui/tokens.ts
export const colors = {
  bg: '#0E0F11',        // Asphalte : fond
  surface: '#17191D',   // Carbone : cartes
  border: '#262930',    // Graphite
  border2: '#33363E',
  text: '#F2F2F0',      // Craie
  text2: '#A3A7AE',     // Gris piste
  ok: '#C6F432',        // Feu vert : OK, prêt, action principale
  okBg: '#1A2310',
  warn: '#FF8A3D',      // Signal : attention
  warnText: '#FF9F5C',
  warnBg: '#2A1A0E',
  info: '#5AA9FF',      // Télémétrie
  danger: '#FF4D3D',    // Critique : danger moteur uniquement
  dangerBg: '#2A0F0C',
};
export const fonts = { display: 'BarlowCondensed', body: 'Barlow' }; // via expo-font / Google Fonts
export const radius = { sm: 10, md: 16, lg: 22 };
export const tap = { min: 44, main: 60 }; // cibles tactiles
```

Règles UX : un seul bouton vert (action principale) par écran, cibles tactiles ≥ 44 px, chiffres en Barlow Condensed avec chiffres tabulaires, un statut toujours doublé d'un texte ou d'une icône (jamais la couleur seule).

1. **Connexion** : onglets « Bluetooth (BLE) », « Bluetooth classique » (masqué sur iOS, avec explication), « Wi-Fi », « Démo (simulé) ». Liste des boîtiers trouvés, ceux qui ressemblent à un boîtier OBD en premier. Bouton « Se connecter ». Écran d'aide : « Mon boîtier n'apparaît pas ».
2. **Données live** : grandes tuiles régime, vitesse, boost, températures, tension. Indicateur de connexion permanent. Débit affiché (valeurs/s).
3. **Console de diagnostic** : journal TX/RX horodaté, capacités détectées du boîtier, version annoncée, protocole, débit. Boutons « Copier » et « Exporter (.txt) » (via le partage natif).
4. **Réglages** : dernier boîtier, reconnexion auto (on/off), protocole (auto / VW CAN 500k), liste des PID à interroger.

---

## 9. Tests et simulateur

1. **`MockTransport`** : un faux ELM327 en mémoire qui répond comme un vrai (avec `>`, échos, `SEARCHING...`, réponses découpées en morceaux de 20 octets, latence aléatoire de 20 à 80 ms). Il doit pouvoir simuler **un clone pénible** : commandes `AT` non supportées, `NO DATA` aléatoires, déconnexion brutale toutes les N secondes.
2. **Tests unitaires** (Jest) : nettoyage des réponses, décodage de chaque PID, réponses multi-trames, file de commandes (jamais deux commandes en vol), machine à états de reconnexion.
3. **Tests sur le vrai boîtier** avec un **émulateur ELM327 sur PC** (par exemple le projet open source « ELM327-emulator », en mode réseau) pour tester le transport Wi-Fi sans voiture.
4. **Rejouer des journaux réels** : un journal exporté depuis la console doit pouvoir être rejoué dans le `MockTransport`.

---

## 10. Critères d'acceptation de la phase 1

Le socle est validé quand **tous** ces points passent sur un vrai téléphone Android **et** un iPhone (BLE) :

- [ ] **50 cycles** connexion → init → lecture → déconnexion d'affilée avec un ELM327 clone : au moins **49 réussis**.
- [ ] **30 minutes** d'interrogation continue, moteur tournant, **sans aucune déconnexion** ni blocage de la file.
- [ ] Boîtier débranché puis rebranché : **reconnexion automatique en moins de 10 s**, sans action de l'utilisateur, et reprise des données.
- [ ] Écran éteint 5 minutes (Android et iOS en BLE) : la connexion tient, les données continuent d'arriver.
- [ ] Le même code fonctionne avec un ELM327 BLE, un ELM327 Classic (Android) et le simulateur.
- [ ] Le débit réel est affiché ; les optimisations (multi-PID, suffixe `1`) ne sont activées que si le boîtier les supporte.
- [ ] Aucune commande hors de la liste blanche ne peut partir vers le boîtier (test unitaire).
- [ ] L'écran de données live reste fluide (pas de saccade visible) au débit maximum.

---

## 11. Jalons (dans cet ordre)

1. **Projet** : création Expo + TypeScript + dev build, installation des libs, permissions, build sur un vrai téléphone Android (`npx expo run:android`) puis iOS (`npx expo run:ios`, nécessite un Mac avec Xcode). Validation : l'app vide s'ouvre sur les deux téléphones.
2. **Simulateur** : `MockTransport` + `ElmProtocol` + `ElmInit` + tests unitaires. Validation : tous les tests passent, l'écran live affiche des données simulées.
3. **BLE** : `BleTransport` avec profils + détection automatique. Validation : connexion et lecture `ATRV` sur un vrai ELM327 BLE.
4. **Classic + Wi-Fi** : les deux autres transports. Validation : même écran, autre boîtier.
5. **Fiabilité** : machine à états, reconnexion, maintien de connexion, chien de garde, service au premier plan. Validation : les critères d'acceptation de la section 10.
6. **Performance** : planificateur à deux vitesses, multi-PID, ring buffer, mesure de débit. Validation : débit affiché, interface fluide.
7. **Console de diagnostic** et export des journaux.

**À la fin de chaque jalon** : liste des fichiers créés, commandes pour lancer et tester, ce qu'on doit observer, et les points à vérifier par moi sur le vrai boîtier.

---

## 12. Ce qu'il faut me demander avant de commencer

Pose-moi ces questions (une seule fois, toutes ensemble) si les réponses ne sont pas déjà dans ce fichier :

1. Mon ELM327 est-il **BLE** (il n'apparaît pas dans les réglages Bluetooth « classiques » de l'iPhone, seulement dans les apps) ou **Bluetooth Classic** (il demande un code PIN dans les réglages Android) ? Son nom exact quand on le scanne ?
2. Quels téléphones de test : modèle et version d'Android / iOS ?
3. Est-ce que je veux publier sur l'App Store / le Play Store rapidement (impact : EAS Build, comptes développeur) ?
