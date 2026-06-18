"use client";

import { useState } from "react";
import Modal from "./Modal";

interface PromptDialogProps {
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export default function PromptDialog({
  title,
  placeholder,
  initialValue = "",
  confirmLabel = "Сохранить",
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="field w-full rounded-full px-4 py-2.5 text-sm"
        />
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
            disabled={!value.trim()}
            className="btn btn-brand px-5 py-2.5"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
