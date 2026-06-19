"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import Modal from "./Modal";
import type { CollectionVisibility } from "@/lib/collections";

interface VisibilityOption {
  value: CollectionVisibility;
  label: string;
  Icon: ComponentType<{ size?: number; stroke?: number }>;
}

interface CreateCollectionDialogProps {
  options: VisibilityOption[];
  onSubmit: (name: string, visibility: CollectionVisibility) => void;
  onClose: () => void;
}

export default function CreateCollectionDialog({
  options,
  onSubmit,
  onClose,
}: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<CollectionVisibility>("public");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, visibility);
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
