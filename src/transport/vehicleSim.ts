/**
 * vehicleSim.ts — une Seat Ibiza FR 1.5 TSI en boîte.
 *
 * Pourquoi simuler une voiture entière alors qu'on développe une app de
 * chrono ? Parce que sans voiture sous la main, on ne peut rien tester : ni la
 * détection de départ, ni le patinage, ni la montée en température, ni le
 * cliquetis. Un `MockTransport` qui renverrait des valeurs au hasard
 * validerait du code qui plante dès qu'on branche un vrai boîtier.
 *
 * Le modèle est volontairement simple et physique :
 *   force du moteur − frottements = masse × accélération
 * C'est le cours de seconde, et ça suffit à produire un 0-100 crédible.
 *
 * ⚠️ Les valeurs marquées `À VÉRIFIER` viennent de fiches techniques publiques
 * et non d'une mesure sur la voiture d'essai. Elles n'affectent QUE le
 * simulateur, jamais une mesure réelle.
 */

/** Profil mécanique d'un véhicule simulé. */
export interface VehicleSpec {
  label: string;
  /** Masse en ordre de marche, conducteur inclus (kg). */
  massKg: number;
  /** Rapports de boîte, du 1er au dernier. */
  gearRatios: number[];
  /** Démultiplication finale par rapport (DQ200 : deux trains différents). */
  finalDrives: number[];
  /** Rayon de roue sous charge (m). */
  wheelRadiusM: number;
  /** Coefficient de traînée × surface frontale (m²). */
  cdA: number;
  /** Coefficient de résistance au roulement. */
  crr: number;
  /** Rendement de transmission. */
  drivelineEff: number;
  /** Couple moteur en Nm, par palier de régime. */
  torqueCurve: { rpm: number; nm: number }[];
  /** Régime de coupure. */
  rpmLimit: number;
  rpmIdle: number;
  /** Durée d'un passage de rapport (s). Une DSG coupe très peu. */
  shiftTimeS: number;
  /** Adhérence disponible (coefficient pneu/sol). */
  grip: number;
  /** Part du poids sur les roues motrices (traction avant ≈ 0,6). */
  driveWeightShare: number;
}

/** Ibiza 6F FR 1.5 TSI EVO DSG7, cartographie Stage 1. — À VÉRIFIER */
export const IBIZA_STAGE1: VehicleSpec = {
  label: 'Ibiza FR 1.5 TSI · Stage 1',
  massKg: 1290,
  gearRatios: [3.769, 2.087, 1.343, 0.933, 0.974, 0.778, 0.642], // À VÉRIFIER (DQ200)
  finalDrives: [4.176, 4.176, 4.176, 4.176, 3.136, 3.136, 3.136], // À VÉRIFIER
  wheelRadiusM: 0.3307, // 215/45 R18
  cdA: 0.68, // À VÉRIFIER
  crr: 0.012,
  drivelineEff: 0.9,
  torqueCurve: [
    { rpm: 1000, nm: 120 },
    { rpm: 1600, nm: 250 },
    { rpm: 2000, nm: 302 },
    { rpm: 3500, nm: 302 },
    { rpm: 4500, nm: 290 },
    { rpm: 5800, nm: 230 },
    { rpm: 6500, nm: 185 },
  ],
  rpmLimit: 6400,
  rpmIdle: 820,
  shiftTimeS: 0.16,
  grip: 1.05,
  driveWeightShare: 0.6,
};

/** La même voiture d'origine (150 ch), pour le comparatif avant/après. */
export const IBIZA_STOCK: VehicleSpec = {
  ...IBIZA_STAGE1,
  label: 'Ibiza FR 1.5 TSI · Origine',
  torqueCurve: [
    { rpm: 1000, nm: 100 },
    { rpm: 1500, nm: 200 },
    { rpm: 2000, nm: 250 },
    { rpm: 3500, nm: 250 },
    { rpm: 4500, nm: 235 },
    { rpm: 5800, nm: 185 },
    { rpm: 6500, nm: 150 },
  ],
};

/** Interpolation linéaire dans la courbe de couple. */
export function torqueAt(spec: VehicleSpec, rpm: number): number {
  const c = spec.torqueCurve;
  if (rpm <= c[0].rpm) return c[0].nm * (rpm / c[0].rpm);
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i].rpm) {
      const f = (rpm - c[i - 1].rpm) / (c[i].rpm - c[i - 1].rpm);
      return c[i - 1].nm + f * (c[i].nm - c[i - 1].nm);
    }
  }
  return 0; // Au-delà du dernier point : rupteur.
}

/** Puissance en chevaux depuis couple (Nm) et régime. */
export function powerHp(nm: number, rpm: number): number {
  return (nm * rpm) / 7127;
}

/** L'état instantané de la voiture simulée, tel que le lirait un calculateur. */
export interface VehicleState {
  /** Secondes depuis la création du simulateur. */
  t: number;
  /** Position de la pédale, 0 à 1. */
  throttle: number;
  /** Vitesse réelle du véhicule (km/h) — ce que verrait le GPS. */
  speedKph: number;
  /** Vitesse lue aux roues (km/h) — supérieure si ça patine. C'est le PID 0D. */
  wheelSpeedKph: number;
  rpm: number;
  /** Rapport engagé, 1 à 7. 0 = embrayage ouvert. */
  gear: number;
  shifting: boolean;
  /** Pression absolue d'admission (kPa). */
  mapKpa: number;
  /** Pression atmosphérique (kPa). */
  baroKpa: number;
  /** Température d'air d'admission (°C). */
  iatC: number;
  coolantC: number;
  oilC: number;
  dsgC: number;
  /** Avance à l'allumage (°). Négative = retard. */
  advanceDeg: number;
  /** Charge moteur calculée (%). */
  loadPct: number;
  throttlePct: number;
  /** Débit d'air massique (g/s). */
  mafGs: number;
  batteryV: number;
  /** Nombre de corrections de cliquetis détectées depuis le début. */
  knockEvents: number;
  /** Cliquetis en cours sur ce cycle. */
  knocking: boolean;
  /** Patinage instantané : (roues − réel) / réel. */
  slipRatio: number;
}

/**
 * Le simulateur. On l'avance par petits pas (`step`), typiquement 20 ms.
 * Il n'a aucune dépendance React ni minuterie interne : c'est l'appelant qui
 * décide du rythme, ce qui le rend testable au millième de seconde près.
 */
export class VehicleSim {
  private s: VehicleState;
  private shiftUntil = 0;
  private boostKpa = 0;
  /** Rattrapage progressif du régime des roues après un patinage. */
  private wheelSpeedKph = 0;
  private knockHoldUntil = 0;

  constructor(private spec: VehicleSpec = IBIZA_STAGE1, opts?: { ambientC?: number; baroKpa?: number; warm?: boolean }) {
    const amb = opts?.ambientC ?? 29;
    const warm = opts?.warm ?? true;
    this.s = {
      t: 0,
      throttle: 0,
      speedKph: 0,
      wheelSpeedKph: 0,
      rpm: spec.rpmIdle,
      gear: 1,
      shifting: false,
      mapKpa: 35,
      baroKpa: opts?.baroKpa ?? 100,
      iatC: warm ? amb + 12 : amb,
      coolantC: warm ? 89 : amb,
      oilC: warm ? 92 : amb,
      dsgC: warm ? 78 : amb,
      advanceDeg: 12,
      loadPct: 18,
      throttlePct: 14,
      mafGs: 3,
      batteryV: 14.2,
      knockEvents: 0,
      knocking: false,
      slipRatio: 0,
    };
  }

  get state(): Readonly<VehicleState> {
    return this.s;
  }

  /** Enfonce (ou relâche) la pédale. 0 = pied levé, 1 = plancher. */
  setThrottle(v: number): void {
    this.s.throttle = Math.max(0, Math.min(1, v));
  }

  /** Remet la voiture à l'arrêt, moteur chaud, pour enchaîner un run. */
  resetToLaunch(): void {
    this.s.speedKph = 0;
    this.wheelSpeedKph = 0;
    this.s.gear = 1;
    this.s.rpm = this.spec.rpmIdle;
    this.s.throttle = 0;
    this.boostKpa = 0;
    this.s.knocking = false;
    this.s.slipRatio = 0;
  }

  /** Avance la simulation de `dt` secondes. */
  step(dt: number): Readonly<VehicleState> {
    const sp = this.spec;
    const s = this.s;
    s.t += dt;

    const finalDrive = sp.finalDrives[s.gear - 1] ?? sp.finalDrives[0];
    const ratio = (sp.gearRatios[s.gear - 1] ?? 1) * finalDrive;
    const vMs = s.speedKph / 3.6;
    const wheelCircum = 2 * Math.PI * sp.wheelRadiusM;

    /* ── Régime moteur ───────────────────────────────────────────────
       À l'arrêt en 1re, l'embrayage glisse : le régime monte avec la pédale
       sans que la voiture bouge (c'est le launch control du pauvre). */
    const rpmFromWheels = (vMs / wheelCircum) * 60 * ratio;
    const launchRpm = sp.rpmIdle + s.throttle * 2600;
    const clutchSlipping = s.gear === 1 && rpmFromWheels < launchRpm;
    let rpm = clutchSlipping ? launchRpm : rpmFromWheels;
    rpm = Math.max(sp.rpmIdle, Math.min(sp.rpmLimit + 100, rpm));

    /* ── Suralimentation : le turbo a de l'inertie ───────────────────
       On vise une pression cible et on l'atteint avec un retard de premier
       ordre. C'est ce retard qu'on ressent comme le « temps de réponse ». */
    const boostTarget = s.throttle * (rpm > 1800 ? 120 : (rpm - 900) / 7.5) * (rpm > sp.rpmLimit - 300 ? 0.85 : 1);
    const boostTau = rpm < 2200 ? 0.55 : 0.22;
    this.boostKpa += ((Math.max(0, boostTarget) - this.boostKpa) * dt) / boostTau;
    s.mapKpa = s.baroKpa + this.boostKpa;

    /* ── Cliquetis : air chaud + pleine charge = allumage trop précoce ──
       Le calculateur retire de l'avance pour se protéger. On reproduit ce
       mécanisme parce que c'est exactement ce que l'app doit savoir détecter. */
    const knockRisk = (s.iatC - 38) / 24 + (this.boostKpa / 130) - 0.6;
    if (knockRisk > 0 && s.throttle > 0.8 && rpm > 3200 && Math.random() < knockRisk * dt * 6) {
      s.knockEvents++;
      s.knocking = true;
      this.knockHoldUntil = s.t + 0.8;
    } else if (s.t > this.knockHoldUntil) {
      s.knocking = false;
    }
    const retard = Math.min(6, Math.max(0, (s.iatC - 38) * 0.18)) + (s.knocking ? 2.2 : 0);
    s.advanceDeg = (s.throttle > 0.7 ? 8 : 16) + (rpm / 1000) * 1.6 - retard;

    /* ── Couple disponible, puis force à la roue ─────────────────────── */
    const shifting = s.t < this.shiftUntil;
    s.shifting = shifting;
    // Un retard d'avance coûte du couple : ~1,5 % par degré retiré.
    const torqueLoss = 1 - Math.min(0.2, retard * 0.015);
    const engineNm = shifting ? 0 : torqueAt(sp, rpm) * s.throttle * torqueLoss * (this.boostKpa / Math.max(1, Math.max(0, boostTarget)) || 1);
    const wheelNm = engineNm * ratio * sp.drivelineEff;
    let force = wheelNm / sp.wheelRadiusM;

    /* ── Patinage : au-delà de l'adhérence, la force ne passe plus ──── */
    const gripLimit = sp.grip * sp.massKg * 9.81 * sp.driveWeightShare;
    let slip = 0;
    if (force > gripLimit) {
      slip = Math.min(0.35, (force - gripLimit) / gripLimit);
      force = gripLimit;
    }

    /* ── Frottements : air (carré de la vitesse) + roulement ────────── */
    const rho = 1.225 * (s.baroKpa / 101.3) * (293 / (273 + s.iatC * 0.3 + 20));
    const drag = 0.5 * rho * sp.cdA * vMs * vMs;
    const roll = sp.crr * sp.massKg * 9.81 * (vMs > 0.1 ? 1 : 0);
    const accel = (force - drag - roll) / sp.massKg;

    s.speedKph = Math.max(0, s.speedKph + accel * 3.6 * dt);

    /* ── Vitesse lue aux roues : c'est elle que renvoie le PID 0D ─────
       Quand ça patine, les roues tournent plus vite que la voiture n'avance.
       La différence entre ce PID et le GPS, c'est notre mesure de patinage. */
    const wheelTarget = s.speedKph * (1 + slip);
    this.wheelSpeedKph += (wheelTarget - this.wheelSpeedKph) * Math.min(1, dt * 12);
    s.wheelSpeedKph = this.wheelSpeedKph;
    s.slipRatio = s.speedKph > 3 ? Math.max(0, (this.wheelSpeedKph - s.speedKph) / s.speedKph) : slip;

    /* ── Passage de rapport ──────────────────────────────────────────── */
    if (!shifting && rpm >= sp.rpmLimit && s.gear < sp.gearRatios.length && s.throttle > 0.3) {
      s.gear++;
      this.shiftUntil = s.t + sp.shiftTimeS;
    } else if (!shifting && s.gear > 1 && rpm < 1250 && s.throttle < 0.3) {
      s.gear--;
    }
    s.rpm = rpm;

    /* ── Températures : grosses inerties, donc dynamique lente ──────── */
    const heat = (this.boostKpa / 130) * (rpm / 6400);
    s.iatC += ((22 + heat * 46 - s.iatC) * dt) / (vMs > 8 ? 4 : 12);
    s.coolantC += ((88 + heat * 14 - s.coolantC) * dt) / 25;
    s.oilC += ((92 + heat * 22 - s.oilC) * dt) / 40;
    s.dsgC += ((76 + heat * 20 + (slip > 0 ? 6 : 0) - s.dsgC) * dt) / 35;

    /* ── Grandeurs dérivées lues par l'app ─────────────────────────── */
    s.loadPct = Math.max(4, Math.min(100, (s.mapKpa / 230) * 100 * (0.3 + s.throttle * 0.7)));
    s.throttlePct = Math.max(12, s.throttle * 100);
    // Loi des gaz : le débit d'air suit la pression, le régime et la cylindrée.
    s.mafGs = Math.max(2, (s.mapKpa * 1.498 * rpm) / (120 * 287 * (273 + s.iatC)) * 1000 * 0.9);
    // L'alternateur fléchit un peu à plein régime, remonte à bas régime.
    s.batteryV = 14.4 - (rpm / 6400) * 0.5 - (s.throttle > 0.9 ? 0.2 : 0);

    return s;
  }
}
