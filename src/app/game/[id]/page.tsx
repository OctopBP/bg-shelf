import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCollectionGame, getCollectionExpansionMap } from "@/lib/collection";
import GameDetail from "@/components/GameDetail";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { id: idParam } = await params;
  const { c: collectionId } = await searchParams;
  const id = Number(idParam);
  if (!Number.isFinite(id) || !collectionId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const game = await getCollectionGame(supabase, collectionId, id);
  if (!game) notFound();

  // Права определяет роль в коллекции.
  const { data: membership } = await supabase
    .from("collection_members")
    .select("role")
    .eq("collection_id", collectionId)
    .eq("user_id", user.id)
    .maybeSingle();
  const canEdit = membership?.role === "owner" || membership?.role === "editor";

  // Дополнения этой игры, присутствующие в коллекции (для блока внизу страницы).
  const expansionMap = await getCollectionExpansionMap(supabase, [collectionId]);
  const expansions = expansionMap.byBase[id] ?? [];

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        <GameDetail game={game} canEdit={canEdit} expansions={expansions} />
      </div>
    </main>
  );
}
