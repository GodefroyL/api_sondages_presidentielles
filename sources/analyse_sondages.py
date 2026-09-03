"""
Analyse métier d'un tableau de sondages déjà "déplié" (cf. tableau_html.py) :
reconstruction des en-têtes, association nom de candidat / résultat, et
production des objets Sondage.
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from bs4 import Tag

from config import ENTETES_NON_CANDIDATS, MOTS_RESIDUELS_IGNORES
from tableau_html import GrilleTableau, deplier_tableau, texte_cellule, ligne_est_uniquement_entete
from utilitaires_texte import normaliser_texte, extraire_valeur_et_reste

logger = logging.getLogger(__name__)


@dataclass
class Sondage:
    """Représente un sondage (ou une hypothèse de sondage) du premier tour."""

    institut: str
    date: str
    resultat: Dict[str, float] = field(default_factory=dict)

    def vers_dictionnaire(self) -> dict:
        """Convertit l'objet en dictionnaire simple, prêt pour la sortie JSON."""
        return {
            "institut": self.institut,
            "date": self.date,
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

    logger.debug(
        "En-têtes (%d ligne(s) fusionnée(s)) : %s", nombre_lignes_entete, entetes
    )

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


def identifier_colonnes_meta(entetes_normalises: List[str]) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Repère les indices des colonnes "Institut", "Date" et "Échantillon"."""

    def trouver_colonne(*mots_cles: str) -> Optional[int]:
        for indice, entete in enumerate(entetes_normalises):
            if any(mot_cle in entete for mot_cle in mots_cles):
                return indice
        return None

    colonne_institut = trouver_colonne("sondeur", "institut")
    colonne_date = trouver_colonne("date")
    colonne_echantillon = trouver_colonne("echantillon")
    return colonne_institut, colonne_date, colonne_echantillon


def analyser_tableau_sondage(tableau_html: Tag) -> List[Sondage]:
    """
    Analyse un tableau HTML de sondages (déjà repéré comme "wikitable") et retourne la liste des Sondage qu'il contient (une entrée par ligne, donc une entrée par hypothèse lorsqu'un sondage en teste plusieurs).
    """
    grille = deplier_tableau(tableau_html)
    if not grille:
        return []

    entetes, nombre_lignes_entete = construire_entetes(grille)
    entetes_normalises = [normaliser_texte(entete) for entete in entetes]

    colonne_institut, colonne_date, colonne_echantillon = identifier_colonnes_meta(entetes_normalises)

    colonnes_candidats: List[int] = []
    for indice, entete_normalise in enumerate(entetes_normalises):
        if indice in (colonne_institut, colonne_date, colonne_echantillon):
            continue
        if entete_normalise in ENTETES_NON_CANDIDATS or entete_normalise == "":
            continue
        colonnes_candidats.append(indice)

    noms_candidats_par_colonne = {indice: entetes[indice] for indice in colonnes_candidats}

    sondages: List[Sondage] = []

    for ligne in grille[nombre_lignes_entete:]:
        if not ligne or ligne_est_uniquement_entete(ligne):
            continue

        institut = (
            texte_cellule(ligne[colonne_institut])
            if colonne_institut is not None and colonne_institut < len(ligne)
            else ""
        )
        date = (
            texte_cellule(ligne[colonne_date])
            if colonne_date is not None and colonne_date < len(ligne)
            else ""
        )

        if not institut and not date or institut == date:
            continue

        resultat: Dict[str, float] = {}
        for indice_colonne in colonnes_candidats:
            if indice_colonne >= len(ligne):
                continue

            nom_residuel, valeur = analyser_cellule_resultat(ligne[indice_colonne])
            if valeur is None:
                continue

            nom_colonne = noms_candidats_par_colonne[indice_colonne]
            nom_final = fusionner_nom_candidat(nom_colonne, nom_residuel)
            resultat[nom_final] = valeur

            if nom_residuel:
                logger.debug(
                    "  colonne %r -> nom trouvé dans la cellule : %r => clé finale %r",
                    nom_colonne, nom_residuel, nom_final,
                )

        if not resultat:
            continue

        sondages.append(Sondage(institut=institut, date=date, resultat=resultat))

    logger.debug("-> %d ligne(s) de résultats extraite(s) sur ce tableau.", len(sondages))
    return sondages
