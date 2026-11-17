import { rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  goodreadsWidgetUrl,
  parseGoodreadsWidget,
} from "../lib/goodreads-widget.ts";
import { normalizeReadingLog } from "../lib/reading-log.ts";

const output = fileURLToPath(
  new URL("../public/reading-log.json", import.meta.url),
);
const temporary = `${output}.${process.pid}.tmp`;
const userId = "164676427";

async function fetchShelf(shelf: string, sort: string) {
  const url = goodreadsWidgetUrl(userId, shelf, {
    numBooks: 10,
    sort,
    widgetId: Math.floor(Math.random() * 1_000_000),
  });
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    throw new Error(`Shelf "${shelf}" returned HTTP ${response.status}`);
  return parseGoodreadsWidget(await response.text());
}

try {
  const [currentlyReading, read, toRead] = await Promise.all([
    fetchShelf("currently-reading", "date_added"),
    fetchShelf("read", "date_read"),
    fetchShelf("to-read", "date_added"),
  ]);
  const snapshot = normalizeReadingLog(
    { currentlyReading, read, toRead },
    new Date().toISOString(),
  );
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(temporary, output);
  console.log(
    `Updated Goodreads reading log: ${snapshot.currentlyReading.length} currently reading, ${snapshot.recentlyFinished.length} recently finished, ${snapshot.toRead.length} to read.`,
  );
} catch (error) {
  await rm(temporary, { force: true }).catch(() => {});
  const message = `Goodreads reading log unavailable; keeping the committed snapshot. ${error instanceof Error ? error.message : "Invalid response"}`;
  console.warn(process.env.GITHUB_ACTIONS ? `::warning::${message}` : message);
}
