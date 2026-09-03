#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Récupère les sondages du 1er tour de la présidentielle 2027 depuis Wikipédia :
https://fr.wikipedia.org/wiki/Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027

Produit :
{
    1: {"institut": "Elabe", "date": "28 août", "resultat": {"Mélenchon (LFI)": 14.0, ...}},
    2: {...},
    ...
}

Chaque hypothèse d'un même sondage (plusieurs configurations de candidats)
devient une entrée séparée du dictionnaire, avec le même institut/date.

Dépendances :
    pip install requests beautifulsoup4

Usage :
    python sondages_2027.py            # affiche le JSON final
    python sondages_2027.py --debug    # affiche en plus le détail du parsing
"""

import re
import sys
import json
import unicodedata
import argparse
import requests
from bs4 import BeautifulSoup, Tag

URL = (
    "https://fr.wikipedia.org/wiki/"
    "Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027"
)

SECTION_TITLE = "Sondages concernant le premier tour"

NON_CANDIDATE_HEADERS = {
    "sondeur", "institut", "date", "dates", "date de publication",
    "echantillon", "commanditaire", "methode", "publie le", "n", "ind", "notes",
}


# --------------------------------------------------------------------------- #
# Utilitaires texte
# --------------------------------------------------------------------------- #

def clean_text(text: str) -> str:
    if text is None:
        return ""
    text = text.replace("\xa0", " ").replace("\u200b", "")
    text = re.sub(r"\[[^\]]*\]", "", text)          # notes [1], [a]...
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_header(text: str) -> str:
    t = clean_text(text).lower()
    t = "".join(c for c in unicodedata.normalize("NFD", t)
                if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-z0-9 ]", "", t)
    return t.strip()


NUMBER_RE = re.compile(r"-?\d+[.,]?\d*")


def to_float_percent(text: str):
    """Extrait le premier nombre trouvé dans la cellule (tolère '14,5 (+1)',
    '14,5 %', etc.). Retourne None si aucun nombre exploitable."""
    if not text:
        return None
    t = clean_text(text)
    m = NUMBER_RE.search(t)
    if not m:
        return None
    num = m.group(0).replace(",", ".")
    try:
        val = float(num)
    except ValueError:
        return None
    return val


def parse_result_cell(cell):
    """
    Analyse une cellule de résultat et retourne (nom_residuel, valeur).

    Certaines colonnes ont un en-tête générique ('Autre', 'PS', 'LR', ...)
    alors que le candidat réellement testé n'est précisé que dans la
    cellule elle-même (ex: '4,5 (O. Faure)', 'Ruffin 3', '3 % - F. Ruffin').
    `nom_residuel` correspond à ce texte restant une fois le nombre retiré
    (None si la cellule ne contient qu'un nombre, ou aucun nombre).
    """
    text = cell_text(cell)
    if not text:
        return None, None

    m = NUMBER_RE.search(text)
    if not m:
        return None, None

    try:
        value = float(m.group(0).replace(",", "."))
    except ValueError:
        return None, None

    leftover = text[:m.start()] + text[m.end():]
    # enlève la ponctuation/symboles habituels (%, parenthèses, tirets, flèches, égal...)
    leftover = re.sub(r"[%()+=▲▼↑↓•·]", " ", leftover)
    leftover = re.sub(r"\s+", " ", leftover).strip(" -–—.,")

    # ignore les résidus non exploitables (trop courts, purement numériques
    # résiduels, mentions usuelles sans intérêt)
    noise = {"ex", "nc", "np", "nd", "pts", "points", "voix"}
    if len(leftover) < 2 or normalize_header(leftover) in noise:
        leftover = None

    return leftover, value


def cell_text(cell) -> str:
    """Texte propre d'une cellule, avec repli sur les attributs alt/title
    des images ou liens si aucun texte visible n'est présent (cas des
    logos de partis utilisés comme en-tête de colonne)."""
    if cell is None:
        return ""
    if isinstance(cell, str):
        return clean_text(cell)

    cell_copy = cell
    for br in cell_copy.find_all("br"):
        br.replace_with(" ")

    text = clean_text(cell_copy.get_text(separator=" "))
    if text:
        return text

    # repli : alt / title des images ou des liens
    for tag in cell_copy.find_all(["img", "a", "abbr"]):
        for attr in ("alt", "title"):
            val = tag.get(attr)
            if val:
                return clean_text(val)
    return ""


# --------------------------------------------------------------------------- #
# Dépliage d'un tableau HTML (gestion rowspan / colspan)
# --------------------------------------------------------------------------- #

def expand_table(table: Tag):
    rows = table.find_all("tr", recursive=True)
    grid = []
    pending = {}

    row_index = 0
    for tr in rows:
        current_row_pending = pending.pop(row_index, {})
        col_index = 0
        row_cells = []

        cells = tr.find_all(["th", "td"], recursive=False)
        cell_iter = iter(cells)
        current_cell = next(cell_iter, None)

        max_reach = max(list(current_row_pending.keys()) + [0]) + len(cells) + 5

        while current_cell is not None or col_index in current_row_pending or col_index <= max_reach:
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

def find_section_tables(soup: BeautifulSoup, section_title: str, debug=False):
    target_norm = normalize_header(section_title)

    heading = None
    heading_level = None
    for level in ("h2", "h3", "h4"):
        for h in soup.find_all(level):
            title_text = h.get_text(separator=" ")
            if target_norm == normalize_header(title_text) or target_norm in normalize_header(title_text):
                heading = h
                heading_level = int(level[1])
                break
        if heading is not None:
            break

    if heading is None:
        raise RuntimeError(f"Impossible de trouver la section « {section_title} ».")

    if debug:
        print(f"[debug] Section trouvée : <{heading.name}> {heading.get_text(strip=True)!r}", file=sys.stderr)

    tables = []
    for sibling in heading.find_all_next():
        if sibling is heading:
            continue
        if sibling.name in ("h2", "h3", "h4"):
            lvl = int(sibling.name[1])
            if lvl <= heading_level:
                break
            if debug:
                print(f"[debug]   sous-section : <{sibling.name}> {sibling.get_text(strip=True)!r}", file=sys.stderr)
        if sibling.name == "table":
            classes = sibling.get("class", []) or []
            if "wikitable" in classes:
                tables.append(sibling)

    if debug:
        print(f"[debug] {len(tables)} tableau(x) 'wikitable' trouvé(s) dans la section.", file=sys.stderr)

    return tables


# --------------------------------------------------------------------------- #
# Parsing d'un tableau de sondages
# --------------------------------------------------------------------------- #

def build_headers(grid, debug=False):
    """Fusionne les lignes d'en-tête successives (composées uniquement de
    <th>) en un unique en-tête par colonne, et renvoie
    (headers_raw, header_row_count)."""
    header_row_count = 0
    for row in grid:
        if row and all(isinstance(c, Tag) and c.name == "th" for c in row):
            header_row_count += 1
        else:
            break
    header_row_count = max(header_row_count, 1)

    width = max(len(r) for r in grid[:header_row_count]) if grid else 0
    headers_raw = [""] * width

    for col in range(width):
        parts = []
        prev = None
        for row in grid[:header_row_count]:
            if col >= len(row):
                continue
            txt = cell_text(row[col])
            if txt and txt != prev:
                parts.append(txt)
            prev = txt if txt else prev
        headers_raw[col] = " – ".join(dict.fromkeys(parts))  # dédoublonne en gardant l'ordre

    if debug:
        print(f"[debug]   en-têtes ({header_row_count} ligne(s) fusionnée(s)) : {headers_raw}", file=sys.stderr)

    return headers_raw, header_row_count


def merge_candidate_name(base_name: str, leftover_name):
    """
    Combine le nom de la colonne (en-tête, éventuellement générique comme
    'Autre' ou 'PS') avec le nom résiduel trouvé dans la cellule de résultat.

    - Si aucun nom résiduel : on garde simplement le nom de la colonne.
    - Si le nom résiduel est déjà contenu dans le nom de colonne (ou
      inversement) : on évite la duplication, on garde le plus informatif.
    - Sinon (cas 'Autre' + 'F. Ruffin', ou 'PS' + 'O. Faure') : on combine
      les deux, ex. 'Autre (F. Ruffin)' ou 'PS (O. Faure)'.
    """
    if not leftover_name:
        return base_name

    base_norm = normalize_header(base_name)
    left_norm = normalize_header(leftover_name)

    if not base_name:
        return leftover_name

    if base_norm == left_norm:
        return base_name

    if left_norm in base_norm:
        return base_name
    if base_norm in left_norm:
        return leftover_name

    return f"{base_name} ({leftover_name})"


def parse_poll_table(table: Tag, debug=False):
    grid = expand_table(table)
    if not grid:
        return []

    headers_raw, header_row_count = build_headers(grid, debug=debug)
    headers_norm = [normalize_header(h) for h in headers_raw]

    def find_col(*keywords):
        for idx, h in enumerate(headers_norm):
            for kw in keywords:
                if kw in h:
                    return idx
        return None

    col_institut = find_col("sondeur", "institut")
    col_date = find_col("date")
    col_echantillon = find_col("echantillon")

    candidate_cols = []
    for idx, h in enumerate(headers_norm):
        if idx in (col_institut, col_date, col_echantillon):
            continue
        if h in NON_CANDIDATE_HEADERS or h == "":
            continue
        candidate_cols.append(idx)

    candidate_names = {idx: headers_raw[idx] for idx in candidate_cols}

    results = []
    for row in grid[header_row_count:]:
        if not row:
            continue
        # ignore les lignes ne contenant que des <th> (en-têtes répétées)
        if all(isinstance(c, Tag) and c.name == "th" for c in row):
            continue

        institut = cell_text(row[col_institut]) if col_institut is not None and col_institut < len(row) else ""
        date = cell_text(row[col_date]) if col_date is not None and col_date < len(row) else ""

        if not institut and not date:
            continue

        resultat = {}
        for idx in candidate_cols:
            if idx >= len(row):
                continue

            leftover_name, val = parse_result_cell(row[idx])
            if val is None:
                continue

            base_name = candidate_names[idx]
            final_name = merge_candidate_name(base_name, leftover_name)
            resultat[final_name] = val

            if debug and leftover_name:
                print(f"[debug]     colonne {base_name!r} -> nom trouvé dans la cellule : "
                      f"{leftover_name!r} => clé finale {final_name!r}", file=sys.stderr)

        if not resultat:
            continue

        results.append({"institut": institut, "date": date, "resultat": resultat})

    if debug:
        print(f"[debug]   -> {len(results)} ligne(s) de résultats extraite(s) sur ce tableau.", file=sys.stderr)

    return results


# --------------------------------------------------------------------------- #
# Programme principal
# --------------------------------------------------------------------------- #

def get_sondages_premier_tour(url: str = URL, section_title: str = SECTION_TITLE, debug=False):
    headers = {"User-Agent": "Mozilla/5.0 (sondages-scraper/1.1)"}
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    tables = find_section_tables(soup, section_title, debug=debug)

    all_rows = []
    for i, table in enumerate(tables, start=1):
        if debug:
            print(f"[debug] --- Tableau {i}/{len(tables)} ---", file=sys.stderr)
        all_rows.extend(parse_poll_table(table, debug=debug))

    return {i: row for i, row in enumerate(all_rows, start=1)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug", action="store_true", help="affiche le détail du parsing sur stderr")
    args = parser.parse_args()

    try:
        sondages = get_sondages_premier_tour(debug=args.debug)
    except Exception as e:
        print(f"Erreur : {e}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(sondages, ensure_ascii=False, indent=2))
    print(f"\n{len(sondages)} sondages/hypothèses récupérés au total.", file=sys.stderr)
