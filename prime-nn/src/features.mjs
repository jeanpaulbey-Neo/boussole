// Encodage d'un entier en vecteur de caractéristiques pour le réseau.
//
// Idée directrice : un entier brut (ou ses bits) est une cible très difficile pour
// un perceptron, car la primalité n'est pas une fonction « lisse » de n. On donne donc
// au réseau des indices arithmétiques pertinents : le résidu de n modulo chacun des
// petits nombres premiers. Un résidu nul mod p (pour n > p) prouve que n est composé.
//
// Chaque résidu est encodé de façon cyclique par (cos, sin) de l'angle 2π·(n mod p)/p
// (« Fourier features »). Avantages :
//   - le résidu 0 tombe toujours sur le point (1, 0), facile à détecter ;
//   - l'encodage est continu et borné dans [-1, 1], idéal pour un réseau ;
//   - il ne « donne pas la réponse » : le réseau doit apprendre à combiner les indices.
//
// Le réseau approxime ainsi une division d'essai par les petits premiers, ce qui suffit
// à classer correctement l'immense majorité des composés. Les rares faux positifs sont
// des composés dont tous les facteurs sont > au plus grand premier de la base.

/** Base de petits premiers utilisée pour les résidus. */
export const MOD_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

/**
 * Convertit un entier n en vecteur de caractéristiques.
 * @param {number} n
 * @returns {number[]}
 */
export function encode(n) {
  const f = [];
  for (const p of MOD_PRIMES) {
    const r = n % p;
    const a = (2 * Math.PI * r) / p;
    f.push(Math.cos(a), Math.sin(a));
  }
  // Échelle logarithmique de n, normalisée ~[0,1] sur nos plages (n < ~1e9).
  f.push(Math.log(Math.max(2, n)) / 21);
  return f;
}

/** Taille du vecteur de caractéristiques. */
export const INPUT_SIZE = MOD_PRIMES.length * 2 + 1;
