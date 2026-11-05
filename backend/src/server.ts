import { env } from "./config/env.js";
import app from "./app.js";
import { prisma } from "./config/database.js";
import { releaseExpiredReservations } from "./modules/checkout/checkout.service.js";
import { createReservationReleaseWorker } from "./modules/checkout/reservation-release-worker.js";

const server = app.listen(env.PORT, () => {
  console.log(
    `SmartCart Kenya API listening on port ${env.PORT} (${env.NODE_ENV})`,
  );
});

const runReservationRelease = createReservationReleaseWorker(
  releaseExpiredReservations,
);
const reservationReleaseTimer = setInterval(() => {
  void runReservationRelease();
}, 60_000);

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(reservationReleaseTimer);

  console.log(`${signal} received. Shutting down gracefully.`);

  server.close(async (serverError) => {
    try {
      await prisma.$disconnect();

      if (serverError) {
        console.error("HTTP server shutdown failed.", serverError);
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
    } catch (error) {
      console.error("Error disconnecting from the database.");

      if (error instanceof Error) {
        console.error(error.message);
      }

      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
