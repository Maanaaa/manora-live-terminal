// Client HTTP de l'API pour le terminal (authentifié par la clé du terminal).

import type { TerminalDevice, TerminalEvent } from './types.ts';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class TerminalApi {
  private readonly baseUrl: string;
  private readonly key: string;

  constructor(baseUrl: string, key: string) {
    this.baseUrl = baseUrl;
    this.key = key;
  }

  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new ApiError(0, `API injoignable (${(err as Error).message})`);
    }
    if (!res.ok) throw new ApiError(res.status, `${method} ${path} → ${res.status} ${await res.text().catch(() => '')}`.trim());
    return (await res.json()) as T;
  }

  heartbeat() {
    return this.request<{ ok: boolean }>('POST', '/terminal/heartbeat', {});
  }

  syncDevices(devices: TerminalDevice[]) {
    return this.request<unknown[]>('PUT', '/terminal/devices', { devices });
  }

  sendEvents(events: TerminalEvent[]) {
    return this.request<{ accepted: number }>('POST', '/terminal/events', { events });
  }

  socketUrl() {
    return `${this.baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(this.key)}`;
  }
}
