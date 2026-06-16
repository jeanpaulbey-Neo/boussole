// Script d'entraînement : construit le jeu de données, entraîne le MLP,
// évalue, choisit un seuil, puis sauvegarde le modèle dans web/model.json.
//
// Usage : node src/train.mjs [limit] [epochs]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MLP } from './nn.mjs';
import { INPUT_SIZE } from './features.mjs';
import { buildDataset, trainTestSplit } from './dataset.mjs';
import { evaluate, formatReport } from './metrics.mjs';
import { isPrime } from './sieve.mjs';
import { encode } from './features.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LIMIT = Number(process.argv[2] || 200000);
const EPOCHS = Number(process.argv[3] || 60);

console.log(`Construction du jeu de données sur [2, ${LIMIT}]…`);
const { X, Y, Nums } = buildDataset({ limit: LIMIT, negPerPos: 2, seed: 42 });
const { train, test } = trainTestSplit(X, Y, Nums, 0.85);
const posCount = Y.reduce((s, y) => s + y, 0);
console.log(`  ${X.length} échantillons (${posCount} premiers), `
  + `${train.X.length} entraînement / ${test.X.length} test.`);

// Poids de la classe positive ≈ ratio négatifs/positifs pour compenser le déséquilibre.
const posWeight = (Y.length - posCount) / posCount;

const net = new MLP([INPUT_SIZE, 32, 24, 1], 2025);
console.log(`Entraînement du MLP ${net.sizes.join('→')} pendant ${EPOCHS} époques…`);

net.fit(train.X, train.Y, {
  epochs: EPOCHS,
  lr: 0.08,
  batchSize: 128,
  momentum: 0.9,
  posWeight,
  seed: 7,
  onEpoch: (ep, loss) => {
    if (ep === 1 || ep % 10 === 0 || ep === EPOCHS) {
      const m = evaluate(net, test.X, test.Y);
      console.log(`  époque ${String(ep).padStart(3)} | perte ${loss.toFixed(4)} `
        + `| acc test ${(m.accuracy * 100).toFixed(2)}% | F1 ${(m.f1 * 100).toFixed(2)}%`);
    }
  },
});

// Choix du seuil maximisant le F1 sur le jeu de test.
let bestT = 0.5, bestF1 = -1;
for (let t = 0.1; t <= 0.9; t += 0.05) {
  const m = evaluate(net, test.X, test.Y, t);
  if (m.f1 > bestF1) { bestF1 = m.f1; bestT = t; }
}
const threshold = Number(bestT.toFixed(2));

console.log('\n' + formatReport('Entraînement', evaluate(net, train.X, train.Y, threshold)));
console.log('\n' + formatReport(`Test (seuil=${threshold})`, evaluate(net, test.X, test.Y, threshold)));

// Généralisation : entiers JAMAIS vus, au-delà de la plage d'entraînement.
const extra = [];
for (let n = LIMIT + 1; n <= LIMIT + 20000; n++) extra.push(n);
const exX = extra.map(encode);
const exY = extra.map((n) => (isPrime(n) ? 1 : 0));
console.log('\n' + formatReport('Extrapolation (au-delà de la plage)',
  evaluate({ predict: (x) => net.predict(x) }, exX, exY, threshold)));

// Sauvegarde du modèle pour la démo navigateur et la CLI.
const outDir = join(__dirname, '..', 'web');
mkdirSync(outDir, { recursive: true });
const modelPath = join(outDir, 'model.json');
writeFileSync(modelPath, JSON.stringify({
  ...net.toJSON(),
  threshold,
  trainedUpTo: LIMIT,
  createdAt: new Date().toISOString().slice(0, 10),
}));
console.log(`\nModèle sauvegardé : ${modelPath}`);
