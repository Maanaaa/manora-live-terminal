// Passerelle Manora Live : Zigbee2MQTT (MQTT local) ⇄ API (HTTPS + WebSocket).

import mqtt from 'mqtt';

import { ApiError, TerminalApi } from './api.ts';
import { loadConfig } from './config.ts';
import { devicesFromBridge } from './devices.ts';
import { momentaryReset, toTerminalEvent, toZ2mSet } from './normalize.ts';
import { EventQueue } from './queue.ts';
import type { KnownDevice, TerminalDevice, Value } from './types.ts';

const config = loadConfig();
const api = new TerminalApi(config.apiUrl, config.terminalKey);
const queue = new EventQueue(config.queueFile);
const log = (...args: unknown[]) => console.log('[passerelle]', ...args);

const byName = new Map<string, KnownDevice>();
const byIeee = new Map<string, KnownDevice>();
let pendingSync: TerminalDevice[] | null = null;

// ---------- API : appareils, événements, battement de cœur ----------

async function syncDevices() {
  if (!pendingSync) return;
  const devices = pendingSync;
  try {
    await api.syncDevices(devices);
    if (pendingSync === devices) pendingSync = null;
    log(`appareils synchronisés : ${devices.length}`);
  } catch (err) {
    log('synchro des appareils en attente :', (err as Error).message);
  }
}

let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.size) {
      const batch = queue.peek(100);
      try {
        await api.sendEvents(batch);
        queue.drop(batch.length);
      } catch (err) {
        // Lot invalide : on l'écarte pour ne pas bloquer la file. Sinon (réseau, 5xx, 401) : on réessaie plus tard.
        if (err instanceof ApiError && (err.status === 400 || err.status === 422)) {
          log('lot rejeté par l’API, écarté :', err.message);
          queue.drop(batch.length);
          continue;
        }
        log(`envoi en attente (${queue.size} événement(s) en file) :`, (err as Error).message);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

async function heartbeat() {
  try {
    await api.heartbeat();
  } catch (err) {
    log('battement de cœur en échec :', (err as Error).message);
    return;
  }
  await syncDevices();
  await flush();
}

// ---------- MQTT : Zigbee2MQTT ----------

const base = config.baseTopic;
const client = mqtt.connect(config.mqttUrl, {
  username: config.mqttUser,
  password: config.mqttPassword,
  reconnectPeriod: 5_000,
  clientId: `manora-passerelle-${config.terminalId}`,
});

client.on('connect', () => {
  log('connecté à MQTT');
  client.subscribe([`${base}/bridge/devices`, `${base}/+`]);
});
client.on('error', (err) => log('MQTT :', err.message));

client.on('message', (topic, raw) => {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (topic === `${base}/bridge/devices`) {
    // Message retenu : liste complète, republiée par Zigbee2MQTT à chaque appairage ou renommage.
    const devices = devicesFromBridge(payload);
    byName.clear();
    byIeee.clear();
    for (const d of devices) {
      byName.set(d.friendlyName, d);
      byIeee.set(d.ieee, d);
    }
    pendingSync = devices.map(({ ieee, model, vendor, description, capabilities }) => ({
      ieee,
      model,
      ...(vendor ? { vendor } : {}),
      ...(description ? { description } : {}),
      capabilities,
    }));
    void syncDevices();
    return;
  }

  const name = topic.slice(base.length + 1);
  if (name === 'bridge') return;
  const device = byName.get(name);
  if (!device) return;
  const event = toTerminalEvent(config.terminalId, device, payload);
  if (!event) return;
  queue.push(event);
  const reset = momentaryReset(event);
  if (reset) queue.push(reset);
  void flush();
});

// ---------- WebSocket : commandes de l'API ----------

let socketAttempt = 0;
function connectSocket() {
  const socket = new WebSocket(api.socketUrl());
  socket.addEventListener('open', () => {
    socketAttempt = 0;
    log('canal de commandes ouvert');
  });
  socket.addEventListener('message', (msg) => {
    let data: { type?: string; data?: Record<string, unknown> };
    try {
      data = JSON.parse(String(msg.data));
    } catch {
      return;
    }
    if (data.type === 'terminal.command') {
      const { ieee, capability, value } = data.data ?? {};
      const device = typeof ieee === 'string' ? byIeee.get(ieee) : undefined;
      if (!device || typeof capability !== 'string') return log('commande ignorée : appareil inconnu', ieee);
      const payload = toZ2mSet(device, capability, value as Value);
      client.publish(`${base}/${device.friendlyName}/set`, JSON.stringify(payload));
      log(`commande → ${device.friendlyName} ${JSON.stringify(payload)}`);
    } else if (data.type === 'terminal.permit_join') {
      const seconds = Number(data.data?.seconds) || 120;
      client.publish(`${base}/bridge/request/permit_join`, JSON.stringify({ time: seconds }));
      log(`appairage ouvert pour ${seconds} s`);
    }
  });
  socket.addEventListener('close', () => {
    socketAttempt += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** socketAttempt);
    log(`canal de commandes fermé, nouvelle tentative dans ${delay / 1000} s`);
    setTimeout(connectSocket, delay);
  });
  socket.addEventListener('error', () => socket.close());
}

// ---------- Démarrage ----------

log(`terminal ${config.terminalId} → ${config.apiUrl} (${queue.size} événement(s) en file)`);
connectSocket();
void heartbeat();
const timer = setInterval(() => void heartbeat(), config.heartbeatMs);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    client.end(false, {}, () => process.exit(0));
  });
}
