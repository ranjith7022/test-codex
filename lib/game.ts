export const TILE_COLORS = ["blue", "yellow", "red", "black", "teal"] as const;
export type TileColor = (typeof TILE_COLORS)[number];

export type Player = {
  id: string;
  name: string;
  score: number;
  patternLines: Record<TileColor, number>;
  wall: Record<TileColor, number>;
};

export type RoomState = {
  code: string;
  createdAt: number;
  hostId: string;
  players: Player[];
  activePlayerId: string;
  bag: TileColor[];
  factories: TileColor[][];
  center: TileColor[];
  status: "waiting" | "playing" | "finished";
  round: number;
  winnerId?: string;
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeBag(): TileColor[] {
  const tiles: TileColor[] = [];
  for (const color of TILE_COLORS) {
    for (let i = 0; i < 20; i += 1) {
      tiles.push(color);
    }
  }
  return shuffle(tiles);
}

function drawTiles(bag: TileColor[], count: number): TileColor[] {
  const picked: TileColor[] = [];
  for (let i = 0; i < count && bag.length > 0; i += 1) {
    const t = bag.pop();
    if (t) picked.push(t);
  }
  return picked;
}

export function createRoomState(code: string, hostId: string, hostName: string): RoomState {
  return {
    code,
    createdAt: Date.now(),
    hostId,
    players: [newPlayer(hostId, hostName)],
    activePlayerId: hostId,
    bag: makeBag(),
    factories: [],
    center: [],
    status: "waiting",
    round: 0
  };
}

export function newPlayer(id: string, name: string): Player {
  const line: Record<TileColor, number> = {
    blue: 0,
    yellow: 0,
    red: 0,
    black: 0,
    teal: 0
  };

  return {
    id,
    name,
    score: 0,
    patternLines: { ...line },
    wall: { ...line }
  };
}

export function startRound(state: RoomState): RoomState {
  const next = { ...state };
  const factories: TileColor[][] = [];
  for (let i = 0; i < 5; i += 1) {
    factories.push(drawTiles(next.bag, 4));
  }
  next.factories = factories;
  next.center = [];
  next.status = "playing";
  next.round += 1;
  next.activePlayerId = next.players[0].id;
  return next;
}

function calculateGain(count: number): number {
  if (count >= 5) return 7;
  if (count === 4) return 5;
  if (count === 3) return 3;
  if (count === 2) return 2;
  return 1;
}

export function takeTurn(state: RoomState, playerId: string, source: string, color: TileColor): RoomState {
  if (state.status !== "playing") {
    throw new Error("Game has not started yet");
  }
  if (state.activePlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  const next: RoomState = JSON.parse(JSON.stringify(state)) as RoomState;
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  let taken: TileColor[] = [];

  if (source === "center") {
    taken = next.center.filter((c) => c === color);
    next.center = next.center.filter((c) => c !== color);
  } else {
    const idx = Number(source.replace("factory-", ""));
    const factory = next.factories[idx];
    if (!factory) throw new Error("Factory does not exist");
    taken = factory.filter((c) => c === color);
    const leftovers = factory.filter((c) => c !== color);
    next.center.push(...leftovers);
    next.factories[idx] = [];
  }

  if (taken.length === 0) {
    throw new Error("No tiles with selected color");
  }

  player.patternLines[color] += taken.length;
  const gain = calculateGain(player.patternLines[color]);
  player.score += gain;

  if (player.patternLines[color] >= 5 && player.wall[color] === 0) {
    player.wall[color] = 1;
    player.score += 2;
  }

  const empties = next.factories.every((f) => f.length === 0) && next.center.length === 0;
  if (empties) {
    const winner = [...next.players].sort((a, b) => b.score - a.score)[0];
    next.status = "finished";
    next.winnerId = winner.id;
    return next;
  }

  const currentIndex = next.players.findIndex((p) => p.id === playerId);
  const nextPlayer = next.players[(currentIndex + 1) % next.players.length];
  next.activePlayerId = nextPlayer.id;
  return next;
}
