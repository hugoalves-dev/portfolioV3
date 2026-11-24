"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../i18n/config.ts";
import type { DictionaryKey } from "../i18n/translate.ts";
import {
  formatDate,
  formatDuration,
  formatNumber,
  translate,
  translatePlural,
} from "../i18n/translate.ts";
import {
  createActivityRefresh,
  isActivityStale,
} from "../lib/activity-refresh.ts";
import {
  isProviderActive,
  type LiveActivityResponse,
  type Provider,
  parseLiveActivity,
  selectActivityCards,
} from "../lib/live-activity.ts";
import { Reveal } from "./scroll-motion";

const labels: Record<
  Provider,
  { title: string; symbol: string; category: DictionaryKey }
> = {
  coding: { title: "WakaTime", symbol: "⌘", category: "live.category.coding" },
  spotify: { title: "Spotify", symbol: "♫", category: "live.category.music" },
  simkl: {
    title: "Simkl",
    symbol: "▶",
    category: "live.category.watching",
  },
  steam: { title: "Steam", symbol: "✳", category: "live.category.games" },
};
function details(
  provider: Provider,
  data: LiveActivityResponse,
  stale: boolean,
  now: number,
  locale: Locale,
) {
  const active = isProviderActive(provider, data, now, stale);
  if (provider === "coding" && data.coding)
    return {
      title:
        data.coding.project ??
        data.coding.language ??
        translate(locale, "live.coding.fallback"),
      subtitle: [
        data.coding.file,
        data.coding.editor,
        data.coding.durationMinutes !== undefined
          ? translatePlural(
              locale,
              "live.coding.today.one",
              "live.coding.today.other",
              data.coding.durationMinutes,
              {
                duration: formatDuration(locale, data.coding.durationMinutes),
              },
            )
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      status: active
        ? translate(locale, "live.coding.now")
        : translate(locale, "live.coding.recent"),
      observedAt: data.coding.observedAt,
    };
  if (provider === "spotify" && data.spotify)
    return {
      title: data.spotify.track ?? translate(locale, "live.spotify.fallback"),
      subtitle: data.spotify.artist,
      status: active
        ? translate(locale, "live.spotify.now")
        : translate(locale, "live.spotify.recent"),
      image: data.spotify.artworkUrl,
      url: data.spotify.externalUrl,
      observedAt: data.spotify.observedAt,
    };
  if (provider === "simkl" && data.simkl)
    return {
      title: data.simkl.title,
      subtitle: [
        data.simkl.mediaType === "tv"
          ? translate(locale, "live.simkl.series")
          : data.simkl.mediaType === "movie"
            ? translate(locale, "live.simkl.movie")
            : translate(locale, "live.simkl.anime"),
        data.simkl.episode
          ? translate(locale, "live.simkl.episode", {
              episode: data.simkl.episode,
            })
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      status: active
        ? translate(locale, "live.simkl.now")
        : translate(locale, "live.simkl.recent"),
      image: data.simkl.posterUrl,
      url: data.simkl.externalUrl,
      observedAt: data.simkl.observedAt,
    };
  if (provider === "steam" && data.steam)
    return {
      title: data.steam.game ?? translate(locale, "live.steam.fallback"),
      subtitle: [
        active
          ? translate(locale, "live.steam.pause")
          : translate(locale, "live.steam.recentDescription"),
        data.steam.totalPlaytimeMinutes !== undefined
          ? translate(locale, "live.steam.playtime", {
              hours: new Intl.NumberFormat(
                locale === "pt-BR" ? "pt-BR" : "en-US",
                { maximumFractionDigits: 1 },
              ).format(data.steam.totalPlaytimeMinutes / 60),
            })
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      status: active
        ? translate(locale, "live.steam.now")
        : translate(locale, "live.steam.recent"),
      image: data.steam.imageUrl,
      cover: data.steam.coverUrl,
      url: data.steam.externalUrl,
      observedAt: data.steam.observedAt,
    };
  return undefined;
}
function displayTime(locale: Locale, value: string) {
  return formatDate(locale, value, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function standbySignal(data: LiveActivityResponse) {
  const observations = [
    data.coding?.observedAt,
    data.spotify?.observedAt,
    data.simkl?.observedAt,
    data.steam?.observedAt,
  ].filter((value): value is string => Boolean(value));
  return observations.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function providerIdleState(
  state: LiveActivityResponse["providerStates"][Provider],
  idleLabel: DictionaryKey,
): DictionaryKey {
  if (state === "unconfigured") return "live.provider.offline";
  if (state === "unavailable") return "live.provider.unavailable";
  return idleLabel;
}

function StandbyPanel({
  data,
  now,
  locale,
}: {
  data: LiveActivityResponse;
  now: number;
  locale: Locale;
}) {
  const t = (key: DictionaryKey, values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const watchingStates = [data.providerStates.simkl, data.providerStates.steam];
  const watchingStatus = watchingStates.every(
    (state) => state === "unconfigured",
  )
    ? "live.provider.offline"
    : watchingStates.some(
          (state) => state !== "unconfigured" && state !== "unavailable",
        )
      ? "live.provider.idle"
      : "live.provider.unavailable";
  const latestSignal = standbySignal(data);
  const elapsedMinutes = latestSignal
    ? Math.max(0, Math.floor((now - Date.parse(latestSignal)) / 60000))
    : undefined;
  const signalLabel =
    elapsedMinutes === undefined
      ? t("live.standby.noPreviousSignal")
      : elapsedMinutes < 1
        ? t("live.signal.now")
        : t("live.signal.minutesAgo", {
            count: formatNumber(locale, elapsedMinutes),
          });
  const statuses: {
    icon: string;
    label: DictionaryKey;
    state: DictionaryKey;
  }[] = [
    {
      icon: "</>",
      label: "live.provider.code",
      state: providerIdleState(
        data.providerStates.coding,
        "live.provider.idle",
      ),
    },
    {
      icon: "♫",
      label: "live.provider.music",
      state: providerIdleState(
        data.providerStates.spotify,
        "live.provider.paused",
      ),
    },
    {
      icon: "▣",
      label: "live.provider.watching",
      state: watchingStatus,
    },
  ];

  return (
    <div className="live-standby" aria-live="polite">
      <div className="live-standby-content">
        <div className="live-standby-heading">
          <p className="live-standby-label">
            <span aria-hidden="true" className="live-standby-indicator" />
            {t("live.standby.label")}
          </p>
          <h3>{t("live.standby.title")}</h3>
          <p>{t("live.standby.description")}</p>
        </div>
        <div className="live-standby-statuses">
          {statuses.map((item) => (
            <div className="live-standby-status" key={item.label}>
              <span aria-hidden="true" className="live-standby-icon">
                {item.icon}
              </span>
              <span className="live-standby-service">
                <span>{t(item.label)}</span>
                <span className="live-standby-state">
                  <i aria-hidden="true" /> {t(item.state)}
                </span>
              </span>
              <span aria-hidden="true" className="live-standby-more">
                ···
              </span>
            </div>
          ))}
        </div>
        <p className="live-standby-signal">
          <span aria-hidden="true">▥</span>
          {t("live.standby.signal", { signal: signalLabel })}
        </p>
      </div>
      <span aria-hidden="true" className="live-standby-pattern" />
    </div>
  );
}

export function LiveActivitySection({ locale }: { locale: Locale }) {
  const t = (key: DictionaryKey, values?: Record<string, string | number>) =>
    translate(locale, key, values);
  const section = useRef<HTMLElement>(null);
  const [data, setData] = useState<LiveActivityResponse | null>(null);
  const [error, setError] = useState(false);
  const [clock, setClock] = useState(0);
  const endpoint = process.env.NEXT_PUBLIC_ACTIVITY_API_URL;
  useEffect(() => {
    if (!endpoint || !section.current) return;
    const controller = createActivityRefresh({
      load: async (signal) => {
        const response = await fetch(endpoint, {
          signal,
          credentials: "omit",
          cache: "no-cache",
        });
        if (!response.ok) throw Error("Activity unavailable");
        const result = parseLiveActivity(await response.json());
        if (!result) throw Error("Invalid activity response");
        return result;
      },
      onData: (result) => {
        setData(result);
        setError(false);
        setClock(Date.now());
      },
      onError: () => {
        setError(true);
        setClock(Date.now());
      },
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancel: (timer) => window.clearTimeout(timer as number),
    });
    let intersecting = false;
    const updateVisibility = () =>
      controller.setVisible(
        intersecting && document.visibilityState === "visible",
      );
    const observer = new IntersectionObserver((entries) => {
      intersecting = entries.some((entry) => entry.isIntersecting);
      updateVisibility();
    });
    observer.observe(section.current);
    document.addEventListener("visibilitychange", updateVisibility);
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => {
      controller.dispose();
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
      window.clearInterval(timer);
    };
  }, [endpoint]);
  const stale = data ? isActivityStale(data.generatedAt, clock) : false;
  const selection = data
    ? selectActivityCards(data, clock, stale)
    : { mode: "none" as const, providers: [] };
  const cards = data
    ? selection.providers.flatMap((provider) => {
        const info = details(provider, data, stale, clock, locale);
        return info ? [{ provider, info }] : [];
      })
    : [];
  const cardList = (
    <div className="live-cards">
      {cards.map(({ provider, info }, index) => (
        <Reveal
          key={provider}
          delay={index * 0.06}
          className="live-card-reveal"
        >
          <article
            className={`live-card live-${provider}${
              selection.mode === "recent" ? " is-recent" : ""
            }`}
          >
            <div className="live-card-heading">
              <span aria-hidden="true" className="live-symbol">
                {labels[provider].symbol}
              </span>
              <span className="tag">{t(labels[provider].category)}</span>
              <span className="live-provider">{labels[provider].title}</span>
            </div>
            <p className="live-status">{info.status}</p>
            <div className="live-card-content">
              {info.image && (
                <Image
                  src={info.image}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              <div>
                <h3>{info.title}</h3>
                {info.subtitle && <p>{info.subtitle}</p>}
              </div>
            </div>
            {info.observedAt && (
              <time className="live-observed" dateTime={info.observedAt}>
                {t("live.observedAt", {
                  date: displayTime(locale, info.observedAt),
                })}
              </time>
            )}
            {info.url && (
              <a href={info.url} target="_blank" rel="noopener noreferrer">
                {t("live.openProvider", { provider: labels[provider].title })} ↗
              </a>
            )}
          </article>
        </Reveal>
      ))}
    </div>
  );
  return (
    <section ref={section} id="agora" className="chapter live-activity">
      <div className="section-label">
        <span>07 / {t("live.chapter")}</span>
        <span>HUGO.DEV ↙</span>
      </div>
      <Reveal>
        <h2>
          {t("live.title.firstLine")}
          <br />
          <em>{t("live.title.secondLine")}</em>
        </h2>
      </Reveal>
      <div className="live-activity-heading">
        <p className="intro">{t("live.intro")}</p>
        <p className={`live-update${stale ? " stale" : ""}`} aria-live="polite">
          {data ? (
            <>
              <span>{stale ? t("live.stale") : t("live.updated")}</span>
              <time dateTime={data.generatedAt}>
                {displayTime(locale, data.generatedAt)}
              </time>
            </>
          ) : endpoint ? (
            error ? (
              t("live.error")
            ) : (
              t("live.loading")
            )
          ) : (
            t("live.disconnected")
          )}
          {error && data && <small>{t("live.error.previousData")}</small>}
        </p>
      </div>
      {data && cards.length && selection.mode === "active" ? (
        cardList
      ) : data ? (
        <>
          <StandbyPanel data={data} now={clock} locale={locale} />
          {cards.length > 0 && (
            <div className="live-recent">
              <h3 className="live-recent-title">{t("live.recent.title")}</h3>
              {cardList}
            </div>
          )}
        </>
      ) : error || !endpoint ? (
        <p className="live-fallback">{t("live.empty")}</p>
      ) : null}
      <p className="footnote">{t("live.footnote")}</p>
    </section>
  );
}
