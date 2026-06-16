# prime-nn — un réseau de neurones pour les nombres premiers

Petit projet autonome : **un perceptron multicouche (MLP) écrit à la main en
JavaScript pur, sans aucune dépendance**, qui apprend à répondre à la question
*« cet entier est-il premier ? »* (classification binaire). En bonus, il devine aussi
le **prochain nombre premier** à partir d'un entier donné.

Le code est entièrement indépendant du reste du dépôt (PWA OptiBoussole) — il en
réutilise simplement le style (ES modules `.mjs`, tests Node sans framework).

## Pourquoi c'est intéressant (et honnête)

La primalité n'est **pas** une fonction « lisse » d'un entier : un réseau qui reçoit
`n` brut (ou ses bits) n'apprend quasiment rien. On donne donc au réseau des **indices
arithmétiques** pertinents — le **résidu de `n` modulo chacun des petits premiers**
`2, 3, 5, …, 47` — encodés de façon cyclique par `(cos, sin)` de l'angle
`2π·(n mod p)/p` (*Fourier features*).

Le réseau apprend alors, tout seul, une forme de **division d'essai** :
- un résidu nul modulo `p` (pour `n > p`) prouve que `n` est composé ;
- l'encodage `(cos, sin)` place ce cas exactement sur le point `(1, 0)`, facile à repérer ;
- le réseau doit quand même **apprendre à combiner** ces 15 indices — la réponse ne lui
  est pas donnée directement.

**Limite assumée :** le réseau ne peut détecter que les composés ayant un facteur premier
≤ 47. Un composé comme `7921 = 89²` n'a aucun petit facteur → le réseau le croit premier.
C'est la principale source d'erreurs, clairement visible dans les sorties.

## Résultats mesurés

Entraînement sur `[2, 200000]` (≈ 54 000 échantillons rééquilibrés), 60 époques, ~25 s :

| Jeu | Exactitude | Précision | Rappel | F1 |
|-----|-----------:|----------:|-------:|---:|
| Test (entiers vus au hasard) | ~92 % | ~81 % | ~99,9 % | ~90 % |
| Extrapolation (`> 200000`) | ~89 % | ~42 % | ~99,6 % | ~59 % |

Lecture : **rappel quasi parfait** (le réseau rate très peu de vrais premiers) mais
**précision plus basse** (il signale comme premiers des composés sans petit facteur).
La précision chute en extrapolation car les premiers se raréfient et la base de premiers
reste fixe. Ces chiffres sont reproductibles (graines fixées) et non maquillés.

## Utilisation

```bash
cd prime-nn

# 1) Tests (vérité-terrain, encodage, apprentissage XOR + primalité)
npm test

# 2) (Ré)entraîner le modèle  →  écrit web/model.json
npm run train                 # défaut : limite 200000, 60 époques
node src/train.mjs 500000 80  # plus gros / plus long

# 3) Valider des nombres précis (réseau vs vérité-terrain)
node src/predict.mjs 2 7 12 91 97 561 7919 7920 104729

# 4) Bonus : deviner le prochain premier
node src/next.mjs 100 1000 7919 100000

# 5) Démo navigateur (saisir un nombre, voir la probabilité)
npm run serve   # sert prime-nn/ ; ouvrir http://localhost:8001/web/
```

## Arborescence

```
prime-nn/
├── src/
│   ├── sieve.mjs      Vérité-terrain : isPrime, crible d'Ératosthène, nextPrime
│   ├── features.mjs   Encodage entier → vecteur (résidus mod petits premiers, Fourier)
│   ├── nn.mjs         MLP from scratch : forward, backprop, SGD+momentum, JSON
│   ├── dataset.mjs    Construction + rééquilibrage + split entraînement/test
│   ├── metrics.mjs    Exactitude, précision, rappel, F1, matrice de confusion
│   ├── train.mjs      Entraîne, évalue, choisit le seuil, sauvegarde le modèle
│   ├── predict.mjs    CLI de validation de primalité
│   └── next.mjs       CLI « prochain premier » (réutilise le classifieur)
├── web/
│   ├── index.html     Démo interactive (charge model.json)
│   ├── model.json     Modèle entraîné (poids + seuil)
│   └── *-browser.mjs  Ré-exports navigateur (source unique dans src/)
└── test/
    └── nn.test.mjs    Tests sans dépendance (node test/nn.test.mjs)
```

## Ce que le projet illustre

- Un réseau de neurones **complet** (propagation avant, rétropropagation, descente de
  gradient par mini-lots avec momentum, initialisation de He) en ~180 lignes, sans lib.
- L'importance capitale de l'**ingénierie des caractéristiques** : le même réseau passe
  du hasard à >90 % d'exactitude uniquement grâce à un meilleur encodage de l'entrée.
- Une démarche d'évaluation **rigoureuse** : split train/test, extrapolation hors plage,
  métriques adaptées au déséquilibre de classes, et limites explicitées.
