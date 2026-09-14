"""
Fonctions utilitaires de nettoyage et de normalisation de texte,
indépendantes de toute logique HTML ou métier.
"""

import re
import unicodedata
from typing import Optional

# Motif reconnaissant un nombre décimal (virgule ou point), éventuellement négatif
MOTIF_NOMBRE = re.compile(r"-?\d+[.,]?\d*")


def formaliser_date(date: str)->str:
    """
    Fonction pour formalier la date de la manière suivante:
    - 3 septembre 2026 => 03/09/2026
    """
    try:
        nombre_mois = {'janvier': '01', 'fevrier': '02', 'mars': '03', 'avril': '04', 'mai': '05', 'juin': '06', 'juillet': '07', 'aout': '08', 'septembre': '09', 'octobre': '10', 'novembre': '11', 'decembre': '12'}
        if '-' in date: date_formalisee = date[date.index('-'):][1:]
        else: date_formalisee = date
        date_formalisee = date_formalisee.replace('é','e').replace('û','u').lower().split(' ')
        if '' in date_formalisee: date_formalisee.remove('')
        date_formalisee[1] = nombre_mois.get(date_formalisee[1])
        date_formalisee = '/'.join(date_formalisee)
        if len(date_formalisee)==9: date_formalisee = '0'+date_formalisee
        return date_formalisee
    except Exception as e:
        raise ValueError(f'Erreur dans la fonction `formaliser_date` du fichier `utilitaire_texte.py`, à la ligne {e.__traceback__.tb_lineno} :\n {str(e)}\nParamètre :{date}\n')


def nettoyer_texte(texte: Optional[str]) -> str:
    """
    Nettoie un texte brut extrait de Wikipédia :
    - remplace les espaces insécables et espaces de largeur nulle,
    - supprime les appels de note (ex: "[1]", "[a]", "[note 2]"),
    - réduit les espaces multiples à un seul.
    """
    if texte is None:
        return ""
    texte = texte.replace("\xa0", " ").replace("\u200b", "")
    texte = re.sub(r"\[[^\]]*\]", "", texte)
    texte = re.sub(r"\s+", " ", texte).strip()
    return texte


def normaliser_texte(texte: str) -> str:
    """
    Normalise un texte pour comparaison insensible à la casse et aux accents
    (utilisé pour repérer un mot-clé dans un en-tête de colonne, par exemple).
    Ne conserve que les lettres, chiffres et espaces.
    """
    texte_nettoye = nettoyer_texte(texte).lower()
    texte_sans_accents = "".join(
        caractere
        for caractere in unicodedata.normalize("NFD", texte_nettoye)
        if unicodedata.category(caractere) != "Mn"
    )
    texte_final = re.sub(r"[^a-z0-9 ]", "", texte_sans_accents)
    return texte_final.strip()


def extraire_valeur_et_reste(texte: str) -> tuple[Optional[float], str]:
    """
    Recherche le premier nombre présent dans `texte` et retourne un tuple
    (valeur, texte_restant) où :
    - `valeur` est le nombre trouvé converti en float (None si aucun nombre),
    - `texte_restant` est le texte une fois ce nombre retiré.

    Exemple : "14,5 (O. Faure)" -> (14.5, "(O. Faure)")
    """
    texte_nettoye = nettoyer_texte(texte)
    correspondance = MOTIF_NOMBRE.search(texte_nettoye)

    if correspondance is None:
        return None, texte_nettoye

    try:
        valeur = float(correspondance.group(0).replace(",", "."))
    except ValueError:
        return None, texte_nettoye

    texte_restant = texte_nettoye[:correspondance.start()] + texte_nettoye[correspondance.end():]
    return valeur, texte_restant
