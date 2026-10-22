/**
 * MockTransport.ts — un faux ELM327, aussi pénible qu'un vrai.
 *
 * C'est le boîtier le plus important du projet : c'est le seul sur lequel on
 * peut travailler à 2 h du matin sans sortir la voiture du garage.
 *
 * Il ne se contente pas de renvoyer des valeurs plausibles. Il imite les
 * défauts du matériel réel, parce que ce sont les défauts qui cassent le code :
 *   · il renvoie l'écho de la commande tant que `ATE0` n'est pas passé ;
 *   · il découpe ses réponses en morceaux de 20 octets, comme en BLE ;
 *   · il met 20 à 80 ms à répondre, de façon irrégulière ;
 *   · il dit `SEARCHING...` au premier échange ;
 *   · et en mode « clone pénible », il refuse des commandes AT, glisse des
 *     `NO DATA` au hasard et décroche brutalement toutes les N secondes.
 *
 * Les valeurs moteur viennent de `VehicleSim` : ce ne sont pas des nombres
 * aléatoires mais le résultat d'une vraie simulation physique, ce qui permet
 * de tester la détection de départ, le patinage et le cliquetis.
 */
import { BaseTransport, toBytes, type DiscoveredDevice, type ObdScanner, type TransportKind } from './types';
import { VehicleSim, IBIZA_STAGE1, type VehicleSpec } from './vehicleSim';
import { PID_BY_ID } from '@/obd/pids';
import { consoleLog } from '@/debug/ConsoleLog';

/** Les « personnalités » de boîtier qu'on sait imiter. */
export type MockProfile = 'sage' | 'clone' | 'cauchemar';

export interface MockOptions {
  profile?: MockProfile;
  /** Voiture simulée. */
  spec?: VehicleSpec;
  /** Taille des morceaux de réponse (20 octets = MTU BLE minimal). */
  chunkSize?: number;
  /**
   * Couples commande → réponse rejoués depuis un journal réel exporté.
   * Quand une commande y figure, c'est cette réponse qui est renvoyée :
   * on reproduit à l'identique un bug observé sur la voiture.
   */
  replay?: { cmd: string; reply: string }[];
}

interface ProfileTraits {
  latencyMs: [number, number];
  /** Commandes AT refusées par ce clone (répondent `?`). */
  rejects: RegExp[];
  /** Probabilité de renvoyer `NO DATA` sur une requête OBD valide. */
  noDataRate: number;
  /** Décroche tout seul toutes les N secondes. 0 = jamais. */
  dropEveryS: number;
  /** Supporte plusieurs PID dans une requête. */
  multiPid: boolean;
}

const TRAITS: Record<MockProfile, ProfileTraits> = {
  // Le boîtier idéal : ce que sera la Tarmac Box.
  sage: { latencyMs: [8, 18], rejects: [], noDataRate: 0, dropEveryS: 0, multiPid: true },
  // Le clone moyen du commerce : lent, bancal, mais utilisable.
  clone: { latencyMs: [20, 80], rejects: [/^AT@1/i, /^ATST/i], noDataRate: 0.02, dropEveryS: 0, multiPid: true },
  // Le pire qu'on ait vu : sert à valider la reconnexion automatique.
  cauchemar: {
    latencyMs: [60, 220],
    rejects: [/^AT@1/i, /^ATST/i, /^ATAT/i, /^ATSH/i, /^ATDP/i],
    noDataRate: 0.12,
    dropEveryS: 25,
    multiPid: false,
  },
};

/** Les trois faux boîtiers proposés dans l'écran de connexion. */
export const MOCK_DEVICES: DiscoveredDevice[] = [
  { id: 'mock:sage', name: 'Tarmac Box (simulée)', kind: 'mock', likelyObd: true, rssi: -45 },
  { id: 'mock:clone', name: 'ELM327 v1.5 (clone simulé)', kind: 'mock', likelyObd: true, rssi: -68 },
  { id: 'mock:cauchemar', name: 'ELM327 v2.1 (clone instable)', kind: 'mock', likelyObd: true, rssi: -88 },
];

/** Le scanner du mode démo : il « trouve » instantanément les faux boîtiers. */
export const mockScanner: ObdScanner = {
  async scan(onFound) {
    MOCK_DEVICES.forEach((d, i) => setTimeout(() => onFound(d), 120 * (i + 1)));
    return () => {};
  },
};

export class MockTransport extends BaseTransport implements ObdScanner {
  readonly kind: TransportKind = 'mock';

  private sim: VehicleSim;
  private traits: ProfileTraits;
  private opts: Required<Omit<MockOptions, 'replay' | 'spec'>> & Pick<MockOptions, 'replay' | 'spec'>;

  /** `ATE0` est-il passé ? Avant, le boîtier renvoie l'écho. */
  private echo = true;
  private headers = false;
  private spaces = true;
  private firstObdRequest = true;
  private protocolSet = '0';
  private header = '7DF';

  private simTimer: ReturnType<typeof setInterval> | null = null;
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  /** Tampon d'entrée : les octets arrivent commande par commande, mais pas forcément entiers. */
  private rxBuffer = '';

  constructor(options: MockOptions = {}) {
    super();
    const profile = options.profile ?? 'clone';
    this.traits = TRAITS[profile];
    this.opts = { profile, chunkSize: options.chunkSize ?? 20, replay: options.replay, spec: options.spec };
    this.sim = new VehicleSim(options.spec ?? IBIZA_STAGE1);
  }

  /** Accès à la voiture simulée : l'écran de démo s'en sert pour appuyer sur l'accélérateur. */
  get vehicle(): VehicleSim {
    return this.sim;
  }

  async scan(onFound: (d: DiscoveredDevice) => void): Promise<() => void> {
    return mockScanner.scan(onFound);
  }

  async connect(deviceId: string): Promise<void> {
    this.setState('connecting');
    const profile = (deviceId.split(':')[1] ?? 'clone') as MockProfile;
    this.traits = TRAITS[profile] ?? TRAITS.clone;
    this.opts.profile = profile;

    // Une connexion BLE réelle prend entre 300 ms et 2 s. On imite ce délai,
    // sinon on ne verrait jamais les animations de connexion de l'interface.
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 450));

    this.echo = true;
    this.headers = false;
    this.spaces = true;
    this.firstObdRequest = true;
    this.rxBuffer = '';

    // La voiture simulée tourne à 50 Hz, indépendamment des requêtes : c'est
    // une voiture, elle n'attend pas qu'on la regarde pour avancer.
    this.simTimer = setInterval(() => this.sim.step(0.02), 20);

    if (this.traits.dropEveryS > 0) this.scheduleDrop();

    this.setState('connected');
    consoleLog.sys(`Boîtier simulé « ${profile} » connecté`);
  }

  async disconnect(): Promise<void> {
    this.setState('disconnecting');
    this.stopTimers();
    this.setState('disconnected');
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.state !== 'connected') throw new Error('Boîtier simulé non connecté');

    let text = '';
    for (let i = 0; i < data.length; i++) text += String.fromCharCode(data[i]);
    this.rxBuffer += text;

    // Une commande se termine par un retour chariot. On traite tout ce qui est complet.
    let cr: number;
    while ((cr = this.rxBuffer.indexOf('\r')) >= 0) {
      const cmd = this.rxBuffer.slice(0, cr).trim();
      this.rxBuffer = this.rxBuffer.slice(cr + 1);
      this.respondTo(cmd);
    }
  }

  /* ───────────────────────── Cerveau du faux boîtier ───────────────────────── */

  private respondTo(cmd: string): void {
    const latency = this.traits.latencyMs[0] + Math.random() * (this.traits.latencyMs[1] - this.traits.latencyMs[0]);
    const body = this.buildReply(cmd);
    const t = setTimeout(() => {
      this.pendingTimers.delete(t);
      // L'écho d'abord, comme un vrai : il part AVANT la réponse.
      const prefix = this.echo && cmd.length > 0 ? cmd + '\r' : '';
      this.emitChunked(prefix + body + '\r\r>');
    }, latency);
    this.pendingTimers.add(t);
  }

  private buildReply(raw: string): string {
    const cmd = raw.replace(/\s/g, '').toUpperCase();

    // Un retour chariot seul : la commande de déblocage. Le boîtier rend la main.
    if (cmd.length === 0) return '';

    // Rejeu d'un journal réel : priorité absolue, c'est là pour reproduire un bug.
    const replayed = this.opts.replay?.find((p) => p.cmd.replace(/\s/g, '').toUpperCase() === cmd);
    if (replayed) return replayed.reply;

    if (this.traits.rejects.some((re) => re.test(cmd))) return '?';

    /* ── Commandes de configuration ──────────────────────────────────── */
    if (cmd.startsWith('AT')) {
      if (cmd === 'ATZ' || cmd === 'ATWS') {
        this.echo = true;
        this.spaces = true;
        this.headers = false;
        return this.announcedVersion();
      }
      if (cmd === 'ATD') { this.echo = true; this.spaces = true; return 'OK'; }
      if (cmd === 'ATE0') { this.echo = false; return 'OK'; }
      if (cmd === 'ATE1') { this.echo = true; return 'OK'; }
      if (cmd === 'ATS0') { this.spaces = false; return 'OK'; }
      if (cmd === 'ATS1') { this.spaces = true; return 'OK'; }
      if (cmd === 'ATH0') { this.headers = false; return 'OK'; }
      if (cmd === 'ATH1') { this.headers = true; return 'OK'; }
      if (cmd === 'ATL0' || cmd === 'ATL1') return 'OK';
      if (cmd === 'ATI') return this.announcedVersion();
      if (cmd === 'AT@1') return 'OBDII to RS232 Interpreter';
      if (cmd.startsWith('ATSP')) { this.protocolSet = cmd.slice(4) || '0'; return 'OK'; }
      if (cmd === 'ATDP') return this.protocolSet === '6' ? 'ISO 15765-4 (CAN 11/500)' : 'AUTO, ISO 15765-4 (CAN 11/500)';
      if (cmd.startsWith('ATSH')) { this.header = cmd.slice(4); return 'OK'; }
      if (cmd.startsWith('ATAT')) return 'OK';
      if (cmd.startsWith('ATST')) return 'OK';
      if (cmd === 'ATRV') return `${this.sim.state.batteryV.toFixed(1)}V`;
      return 'OK';
    }

    /* ── Requêtes OBD ────────────────────────────────────────────────── */
    // Le tout premier échange déclenche la recherche de bus : l'ELM327
    // annonce « SEARCHING... » avant de répondre. Ce préfixe doit être
    // correctement filtré par `sanitize`, et c'est justement ce qu'on teste.
    const searching = this.firstObdRequest ? 'SEARCHING...\r' : '';
    if (this.firstObdRequest) this.firstObdRequest = false;

    if (Math.random() < this.traits.noDataRate) return searching + 'NO DATA';

    const service = cmd.slice(0, 2);
    const hdr = this.headers ? '7E8' : '';

    if (service === '01') return searching + hdr + this.replyMode01(cmd.slice(2));
    if (service === '03') return searching + hdr + '4300'; // Aucun code défaut.
    if (service === '07') return searching + hdr + '4700';
    if (service === '09') return searching + this.replyMode09(cmd.slice(2));
    if (service === '0A') return searching + hdr + '4A00';
    if (service === '22') return searching + 'NO DATA'; // Les DID VAG ne sont pas simulés.
    return searching + 'NO DATA';
  }

  private announcedVersion(): string {
    // Les clones mentent sur leur version. On imite ce mensonge.
    return this.opts.profile === 'sage' ? 'Tarmac Box v1.2' : this.opts.profile === 'clone' ? 'ELM327 v1.5' : 'ELM327 v2.1';
  }

  /**
   * Répond à une requête de mode 01, un ou plusieurs PID à la suite.
   * Le découpage reproduit le comportement réel : un clone qui ne gère pas le
   * multi-PID ne répond QUE sur le premier PID demandé.
   */
  private replyMode01(payload: string): string {
    // Le découpage par paires laisse de côté un éventuel chiffre isolé en fin
    // de chaîne : c'est le suffixe de comptage (« 010C1 »), pas un PID.
    let pids: string[] = [];
    for (let i = 0; i + 2 <= payload.length; i += 2) pids.push(payload.slice(i, i + 2));

    if (!this.traits.multiPid) pids = pids.slice(0, 1);

    // Masques de PID supportés.
    if (pids[0] === '00') return this.frame('4100' + 'BE3FA813');
    if (pids[0] === '20') return this.frame('4120' + '90000001');
    if (pids[0] === '40') return this.frame('4140' + '0000C000');
    if (pids[0] === '60') return this.frame('4160' + '00000000');

    const s = this.sim.state;
    let out = '';
    for (const pid of pids) {
      const def = PID_BY_ID[pid];
      if (!def) continue;
      const hex = this.encodePid(pid, s);
      if (hex === null) continue;
      out += '41' + pid + hex;
    }
    return out.length > 0 ? this.frame(out) : 'NO DATA';
  }

  /** Encode la valeur simulée d'un PID dans ses octets normalisés. */
  private encodePid(pid: string, s: ReturnType<VehicleSim['step']>): string | null {
    const b1 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).toUpperCase().padStart(2, '0');
    const b2 = (v: number) => {
      const n = Math.max(0, Math.min(65535, Math.round(v)));
      return b1(n >> 8) + b1(n & 0xff);
    };
    switch (pid) {
      case '04': return b1((s.loadPct * 255) / 100);
      case '05': return b1(s.coolantC + 40);
      case '06': return b1(128 + 2);
      case '07': return b1(128 - 1);
      case '0B': return b1(s.mapKpa);
      case '0C': return b2(s.rpm * 4);
      // C'est bien la vitesse AUX ROUES que renvoie le calculateur, pas la
      // vitesse réelle. L'écart avec le GPS, c'est le patinage.
      case '0D': return b1(s.wheelSpeedKph);
      case '0E': return b1((s.advanceDeg + 64) * 2);
      case '0F': return b1(s.iatC + 40);
      case '10': return b2(s.mafGs * 100);
      case '11': return b1((s.throttlePct * 255) / 100);
      case '24': return b2((1.0 - (s.throttle > 0.8 ? 0.14 : 0)) * 32768) + b2(32768);
      case '33': return b1(s.baroKpa);
      case '42': return b2(s.batteryV * 1000);
      // Beaucoup de VW ne fournissent pas la température d'huile par le PID 5C.
      case '5C': return this.opts.profile === 'sage' ? b1(s.oilC + 40) : null;
      default: return null;
    }
  }

  /** Réponse au mode 09 : le VIN, en multi-trames comme sur un vrai bus. */
  private replyMode09(payload: string): string {
    if (payload.startsWith('00')) return this.frame('4900' + '55000000');
    if (!payload.startsWith('02')) return 'NO DATA';
    const vin = 'VSSZZZ6FZMR012345'; // VIN d'exemple, pas un vrai véhicule.
    let hex = '4902' + '01';
    for (const ch of vin) hex += ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    // Mise en forme multi-trames de l'ELM327 : « 014 » puis « 0: … » par ligne.
    const total = hex.length / 2;
    const lines: string[] = [total.toString(16).toUpperCase().padStart(3, '0')];
    for (let i = 0, idx = 0; i < hex.length; i += 14, idx++) {
      lines.push(`${idx.toString(16).toUpperCase()}:${this.spaceOut(hex.slice(i, i + 14))}`);
    }
    return lines.join('\r');
  }

  /** Applique le réglage ATS0/ATS1 : avec ou sans espaces entre les octets. */
  private frame(hex: string): string {
    return this.spaces ? this.spaceOut(hex) : hex;
  }

  private spaceOut(hex: string): string {
    return (hex.match(/.{1,2}/g) ?? []).join(' ');
  }

  /**
   * Émet la réponse par morceaux, comme une notification BLE.
   * C'est ce découpage qui révèle les bugs de recollage côté ElmProtocol :
   * une réponse peut arriver en 2 à 5 morceaux.
   */
  private emitChunked(text: string): void {
    const size = this.opts.chunkSize;
    for (let i = 0; i < text.length; i += size) {
      const slice = text.slice(i, i + size);
      // Un délai inter-morceaux non nul : sinon on ne teste pas l'accumulation.
      const t = setTimeout(() => {
        this.pendingTimers.delete(t);
        if (this.state === 'connected') this.emitData(toBytes(slice));
      }, (i / size) * 6);
      this.pendingTimers.add(t);
    }
  }

  /** Le clone instable décroche tout seul : c'est le test de la reconnexion. */
  private scheduleDrop(): void {
    this.dropTimer = setTimeout(() => {
      consoleLog.err('Boîtier simulé : déconnexion brutale (clone instable)');
      this.stopTimers();
      this.setState('disconnected', new Error('Le boîtier simulé a décroché'));
    }, this.traits.dropEveryS * 1000);
  }

  private stopTimers(): void {
    if (this.simTimer) { clearInterval(this.simTimer); this.simTimer = null; }
    if (this.dropTimer) { clearTimeout(this.dropTimer); this.dropTimer = null; }
    this.pendingTimers.forEach(clearTimeout);
    this.pendingTimers.clear();
  }
}
