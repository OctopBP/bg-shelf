"use client";

import { IconCheck } from "@tabler/icons-react";
import Modal from "./Modal";
import { UNCOLLECTED, type CollectionSummary } from "@/lib/collections";
import { colorForKey } from "@/lib/palette";

interface MoveGameDialogProps {
  gameName: string;
  currentCollectionId: string;
  /** Коллекции, в которые можно перемещать (owner/editor). */
  collections: CollectionSummary[];
  onMove: (targetId: string) => void;
  onClose: () => void;
}

export default function MoveGameDialog({
  gameName,
  currentCollectionId,
  collections,
  onMove,
  onClose,
}: MoveGameDialogProps) {
  const targets: Array<{ id: string; name: string; color: string }> = [
    ...collections.map((c) => ({
      id: c.id,
      name: c.name,
      color: colorForKey(c.id),
    })),
    { id: UNCOLLECTED, name: "Без коллекции", color: "#ffffff" },
  ];

  return (
    <Modal title="Переместить игру" onClose={onClose}>
      <p className="mb-4 text-sm text-ink/70">
        Куда переместить «{gameName}»?
      </p>
      <ul className="space-y-2">
        {targets.map((t) => {
          const current = t.id === currentCollectionId;
          return (
            <li key={t.id}>
              <button
                onClick={() => onMove(t.id)}
                disabled={current}
                style={{ borderColor: t.color }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border-[3px] bg-black/[0.04] px-4 py-2.5 text-left text-sm font-bold text-ink transition hover:bg-black/[0.08] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-black/[0.04]"
              >
                <span className="truncate">{t.name}</span>
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
    </Modal>
  );
}
