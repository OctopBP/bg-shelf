import type { SupabaseClient } from "@supabase/supabase-js";

export type CollectionRole = "owner" | "editor" | "viewer";

/** Кто видит коллекцию помимо владельца и явно приглашённых участников. */
export type CollectionVisibility = "public" | "friends" | "private";

export interface CollectionSummary {
  id: string;
  name: string;
  ownerId: string;
  /** Роль текущего пользователя в этой коллекции. */
  role: CollectionRole;
  /** Кто видит коллекцию. */
  visibility: CollectionVisibility;
  /** true → коллекция по умолчанию (её нельзя удалить). */
  isDefault: boolean;
  gameCount: number;
}

export interface CollectionMember {
  userId: string;
  email: string | null;
  role: CollectionRole;
}

/** Коллекции, к которым у текущего пользователя есть доступ (через membership). */
export async function listCollections(
  supabase: SupabaseClient
): Promise<CollectionSummary[]> {
  // RLS на collection_members отдаёт строки всех участников расшаренных
  // коллекций — поэтому явно фильтруем по своей строке, иначе коллекция
  // задвоится (по строке на каждого участника) и роль будет чужой.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");

  const { data, error } = await supabase
    .from("collection_members")
    .select("role, collections(id, name, owner_id, visibility, is_default, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "collections", ascending: true });
  if (error) throw new Error(error.message);

  // Счётчики игр одним запросом (RLS вернёт только доступные строки).
  const counts = new Map<string, number>();
  const { data: items, error: countErr } = await supabase
    .from("collection_items")
    .select("collection_id");
  if (countErr) throw new Error(countErr.message);
  for (const it of items ?? []) {
    const cid = (it as { collection_id: string }).collection_id;
    counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }

  return (data ?? [])
    .map((row) => {
      // PostgREST отдаёт embed many-to-one объектом, но типы supabase-js — массивом.
      const raw = (row as { collections: unknown }).collections;
      const c = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
      if (!c) return null;
      const id = c.id as string;
      return {
        id,
        name: c.name as string,
        ownerId: c.owner_id as string,
        role: (row as { role: CollectionRole }).role,
        visibility: (c.visibility as CollectionVisibility) ?? "public",
        isDefault: (c.is_default as boolean) ?? false,
        gameCount: counts.get(id) ?? 0,
      } satisfies CollectionSummary;
    })
    .filter((c): c is CollectionSummary => c !== null);
}

/**
 * Коллекции, которыми владеет указанный пользователь. Для страницы друга:
 * RLS-политика «friends can read collection» отдаёт строки только если между
 * текущим пользователем и owner есть принятая дружба.
 */
export async function listCollectionsByOwner(
  supabase: SupabaseClient,
  ownerId: string
): Promise<CollectionSummary[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("id, name, owner_id, visibility, is_default, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const collections = (data ?? []) as {
    id: string;
    name: string;
    owner_id: string;
    visibility: CollectionVisibility;
    is_default: boolean;
  }[];
  if (collections.length === 0) return [];

  const ids = collections.map((c) => c.id);
  const counts = new Map<string, number>();
  const { data: items, error: countErr } = await supabase
    .from("collection_items")
    .select("collection_id")
    .in("collection_id", ids);
  if (countErr) throw new Error(countErr.message);
  for (const it of items ?? []) {
    const cid = (it as { collection_id: string }).collection_id;
    counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    ownerId: c.owner_id,
    role: "viewer" as const,
    visibility: c.visibility ?? "public",
    isDefault: c.is_default ?? false,
    gameCount: counts.get(c.id) ?? 0,
  }));
}

export async function createCollection(
  supabase: SupabaseClient,
  name: string
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase
    .rpc("create_collection", { name })
    .single();
  if (error) throw new Error(error.message);
  const row = data as { id: string; name: string };
  return { id: row.id, name: row.name };
}

export async function renameCollection(
  supabase: SupabaseClient,
  collectionId: string,
  name: string
): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ name })
    .eq("id", collectionId);
  if (error) throw new Error(error.message);
}

export async function setCollectionVisibility(
  supabase: SupabaseClient,
  collectionId: string,
  visibility: CollectionVisibility
): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .update({ visibility })
    .eq("id", collectionId);
  if (error) throw new Error(error.message);
}

export async function deleteCollection(
  supabase: SupabaseClient,
  collectionId: string
): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", collectionId);
  if (error) throw new Error(error.message);
}

export async function listMembers(
  supabase: SupabaseClient,
  collectionId: string
): Promise<CollectionMember[]> {
  const { data, error } = await supabase.rpc("collection_member_emails", {
    cid: collectionId,
  });
  if (error) throw new Error(error.message);
  return (
    (data as { user_id: string; email: string | null; role: CollectionRole }[]) ?? []
  ).map((m) => ({ userId: m.user_id, email: m.email, role: m.role }));
}

/** Понятные сообщения для исключений из share_collection. */
const SHARE_ERRORS: Record<string, string> = {
  no_account: "Пользователь с таким email не зарегистрирован. Сначала пригласите его в приложение.",
  not_owner: "Делиться коллекцией может только владелец.",
  self: "Вы уже владелец этой коллекции.",
  bad_role: "Недопустимая роль.",
};

function shareErrorMessage(raw: string): string {
  for (const key of Object.keys(SHARE_ERRORS)) {
    if (raw.includes(key)) return SHARE_ERRORS[key];
  }
  return raw;
}

export async function shareCollection(
  supabase: SupabaseClient,
  collectionId: string,
  email: string,
  role: Exclude<CollectionRole, "owner">
): Promise<void> {
  const { error } = await supabase.rpc("share_collection", {
    cid: collectionId,
    invitee_email: email,
    member_role: role,
  });
  if (error) throw new Error(shareErrorMessage(error.message));
}

export async function removeMember(
  supabase: SupabaseClient,
  collectionId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("collection_members")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
