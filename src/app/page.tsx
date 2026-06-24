import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CollectionApp from "@/components/CollectionApp";
import { AppHeader } from "@/components/layout";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <AppHeader email={user.email} />
        <CollectionApp />
      </div>
    </main>
  );
}
