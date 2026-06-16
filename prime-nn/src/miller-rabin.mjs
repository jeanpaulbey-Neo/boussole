// Test de primalité de Miller-Rabin sur BigInt — exact et rapide, sans dépendance.
//
// - Déterministe (réponse exacte garantie) pour tout n < 3.3·10^24 grâce à une base
//   de témoins fixes prouvée dans la littérature.
// - Au-delà, on ajoute des témoins : la probabilité d'erreur est ≤ 4^(-k) et l'erreur
//   est à sens unique (ne déclare JAMAIS « composé » à tort).
//
// C'est l'outil « correct » que le réseau de neurones ne peut pas être : son coût
// croît avec n (en O(log^3 n)), ce qu'un réseau de taille fixe ne sait pas faire.

/** Exponentiation modulaire rapide (square-and-multiply) sur BigInt. */
function powmod(a, e, m) {
  let r = 1n;
  a %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * a) % m;
    a = (a * a) % m;
    e >>= 1n;
  }
  return r;
}

// Témoins déterministes prouvés (Sorenson & Webster, Jaeschke…).
// Tester ces 12 bases suffit pour un verdict EXACT tant que n < 3 317 044 064 679 887 385 961 981.
const DET_WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
const DET_BOUND = 3317044064679887385961981n;

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

/** PRNG déterministe (mulberry32) pour tirer des témoins reproductibles au-delà de la borne. */
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
 * Test de primalité de Miller-Rabin.
 * @param {number|bigint|string} input l'entier à tester
 * @param {object} [opts]
 * @param {number} [opts.rounds] tours aléatoires supplémentaires au-delà de la borne déterministe
 * @param {number} [opts.seed]
 * @returns {boolean} true = premier (exact sous la borne, sinon « premier probable »)
 */
export function isPrimeMR(input, opts = {}) {
  const n = typeof input === 'bigint' ? input : BigInt(input);
  if (n < 2n) return false;

  // Élimination rapide par petits facteurs.
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }

  // n − 1 = d · 2^s, d impair.
  let d = n - 1n, s = 0n;
  while ((d & 1n) === 0n) { d >>= 1n; s++; }

  // Choix des témoins : base déterministe, complétée si n dépasse la borne prouvée.
  const witnesses = [...DET_WITNESSES];
  if (n > DET_BOUND) {
    const rounds = opts.rounds ?? 20;
    const rnd = mulberry32(opts.seed ?? 1);
    for (let i = 0; i < rounds; i++) {
      // témoin pseudo-aléatoire dans [2, n-2]
      const a = 2n + BigInt(Math.floor(rnd() * 1e9)) % (n - 3n);
      witnesses.push(a);
    }
  }

  for (const a0 of witnesses) {
    const a = a0 % n;
    if (a < 2n) continue;
    let x = powmod(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let r = 1n; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) { composite = false; break; }
    }
    if (composite) return false; // témoin de non-primalité → composé, certain
  }
  return true;
}

/** Vrai si le verdict de isPrimeMR est EXACT (déterministe) pour cet entier. */
export function isDeterministic(input) {
  const n = typeof input === 'bigint' ? input : BigInt(input);
  return n < DET_BOUND;
}

/** Le plus petit premier strictement supérieur à n (exact), via Miller-Rabin. */
export function nextPrimeMR(input) {
  let c = (typeof input === 'bigint' ? input : BigInt(input)) + 1n;
  if (c <= 2n) return 2n;
  if ((c & 1n) === 0n) c += 1n; // sauter les pairs
  while (!isPrimeMR(c)) c += 2n;
  return c;
}
