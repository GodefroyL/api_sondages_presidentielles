// Fichier pour gérer les appels à l'api

// Fonction exportée, pour charger les données de l'api et les renvoyer
export async function charger_donnees(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erreur réseau: ${response.status}`);
        }
        const donnees = await response.json();
        return donnees;
    } catch (error) {
        console.error('Erreur:', error);
        throw error;
    }
}