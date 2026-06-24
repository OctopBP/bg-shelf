import Link from "next/link";
import { IconUsers } from "@tabler/icons-react";
import SignOutButton from "../SignOutButton";
import RainbowText from "../RainbowText";

interface AppHeaderProps {
  /** E-mail текущего пользователя (показываем на ≥sm). */
  email?: string | null;
}

/** Шапка приложения: логотип «Полка», ссылка на друзей, e-mail и выход. */
export default function AppHeader({ email }: AppHeaderProps) {
  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
        <Link href="/friends" className="btn btn-ghost px-3 py-1.5" title="Друзья">
          <IconUsers size={18} className="sm:mr-1" />
          <span className="hidden sm:inline">Друзья</span>
        </Link>
        {email && (
          <span className="hidden max-w-[12rem] truncate sm:inline">{email}</span>
        )}
        <SignOutButton />
      </div>
    </header>
  );
}
