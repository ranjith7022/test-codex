import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get("roomCode")?.toUpperCase();

  if (!roomCode) {
    return NextResponse.json({ error: "roomCode is required" }, { status: 400 });
  }

  const room = await getRoom(roomCode);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({ room });
}
