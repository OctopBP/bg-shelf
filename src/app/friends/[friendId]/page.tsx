import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFriendUsername } from "@/lib/friends";
import { IconArrowLeft, IconUser } from "@tabler/icons-react";
import FriendCollections from "@/components/FriendCollections";
import SignOutButton from "@/components/SignOutButton";
import RainbowText from "@/components/RainbowText";

export default async function FriendPage({
  params,
}: {
  params: Promise<{ friendId: string }>;
}) {
  const { friendId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const username = await getFriendUsername(supabase, user.id, friendId);
  if (!username) notFound();

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 rotate-[-6deg] items-center justify-center rounded-2xl border-[3px] border-white bg-brand text-white">
              <IconUser size={26} />
            </span>
            <div className="leading-tight">
              <RainbowText
                text={`@${username}`}
                className="font-display text-xl font-extrabold tracking-tight sm:text-2xl"
              />
              <Link
                href="/friends"
                className="mt-0.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted hover:text-ink"
              >
                <IconArrowLeft size={13} /> к друзьям
              </Link>
            </div>
          </div>
          <SignOutButton />
        </header>
        <FriendCollections friendId={friendId} />
      </div>
    </main>
  );
}
