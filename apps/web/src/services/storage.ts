import { AVATAR_IDS, type AvatarId, type SessionGrant } from "@party/shared";

/** localStorage can throw (private mode, blocked storage); never let that break the app. */
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

const sessionKey = (code: string) => `roomful:session:${code}`;

export const sessions = {
  get: (code: string) => read<SessionGrant>(sessionKey(code)),
  save: (grant: SessionGrant) => write(sessionKey(grant.code), grant),
  forget: (code: string) => write(sessionKey(code), null),
};

export interface SavedIdentity {
  nickname: string;
  avatarId: AvatarId;
}

export const identity = {
  get(): SavedIdentity | null {
    const v = read<SavedIdentity>("roomful:identity");
    return v && AVATAR_IDS.includes(v.avatarId) ? v : null;
  },
  save: (v: SavedIdentity) => write("roomful:identity", v),
};

export const flags = {
  get: (name: string) => read<boolean>(`roomful:flag:${name}`) === true,
  set: (name: string) => write(`roomful:flag:${name}`, true),
};
