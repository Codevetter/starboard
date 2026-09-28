type AppHealthTracker = { flush?: () => Promise<void> };

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('[data-log]')) return;

  const appHealth = (window as Window & { appHealth?: AppHealthTracker }).appHealth;
  if (!appHealth?.flush) return;

  queueMicrotask(() => {
    void appHealth.flush?.().catch(() => {});
  });
});
