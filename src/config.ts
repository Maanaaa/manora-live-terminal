export interface Config {
  apiUrl: string;
  terminalId: string;
  terminalKey: string;
  mqttUrl: string;
  mqttUser?: string;
  mqttPassword?: string;
  baseTopic: string;
  queueFile: string;
  heartbeatMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
    return value;
  };
  return {
    apiUrl: required('API_URL').replace(/\/+$/, ''),
    terminalId: required('TERMINAL_ID'),
    terminalKey: required('TERMINAL_KEY'),
    mqttUrl: env.MQTT_URL?.trim() || 'mqtt://localhost:1883',
    mqttUser: env.MQTT_USER?.trim() || undefined,
    mqttPassword: env.MQTT_PASSWORD?.trim() || undefined,
    baseTopic: env.Z2M_BASE_TOPIC?.trim() || 'zigbee2mqtt',
    queueFile: env.QUEUE_FILE?.trim() || './data/queue.json',
    heartbeatMs: Number(env.HEARTBEAT_MS) || 30_000,
  };
}
