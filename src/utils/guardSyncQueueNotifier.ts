type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to local pending-queue mutations (flush, enqueue). Returns unsubscribe. */
export function subscribeGuardSyncQueueChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyGuardSyncQueueChanged(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* subscriber owns its errors */
    }
  }
}
