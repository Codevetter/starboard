import { pathToFileURL } from 'node:url';

const DEFAULT_HOSTNAME = 'starboard.codevetter.com';

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function buildPurgeRequest({ zoneId, hostname }) {
  if (!/^[a-f0-9]{32}$/i.test(zoneId)) {
    throw new Error('CLOUDFLARE_ZONE_ID must be a 32-character hexadecimal zone ID');
  }

  const normalizedHostname = hostname.trim().toLowerCase();
  if (normalizedHostname !== DEFAULT_HOSTNAME) {
    throw new Error(`Refusing to purge unexpected hostname: ${normalizedHostname}`);
  }

  return {
    url: `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    body: { hosts: [normalizedHostname] },
  };
}

export async function purgeCloudflareCache({ token, zoneId, hostname, fetchImpl = fetch }) {
  const request = buildPurgeRequest({ zoneId, hostname });
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request.body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    const errors = Array.isArray(payload?.errors)
      ? payload.errors.map(
          ({ code, message }) => `${code ?? 'unknown'}: ${message ?? 'unknown error'}`
        )
      : [];
    const detail = errors.length > 0 ? ` (${errors.join('; ')})` : '';
    throw new Error(`Cloudflare cache purge failed with HTTP ${response.status}${detail}`);
  }

  return request.body.hosts[0];
}

async function main() {
  const token = requireEnvironment('CLOUDFLARE_CACHE_PURGE_TOKEN');
  const zoneId = requireEnvironment('CLOUDFLARE_ZONE_ID');
  const hostname = process.env.CLOUDFLARE_CACHE_HOSTNAME?.trim() || DEFAULT_HOSTNAME;
  const purgedHostname = await purgeCloudflareCache({ token, zoneId, hostname });
  console.log(`Purged Cloudflare cache for ${purgedHostname}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Cloudflare cache purge failed');
    process.exitCode = 1;
  });
}
