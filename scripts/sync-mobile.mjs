#!/usr/bin/env node
/**
 * sync-mobile.mjs — recopie dans src/shared/ le code métier de l'app mobile.
 *
 * Le site décode les logs, les PID et les épreuves avec les MÊMES fichiers que
 * l'app. Ils sont embarqués ici pour que la branche `web` se construise seule
 * (Vercel ne voit pas la branche main). Les fichiers sont copiés tels quels :
 * on ne les modifie jamais dans le site, on modifie l'app puis on relance :
 *
 *   npm run sync:mobile            # copie depuis ../Tarmac/src
 *   npm run sync:mobile -- --check # échoue si une copie a divergé
 *
 * `data/rows.ts` et `store/storage.ts` ne sont que des extraits : les
 * interfaces de lignes de data/mappers.ts, et le type MaintenanceEntry du
 * stockage. Le reste de ces fichiers dépend du téléphone (MMKV).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = process.env.MOBILE_SRC ?? join(ROOT, '..', 'Tarmac', 'src');
const OUT = join(ROOT, 'src', 'shared');
const check = process.argv.includes('--check');

const FILES = ['log/logFormat.ts', 'obd/pids.ts', 'obd/dtcLibrary.ts', 'run/types.ts', 'run/splits.ts', 'health/maintenance.ts'];
const ROWS = ['LogRow', 'RunRow', 'VehicleRow', 'MaintenanceRow'];

if (!existsSync(MOBILE)) {
  console.error(`✖ Code mobile introuvable : ${MOBILE} (MOBILE_SRC pour un autre chemin).`);
  process.exit(1);
}

const outputs = new Map(FILES.map((f) => [f, readFileSync(join(MOBILE, f), 'utf8')]));

const mappers = readFileSync(join(MOBILE, 'data/mappers.ts'), 'utf8');
const blocks = ROWS.map((name) => {
  const m = mappers.match(new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`Interface ${name} absente de data/mappers.ts`);
  return m[0];
});
outputs.set('data/rows.ts', [
  '// Généré par scripts/sync-mobile.mjs depuis Tarmac/src/data/mappers.ts — ne pas modifier.',
  "import type { RunConditions, ShiftEvent, Split } from '@/run/types';",
  "import type { LogMarker, LogMeta } from '@/log/logFormat';",
  '',
  blocks.join('\n\n'),
  '',
].join('\n'));

const storage = readFileSync(join(MOBILE, 'store/storage.ts'), 'utf8');
const entry = storage.match(/export interface MaintenanceEntry \{[\s\S]*?\n\}/);
if (!entry) throw new Error('Interface MaintenanceEntry absente de store/storage.ts');
outputs.set('store/storage.ts', [
  '// Généré par scripts/sync-mobile.mjs depuis Tarmac/src/store/storage.ts — ne pas modifier.',
  '// Seul le type utilisé par health/maintenance.ts : le reste du fichier dépend du téléphone.',
  '',
  entry[0],
  '',
].join('\n'));

let drift = 0;
for (const [file, content] of outputs) {
  const target = join(OUT, file);
  const same = existsSync(target) && readFileSync(target, 'utf8') === content;
  if (check) {
    if (!same) { drift++; console.error(`✖ ${file} diffère de l'app mobile`); }
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`${same ? '·' : '✔'} ${file}`);
}
if (check && drift) process.exit(1);
if (check) console.log('✔ Le code partagé est identique à celui de l’app.');
