type AppHealthTracker = {
  track?: (eventName: string) => void;
  flush?: () => Promise<void>;
};

const CTA_EVENTS = new Set(['project_preview_cta_clicked', 'public_catalog_browsed']);

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const action = event.target.closest('[data-log]');
  if (!action) return;

  const appHealth = (window as Window & { appHealth?: AppHealthTracker }).appHealth;
  if (!appHealth?.flush) return;

  const eventName = action.getAttribute('data-log');
  if (eventName && CTA_EVENTS.has(eventName)) appHealth.track?.(eventName);

  queueMicrotask(() => {
    void appHealth.flush?.().catch(() => {});
  });
});
