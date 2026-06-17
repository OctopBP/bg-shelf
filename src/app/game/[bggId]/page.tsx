import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCollectionGame } from "@/lib/collection";
import GameDetail from "@/components/GameDetail";

export default async function GamePage({
  params,
}: {
  params: Promise<{ bggId: string }>;
}) {
  const { bggId } = await params;
  const id = Number(bggId);
  if (!Number.isFinite(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const game = await getCollectionGame(supabase, user.id, id);
  if (!game) notFound();

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        <GameDetail game={game} />
      </div>
    </main>
  );
}
