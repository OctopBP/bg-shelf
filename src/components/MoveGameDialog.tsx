"use client";

import { useState } from "react";
import { IconCheck, IconPlus, IconLoader2 } from "@tabler/icons-react";
import Modal from "./Modal";
import type { CollectionSummary } from "@/lib/collections";
import { colorForKey } from "@/lib/palette";

interface MoveGameDialogProps {
  /** Что перемещаем — имя игры или «N игр» для пакетного перемещения. */
  subject: string;
  /** Текущая коллекция (для одной игры); для пакета можно не указывать. */
  currentCollectionId?: string;
  /** Коллекции, в которые можно перемещать (owner/editor). */
  collections: CollectionSummary[];
  onMove: (targetId: string) => void;
  /** Создать новую коллекцию с этим именем и переместить в неё. */
  onCreateAndMove: (name: string) => Promise<void> | void;
  onClose: () => void;
}

export default function MoveGameDialog({
  subject,
  currentCollectionId,
  collections,
  onMove,
  onCreateAndMove,
  onClose,
}: MoveGameDialogProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function createAndMove(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreateAndMove(name);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Переместить" onClose={onClose}>
      <p className="mb-4 text-sm text-ink/70">Куда переместить {subject}?</p>
      <ul className="space-y-2">
        {collections.map((c) => {
          const current = c.id === currentCollectionId;
          return (
            <li key={c.id}>
              <button
                onClick={() => onMove(c.id)}
                disabled={current || busy}
                style={{ borderColor: colorForKey(c.id) }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border-[3px] bg-black/[0.04] px-4 py-2.5 text-left text-sm font-bold text-ink transition hover:bg-black/[0.08] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-black/[0.04]"
              >
                <span className="truncate">{c.name}</span>
                {current && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">
                    <IconCheck size={14} stroke={2.5} /> сейчас здесь
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Создать новую коллекцию и переместить в неё */}
      <div className="mt-4 border-t-2 border-dashed border-ink/15 pt-4">
        {creating ? (
          <form onSubmit={createAndMove} className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название новой коллекции"
              disabled={busy}
              className="field flex-1 rounded-full px-4 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={!newName.trim() || busy}
              className="btn btn-brand shrink-0 px-4 py-2.5"
            >
              {busy ? (
                <IconLoader2 size={18} className="animate-spin" />
              ) : (
                "Создать"
              )}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="btn btn-ghost w-full justify-center px-4 py-2.5 text-sm"
          >
            <IconPlus size={16} className="mr-1" /> В новую коллекцию
          </button>
        )}
      </div>
    </Modal>
  );
}
