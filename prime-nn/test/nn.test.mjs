// Tests du projet « réseau de neurones pour la primalité » (sans dépendance).
// Couvre : vérité-terrain (crible/division d'essai), encodage, apprentissage réel
// du MLP sur un petit jeu, et cohérence des métriques.
// Lance : node test/nn.test.mjs

import { isPrime, sieve, nextPrime } from '../src/sieve.mjs';
import { encode, INPUT_SIZE, MOD_PRIMES } from '../src/features.mjs';
import { MLP } from '../src/nn.mjs';
import { buildDataset, trainTestSplit } from '../src/dataset.mjs';
import { evaluate } from '../src/metrics.mjs';

let pass = 0, fail = 0;
function check(nom, cond, detail = '') {
  if (cond) { pass++; console.log(`✓ ${nom}`); }
  else { fail++; console.error(`✗ ${nom} ${detail}`); }
}

// 1) Vérité-terrain : isPrime
check('isPrime(2) vrai', isPrime(2));
check('isPrime(17) vrai', isPrime(17));
check('isPrime(1) faux', !isPrime(1));
check('isPrime(0) faux', !isPrime(0));
check('isPrime(-7) faux', !isPrime(-7));
check('isPrime(561) faux (Carmichael)', !isPrime(561));
check('isPrime(7919) vrai (1000e premier)', isPrime(7919));
check('isPrime(7920) faux', !isPrime(7920));

// 2) Crible cohérent avec isPrime
const lim = 5000;
const s = sieve(lim);
let agree = true;
for (let n = 0; n <= lim; n++) {
  if (!!s[n] !== isPrime(n)) { agree = false; break; }
}
check('crible == division d\'essai sur [0,5000]', agree);
check('nextPrime(13) == 17', nextPrime(13) === 17);
check('nextPrime(14) == 17', nextPrime(14) === 17);

// 3) Encodage
const v = encode(30);
check('taille du vecteur == INPUT_SIZE', v.length === INPUT_SIZE, `=> ${v.length}`);
check('toutes les valeurs sont finies', v.every(Number.isFinite));
check('valeurs bornées dans [-1.1, 1.1]', v.every((x) => x >= -1.1 && x <= 1.1));
// 30 est divisible par 2,3,5 -> résidus nuls -> cos=1, sin=0 sur ces premiers
const i5 = MOD_PRIMES.indexOf(5);
check('30 mod 5 == 0 → cos=1', Math.abs(v[i5 * 2] - 1) < 1e-9);
check('30 mod 5 == 0 → sin=0', Math.abs(v[i5 * 2 + 1]) < 1e-9);

// 4) Le MLP apprend réellement (XOR : tâche non linéaire classique)
const xorX = [[0, 0], [0, 1], [1, 0], [1, 1]];
const xorY = [0, 1, 1, 0];
const xor = new MLP([2, 8, 1], 1);
xor.fit(xorX, xorY, { epochs: 2000, lr: 0.2, batchSize: 4, momentum: 0.9 });
const xorOk = xorX.every((x, i) => (xor.predict(x) >= 0.5 ? 1 : 0) === xorY[i]);
check('le MLP apprend XOR', xorOk,
  `=> ${xorX.map((x) => xor.predict(x).toFixed(2))}`);

// 5) Sérialisation round-trip
const json = JSON.parse(JSON.stringify(xor.toJSON()));
const xor2 = MLP.fromJSON(json);
check('toJSON/fromJSON conserve les prédictions',
  xorX.every((x) => Math.abs(xor.predict(x) - xor2.predict(x)) < 1e-12));

// 6) Apprentissage de la primalité sur un petit jeu : nettement mieux que le hasard
const { X, Y, Nums } = buildDataset({ limit: 20000, negPerPos: 2, seed: 42 });
const { train, test } = trainTestSplit(X, Y, Nums, 0.85);
const pos = Y.reduce((a, b) => a + b, 0);
const posWeight = (Y.length - pos) / pos;
const net = new MLP([INPUT_SIZE, 24, 16, 1], 2025);
net.fit(train.X, train.Y, { epochs: 40, lr: 0.08, batchSize: 128, posWeight, seed: 7 });
const m = evaluate(net, test.X, test.Y, 0.5);
check('métriques dans [0,1]', m.accuracy >= 0 && m.accuracy <= 1 && m.f1 >= 0 && m.f1 <= 1);
check('exactitude test > 0.80', m.accuracy > 0.80, `=> ${m.accuracy.toFixed(3)}`);
check('F1 test > 0.55 (>> hasard)', m.f1 > 0.55, `=> ${m.f1.toFixed(3)}`);

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
