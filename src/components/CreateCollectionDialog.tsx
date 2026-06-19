"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { IconCheck } from "@tabler/icons-react";
import Modal from "./Modal";
import RoleSegmentedControl from "./RoleSegmentedControl";
import type { CollectionRole, CollectionVisibility } from "@/lib/collections";
import type { Friend } from "@/lib/friends";

type InviteRole = Exclude<CollectionRole, "owner">;

interface VisibilityOption {
  value: CollectionVisibility;
  label: string;
  Icon: ComponentType<{ size?: number; stroke?: number }>;
}

interface CreateCollectionDialogProps {
  options: VisibilityOption[];
  onSubmit: (
    name: string,
    visibility: CollectionVisibility,
    friendIds: string[],
    role: InviteRole
  ) => void;
  onClose: () => void;
}

export default function CreateCollectionDialog({
  options,
  onSubmit,
  onClose,
}: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<CollectionVisibility>("public");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<InviteRole>("editor");

  useEffect(() => {
    let active = true;
    fetch("/api/friends")
      .then((res) => (res.ok ? res.json() : { friends: [] }))
      .then((data) => {
        if (active) setFriends((data.friends as Friend[]) ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function toggleFriend(userId: string) {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, visibility, Array.from(invited), role);
  }

  return (
    <Modal title="Новая коллекция" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название новой коллекции"
          className="field w-full rounded-full px-4 py-2.5 text-sm"
        />
        <div className="space-y-2">
          <p className="text-sm font-bold text-ink/70">Кто видит коллекцию</p>
          <div className="flex flex-col gap-2">
            {options.map(({ value, label, Icon }) => {
              const active = visibility === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVisibility(value)}
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
        {friends.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-ink/70">Пригласить друзей</p>
            <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
              {friends.map((f) => {
                const active = invited.has(f.userId);
                return (
                  <button
                    key={f.userId}
                    type="button"
                    onClick={() => toggleFriend(f.userId)}
                    aria-pressed={active}
                    className={`flex items-center justify-between gap-2 rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                      active
                        ? "border-ink bg-ink text-white"
                        : "border-ink/15 bg-black/[0.04] text-ink hover:bg-black/[0.08]"
                    }`}
                  >
                    <span className="truncate">@{f.username}</span>
                    {active && <IconCheck size={16} stroke={2.5} />}
                  </button>
                );
              })}
            </div>
            {invited.size > 0 && (
              <RoleSegmentedControl
                value={role}
                onChange={setRole}
                aria-label="Роль приглашённых друзей"
              />
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost px-5 py-2.5"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn btn-brand px-5 py-2.5"
          >
            Создать
          </button>
        </div>
      </form>
    </Modal>
  );
}
