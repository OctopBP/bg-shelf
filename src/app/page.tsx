import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IconUsers } from "@tabler/icons-react";
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
            <img className="flex h-12 w-12" src="polkins.png" alt=" Полкинс" />
            <div className="leading-tight">
              <RainbowText
                text="Полка"
                className="font-display text-xl font-extrabold tracking-tight sm:text-2xl"
              />
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-muted">
                настольных игр
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Link
              href="/friends"
              className="btn btn-ghost px-3 py-1.5"
              title="Друзья"
            >
              <IconUsers size={18} className="sm:mr-1" />
              <span className="hidden sm:inline">Друзья</span>
            </Link>
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
