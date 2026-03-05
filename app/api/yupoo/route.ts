import { NextRequest, NextResponse } from "next/server";
import {
  fetchPage,
  parseCategoriesFromHtml,
  parseStoreName,
  normalizeHost,
} from "@/lib/yupoo";

export async function GET(req: NextRequest) {
  const store = req.nextUrl.searchParams.get("store");
  if (!store) {
    return NextResponse.json(
      { error: "Missing store parameter" },
      { status: 400 }
    );
  }

  try {
    const host = normalizeHost(store);
    const origin = `https://${host}`;

    // Fetch albums page to get store name + category sidebar
    const html = await fetchPage(`${origin}/albums`);
    const storeName = parseStoreName(html);
    const categories = parseCategoriesFromHtml(html);

    return NextResponse.json({
      storeName,
      storeUrl: origin,
      categories,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
