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

Chaque hypothèse d'un même sondage (plusieurs configurations de candidats testées) devient une entrée séparée du dictionnaire, avec le même institut et la même date.

Dépendances :
    pip install requests beautifulsoup4

Usage :
    python main.py => affiche le résultat en JSON sur la sortie standard
    python main.py --debug => affiche en plus le détail du parsing (sur stderr)
    python main.py --sortie resultat.json => enregistre le résultat dans un fichier
"""

import requests
from bs4 import BeautifulSoup

from .config import DELAI_MAXIMUM_REQUETE, EN_TETE_HTTP, TITRE_SECTION, URL_PAGE_WIKIPEDIA
from .analyse_sondages import Sondage, analyser_tableau_sondage
from .section_wikipedia import trouver_tableaux_section
from .candidats import Candidats



def recuperer_page_html(url: str) -> BeautifulSoup:
    """Télécharge la page Wikipédia et retourne son contenu analysé (BeautifulSoup)."""
    reponse = requests.get(url, headers=EN_TETE_HTTP, timeout=DELAI_MAXIMUM_REQUETE)
    reponse.raise_for_status()
    return BeautifulSoup(reponse.text, "html.parser")


def recuperer_sondages_premier_tour(
    annee: str = "2027",
    url: str = URL_PAGE_WIKIPEDIA,
    titre_section: str = TITRE_SECTION,
) -> dict[int, dict]:
    """
    Fonction principale : télécharge la page, repère les tableaux de la section demandée, les analyse, puis retourne le dictionnaire final numéroté à partir de 1.
    """
    contenu_page = recuperer_page_html(url+annee)
    tableaux = trouver_tableaux_section(contenu_page, titre_section)

# Initialisation des sorties
    liste_sondages: list[Sondage] = []
    liste_instituts: set[str] = set()
    candidats = Candidats()

    date = annee
    for _, tableau in enumerate(tableaux, start=1):
        if len(tableau) == 4: date = tableau
        else:
            analyse_tableau_sondage = analyser_tableau_sondage(tableau, candidats, date)
            liste_sondages.extend(analyse_tableau_sondage.get('sondages'))
            for institut in analyse_tableau_sondage.get("instituts",[]): liste_instituts.add(institut)
            candidats = analyse_tableau_sondage.get("candidats")

    sondages =  {indice+1: sondage.vers_dictionnaire() for indice, sondage in enumerate(liste_sondages)}

    return {
        "annee": annee,
        "tour": 1,
        "liste candidats": candidats.liste_candidats,
        "liste_instituts": list(liste_instituts),
        "sondages": sondages,
    }


def main(annee: str = "2027") -> dict[int|str, dict|str]:
    try:
        return recuperer_sondages_premier_tour(annee)
    except Exception as e:
        nom_fichier = e.__traceback__.tb_frame.f_code.co_filename.replace('c:\\Users\\godef\\Documents\\projets_python\\api_sondages_presidentielles\\sources\\','')
        message_erreur = f'Échec de la récupération des sondages, erreur à la ligne {e.__traceback__.tb_lineno} du fichier {nom_fichier} :\n{str(e)}\n'
        return message_erreur


if __name__ == "__main__":
    sondages = main("2017")
    print(sondages)
