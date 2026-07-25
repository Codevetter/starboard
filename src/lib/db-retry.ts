export function isRetryableDbError(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    cause?: { code?: string };
    message?: string;
  };
  const message = error instanceof Error ? error.message : String(error);

  return (
    candidate?.code === 'SERVER_ERROR' ||
    candidate?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message.includes('fetch failed') ||
    message.includes('Connect Timeout') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT')
  );
}
