"use client";

import { useRef, useState } from "react";
import { IconCamera, IconLoader2 } from "@tabler/icons-react";

interface BggCandidate {
  bggId: number;
  name: string;
  yearPublished: number | null;
}

interface PhotoMatch {
  titleOnBox: string;
  searchedTitle: string;
  confidence: "high" | "medium" | "low";
  candidates: BggCandidate[];
}

interface Selection {
  enabled: boolean;
  bggId: number | null;
  tags: string;
}

interface PhotoInputProps {
  collectionId: string;
  onAdded: () => void;
  onStatus: (message: string) => void;
}

const CONFIDENCE_LABEL: Record<PhotoMatch["confidence"], string> = {
  high: "точно",
  medium: "похоже",
  low: "не уверен",
};

export default function PhotoInput({ collectionId, onAdded, onStatus }: PhotoInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [matches, setMatches] = useState<PhotoMatch[] | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);

  async function handleFile(file: File) {
    setLoading(true);
    setMatches(null);
    onStatus("Распознаю игры на фото...");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/photo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка распознавания");

      const found: PhotoMatch[] = data.matches;
      if (found.length === 0) {
        onStatus("На фото не удалось распознать игры");
      } else {
        setMatches(found);
        setSelections(
          found.map((m) => ({
            enabled: m.candidates.length > 0,
            bggId: m.candidates[0]?.bggId ?? null,
            tags: "",
          }))
        );
        onStatus("");
      }
    } catch (e) {
      onStatus(e instanceof Error ? e.message : "Ошибка распознавания");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmAdd() {
    if (!matches) return;
    const items = selections
      .filter((s) => s.enabled && s.bggId !== null)
      .map((s) => ({
        bggId: s.bggId!,
        tags: s.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      }));
    if (items.length === 0) {
      setMatches(null);
      return;
    }

    setAdding(true);
    onStatus("Добавляю игры...");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка добавления");
      onStatus(
        `Добавлено: ${data.added.join(", ")}` +
          (data.failed.length ? `. Не удалось: ${data.failed.length}` : "")
      );
      setMatches(null);
      onAdded();
    } catch (e) {
      onStatus(e instanceof Error ? e.message : "Ошибка добавления");
    } finally {
      setAdding(false);
    }
  }

  function updateSelection(index: number, patch: Partial<Selection>) {
    setSelections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        title="Добавить игры с фото"
        className="icon-btn control-h w-12 shrink-0"
      >
        {loading ? (
          <IconLoader2 size={22} className="animate-spin" />
        ) : (
          <IconCamera size={22} />
        )}
      </button>

      {matches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="surface animate-pop-in max-h-[85vh] w-full max-w-lg overflow-y-auto p-6">
            <h2 className="font-display mb-4 text-lg font-extrabold tracking-tight text-ink">
              Найдено на фото
            </h2>
            <div className="space-y-3">
              {matches.map((match, i) => (
                <div
                  key={i}
                  className="rounded-2xl border-2 border-ink bg-black/[0.04] p-3"
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selections[i].enabled}
                      disabled={match.candidates.length === 0}
                      onChange={(e) =>
                        updateSelection(i, { enabled: e.target.checked })
                      }
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="font-semibold text-ink">
                      {match.titleOnBox}
                    </span>
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                      {CONFIDENCE_LABEL[match.confidence]}
                    </span>
                  </label>

                  {match.candidates.length > 0 ? (
                    <div className="mt-2 space-y-2 pl-6">
                      <select
                        value={selections[i].bggId ?? ""}
                        onChange={(e) =>
                          updateSelection(i, { bggId: Number(e.target.value) })
                        }
                        className="field px-2.5 py-1.5 text-sm"
                      >
                        {match.candidates.map((c) => (
                          <option key={c.bggId} value={c.bggId}>
                            {c.name}
                            {c.yearPublished ? ` (${c.yearPublished})` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Теги через запятую (необязательно)"
                        value={selections[i].tags}
                        onChange={(e) =>
                          updateSelection(i, { tags: e.target.value })
                        }
                        className="field px-2.5 py-1.5 text-sm"
                      />
                    </div>
                  ) : (
                    <p className="mt-1 pl-6 text-sm font-medium text-ink/55">
                      В BGG не найдено
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={confirmAdd}
                disabled={adding}
                className="btn btn-brand flex-1 py-2.5"
              >
                {adding ? "Добавляю…" : "Добавить выбранные"}
              </button>
              <button
                onClick={() => setMatches(null)}
                disabled={adding}
                className="btn btn-ghost px-4 py-2.5"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
