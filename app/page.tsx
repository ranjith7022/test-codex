"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { RoomState, TILE_COLORS, TileColor } from "@/lib/game";

type ApiError = { error: string };

async function postJson<T>(payload: unknown): Promise<T> {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = (await res.json()) as ApiError;
    throw new Error(err.error || "Request failed");
  }

  return (await res.json()) as T;
}

export default function HomePage(): JSX.Element {
  const [playerName, setPlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("center");
  const [selectedColor, setSelectedColor] = useState<TileColor>("blue");
  const [error, setError] = useState<string>("");

  const me = useMemo(() => room?.players.find((p) => p.id === playerId) ?? null, [room, playerId]);
  const isMyTurn = room?.activePlayerId === playerId;

  useEffect(() => {
    if (!room?.code) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/state?roomCode=${room.code}`);
      if (res.ok) {
        const json = (await res.json()) as { room: RoomState };
        setRoom(json.room);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [room?.code]);

  async function createRoom(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    try {
      const data = await postJson<{ room: RoomState; playerId: string }>({ action: "create", playerName });
      setRoom(data.room);
      setPlayerId(data.playerId);
      setRoomCodeInput(data.room.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
    }
  }

  async function joinRoom(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    try {
      const data = await postJson<{ room: RoomState; playerId: string }>({
        action: "join",
        roomCode: roomCodeInput.toUpperCase(),
        playerName
      });
      setRoom(data.room);
      setPlayerId(data.playerId);
      setRoomCodeInput(data.room.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
    }
  }

  async function makeMove(): Promise<void> {
    if (!room) return;
    setError("");
    try {
      const data = await postJson<{ room: RoomState }>({
        action: "move",
        roomCode: room.code,
        playerId,
        source: selectedSource,
        color: selectedColor
      });
      setRoom(data.room);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Move failed");
    }
  }

  return (
    <main>
      <h1>Azul (2 Players)</h1>
      <p className="status">Create a room, share the code, and let your friend join.</p>

      <section className="panel">
        <form className="row" onSubmit={createRoom}>
          <input
            placeholder="Your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
            required
          />
          <button type="submit">Create room</button>
        </form>

        <form className="row" onSubmit={joinRoom} style={{ marginTop: "0.75rem" }}>
          <input
            placeholder="Room code"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            maxLength={6}
            required
          />
          <button type="submit">Join room</button>
        </form>
        {error ? <p style={{ color: "#ffc1c1" }}>{error}</p> : null}
      </section>

      {room ? (
        <>
          <section className="panel">
            <h2>Room {room.code}</h2>
            <p className="status">Status: {room.status} · Round {room.round}</p>
            <ul>
              {room.players.map((p) => (
                <li key={p.id}>
                  {p.name} {p.id === playerId ? "(You)" : ""} — score {p.score}
                  {room.winnerId === p.id ? " 🏆" : ""}
                </li>
              ))}
            </ul>
            <p className="status">Current turn: {room.players.find((p) => p.id === room.activePlayerId)?.name ?? "-"}</p>
          </section>

          <section className="panel">
            <h3>Factories</h3>
            <div className="factory">
              {room.factories.map((f, idx) => (
                <div key={`factory-${idx}`} className="panel">
                  <strong>Factory {idx + 1}</strong>
                  <div className="row" style={{ marginTop: "0.5rem" }}>
                    {f.length ? (
                      f.map((tile, i) => (
                        <span className="tile" key={`${tile}-${i}`}>
                          {tile}
                        </span>
                      ))
                    ) : (
                      <span className="status">Empty</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="panel" style={{ marginTop: "0.75rem" }}>
              <strong>Center</strong>
              <div className="row" style={{ marginTop: "0.5rem" }}>
                {room.center.length ? (
                  room.center.map((tile, i) => (
                    <span className="tile" key={`${tile}-${i}`}>
                      {tile}
                    </span>
                  ))
                ) : (
                  <span className="status">Empty</span>
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <h3>Your move</h3>
            <div className="row">
              <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}>
                <option value="center">Center</option>
                {room.factories.map((_, idx) => (
                  <option key={`opt-${idx}`} value={`factory-${idx}`}>
                    Factory {idx + 1}
                  </option>
                ))}
              </select>

              <select value={selectedColor} onChange={(e) => setSelectedColor(e.target.value as TileColor)}>
                {TILE_COLORS.map((color) => (
                  <option value={color} key={color}>
                    {color}
                  </option>
                ))}
              </select>

              <button disabled={!isMyTurn || room.status !== "playing"} onClick={makeMove} type="button">
                Take tiles
              </button>
            </div>
            {!me ? <p className="status">You are spectating.</p> : null}
            {room.status === "finished" ? <p className="status">Game finished. Create another room for rematch.</p> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
