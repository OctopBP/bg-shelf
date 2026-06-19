"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconDice5Filled } from "@tabler/icons-react";
import RainbowText from "@/components/RainbowText";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
    } else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="surface animate-pop-in w-full max-w-sm p-8">
        <div className="mb-6">
          <span className="mb-4 flex h-12 w-12 rotate-[-6deg] items-center justify-center rounded-2xl border-[3px] border-ink bg-brand text-white">
            <IconDice5Filled size={26} />
          </span>
          <RainbowText
            text="Полка"
            className="font-display text-2xl font-extrabold tracking-tight"
          />
          <p className="mt-1 text-sm font-medium text-ink/55">
            Вход в аккаунт
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field control-h px-4"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field control-h px-4"
          />

          {error && <p className="text-sm font-medium text-coral">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-brand control-h w-full"
          >
            {loading ? "…" : "Войти"}
          </button>
        </form>
      </div>
    </main>
  );
}
