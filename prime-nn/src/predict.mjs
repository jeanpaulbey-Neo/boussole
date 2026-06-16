// CLI : classe un ou plusieurs nombres avec le modèle entraîné, et compare à la
// vérité-terrain (division d'essai). Montre où le réseau se trompe.
//
// Usage : node src/predict.mjs 7 12 97 561 7919

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MLP } from './nn.mjs';
import { encode } from './features.mjs';
import { isPrime } from './sieve.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelPath = join(__dirname, '..', 'web', 'model.json');

let raw;
try {
  raw = JSON.parse(readFileSync(modelPath, 'utf8'));
} catch {
  console.error(`Modèle introuvable (${modelPath}). Lance d'abord : npm run train`);
  process.exit(1);
}
const net = MLP.fromJSON(raw);
const threshold = raw.threshold ?? 0.5;

const args = process.argv.slice(2);
const numbers = args.length ? args.map(Number) : [2, 7, 12, 91, 97, 561, 7919, 7920];

console.log(`Modèle entraîné jusqu'à ${raw.trainedUpTo} — seuil ${threshold}\n`);
console.log('  n        | proba   | prédit      | réel        | ');
console.log('  ---------+---------+-------------+-------------+--------');
let correct = 0;
for (const n of numbers) {
  if (!Number.isInteger(n) || n < 0) continue;
  const p = net.predict(encode(n));
  const pred = p >= threshold;
  const real = isPrime(n);
  const ok = pred === real;
  if (ok) correct++;
  console.log(
    `  ${String(n).padEnd(8)} | ${p.toFixed(3).padStart(6)} | `
    + `${(pred ? 'premier' : 'composé').padEnd(11)} | `
    + `${(real ? 'premier' : 'composé').padEnd(11)} | ${ok ? '✓' : '✗ erreur'}`
  );
}
console.log(`\n${correct}/${numbers.length} corrects.`);
