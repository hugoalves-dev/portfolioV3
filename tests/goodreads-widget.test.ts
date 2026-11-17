import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  goodreadsWidgetUrl,
  parseGoodreadsWidget,
} from "../lib/goodreads-widget.ts";
import { normalizeReadingLog } from "../lib/reading-log.ts";

const fixture = await readFile(
  new URL("./fixtures/goodreads-widget-read.txt", import.meta.url),
  "utf8",
);

test("parses books from the Goodreads shelf widget script", () => {
  assert.deepEqual(parseGoodreadsWidget(fixture), [
    {
      guid: "https://www.goodreads.com/review/show/9009930357",
      title: "[Oshi No Ko], Vol. 1",
      author: "Aka Akasaka",
      bookLink: "https://www.goodreads.com/review/show/9009930357",
      imageLink:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1692311429l/61991445.jpg",
    },
    {
      guid: "https://www.goodreads.com/review/show/7567613173",
      title: "Throne of Glass",
      author: "Sarah J. Maas",
      bookLink: "https://www.goodreads.com/review/show/7567613173",
      imageLink:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1673566495l/76703559.jpg",
    },
  ]);
});

test("keeps widget order for finished books without read dates", () => {
  const snapshot = normalizeReadingLog(
    { currentlyReading: [], read: parseGoodreadsWidget(fixture), toRead: [] },
    "2026-11-17T00:00:00.000Z",
  );
  assert.deepEqual(
    snapshot.recentlyFinished.map((book) => book.title),
    ["[Oshi No Ko], Vol. 1", "Throne of Glass"],
  );
  assert.equal(snapshot.recentlyFinished[0].finishedAt, undefined);
});

test("rejects responses that are not a Goodreads widget", () => {
  assert.throws(() => parseGoodreadsWidget("Page not found"));
});

test("rejects widget markup it can no longer read instead of emptying shelves", () => {
  const broken = fixture.replace(/gr_custom_title_/g, "gr_renamed_title_");
  assert.throws(() => parseGoodreadsWidget(broken), /markup changed/);
});

test("parses an empty shelf as no books", () => {
  const empty = fixture.replace(
    /<div class=\\"gr_custom_each_container[\s\S]*?(?= {2}<br)/,
    "",
  );
  assert.deepEqual(parseGoodreadsWidget(empty), []);
});

test("builds widget URLs with a cache-busting widget id", () => {
  const url = new URL(
    goodreadsWidgetUrl("164676427", "read", {
      numBooks: 10,
      sort: "date_read",
      widgetId: 42,
    }),
  );
  assert.equal(url.pathname, "/review/custom_widget/164676427");
  assert.equal(url.searchParams.get("shelf"), "read");
  assert.equal(url.searchParams.get("sort"), "date_read");
  assert.equal(url.searchParams.get("widget_id"), "42");
});
