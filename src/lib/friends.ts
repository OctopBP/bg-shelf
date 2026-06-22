import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type DB = SupabaseClient<Database>;

export interface Friend {
  /** id строки дружбы (для accept/delete) */
  friendshipId: string;
  userId: string;
  username: string;
}

export interface FriendData {
  friends: Friend[];
  /** Входящие запросы (нас добавили, ждём нашего решения). */
  incoming: Friend[];
  /** Исходящие запросы (мы отправили, ждём решения собеседника). */
  outgoing: Friend[];
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

type FriendshipRow = Pick<
  Database["public"]["Tables"]["friendships"]["Row"],
  "id" | "requester_id" | "addressee_id" | "status"
>;

/** Ник текущего пользователя. */
export async function getMyUsername(
  supabase: DB,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.username ?? null;
}

/** Сменить собственный ник. Бросает понятную ошибку, если формат неверный или ник занят. */
export async function setMyUsername(
  supabase: DB,
  userId: string,
  username: string
): Promise<void> {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_RE.test(normalized)) {
    throw new Error("Ник: 3–20 символов, латиница, цифры и _.");
  }
  const { error } = await supabase
    .from("profiles")
    .update({ username: normalized })
    .eq("id", userId);
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      throw new Error("Этот ник уже занят.");
    }
    throw new Error(error.message);
  }
}

/** Все дружбы и запросы текущего пользователя, разложенные по корзинам. */
export async function getFriendData(
  supabase: DB,
  userId: string
): Promise<FriendData> {
  // RLS отдаёт только строки, где мы участвуем.
  const { data, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows: FriendshipRow[] = data ?? [];
  const otherIds = Array.from(
    new Set(
      rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
    )
  );
  const names = await usernamesByIds(supabase, otherIds);

  const toFriend = (r: FriendshipRow): Friend => {
    const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
    return {
      friendshipId: r.id,
      userId: otherId,
      username: names.get(otherId) ?? "—",
    };
  };

  const friends: Friend[] = [];
  const incoming: Friend[] = [];
  const outgoing: Friend[] = [];
  for (const r of rows) {
    if (r.status === "accepted") friends.push(toFriend(r));
    else if (r.addressee_id === userId) incoming.push(toFriend(r));
    else outgoing.push(toFriend(r));
  }
  return { friends, incoming, outgoing };
}

async function usernamesByIds(
  supabase: DB,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const p of data ?? []) {
    map.set(p.id, p.username);
  }
  return map;
}

/**
 * Отправить запрос в друзья по нику. Если встречный запрос уже существует —
 * принимает его. Возвращает 'sent' | 'accepted'.
 */
export async function sendFriendRequest(
  supabase: DB,
  userId: string,
  username: string
): Promise<"sent" | "accepted"> {
  const normalized = username.trim().toLowerCase();
  if (!normalized) throw new Error("Укажите ник.");

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", normalized)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!profile) throw new Error("Пользователь с таким ником не найден.");

  const targetId = profile.id;
  if (targetId === userId) throw new Error("Нельзя добавить в друзья себя.");

  // Существующая связь в любом направлении (RLS вернёт её, раз мы участвуем).
  const { data: existing, error: eErr } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`
    )
    .maybeSingle();
  if (eErr) throw new Error(eErr.message);

  if (existing) {
    const row = existing;
    if (row.status === "accepted") throw new Error("Вы уже друзья.");
    if (row.requester_id === userId) throw new Error("Запрос уже отправлен.");
    // Встречный запрос — принимаем.
    const { error: uErr } = await supabase
      .from("friendships")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (uErr) throw new Error(uErr.message);
    return "accepted";
  }

  const { error: iErr } = await supabase.from("friendships").insert({
    requester_id: userId,
    addressee_id: targetId,
    status: "pending",
  });
  if (iErr) throw new Error(iErr.message);
  return "sent";
}

/** Принять входящий запрос. RLS разрешает обновление только адресату. */
export async function acceptFriendRequest(
  supabase: DB,
  friendshipId: string
): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (error) throw new Error(error.message);
}

/** Отклонить запрос / отменить свой / удалить из друзей — это удаление строки. */
export async function removeFriendship(
  supabase: DB,
  friendshipId: string
): Promise<void> {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) throw new Error(error.message);
}

/** Ник друга, если между нами принятая дружба; иначе null (нет доступа). */
export async function getFriendUsername(
  supabase: DB,
  userId: string,
  friendId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const names = await usernamesByIds(supabase, [friendId]);
  return names.get(friendId) ?? null;
}
