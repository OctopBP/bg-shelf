"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { IconLoader2, IconTrash } from "@tabler/icons-react";
import Modal from "./Modal";
import RoleSegmentedControl from "./RoleSegmentedControl";
import type {
  CollectionMember,
  CollectionRole,
  CollectionSummary,
  CollectionVisibility,
} from "@/lib/collections";

type InviteRole = Exclude<CollectionRole, "owner">;

const ROLE_LABEL: Record<CollectionRole, string> = {
  owner: "владелец",
  editor: "полный доступ",
  viewer: "только просмотр",
};

interface VisibilityOption {
  value: CollectionVisibility;
  label: string;
  Icon: ComponentType<{ size?: number; stroke?: number }>;
}

interface CollectionSettingsDialogProps {
  collection: CollectionSummary;
  visibilityOptions: VisibilityOption[];
  currentUserId: string;
  canDelete: boolean;
  onRename: (name: string) => void;
  onUpdateVisibility: (visibility: CollectionVisibility) => void;
  onRequestDelete: () => void;
  onClose: () => void;
}

export default function CollectionSettingsDialog({
  collection,
  visibilityOptions,
  currentUserId,
  canDelete,
  onRename,
  onUpdateVisibility,
  onRequestDelete,
  onClose,
}: CollectionSettingsDialogProps) {
  const collectionId = collection.id;
  const [name, setName] = useState(collection.name);

  const [members, setMembers] = useState<CollectionMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
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

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === collection.name) return;
    onRename(trimmed);
  }

  async function invite(e: React.FormEvent) {
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
    <Modal title={`Настройки: «${collection.name}»`} onClose={onClose}>
      <div className="space-y-6">
        {/* Название */}
        <div className="space-y-2">
          <p className="text-sm font-bold text-ink/70">Название</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveName();
                }
              }}
              placeholder="Название коллекции"
              className="field w-full rounded-full px-4 py-2.5 text-sm"
            />
          </div>
        </div>

        {/* Видимость */}
        <div className="space-y-2">
          <p className="text-sm font-bold text-ink/70">Кто видит коллекцию</p>
          <div className="flex flex-col gap-2">
            {visibilityOptions.map(({ value, label, Icon }) => {
              const active = collection.visibility === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdateVisibility(value)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                    active
                      ? "border-ink bg-ink text-white"
                      : "border-ink/15 bg-black/[0.04] text-ink hover:bg-black/[0.08]"
                  }`}
                >
                  <Icon size={16} stroke={2.5} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Доступ участникам */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-ink/70">Доступ по email</p>
          <form onSubmit={invite} className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email пользователя"
              disabled={busy}
              className="field w-full rounded-full px-4 py-2.5 text-sm"
            />
            <RoleSegmentedControl
              value={role}
              onChange={setRole}
              disabled={busy}
              aria-label="Уровень доступа"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="btn btn-brand w-full px-5 py-2.5"
            >
              {busy ? (
                <IconLoader2 size={18} className="animate-spin" />
              ) : (
                "Дать доступ"
              )}
            </button>
          </form>

          {error && (
            <p className="rounded-2xl border-2 border-coral bg-coral/10 px-3 py-2 text-sm font-medium text-ink">
              {error}
            </p>
          )}

          {!loaded ? (
            <p className="py-2 text-center text-sm text-muted">Загрузка…</p>
          ) : (
            members.length > 0 && (
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
            )
          )}
        </div>

        {/* Удаление */}
        {canDelete && (
          <div className="border-t-2 border-ink/10 pt-4">
            <button
              onClick={onRequestDelete}
              className="btn btn-ghost px-3 py-1.5 text-sm hover:text-coral"
            >
              <IconTrash size={16} className="mr-1" /> Удалить коллекцию
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
