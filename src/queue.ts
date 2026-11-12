// File locale des événements : ils sont gardés sur disque tant que l'API ne les a pas acceptés,
// puis renvoyés au retour du réseau (exigence « coupure réseau » du sujet).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { TerminalEvent } from './types.ts';

export class EventQueue {
  private items: TerminalEvent[] = [];
  private readonly file: string;
  private readonly max: number;

  constructor(file: string, max = 10_000) {
    this.file = file;
    this.max = max;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(saved)) this.items = saved;
    } catch {
      // Pas encore de file sur disque.
    }
  }

  get size() {
    return this.items.length;
  }

  push(event: TerminalEvent) {
    this.items.push(event);
    // File bornée : au-delà, les plus anciens sont abandonnés pour protéger la carte SD.
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
    this.save();
  }

  peek(count: number): TerminalEvent[] {
    return this.items.slice(0, count);
  }

  drop(count: number) {
    this.items.splice(0, count);
    this.save();
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.items));
    renameSync(tmp, this.file); // écriture atomique
  }
}
