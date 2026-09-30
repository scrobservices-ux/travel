# Veille appels d'offres — nettoyage / propreté (SCROB SERVICES)

Surveillance **automatique et quotidienne** des marchés publics de nettoyage
dans la zone d'intervention de SCROB SERVICES : **Val-d'Oise (95), Oise (60),
Seine-et-Marne (77), Seine-Saint-Denis (93)**.

La source est l'**API open data officielle du BOAMP** (Bulletin officiel des
annonces des marchés publics, éditée par la DILA) — gratuite et publique.

## Ce que ça fait

Chaque matin, un job GitHub Actions :

1. interroge le BOAMP pour les avis de marché contenant `nettoyage`, `propreté`,
   `entretien des locaux` ou `vitrerie` dans les départements 95 / 60 / 77 / 93 ;
2. ne garde que les **avis encore ouverts** (date limite non dépassée) ;
3. met en avant les opportunités à **faible concurrence** :
   - 🟢 **MAPA** (procédure adaptée) — peu de candidats,
   - 🔁 **relance / marché infructueux** — concurrence déjà prouvée faible ;
4. écrit le rapport du jour dans [`derniers-resultats.md`](derniers-resultats.md) ;
5. **ouvre une issue GitHub** listant uniquement les *nouveaux* avis — GitHub
   vous notifie alors par e-mail automatiquement.

Les avis déjà signalés sont mémorisés dans `_seen.json` pour ne notifier que les
nouveautés.

## Activer la veille automatique

> ⚠️ **Important** : GitHub n'exécute les workflows planifiés que depuis la
> **branche par défaut** (`main`). Il faut donc fusionner cette branche dans
> `main` pour que la veille quotidienne démarre.

Pour être notifié par e-mail, assurez-vous de **watcher** le dépôt
(Watch → All Activity, ou au minimum les Issues).

## Lancer à la main / tester

- Sur GitHub : onglet **Actions** → *Veille appels d'offres nettoyage (BOAMP)*
  → **Run workflow**.
- En local :

  ```bash
  python3 veille/boamp_veille.py
  ```

  (aucune dépendance — Python 3 standard ; nécessite un accès réseau sortant
  vers `boamp-datadila.opendatasoft.com`).

## Régler les paramètres

Tout est en haut de [`boamp_veille.py`](boamp_veille.py) :

| Variable | Rôle |
|---|---|
| `DEPARTEMENTS` | départements surveillés (`95`, `60`, `77`, `93`) |
| `KEYWORDS` | mots-clés métier recherchés dans l'objet du marché |
| `LOW_COMP` | marqueurs « relance / infructueux » mis en avant |
| `MAPA` | marqueurs « procédure adaptée » |

La fréquence se règle dans le `cron` de
[`.github/workflows/veille-boamp.yml`](../.github/workflows/veille-boamp.yml).
