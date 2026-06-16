// Perceptron multicouche (MLP) écrit à la main — aucune dépendance externe.
// Couches denses, activation ReLU sur les couches cachées, sigmoïde en sortie,
// perte d'entropie croisée binaire, descente de gradient stochastique par mini-lots
// avec momentum. Sérialisable en JSON pour sauvegarde/chargement.

/** Générateur pseudo-aléatoire déterministe (mulberry32) pour la reproductibilité. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const relu = (x) => (x > 0 ? x : 0);
const reluD = (x) => (x > 0 ? 1 : 0);
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export class MLP {
  /**
   * @param {number[]} sizes ex. [31, 24, 16, 1] : entrée, cachées..., sortie(1)
   * @param {number} seed graine aléatoire
   */
  constructor(sizes, seed = 1234) {
    this.sizes = sizes.slice();
    const rnd = mulberry32(seed);
    this.W = []; // poids par couche : W[l][j][i]
    this.b = []; // biais par couche : b[l][j]
    this.vW = []; // vitesses (momentum)
    this.vb = [];
    for (let l = 1; l < sizes.length; l++) {
      const nin = sizes[l - 1];
      const nout = sizes[l];
      // Initialisation de He (adaptée à ReLU).
      const scale = Math.sqrt(2 / nin);
      const w = [], vw = [], b = [], vb = [];
      for (let j = 0; j < nout; j++) {
        const row = [], vrow = [];
        for (let i = 0; i < nin; i++) {
          row.push((rnd() * 2 - 1) * scale);
          vrow.push(0);
        }
        w.push(row); vw.push(vrow);
        b.push(0); vb.push(0);
      }
      this.W.push(w); this.vW.push(vw);
      this.b.push(b); this.vb.push(vb);
    }
  }

  /**
   * Propagation avant. Renvoie la sortie scalaire et garde les activations en cache.
   * @param {number[]} x
   * @returns {{ out: number, a: number[][], z: number[][] }}
   */
  forward(x) {
    const a = [x];      // activations par couche (a[0] = entrée)
    const z = [null];   // pré-activations
    let cur = x;
    const L = this.W.length;
    for (let l = 0; l < L; l++) {
      const w = this.W[l], b = this.b[l];
      const nout = w.length;
      const zl = new Array(nout);
      const al = new Array(nout);
      const last = l === L - 1;
      for (let j = 0; j < nout; j++) {
        let s = b[j];
        const row = w[j];
        for (let i = 0; i < cur.length; i++) s += row[i] * cur[i];
        zl[j] = s;
        al[j] = last ? sigmoid(s) : relu(s);
      }
      z.push(zl); a.push(al);
      cur = al;
    }
    return { out: cur[0], a, z };
  }

  /** Prédiction (probabilité que l'entrée soit « premier »). */
  predict(x) {
    return this.forward(x).out;
  }

  /**
   * Entraînement par mini-lots.
   * @param {number[][]} X échantillons
   * @param {number[]} Y étiquettes 0/1
   * @param {object} opts
   */
  fit(X, Y, opts = {}) {
    const {
      epochs = 40,
      lr = 0.05,
      batchSize = 64,
      momentum = 0.9,
      posWeight = 1,      // poids de la classe positive (premiers, rares)
      seed = 7,
      onEpoch = null,
    } = opts;
    const N = X.length;
    const L = this.W.length;
    const rnd = mulberry32(seed);
    const idx = [...Array(N).keys()];

    for (let ep = 0; ep < epochs; ep++) {
      // mélange
      for (let i = N - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      let loss = 0;
      for (let start = 0; start < N; start += batchSize) {
        const end = Math.min(start + batchSize, N);
        const m = end - start;
        // accumulateurs de gradients
        const gW = this.W.map((w) => w.map((row) => row.map(() => 0)));
        const gb = this.b.map((b) => b.map(() => 0));

        for (let s = start; s < end; s++) {
          const xi = X[idx[s]];
          const yi = Y[idx[s]];
          const { out, a, z } = this.forward(xi);
          const w = yi === 1 ? posWeight : 1;
          // perte BCE pondérée
          const eps = 1e-7;
          loss += -w * (yi * Math.log(out + eps) + (1 - yi) * Math.log(1 - out + eps));

          // rétropropagation : delta de la couche de sortie (sigmoïde + BCE)
          let delta = [w * (out - yi)];
          for (let l = L - 1; l >= 0; l--) {
            const aPrev = a[l];
            const gWl = gW[l], gbl = gb[l];
            for (let j = 0; j < delta.length; j++) {
              const dj = delta[j];
              gbl[j] += dj;
              const row = gWl[j];
              for (let i = 0; i < aPrev.length; i++) row[i] += dj * aPrev[i];
            }
            if (l > 0) {
              // propager vers la couche précédente (ReLU)
              const nPrev = aPrev.length;
              const next = new Array(nPrev).fill(0);
              const wl = this.W[l];
              for (let j = 0; j < delta.length; j++) {
                const dj = delta[j];
                const row = wl[j];
                for (let i = 0; i < nPrev; i++) next[i] += dj * row[i];
              }
              const zPrev = z[l];
              for (let i = 0; i < nPrev; i++) next[i] *= reluD(zPrev[i]);
              delta = next;
            }
          }
        }

        // mise à jour avec momentum
        for (let l = 0; l < L; l++) {
          const w = this.W[l], vw = this.vW[l], b = this.b[l], vb = this.vb[l];
          const gw = gW[l], gbl = gb[l];
          for (let j = 0; j < w.length; j++) {
            const row = w[j], vrow = vw[j], grow = gw[j];
            for (let i = 0; i < row.length; i++) {
              const g = grow[i] / m;
              vrow[i] = momentum * vrow[i] - lr * g;
              row[i] += vrow[i];
            }
            const gbj = gbl[j] / m;
            vb[j] = momentum * vb[j] - lr * gbj;
            b[j] += vb[j];
          }
        }
      }
      if (onEpoch) onEpoch(ep + 1, loss / N);
    }
    return this;
  }

  /** Sérialisation en objet JSON simple. */
  toJSON() {
    return { sizes: this.sizes, W: this.W, b: this.b };
  }

  /** Reconstruit un MLP depuis un objet JSON. */
  static fromJSON(obj) {
    const net = new MLP(obj.sizes, 1);
    net.W = obj.W;
    net.b = obj.b;
    net.vW = obj.W.map((w) => w.map((row) => row.map(() => 0)));
    net.vb = obj.b.map((b) => b.map(() => 0));
    return net;
  }
}
