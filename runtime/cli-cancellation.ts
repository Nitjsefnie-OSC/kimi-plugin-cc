import process from "node:process";

/**
 * AbortController-based cancellation for cli-client commands.
 *
 * The handler registers SIGTERM/SIGINT listeners immediately so a signal fired
 * before runCliPrompt awaits still latches `cancelling = true` and aborts the
 * controller. The controller's AbortSignal is exposed via `handlers.signal`.
 */
export interface CliCancellationHandlers {
  /** True once SIGTERM/SIGINT has been observed. */
  readonly cancelling: boolean;
  /** AbortSignal to forward to `runCliPrompt`. */
  readonly signal: AbortSignal;
  /**
   * Remove the SIGTERM/SIGINT listeners. Call once in a `finally` block;
   * idempotent. The internal AbortController is left in whatever state
   * the signal handler put it — disposing does NOT abort.
   */
  dispose(): void;
}

export function createCliCancellationHandlers(): CliCancellationHandlers {
  const controller = new AbortController();
  let cancelling = false;
  let disposed = false;

  const onSignal = () => {
    if (cancelling) return;
    cancelling = true;
    // Abort BEFORE running through dispose — the cli-client may still be
    // in its pre-spawn signal check or its post-spawn wait, both of which
    // honor signal.aborted.
    try {
      controller.abort();
    } catch {
      // AbortController.abort() can't throw in standard runtimes, but
      // belt-and-suspenders for runtime quirks (e.g. test harnesses
      // overriding global AbortController).
    }
  };

  // Use `process.on` (not `once`) so dispose() can remove the listener
  // via the function reference. `process.once` wraps the callback
  // internally and depending on Node version removeListener may miss it.
  // Idempotency comes from the `if (cancelling) return` guard.
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  return {
    get cancelling() {
      return cancelling;
    },
    get signal() {
      return controller.signal;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      process.off("SIGTERM", onSignal);
      process.off("SIGINT", onSignal);
    },
  };
}
