import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IconArrowLeft, IconUsers } from "@tabler/icons-react";
import FriendsManager from "@/components/FriendsManager";
import SignOutButton from "@/components/SignOutButton";
import RainbowText from "@/components/RainbowText";

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 rotate-[-6deg] items-center justify-center rounded-2xl border-[3px] border-white bg-brand text-white">
              <IconUsers size={26} />
            </span>
            <div className="leading-tight">
              <RainbowText
                text="Друзья"
                className="font-display text-xl font-extrabold tracking-tight sm:text-2xl"
              />
              <Link
                href="/"
                className="mt-0.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted hover:text-ink"
              >
                <IconArrowLeft size={13} /> к коллекции
              </Link>
            </div>
          </div>
          <SignOutButton />
        </header>
        <FriendsManager />
      </div>
    </main>
  );
}
