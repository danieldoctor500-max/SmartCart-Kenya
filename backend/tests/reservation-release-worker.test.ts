import { describe, expect, it, vi } from "vitest";

import { createReservationReleaseWorker } from "../src/modules/checkout/reservation-release-worker.js";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("reservation release worker", () => {
  it("does not start another release while the previous run is active", async () => {
    const deferred = createDeferred<number>();
    const release = vi.fn(() => deferred.promise);
    const run = createReservationReleaseWorker(release);

    const firstRun = run();
    await run();

    expect(release).toHaveBeenCalledTimes(1);

    deferred.resolve(0);
    await firstRun;
    await run();

    expect(release).toHaveBeenCalledTimes(2);
  });

  it("logs failures and releases the guard so a later run can proceed", async () => {
    const logger = { error: vi.fn() };
    const release = vi.fn()
      .mockRejectedValueOnce(new Error("transaction unavailable"))
      .mockResolvedValueOnce(0);
    const run = createReservationReleaseWorker(release, logger);

    await run();
    await run();

    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      "Failed to release expired inventory reservations.",
    );
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      "transaction unavailable",
    );
    expect(release).toHaveBeenCalledTimes(2);
  });
});
