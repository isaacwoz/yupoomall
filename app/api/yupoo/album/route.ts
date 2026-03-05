import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

interface PhotoEntry {
  id: number;
  path: string;
  name: string;
  type: string;
  attribute?: { width?: number; height?: number; type?: string };
}

export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get("host");
  const albumId = req.nextUrl.searchParams.get("albumId");

  if (!host || !albumId) {
    return NextResponse.json(
      { error: "Missing host or albumId parameter" },
      { status: 400 }
    );
  }

  try {
    const apiUrl = `https://${host}/api/web/albums/${albumId}/show?uid=1&password=`;

    const resp = await fetch(apiUrl, {
      headers: { ...HEADERS, Referer: `https://${host}/` },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const json = await resp.json();
    const data = json.data;

    if (!data || !data.list) {
      return NextResponse.json({ photos: [], title: "" });
    }

    const photos = data.list
      .filter((p: PhotoEntry) => p.type === "photo")
      .map((p: PhotoEntry) => ({
        id: p.id,
        url: `https://photo.yupoo.com${p.path}`,
        name: p.name,
        width: p.attribute?.width || 0,
        height: p.attribute?.height || 0,
      }));

    const albumInfo = data.albumInfo || {};

    return NextResponse.json({
      photos,
      title: albumInfo.name || "",
      description: albumInfo.description || "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
