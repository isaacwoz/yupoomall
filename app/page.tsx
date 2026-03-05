"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { matchBrand } from "@/lib/matchBrand";

import dynamic from "next/dynamic";
import BlurText from "@/components/BlurText";
import SplitText from "@/components/SplitText";
import Magnet from "@/components/Magnet";
import CountUp from "@/components/CountUp";
import TiltCard from "@/components/TiltCard";
import Squares from "@/components/Squares";
import AnimatedItem from "@/components/AnimatedItem";

const Silk = dynamic(() => import("@/components/Silk"), { ssr: false });


// ── Types ──────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  parentId?: string;
}

interface Album {
  id: string;
  title: string;
  cover: string;
  link: string;
  photoCount: string;
  categoryId: string;
}

interface StoreInfo {
  storeName: string;
  storeUrl: string;
  categories: Category[];
}

interface Photo {
  id: number;
  url: string;
  name: string;
  width: number;
  height: number;
}

interface WishlistItem {
  albumId: string;
  albumName: string;
  coverUrl: string;
  storeName: string;
  yupooUrl: string;
}

// ── Helpers ────────────────────────────────────────────

function extractPrice(title: string): number | null {
  // Normalize all yen/yuan symbol variants + HTML entities to ¥
  const normalized = title
    .replace(/[\uFFE5\u00A5\uFE69\uFF04]/g, "¥")
    .replace(/&yen;/gi, "¥")
    .replace(/&#165;/g, "¥")
    .replace(/&#xa5;/gi, "¥")
    .replace(/&#xffe5;/gi, "¥")
    .replace(/&#65509;/g, "¥");
  const patterns = [
    /¥\s*(\d+(?:\.\d+)?)/,              // ¥158
    /(\d+(?:\.\d+)?)\s*¥/,              // 489¥
    /(\d+(?:\.\d+)?)\s*(?:CNY|RMB|yuan|元)/i,  // 100CNY, 100RMB
    /(?:CNY|RMB|yuan|元)\s*(\d+(?:\.\d+)?)/i,  // CNY100, RMB100
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const val = parseFloat(match[1]);
      if (val > 0 && val < 100000) return val;
    }
  }
  return null;
}

function normalizeForSearch(str: string): string {
  return str
    .replace(/\p{Emoji}/gu, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .trim();
}

function firstLetter(str: string): string {
  const normalized = normalizeForSearch(str);
  const ch = normalized.charAt(0);
  if (ch >= "a" && ch <= "z") return ch.toUpperCase();
  if (ch >= "0" && ch <= "9") return "#";
  return "?";
}

function extractStoreName(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : "https://" + trimmed);
    return url.host.replace(".x.yupoo.com", "").replace(".yupoo.com", "");
  } catch {
    return trimmed;
  }
}

function proxyUrl(url: string): string {
  if (!url) return "";
  return "/api/image-proxy?url=" + encodeURIComponent(url);
}

// ── Main Component ─────────────────────────────────────

export default function Home() {
  const [urlText, setUrlText] = useState("");
  const [loading, setLoading] = useState(false);

  // Store state
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loadErrors, setLoadErrors] = useState<{ error: string; url: string }[]>([]);
  const [activeStoreIdx, setActiveStoreIdx] = useState<number>(0);

  // Category state
  const [categoryPerStore, setCategoryPerStore] = useState<Record<number, string | null>>({});
  const [categorySearch, setCategorySearch] = useState("");

  // Albums state
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [albumsPage, setAlbumsPage] = useState(1);
  const [albumsTotalPages, setAlbumsTotalPages] = useState(1);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxAlbum, setLightboxAlbum] = useState<{
    title: string;
    link: string;
    host: string;
    albumId: string;
  } | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<Photo[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxLoading, setLightboxLoading] = useState(false);

  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    try {
      return (localStorage.getItem("yupoomall-theme") as "dark" | "light") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    try { localStorage.setItem("yupoomall-theme", theme); } catch {}
  }, [theme]);

  const isDark = theme === "dark";

  // Wishlist state
  const [wishlist, setWishlist] = useState<WishlistItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("yupoomall-wishlist");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [cnyToGbp, setCnyToGbp] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("yupoomall-wishlist", JSON.stringify(wishlist));
    } catch {}
  }, [wishlist]);

  // Fetch CNY→GBP rate once
  useEffect(() => {
    if (cnyToGbp !== null) return;
    fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json")
      .then((r) => r.json())
      .then((data) => {
        const rate = data?.cny?.gbp;
        if (typeof rate === "number") setCnyToGbp(rate);
      })
      .catch(() => {});
  }, [cnyToGbp]);

  const wishlistIds = useMemo(() => new Set(wishlist.map((w) => w.albumId)), [wishlist]);

  const toggleWishlist = useCallback((album: Album, storeName: string) => {
    setWishlist((prev) => {
      const exists = prev.some((w) => w.albumId === album.id);
      if (exists) return prev.filter((w) => w.albumId !== album.id);
      return [
        ...prev,
        {
          albumId: album.id,
          albumName: album.title,
          coverUrl: album.cover,
          storeName,
          yupooUrl: album.link,
        },
      ];
    });
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parseUrls = useCallback((): string[] => {
    return urlText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.includes("yupoo"));
  }, [urlText]);

  // Fetch albums for a given store + category + page
  const fetchAlbums = useCallback(
    async (storeUrl: string, categoryId: string | null, page: number, append: boolean) => {
      setAlbumsLoading(true);
      try {
        let url = `/api/yupoo/albums?store=${encodeURIComponent(storeUrl)}&page=${page}`;
        if (categoryId) url += `&category=${encodeURIComponent(categoryId)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        setAlbums((prev) => (append ? [...prev, ...data.albums] : data.albums));
        setAlbumsPage(data.page);
        setAlbumsTotalPages(data.totalPages);
      } catch {}
      setAlbumsLoading(false);
    },
    []
  );

  // Fetch all albums for a top-level category (parent + children)
  const fetchCategoryAlbums = useCallback(
    async (storeUrl: string, categoryIds: string[]) => {
      setAlbumsLoading(true);
      setAlbums([]);
      setAlbumsPage(1);
      setAlbumsTotalPages(1);
      try {
        const firstPages = await Promise.all(
          categoryIds.map(async (id) => {
            const resp = await fetch(
              `/api/yupoo/albums?store=${encodeURIComponent(storeUrl)}&category=${id}&page=1`
            );
            if (!resp.ok) return { albums: [] as Album[], totalPages: 1 };
            return resp.json() as Promise<{ albums: Album[]; totalPages: number }>;
          })
        );
        let allAlbums: Album[] = firstPages.flatMap((p) => p.albums);
        const remainingFetches: Promise<{ albums: Album[] }>[] = [];
        for (let i = 0; i < firstPages.length; i++) {
          for (let p = 2; p <= firstPages[i].totalPages; p++) {
            remainingFetches.push(
              fetch(
                `/api/yupoo/albums?store=${encodeURIComponent(storeUrl)}&category=${categoryIds[i]}&page=${p}`
              ).then((r) => (r.ok ? r.json() : { albums: [] }))
            );
          }
        }
        if (remainingFetches.length > 0) {
          const remaining = await Promise.all(remainingFetches);
          allAlbums = allAlbums.concat(remaining.flatMap((p) => p.albums));
        }
        const seen = new Set<string>();
        allAlbums = allAlbums.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
        setAlbums(allAlbums);
      } catch {}
      setAlbumsLoading(false);
    },
    []
  );

  const activeStore = stores[activeStoreIdx] ?? null;
  const activeCategory = categoryPerStore[activeStoreIdx] ?? null;

  const activeCategories = useMemo(() => {
    if (!activeStore) return [];
    return activeStore.categories.filter((c) => !c.parentId);
  }, [activeStore]);

  const childrenMap = useMemo(() => {
    if (!activeStore) return {} as Record<string, Category[]>;
    const map: Record<string, Category[]> = {};
    for (const cat of activeStore.categories) {
      if (cat.parentId) {
        if (!map[cat.parentId]) map[cat.parentId] = [];
        map[cat.parentId].push(cat);
      }
    }
    return map;
  }, [activeStore]);

  useEffect(() => {
    if (!activeStore) return;
    if (activeCategory === null) {
      fetchAlbums(activeStore.storeUrl, null, 1, false);
    } else {
      const children = childrenMap[activeCategory] ?? [];
      const ids = [activeCategory, ...children.map((c) => c.id)];
      fetchCategoryAlbums(activeStore.storeUrl, ids);
    }
  }, [activeStore, activeCategory, childrenMap, fetchAlbums, fetchCategoryAlbums]);

  const brandLabels = useMemo(() => {
    const map: Record<string, { brand: string; confident: boolean } | null> = {};
    for (const cat of activeCategories) {
      map[cat.id] = matchBrand(cat.name);
    }
    return map;
  }, [activeCategories]);

  const groupedCategories = useMemo(() => {
    const searchNorm = normalizeForSearch(categorySearch);
    const filtered = searchNorm
      ? activeCategories.filter((cat) => normalizeForSearch(cat.name).includes(searchNorm))
      : activeCategories;
    const sorted = [...filtered].sort((a, b) =>
      normalizeForSearch(a.name).localeCompare(normalizeForSearch(b.name))
    );
    const groups: { letter: string; cats: Category[] }[] = [];
    let currentLetter = "";
    for (const cat of sorted) {
      const letter = firstLetter(cat.name);
      if (letter !== currentLetter) {
        currentLetter = letter;
        groups.push({ letter, cats: [] });
      }
      groups[groups.length - 1].cats.push(cat);
    }
    return groups;
  }, [activeCategories, categorySearch]);

  const loadStores = useCallback(async (urls: string[]) => {
    if (urls.length === 0) return;
    setLoading(true);
    setStores([]);
    setLoadErrors([]);
    setAlbums([]);
    setAlbumsPage(1);
    setAlbumsTotalPages(1);
    setCategoryPerStore({});
    setCategorySearch("");
    setActiveStoreIdx(0);
    const loadedStores: StoreInfo[] = [];
    const errors: { error: string; url: string }[] = [];
    const promises = urls.map(async (url) => {
      try {
        const resp = await fetch("/api/yupoo?store=" + encodeURIComponent(url));
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          errors.push({ error: data.error || `HTTP ${resp.status}`, url });
        } else {
          const store: StoreInfo = await resp.json();
          loadedStores.push(store);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed";
        errors.push({ error: message, url });
      }
    });
    await Promise.all(promises);
    setStores(loadedStores);
    setLoadErrors(errors);
    setLoading(false);
    setShowResults(true);
    // Persist successfully loaded store URLs
    if (loadedStores.length > 0) {
      try {
        const savedUrls = loadedStores.map((s) => s.storeUrl);
        localStorage.setItem("yupoomall-stores", JSON.stringify(savedUrls));
      } catch {}
    }
  }, []);

  const handleLoad = useCallback(() => {
    loadStores(parseUrls());
  }, [parseUrls, loadStores]);

  // Restore stores on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yupoomall-stores");
      if (saved) {
        const urls: string[] = JSON.parse(saved);
        if (urls.length > 0) {
          setUrlText(urls.join("\n"));
          loadStores(urls);
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchStore = useCallback((idx: number) => {
    setActiveStoreIdx(idx);
    setAlbums([]);
    setAlbumsPage(1);
    setAlbumsTotalPages(1);
    setCategorySearch("");
  }, []);

  const switchCategory = useCallback((storeIdx: number, categoryId: string | null) => {
    setCategoryPerStore((prev) => ({ ...prev, [storeIdx]: categoryId }));
    setAlbums([]);
    setAlbumsPage(1);
    setAlbumsTotalPages(1);
  }, []);

  const loadMore = useCallback(() => {
    if (!activeStore || albumsLoading || albumsPage >= albumsTotalPages || activeCategory !== null)
      return;
    fetchAlbums(activeStore.storeUrl, null, albumsPage + 1, true);
  }, [activeStore, activeCategory, albumsPage, albumsTotalPages, albumsLoading, fetchAlbums]);

  const openLightbox = useCallback(async (album: Album, storeUrl: string) => {
    const host = new URL(storeUrl).host;
    setLightboxAlbum({ title: album.title, link: album.link, host, albumId: album.id });
    setLightboxPhotos([]);
    setLightboxIndex(0);
    setLightboxOpen(true);
    setLightboxLoading(true);
    try {
      const resp = await fetch(
        `/api/yupoo/album?host=${encodeURIComponent(host)}&albumId=${album.id}`
      );
      if (resp.ok) {
        const data = await resp.json();
        setLightboxPhotos(data.photos || []);
      }
    } catch {}
    setLightboxLoading(false);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => Math.min(lightboxPhotos.length - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, lightboxPhotos.length]);

  useEffect(() => {
    document.body.style.overflow = lightboxOpen || wishlistOpen ? "hidden" : "";
  }, [lightboxOpen, wishlistOpen]);

  const [showResults, setShowResults] = useState(false);
  const hasResults = showResults && (stores.length > 0 || loadErrors.length > 0);
  const urlCount = parseUrls().length;
  const totalFilteredCats = groupedCategories.reduce((sum, g) => sum + g.cats.length, 0);

  // Wishlist grouped by store (for sidebar)
  const wishlistGrouped = useMemo(() => {
    const grouped: Record<string, WishlistItem[]> = {};
    for (const item of wishlist) {
      if (!grouped[item.storeName]) grouped[item.storeName] = [];
      grouped[item.storeName].push(item);
    }
    return grouped;
  }, [wishlist]);

  return (
    <div className="min-h-screen relative">

      {/* ─── Fixed Header (visible when stores loaded) ─── */}
      <AnimatePresence>
        {hasResults && !loading && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed top-0 left-0 right-0 z-30 h-14 backdrop-blur-xl bg-[var(--bg)]/70 border-b border-[var(--border)] transition-colors duration-300"
          >
            <div className="h-full max-w-[2000px] mx-auto px-6 flex items-center justify-between">
              {/* Left: Logo */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold tracking-tight text-[var(--text)]">YUPOOMALL</span>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors ml-1"
                >
                  NEW SEARCH
                </button>
              </div>

              {/* Center: Store tabs */}
              <div className="flex-1 min-w-0 mx-4 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-1.5 w-max mx-auto">
                  {stores.map((store, idx) => (
                    <button
                      key={idx}
                      onClick={() => switchStore(idx)}
                      className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        activeStoreIdx === idx
                          ? "bg-[var(--accent)] text-white shadow-[0_0_15px_var(--accent-glow-strong)]"
                          : "bg-[var(--text)]/[0.04] text-[var(--text-secondary)] hover:bg-[var(--text)]/[0.08] hover:text-[var(--text)]"
                      }`}
                    >
                      {store.storeName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Theme toggle + Wishlist */}
              <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--text)]/[0.06] transition-all"
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setWishlistOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--text)]/[0.04] text-[var(--text-secondary)] hover:bg-[var(--text)]/[0.08] hover:text-[var(--text)] transition-all"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={wishlist.length > 0 ? "var(--wishlist)" : "none"}
                  stroke={wishlist.length > 0 ? "var(--wishlist)" : "currentColor"}
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
                {wishlist.length > 0 && (
                  <span className="min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-[var(--wishlist)] text-white text-[10px] font-bold px-1">
                    <CountUp to={wishlist.length} duration={0.5} />
                  </span>
                )}
              </button>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ─── Landing Screen ─── */}
      {!hasResults && !loading && (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Theme toggle (landing) */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="absolute top-5 right-5 z-20 p-2.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--text)]/[0.06] transition-all"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
          {/* Squares background */}
          <div className="absolute inset-0 opacity-[0.15]">
            <Squares
              direction="diagonal"
              speed={0.3}
              borderColor={isDark ? "#333" : "#ccc"}
              squareSize={48}
              hoverFillColor={isDark ? "#1a1a1a" : "#e0e0e0"}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 w-full max-w-lg px-6 text-center">
            <div className="mb-8">
              <BlurText
                text="Your Reps. One Place."
                className="text-5xl font-extrabold tracking-tight text-[var(--text)] justify-center"
                delay={80}
                animateBy="words"
                direction="top"
              />
            </div>

            <p className="text-[var(--text-secondary)] text-base mb-10 leading-relaxed">
              Paste your Yupoo store links below to browse<br />
              every product in one premium storefront.
            </p>

            <div className="space-y-4">
              <textarea
                ref={textareaRef}
                value={urlText}
                onChange={(e) => setUrlText(e.target.value)}
                placeholder={"Paste Yupoo links, one per line...\ne.g. suzaku1.x.yupoo.com\n     o-m-g.x.yupoo.com"}
                rows={4}
                className="input-glow w-full bg-[var(--text)]/[0.03] border border-[var(--border)] rounded-xl px-5 py-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    e.preventDefault();
                    handleLoad();
                  }
                }}
              />

              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-xs text-[var(--text-muted)]">
                  {urlCount} store{urlCount !== 1 ? "s" : ""} detected
                </span>
                <span className="text-xs text-[var(--text-muted)] opacity-50">
                  {"\u2318"}+Enter
                </span>
              </div>

              <Magnet padding={80} magnetStrength={3}>
                <button
                  onClick={handleLoad}
                  disabled={urlCount === 0}
                  className="group relative w-full py-3.5 rounded-xl font-semibold text-sm text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all overflow-hidden"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-[var(--accent)] to-[#6366f1] transition-opacity duration-300" />
                  <span className="absolute inset-0 bg-gradient-to-r from-[var(--accent-hover)] to-[#4f46e5] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="absolute inset-0 shadow-[0_0_30px_var(--accent-glow)] group-hover:shadow-[0_0_50px_var(--accent-glow-strong)] transition-shadow duration-300" />
                  <span className="relative">
                    Load {urlCount} Store{urlCount !== 1 ? "s" : ""}
                  </span>
                </button>
              </Magnet>
            </div>
          </div>
        </div>
      )}

      {/* ─── Loading overlay ─── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]/95 backdrop-blur-sm"
          >
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-[var(--text-secondary)]">
                Loading {urlCount} store{urlCount !== 1 ? "s" : ""}...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Results View ─── */}
      {hasResults && !loading && (
        <main className="min-h-screen flex pt-14">
          {/* ── Category Sidebar ── */}
          {activeStore && activeCategories.length > 0 && (
            <aside className="w-60 shrink-0 fixed top-14 left-0 h-[calc(100vh-3.5rem)] bg-[var(--bg)] border-r border-[var(--border)] flex flex-col z-20">
              {/* Search */}
              <div className="px-3 py-3">
                <div className="relative">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Filter categories..."
                    className="input-glow w-full bg-[var(--text)]/[0.03] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                  {categorySearch && (
                    <button
                      onClick={() => setCategorySearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                {categorySearch && (
                  <div className="text-[10px] text-[var(--text-muted)] mt-1.5 px-0.5">
                    {totalFilteredCats} of {activeCategories.length}
                  </div>
                )}
              </div>

              {/* "All" */}
              <div className="px-2">
                <button
                  onClick={() => switchCategory(activeStoreIdx, null)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeCategory === null
                      ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                      : "text-[var(--text-secondary)] hover:bg-[var(--text)]/[0.04] hover:text-[var(--text)]"
                  }`}
                >
                  All Categories
                </button>
              </div>

              {/* Category list */}
              <div className="flex-1 overflow-y-auto px-2 pb-4 mt-1">
                {groupedCategories.map((group) => (
                  <div key={group.letter} className="mt-3">
                    <AnimatedItem delay={0}>
                      <div className="px-3 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                        {group.letter}
                      </div>
                    </AnimatedItem>
                    {group.cats.map((cat, catIdx) => {
                      const label = brandLabels[cat.id];
                      const childCount = (childrenMap[cat.id] ?? []).length;
                      return (
                        <AnimatedItem key={cat.id} delay={Math.min(catIdx * 0.03, 0.3)}>
                          <button
                            onClick={() => switchCategory(activeStoreIdx, cat.id)}
                            className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all ${
                              activeCategory === cat.id
                                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "text-[var(--text-secondary)] hover:bg-[var(--text)]/[0.04] hover:text-[var(--text)]"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              {childCount > 0 && (
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  className="shrink-0 opacity-30"
                                >
                                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                                </svg>
                              )}
                              <span className="truncate">{cat.name}</span>
                              {childCount > 0 && (
                                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                                  +{childCount}
                                </span>
                              )}
                            </span>
                            {label && (
                              <span className="block text-[10px] text-[var(--text-muted)] truncate mt-0.5 pl-0.5">
                                {label.brand}
                                {!label.confident && " ?"}
                              </span>
                            )}
                          </button>
                        </AnimatedItem>
                      );
                    })}
                  </div>
                ))}

                {groupedCategories.length === 0 && categorySearch && (
                  <div className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">
                    No categories match &ldquo;{categorySearch}&rdquo;
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* ── Main Content ── */}
          <div
            className="flex-1 min-w-0 relative"
            style={{
              marginLeft: activeStore && activeCategories.length > 0 ? "15rem" : 0,
            }}
          >
            {/* Silk background */}
            <div className="absolute inset-0 opacity-40 pointer-events-none z-0">
              <Silk
                speed={5}
                scale={1}
                color="#3b82f6"
                noiseIntensity={1.5}
                rotation={0}
              />
            </div>
            {/* Store name heading */}
            {activeStore && (
              <div className="max-w-[1800px] mx-auto px-6 pt-6 pb-2">
                <SplitText
                  key={activeStore.storeName}
                  text={activeStore.storeName}
                  className="text-3xl font-extrabold tracking-tight text-[var(--text)]"
                  delay={40}
                  duration={0.5}
                  tag="h2"
                />
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-sm text-[var(--text-muted)]">
                    <span className="text-[var(--text)] font-semibold">{albums.length}</span>
                    {albumsTotalPages > 1 && albumsPage < albumsTotalPages && (
                      <span className="text-[var(--text-muted)]">+</span>
                    )}{" "}
                    products
                    {activeCategory &&
                      (() => {
                        const cat = activeCategories.find((c) => c.id === activeCategory);
                        return cat ? ` in ${cat.name}` : "";
                      })()}
                  </span>
                </div>
              </div>
            )}

            {/* Errors */}
            {loadErrors.length > 0 && (
              <div className="max-w-[1800px] mx-auto px-6 pt-2">
                {loadErrors.map((err, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-4 py-2.5 mb-2 bg-red-500/5 border border-red-500/10 rounded-lg text-xs text-red-400"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    Failed: <strong>{extractStoreName(err.url)}</strong> — {err.error}
                  </div>
                ))}
              </div>
            )}

            {/* Albums loading */}
            {albumsLoading && albums.length === 0 && (
              <div className="flex items-center justify-center py-32">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-[var(--text-muted)]">Loading albums...</p>
                </div>
              </div>
            )}

            {/* ── Album Grid ── */}
            {albums.length > 0 && activeStore && (
              <div className="max-w-[1800px] mx-auto px-6 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 items-start">
                  {albums.map((album, i) => (
                    <motion.div
                      key={album.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.35,
                        delay: Math.min(i * 0.02, 0.5),
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                    >
                      <TiltCard
                        rotateAmplitude={6}
                        scaleOnHover={1.02}
                      >
                        <div
                          onClick={() => openLightbox(album, activeStore.storeUrl)}
                          className="album-card group relative bg-[var(--bg-card)] rounded-xl overflow-hidden cursor-pointer card-glow transition-all"
                        >
                          <div style={{ position: "relative", lineHeight: 0, minHeight: 40 }}>
                            {album.cover ? (
                              <img
                                src={proxyUrl(album.cover)}
                                alt={album.title}
                                loading="lazy"
                                style={{ display: "block", width: "100%", height: "auto" }}
                                onError={(e) => {
                                  const card = (e.target as HTMLImageElement).closest(".album-card");
                                  if (card) (card as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-full aspect-[3/4] flex items-center justify-center text-[var(--text-muted)] text-xs">
                                No image
                              </div>
                            )}
                          </div>
                          {/* Wishlist heart */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeStore)
                                toggleWishlist(album, activeStore.storeName);
                            }}
                            className={`absolute top-2 right-2 z-20 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
                              wishlistIds.has(album.id)
                                ? "bg-[var(--wishlist)]/20 border border-[var(--wishlist)]/40"
                                : "bg-black/40 border border-white/10"
                            }`}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill={
                                wishlistIds.has(album.id) ? "var(--wishlist)" : "none"
                              }
                              stroke={
                                wishlistIds.has(album.id)
                                  ? "var(--wishlist)"
                                  : "white"
                              }
                              strokeWidth="2"
                            >
                              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                            </svg>
                          </button>
                          <div className="p-3">
                            <div className="text-xs font-medium text-[var(--text)] line-clamp-2 leading-snug">
                              {album.title}
                            </div>
                            {album.photoCount && (
                              <span className="text-[10px] text-[var(--text-muted)] mt-1.5 block">
                                {album.photoCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </TiltCard>
                    </motion.div>
                  ))}
                </div>

                {/* Load more */}
                {activeCategory === null && albumsPage < albumsTotalPages && (
                  <div className="flex justify-center py-8">
                    <button
                      onClick={loadMore}
                      disabled={albumsLoading}
                      className="px-8 py-3 rounded-xl text-sm font-medium bg-[var(--text)]/[0.03] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--text)]/[0.06] hover:text-[var(--text)] disabled:opacity-30 transition-all flex items-center gap-2"
                    >
                      {albumsLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          Load More (page {albumsPage}/{albumsTotalPages})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* No albums */}
            {!albumsLoading && albums.length === 0 && activeStore && (
              <div className="flex flex-col items-center justify-center py-32 text-[var(--text-muted)]">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <p className="mt-4 text-sm">No albums found.</p>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ─── Wishlist Sidebar ─── */}
      <AnimatePresence>
        {wishlistOpen && (
          <div className="fixed inset-0 z-40 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setWishlistOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative z-10 w-full max-w-md h-full bg-[var(--bg-surface)] border-l border-[var(--border)] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="var(--wishlist)"
                    stroke="var(--wishlist)"
                    strokeWidth="2"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                  <span className="text-sm font-bold text-[var(--text)]">Wishlist</span>
                  <span className="text-xs text-[var(--text-muted)]">({wishlist.length})</span>
                </div>
                <button
                  onClick={() => setWishlistOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--text)]/[0.04] transition-all"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto">
                {wishlist.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] px-6">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      opacity="0.15"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                    <p className="mt-4 text-sm">Your wishlist is empty</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Click the heart on any album to save it
                    </p>
                  </div>
                ) : (
                  Object.entries(wishlistGrouped).map(([store, items]) => (
                    <div key={store}>
                      <div className="px-5 py-2.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest bg-[var(--text)]/[0.02] border-b border-[var(--border)]">
                        {store}
                      </div>
                      {items.map((item, idx) => (
                        <motion.div
                          key={item.albumId}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--text)]/[0.02] transition-all"
                        >
                          <a
                            href={item.yupooUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-[var(--bg-surface)]"
                          >
                            {item.coverUrl ? (
                              <img
                                src={proxyUrl(item.coverUrl)}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-[8px]">
                                No img
                              </div>
                            )}
                          </a>
                          <a
                            href={item.yupooUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-0"
                          >
                            <div className="text-xs font-medium text-[var(--text)] line-clamp-2 leading-snug hover:text-[var(--text)] transition-colors">
                              {item.albumName}
                            </div>
                          </a>
                          <button
                            onClick={() =>
                              setWishlist((prev) =>
                                prev.filter((w) => w.albumId !== item.albumId)
                              )
                            }
                            className="shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/5 transition-all"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {wishlist.length > 0 && (() => {
                const prices = wishlist.map((w) => extractPrice(w.albumName));
                const validPrices = prices.filter((p): p is number => p !== null);
                const subtotal = validPrices.reduce((sum, p) => sum + p, 0);
                return (
                  <div className="px-5 py-4 border-t border-[var(--border)] space-y-3">
                    {validPrices.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--text-muted)]">
                            Subtotal ({validPrices.length}/{wishlist.length} priced)
                          </span>
                          <span className="text-sm font-semibold text-[var(--text)]">
                            ¥{subtotal.toLocaleString()}
                          </span>
                        </div>
                        {cnyToGbp && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[var(--text-muted)]">
                              Approx. GBP
                            </span>
                            <span className="text-xs text-[var(--text-secondary)]">
                              £{(subtotal * cnyToGbp).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setWishlist([])}
                      className="w-full py-2.5 rounded-xl text-xs font-medium text-red-400 border border-red-500/10 hover:bg-red-500/5 transition-all"
                    >
                      Clear all ({wishlist.length})
                    </button>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Footer ─── */}
      {hasResults && (
        <div className="py-6 text-center text-[10px] text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} YupooMall
        </div>
      )}

      {/* ─── Lightbox ─── */}
      <AnimatePresence>
        {lightboxOpen && lightboxAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setLightboxOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-[90vw] max-w-[900px] max-h-[92vh] bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] gap-3">
                <div className="text-sm font-semibold truncate min-w-0 text-[var(--text)]">
                  {lightboxAlbum.title}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={lightboxAlbum.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-1.5 text-xs rounded-lg bg-[var(--text)]/[0.04] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--text)]/[0.08] transition-all"
                  >
                    Open on Yupoo
                  </a>
                  <button
                    onClick={() => setLightboxOpen(false)}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--text)]/[0.04] transition-all"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center gap-4">
                {lightboxLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : lightboxPhotos.length > 0 ? (
                  <>
                    <div className="flex items-center gap-3 w-full">
                      <button
                        onClick={() => setLightboxIndex((i) => Math.max(0, i - 1))}
                        disabled={lightboxIndex === 0}
                        className="shrink-0 w-10 h-10 rounded-full bg-[var(--text)]/[0.03] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text)] disabled:opacity-20 transition-all"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                      </button>
                      <div className="flex-1 flex items-center justify-center min-h-[300px] max-h-[55vh]">
                        <img
                          src={proxyUrl(lightboxPhotos[lightboxIndex]?.url || "")}
                          alt=""
                          className="max-w-full max-h-[55vh] object-contain rounded-lg"
                        />
                      </div>
                      <button
                        onClick={() =>
                          setLightboxIndex((i) =>
                            Math.min(lightboxPhotos.length - 1, i + 1)
                          )
                        }
                        disabled={lightboxIndex === lightboxPhotos.length - 1}
                        className="shrink-0 w-10 h-10 rounded-full bg-[var(--text)]/[0.03] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text)] disabled:opacity-20 transition-all"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </div>

                    <div className="text-xs text-[var(--text-muted)]">
                      {lightboxIndex + 1} / {lightboxPhotos.length}
                    </div>

                    <div className="flex gap-2 overflow-x-auto max-w-full pb-1">
                      {lightboxPhotos.map((photo, idx) => (
                        <img
                          key={photo.id}
                          src={proxyUrl(photo.url)}
                          alt=""
                          loading="lazy"
                          onClick={() => setLightboxIndex(idx)}
                          className={`w-14 h-14 rounded-lg object-cover cursor-pointer shrink-0 border-2 transition-all ${
                            idx === lightboxIndex
                              ? "border-[var(--accent)] opacity-100"
                              : "border-transparent opacity-40 hover:opacity-70"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-32 text-sm text-[var(--text-muted)]">
                    No photos available
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
