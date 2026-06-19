// In-memory stand-in for the Supabase tables used by the app (`games`,
// `collections`, `collection_members`, `collection_items`). Module-level
// singletons persist for the lifetime of the server process — plenty for a demo.
// Seeded so the grid isn't empty on first login.
import { MOCK_GAMES } from "../bgg.mock";
import { DEMO_USER, FRIEND_USER } from "./config";

export interface GameRecord {
  bgg_id: number;
  name: string;
  original_name: string | null;
  year_published: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  min_players: number | null;
  max_players: number | null;
  playing_time: number | null;
  rating: number | null;
  weight: number | null;
  description: string | null;
  categories: string[];
  mechanics: string[];
  updated_at: string;
}

export type Role = "owner" | "editor" | "viewer";
export type Visibility = "public" | "friends" | "private";

interface CollectionRecord {
  id: string;
  owner_id: string;
  name: string;
  visibility: Visibility;
  is_default: boolean;
  created_at: string;
}

interface MemberRecord {
  collection_id: string;
  user_id: string;
  role: Role;
}

export interface ItemRecord {
  id: string;
  collection_id: string;
  bgg_id: number;
  tags: string[];
  notes: string | null;
  added_at: string;
  added_by: string | null;
}

/** Row shape returned by the joined select, matching the real query. */
export interface ItemRow {
  id: string;
  collection_id: string;
  bgg_id: number;
  tags: string[];
  notes: string | null;
  added_at: string;
  games: GameRecord | null;
  collections?: { name: string } | null;
}

interface FriendshipRecord {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
}

const games = new Map<number, GameRecord>();
const collections: CollectionRecord[] = [];
const members: MemberRecord[] = [];
const items: ItemRecord[] = [];
/** userId → ник. */
const profiles = new Map<string, string>();
const friendships: FriendshipRecord[] = [];

const EMAILS: Record<string, string> = {
  [DEMO_USER.id]: DEMO_USER.email,
  [FRIEND_USER.id]: FRIEND_USER.email,
};

const SHELF_ID = "col-shelf";
const WISHLIST_ID = "col-wishlist";
const FRIEND_COLLECTION_ID = "col-friend";

function toGameRecord(g: (typeof MOCK_GAMES)[number]): GameRecord {
  return {
    bgg_id: g.bggId,
    // Запросы русские → показываем русское название, как и для игр,
    // добавленных через BGG (см. pickLocalizedName в lib/bgg.ts).
    name: g.nameRu ?? g.name,
    original_name: g.name,
    year_published: g.yearPublished,
    image_url: g.imageUrl,
    thumbnail_url: g.thumbnailUrl,
    min_players: g.minPlayers,
    max_players: g.maxPlayers,
    playing_time: g.playingTime,
    rating: g.rating,
    weight: g.weight,
    description: g.description,
    categories: g.categories,
    mechanics: g.mechanics,
    updated_at: new Date().toISOString(),
  };
}

// --- Seed ------------------------------------------------------------------
// Стартовые игры коллекции «Полка»: bggId → теги. Порядок массива = порядок
// добавления (первый — самый новый). Несколько игр из MOCK_GAMES намеренно не
// в коллекции, чтобы их можно было добавить голосом/командой в демо.
const SEED: { bggId: number; tags: string[] }[] = [
  { bggId: 266192, tags: ["движок", "хит"] },
  { bggId: 230802, tags: ["абстракт", "красивая"] },
  { bggId: 167791, tags: ["стратегия", "сложная"] },
  { bggId: 169786, tags: ["стратегия", "ареа-контроль"] },
  { bggId: 822, tags: ["евро", "тайлы", "классика"] },
  { bggId: 30549, tags: ["кооп", "семейная"] },
  { bggId: 178900, tags: ["пати", "вечеринка"] },
  { bggId: 39856, tags: ["пати", "арт"] },
  { bggId: 148228, tags: ["филлер", "движок"] },
  { bggId: 9209, tags: ["семейная", "классика"] },
  { bggId: 13, tags: ["классика", "стратегия"] },
  { bggId: 1927, tags: ["пати", "филлер"] },
];

let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  MOCK_GAMES.forEach((g) => games.set(g.bggId, toGameRecord(g)));

  const now = Date.now();
  collections.push(
    { id: SHELF_ID, owner_id: DEMO_USER.id, name: "Полка", visibility: "public", is_default: true, created_at: new Date(now - 2 * 86_400_000).toISOString() },
    { id: WISHLIST_ID, owner_id: DEMO_USER.id, name: "Хочу купить", visibility: "friends", is_default: false, created_at: new Date(now - 86_400_000).toISOString() }
  );
  members.push(
    { collection_id: SHELF_ID, user_id: DEMO_USER.id, role: "owner" },
    { collection_id: WISHLIST_ID, user_id: DEMO_USER.id, role: "owner" }
  );
  SEED.forEach(({ bggId, tags }, i) => {
    items.push({
      id: crypto.randomUUID(),
      collection_id: SHELF_ID,
      bgg_id: bggId,
      tags,
      notes: null,
      added_at: new Date(now - i * 60_000).toISOString(),
      added_by: DEMO_USER.id,
    });
  });
  // Ещё одна игра в дефолтной коллекции.
  items.push({
    id: crypto.randomUUID(),
    collection_id: SHELF_ID,
    bgg_id: 199792,
    tags: ["хочу попробовать"],
    notes: null,
    added_at: new Date(now - 30_000).toISOString(),
    added_by: DEMO_USER.id,
  });

  // --- Друзья (demo) -------------------------------------------------------
  // Ники для обоих демо-аккаунтов (совпадают с локальной частью email).
  profiles.set(DEMO_USER.id, "demo");
  profiles.set(FRIEND_USER.id, "friend");

  // У друга — своя коллекция с парой игр (видна demo-пользователю после
  // принятия дружбы).
  collections.push({
    id: FRIEND_COLLECTION_ID,
    owner_id: FRIEND_USER.id,
    name: "Коллекция друга",
    visibility: "friends",
    is_default: true,
    created_at: new Date(now - 5 * 86_400_000).toISOString(),
  });
  members.push({
    collection_id: FRIEND_COLLECTION_ID,
    user_id: FRIEND_USER.id,
    role: "owner",
  });
  [266192, 822, 30549, 1927].forEach((bggId, i) => {
    items.push({
      id: crypto.randomUUID(),
      collection_id: FRIEND_COLLECTION_ID,
      bgg_id: bggId,
      tags: [],
      notes: null,
      added_at: new Date(now - i * 60_000).toISOString(),
      added_by: FRIEND_USER.id,
    });
  });

  // Входящий запрос в друзья: друг (@friend) → demo. Demo может принять и
  // открыть коллекцию друга.
  friendships.push({
    id: crypto.randomUUID(),
    requester_id: FRIEND_USER.id,
    addressee_id: DEMO_USER.id,
    status: "pending",
    created_at: new Date(now - 3_600_000).toISOString(),
  });
}

// --- Games -----------------------------------------------------------------
export function upsertGame(record: GameRecord): void {
  seed();
  games.set(record.bgg_id, record);
}

export function updateGame(bggId: number, fields: Partial<GameRecord>): void {
  seed();
  const game = games.get(bggId);
  if (game) games.set(bggId, { ...game, ...fields, bgg_id: bggId });
}

// --- Collection items ------------------------------------------------------
export function upsertItem(
  collectionId: string,
  bggId: number,
  tags: string[],
  addedBy?: string | null
): void {
  seed();
  const existing = items.find(
    (i) => i.collection_id === collectionId && i.bgg_id === bggId
  );
  if (existing) {
    existing.tags = tags;
    return;
  }
  items.push({
    id: crypto.randomUUID(),
    collection_id: collectionId,
    bgg_id: bggId,
    tags,
    notes: null,
    added_at: new Date().toISOString(),
    added_by: addedBy ?? null,
  });
}

export function deleteItem(collectionId: string, bggId: number): void {
  seed();
  const idx = items.findIndex(
    (i) => i.collection_id === collectionId && i.bgg_id === bggId
  );
  if (idx !== -1) items.splice(idx, 1);
}

export function updateItemFields(
  collectionId: string,
  bggId: number,
  fields: { tags?: string[]; notes?: string | null }
): void {
  seed();
  const item = items.find(
    (i) => i.collection_id === collectionId && i.bgg_id === bggId
  );
  if (!item) return;
  if (fields.tags !== undefined) item.tags = fields.tags;
  if (fields.notes !== undefined) item.notes = fields.notes;
}

function toRow(i: ItemRecord, withCollection: boolean): ItemRow {
  return {
    id: i.id,
    collection_id: i.collection_id,
    bgg_id: i.bgg_id,
    tags: i.tags,
    notes: i.notes,
    added_at: i.added_at,
    games: games.get(i.bgg_id) ?? null,
    ...(withCollection
      ? {
          collections: {
            name: collections.find((c) => c.id === i.collection_id)?.name ?? "",
          },
        }
      : {}),
  };
}

/** Joined select для одной коллекции, newest first. */
export function selectItems(collectionId: string): ItemRow[] {
  seed();
  return items
    .filter((i) => i.collection_id === collectionId)
    .sort((a, b) => b.added_at.localeCompare(a.added_at))
    .map((i) => toRow(i, false));
}

/** Все игры пользователя из коллекций-участника (сводный вид «Все игры»). */
export function selectAllItems(userId: string): ItemRow[] {
  seed();
  const allowed = new Set(
    members.filter((m) => m.user_id === userId).map((m) => m.collection_id)
  );
  return items
    .filter((i) => allowed.has(i.collection_id))
    .sort((a, b) => b.added_at.localeCompare(a.added_at))
    .map((i) => toRow(i, true));
}

// --- Collections & members -------------------------------------------------
/** Membership-строки пользователя с встроенной коллекцией (для listCollections). */
export function selectMemberships(userId: string) {
  seed();
  return members
    .filter((m) => m.user_id === userId)
    .map((m) => {
      const c = collections.find((col) => col.id === m.collection_id);
      return {
        role: m.role,
        collections: c
          ? {
              id: c.id,
              name: c.name,
              owner_id: c.owner_id,
              visibility: c.visibility,
              is_default: c.is_default,
              created_at: c.created_at,
            }
          : null,
      };
    })
    .sort((a, b) =>
      (a.collections?.created_at ?? "").localeCompare(b.collections?.created_at ?? "")
    );
}

/** collection_id всех элементов в доступных пользователю коллекциях (для счётчиков). */
export function selectItemCollectionIds(userId: string): { collection_id: string }[] {
  seed();
  const allowed = new Set(
    members.filter((m) => m.user_id === userId).map((m) => m.collection_id)
  );
  return items
    .filter(
      (i): i is ItemRecord & { collection_id: string } =>
        i.collection_id !== null && allowed.has(i.collection_id)
    )
    .map((i) => ({ collection_id: i.collection_id }));
}

export function createCollection(userId: string, name: string): CollectionRecord {
  seed();
  const c: CollectionRecord = {
    id: crypto.randomUUID(),
    owner_id: userId,
    name,
    visibility: "public",
    is_default: false,
    created_at: new Date().toISOString(),
  };
  collections.push(c);
  members.push({ collection_id: c.id, user_id: userId, role: "owner" });
  return c;
}

export function renameCollection(collectionId: string, name: string): void {
  seed();
  const c = collections.find((col) => col.id === collectionId);
  if (c) c.name = name;
}

export function setVisibility(collectionId: string, visibility: Visibility): void {
  seed();
  const c = collections.find((col) => col.id === collectionId);
  if (c) c.visibility = visibility;
}

export function deleteCollection(collectionId: string): void {
  seed();
  const idx = collections.findIndex((c) => c.id === collectionId);
  if (idx !== -1) collections.splice(idx, 1);
  for (let i = members.length - 1; i >= 0; i--) {
    if (members[i].collection_id === collectionId) members.splice(i, 1);
  }
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].collection_id === collectionId) items.splice(i, 1);
  }
}

export function memberEmails(collectionId: string) {
  seed();
  return members
    .filter((m) => m.collection_id === collectionId)
    .map((m) => ({
      user_id: m.user_id,
      email: EMAILS[m.user_id] ?? null,
      role: m.role,
    }));
}

/** Возвращает 'no_account' | 'self' | null (ошибку), иначе добавляет участника. */
export function shareCollection(
  collectionId: string,
  email: string,
  role: Role,
  callerId: string
): "no_account" | "self" | null {
  seed();
  const entry = Object.entries(EMAILS).find(
    ([, e]) => e.toLowerCase() === email.trim().toLowerCase()
  );
  if (!entry) return "no_account";
  const [targetId] = entry;
  if (targetId === callerId) return "self";
  const existing = members.find(
    (m) => m.collection_id === collectionId && m.user_id === targetId
  );
  if (existing) existing.role = role;
  else members.push({ collection_id: collectionId, user_id: targetId, role });
  return null;
}

/** Возвращает 'self' | 'not_friend' | null (ошибку), иначе добавляет друга. */
export function shareCollectionWithUser(
  collectionId: string,
  inviteeId: string,
  role: Role,
  callerId: string
): "self" | "not_friend" | null {
  seed();
  if (inviteeId === callerId) return "self";
  const friends = friendships.some(
    (f) =>
      f.status === "accepted" &&
      ((f.requester_id === callerId && f.addressee_id === inviteeId) ||
        (f.addressee_id === callerId && f.requester_id === inviteeId))
  );
  if (!friends) return "not_friend";
  const existing = members.find(
    (m) => m.collection_id === collectionId && m.user_id === inviteeId
  );
  if (existing) existing.role = role;
  else members.push({ collection_id: collectionId, user_id: inviteeId, role });
  return null;
}

export function removeMember(collectionId: string, userId: string): void {
  seed();
  const idx = members.findIndex(
    (m) => m.collection_id === collectionId && m.user_id === userId
  );
  if (idx !== -1) members.splice(idx, 1);
}

// --- Друзья ----------------------------------------------------------------
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function getUsername(userId: string): string | null {
  seed();
  return profiles.get(userId) ?? null;
}

export function setUsername(
  userId: string,
  username: string
): "ok" | "taken" | "invalid" {
  seed();
  const n = username.trim().toLowerCase();
  if (!USERNAME_RE.test(n)) return "invalid";
  for (const [id, name] of profiles) {
    if (id !== userId && name === n) return "taken";
  }
  profiles.set(userId, n);
  return "ok";
}

export function profilesByIds(ids: string[]): { id: string; username: string }[] {
  seed();
  return ids
    .filter((id) => profiles.has(id))
    .map((id) => ({ id, username: profiles.get(id)! }));
}

export function profileByUsername(
  username: string
): { id: string; username: string } | null {
  seed();
  const n = username.trim().toLowerCase();
  for (const [id, name] of profiles) {
    if (name === n) return { id, username: name };
  }
  return null;
}

export function listFriendships(userId: string): FriendshipRecord[] {
  seed();
  return friendships
    .filter((f) => f.requester_id === userId || f.addressee_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function insertFriendship(
  requesterId: string,
  addresseeId: string
): FriendshipRecord {
  seed();
  const f: FriendshipRecord = {
    id: crypto.randomUUID(),
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  friendships.push(f);
  return f;
}

export function acceptFriendship(id: string): void {
  seed();
  const f = friendships.find((x) => x.id === id);
  if (f) f.status = "accepted";
}

export function deleteFriendship(id: string): void {
  seed();
  const idx = friendships.findIndex((x) => x.id === id);
  if (idx !== -1) friendships.splice(idx, 1);
}

export function collectionsByOwner(ownerId: string): {
  id: string;
  name: string;
  owner_id: string;
  visibility: Visibility;
  is_default: boolean;
  created_at: string;
}[] {
  seed();
  return collections
    // Страница друга: приватные коллекции не показываем (как RLS).
    .filter((c) => c.owner_id === ownerId && c.visibility !== "private")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((c) => ({
      id: c.id,
      name: c.name,
      owner_id: c.owner_id,
      visibility: c.visibility,
      is_default: c.is_default,
      created_at: c.created_at,
    }));
}

export function selectItemCollectionIdsIn(
  ids: string[]
): { collection_id: string }[] {
  seed();
  const set = new Set(ids);
  return items
    .filter(
      (i): i is ItemRecord & { collection_id: string } =>
        i.collection_id !== null && set.has(i.collection_id)
    )
    .map((i) => ({ collection_id: i.collection_id }));
}
