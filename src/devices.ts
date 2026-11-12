// Traduction générique des appareils Zigbee2MQTT vers le format commun (module pur).
// Tout repose sur les `exposes` : aucun modèle de capteur n'est codé en dur.

import type { BinaryMapping, Capability, KnownDevice } from './types.ts';

interface Expose {
  type?: string;
  property?: string;
  name?: string;
  unit?: string;
  access?: number;
  values?: unknown[];
  value_on?: unknown;
  value_off?: unknown;
  features?: Expose[];
}

interface Z2mDevice {
  ieee_address?: string;
  friendly_name?: string;
  type?: string;
  description?: string | null;
  interview_completed?: boolean;
  interview_state?: string;
  supported?: boolean;
  definition?: { model?: string; vendor?: string; description?: string; exposes?: Expose[] } | null;
}

// Bits d'accès de Zigbee2MQTT : 1 = publié, 2 = modifiable (set), 4 = lisible à la demande (get).
const ACCESS_PUBLISHED = 1;
const ACCESS_SET = 2;

const TYPES = new Set(['binary', 'numeric', 'enum']);

/** Aplatit les `exposes` (les types composés comme `switch` ou `light` portent leurs `features`). */
function flatten(exposes: Expose[]): Expose[] {
  const out: Expose[] = [];
  for (const e of exposes) {
    if (Array.isArray(e.features) && e.features.length) out.push(...flatten(e.features));
    else out.push(e);
  }
  return out;
}

function toAccess(bits: number | undefined): Capability['access'] {
  const access = bits ?? ACCESS_PUBLISHED;
  if (access & ACCESS_SET) return access & ACCESS_PUBLISHED ? 'readwrite' : 'write';
  return 'read';
}

const isSimple = (v: unknown): v is boolean | number | string => ['boolean', 'number', 'string'].includes(typeof v);

/** Capacités et correspondances binaires d'un appareil, à partir de ses `exposes`. */
export function capabilitiesFromExposes(exposes: Expose[] = []): { capabilities: Capability[]; binaries: Record<string, BinaryMapping> } {
  const capabilities: Capability[] = [];
  const binaries: Record<string, BinaryMapping> = {};
  const seen = new Set<string>();

  for (const e of flatten(exposes)) {
    const name = e.property;
    if (!name || !e.type || !TYPES.has(e.type) || seen.has(name)) continue;
    seen.add(name);

    const cap: Capability = { name, type: e.type as Capability['type'], access: toAccess(e.access) };
    if (e.unit) cap.unit = e.unit;
    if (e.type === 'enum') cap.values = (e.values ?? []).filter(isSimple).map(String);
    if (e.type === 'binary') {
      binaries[name] = {
        on: isSimple(e.value_on) ? e.value_on : true,
        off: isSimple(e.value_off) ? e.value_off : false,
      };
    }
    capabilities.push(cap);
  }
  return { capabilities, binaries };
}

/**
 * Appareils exploitables dans le message retenu `zigbee2mqtt/bridge/devices` :
 * coordinateur, appareils non reconnus et appairages inachevés sont ignorés.
 */
export function devicesFromBridge(payload: unknown): KnownDevice[] {
  if (!Array.isArray(payload)) return [];
  const devices: KnownDevice[] = [];
  for (const raw of payload as Z2mDevice[]) {
    if (!raw || raw.type === 'Coordinator' || !raw.ieee_address || !raw.definition) continue;
    const interviewed = raw.interview_state ? raw.interview_state === 'SUCCESSFUL' : raw.interview_completed !== false;
    if (!interviewed) continue;

    const { capabilities, binaries } = capabilitiesFromExposes(raw.definition.exposes);
    const description = raw.description?.trim() || raw.definition.description;
    devices.push({
      ieee: raw.ieee_address.toLowerCase(),
      friendlyName: raw.friendly_name ?? raw.ieee_address,
      model: raw.definition.model ?? 'inconnu',
      ...(raw.definition.vendor ? { vendor: raw.definition.vendor } : {}),
      ...(description ? { description } : {}),
      capabilities,
      binaries,
    });
  }
  return devices;
}
