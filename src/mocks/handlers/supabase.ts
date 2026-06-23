// MSW handlers that emulate the Supabase endpoints the app touches, backed by
// the in-memory store in lib/mock/store.ts:
//   - GoTrue auth: signup / token / user / logout
//   - PostgREST: collection_items (select/upsert/delete/update) and games (upsert)
// The real @supabase/ssr clients run unchanged; only the network is faked.
import { http, HttpResponse } from "msw";
import { DEMO_USER } from "@/lib/mock/config";
import {
  upsertGame,
  searchGames,
  gamesByIds,
  upsertItem,
  deleteItem,
  updateItemFields,
  updateGame,
  selectItems,
  selectAllItems,
  selectMemberships,
  selectItemCollectionIds,
  selectItemCollectionIdsIn,
  createCollection,
  renameCollection,
  setVisibility,
  deleteCollection,
  memberEmails,
  shareCollection,
  shareCollectionWithUser,
  removeMember,
  getUsername,
  setUsername,
  profilesByIds,
  profileByUsername,
  listFriendships,
  insertFriendship,
  acceptFriendship,
  deleteFriendship,
  collectionsByOwner,
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
  // collections) или список collection_id для счётчиков.
  http.get("*/rest/v1/collection_items", ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get("select") ?? "";
    const collectionIdRaw = url.searchParams.get("collection_id");
    const inList = collectionIdRaw?.startsWith("in.(")
      ? collectionIdRaw
          .slice(4, -1)
          .split(",")
          .map((s) => s.replace(/^"|"$/g, ""))
      : null;
    const collectionId = inList ? undefined : eqValue(url, "collection_id");
    const bggId = eqValue(url, "bgg_id");

    // select без embed games — запрос для подсчёта.
    if (!select.includes("games")) {
      // Точечный запрос конкретной записи по bgg_id (например, перед
      // перемещением) — отдаём настоящую строку с tags/notes, а не счётчик.
      if (bggId !== undefined && collectionId !== undefined) {
        const rows = selectItems(collectionId).filter(
          (r) => r.bgg_id === Number(bggId)
        );
        if (wantsObject(request)) {
          return rows.length === 1 ? HttpResponse.json(rows[0]) : PGRST116;
        }
        return HttpResponse.json(rows);
      }
      // Счётчики игр для коллекций друга (?collection_id=in.(…)).
      if (inList) {
        return HttpResponse.json(selectItemCollectionIdsIn(inList));
      }
      return HttpResponse.json(selectItemCollectionIds(DEMO_USER.id));
    }

    let rows =
      collectionId !== undefined
        ? selectItems(collectionId)
        : selectAllItems(DEMO_USER.id);
    // Сводный вид «Все игры» приходит с ?collection_id=in.(…) — ограничиваем
    // указанными коллекциями пользователя.
    if (inList) {
      rows = rows.filter((r) => inList.includes(String(r.collection_id)));
    }
    if (bggId !== undefined) {
      rows = rows.filter((r) => r.bgg_id === Number(bggId));
    }

    if (wantsObject(request)) {
      return rows.length === 1 ? HttpResponse.json(rows[0]) : PGRST116;
    }
    return HttpResponse.json(rows);
  }),

  // Вью collection_item_counts: агрегат «игр в коллекции» (Фаза 2 P-1).
  // Запрос приходит как ?select=collection_id,game_count&collection_id=in.(…).
  http.get("*/rest/v1/collection_item_counts", ({ request }) => {
    const url = new URL(request.url);
    const raw = url.searchParams.get("collection_id");
    const inList = raw?.startsWith("in.(")
      ? raw
          .slice(4, -1)
          .split(",")
          .map((s) => s.replace(/^"|"$/g, ""))
      : null;
    const rows = inList
      ? selectItemCollectionIdsIn(inList)
      : selectItemCollectionIds(DEMO_USER.id);
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1);
    }
    return HttpResponse.json(
      [...counts].map(([collection_id, game_count]) => ({
        collection_id,
        game_count,
      }))
    );
  }),

  // upsert collection_items (one object or an array).
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
    const bggId = Number(eqValue(url, "bgg_id"));
    deleteItem(String(eqValue(url, "collection_id")), bggId);
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch("*/rest/v1/collection_items", async ({ request }) => {
    const url = new URL(request.url);
    const body = (await request.json()) as {
      tags?: string[];
      notes?: string | null;
    };
    const patch = {
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };
    const bggId = Number(eqValue(url, "bgg_id"));
    updateItemFields(String(eqValue(url, "collection_id")), bggId, patch);
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

    // Список collection_id коллекций пользователя (сводный вид «Все игры»).
    if (select.includes("collection_id")) {
      return HttpResponse.json(
        selectMemberships(userId)
          .filter((m) => m.collections)
          .map((m) => ({ collection_id: m.collections!.id }))
      );
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

  // collections: переименование, видимость и удаление
  http.patch("*/rest/v1/collections", async ({ request }) => {
    const url = new URL(request.url);
    const body = (await request.json()) as {
      name?: string;
      visibility?: "public" | "friends" | "private";
    };
    const id = String(eqValue(url, "id"));
    if (body.name !== undefined) renameCollection(id, body.name);
    if (body.visibility !== undefined) setVisibility(id, body.visibility);
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete("*/rest/v1/collections", ({ request }) => {
    const url = new URL(request.url);
    deleteCollection(String(eqValue(url, "id")));
    return new HttpResponse(null, { status: 204 });
  }),

  // RPC: создание коллекции
  // RPC: поиск игр по имени/альт-именам (демо — по name + original_name)
  http.post("*/rest/v1/rpc/search_games", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      q?: string;
      lim?: number;
    };
    return HttpResponse.json(searchGames(body.q ?? "", body.lim ?? 4));
  }),

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

  // RPC: пригласить друга в коллекцию по user_id
  http.post("*/rest/v1/rpc/share_collection_with_user", async ({ request }) => {
    const body = (await request.json()) as {
      cid: string;
      invitee_id: string;
      member_role: Role;
    };
    const err = shareCollectionWithUser(
      body.cid,
      body.invitee_id,
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

  // --- Друзья --------------------------------------------------------------
  // profiles: свой ник (?id=eq…), поиск по нику (?username=eq…) или ники по
  // списку id (?id=in.(…)).
  http.get("*/rest/v1/profiles", ({ request }) => {
    const url = new URL(request.url);
    const idRaw = url.searchParams.get("id");
    const username = eqValue(url, "username");

    let rows: { id: string; username: string }[];
    if (username) {
      const p = profileByUsername(username);
      rows = p ? [p] : [];
    } else if (idRaw?.startsWith("in.(")) {
      const ids = idRaw
        .slice(4, -1)
        .split(",")
        .map((s) => s.replace(/^"|"$/g, ""));
      rows = profilesByIds(ids);
    } else if (idRaw?.startsWith("eq.")) {
      const id = idRaw.slice(3);
      const name = getUsername(id);
      rows = name ? [{ id, username: name }] : [];
    } else {
      rows = [];
    }

    if (wantsObject(request)) {
      return rows.length === 1 ? HttpResponse.json(rows[0]) : PGRST116;
    }
    return HttpResponse.json(rows);
  }),

  http.patch("*/rest/v1/profiles", async ({ request }) => {
    const url = new URL(request.url);
    const body = (await request.json()) as { username?: string };
    const id = eqValue(url, "id") ?? DEMO_USER.id;
    const res = setUsername(id, body.username ?? "");
    if (res === "taken") {
      return HttpResponse.json(
        { code: "23505", message: "duplicate key value violates unique constraint" },
        { status: 409 }
      );
    }
    if (res === "invalid") {
      return HttpResponse.json(
        { code: "23514", message: "violates check constraint" },
        { status: 400 }
      );
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // friendships: список своих (RLS-фильтр по demo), поиск пары (?or=…),
  // вставка запроса, принятие (patch) и удаление.
  http.get("*/rest/v1/friendships", ({ request }) => {
    const url = new URL(request.url);
    const orParam = url.searchParams.get("or");
    const status = eqValue(url, "status");

    let rows = listFriendships(DEMO_USER.id);
    if (orParam) {
      const ids = [...orParam.matchAll(/eq\.([^,)]+)/g)].map((m) => m[1]);
      const others = new Set(ids.filter((i) => i !== DEMO_USER.id));
      rows = rows.filter((r) => {
        const other =
          r.requester_id === DEMO_USER.id ? r.addressee_id : r.requester_id;
        return others.has(other);
      });
    }
    if (status) rows = rows.filter((r) => r.status === status);

    const out = rows.map((r) => ({
      id: r.id,
      requester_id: r.requester_id,
      addressee_id: r.addressee_id,
      status: r.status,
    }));
    if (wantsObject(request)) {
      return out.length === 1 ? HttpResponse.json(out[0]) : PGRST116;
    }
    return HttpResponse.json(out);
  }),

  http.post("*/rest/v1/friendships", async ({ request }) => {
    const body = (await request.json()) as {
      requester_id: string;
      addressee_id: string;
    };
    insertFriendship(body.requester_id, body.addressee_id);
    return HttpResponse.json([], { status: 201 });
  }),

  http.patch("*/rest/v1/friendships", ({ request }) => {
    const url = new URL(request.url);
    acceptFriendship(String(eqValue(url, "id")));
    return new HttpResponse(null, { status: 204 });
  }),

  http.delete("*/rest/v1/friendships", ({ request }) => {
    const url = new URL(request.url);
    deleteFriendship(String(eqValue(url, "id")));
    return new HttpResponse(null, { status: 204 });
  }),

  // collections: коллекции друга (?owner_id=eq…) для страницы друга.
  http.get("*/rest/v1/collections", ({ request }) => {
    const url = new URL(request.url);
    const ownerId = eqValue(url, "owner_id");
    return HttpResponse.json(ownerId ? collectionsByOwner(ownerId) : []);
  }),

  // games: выборка по списку bgg_id (?bgg_id=in.(…)) — обложки дополнений в окне
  // добавления (getLocalThumbnails). Без фильтра ничего не отдаём.
  http.get("*/rest/v1/games", ({ request }) => {
    const url = new URL(request.url);
    const raw = url.searchParams.get("bgg_id");
    const ids = raw?.startsWith("in.(")
      ? raw
          .slice(4, -1)
          .split(",")
          .map((s) => Number(s.replace(/^"|"$/g, "")))
          .filter((n) => !Number.isNaN(n))
      : [];
    return HttpResponse.json(ids.length ? gamesByIds(ids) : []);
  }),

  // upsert games cache (one object or an array)
  http.post("*/rest/v1/games", async ({ request }) => {
    const body = await request.json();
    const rows = (Array.isArray(body) ? body : [body]) as GameRecord[];
    for (const row of rows) upsertGame(row);
    return HttpResponse.json([], { status: 201 });
  }),

  // RPC: cache_game — пополнение каталога обычным пользователем (SECURITY DEFINER
  // в реальной БД; здесь просто кладём игру в стор). Параметры приходят с префиксом p_.
  http.post("*/rest/v1/rpc/cache_game", async ({ request }) => {
    const p = (await request.json()) as Record<string, unknown>;
    const record: GameRecord = {
      bgg_id: Number(p.p_bgg_id),
      name: String(p.p_name),
      original_name: (p.p_original_name as string | undefined) ?? null,
      year_published: (p.p_year_published as number | undefined) ?? null,
      image_url: (p.p_image_url as string | undefined) ?? null,
      thumbnail_url: (p.p_thumbnail_url as string | undefined) ?? null,
      min_players: (p.p_min_players as number | undefined) ?? null,
      max_players: (p.p_max_players as number | undefined) ?? null,
      playing_time: (p.p_playing_time as number | undefined) ?? null,
      rating: (p.p_rating as number | undefined) ?? null,
      weight: (p.p_weight as number | undefined) ?? null,
      description: (p.p_description as string | undefined) ?? null,
      categories: (p.p_categories as string[] | undefined) ?? [],
      mechanics: (p.p_mechanics as string[] | undefined) ?? [],
      is_expansion: false,
      updated_at: new Date().toISOString(),
    };
    upsertGame(record);
    return HttpResponse.json(record);
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
