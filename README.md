# Intégration Battery Tracker pour Home Assistant

Cette intégration pour Home Assistant vous aide à suivre l'historique des changements de piles pour tous vos capteurs alimentés par batterie, avec une carte Lovelace dédiée pour une gestion facile.

## Fonctionnalités

- **Détection Automatique :** Détecte automatiquement tous les capteurs avec une `device_class` de `battery`.
- **Capteurs Compagnons :** Crée pour chaque capteur de batterie une entité `sensor.*_last_battery_change` qui stocke la date du dernier changement.
- **Carte Lovelace Avancée :**
    - **Regroupement par Pièce :** Organise automatiquement vos capteurs par pièce pour une meilleure lisibilité.
    - **Icônes Dynamiques :** Affiche une icône de batterie dont la couleur et le remplissage s'adaptent au niveau de charge.
    - **Gestion Simplifiée des Dates :**
    - Par défaut, un nouveau capteur affiche "Non changée", indiquant qu'aucune date de changement n'a encore été enregistrée.
    - Un clic sur le bouton "Changée" ouvre un calendrier pour sélectionner la date du changement. La date est enregistrée avec l'heure actuelle pour un suivi précis du "il y a...".
- **Service de Mise à Jour :** Fournit un service pour mettre à jour la date de changement, utilisable dans des contextes plus avancés comme les automatisations.


## Installation

1.  Copiez le dossier `custom_components/battery_tracker/` de ce projet dans le dossier `custom_components/` de votre installation Home Assistant.
2.  Copiez le dossier `www/battery-tracker-card/` de ce projet dans le dossier `www/` de votre installation Home Assistant. S'il n'existe pas, créez le dossier `www` à la racine de votre configuration.
3.  Redémarrez Home Assistant.

## Configuration

1.  **Ajout de l'intégration :**
    - Allez dans **Paramètres > Appareils et services**.
    - Cliquez sur **Ajouter une intégration** et recherchez "**Battery Tracker**".
    - Suivez les instructions pour l'ajouter.

2.  **Ajout de la ressource Lovelace :**
    - Allez dans **Paramètres > Tableaux de bord**.
    - Cliquez sur le menu en haut à droite (3 points) et sélectionnez **Ressources**.
    - Cliquez sur **Ajouter une ressource**.
    - Entrez l'URL : `/local/battery-tracker-card/battery-tracker-card.js` et sélectionnez le type **Module JavaScript**.

## Utilisation

### La carte Lovelace
C'est la méthode d'utilisation principale. Ajoutez une carte "Manuelle" à votre tableau de bord avec ce code :

```yaml
type: custom:battery-tracker-card
title: Suivi des Piles
```

La carte affichera la liste de vos capteurs, regroupés par pièce. Cliquer sur le bouton "Changée" ouvrira une boîte de dialogue vous permettant de confirmer ou de modifier la date du changement de pile.

### Le Service
Pour des cas d'usage avancés (comme des scripts ou des automatisations complexes), le service `battery_tracker.set_battery_changed_date` reste disponible.

**Exemple : Mettre à jour à une date spécifique via un script**
```yaml
service: battery_tracker.set_battery_changed_date
target:
  entity_id: sensor.votre_capteur_de_batterie
data:
  changed_at: '2025-01-15 18:00:00'
```

## Débogage

Pour activer les journaux de débogage pour cette intégration, ajoutez ce qui suit à votre fichier `configuration.yaml` :

```yaml
logger:
  default: info
  logs:
    custom_components.battery_tracker: debug
```