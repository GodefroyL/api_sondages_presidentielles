// Fichier pour gérer les appels à l'api

// Fonction exportée, pour charger les données de l'api et les renvoyer
export function charger_donnees(url) {
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error('Erreur réseau');
            return response.json();
        })
        .catch(error => {
            console.error('Erreur:', error);
        });
}
