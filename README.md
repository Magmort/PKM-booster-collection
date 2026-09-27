# Simulateur de boosters

Application web installable (PWA) pour simuler l'ouverture de boosters Pokémon
(TCG Pocket et JCC classique) et World of Warcraft (JCC), et suivre sa collection.

- Collection enregistrée sur l'appareil (bouton d'export/import dans l'onglet Collection).
- Fonctionne hors ligne une fois installée.
- Visuels des cartes Pokémon chargés depuis TCGdex (https://tcgdex.dev) quand ils sont disponibles.
- Cartes World of Warcraft : liste récupérée sur WoWTCGFR (https://wowtcgfr.com) chaque semaine
  par la GitHub Action « Mise à jour des cartes WoW » (fichier `data/wow-cards.json`).
  On peut aussi la lancer à la main depuis l'onglet Actions (bouton « Run workflow »).

Données : pokemon-tcg-pocket-database (flibustier), TCGdex, PokeAPI, WoWTCGFR.
Projet personnel non commercial. Pokémon et les visuels des cartes sont la propriété
de Nintendo, Creatures, GAME FREAK et The Pokémon Company. World of Warcraft et ses cartes
sont la propriété de Blizzard Entertainment (JCC édité par Upper Deck puis Cryptozoic).
