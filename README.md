# Manora Live — passerelle du Raspberry Pi

Fait le lien entre les capteurs Zigbee (Zigbee2MQTT + Mosquitto sur le Pi) et l'API Manora Live (`https://api.live.manora-photo.fr`).

```
Capteurs Zigbee ─▶ Zigbee2MQTT ─▶ Mosquitto (127.0.0.1) ─▶ passerelle ─▶ API (HTTPS)
                                                              ▲
                                     commandes, appairage ◀───┘ WebSocket
```

## Ce qu'elle fait

- **Découverte générique** : lit `zigbee2mqtt/bridge/devices`, traduit les `exposes` en capacités et les envoie à l'API. Un nouveau capteur apparaît dans le back-office sans changer le code.
- **Mesures** : chaque message `zigbee2mqtt/<appareil>` est normalisé au format commun et envoyé sur `POST /terminal/events`.
- **Coupure réseau** : les événements sont gardés dans une file sur disque et renvoyés au retour de la connexion.
- **Battement de cœur** toutes les 30 s : l'API sait si le Pi est en ligne.
- **Commandes** reçues par WebSocket : allumer / éteindre la prise, ouvrir l'appairage.

Détails dans [docs/adr](docs/adr/README.md).

## Installation sur le Pi (moins de 15 min)

Prérequis : Docker, Zigbee2MQTT et Mosquitto avec un compte `passerelle`.

```bash
git clone https://github.com/Maanaaa/manora-live-terminal.git ~/manora-live-terminal
cd ~/manora-live-terminal
cp .env.example .env      # renseigner TERMINAL_KEY et MQTT_PASSWORD
docker compose up -d --build
docker logs -f manora-live-passerelle
```

Mise à jour : `git pull && docker compose up -d --build`.

## Développement

```bash
npm install
npm test          # normalisation et file locale, sur les vrais appareils du Pi
npm run lint && npm run typecheck
```
