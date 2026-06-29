"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
				<div className="flex flex-row gap-2 mb-2">
					<img
						className="flex h-12 w-12"
						src="polkins.png"
						alt="Полкинс"
					/>
					<div className="flex flex-col gap-0 justify-center">
						<RainbowText
							text="Полка"
							className="font-display leading-none text-2xl font-extrabold tracking-tight"
						/>
						<p className="text-sm leading-none font-medium text-ink/55 ">Вход в аккаунт</p>
					</div>
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
