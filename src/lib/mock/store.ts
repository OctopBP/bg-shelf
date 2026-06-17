// In-memory stand-in for the Supabase tables used by the app (`games` and
// `collection_items`). Module-level singletons persist for the lifetime of the
// server process — plenty for a demo. Seeded so the grid isn't empty on first
// login.
import { MOCK_GAMES } from "../bgg.mock";
import { DEMO_USER } from "./config";

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

export interface ItemRecord {
  id: string;
  user_id: string;
  bgg_id: number;
  tags: string[];
  notes: string | null;
  added_at: string;
}

/** Row shape returned by the joined select, matching the real query. */
export interface ItemRow {
  id: string;
  bgg_id: number;
  tags: string[];
  notes: string | null;
  added_at: string;
  games: GameRecord | null;
}

const games = new Map<number, GameRecord>();
const items: ItemRecord[] = [];

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
// Стартовая коллекция демо-пользователя: bggId → теги. Порядок массива = порядок
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
  SEED.forEach(({ bggId, tags }, i) => {
    items.push({
      id: crypto.randomUUID(),
      user_id: DEMO_USER.id,
      bgg_id: bggId,
      tags,
      notes: null,
      added_at: new Date(Date.now() - i * 60_000).toISOString(),
    });
  });
}

// --- Operations ------------------------------------------------------------
export function upsertGame(record: GameRecord): void {
  seed();
  games.set(record.bgg_id, record);
}

export function upsertItem(userId: string, bggId: number, tags: string[]): void {
  seed();
  const existing = items.find(
    (i) => i.user_id === userId && i.bgg_id === bggId
  );
  if (existing) {
    existing.tags = tags;
    return;
  }
  items.push({
    id: crypto.randomUUID(),
    user_id: userId,
    bgg_id: bggId,
    tags,
    notes: null,
    added_at: new Date().toISOString(),
  });
}

export function deleteItem(userId: string, bggId: number): void {
  seed();
  const idx = items.findIndex(
    (i) => i.user_id === userId && i.bgg_id === bggId
  );
  if (idx !== -1) items.splice(idx, 1);
}

export function updateItemTags(
  userId: string,
  bggId: number,
  tags: string[]
): void {
  seed();
  const item = items.find((i) => i.user_id === userId && i.bgg_id === bggId);
  if (item) item.tags = tags;
}

/** Частичное обновление личной записи (теги и/или заметка). */
export function updateItemFields(
  userId: string,
  bggId: number,
  fields: { tags?: string[]; notes?: string | null }
): void {
  seed();
  const item = items.find((i) => i.user_id === userId && i.bgg_id === bggId);
  if (!item) return;
  if (fields.tags !== undefined) item.tags = fields.tags;
  if (fields.notes !== undefined) item.notes = fields.notes;
}

/** Частичное обновление общего кэша игры. */
export function updateGame(
  bggId: number,
  fields: Partial<GameRecord>
): void {
  seed();
  const game = games.get(bggId);
  if (game) games.set(bggId, { ...game, ...fields, bgg_id: bggId });
}

/** Joined select equivalent: collection_items + games, newest first. */
export function selectItems(userId: string): ItemRow[] {
  seed();
  return items
    .filter((i) => i.user_id === userId)
    .sort((a, b) => b.added_at.localeCompare(a.added_at))
    .map((i) => ({
      id: i.id,
      bgg_id: i.bgg_id,
      tags: i.tags,
      notes: i.notes,
      added_at: i.added_at,
      games: games.get(i.bgg_id) ?? null,
    }));
}
