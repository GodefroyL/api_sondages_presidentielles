"""
Fonctions bas niveau pour manipuler des tableaux HTML issus de Wikipédia :
- dépliage des cellules fusionnées (rowspan / colspan),
- extraction du texte d'une cellule (avec repli sur les images/liens).
"""


from bs4 import Tag

from .utilitaires import nettoyer_texte

# Une cellule de la grille dépliée est soit une balise BeautifulSoup, soit None
Cellule = Tag | None
LigneGrille = list[Cellule]
GrilleTableau = list[LigneGrille]


def deplier_tableau(tableau: Tag) -> GrilleTableau:
    """
    Transforme un élément <table> HTML (avec cellules fusionnées via `rowspan`/`colspan`) en une grille rectangulaire de cellules, où chaque cellule fusionnée est dupliquée à toutes les positions qu'elle occupe.

    Cette étape est indispensable pour aligner correctement les colonnes "Institut" / "Date" (souvent fusionnées sur plusieurs lignes lorsqu'un même sondage teste plusieurs hypothèses) avec les colonnes de résultats.
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

        portee_maximale = (max(list(en_attente_ligne_courante.keys()) + [0]) + len(cellules_brutes) + 5)

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
    type_ligne = [element.name for element in ligne]
    return all(element == 'th' for element in type_ligne)


def lecture_tableau(tableau: GrilleTableau) -> list[list[str]]:
    """
    Transforme une grille de cellules (BeautifulSoup) en tableau (liste de liste) de chaine de caractère. Les entêtes et les lignes de sondages sont séparés.
    ### Paramètrse d'entrée:
    - tableau : GrilleTableau : une grille de cellules (BeautifulSoup) issue de la fonction deplier_tableau
    ### Paramètres de sortie:
    - dictionnaire avec deux clés :
        - "entete" : entêtes du tableau
        - "sondages" : lignes de sondages du tableau
    """
# Initialisation des sorties
    tableau_formatte = []
    entete = []
# Parcours du tableau pour en extraire uniquement le texte
    for ligne in tableau:
        ligne_texte = [nettoyer_texte(element.get_text()) for element in ligne]
        if '' in ligne_texte: continue
        elif ligne_est_uniquement_entete(ligne): entete.append(ligne_texte)
        elif ligne_texte[0] != ligne_texte[1]: tableau_formatte.append(ligne_texte)
    if len(entete)==1: entete=entete[0]

    return {"entete": entete, "sondages": tableau_formatte}
