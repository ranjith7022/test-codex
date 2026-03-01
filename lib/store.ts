import { RoomState } from "@/lib/game";

const local = new Map<string, RoomState>();
const localRoomLocks = new Map<string, Promise<void>>();

const ROOM_TTL_SECONDS = 60 * 60 * 24;
const KV_LOCK_TTL_SECONDS = 5;
const KV_LOCK_MAX_RETRIES = 30;

function canUseVercelKv(): boolean {
  return Boolean(process.env.KV_URL && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function loadKv() {
  const mod = await import("@vercel/kv");
  return mod.kv;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withLocalRoomLock<T>(code: string, action: () => Promise<T>): Promise<T> {
  const previous = localRoomLocks.get(code) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const chained = previous.then(() => current);

  localRoomLocks.set(code, chained);

  await previous;
  try {
    return await action();
  } finally {
    releaseCurrent();
    if (localRoomLocks.get(code) === chained) {
      localRoomLocks.delete(code);
    }
  }
}

async function withKvRoomLock<T>(code: string, action: () => Promise<T>): Promise<T> {
  const kv = await loadKv();
  const lockKey = `room-lock:${code}`;
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt < KV_LOCK_MAX_RETRIES; attempt += 1) {
    const acquired = await kv.set(lockKey, token, { nx: true, ex: KV_LOCK_TTL_SECONDS });
    if (acquired === "OK") {
      try {
        return await action();
      } finally {
        const lockOwner = await kv.get<string>(lockKey);
        if (lockOwner === token) {
          await kv.del(lockKey);
        }
      }
    }
    await sleep(50);
  }

  throw new Error("Could not acquire room lock");
}

export async function withRoomLock<T>(code: string, action: () => Promise<T>): Promise<T> {
  if (canUseVercelKv()) {
    return withKvRoomLock(code, action);
  }
  return withLocalRoomLock(code, action);
}

export async function getRoom(code: string): Promise<RoomState | null> {
  if (canUseVercelKv()) {
    const kv = await loadKv();
    return (await kv.get<RoomState>(`room:${code}`)) ?? null;
  }
  return local.get(code) ?? null;
}

export async function setRoom(code: string, room: RoomState): Promise<void> {
  if (canUseVercelKv()) {
    const kv = await loadKv();
    await kv.set(`room:${code}`, room, { ex: ROOM_TTL_SECONDS });
    return;
  }
  local.set(code, room);
}
