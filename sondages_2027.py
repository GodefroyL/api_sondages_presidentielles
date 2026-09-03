#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de récupération des sondages du 1er tour de la présidentielle 2027
sur la page Wikipédia :
https://fr.wikipedia.org/wiki/Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027

Récupère les tableaux de la section "Sondages concernant le premier tour"
et construit un dictionnaire de la forme :

{
    1: {
        "institut": "Elabe",
        "date": "28 août",
        "resultat": {
            "Arthaud (LO)": 1.5,
            "Mélenchon (LFI)": 14.0,
            ...
        }
    },
    2: {...},
    ...
}

Quand un même sondage teste plusieurs hypothèses (plusieurs configurations
de candidats), chaque ligne du tableau HTML correspond à une hypothèse :
elle est donc traitée comme un sondage à part entière, avec le même institut
et la même date que les autres hypothèses du sondage d'origine
(les cellules "Institut"/"Date"/"Échantillon" fusionnées en HTML via
rowspan sont automatiquement recopiées sur chaque ligne).

Dépendances : requests, beautifulsoup4
    pip install requests beautifulsoup4
"""

import re
import sys
import unicodedata
import requests
from bs4 import BeautifulSoup, NavigableString, Tag

URL = (
    "https://fr.wikipedia.org/wiki/"
    "Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027"
)

SECTION_TITLE = "Sondages concernant le premier tour"

# Colonnes qu'on ne veut pas interpréter comme des candidats
NON_CANDIDATE_HEADERS = {
    "sondeur", "institut", "date", "dates", "échantillon", "echantillon",
    "commanditaire", "méthode", "methode", "publié le", "publie le",
    "date de publication", "n", "ind.", "notes",
}


# --------------------------------------------------------------------------- #
# Utilitaires texte
# --------------------------------------------------------------------------- #

def clean_text(text: str) -> str:
    """Nettoie un texte extrait de Wikipédia : espaces, notes de bas de page,
    espaces insécables, etc."""
    if text is None:
        return ""
    text = text.replace("\xa0", " ").replace("\u200b", "")
    # supprime les appels de notes du style [1], [a], [note 2] ...
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def to_float_percent(text: str):
    """Convertit une cellule de résultat ('14', '14,5', '14 %', '-', '')
    en float, ou None si ce n'est pas un nombre exploitable."""
    if text is None:
        return None
    t = clean_text(text)
    t = t.replace("%", "").strip()
    t = t.replace(",", ".")
    # certaines cellules contiennent des espaces insécables entre 2 valeurs
    # (ex: "3.5" ok, "n.d." ou "-" à ignorer)
    if t in ("", "-", "–", "—", "N/A", "n.d.", "nd", "?"):
        return None
    # garde uniquement un nombre du type 12.3
    m = re.match(r"^-?\d+(\.\d+)?$", t)
    if not m:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def normalize_header(text: str) -> str:
    t = clean_text(text).lower()
    t = "".join(
        c for c in unicodedata.normalize("NFD", t)
        if unicodedata.category(c) != "Mn"
    )
    return t.strip()


def cell_text(cell: Tag) -> str:
    """Texte propre d'une cellule (gère les <br>, liens, etc.)."""
    if cell is None:
        return ""
    # remplace les <br> par des espaces avant extraction du texte
    for br in cell.find_all("br"):
        br.replace_with(" ")
    return clean_text(cell.get_text(separator=" "))


# --------------------------------------------------------------------------- #
# Dépliage d'un tableau HTML (gestion rowspan / colspan)
# --------------------------------------------------------------------------- #

def expand_table(table: Tag):
    """
    Transforme un <table> HTML (avec rowspan/colspan) en une grille
    (liste de listes) de cellules <Tag>, où les cellules fusionnées sont
    dupliquées dans toutes les positions qu'elles occupent.
    """
    rows = table.find_all("tr", recursive=True)
    grid = []
    # occupied[r][c] = cellule déjà placée par un rowspan précédent
    pending = {}  # (row_index) -> dict(col_index -> Tag)

    row_index = 0
    for tr in rows:
        # cellules déjà occupées sur cette ligne à cause d'un rowspan précédent
        current_row_pending = pending.pop(row_index, {})
        col_index = 0
        row_cells = []

        cells = tr.find_all(["th", "td"], recursive=False)
        cell_iter = iter(cells)
        current_cell = next(cell_iter, None)

        max_col = max(
            list(current_row_pending.keys()) + [len(cells) * 2]
        ) if current_row_pending else len(cells) * 2 + 10

        while current_cell is not None or col_index in current_row_pending or col_index <= max_col:
            if col_index in current_row_pending:
                row_cells.append(current_row_pending[col_index])
                col_index += 1
                continue

            if current_cell is None:
                break

            colspan = int(current_cell.get("colspan", 1) or 1)
            rowspan = int(current_cell.get("rowspan", 1) or 1)

            for i in range(colspan):
                row_cells.append(current_cell)
                if rowspan > 1:
                    for r_off in range(1, rowspan):
                        pending.setdefault(row_index + r_off, {})[col_index + i] = current_cell
                col_index += 1

            current_cell = next(cell_iter, None)

        grid.append(row_cells)
        row_index += 1

    return grid


# --------------------------------------------------------------------------- #
# Localisation de la section et des tableaux concernés
# --------------------------------------------------------------------------- #

def find_section_tables(soup: BeautifulSoup, section_title: str):
    """
    Retourne la liste des <table> situés dans la section dont le titre
    correspond à `section_title`, en s'arrêtant au prochain titre de même
    niveau ou de niveau supérieur.
    """
    target_norm = normalize_header(section_title)

    heading = None
    heading_level = None
    for level in ("h2", "h3", "h4"):
        for h in soup.find_all(level):
            span = h.find(["span"], id=True)
            title_text = h.get_text(separator=" ")
            if target_norm in normalize_header(title_text):
                heading = h
                heading_level = int(level[1])
                break
        if heading is not None:
            break

    if heading is None:
        raise RuntimeError(
            f"Impossible de trouver la section « {section_title} » sur la page."
        )

    tables = []
    for sibling in heading.find_all_next():
        if sibling is heading:
            continue
        if sibling.name in ("h2", "h3", "h4"):
            lvl = int(sibling.name[1])
            if lvl <= heading_level:
                break
        if sibling.name == "table":
            # on ne garde que les tableaux "wikitable" (résultats de sondages)
            classes = sibling.get("class", []) or []
            if "wikitable" in classes:
                tables.append(sibling)

    return tables


# --------------------------------------------------------------------------- #
# Parsing d'un tableau de sondages
# --------------------------------------------------------------------------- #

def parse_poll_table(table: Tag):
    """
    Parse un tableau de sondages (grille dépliée) et retourne une liste de
    dicts {"institut": ..., "date": ..., "resultat": {...}}.
    """
    grid = expand_table(table)
    if not grid:
        return []

    header_row = grid[0]
    headers_norm = [normalize_header(cell_text(c)) for c in header_row]
    headers_raw = [cell_text(c) for c in header_row]

    # Repère les colonnes clés
    def find_col(*keywords):
        for idx, h in enumerate(headers_norm):
            for kw in keywords:
                if kw in h:
                    return idx
        return None

    col_institut = find_col("sondeur", "institut")
    col_date = find_col("date")
    col_echantillon = find_col("echantillon")

    # Colonnes candidates = toutes les colonnes qui ne sont pas des
    # colonnes "meta" connues
    candidate_cols = []
    for idx, h in enumerate(headers_norm):
        if idx in (col_institut, col_date, col_echantillon):
            continue
        if h in NON_CANDIDATE_HEADERS:
            continue
        if h == "":
            continue
        candidate_cols.append(idx)

    candidate_names = {idx: headers_raw[idx] for idx in candidate_cols}

    results = []
    for row in grid[1:]:
        if not row:
            continue
        # ignore les lignes d'en-tête répétées / lignes de séparation
        row_is_header = all(
            c.name == "th" for c in row if isinstance(c, Tag)
        )
        if row_is_header:
            continue

        institut = cell_text(row[col_institut]) if col_institut is not None and col_institut < len(row) else ""
        date = cell_text(row[col_date]) if col_date is not None and col_date < len(row) else ""

        if not institut and not date:
            continue

        resultat = {}
        for idx in candidate_cols:
            if idx >= len(row):
                continue
            val = to_float_percent(cell_text(row[idx]))
            if val is not None:
                resultat[candidate_names[idx]] = val

        if not resultat:
            # ligne vide de résultats (ex: ligne de notes) -> on l'ignore
            continue

        results.append({
            "institut": institut,
            "date": date,
            "resultat": resultat,
        })

    return results


# --------------------------------------------------------------------------- #
# Programme principal
# --------------------------------------------------------------------------- #

def get_sondages_premier_tour(url: str = URL, section_title: str = SECTION_TITLE):
    headers = {"User-Agent": "Mozilla/5.0 (sondages-scraper/1.0)"}
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    tables = find_section_tables(soup, section_title)

    all_rows = []
    for table in tables:
        all_rows.extend(parse_poll_table(table))

    sondages = {}
    for i, row in enumerate(all_rows, start=1):
        sondages[i] = row

    return sondages


if __name__ == "__main__":
    try:
        sondages = get_sondages_premier_tour()
    except Exception as e:
        print(f"Erreur : {e}", file=sys.stderr)
        sys.exit(1)

    import json
    print(json.dumps(sondages, ensure_ascii=False, indent=2))
    print(f"\n{len(sondages)} sondages/hypothèses récupérés.", file=sys.stderr)
