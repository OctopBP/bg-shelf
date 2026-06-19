"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RainbowText from "@/components/RainbowText";

// Куда приходит приглашённый пользователь после /auth/confirm: у него уже есть
// сессия, осталось задать собственный пароль.
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="surface animate-pop-in w-full max-w-sm p-8">
        <div className="mb-6">
          <img className="mb-4 flex h-12 w-12" src="polkins.png" alt=" Полкинс" />
          <RainbowText
            text="Полка"
            className="font-display text-2xl font-extrabold tracking-tight"
          />
          <p className="mt-1 text-sm font-medium text-ink/55">
            Придумайте пароль для входа
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            required
            minLength={6}
            placeholder="Новый пароль"
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
            {loading ? "…" : "Сохранить и войти"}
          </button>
        </form>
      </div>
    </main>
  );
}
