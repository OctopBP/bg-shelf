"use client";

import { useEffect, useState } from "react";
import { USE_MOCK } from "@/lib/mock/config";

// In mock mode, hold rendering until the browser MSW worker is active so the
// first client request (login / sign-out → Supabase auth) is intercepted.
// When USE_MOCK is off this is a no-op pass-through.
export default function MswReady({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!USE_MOCK);

  useEffect(() => {
    if (!USE_MOCK) return;
    let active = true;
    import("@/mocks/browser").then(({ worker }) =>
      worker
        .start({ onUnhandledRequest: "bypass" })
        .then(() => active && setReady(true))
    );
    return () => {
      active = false;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
