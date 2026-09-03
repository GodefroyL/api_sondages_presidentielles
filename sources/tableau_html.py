"""
Fonctions bas niveau pour manipuler des tableaux HTML issus de Wikipédia :
- dépliage des cellules fusionnées (rowspan / colspan),
- extraction du texte d'une cellule (avec repli sur les images/liens).
"""

from typing import List, Optional, Union

from bs4 import Tag

from utilitaires_texte import nettoyer_texte

# Une cellule de la grille dépliée est soit une balise BeautifulSoup, soit None
Cellule = Optional[Tag]
LigneGrille = List[Cellule]
GrilleTableau = List[LigneGrille]


def texte_cellule(cellule: Cellule) -> str:
    """
    Retourne le texte propre d'une cellule de tableau.

    Si la cellule ne contient aucun texte visible (cas fréquent des colonnes
    "Institut" affichant uniquement un logo), on se replie sur l'attribut
    `alt` ou `title` d'une image, d'un lien ou d'une abréviation.
    """
    if cellule is None:
        return ""

    # on travaille sur une copie pour ne pas modifier le document d'origine
    cellule_copie = cellule
    for saut_ligne in cellule_copie.find_all("br"):
        saut_ligne.replace_with(" ")

    texte = nettoyer_texte(cellule_copie.get_text(separator=" "))
    if texte:
        return texte

    for balise in cellule_copie.find_all(["img", "a", "abbr"]):
        for attribut in ("alt", "title"):
            valeur = balise.get(attribut)
            if valeur:
                return nettoyer_texte(valeur)

    return ""


def deplier_tableau(tableau: Tag) -> GrilleTableau:
    """
    Transforme un élément <table> HTML (avec cellules fusionnées via
    `rowspan`/`colspan`) en une grille rectangulaire de cellules, où chaque
    cellule fusionnée est dupliquée à toutes les positions qu'elle occupe.

    Cette étape est indispensable pour aligner correctement les colonnes
    "Institut" / "Date" (souvent fusionnées sur plusieurs lignes lorsqu'un
    même sondage teste plusieurs hypothèses) avec les colonnes de résultats.
    """
    lignes_html = tableau.find_all("tr", recursive=True)
    grille: GrilleTableau = []
    cellules_en_attente: dict[int, dict[int, Cellule]] = {}

    for indice_ligne, ligne_html in enumerate(lignes_html):
        en_attente_ligne_courante = cellules_en_attente.pop(indice_ligne, {})
        indice_colonne = 0
        ligne_courante: LigneGrille = []

        cellules_brutes = ligne_html.find_all(["th", "td"], recursive=False)
        iterateur_cellules = iter(cellules_brutes)
        cellule_courante = next(iterateur_cellules, None)

        portee_maximale = (
            max(list(en_attente_ligne_courante.keys()) + [0])
            + len(cellules_brutes)
            + 5
        )

        while (
            cellule_courante is not None
            or indice_colonne in en_attente_ligne_courante
            or indice_colonne <= portee_maximale
        ):
            if indice_colonne in en_attente_ligne_courante:
                ligne_courante.append(en_attente_ligne_courante[indice_colonne])
                indice_colonne += 1
                continue

            if cellule_courante is None:
                break

            nombre_colonnes_fusionnees = int(cellule_courante.get("colspan", 1) or 1)
            nombre_lignes_fusionnees = int(cellule_courante.get("rowspan", 1) or 1)

            for decalage_colonne in range(nombre_colonnes_fusionnees):
                ligne_courante.append(cellule_courante)
                if nombre_lignes_fusionnees > 1:
                    for decalage_ligne in range(1, nombre_lignes_fusionnees):
                        cellules_en_attente.setdefault(
                            indice_ligne + decalage_ligne, {}
                        )[indice_colonne + decalage_colonne] = cellule_courante
                indice_colonne += 1

            cellule_courante = next(iterateur_cellules, None)

        grille.append(ligne_courante)

    return grille


def ligne_est_uniquement_entete(ligne: LigneGrille) -> bool:
    """Retourne True si toutes les cellules de la ligne sont des <th>."""
    return bool(ligne) and all(
        isinstance(cellule, Tag) and cellule.name == "th" for cellule in ligne
    )
