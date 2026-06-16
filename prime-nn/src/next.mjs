// Bonus — « prochain nombre premier » par le réseau.
// On réutilise le classifieur de primalité : à partir de n, on remonte n+1, n+2, …
// et on renvoie le premier entier que le RÉSEAU juge premier. On compare ensuite à
// la vraie réponse (division d'essai) pour mesurer l'écart.
//
// Usage : node src/next.mjs 100 1000 7919

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MLP } from './nn.mjs';
import { encode } from './features.mjs';
import { nextPrime } from './sieve.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(__dirname, '..', 'web', 'model.json'), 'utf8'));
const net = MLP.fromJSON(raw);
const threshold = raw.threshold ?? 0.5;

/** Prochain premier selon le réseau (recherche montante). */
export function nextPrimeNN(n, limit = 10000) {
  for (let c = Math.floor(n) + 1; c <= n + limit; c++) {
    if (net.predict(encode(c)) >= threshold) return c;
  }
  return null;
}

const args = process.argv.slice(2).map(Number);
const starts = args.length ? args : [100, 1000, 7919, 100000];

console.log('  depuis n | réseau → | réel →  | ');
console.log('  ---------+----------+---------+--------');
for (const n of starts) {
  const guess = nextPrimeNN(n);
  const truth = nextPrime(n);
  const ok = guess === truth;
  console.log(`  ${String(n).padEnd(8)} | ${String(guess).padEnd(8)} | `
    + `${String(truth).padEnd(7)} | ${ok ? '✓' : '✗ (écart ' + (guess - truth) + ')'}`);
}
