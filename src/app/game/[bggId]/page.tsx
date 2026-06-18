import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCollectionGame } from "@/lib/collection";
import { UNCOLLECTED } from "@/lib/collections";
import GameDetail from "@/components/GameDetail";

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ bggId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { bggId } = await params;
  const { c: collectionId } = await searchParams;
  const id = Number(bggId);
  if (!Number.isFinite(id) || !collectionId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const game = await getCollectionGame(supabase, collectionId, id, user.id);
  if (!game) notFound();

  // «Без коллекции» — личные игры пользователя, всегда редактируемые. Иначе
  // права определяет роль в коллекции.
  let canEdit = collectionId === UNCOLLECTED;
  if (!canEdit) {
    const { data: membership } = await supabase
      .from("collection_members")
      .select("role")
      .eq("collection_id", collectionId)
      .eq("user_id", user.id)
      .maybeSingle();
    canEdit = membership?.role === "owner" || membership?.role === "editor";
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        <GameDetail game={game} canEdit={canEdit} />
      </div>
    </main>
  );
}
