"use client";

import Modal from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Удалить",
  cancelLabel = "Отмена",
  danger = true,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      {message && <p className="text-sm text-ink/70">{message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`btn px-5 py-2.5 ${danger ? "btn-coral" : "btn-brand"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
