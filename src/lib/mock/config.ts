// Single demo/offline switch. When USE_MOCK=true every outbound HTTP request
// (Anthropic, Supabase auth + REST, BoardGameGeek) is intercepted by MSW
// handlers (see src/mocks) — the real app code runs unchanged, only the network
// is faked. No Supabase or API keys required.
//
// The literal name `USE_MOCK` is read on the server directly from the
// environment and exposed to the client bundle via `env` in next.config.ts, so
// the same flag works in both runtimes.
export const USE_MOCK = process.env.USE_MOCK === "true";

// Credentials handed to the @supabase/ssr clients. In mock mode we feed harmless
// placeholders so the app NEVER reaches a real Supabase project: MSW matches
// requests by path (*/auth/v1/*, */rest/v1/*) regardless of host, so the mock
// still intercepts — and if interception ever drops (e.g. an HMR hiccup), the
// request fails fast against a non-existent host instead of leaking a real
// account. Outside mock mode the real env vars are used unchanged.
export const SUPABASE_URL = USE_MOCK
  ? "https://mock.supabase.local"
  : process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY = USE_MOCK
  ? "mock-publishable-key"
  : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** The single pretend account everyone shares in demo mode. */
export const DEMO_USER = {
  id: "demo-user",
  email: "demo@boardgames.local",
} as const;

/** A second pretend account, so sharing a collection by email can succeed in the
 *  demo (share with this email → membership appears in the dialog). */
export const FRIEND_USER = {
  id: "friend-user",
  email: "friend@boardgames.local",
} as const;
