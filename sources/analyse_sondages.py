"""
Analyse métier d'un tableau de sondages déjà "déplié" (cf. tableau_html.py) :
    reconstruction des en-têtes, association nom de candidat / résultat, et production des objets Sondage.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from bs4 import Tag

from .config import ENTETES_NON_CANDIDATS
from .tableau_html import deplier_tableau, lecture_tableau
from .utilitaires import formaliser_date, separer_nombre_texte, formaliser_valeur, sondage_recent, formaliser_institut
from .candidats import Candidats



@dataclass
class Sondage:
    """Représente un sondage (ou une hypothèse de sondage) du premier tour."""

    institut: str
    date: str
    liste_candidats: list[str]
    resultat: Dict[str, float] = field(default_factory=dict)

    def vers_dictionnaire(self) -> dict:
        """Convertit l'objet en dictionnaire simple, prêt pour la sortie JSON."""
        return {
            "institut": self.institut,
            "date": self.date,
            "candidats": self.liste_candidats,
            "resultat": self.resultat,
        }


def identifier_colonnes_meta(entetes: List[str]) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Repère les indices des colonnes "Institut", "Date" et "Échantillon"."""

    def trouver_colonne(*mots_cles: str) -> Optional[int]:
        for indice, entete in enumerate(entetes):
            if any(mot_cle in entete.lower() for mot_cle in mots_cles):
                return indice
        return None

    colonne_institut = trouver_colonne("sondeur", "institut")
    colonne_date = trouver_colonne("date")
    colonne_echantillon = trouver_colonne("echantillon", "échantillon")
    return colonne_institut, colonne_date, colonne_echantillon


def analyser_sondage(sondage: list[str], indice_meta: list[dict[str,float|str]], nom_candidats: dict[int,str], candidats: Candidats):
    """
    Fonction pour récupérer les résultats d'un sondage
    ### Paramètres d'entrée:
    - sondage: liste issue du tableau de la fonction lecture tableau contenant le sondage
    - indice_meta: indices des colonnes qui ne sont pas les résultats (institut...)
    - nom_candidats: ldictionnaire avec les indices liés aux noms des candidats pour savoir quel score est pour quel candidat
    - candidats: objet de la classe Candidats pour gérer la liste des candidats
    ### Sortie:
    - resultat_sondage: liste des dictionnaires contenant la clef 'valeur' avec le résultat et la clef 'nom' avec le nom du candidat
    - candidats
    """
    resultat_sondage = []
    for indice, element in enumerate(sondage):
        if indice in indice_meta: continue
        try: resultat_sondage+=([{'nom': candidats.dictionnaire_candidats.get(nom_candidats[indice].strip()), 'valeur': formaliser_valeur(element)}])
        except ValueError:
            element_analyse = separer_nombre_texte(element)
            for e in element_analyse:
                candidats.ajouter_candidats([e[0]])
                resultat_sondage+=([{'nom':candidats.dictionnaire_candidats.get(e[0]), 'valeur':e[1]}])
    return resultat_sondage, candidats


def analyser_tableau_sondage(tableau_html: Tag, candidats: Candidats, annee: str, annee_election: str) -> dict[str,List[Sondage]|list[str]]:
    """
    Analyse un tableau HTML de sondages (déjà repéré comme "wikitable") et retourne la liste des Sondage qu'il contient (une entrée par ligne, donc une entrée par hypothèse lorsqu'un sondage en teste plusieurs).
    ### Paramètres d'entrée:
    - tableau_html: tableau récupéré de la page wikipédia
    ### Sortie:
    - dictionnaire avec les clefs suivantes:
        - sondages: list[Sondage] liste de tous les sondages du tableau dans la classe Sondage
        - instutus: list[str] liste des instituts
        - candidats: list[str] liste des candidats
    """
    try:
        tableau_deplie = deplier_tableau(tableau_html)

    # Lecture du tableau déplié pour obtenir les entêtes et les sondages
        dictionnaire_tableau = lecture_tableau(tableau_deplie)

    # Récupération des indices des colonnes "Institut", "Date" et "Échantillon"
        colonne_institut, colonne_date, colonne_echantillon = identifier_colonnes_meta(dictionnaire_tableau.get("entete",[]))
        indice_meta = [colonne_institut, colonne_date, colonne_echantillon]

    # Récupération des indices des candidats
        colonnes_candidats: List[int] = []
    # Dictionnaire des candidats avec comme clef, l'indice auquel ils sont dans le tableau sondages du dictionnaire
        noms_candidats_par_colonne = {}
        for indice, element in enumerate(dictionnaire_tableau.get("entete", [])):
            if indice in (colonne_institut, colonne_date, colonne_echantillon):
                continue
            if element in ENTETES_NON_CANDIDATS or element == "":
                continue
            colonnes_candidats.append(indice)
            noms_candidats_par_colonne[indice] = element


        liste_candidats = [noms_candidats_par_colonne[indice] for indice in noms_candidats_par_colonne.keys()]
        candidats.ajouter_candidats(liste_candidats=liste_candidats)

        sondages: list[Sondage] = []
        liste_instituts: set[str] = set()

        for ligne in dictionnaire_tableau.get("sondages"):
            if not ligne:continue

        # Récupération date et institut de sondage
            institut = ligne[colonne_institut] if colonne_institut is not None and colonne_institut < len(ligne) else ""
            date = ligne[colonne_date] if colonne_date is not None and colonne_date < len(ligne) else ""

        # Suppression des lignes remplies par un seul mot (annoncent des candidatures ...)
            if institut == date: continue

        # Conservation uniquement de la date de fin du sondage (ex: "du 1er au 3 mars" -> "3 mars")
            date = formaliser_date(date=date, annee=annee, annee_election=annee_election)
        # Formalisation du nom de l'institut de sondage
            institut = formaliser_institut(institut=institut)

        # Analyse du sondage
            resultat, candidats = analyser_sondage(sondage=ligne, indice_meta=indice_meta, nom_candidats=noms_candidats_par_colonne, candidats=candidats)

            if not resultat: continue

            candidats_sonde = [element.get('nom') for element in resultat]
        # Ajout du sondage pour chaque candidat sondé afin de connaitre le nombre de sondages pour chaque candidat
            for candidat in candidats_sonde: candidats.ajout_sondage_candidat(candidat=candidat, sondage_recent=sondage_recent(date, annee_election))

            sondages.append(Sondage(institut=institut, date=date, liste_candidats=candidats_sonde, resultat=resultat))

            liste_instituts.add(institut)

        return {"sondages": sondages, "instituts": list(liste_instituts), "candidats": candidats}

    except Exception as e:
        nom_fichier = e.__traceback__.tb_frame.f_code.co_filename.replace('c:\\Users\\godef\\Documents\\projets_python\\api_sondages_presidentielles\\sources\\','')
        raise ValueError(f'Erreur à la ligne {e.__traceback__.tb_lineno} du fichier {nom_fichier} :\n {str(e)}\n')

