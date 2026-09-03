"""
Constantes de configuration pour le récupérateur de sondages.
"""

# URL de la page Wikipédia listant les sondages de la présidentielle 2027
URL_PAGE_WIKIPEDIA = (
    "https://fr.wikipedia.org/wiki/"
    "Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027"
)

# Titre exact de la section à analyser
TITRE_SECTION = "Sondages concernant le premier tour"

# En-têtes de colonnes à ne pas interpréter comme des candidats
# (colonnes "meta" du tableau : institut, date, échantillon, etc.)
ENTETES_NON_CANDIDATS = frozenset({
    "sondeur", "institut", "date", "dates", "date de publication",
    "echantillon", "commanditaire", "methode", "publie le", "n", "ind", "notes",
})

# Mots résiduels sans intérêt pouvant apparaître dans une cellule de résultat
# une fois le nombre retiré (ex: "3 ex" pour un ancien candidat)
MOTS_RESIDUELS_IGNORES = frozenset({
    "ex", "nc", "np", "nd", "pts", "points", "voix",
})

# En-tête HTTP envoyé lors de la requête vers Wikipédia
EN_TETE_HTTP = {"User-Agent": "Mozilla/5.0 (sondages-scraper/2.0)"}

# Délai maximum (en secondes) autorisé pour la requête HTTP
DELAI_MAXIMUM_REQUETE = 30
