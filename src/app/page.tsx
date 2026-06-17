import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IconDice5Filled } from "@tabler/icons-react";
import CollectionApp from "@/components/CollectionApp";
import SignOutButton from "@/components/SignOutButton";
import RainbowText from "@/components/RainbowText";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 rotate-[-6deg] items-center justify-center rounded-2xl border-[3px] border-white bg-brand text-white">
              <IconDice5Filled size={26} />
            </span>
            <div className="leading-tight">
              <RainbowText
                text="Моя коллекция"
                className="font-display text-xl font-extrabold tracking-tight sm:text-2xl"
              />
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-muted">
                настольных игр
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden max-w-[12rem] truncate sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </header>
        <CollectionApp />
      </div>
    </main>
  );
}
