import "server-only";
import { fal } from "@fal-ai/client";

// FAL_KEY must never reach the browser; this module is server-only and the
// import above makes bundling it into client code a build error.
fal.config({ credentials: process.env.FAL_KEY });

export { fal };
