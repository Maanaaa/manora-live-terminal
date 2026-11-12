// Normalisation (exigée par le sujet), testée sur la vraie liste publiée par le Zigbee2MQTT du Pi
// (prise SONOFF S60ZBTPF, détecteur d'ouverture SONOFF SNZB-04P).

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { capabilitiesFromExposes, devicesFromBridge } from '../src/devices.ts';
import { momentaryReset, toTerminalEvent, toZ2mSet } from '../src/normalize.ts';
import { EventQueue } from '../src/queue.ts';

const bridge = JSON.parse(readFileSync(new URL('./fixtures/bridge-devices.json', import.meta.url), 'utf8'));
const devices = devicesFromBridge(bridge);
const plug = devices.find((d) => d.model === 'S60ZBTPF')!;
const contact = devices.find((d) => d.model === 'SNZB-04P')!;
const now = new Date('2026-11-12T18:00:00Z');

test('le coordinateur est ignoré, les deux appareils sont reconnus', () => {
  assert.equal(devices.length, 2);
  assert.ok(plug && contact);
  assert.equal(plug.ieee, plug.ieee.toLowerCase());
});

test('capacités de la prise déduites des exposes, sans modèle codé en dur', () => {
  const state = plug.capabilities.find((c) => c.name === 'state');
  assert.deepEqual(state, { name: 'state', type: 'binary', access: 'readwrite' });
  assert.deepEqual(plug.capabilities.find((c) => c.name === 'power'), { name: 'power', type: 'numeric', unit: 'W', access: 'read' });
  const behavior = plug.capabilities.find((c) => c.name === 'power_on_behavior');
  assert.equal(behavior?.type, 'enum');
  assert.ok(behavior?.values?.includes('on'));
});

test('capacités du détecteur : contact et batterie en lecture seule', () => {
  assert.deepEqual(contact.capabilities.find((c) => c.name === 'contact'), { name: 'contact', type: 'binary', access: 'read' });
  assert.deepEqual(contact.capabilities.find((c) => c.name === 'battery'), { name: 'battery', type: 'numeric', unit: '%', access: 'read' });
});

test('aucune capacité en double ni de type inconnu', () => {
  for (const d of devices) {
    const names = d.capabilities.map((c) => c.name);
    assert.equal(new Set(names).size, names.length);
    for (const c of d.capabilities) assert.ok(['binary', 'numeric', 'enum'].includes(c.type));
  }
});

test('un nouveau modèle inconnu est pris en charge par ses exposes', () => {
  const { capabilities } = capabilitiesFromExposes([
    { type: 'binary', property: 'occupancy', access: 1, value_on: true, value_off: false },
    { type: 'numeric', property: 'temperature', unit: '°C', access: 1 },
    { type: 'light', features: [{ type: 'binary', property: 'state', access: 7, value_on: 'ON', value_off: 'OFF' }] },
    { type: 'text', property: 'note', access: 1 },
  ]);
  assert.deepEqual(capabilities.map((c) => `${c.name}:${c.type}:${c.access}`), ['occupancy:binary:read', 'temperature:numeric:read', 'state:binary:readwrite']);
});

test('prise : ON/OFF devient un booléen, les objets imbriqués sont ignorés', () => {
  const event = toTerminalEvent('pi-manora', plug, { state: 'ON', power: 12.5, linkquality: 120, update: { state: 'idle' } }, now);
  assert.deepEqual(event, {
    terminal: 'pi-manora',
    device: plug.ieee,
    model: 'S60ZBTPF',
    readings: { state: true, power: 12.5, linkquality: 120 },
    ts: '2026-11-12T18:00:00.000Z',
  });
  assert.equal(toTerminalEvent('pi-manora', plug, { state: 'OFF' }, now)?.readings.state, false);
});

test('détecteur : la convention booléenne de Zigbee2MQTT est conservée (contact true = fermé)', () => {
  assert.deepEqual(toTerminalEvent('pi-manora', contact, { contact: true, battery: 100 }, now)?.readings, { contact: true, battery: 100 });
  assert.equal(toTerminalEvent('pi-manora', contact, { contact: false }, now)?.readings.contact, false);
});

test('message vide ou sans valeur simple : pas d’événement', () => {
  assert.equal(toTerminalEvent('pi-manora', plug, { update: { state: 'idle' } }, now), null);
  assert.equal(toTerminalEvent('pi-manora', plug, 'texte', now), null);
  assert.equal(toTerminalEvent('pi-manora', plug, { power: Number.NaN }, now), null);
});

test('commande : booléen de l’API → ON/OFF pour la prise', () => {
  assert.deepEqual(toZ2mSet(plug, 'state', true), { state: 'ON' });
  assert.deepEqual(toZ2mSet(plug, 'state', false), { state: 'OFF' });
  assert.deepEqual(toZ2mSet(plug, 'power_on_behavior', 'previous'), { power_on_behavior: 'previous' });
});

test('file locale : persistée sur disque et relue au redémarrage, bornée', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'manora-file-')), 'queue.json');
  const q = new EventQueue(file, 3);
  for (let i = 0; i < 5; i++) q.push({ terminal: 't', device: 'd', model: 'm', readings: { n: i }, ts: now.toISOString() });
  assert.equal(q.size, 3);
  const reloaded = new EventQueue(file, 3);
  assert.deepEqual(reloaded.peek(10).map((e) => e.readings.n), [2, 3, 4]);
  reloaded.drop(2);
  assert.deepEqual(new EventQueue(file, 3).peek(10).map((e) => e.readings.n), [4]);
});

test('télécommande : chaque appui est suivi d’un réarmement (action: null)', () => {
  const remote = { ...plug, binaries: {} };
  const press = toTerminalEvent('pi-manora', remote, { action: 'single', battery: 90 }, now)!;
  const reset = momentaryReset(press);
  assert.deepEqual(reset?.readings, { action: null });
  assert.equal(reset?.ts, '2026-11-12T18:00:00.001Z');
  assert.equal(momentaryReset(toTerminalEvent('pi-manora', plug, { state: 'ON' }, now)!), null);
  assert.equal(momentaryReset({ ...press, readings: { action: '' } }), null);
});
