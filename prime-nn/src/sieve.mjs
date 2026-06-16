// Vérité-terrain : primalité exacte, sans réseau de neurones.
// Sert à fabriquer les étiquettes d'entraînement et à évaluer le modèle.

/**
 * Test de primalité déterministe par division d'essai (rapide pour nos plages).
 * @param {number} n entier >= 0
 * @returns {boolean}
 */
export function isPrime(n) {
  if (!Number.isInteger(n)) return false;
  if (n < 2) return false;
  if (n < 4) return true;            // 2, 3
  if (n % 2 === 0 || n % 3 === 0) return false;
  // 6k ± 1
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

/**
 * Crible d'Ératosthène : renvoie un tableau booléen `prime[0..limit]`.
 * @param {number} limit borne supérieure incluse
 * @returns {Uint8Array} 1 si premier, 0 sinon
 */
export function sieve(limit) {
  const prime = new Uint8Array(limit + 1).fill(1);
  prime[0] = 0;
  if (limit >= 1) prime[1] = 0;
  for (let p = 2; p * p <= limit; p++) {
    if (prime[p]) {
      for (let m = p * p; m <= limit; m += p) prime[m] = 0;
    }
  }
  return prime;
}

/**
 * Le plus petit premier strictement supérieur à n (utilitaire « prochain premier »).
 * @param {number} n
 * @returns {number}
 */
export function nextPrime(n) {
  let c = Math.max(1, Math.floor(n)) + 1;
  while (!isPrime(c)) c++;
  return c;
}

/** Les `count` premiers nombres premiers. */
export function firstPrimes(count) {
  const out = [];
  let c = 2;
  while (out.length < count) {
    if (isPrime(c)) out.push(c);
    c++;
  }
  return out;
}
