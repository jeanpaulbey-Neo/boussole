// Pipeline complet : réseau de neurones (pré-filtre rapide, approximatif) PUIS
// Miller-Rabin (verdict exact). Fonctionne sur de TRÈS grands entiers via BigInt ;
// le réseau n'est consulté que tant que n tient dans un Number sûr.
//
// Usage : node src/verify.mjs 97 561 1000000007 170141183460469231731687303715884105727

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MLP } from './nn.mjs';
import { encode } from './features.mjs';
import { isPrimeMR, isDeterministic } from './miller-rabin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let net = null, threshold = 0.5;
try {
  const raw = JSON.parse(readFileSync(join(__dirname, '..', 'web', 'model.json'), 'utf8'));
  net = MLP.fromJSON(raw); threshold = raw.threshold ?? 0.5;
} catch { /* le réseau est optionnel ; Miller-Rabin suffit */ }

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const args = process.argv.slice(2);
const numbers = args.length ? args : ['97', '561', '7919', '62710561', '1000000007',
  '2147483647', '170141183460469231731687303715884105727'];

console.log('  n                          | réseau (proba) | Miller-Rabin     | accord');
console.log('  ---------------------------+----------------+------------------+-------');
for (const arg of numbers) {
  let n;
  try { n = BigInt(arg); } catch { continue; }

  // Étage 1 — réseau (seulement si n est représentable sans perte en Number)
  let nnCell = '   (trop grand)';
  let nnPred = null;
  if (net && n >= 0n && n <= SAFE) {
    const p = net.predict(encode(Number(n)));
    nnPred = p >= threshold;
    nnCell = `${(nnPred ? 'prem' : 'comp')} ${(p * 100).toFixed(0).padStart(3)}%`.padEnd(14);
  }

  // Étage 2 — Miller-Rabin (verdict exact sous la borne, sinon « probable »)
  const mr = isPrimeMR(n);
  const exact = isDeterministic(n);
  const mrCell = `${mr ? 'PREMIER' : 'composé'}${exact ? ' (exact)' : ' (prob.)'}`.padEnd(16);

  const accord = nnPred === null ? '—' : (nnPred === mr ? '✓' : '✗ réseau faux');
  const label = (arg.length > 26 ? arg.slice(0, 23) + '…' : arg).padEnd(26);
  console.log(`  ${label} | ${nnCell} | ${mrCell} | ${accord}`);
}
console.log('\nLe réseau pré-filtre vite mais peut se tromper ; Miller-Rabin tranche.');
