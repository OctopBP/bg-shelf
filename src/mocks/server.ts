// Node-side MSW server. Started from instrumentation.ts when USE_MOCK is on,
// it intercepts every server-side fetch: RSC, route handlers, and the
// Node-runtime proxy.
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
