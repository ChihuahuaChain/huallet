import { useQuery } from "@tanstack/react-query";
import { BUNDLED_FEED, PROMOS_URL, parseFeed, type Promo } from "@/data/promos";

const CACHE_KEY = "huallet:promos-feed";

const isFeed = (v: unknown) => Array.isArray((v as { promos?: unknown } | null)?.promos);

function cachedFeed(): unknown {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchFeed(): Promise<unknown> {
  const r = await fetch(PROMOS_URL, { cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer" });
  if (!r.ok) throw new Error(`promos: ${r.status}`);
  const feed: unknown = await r.json();
  if (!isFeed(feed)) throw new Error("promos: bad feed");
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(feed));
  } catch {
    /* storage full or unavailable: keep using the in-memory copy */
  }
  return feed;
}

/**
 * Huallet's cards from the shared news feed. Starts from the last feed seen (or the bundled
 * copy) so the card shows instantly, then refreshes at most once an hour. Nothing is fetched
 * while `enabled` is false (promotions turned off, or the mobile layout).
 */
export function usePromos(enabled: boolean): Promo[] {
  const q = useQuery({
    queryKey: ["promos-feed"],
    queryFn: fetchFeed,
    enabled,
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
  const feed = q.data ?? cachedFeed();
  return parseFeed(isFeed(feed) ? feed : BUNDLED_FEED);
}
