import { USE_MOCK } from "@/lib/mock/config";

// Runs once per server instance. In mock mode, start the Node MSW server so all
// server-side fetches (RSC, route handlers, the Node-runtime proxy) are
// intercepted. Imported dynamically so msw/node is never bundled into the Edge
// runtime.
export async function register() {
  if (!USE_MOCK) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { server } = await import("@/mocks/server");
  server.listen({ onUnhandledRequest: "bypass" });
}
