// Normalisation des messages Zigbee2MQTT vers le format commun, et l'inverse pour les commandes (module pur).

import type { KnownDevice, TerminalEvent, Value } from './types.ts';

const NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function sameValue(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string' ? a.toUpperCase() === b.toUpperCase() : a === b;
}

/**
 * Message d'un appareil (`zigbee2mqtt/<appareil>`) → événement commun.
 * Garde les valeurs simples, ramène les binaires texte à un booléen (ON/OFF, OPEN/CLOSE… selon les `exposes`),
 * et renvoie null si rien n'est exploitable.
 */
export function toTerminalEvent(terminal: string, device: KnownDevice, payload: unknown, now = new Date()): TerminalEvent | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const readings: Record<string, Value> = {};

  for (const [key, raw] of Object.entries(payload as Record<string, unknown>)) {
    if (!NAME_RE.test(key)) continue;
    const binary = device.binaries[key];
    // Valeur déjà booléenne : on garde la convention de Zigbee2MQTT (ex. contact: true = fermé),
    // même quand l'appareil déclare value_on: false. Seules les valeurs texte (ON/OFF…) sont converties.
    if (binary && typeof raw !== 'boolean') {
      if (sameValue(raw, binary.on)) readings[key] = true;
      else if (sameValue(raw, binary.off)) readings[key] = false;
      else if (raw === null) readings[key] = null;
      continue;
    }
    if (raw === null || typeof raw === 'boolean' || typeof raw === 'string') readings[key] = raw;
    else if (typeof raw === 'number' && Number.isFinite(raw)) readings[key] = raw;
    // Objets imbriqués (ex. `update`) : ignorés, ils ne sont pas des capacités.
  }

  if (!Object.keys(readings).length) return null;
  return { terminal, device: device.ieee, model: device.model, readings, ts: now.toISOString() };
}

/**
 * Les actions de télécommande (`action: "single"`, `"double"`…) sont des événements ponctuels :
 * deux appuis identiques donnent la même valeur, et une règle ne se déclencherait qu'au premier.
 * On renvoie donc juste après un événement `action: null` qui réarme les règles pour l'appui suivant.
 */
export function momentaryReset(event: TerminalEvent): TerminalEvent | null {
  const action = event.readings.action;
  if (action === undefined || action === null || action === '') return null;
  const ts = new Date(new Date(event.ts).getTime() + 1).toISOString();
  return { ...event, readings: { action: null }, ts };
}

/** Commande de l'API (`terminal.command`) → charge utile de `zigbee2mqtt/<appareil>/set`. */
export function toZ2mSet(device: KnownDevice, capability: string, value: Value): Record<string, unknown> {
  const binary = device.binaries[capability];
  if (binary && typeof value === 'boolean' && typeof binary.on !== 'boolean') return { [capability]: value ? binary.on : binary.off };
  return { [capability]: value };
}
