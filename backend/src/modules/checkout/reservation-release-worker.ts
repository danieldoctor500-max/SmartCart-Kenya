type ReservationRelease = () => Promise<number>;
type WorkerLogger = Pick<Console, "error">;

export function createReservationReleaseWorker(
  releaseExpiredReservations: ReservationRelease,
  logger: WorkerLogger = console,
) {
  let isRunning = false;

  return async function runReservationRelease(): Promise<void> {
    if (isRunning) return;

    isRunning = true;
    try {
      await releaseExpiredReservations();
    } catch (error: unknown) {
      logger.error("Failed to release expired inventory reservations.");
      if (error instanceof Error) logger.error(error.message);
    } finally {
      isRunning = false;
    }
  };
}
