"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  IconUserPlus,
  IconCheck,
  IconX,
  IconUsers,
  IconPencil,
  IconLoader2,
  IconChevronRight,
  IconAt,
} from "@tabler/icons-react";

interface Friend {
  friendshipId: string;
  userId: string;
  username: string;
}

interface FriendData {
  username: string | null;
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}

const EMPTY: FriendData = {
  username: null,
  friends: [],
  incoming: [],
  outgoing: [],
};

export default function FriendsManager() {
  const [data, setData] = useState<FriendData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");

  const [addValue, setAddValue] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/friends");
    const json = res.ok ? await res.json() : EMPTY;
    setData({ ...EMPTY, ...json });
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    const username = addValue.trim();
    if (!username || adding) return;
    setAdding(true);
    setStatus("");
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      setStatus(
        json.result === "accepted"
          ? `Вы теперь друзья с @${username}!`
          : `Запрос отправлен @${username}.`
      );
      setAddValue("");
      load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setAdding(false);
    }
  }

  async function accept(id: string) {
    await fetch("/api/friends", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch("/api/friends", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const username = nameValue.trim().toLowerCase();
    if (!username) return;
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const json = await res.json();
    if (!res.ok) {
      setStatus(json.error ?? "Не удалось сменить ник");
      return;
    }
    setEditingName(false);
    setStatus("");
    load();
  }

  return (
    <div className="space-y-8">
      {/* Ваш ник */}
      <section className="surface px-5 py-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">
          Ваш ник
        </p>
        {editingName ? (
          <form onSubmit={saveName} className="flex items-center gap-2">
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="ваш_ник"
              className="field control-h flex-1 px-4 text-sm"
            />
            <button type="submit" className="btn btn-brand control-h px-4">
              <IconCheck size={18} stroke={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className="btn btn-ghost control-h px-4"
            >
              <IconX size={18} stroke={2.5} />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <IconAt size={18} className="text-brand" />
            <span className="text-lg font-bold text-ink">
              {data.username ?? "…"}
            </span>
            <button
              onClick={() => {
                setNameValue(data.username ?? "");
                setEditingName(true);
              }}
              aria-label="Сменить ник"
              title="Сменить ник"
              className="icon-btn ml-1 h-8 w-8"
            >
              <IconPencil size={15} />
            </button>
          </div>
        )}
      </section>

      {/* Добавить друга */}
      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight text-ink">
          Добавить друга
        </h2>
        <form onSubmit={addFriend} className="flex gap-2">
          <input
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            placeholder="Ник друга"
            className="field control-h flex-1 rounded-full px-5 text-sm"
          />
          <button
            type="submit"
            disabled={adding || !addValue.trim()}
            className="btn btn-brand control-h shrink-0 px-5"
            aria-label="Отправить запрос"
          >
            {adding ? (
              <IconLoader2 size={20} className="animate-spin" />
            ) : (
              <IconUserPlus size={20} stroke={2.2} />
            )}
          </button>
        </form>
        {status && (
          <p className="mt-2 text-sm font-medium text-ink/70">{status}</p>
        )}
      </section>

      {/* Входящие запросы */}
      {data.incoming.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight text-ink">
            Входящие запросы
          </h2>
          <ul className="space-y-2">
            {data.incoming.map((f) => (
              <li
                key={f.friendshipId}
                className="surface flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="font-bold text-ink">@{f.username}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => accept(f.friendshipId)}
                    className="btn btn-brand px-3 py-1.5 text-sm"
                  >
                    <IconCheck size={16} className="mr-1" stroke={2.5} /> Принять
                  </button>
                  <button
                    onClick={() => remove(f.friendshipId)}
                    className="btn btn-ghost px-3 py-1.5 text-sm hover:text-coral"
                  >
                    <IconX size={16} stroke={2.5} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Друзья */}
      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight text-ink">
          Друзья
        </h2>
        {!loaded ? (
          <p className="py-6 text-center font-semibold text-muted">Загрузка…</p>
        ) : data.friends.length === 0 ? (
          <div className="surface flex flex-col items-center px-6 py-10 text-center">
            <IconUsers size={48} className="mb-3 text-ink/30" />
            <p className="font-medium text-ink/70">
              Пока нет друзей. Добавьте кого-нибудь по нику выше.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.friends.map((f) => (
              <li
                key={f.friendshipId}
                className="surface flex items-center gap-3 px-4 py-3"
              >
                <Link
                  href={`/friends/${f.userId}`}
                  className="flex flex-1 items-center gap-2 font-bold text-ink hover:text-brand"
                >
                  <IconUsers size={18} className="text-brand" />@{f.username}
                  <IconChevronRight size={16} className="text-ink/40" />
                </Link>
                <button
                  onClick={() => remove(f.friendshipId)}
                  aria-label={`Удалить ${f.username} из друзей`}
                  title="Удалить из друзей"
                  className="btn btn-ghost px-3 py-1.5 text-sm hover:text-coral"
                >
                  <IconX size={16} stroke={2.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Исходящие запросы */}
      {data.outgoing.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight text-ink">
            Отправленные запросы
          </h2>
          <ul className="space-y-2">
            {data.outgoing.map((f) => (
              <li
                key={f.friendshipId}
                className="surface flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="font-bold text-ink/70">@{f.username}</span>
                <button
                  onClick={() => remove(f.friendshipId)}
                  className="btn btn-ghost px-3 py-1.5 text-sm hover:text-coral"
                >
                  Отменить
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
