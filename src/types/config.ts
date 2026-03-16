export interface ServerConfig {
  host: string;
  user: string;
  keyPath: string;
  localPort: number;
  remotePort: number;
}

export interface RuntimeConfig {
  heartbeatIntervalSec: number;
  reconnectIntervalSec: number;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  server: ServerConfig;
  gatewayToken: string;
  nodeName: string;
  nodeId: string;
  cdpPort: number;
  cdpRemotePort: number;
  createdAt: string;
}

export interface AppConfig {
  profiles: ConnectionProfile[];
  activeProfileId: string | null;
  runtime: RuntimeConfig;
  globalAllow: boolean;
}

export function createDefaultProfile(): ConnectionProfile {
  return {
    id: crypto.randomUUID(),
    name: "",
    server: {
      host: "",
      user: "",
      keyPath: "~/.ssh/id_ed25519",
      localPort: 18789,
      remotePort: 18789,
    },
    gatewayToken: "",
    nodeName: "OpenClaw Connector",
    nodeId: crypto.randomUUID(),
    cdpPort: 9222,
    cdpRemotePort: 19222,
    createdAt: new Date().toISOString(),
  };
}

export function createDefaultConfig(): AppConfig {
  const profile = createDefaultProfile();
  return {
    profiles: [profile],
    activeProfileId: profile.id,
    runtime: {
      heartbeatIntervalSec: 15,
      reconnectIntervalSec: 5,
    },
    globalAllow: true,
  };
}
