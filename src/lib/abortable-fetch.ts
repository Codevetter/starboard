export interface AbortControllerRef {
  current: AbortController | null;
}

/**
 * Replace a first-page request without allowing a later React effect to abort
 * the request that just became current.
 */
export async function replaceAbortableJsonRequest<T>(
  controllerRef: AbortControllerRef,
  url: string
): Promise<T> {
  controllerRef.current?.abort();
  const controller = new AbortController();
  controllerRef.current = controller;

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as T;
  } finally {
    if (controllerRef.current === controller) controllerRef.current = null;
  }
}
