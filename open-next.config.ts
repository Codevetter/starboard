import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache';
import { purgeCache } from '@opennextjs/cloudflare/overrides/cache-purge/index';

// Real ISR: without an incremental-cache backend every route render happens
// live per request (the previous bare config silently meant "no cache"), so a
// crawler walking the catalog re-rendered each URL once per POP. R2 is global
// and shared across colos; the regional layer keeps hot entries in-memory
// per region; the DO queue serializes revalidation; the sharded DO tag cache
// keeps revalidateTag/revalidatePath correct.
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),
  queue: doQueue,
  tagCache: doShardedTagCache(),
  cachePurge: purgeCache({ type: 'direct' }),
});
