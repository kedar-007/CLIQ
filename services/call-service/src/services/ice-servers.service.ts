import type { IceServerConfig } from '@comms/types';

function normalizeUrls(value: string | string[]): string | string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return value;
}

export function getIceServers(): IceServerConfig[] {
  const envConfig = process.env.WEBRTC_ICE_SERVERS;
  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig) as IceServerConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((server) => ({
            ...server,
            urls: normalizeUrls(server.urls),
          }))
          .filter((server) =>
            Array.isArray(server.urls) ? server.urls.length > 0 : Boolean(server.urls)
          );
      }
    } catch {
      // fall through to defaults
    }
  }

  const turnUrl = process.env.TURN_SERVER_URL;
  const turnUsername = process.env.TURN_SERVER_USERNAME;
  const turnCredential = process.env.TURN_SERVER_CREDENTIAL;

  const defaults: IceServerConfig[] = [
    { urls: ['stun:stun.l.google.com:19302'] },
  ];

  if (turnUrl && turnUsername && turnCredential) {
    defaults.push({
      urls: [turnUrl],
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return defaults;
}
