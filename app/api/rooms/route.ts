import { NextResponse } from "next/server";
import { createRoomState, newPlayer, startRound, takeTurn, TILE_COLORS, TileColor } from "@/lib/game";
import { getRoom, setRoom } from "@/lib/store";

function codeGen(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { action: string; roomCode?: string; playerName?: string; playerId?: string; source?: string; color?: TileColor };

  if (body.action === "create") {
    const playerName = (body.playerName ?? "Host").slice(0, 20);
    const playerId = crypto.randomUUID();

    let code = codeGen();
    while (await getRoom(code)) {
      code = codeGen();
    }

    const room = createRoomState(code, playerId, playerName);
    await setRoom(code, room);
    return NextResponse.json({ room, playerId });
  }

  if (!body.roomCode) {
    return NextResponse.json({ error: "roomCode is required" }, { status: 400 });
  }

  const room = await getRoom(body.roomCode.toUpperCase());
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (body.action === "join") {
    if (room.players.length >= 2) {
      return NextResponse.json({ error: "Room is full" }, { status: 409 });
    }
    const name = (body.playerName ?? `Player ${room.players.length + 1}`).slice(0, 20);
    const id = crypto.randomUUID();
    room.players.push(newPlayer(id, name));
    const updated = startRound(room);
    await setRoom(room.code, updated);
    return NextResponse.json({ room: updated, playerId: id });
  }

  if (body.action === "move") {
    const isColor = body.color && TILE_COLORS.includes(body.color);
    if (!body.playerId || !body.source || !isColor) {
      return NextResponse.json({ error: "playerId, source and color are required" }, { status: 400 });
    }

    try {
      const updated = takeTurn(room, body.playerId, body.source, body.color);
      await setRoom(room.code, updated);
      return NextResponse.json({ room: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Move failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
