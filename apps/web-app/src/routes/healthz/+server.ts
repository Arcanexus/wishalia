import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

/** Liveness probe of the Kubernetes Deployment. */
export const GET: RequestHandler = () => json({ status: "ok" });
