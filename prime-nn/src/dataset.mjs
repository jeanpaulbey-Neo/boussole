// Fabrication des jeux de données à partir de la vérité-terrain (crible).
import { sieve } from './sieve.mjs';
import { encode } from './features.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Construit X (caractéristiques), Y (étiquettes) et N (les entiers) sur [2, limit].
 * Les premiers étant rares, on rééquilibre en sous-échantillonnant les composés.
 *
 * @param {object} opts
 * @param {number} opts.limit borne supérieure
 * @param {number} [opts.negPerPos] nb de composés gardés par premier (équilibrage)
 * @param {number} [opts.seed]
 */
export function buildDataset({ limit, negPerPos = 2, seed = 42 }) {
  const prime = sieve(limit);
  const rnd = mulberry32(seed);

  const primes = [];
  const composites = [];
  for (let n = 2; n <= limit; n++) {
    (prime[n] ? primes : composites).push(n);
  }
  // sous-échantillonnage des composés
  const keepNeg = Math.min(composites.length, primes.length * negPerPos);
  // mélange des composés
  for (let i = composites.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [composites[i], composites[j]] = [composites[j], composites[i]];
  }
  const chosen = primes.concat(composites.slice(0, keepNeg));
  // mélange final
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  const X = [], Y = [], Nums = [];
  for (const n of chosen) {
    X.push(encode(n));
    Y.push(prime[n] ? 1 : 0);
    Nums.push(n);
  }
  return { X, Y, Nums, primeFlags: prime };
}

/** Découpe entraînement/test (par défaut 85 % / 15 %). */
export function trainTestSplit(X, Y, Nums, ratio = 0.85, seed = 99) {
  const rnd = mulberry32(seed);
  const idx = [...Array(X.length).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const cut = Math.floor(X.length * ratio);
  const pick = (arr, ids) => ids.map((k) => arr[k]);
  const trIds = idx.slice(0, cut), teIds = idx.slice(cut);
  return {
    train: { X: pick(X, trIds), Y: pick(Y, trIds), Nums: pick(Nums, trIds) },
    test: { X: pick(X, teIds), Y: pick(Y, teIds), Nums: pick(Nums, teIds) },
  };
}
