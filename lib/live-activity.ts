export const providers = ["coding", "spotify", "simkl", "steam"] as const;
export type Provider = (typeof providers)[number];
export type ProviderState =
  | "available"
  | "empty"
  | "unavailable"
  | "unconfigured";
type Observation = { observedAt?: string };
export interface LiveActivityResponse {
  generatedAt: string;
  providerStates: Record<Provider, ProviderState>;
  coding?: Observation & {
    status: "active" | "idle";
    project?: string;
    language?: string;
    editor?: string;
    file?: string;
    durationMinutes?: number;
  };
  spotify?: Observation & {
    isPlaying: boolean;
    track?: string;
    artist?: string;
    album?: string;
    artworkUrl?: string;
    externalUrl?: string;
  };
  simkl?: Observation & {
    mediaType: "anime" | "tv" | "movie";
    title: string;
    episode?: number;
    isActive: boolean;
    posterUrl?: string;
    externalUrl?: string;
  };
  steam?: Observation & {
    isPlaying: boolean;
    game?: string;
    appId?: string;
    imageUrl?: string;
    coverUrl?: string;
    totalPlaytimeMinutes?: number;
    externalUrl?: string;
  };
}
export function parseLiveActivity(value: unknown): LiveActivityResponse | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(data.generatedAt)) ||
    !data.providerStates ||
    typeof data.providerStates !== "object"
  )
    return null;
  const states = data.providerStates as Record<string, unknown>;
  for (const provider of providers) {
    if (
      !["available", "empty", "unavailable", "unconfigured"].includes(
        String(states[provider]),
      )
    )
      return null;
    const item = data[provider];
    if (states[provider] === "available" && (!item || typeof item !== "object"))
      return null;
    if (item !== undefined) {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      if (
        entry.observedAt !== undefined &&
        (typeof entry.observedAt !== "string" ||
          !Number.isFinite(Date.parse(entry.observedAt)))
      )
        return null;
      if (
        provider === "coding" &&
        !["active", "idle"].includes(String(entry.status))
      )
        return null;
      if (
        (provider === "spotify" || provider === "steam") &&
        typeof entry.isPlaying !== "boolean"
      )
        return null;
      if (
        provider === "simkl" &&
        (!["anime", "tv", "movie"].includes(String(entry.mediaType)) ||
          typeof entry.title !== "string" ||
          typeof entry.isActive !== "boolean")
      )
        return null;
      for (const [key, field] of Object.entries(entry)) {
        if (
          ["durationMinutes", "episode", "totalPlaytimeMinutes"].includes(key)
        ) {
          if (typeof field !== "number" || !Number.isFinite(field) || field < 0)
            return null;
        } else if (
          ["isPlaying", "isActive"].includes(key)
            ? typeof field !== "boolean"
            : typeof field !== "string"
        )
          return null;
        if (key.endsWith("Url") && typeof field === "string") {
          try {
            const url = new URL(field);
            if (url.protocol !== "https:" || url.username || url.password)
              return null;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return value as LiveActivityResponse;
}

export const CODING_ACTIVE_MS = 15 * 60000;
export const SIMKL_ACTIVE_MS = 40 * 60000;

function withinWindow(observedAt: string | undefined, now: number, ms: number) {
  if (!observedAt) return false;
  const time = Date.parse(observedAt);
  return now >= time && now - time < ms;
}

export function isProviderActive(
  provider: Provider,
  data: LiveActivityResponse,
  now: number,
  stale: boolean,
): boolean {
  switch (provider) {
    case "coding":
      return withinWindow(data.coding?.observedAt, now, CODING_ACTIVE_MS);
    case "spotify":
      return Boolean(data.spotify?.isPlaying) && !stale;
    case "simkl":
      return (
        Boolean(data.simkl?.isActive) &&
        withinWindow(data.simkl?.observedAt, now, SIMKL_ACTIVE_MS)
      );
    case "steam":
      return Boolean(data.steam?.isPlaying) && !stale;
  }
}

function hasRecentActivity(provider: Provider, data: LiveActivityResponse) {
  if (data.providerStates[provider] !== "available") return false;
  if (provider === "coding") return Boolean(data.coding?.observedAt);
  return Boolean(data[provider]);
}

export type ActivitySelection =
  | { mode: "active"; providers: Provider[] }
  | { mode: "recent"; providers: Provider[] }
  | { mode: "none"; providers: [] };

export function selectActivityCards(
  data: LiveActivityResponse,
  now: number,
  stale: boolean,
): ActivitySelection {
  const active = providers.filter((provider) =>
    isProviderActive(provider, data, now, stale),
  );
  if (active.length) return { mode: "active", providers: active };
  const observed = (provider: Provider) => {
    const value = data[provider]?.observedAt;
    const time = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
  };
  const recent = providers
    .filter((provider) => hasRecentActivity(provider, data))
    .sort((a, b) =>
      observed(a) === observed(b) ? 0 : observed(b) - observed(a),
    );
  return recent.length
    ? { mode: "recent", providers: recent }
    : { mode: "none", providers: [] };
}
