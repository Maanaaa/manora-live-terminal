# ADR 0003 — Prise en charge générique, file locale et commandes

- Statut : accepté
- Date : 2026-11-12

## Contexte

Critères du sujet : un nouveau capteur appairé apparaît avec ses capacités sans changer le code ; coupure réseau = événements mis en file puis renvoyés ; heartbeat ; actionneur pilotable depuis l'app ; appairage déclenchable depuis le back-office.

## Décision

- **Découverte :** abonnement au message retenu `zigbee2mqtt/bridge/devices`. Pour chaque appareil (hors coordinateur et appairages inachevés), les `exposes` sont aplatis et traduits en capacités : type `binary` / `numeric` / `enum`, `unit`, `values`, et `access` déduit des bits Zigbee2MQTT (1 publié, 2 modifiable). Résultat envoyé sur `PUT /terminal/devices`. Aucun modèle n'est codé en dur (`src/devices.ts`).
- **Mesures :** `zigbee2mqtt/<appareil>` → événement commun (`src/normalize.ts`) : valeurs simples seulement, objets imbriqués ignorés. Les binaires texte (`ON`/`OFF`) deviennent des booléens ; les binaires déjà booléens gardent la convention de Zigbee2MQTT (`contact: true` = fermé), car le détecteur SNZB-04P déclare `value_on: false`.
- **File locale :** chaque événement est écrit sur disque (`/data/queue.json`, écriture atomique, 10 000 au plus) avant envoi, puis retiré seulement quand l'API l'a accepté. Envoi par lots de 100 ; un lot refusé en 400/422 est écarté pour ne pas bloquer la file.
- **Battement de cœur :** `POST /terminal/heartbeat` toutes les 30 s ; à chaque succès, la synchro des appareils et la file en attente sont relancées.
- **Commandes :** WebSocket `/ws?token=<clé>` avec reconnexion (délai croissant, 30 s au plus). `terminal.command` → `zigbee2mqtt/<appareil>/set` (booléen → `ON`/`OFF` pour la prise) ; l'état réel revient par les mesures. `terminal.permit_join` → `zigbee2mqtt/bridge/request/permit_join` `{"time": secondes}`.

## Conséquences

- Testé sur la vraie liste publiée par le Pi (`tests/fixtures/bridge-devices.json` : prise S60ZBTPF, détecteur SNZB-04P).
- Un appareil ajouté plus tard (capteur de présence, télécommande…) remonte sans modification de code.
