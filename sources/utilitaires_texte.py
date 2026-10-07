"""
Fonctions utilitaires de nettoyage et de normalisation de texte,
indépendantes de toute logique HTML ou métier.
"""

import re
import unicodedata


def formaliser_date(date: str, annee: str, annee_election: str)->str:
    """
    Fonction pour formalier la date de la manière suivante:
    - 3 septembre 2026 => 03/09/2026
    """
    nombre_mois = {'janvier': '01', 'fevrier': '02', 'mars': '03', 'avril': '04', 'mai': '05', 'juin': '06', 'juillet': '07', 'aout': '08', 'septembre': '09', 'octobre': '10', 'novembre': '11', 'decembre': '12'}
    try:
    # On conserve seulement le jour de fin du sondage quand il y a la date du début (ex: 26 mars - 28 mars)
        if '-' in date: date_formalisee = date[date.index('-'):][1:]
        else: date_formalisee = date

    # Suppression des accents
        date_formalisee = date_formalisee.replace('é','e').replace('û','u').lower().split(' ')
    # Remplacement de '1er' par '1'
        date_formalisee[0] = date_formalisee[0].replace('er','')
    # Suppression des éléments vides
        if '' in date_formalisee: date_formalisee.remove('')
    # Remplacement du nom du mois par son numéro
        date_formalisee[1] = nombre_mois.get(date_formalisee[1])
    # Si l'année n'est pas précisée dans la date, on l'ajoute
        if len(date_formalisee) == 2: date_formalisee.append(annee)

    # On ajoute la différence entre l'année de l'élection et 2027 pour que les différentes éléctions soient comparables sur le même calendrier
        if annee_election != '2027':
            date_formalisee[-1] = str(int(date_formalisee[-1])+(2027-int(annee_election)))

        date_formalisee = '/'.join(date_formalisee)
        if len(date_formalisee)==9: date_formalisee = '0'+date_formalisee
        return date_formalisee
    except Exception as e:
        raise ValueError(f'Erreur dans la fonction `formaliser_date` du fichier `utilitaire_texte.py`, à la ligne {e.__traceback__.tb_lineno} :\n {str(e)}\nParamètre :{date}\n')


def separer_nombre_texte(cellule: str) -> list[list[float|str]]:
    """Fonction pour séparer les valeurs des noms quand ces derniers sont dans la case des valeurs
    ### Paramètres d'entrée:
    - cellule: cellule contenant du texte à analyser
    ### Sortie:
    - resultat: Liste des paires valeur nom du candidat dans la cellule [[nom, valeur],...]"""
    # Trouve toutes les paires (nombre, texte)
    paires = re.findall(r'(\d+\.?\d*)([A-Za-zÀ-ÖØ-öø-ÿ ]+)', cellule.replace(',','.').replace('<','').replace('>',''))
    resultat = []
# Pour chaque paire, on ajoute la valeur converti en float et le nom du candidat dans la liste résultat qui sera renvoyée
    for valeur, nom in paires: resultat.append([nom.strip(), float(valeur)])
    return resultat


def formaliser_valeur(valeur: str) -> float:
    """
    Fonction pour formaliser une valeur de sondage en float et supprimer les caractères non numériques
    ### Paramètres d'entrée:
     - valeur: valeur à formaliser
    ### Sortie:
     - valeur: valeur formalisée en float
    """
    return float(valeur.replace(',','.').replace('<','').replace('>','').replace(' %',''))


def nettoyer_texte(texte: str|None) -> str:
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
