#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Récupère les sondages du premier tour de l'élection présidentielle
française de 2027 depuis la page Wikipédia dédiée, et produit un
dictionnaire de la forme :

{
    1: {"institut": "Elabe", "date": "28 août", "resultat": {"Mélenchon (LFI)": 14.0, ...}},
    2: {...},
    ...
}

Chaque hypothèse d'un même sondage (plusieurs configurations de candidats
testées) devient une entrée séparée du dictionnaire, avec le même institut
et la même date.

Dépendances :
    pip install requests beautifulsoup4

Usage :
    python main.py                # affiche le résultat en JSON sur la sortie standard
    python main.py --debug        # affiche en plus le détail du parsing (sur stderr)
    python main.py --sortie resultat.json   # enregistre le résultat dans un fichier
"""

import argparse
import json
import logging
import sys
from typing import Dict

import requests
from bs4 import BeautifulSoup

from config import DELAI_MAXIMUM_REQUETE, EN_TETE_HTTP, TITRE_SECTION, URL_PAGE_WIKIPEDIA
from analyse_sondages import Sondage, analyser_tableau_sondage
from section_wikipedia import trouver_tableaux_section

logger = logging.getLogger(__name__)


def recuperer_page_html(url: str) -> BeautifulSoup:
    """Télécharge la page Wikipédia et retourne son contenu analysé (BeautifulSoup)."""
    reponse = requests.get(url, headers=EN_TETE_HTTP, timeout=DELAI_MAXIMUM_REQUETE)
    reponse.raise_for_status()
    return BeautifulSoup(reponse.text, "html.parser")


def recuperer_sondages_premier_tour(
    url: str = URL_PAGE_WIKIPEDIA,
    titre_section: str = TITRE_SECTION,
) -> Dict[int, dict]:
    """
    Fonction principale : télécharge la page, repère les tableaux de la
    section demandée, les analyse, puis retourne le dictionnaire final
    numéroté à partir de 1.
    """
    soupe = recuperer_page_html(url)
    tableaux = trouver_tableaux_section(soupe, titre_section)

    tous_les_sondages: list[Sondage] = []
    for indice_tableau, tableau in enumerate(tableaux, start=1):
        logger.debug("--- Tableau %d/%d ---", indice_tableau, len(tableaux))
        tous_les_sondages.extend(analyser_tableau_sondage(tableau))

    return {
        indice: sondage.vers_dictionnaire()
        for indice, sondage in enumerate(tous_les_sondages, start=1)
    }


def configurer_journalisation(mode_debug: bool) -> None:
    """Configure le module logging : niveau DEBUG si demandé, sinon INFO."""
    niveau = logging.DEBUG if mode_debug else logging.INFO
    logging.basicConfig(
        level=niveau,
        format="[%(levelname)s] %(message)s",
        stream=sys.stderr,
    )


def analyser_arguments() -> argparse.Namespace:
    """Définit et analyse les arguments de la ligne de commande."""
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument(
        "--debug", action="store_true",
        help="affiche le détail du parsing (sections, tableaux, en-têtes...) sur stderr",
    )
    analyseur.add_argument(
        "--sortie", metavar="FICHIER",
        help="enregistre le résultat JSON dans FICHIER au lieu de l'afficher",
    )
    return analyseur.parse_args()


def lecture_page_sondage() -> None:
    arguments = analyser_arguments()
    configurer_journalisation(arguments.debug)

    try:
        sondages = recuperer_sondages_premier_tour()
    except Exception as erreur:
        logger.error("Échec de la récupération des sondages : %s", erreur)
        sys.exit(1)

    contenu_json = json.dumps(sondages, ensure_ascii=False, indent=2)

    if arguments.sortie:
        with open(arguments.sortie, "w", encoding="utf-8") as fichier:
            fichier.write(contenu_json)
        logger.info("Résultat enregistré dans %s", arguments.sortie)
    else:
        return sondages

    logger.info("%d sondage(s)/hypothèse(s) récupéré(s) au total.", len(sondages))


if __name__ == "__main__":
    sondages = lecture_page_sondage()
    print(sondages)
