import {
  type LiveActivityResponse,
  parseLiveActivity,
} from "../../lib/live-activity.ts";
import type { MonitorStateStore, ProviderResult } from "./types.ts";

type CodingData = NonNullable<LiveActivityResponse["coding"]>;
type SteamData = NonNullable<LiveActivityResponse["steam"]>;
type Snapshot<T> = { savedAt: number; data: T };

export const HISTORY_REFRESH_MS = 10 * 60000;
export const HISTORY_TTL_SECONDS = 90 * 24 * 60 * 60;
const key = (provider: "coding" | "steam") => `activity-history:${provider}`;

async function recall<K extends "coding" | "steam">(
  store: MonitorStateStore,
  provider: K,
): Promise<Snapshot<NonNullable<LiveActivityResponse[K]>> | undefined> {
  const raw = await store.get(key(provider));
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as { savedAt?: unknown; data?: unknown };
  if (typeof parsed.savedAt !== "number") return undefined;
  const valid = parseLiveActivity({
    generatedAt: new Date(parsed.savedAt).toISOString(),
    providerStates: {
      coding: "empty",
      spotify: "empty",
      simkl: "empty",
      steam: "empty",
      [provider]: "available",
    },
    [provider]: parsed.data,
  })?.[provider];
  return valid?.observedAt
    ? {
        savedAt: parsed.savedAt,
        data: valid as NonNullable<LiveActivityResponse[K]>,
      }
    : undefined;
}

async function remember<T extends { observedAt?: string }>(
  store: MonitorStateStore,
  provider: "coding" | "steam",
  stored: Snapshot<T> | undefined,
  data: T,
  identity: (value: T) => string,
  now: number,
) {
  const changed =
    !stored ||
    identity(stored.data) !== identity(data) ||
    now - stored.savedAt >= HISTORY_REFRESH_MS;
  if (!changed) return;
  await store.put(key(provider), JSON.stringify({ savedAt: now, data }), {
    expirationTtl: HISTORY_TTL_SECONDS,
  });
}

const codingIdentity = (data: CodingData) =>
  [data.project, data.language, data.editor].join("|");
const steamIdentity = (data: SteamData) => data.appId ?? data.game ?? "";

export async function withCodingHistory(
  result: ProviderResult<"coding">,
  store: MonitorStateStore | undefined,
  now: number,
): Promise<ProviderResult<"coding">> {
  if (!store || result.state === "unconfigured") return result;
  try {
    const stored = await recall(store, "coding");
    if (result.data?.observedAt) {
      await remember(store, "coding", stored, result.data, codingIdentity, now);
      return result;
    }
    if (stored && (result.state === "available" || result.state === "empty"))
      return {
        state: "available",
        data: {
          ...stored.data,
          status: "idle",
          durationMinutes: result.data?.durationMinutes || undefined,
        },
      };
  } catch {
    console.error("activity_history_error", { provider: "coding" });
  }
  return result;
}

export async function withSteamHistory(
  result: ProviderResult<"steam">,
  store: MonitorStateStore | undefined,
  now: number,
): Promise<ProviderResult<"steam">> {
  if (!store || result.state === "unconfigured") return result;
  try {
    const stored = await recall(store, "steam");
    if (result.data?.isPlaying) {
      const data = { ...result.data, observedAt: new Date(now).toISOString() };
      await remember(store, "steam", stored, data, steamIdentity, now);
      return { ...result, data };
    }
    if (stored && (result.state === "available" || result.state === "empty"))
      return { state: "available", data: { ...stored.data, isPlaying: false } };
  } catch {
    console.error("activity_history_error", { provider: "steam" });
  }
  return result;
}
