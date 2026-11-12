# ADR 0001 — Passerelle Node.js en conteneur Docker sur le Pi

- Statut : accepté
- Date : 2026-11-12

## Contexte

Le sujet impose une passerelle écrite par nous, qui s'abonne à MQTT, normalise les messages au format commun et les transmet à l'API, avec des services relancés automatiquement au démarrage (Docker Compose ou systemd). Zigbee2MQTT 2.14 et Mosquitto tournent déjà sur le Pi 4 en services systemd ; Mosquitto n'écoute que sur `127.0.0.1` avec identifiants.

## Décision

- Node.js 24 + TypeScript exécuté directement (pas d'étape de build), une seule dépendance : `mqtt`. Le client WebSocket et `fetch` sont ceux de Node.
- Conteneur Docker `manora-live-passerelle` (`compose.yaml`), `restart: unless-stopped`, `network_mode: host` pour joindre Mosquitto en local sans l'exposer. L'utilisateur `iot` fait partie du groupe `docker` : aucune commande sudo nécessaire.
- Secrets dans `.env` sur le Pi (clé du terminal, compte MQTT `passerelle`), jamais dans le dépôt.
- Volume `passerelle-data` pour la file locale.

## Conséquences

- Le service redémarre seul avec le Pi (Docker est activé au démarrage).
- Mise à jour : `git pull && docker compose up -d --build` dans `~/manora-live-terminal`.
