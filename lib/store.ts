import { RoomState } from "@/lib/game";

const local = new Map<string, RoomState>();
const localRoomLocks = new Map<string, Promise<void>>();

const ROOM_TTL_SECONDS = 60 * 60 * 24;
const KV_LOCK_TTL_SECONDS = 60;
const KV_LOCK_RENEW_INTERVAL_MS = 15_000;
const KV_LOCK_MAX_RETRIES = 100;
const KV_LOCK_RETRY_DELAY_MS = 50;

function canUseVercelKv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function allowInMemoryLock(): boolean {
  return process.env.ALLOW_IN_MEMORY_LOCK === "true";
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

async function runKvEval(script: string, keys: string[], args: string[]): Promise<number> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN for lock scripting");
  }

  const encodedSegments = [
    encodeURIComponent(script),
    String(keys.length),
    ...keys.map((value) => encodeURIComponent(value)),
    ...args.map((value) => encodeURIComponent(value))
  ];

  const response = await fetch(`${url}/eval/${encodedSegments.join("/")}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`KV eval failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: number };
  return payload.result ?? 0;
}

async function releaseKvLockAtomically(lockKey: string, token: string): Promise<void> {
  const released = await runKvEval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
    [lockKey],
    [token]
  );

  if (released === 0) {
    return;
  }
}

async function renewKvLockLease(lockKey: string, token: string): Promise<boolean> {
  const renewed = await runKvEval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end',
    [lockKey],
    [token, String(KV_LOCK_TTL_SECONDS)]
  );

  return renewed === 1;
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
      let leaseLost = false;
      const renewTimer = setInterval(() => {
        void renewKvLockLease(lockKey, token)
          .then((renewed) => {
            if (!renewed) {
              leaseLost = true;
            }
          })
          .catch(() => {
            leaseLost = true;
          });
      }, KV_LOCK_RENEW_INTERVAL_MS);

      try {
        const result = await action();
        if (leaseLost) {
          throw new Error("Room lock lease was lost while processing action");
        }
        return result;
      } finally {
        clearInterval(renewTimer);
        await releaseKvLockAtomically(lockKey, token);
      }
    }

    await sleep(KV_LOCK_RETRY_DELAY_MS);
  }

  throw new Error("Could not acquire room lock");
}

export async function withRoomLock<T>(code: string, action: () => Promise<T>): Promise<T> {
  if (canUseVercelKv()) {
    return withKvRoomLock(code, action);
  }

  if (process.env.NODE_ENV === "production" && !allowInMemoryLock()) {
    throw new Error(
      "Vercel KV lock is not configured in production. Set KV_REST_API_URL and KV_REST_API_TOKEN, or explicitly set ALLOW_IN_MEMORY_LOCK=true to use the in-memory lock fallback."
    );
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
