// Browser-side MSW worker. Started from src/components/MswReady.tsx when
// USE_MOCK is on, it intercepts client fetches (login / sign-out hit Supabase
// auth directly from the browser).
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
