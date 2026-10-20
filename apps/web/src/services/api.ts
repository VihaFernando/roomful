import type {
  ApiError,
  CreateRoomBody,
  GamesResponse,
  JoinRoomBody,
  RoomLookup,
  SessionGrant,
} from "@party/shared";

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiError["error"]["code"] | "NETWORK",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError("NETWORK", "Can't reach the server. Check your connection.", 0);
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiRequestError(err?.code ?? "INTERNAL", err?.message ?? "Something went wrong.", res.status);
  }
  return body as T;
}

export const api = {
  games: () => request<GamesResponse>("/api/games"),
  lookupRoom: (code: string) => request<RoomLookup>(`/api/rooms/${encodeURIComponent(code)}`),
  createRoom: (body: CreateRoomBody) => request<SessionGrant>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  joinRoom: (code: string, body: JoinRoomBody) =>
    request<SessionGrant>(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify(body) }),
};
