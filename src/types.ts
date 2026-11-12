// Formats du contrat d'API (docs/adr/0002-contrat-api.md).

export type Value = boolean | number | string | null;

export interface Capability {
  name: string;
  type: 'binary' | 'numeric' | 'enum';
  unit?: string;
  values?: string[];
  access: 'read' | 'write' | 'readwrite';
}

/** Appareil tel qu'envoyé sur `PUT /terminal/devices`. */
export interface TerminalDevice {
  ieee: string;
  model: string;
  vendor?: string;
  description?: string;
  capabilities: Capability[];
}

/** Événement envoyé sur `POST /terminal/events`. */
export interface TerminalEvent {
  terminal: string;
  device: string;
  model: string;
  readings: Record<string, Value>;
  ts: string;
}

/** Correspondance binaire Zigbee2MQTT ↔ booléen (ex. state : ON/OFF, contact : true/false). */
export interface BinaryMapping {
  on: Value;
  off: Value;
}

/** Ce que la passerelle sait d'un appareil, déduit de `zigbee2mqtt/bridge/devices`. */
export interface KnownDevice extends TerminalDevice {
  friendlyName: string;
  binaries: Record<string, BinaryMapping>;
}
