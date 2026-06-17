"use client";

import { useCallback, useEffect, useState } from "react";
import { IconLoader2, IconTrash, IconX } from "@tabler/icons-react";
import type { CollectionMember, CollectionRole } from "@/lib/collections";

const ROLE_LABEL: Record<CollectionRole, string> = {
  owner: "владелец",
  editor: "редактор",
  viewer: "только просмотр",
};

interface ShareDialogProps {
  collectionId: string;
  collectionName: string;
  currentUserId: string;
  onClose: () => void;
}

export default function ShareDialog({
  collectionId,
  collectionName,
  currentUserId,
  onClose,
}: ShareDialogProps) {
  const [members, setMembers] = useState<CollectionMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<CollectionRole, "owner">>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/collections/${collectionId}/members`);
    const data = res.ok ? await res.json() : { members: [] };
    setMembers((data.members as CollectionMember[]) ?? []);
    setLoaded(true);
  }, [collectionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers();
  }, [loadMembers]);

  async function share(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Не удалось поделиться");
      setEmail("");
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    try {
      await fetch(`/api/collections/${collectionId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      await loadMembers();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="surface animate-pop-in max-h-[85vh] w-full max-w-md overflow-y-auto p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">
            Поделиться: «{collectionName}»
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="icon-btn h-9 w-9 shrink-0"
          >
            <IconX size={18} stroke={2.5} />
          </button>
        </div>

        <form onSubmit={share} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email пользователя"
            disabled={busy}
            className="field w-full rounded-full px-4 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as Exclude<CollectionRole, "owner">)
              }
              disabled={busy}
              className="field flex-1 px-3 py-2.5 text-sm"
            >
              <option value="editor">Редактор (полный доступ)</option>
              <option value="viewer">Только просмотр</option>
            </select>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="btn btn-brand px-5 py-2.5"
            >
              {busy ? <IconLoader2 size={18} className="animate-spin" /> : "Дать доступ"}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-3 rounded-2xl border-2 border-coral bg-coral/10 px-3 py-2 text-sm font-medium text-ink">
            {error}
          </p>
        )}

        <h3 className="mt-6 mb-2 text-xs font-bold uppercase tracking-widest text-muted">
          Участники
        </h3>
        {!loaded ? (
          <p className="py-4 text-center text-sm text-muted">Загрузка…</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-black/[0.04] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {m.email ?? m.userId}
                    {m.userId === currentUserId ? " (вы)" : ""}
                  </p>
                  <p className="text-xs font-medium text-ink/55">
                    {ROLE_LABEL[m.role]}
                  </p>
                </div>
                {m.role !== "owner" && (
                  <button
                    onClick={() => removeMember(m.userId)}
                    disabled={busy}
                    aria-label="Убрать из коллекции"
                    className="icon-btn h-8 w-8 shrink-0 hover:bg-coral hover:text-white"
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
