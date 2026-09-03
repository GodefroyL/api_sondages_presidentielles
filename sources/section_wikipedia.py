"""
Localisation, dans le HTML de la page Wikipédia, de la section d'intérêt
et des tableaux de sondages qu'elle contient (y compris ses sous-sections).
"""

import logging
from typing import List

from bs4 import BeautifulSoup, Tag

from utilitaires_texte import normaliser_texte

logger = logging.getLogger(__name__)

NIVEAUX_TITRES = ("h2", "h3", "h4")


def trouver_titre_section(soupe: BeautifulSoup, titre_section: str) -> Tag:
    """
    Recherche, parmi les titres de niveau h2/h3/h4 de la page, celui qui
    correspond à `titre_section` et le retourne.

    Lève une RuntimeError si aucun titre correspondant n'est trouvé.
    """
    titre_normalise_cible = normaliser_texte(titre_section)

    for niveau in NIVEAUX_TITRES:
        for titre_html in soupe.find_all(niveau):
            texte_titre = titre_html.get_text(separator=" ")
            titre_normalise = normaliser_texte(texte_titre)
            if titre_normalise_cible in titre_normalise:
                return titre_html

    raise RuntimeError(f"Impossible de trouver la section « {titre_section} » sur la page.")


def trouver_tableaux_section(soupe: BeautifulSoup, titre_section: str) -> List[Tag]:
    """
    Retourne la liste des tableaux `<table class="wikitable">` situés dans
    la section `titre_section`, y compris dans ses éventuelles
    sous-sections, en s'arrêtant au prochain titre de niveau égal ou
    supérieur à celui de la section recherchée.
    """
    titre_section_html = trouver_titre_section(soupe, titre_section)
    niveau_section = int(titre_section_html.name[1])

    logger.debug(
        "Section trouvée : <%s> %r",
        titre_section_html.name,
        titre_section_html.get_text(strip=True),
    )

    tableaux: List[Tag] = []
    for element_suivant in titre_section_html.find_all_next():
        if element_suivant is titre_section_html:
            continue

        if element_suivant.name in NIVEAUX_TITRES:
            niveau_element = int(element_suivant.name[1])
            if niveau_element <= niveau_section:
                break
            logger.debug(
                "  sous-section rencontrée : <%s> %r",
                element_suivant.name,
                element_suivant.get_text(strip=True),
            )

        if element_suivant.name == "table":
            classes_css = element_suivant.get("class", []) or []
            if "wikitable" in classes_css:
                tableaux.append(element_suivant)

    logger.debug("%d tableau(x) 'wikitable' trouvé(s) dans la section.", len(tableaux))
    return tableaux
