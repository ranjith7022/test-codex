import { NextResponse } from "next/server";
import { createRoomState, newPlayer, startRound, takeTurn, TILE_COLORS, TileColor } from "@/lib/game";
import { getRoom, setRoom, withRoomLock } from "@/lib/store";

const MAX_CODE_RETRIES = 1_000;

type RoomsRequestBody = {
  action: string;
  roomCode?: string;
  playerName?: string;
  playerId?: string;
  source?: string;
  color?: string;
};

function codeGen(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function isTileColor(value: unknown): value is TileColor {
  return typeof value === "string" && TILE_COLORS.includes(value as TileColor);
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RoomsRequestBody;

  if (body.action === "create") {
    const playerName = (body.playerName ?? "Host").slice(0, 20);
    const playerId = crypto.randomUUID();

    let code = "";
    for (let attempts = 0; attempts < MAX_CODE_RETRIES; attempts += 1) {
      const candidate = codeGen();
      if (!(await getRoom(candidate))) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return NextResponse.json({ error: "Could not allocate room code, try again" }, { status: 503 });
    }

    const room = createRoomState(code, playerId, playerName);
    await setRoom(code, room);
    return NextResponse.json({ room, playerId });
  }

  if (!body.roomCode) {
    return NextResponse.json({ error: "roomCode is required" }, { status: 400 });
  }

  const roomCode = body.roomCode.toUpperCase();

  if (body.action === "join") {
    try {
      const result = await withRoomLock(roomCode, async () => {
        const room = await getRoom(roomCode);
        if (!room) {
          return { error: "Room not found", status: 404 as const };
        }
        if (room.players.length >= 2) {
          return { error: "Room is full", status: 409 as const };
        }

        const name = (body.playerName ?? `Player ${room.players.length + 1}`).slice(0, 20);
        const id = crypto.randomUUID();
        const updatedRoom = {
          ...room,
          players: [...room.players, newPlayer(id, name)]
        };
        const startedRoom = startRound(updatedRoom);
        await setRoom(room.code, startedRoom);

        return { room: startedRoom, playerId: id };
      });

      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json(result);
    } catch {
      return NextResponse.json({ error: "Join failed due to room lock contention" }, { status: 409 });
    }
  }

  const room = await getRoom(roomCode);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (body.action === "move") {
    const color = body.color;
    if (!body.playerId || !body.source || !isTileColor(color)) {
      return NextResponse.json({ error: "playerId, source and color are required" }, { status: 400 });
    }

    try {
      const updated = takeTurn(room, body.playerId, body.source, color);
      await setRoom(room.code, updated);
      return NextResponse.json({ room: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Move failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
