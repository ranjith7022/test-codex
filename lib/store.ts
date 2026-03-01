import { kv } from "@vercel/kv";
import { RoomState } from "@/lib/game";

const local = new Map<string, RoomState>();

function canUseVercelKv(): boolean {
  return Boolean(process.env.KV_URL && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getRoom(code: string): Promise<RoomState | null> {
  if (canUseVercelKv()) {
    return (await kv.get<RoomState>(`room:${code}`)) ?? null;
  }
  return local.get(code) ?? null;
}

export async function setRoom(code: string, room: RoomState): Promise<void> {
  if (canUseVercelKv()) {
    await kv.set(`room:${code}`, room);
    return;
  }
  local.set(code, room);
}
