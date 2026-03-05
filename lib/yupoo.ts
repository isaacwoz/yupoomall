export const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

export interface Category {
  id: string;
  name: string;
  parentId?: string;
}

export interface Album {
  id: string;
  title: string;
  cover: string;
  link: string;
  photoCount: string;
  categoryId: string;
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&yen;/gi, "¥")
    .replace(/&#165;/g, "¥")
    .replace(/&#xa5;/gi, "¥")
    .replace(/&#xffe5;/gi, "￥")
    .replace(/&#65509;/g, "￥");
}

export function ensureHttps(url: string): string {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

export async function fetchPage(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

export function parseCategoriesFromHtml(html: string): Category[] {
  const categories: Category[] = [];
  const seen = new Set<string>();

  // Pattern 1: Stores with collapsible parent/child sidebar (showheader__link)
  const parentRegex = /showheader__link"\s+href="\/categories\/(\d+)">\s*([^<]+)/g;
  let match;
  while ((match = parentRegex.exec(html)) !== null) {
    const id = match[1];
    const name = decodeHtmlEntities(match[2].trim());
    if (!seen.has(id)) {
      seen.add(id);
      categories.push({ id, name });
    }
  }

  const childSectionRegex = /id="child_category_(\d+)"([\s\S]*?)(?=<\/ul>)/g;
  while ((match = childSectionRegex.exec(html)) !== null) {
    const parentId = match[1];
    const section = match[2];
    const childRegex = /showheader__child_link"\s+href="\/categories\/(\d+)\?[^"]*">\s*([^<]+)/g;
    let childMatch;
    while ((childMatch = childRegex.exec(section)) !== null) {
      const id = childMatch[1];
      const name = decodeHtmlEntities(childMatch[2].trim());
      if (!seen.has(id)) {
        seen.add(id);
        categories.push({ id, name, parentId });
      }
    }
  }

  // Pattern 2: Sidebar with <a href="/categories/ID"> + <li>Name</li> on next line
  if (categories.length === 0) {
    const sidebarRegex = /href="\/categories\/(\d+)">\s*<li[^>]*>\s*([^<]+)/g;
    while ((match = sidebarRegex.exec(html)) !== null) {
      const id = match[1];
      const name = decodeHtmlEntities(match[2].trim());
      if (!seen.has(id) && name.length > 0 && id !== "0") {
        seen.add(id);
        categories.push({ id, name });
      }
    }
  }

  // Pattern 3: show-layout-category (collections-based layout)
  if (categories.length === 0) {
    const collectionsRegex = /show-layout-category__catetitle"\s+title="([^"]*)"\s+href="\/collections\/(\d+)"/g;
    while ((match = collectionsRegex.exec(html)) !== null) {
      const name = decodeHtmlEntities(match[1].trim());
      const id = match[2];
      if (!seen.has(id) && name.length > 0 && id !== "0") {
        seen.add(id);
        categories.push({ id, name });
      }
    }
  }

  // Pattern 4: Generic fallback — any /categories/ or /collections/ link with inline text
  if (categories.length === 0) {
    const genericRegex = /href="\/(?:categories|collections)\/(\d+)(?:\?[^"]*)?"\s*[^>]*>\s*([^<]+)/g;
    while ((match = genericRegex.exec(html)) !== null) {
      const id = match[1];
      const name = decodeHtmlEntities(match[2].trim());
      if (!seen.has(id) && name.length > 0 && id !== "0") {
        seen.add(id);
        categories.push({ id, name });
      }
    }
  }

  return categories;
}

export function parseAlbumsFromHtml(html: string, origin: string): Album[] {
  const albums: Album[] = [];
  const parts = html.split(/class="album3?__main"/);

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];

    const dataIdMatch = chunk.match(/data-album-id="(\d+)-(\d+)"/);
    const categoryId = dataIdMatch ? dataIdMatch[1] : "";
    const albumIdFromData = dataIdMatch ? dataIdMatch[2] : "";

    const titleMatch = chunk.match(/title="([^"]*)"/);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : "";

    const hrefMatch = chunk.match(/href="([^"]*)"/);
    const href = hrefMatch ? hrefMatch[1] : "";

    const idMatch = href.match(/\/albums\/(\d+)/);
    const albumId = albumIdFromData || (idMatch ? idMatch[1] : "");

    const originSrcMatch = chunk.match(/data-origin-src="([^"]+)"/);
    const srcMatch = chunk.match(
      /src="(https?:\/\/photo\.yupoo\.com\/[^"]+)"/
    );
    const cover = ensureHttps(
      originSrcMatch ? originSrcMatch[1] : srcMatch ? srcMatch[1] : ""
    );

    const countMatch = chunk.match(
      /album__photonumber[^>]*>(\d+)<|(\d+)\s*photos?/i
    );
    const photoCount = countMatch
      ? (countMatch[1] || countMatch[2]) + " photos"
      : "";

    if (albumId) {
      albums.push({
        id: albumId,
        title: title || "Untitled",
        cover,
        link: origin + href,
        photoCount,
        categoryId,
      });
    }
  }

  return albums;
}

export function parsePagination(html: string): number {
  const match = html.match(/name="page"[^>]*max="(\d+)"/);
  return match ? parseInt(match[1], 10) : 1;
}

export function parseStoreName(html: string): string {
  const ownerMatch = html.match(/window\.OWNER\s*=\s*'([^']*)'/);
  if (ownerMatch) return ownerMatch[1];
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/);
  if (titleMatch) {
    const parts = titleMatch[1].split("|");
    if (parts.length >= 2) return parts[1].trim();
    return parts[0].trim();
  }
  return "Unknown Store";
}

export function normalizeHost(store: string): string {
  try {
    const url = new URL(store.startsWith("http") ? store : "https://" + store);
    return url.host;
  } catch {
    return store.includes(".") ? store : `${store}.x.yupoo.com`;
  }
}
