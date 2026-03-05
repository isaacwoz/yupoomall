import { NextRequest, NextResponse } from "next/server";
import {
  fetchPage,
  parseAlbumsFromHtml,
  parsePagination,
  normalizeHost,
} from "@/lib/yupoo";

export async function GET(req: NextRequest) {
  const store = req.nextUrl.searchParams.get("store");
  const category = req.nextUrl.searchParams.get("category");
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);

  if (!store) {
    return NextResponse.json(
      { error: "Missing store parameter" },
      { status: 400 }
    );
  }

  try {
    const host = normalizeHost(store);
    const origin = `https://${host}`;

    let url: string;
    if (category) {
      url = `${origin}/categories/${category}?page=${page}`;
    } else {
      url = `${origin}/albums?page=${page}`;
    }

    const html = await fetchPage(url);
    const albums = parseAlbumsFromHtml(html, origin);
    const totalPages = parsePagination(html);

    // Stamp categoryId on albums from category pages (they lack data-album-id)
    if (category) {
      for (const a of albums) {
        if (!a.categoryId) a.categoryId = category;
      }
    }

    return NextResponse.json({
      albums,
      page,
      totalPages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
