import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HISTORY_REFRESH_MS,
  HISTORY_TTL_SECONDS,
  withCodingHistory,
  withSteamHistory,
} from "../worker/src/activity-history.ts";
import type { MonitorStateStore } from "../worker/src/types.ts";

const now = Date.parse("2026-10-07T12:00:00Z");
function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const puts: { key: string; ttl?: number }[] = [];
  const store: MonitorStateStore = {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value, options) => {
      values.set(key, value);
      puts.push({ key, ttl: options?.expirationTtl });
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
  return { store, values, puts };
}
const playing = {
  isPlaying: true,
  game: "Hades II",
  appId: "1145350",
  externalUrl: "https://store.steampowered.com/app/1145350/",
};

test("steam remembers the game being played and serves it later", async () => {
  const { store, puts } = memoryStore();
  const live = await withSteamHistory(
    { state: "available", data: playing },
    store,
    now,
  );
  assert.equal(live.data?.observedAt, "2026-10-07T12:00:00.000Z");
  assert.deepEqual(puts, [
    { key: "activity-history:steam", ttl: HISTORY_TTL_SECONDS },
  ]);

  const later = now + 3 * 3600000;
  const fallback = await withSteamHistory(
    {
      state: "available",
      data: { isPlaying: false, game: "Other", appId: "10" },
    },
    store,
    later,
  );
  assert.equal(fallback.data?.game, "Hades II");
  assert.equal(fallback.data?.isPlaying, false);
  assert.equal(fallback.data?.observedAt, "2026-10-07T12:00:00.000Z");
  assert.equal(
    (await withSteamHistory({ state: "empty" }, store, later)).data?.game,
    "Hades II",
  );
});

test("history writes are throttled while the same activity continues", async () => {
  const { store, puts } = memoryStore();
  const result = { state: "available" as const, data: playing };
  await withSteamHistory(result, store, now);
  await withSteamHistory(result, store, now + 60000);
  assert.equal(puts.length, 1);
  await withSteamHistory(result, store, now + HISTORY_REFRESH_MS);
  assert.equal(puts.length, 2);
  await withSteamHistory(
    {
      state: "available",
      data: { ...playing, appId: "620", game: "Portal 2" },
    },
    store,
    now + HISTORY_REFRESH_MS + 60000,
  );
  assert.equal(puts.length, 3);
});

test("coding falls back to the last heartbeat without today's totals", async () => {
  const { store } = memoryStore();
  await withCodingHistory(
    {
      state: "available",
      data: {
        status: "active",
        observedAt: "2026-10-06T22:00:00Z",
        language: "Java",
        durationMinutes: 120,
      },
    },
    store,
    now - 14 * 3600000,
  );
  const result = await withCodingHistory(
    { state: "available", data: { status: "idle", durationMinutes: 0 } },
    store,
    now,
  );
  assert.deepEqual(result, {
    state: "available",
    data: {
      status: "idle",
      observedAt: "2026-10-06T22:00:00Z",
      language: "Java",
      durationMinutes: undefined,
    },
  });
});

test("outages, missing storage and corrupt snapshots pass through", async () => {
  const { store } = memoryStore({
    "activity-history:steam": JSON.stringify({
      savedAt: now,
      data: {
        ...playing,
        isPlaying: false,
        observedAt: "2026-10-07T11:00:00Z",
      },
    }),
    "activity-history:coding": "{not json",
  });
  assert.deepEqual(
    await withSteamHistory({ state: "unavailable" }, store, now),
    {
      state: "unavailable",
    },
  );
  assert.deepEqual(await withSteamHistory({ state: "empty" }, undefined, now), {
    state: "empty",
  });
  assert.deepEqual(await withCodingHistory({ state: "empty" }, store, now), {
    state: "empty",
  });
  const unsafe = memoryStore({
    "activity-history:steam": JSON.stringify({
      savedAt: now,
      data: {
        ...playing,
        isPlaying: false,
        observedAt: "2026-10-07T11:00:00Z",
        externalUrl: "http://evil.example",
      },
    }),
  });
  assert.deepEqual(
    await withSteamHistory({ state: "empty" }, unsafe.store, now),
    { state: "empty" },
  );
});
