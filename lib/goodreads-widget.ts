export type GoodreadsWidgetRow = {
  guid: string;
  title: string;
  author: string;
  bookLink: string;
  imageLink?: string;
};

export function goodreadsWidgetUrl(
  userId: string,
  shelf: string,
  options: { numBooks: number; sort: string; widgetId: number },
): string {
  const url = new URL(
    `https://www.goodreads.com/review/custom_widget/${encodeURIComponent(userId)}`,
  );
  url.search = new URLSearchParams({
    shelf,
    num_books: String(options.numBooks),
    format: "html",
    sort: options.sort,
    order: "d",
    show_author: "1",
    show_cover: "1",
    // Goodreads caches widget output per widget_id; a fresh id avoids stale shelves.
    widget_id: String(options.widgetId),
  }).toString();
  return url.href;
}

function unescapeJsString(value: string): string {
  return value.replace(/\\(.)/g, (_, char: string) =>
    char === "n" ? "\n" : char,
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripQuery(href: string): string {
  return decodeEntities(href).split("?")[0];
}

export function parseGoodreadsWidget(script: string): GoodreadsWidgetRow[] {
  const code = script.match(
    /var widget_code = '([\s\S]*?)'\s*\n\s*var widget_div/,
  );
  if (!code?.[1].includes("gr_custom_container_"))
    throw new Error("Unexpected Goodreads widget response");

  const html = unescapeJsString(code[1]);
  const blocks = html
    .split(/<div class="gr_custom_each_container_\d+">/)
    .slice(1);

  const rows = blocks.flatMap((block): GoodreadsWidgetRow[] => {
    const title = block.match(
      /class="gr_custom_title_\d+">\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/,
    );
    if (!title) return [];
    const author = block.match(
      /class="gr_custom_author_\d+">\s*by\s*<a[^>]*>([^<]+)<\/a>/,
    );
    const cover = block.match(
      /class="gr_custom_book_container_\d+">[\s\S]*?<img[^>]*src="([^"]+)"/,
    );
    const bookLink = stripQuery(title[1]);
    return [
      {
        guid: bookLink,
        title: decodeEntities(title[2]),
        author: author ? decodeEntities(author[1]) : "",
        bookLink,
        ...(cover
          ? {
              imageLink: stripQuery(cover[1]).replace(
                /\._[A-Z0-9]+_(?=\.)/,
                "",
              ),
            }
          : {}),
      },
    ];
  });

  if (blocks.length && !rows.length)
    throw new Error("Goodreads widget markup changed; no books parsed");
  return rows;
}
