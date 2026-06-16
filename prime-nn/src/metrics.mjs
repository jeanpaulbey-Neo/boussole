// Métriques de classification binaire.

/**
 * @param {MLP-like} net objet avec predict(x)
 * @param {number[][]} X
 * @param {number[]} Y
 * @param {number} threshold seuil de décision (défaut 0.5)
 */
export function evaluate(net, X, Y, threshold = 0.5) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < X.length; i++) {
    const p = net.predict(X[i]) >= threshold ? 1 : 0;
    const y = Y[i];
    if (p === 1 && y === 1) tp++;
    else if (p === 0 && y === 0) tn++;
    else if (p === 1 && y === 0) fp++;
    else fn++;
  }
  const accuracy = (tp + tn) / (X.length || 1);
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, tn, fp, fn, accuracy, precision, recall, f1, n: X.length };
}

/** Formatage lisible d'un rapport de métriques. */
export function formatReport(name, m) {
  const pct = (x) => (x * 100).toFixed(2) + ' %';
  return [
    `=== ${name} (n=${m.n}) ===`,
    `  Exactitude (accuracy) : ${pct(m.accuracy)}`,
    `  Précision             : ${pct(m.precision)}`,
    `  Rappel (recall)       : ${pct(m.recall)}`,
    `  F1                    : ${pct(m.f1)}`,
    `  Matrice : VP=${m.tp}  VN=${m.tn}  FP=${m.fp}  FN=${m.fn}`,
  ].join('\n');
}
