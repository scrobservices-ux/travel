#!/usr/bin/env python3
"""Veille marchés publics — nettoyage / propreté pour SCROB SERVICES.

Interroge l'API open data officielle du BOAMP (DILA) et remonte les avis de
marché de nettoyage / propreté dans la zone d'intervention de SCROB SERVICES
(Val-d'Oise 95, Oise 60, Seine-et-Marne 77, Seine-Saint-Denis 93).

- Aucune dépendance externe : uniquement la bibliothèque standard Python 3.
- Produit trois fichiers dans veille/ :
    * derniers-resultats.md  -> tableau complet des avis ouverts (archive du jour)
    * nouveaux.md            -> uniquement les avis jamais vus (corps de l'issue)
    * _seen.json             -> mémoire des idweb déjà signalés
- Code de sortie 0 toujours ; le nombre de nouveaux avis est écrit sur stdout
  et exposé via GITHUB_OUTPUT (clé "new_count") pour le workflow.

Usage :  python3 veille/boamp_veille.py
Doc API : https://boamp-datadila.opendatasoft.com/explore/dataset/boamp/api/
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime

# --- Paramètres de la veille ---------------------------------------------------

API = (
    "https://boamp-datadila.opendatasoft.com"
    "/api/explore/v2.1/catalog/datasets/boamp/records"
)

# Départements de la zone d'intervention SCROB SERVICES
DEPARTEMENTS = ["95", "60", "77", "93"]

# Mots-clés métier (recherche plein texte sur l'objet du marché)
KEYWORDS = [
    "nettoyage", "propreté", "proprete", "entretien des locaux",
    "entretien ménager", "vitrerie",
]

# Marqueurs "faible concurrence" mis en avant dans le rapport
LOW_COMP = ["infructueux", "infructueuse", "relance", "sans suite", "nouvelle consultation"]
MAPA = ["adaptée", "adaptee", "mapa", "procédure adaptée"]

# Hors métier SCROB : écartés même si l'objet contient "nettoyage"
EXCLUDE = [
    "blanchisserie", "fourniture de produits", "fournitures de produits",
    "produits d'entretien", "matériels de nettoyage", "menuiseries",
    "ascenseur", "traitement d'air", "voies et espaces publics",
    "propreté urbaine", "déménagement", "corbeilles", "réseaux",
]

# Avis de résultat / attribution : le marché est déjà passé
ATTRIBUTION = ["attribution", "résultat", "resultat"]

# Un avis sans date limite n'est gardé que s'il a moins de N jours
NO_DEADLINE_MAX_AGE_DAYS = 45

HERE = os.path.dirname(os.path.abspath(__file__))
SEEN_FILE = os.path.join(HERE, "_seen.json")
FULL_FILE = os.path.join(HERE, "derniers-resultats.md")
NEW_FILE = os.path.join(HERE, "nouveaux.md")

TIMEOUT = 60


# --- Accès API -----------------------------------------------------------------

def build_where() -> str:
    """Construit la clause `where` du langage de requête Opendatasoft."""
    deps = " or ".join(f'code_departement = "{d}"' for d in DEPARTEMENTS)
    kw = " or ".join(f'objet like "{k}"' for k in KEYWORDS)
    # Avis de marché uniquement (on exclut les résultats/attributions du flux principal),
    # mais on garde large pour ne rien rater : le filtre de date fait le reste.
    return f"({deps}) and ({kw})"


def fetch(limit: int = 100) -> list[dict]:
    """Récupère les avis correspondants, les plus récents d'abord."""
    params = {
        "where": build_where(),
        "order_by": "dateparution desc",
        "limit": str(limit),
    }
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "scrob-veille/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.load(resp)
    return data.get("results", [])


# --- Traitement ----------------------------------------------------------------

def g(rec: dict, *keys: str) -> str:
    """Récupère la première clé présente et non vide (tolérant au schéma)."""
    for k in keys:
        v = rec.get(k)
        if isinstance(v, list):
            v = ", ".join(str(x) for x in v if x)
        if v:
            return str(v).strip()
    return ""


def clean(s: str) -> str:
    """Texte d'affichage : entités HTML décodées, sur une seule ligne."""
    s = html.unescape(html.unescape(s))
    return re.sub(r"\s+", " ", s).replace("|", "/").strip()


def parse_date(s: str):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None


def tags(objet: str, procedure: str) -> str:
    blob = (objet + " " + procedure).lower()
    out = []
    if any(t in blob for t in LOW_COMP):
        out.append("🔁 RELANCE/INFRUCTUEUX")
    if any(t in blob for t in MAPA):
        out.append("🟢 MAPA")
    return " ".join(out)


def normalise(rec: dict) -> dict:
    objet = clean(g(rec, "objet"))
    procedure = g(rec, "procedure_libelle", "procedure_categorise_libelle")
    deadline = parse_date(g(rec, "datelimitereponse", "date_limite_reponse"))
    return {
        "idweb": g(rec, "idweb", "id"),
        "objet": objet,
        "acheteur": clean(g(rec, "nomacheteur", "nom_acheteur")),
        "nature": " ".join(
            g(rec, k) for k in (
                "nature_libelle", "nature_categorise_libelle", "type_avis", "famille_libelle",
            )
        ).lower(),
        "dept": g(rec, "code_departement"),
        "parution": parse_date(g(rec, "dateparution")),
        "deadline": deadline,
        "procedure": procedure,
        "url": g(rec, "url_avis") or (
            f"https://www.boamp.fr/pages/avis/?q=idweb:{g(rec, 'idweb', 'id')}"
        ),
        "tags": tags(objet, procedure),
    }


def is_open(item: dict, today: date) -> bool:
    """Avis de marché pertinent et encore ouvert.

    Écarte les avis d'attribution, les objets hors métier, les échéances passées
    et les avis sans date limite trop anciens (probablement clos).
    """
    if any(t in item["nature"] for t in ATTRIBUTION):
        return False
    if any(t in item["objet"].lower() for t in EXCLUDE):
        return False
    if item["deadline"] is not None:
        return item["deadline"] >= today
    return (
        item["parution"] is not None
        and (today - item["parution"]).days <= NO_DEADLINE_MAX_AGE_DAYS
    )


def fmt_row(it: dict) -> str:
    dl = it["deadline"].strftime("%d/%m/%Y") if it["deadline"] else "—"
    objet = it["objet"][:120] + ("…" if len(it["objet"]) > 120 else "")
    flag = (" " + it["tags"]) if it["tags"] else ""
    return (
        f"| [{objet}]({it['url']}){flag} | {it['acheteur'] or '—'} "
        f"| {it['dept'] or '—'} | **{dl}** |"
    )


def render_table(items: list[dict], title: str) -> str:
    lines = [f"## {title}", ""]
    if not items:
        lines.append("_Aucun avis correspondant pour le moment._")
        return "\n".join(lines) + "\n"
    lines += [
        "| Objet du marché | Acheteur | Dépt | Date limite |",
        "|---|---|---|---|",
    ]
    lines += [fmt_row(it) for it in items]
    return "\n".join(lines) + "\n"


# --- Main ----------------------------------------------------------------------

def load_seen() -> set[str]:
    try:
        with open(SEEN_FILE, encoding="utf-8") as f:
            return set(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def save_seen(seen: set[str]) -> None:
    with open(SEEN_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(seen), f, ensure_ascii=False, indent=0)


def set_output(key: str, value: str) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"{key}={value}\n")


def main() -> int:
    today = date.today()
    stamp = today.strftime("%d/%m/%Y")

    try:
        raw = fetch()
    except Exception as exc:  # réseau / API : on échoue proprement
        print(f"ERREUR appel API BOAMP : {exc}", file=sys.stderr)
        return 1

    if raw:  # trace du schéma dans les logs Actions, pour ajuster les filtres
        print("Champs BOAMP :", ", ".join(sorted(raw[0].keys())), file=sys.stderr)

    items = [normalise(r) for r in raw]
    open_items = [it for it in items if is_open(it, today)]
    # tri : faible concurrence d'abord, puis échéance la plus proche
    open_items.sort(key=lambda it: (not it["tags"], it["deadline"] or date.max))

    seen = load_seen()
    new_items = [it for it in open_items if it["idweb"] and it["idweb"] not in seen]

    # Rapport complet du jour (archive)
    header = (
        f"# Veille nettoyage / propreté — SCROB SERVICES\n\n"
        f"_Zone : Val-d'Oise (95), Oise (60), Seine-et-Marne (77), "
        f"Seine-Saint-Denis (93) · Source : BOAMP open data · "
        f"Mis à jour le {stamp}_\n\n"
        f"**{len(open_items)} avis ouverts** dont **{len(new_items)} nouveaux** "
        f"depuis le dernier passage.\n\n"
        f"> 🟢 MAPA = procédure adaptée (peu de concurrence) · "
        f"🔁 = relance / marché infructueux (concurrence déjà faible)\n\n"
    )
    with open(FULL_FILE, "w", encoding="utf-8") as f:
        f.write(header + render_table(open_items, "Tous les avis ouverts"))

    # Fichier des nouveautés (corps de l'issue GitHub)
    with open(NEW_FILE, "w", encoding="utf-8") as f:
        if new_items:
            f.write(
                f"### {len(new_items)} nouvel(le)s avis de nettoyage — {stamp}\n\n"
                + render_table(new_items, "Nouveaux avis")
                + "\n_Liste complète à jour : `veille/derniers-resultats.md`_\n"
            )
        else:
            f.write(f"_Aucun nouvel avis le {stamp}._\n")

    # Mémorisation
    seen.update(it["idweb"] for it in open_items if it["idweb"])
    save_seen(seen)

    print(f"{len(open_items)} avis ouverts, {len(new_items)} nouveaux.")
    set_output("new_count", str(len(new_items)))
    set_output("open_count", str(len(open_items)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
