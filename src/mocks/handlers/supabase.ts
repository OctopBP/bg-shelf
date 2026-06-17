// MSW handlers that emulate the Supabase endpoints the app touches, backed by
// the in-memory store in lib/mock/store.ts:
//   - GoTrue auth: signup / token / user / logout
//   - PostgREST: collection_items (select/upsert/delete/update) and games (upsert)
// The real @supabase/ssr clients run unchanged; only the network is faked.
import { http, HttpResponse } from "msw";
import { DEMO_USER } from "@/lib/mock/config";
import {
  upsertGame,
  upsertItem,
  deleteItem,
  updateItemFields,
  updateGame,
  selectItems,
  selectAllItems,
  selectMemberships,
  selectItemCollectionIds,
  createCollection,
  renameCollection,
  deleteCollection,
  memberEmails,
  shareCollection,
  removeMember,
  type GameRecord,
  type Role,
} from "@/lib/mock/store";

// --- Auth -------------------------------------------------------------------
const FAR_FUTURE = 4102444800; // 2100-01-01, in seconds

function base64url(obj: unknown): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A structurally-valid (unsigned) JWT so @supabase/auth-js accepts the session. */
function fakeJwt(): string {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    sub: DEMO_USER.id,
    email: DEMO_USER.email,
    role: "authenticated",
    aud: "authenticated",
    iat: Math.floor(Date.now() / 1000),
    exp: FAR_FUTURE,
  });
  return `${header}.${payload}.mock-signature`;
}

function demoUser() {
  const now = new Date().toISOString();
  return {
    id: DEMO_USER.id,
    aud: "authenticated",
    role: "authenticated",
    email: DEMO_USER.email,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function session() {
  return {
    access_token: fakeJwt(),
    token_type: "bearer",
    expires_in: FAR_FUTURE - Math.floor(Date.now() / 1000),
    expires_at: FAR_FUTURE,
    refresh_token: `mock-refresh-${Math.random().toString(36).slice(2)}`,
    user: demoUser(),
  };
}

const authHandlers = [
  http.post("*/auth/v1/signup", () => HttpResponse.json(session())),

  http.post("*/auth/v1/token", () => HttpResponse.json(session())),

  http.get("*/auth/v1/user", ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth) {
      return HttpResponse.json(
        { code: 401, msg: "No authorization header" },
        { status: 401 }
      );
    }
    return HttpResponse.json(demoUser());
  }),

  http.post("*/auth/v1/logout", () => new HttpResponse(null, { status: 204 })),
];

// --- PostgREST --------------------------------------------------------------
/** `?user_id=eq.demo-user` → "demo-user" */
function eqValue(url: URL, column: string): string | undefined {
  const raw = url.searchParams.get(column);
  if (!raw) return undefined;
  return raw.startsWith("eq.") ? raw.slice(3) : raw;
}

function wantsObject(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("vnd.pgrst.object");
}

const PGRST116 = HttpResponse.json(
  { code: "PGRST116", message: "Results contain 0 rows" },
  { status: 406 }
);

const restHandlers = [
  // collection_items: одна коллекция (?collection_id=eq…), все игры (embed
  // collections(name)) или просто список collection_id для счётчиков.
  http.get("*/rest/v1/collection_items", ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get("select") ?? "";
    const collectionId = eqValue(url, "collection_id");
    const bggId = eqValue(url, "bgg_id");

    // select=collection_id (без embed games) — запрос для подсчёта игр
    if (!select.includes("games")) {
      return HttpResponse.json(selectItemCollectionIds(DEMO_USER.id));
    }

    let rows =
      collectionId !== undefined
        ? selectItems(collectionId)
        : selectAllItems(DEMO_USER.id);
    if (bggId !== undefined) {
      rows = rows.filter((r) => r.bgg_id === Number(bggId));
    }

    if (wantsObject(request)) {
      return rows.length === 1 ? HttpResponse.json(rows[0]) : PGRST116;
    }
    return HttpResponse.json(rows);
  }),

  // upsert collection_items (one object or an array)
  http.post("*/rest/v1/collection_items", async ({ request }) => {
    const body = await request.json();
    const rows = (Array.isArray(body) ? body : [body]) as Array<
      Record<string, unknown>
    >;
    for (const row of rows) {
      upsertItem(
        String(row.collection_id),
        Number(row.bgg_id),
        (row.tags as string[]) ?? [],
        (row.added_by as string | null) ?? null
      );
    }
    return HttpResponse.json([], { status: 201 });
  }),

  http.delete("*/rest/v1/collection_items", ({ request }) => {
    const url = new URL(request.url);
    deleteItem(String(eqValue(url, "collection_id")), Number(eqValue(url, "bgg_id")));
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch("*/rest/v1/collection_items", async ({ request }) => {
    const url = new URL(request.url);
    const body = (await request.json()) as {
      tags?: string[];
      notes?: string | null;
    };
    updateItemFields(
      String(eqValue(url, "collection_id")),
      Number(eqValue(url, "bgg_id")),
      {
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      }
    );
    return new HttpResponse(null, { status: 204 });
  }),

  // collection_members: список коллекций пользователя (embed collections) или
  // проверка роли в одной коллекции (?collection_id=eq…&user_id=eq…).
  http.get("*/rest/v1/collection_members", ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get("select") ?? "";
    const userId = eqValue(url, "user_id") ?? DEMO_USER.id;
    const collectionId = eqValue(url, "collection_id");

    if (select.includes("collections")) {
      return HttpResponse.json(selectMemberships(userId));
    }

    const rows = selectMemberships(userId)
      .filter((m) => !collectionId || m.collections?.id === collectionId)
      .map((m) => ({ role: m.role }));
    if (wantsObject(request)) {
      return rows.length === 1 ? HttpResponse.json(rows[0]) : PGRST116;
    }
    return HttpResponse.json(rows);
  }),

  http.delete("*/rest/v1/collection_members", ({ request }) => {
    const url = new URL(request.url);
    removeMember(
      String(eqValue(url, "collection_id")),
      String(eqValue(url, "user_id"))
    );
    return new HttpResponse(null, { status: 204 });
  }),

  // collections: переименование и удаление
  http.patch("*/rest/v1/collections", async ({ request }) => {
    const url = new URL(request.url);
    const body = (await request.json()) as { name?: string };
    if (body.name !== undefined) {
      renameCollection(String(eqValue(url, "id")), body.name);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete("*/rest/v1/collections", ({ request }) => {
    const url = new URL(request.url);
    deleteCollection(String(eqValue(url, "id")));
    return new HttpResponse(null, { status: 204 });
  }),

  // RPC: создание коллекции
  http.post("*/rest/v1/rpc/create_collection", async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const collection = createCollection(DEMO_USER.id, body.name);
    return HttpResponse.json(collection);
  }),

  // RPC: поделиться коллекцией по email
  http.post("*/rest/v1/rpc/share_collection", async ({ request }) => {
    const body = (await request.json()) as {
      cid: string;
      invitee_email: string;
      member_role: Role;
    };
    const err = shareCollection(
      body.cid,
      body.invitee_email,
      body.member_role,
      DEMO_USER.id
    );
    if (err) {
      return HttpResponse.json(
        { code: "P0001", message: err },
        { status: 400 }
      );
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // RPC: участники коллекции с email
  http.post("*/rest/v1/rpc/collection_member_emails", async ({ request }) => {
    const body = (await request.json()) as { cid: string };
    return HttpResponse.json(memberEmails(body.cid));
  }),

  // upsert games cache (one object or an array)
  http.post("*/rest/v1/games", async ({ request }) => {
    const body = await request.json();
    const rows = (Array.isArray(body) ? body : [body]) as GameRecord[];
    for (const row of rows) upsertGame(row);
    return HttpResponse.json([], { status: 201 });
  }),

  // patch games cache (manual edits to shared game info)
  http.patch("*/rest/v1/games", async ({ request }) => {
    const url = new URL(request.url);
    const body = (await request.json()) as Partial<GameRecord>;
    updateGame(Number(eqValue(url, "bgg_id")), body);
    return new HttpResponse(null, { status: 204 });
  }),
];

export const supabaseHandlers = [...authHandlers, ...restHandlers];
