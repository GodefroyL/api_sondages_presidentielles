"""
Analyse métier d'un tableau de sondages déjà "déplié" (cf. tableau_html.py) :
reconstruction des en-têtes, association nom de candidat / résultat, et
production des objets Sondage.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import re

from bs4 import Tag

from .config import ENTETES_NON_CANDIDATS, MOTS_RESIDUELS_IGNORES
from .tableau_html import GrilleTableau, deplier_tableau, texte_cellule, ligne_est_uniquement_entete, lecture_tableau
from .utilitaires_texte import normaliser_texte, extraire_valeur_et_reste, formaliser_date
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


def construire_entetes(grille: GrilleTableau) -> tuple[List[str], int]:
    """
    Fusionne les lignes d'en-tête successives d'une grille (lignes composées
    uniquement de <th>) en un seul en-tête par colonne.

    Certains tableaux de sondages ont deux lignes d'en-tête : une ligne de
    regroupement par bloc politique ("Gauche", "Centre", ...) suivie d'une
    ligne avec le nom précis de chaque candidat. Les deux sont concaténées
    (ex: "Gauche – Mélenchon (LFI)") pour ne perdre aucune information.

    Retourne (liste_des_entetes, nombre_de_lignes_entete).
    """
    nombre_lignes_entete = 0
    for ligne in grille:
        if ligne_est_uniquement_entete(ligne):
            nombre_lignes_entete += 1
        else:
            break
    nombre_lignes_entete = max(nombre_lignes_entete, 1)

    lignes_entete = grille[:nombre_lignes_entete]
    largeur_tableau = max((len(ligne) for ligne in lignes_entete), default=0)

    entetes: List[str] = [""] * largeur_tableau

    for indice_colonne in range(largeur_tableau):
        morceaux_texte: List[str] = []
        texte_precedent: Optional[str] = None

        for ligne in lignes_entete:
            if indice_colonne >= len(ligne):
                continue
            texte = texte_cellule(ligne[indice_colonne])
            if texte and texte != texte_precedent:
                morceaux_texte.append(texte)
            texte_precedent = texte or texte_precedent

        # dédoublonne tout en conservant l'ordre d'apparition
        morceaux_uniques = dict.fromkeys(morceaux_texte)
        entetes[indice_colonne] = " – ".join(morceaux_uniques)

    return entetes, nombre_lignes_entete


def analyser_cellule_resultat(cellule: Tag) -> tuple[Optional[str], Optional[float]]:
    """
    Analyse une cellule de résultat et retourne (nom_residuel, valeur).

    Certaines colonnes ont un en-tête générique ("Autre", "PS", "LR", ...)
    alors que le candidat réellement testé n'est précisé que dans la
    cellule elle-même (ex: "4,5 (O. Faure)", "Ruffin 3").
    `nom_residuel` correspond au texte restant une fois le nombre retiré
    (None si la cellule ne contient qu'un nombre, ou aucun nombre exploitable).
    """
    texte = texte_cellule(cellule)
    if not texte:
        return None, None

    valeur, texte_restant = extraire_valeur_et_reste(texte)
    if valeur is None:
        return None, None

    # retire la ponctuation/symboles habituels : %, parenthèses, tirets, flèches de tendance, signe égal...
    for caractere in "%()+=▲▼↑↓•·":
        texte_restant = texte_restant.replace(caractere, " ")
    texte_restant = " ".join(texte_restant.split()).strip(" -–—.,")

    if len(texte_restant) < 2 or normaliser_texte(texte_restant) in MOTS_RESIDUELS_IGNORES:
        texte_restant = None

    return (texte_restant or None), valeur


def fusionner_nom_candidat(nom_colonne: str, nom_residuel: Optional[str]) -> str:
    """
    Combine le nom de la colonne (en-tête, éventuellement générique comme
    "Autre" ou "PS") avec le nom résiduel trouvé dans la cellule de résultat.

    - Aucun nom résiduel : on garde simplement le nom de la colonne.
    - Le nom résiduel est déjà contenu dans le nom de colonne (ou l'inverse) :
      on évite la duplication et on garde le plus informatif des deux.
    - Sinon (cas "Autre" + "F. Ruffin", ou "PS" + "O. Faure") : on combine
      les deux, ex. "Autre (F. Ruffin)".
    """
    if not nom_residuel:
        return nom_colonne
    if not nom_colonne:
        return nom_residuel

    nom_colonne_normalise = normaliser_texte(nom_colonne)
    nom_residuel_normalise = normaliser_texte(nom_residuel)

    if nom_colonne_normalise == nom_residuel_normalise:
        return nom_colonne
    if nom_residuel_normalise in nom_colonne_normalise:
        return nom_colonne
    if nom_colonne_normalise in nom_residuel_normalise:
        return nom_residuel

    return f"{nom_colonne} ({nom_residuel})"


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
    """Fonction pour récupérer les résultats d'un sondage
    ### Paramètres d'entrée:
    - sondage: liste issue du tableau de la fonction lecture tableau contenant le sondage
    - indice_meta: indices des colonnes qui ne sont pas les résultats (institut...)
    - nom_candidats: ldictionnaire avec les indices liés aux noms des candidats pour savoir quel score est pour quel candidat
    - candidats: objet de la classe Candidats pour gérer la liste des candidats
    ### Sortie:
    - resultat_sondage: liste des dictionnaires contenant la clef 'valeur' avec le résultat et la clef 'nom' avec le nom du candidat
    - candidats"""
    resultat_sondage = []
    for indice, element in enumerate(sondage):
        if indice in indice_meta: continue
        try: resultat_sondage+=([{'nom': nom_candidats[indice].strip(), 'valeur':float(element.replace(',','.').replace('<','').replace('>',''))}])
        except ValueError:
            element_analyse = separer_nombre_texte(element)
            for e in element_analyse:
                candidats.ajouter_candidats([e[0]])
                resultat_sondage+=([{'nom':candidats.dictionnaire_candidats.get(e[0]), 'valeur':e[1]}])
    return resultat_sondage, candidats


def separer_nombre_texte(cellule) -> list[list[float|str]]:
    """Fonction pour séparer les valeurs des noms quand ces derniers sont dans la case des valeurs
    ### Paramètres d'entrée:
    - cellule: cellule contenant du texte à analyser
    ### Sortie:
    - resultat: Liste des paires valeur nom du candidat dans la cellule [[nom, valeur],...]"""
    # Trouve toutes les paires (nombre, texte)
    paires = re.findall(r'(\d+\.?\d*)([A-Za-zÀ-ÖØ-öø-ÿ ]+)', cellule)
    resultat = []
# Pour chaque paire, on ajoute la valeur converti en float et le nom du candidat dans la liste résultat qui sera renvoyée
    for valeur, nom in paires: resultat.append([nom.strip(), float(valeur.replace(',','.').replace('<','').replace('>',''))])
    return resultat


def analyser_tableau_sondage(tableau_html: Tag, candidats: Candidats, annee: str) -> dict[str,List[Sondage]|list[str]]:
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
            if institut == date: continue
        # Conservation uniquement de la date de fin du sondage (ex: "du 1er au 3 mars" -> "3 mars")
            date = formaliser_date(f'{date} {annee}')

        # Analyse du sondage
            resultat = analyser_sondage(sondage=ligne,indice_meta=indice_meta,nom_candidats=noms_candidats_par_colonne, candidats=candidats)

            if not resultat: continue
            candidats_sonde = [element.get('nom') for element in resultat[0]]

            sondages.append(Sondage(institut=institut, date=date, liste_candidats=candidats_sonde, resultat=resultat))

            liste_instituts.add(institut)

        return {"sondages": sondages, "instituts": list(liste_instituts), "candidats": candidats}
    except Exception as e:
        nom_fichier = e.__traceback__.tb_frame.f_code.co_filename.replace('c:\\Users\\godef\\Documents\\projets_python\\api_sondages_presidentielles\\sources\\','')
        raise ValueError(f'Erreur à la ligne {e.__traceback__.tb_lineno} du fichier {nom_fichier} :\n {str(e)}\n')

