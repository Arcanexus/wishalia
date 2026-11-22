import { createHealthServer } from "./health.js";

// The job queue (pg-boss on PostgreSQL) and the enrichment jobs come with the data model step.
const port = Number(process.env.HEALTH_PORT ?? 3001);
let running = true;

const server = createHealthServer(() => running);
server.listen(port);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    running = false;
    server.close(() => process.exit(0));
  });
}
