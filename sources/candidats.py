import re

class Candidats:
    """Classe pour la gestion des candidats"""
    def __init__(self):
        self.dictionnaire_candidats = {}
        self.liste_candidats = []
        self.base_liste_candidats = {}


    def maj_liste_candidats(self) -> list[str]:
        """Fonction pour mettre à jour la liste des candidats"""
        for clef in self.dictionnaire_candidats.keys():
            if self.dictionnaire_candidats.get(clef) not in self.liste_candidats:
                self.liste_candidats.append(self.dictionnaire_candidats.get(clef))
        self.base_liste_candidats = {self.base_nom(nom): nom for nom in self.liste_candidats}


    def ajouter_candidats(self, liste_candidats: list) -> None:
        """Fonction pour ajouter des candidats dans le dictionnaire"""
        for candidat in liste_candidats:
            if candidat not in self.dictionnaire_candidats.keys():self.maj_dictionnaire(candidat=candidat)


    @staticmethod
    def base_nom(nom: str) -> str:
        """Récupération de la base des noms (suppression des parties entre parenthèses)"""
        return re.sub(r'\(.*\)', '', nom).strip()


    def changer_nom_base(self, ancien_nom: str, nouveau_nom: str) -> None:
        """
        Fonction pour changer les noms de bases (qd le nom qui vient d'arriver est avec le parti alors qu'avant non)
        ### Paramètres d'entrée:
        - ancien_nom: nom du candidat utilisé dans la liste des candidats
        - nouveau_nom: nom qui remplace le précédent
        """
        for clef in self.dictionnaire_candidats.keys():
            if self.dictionnaire_candidats.get(clef)==ancien_nom:
                self.dictionnaire_candidats[clef] = nouveau_nom
            self.maj_liste_candidats()


    def maj_dictionnaire(self,  candidat: str) -> None:
        """
        Fonction pour mettre à jour le dictionnaire des candidats
        Pour chaque nouveau nom de `liste`, la fonction détermine son nom "de base" (sans le parti entre parenthèses) et vérifie s'il correspond à un candidat déjà présent dans `dictionnaire` :
        - si oui, le nouveau nom est lié au candidat existant (avec nom parti) ;
        - si non, un nouveau candidat est créé.

        Si un candidat existant n'avait pas encore de parti connu et qu'une nouvelle variante en apporte un, le nom canonique de ce candidat est mis à jour pour toutes ses anciennes variantes.

        ### Paramètres d'entrée:
        - dictionnaire: Dictionnaire à mettre à jour (modifié en place), au format
        {variante: nom_canonique}.
        - liste: Liste de chaînes de caractères représentant des noms de candidats,
        avec ou sans parti entre parenthèses.

        ### Sortie :
        - mise à jour du dictionnaire
        """
        nom_candidat = self.base_nom(candidat)
        for _, nom in enumerate(self.base_liste_candidats.keys()):
            if nom==nom_candidat:
                if '(' in candidat and '(' not in self.base_liste_candidats[nom]:
                    self.changer_nom_base(nom, candidat)
                    self.dictionnaire_candidats[candidat] = candidat
                else: self.dictionnaire_candidats[candidat] = self.base_liste_candidats[nom]
                return None
        self.dictionnaire_candidats[candidat] = candidat
        self.maj_liste_candidats()


if __name__=='__main__':
    candidats = Candidats()
    liste = ['Retailleau(LR)', 'Lisnard', 'Borne', 'Jadot(EELV)', 'Royal', 'Poutou(NPA-A)', 'Glucksmann(PP)', 'Zemmour(REC)', 'Retailleau', 'Villiers', 'CandidatRN', 'Hidalgo(PS)', 'Barnier', 'Macron(REN)', 'Lassalle(RES)', 'Attal(RE)', 'Knafo', 'Bouamrane', 'Bertrand', 'Mélenchon(LFI)', 'Bardella', 'Faure(PS)', 'Dupont-Aignan(DLF)', 'Hollande', 'Philippe', 'Wauquiez(LR)', 'CandidatEPR', 'Delga', 'Glucksmann', 'CandidatENS', 'Attal', 'Mélenchon', 'Darmanin', 'Tondelier(LE)', 'Ruffin', 'CandidatPS / PP', 'Bayrou', 'Castex', 'Rousseau', 'Le Pen(RN)', 'Roussel(PCF)', 'Le Maire', 'CandidatLR', 'CandidatEELV', 'Cazeneuve', 'Arthaud(LO)', 'Le Pen', 'Tondelier', 'Braun', 'Villepin(LFH)', 'CandidatPS/DVG', 'Pécresse(LR)', 'Lecornu', 'Philippe(HOR)', 'Autres']
    candidats.ajouter_candidats(liste)
    print('Liste candidats : \n')
    print(candidats.liste_candidats)
    print('\n\nDico candidat :\n')
    print(candidats.dictionnaire_candidats)