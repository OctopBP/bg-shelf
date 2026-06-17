import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCollectionGame } from "@/lib/collection";
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

  const game = await getCollectionGame(supabase, collectionId, id);
  if (!game) notFound();

  // Роль текущего пользователя в этой коллекции определяет права на правки.
  const { data: membership } = await supabase
    .from("collection_members")
    .select("role")
    .eq("collection_id", collectionId)
    .eq("user_id", user.id)
    .maybeSingle();
  const canEdit =
    membership?.role === "owner" || membership?.role === "editor";

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        <GameDetail game={game} canEdit={canEdit} />
      </div>
    </main>
  );
}
