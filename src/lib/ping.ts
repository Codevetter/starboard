// Drop-in App Health log client. Zero dependencies, one POST per call.
// Copy this file into an app (e.g. src/lib/ping.ts) and call:
//
//   import { ping } from '@/lib/ping';
//   await ping('signup', { title: user.email, props: { plan: 'free' } });
//   void ping('waitlist.join', { title: email, icon: '📝' });
//
// It speaks the LogBatchV1 contract of POST /v1/logs. It never throws, times
// out after 3 s, and is a silent no-op until APP_HEALTH_INGEST_KEY is set, so
// it is safe to merge before the key exists. On Node servers with steady
// traffic prefer the batching SDK: `appHealth.log()` in @saas-maker/app-health.
//
// Environment:
//   APP_HEALTH_INGEST_KEY    product ingest key (secret)
//   APP_HEALTH_ENVIRONMENT   environment name the key routes to (default production)
//   APP_HEALTH_LOGS_URL      override the endpoint (default https://ingest.sassmaker.com/v1/logs)

export type PingLevel = 'debug' | 'info' | 'warn' | 'error';
export type PingScalar = string | number | boolean | null | undefined;

export interface PingOptions {
  /** debug | info | warn | error. Default info. */
  level?: PingLevel;
  title?: string;
  description?: string;
  icon?: string;
  props?: Record<string, PingScalar>;
}

export interface PingConfig {
  key?: string;
  environment?: string;
  url?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  onError?: (err: unknown) => void;
}

export interface PingFn {
  (event: string, options?: PingOptions): Promise<boolean>;
  debug: (event: string, options?: Omit<PingOptions, 'level'>) => Promise<boolean>;
  info: (event: string, options?: Omit<PingOptions, 'level'>) => Promise<boolean>;
  warn: (event: string, options?: Omit<PingOptions, 'level'>) => Promise<boolean>;
  error: (event: string, options?: Omit<PingOptions, 'level'>) => Promise<boolean>;
}

const DEFAULT_URL = 'https://ingest.sassmaker.com/v1/logs';

function readEnv(name: string): string | undefined {
  // `process` exists on Node and on Workers with nodejs_compat (OpenNext apps).
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name];
}

/** Build a ping function bound to explicit config. Missing config is read from the environment at call time. */
export function createPing(config: PingConfig = {}): PingFn {
  const send = async (event: string, options: PingOptions = {}): Promise<boolean> => {
    const key = config.key ?? readEnv('APP_HEALTH_INGEST_KEY');
    if (!key) return false;
    const url = config.url ?? readEnv('APP_HEALTH_LOGS_URL') ?? DEFAULT_URL;
    const environment = config.environment ?? readEnv('APP_HEALTH_ENVIRONMENT') ?? 'production';
    const fetchImpl = config.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 3000);
    try {
      const props: Record<string, string | number | boolean | null> = {};
      for (const [k, v] of Object.entries(options.props ?? {})) {
        if (v !== undefined) props[k] = v;
      }
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          batch_id: crypto.randomUUID(),
          schema_version: 'v1',
          environment,
          logs: [
            {
              log_id: crypto.randomUUID(),
              timestamp: Date.now(),
              event,
              level: options.level ?? 'info',
              title: options.title,
              description: options.description,
              icon: options.icon,
              props,
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        config.onError?.(new Error(`ping ${event}: HTTP ${res.status}`));
        return false;
      }
      return true;
    } catch (err) {
      config.onError?.(err);
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  const withLevel = (level: PingLevel) => (event: string, options: Omit<PingOptions, 'level'> = {}) =>
    send(event, { ...options, level });
  return Object.assign(send, {
    debug: withLevel('debug'),
    info: withLevel('info'),
    warn: withLevel('warn'),
    error: withLevel('error'),
  });
}

/** Default instance: reads APP_HEALTH_* from the environment at call time. */
export const ping: PingFn = createPing({
  onError: (err) => console.warn('[ping]', err instanceof Error ? err.message : String(err)),
});
