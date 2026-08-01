const BEARER_PATTERN = /^Bearer ([^\s]+)$/i;

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function hasValidOperatorToken(
  authorization: string | null,
  expectedToken: string | undefined
): Promise<boolean> {
  if (!expectedToken) return false;

  const match = authorization?.match(BEARER_PATTERN);
  if (!match) return false;

  const [actualDigest, expectedDigest] = await Promise.all([
    digest(match[1]),
    digest(expectedToken),
  ]);

  let difference = 0;
  for (let i = 0; i < actualDigest.length; i += 1) {
    difference |= actualDigest[i] ^ expectedDigest[i];
  }
  return difference === 0;
}
