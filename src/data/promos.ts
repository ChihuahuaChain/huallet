import { Calendar, Coins, Flame, Gift, Handshake, Megaphone, Rocket, Sparkles, Star, Sunrise, Tag, TrendingUp, Trophy, Wallet, type LucideIcon } from "lucide-react";

/**
 * Promotional "news" cards shown on the desktop dashboard, MetaMask-style:
 * one card at a time, with a stack peeking out behind when more are queued.
 *
 * The list comes from the shared Chihuahua news feed (PROMOS_URL), which also drives
 * the explorer's ecosystem banners. BUNDLED_PROMOS is the copy shipped with the app,
 * shown until the feed loads or whenever it can't be fetched.
 *
 * Each promo needs a STABLE `id`: once a user dismissed an id it is never shown
 * again (the id is remembered in settings). Editing a card's text keeps it
 * dismissed; giving a card a NEW id makes it resurface as fresh news.
 *
 * Feed entries are data only: text is rendered as text, links must be https and
 * icons come from the fixed set below.
 */
export const PROMOS_URL = "https://service.chihuahua.wtf/promos.json";

export interface Promo {
  id: string;
  /** Small label above the title, e.g. the product/category. */
  eyebrow: string;
  title: string;
  body: string;
  /** Call-to-action label. */
  cta: string;
  /** External link opened when the card is clicked. */
  url: string;
  /** Vector icon shown white on the brand tile. */
  icon: LucideIcon;
  /** Brand accent colour (hex) used for the tile, tint, border, eyebrow and CTA. */
  accent: string;
}

/** Icon names a feed entry may use. */
const ICONS: Record<string, LucideIcon> = {
  tag: Tag,
  "trending-up": TrendingUp,
  flame: Flame,
  wallet: Wallet,
  megaphone: Megaphone,
  sparkles: Sparkles,
  gift: Gift,
  rocket: Rocket,
  coins: Coins,
  star: Star,
  calendar: Calendar,
  trophy: Trophy,
  sunrise: Sunrise,
  handshake: Handshake,
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Maps one feed entry to a card, or null when it is invalid, not for Huallet, or out of its date window. */
export function parsePromo(raw: unknown, now = Date.now()): Promo | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.targets) || !p.targets.includes("huallet")) return null;
  const weight = p.weight === undefined ? 1 : Number(p.weight);
  if (!(weight > 0)) return null;
  if (p.start !== undefined && !(Date.parse(str(p.start)) <= now)) return null;
  if (p.end !== undefined && !(Date.parse(str(p.end)) > now)) return null;
  const id = str(p.id);
  const url = str(p.url);
  const title = str(p.title);
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || !title || !/^https:\/\/[^\s"'<>]+$/.test(url)) return null;
  const accent = /^#[0-9a-fA-F]{6}$/.test(str(p.accent)) ? str(p.accent) : "#F0A841";
  return {
    id,
    eyebrow: str(p.eyebrow),
    title,
    body: str(p.body),
    cta: str(p.cta) || "Learn more",
    url,
    icon: ICONS[str(p.icon)] ?? Megaphone,
    accent,
  };
}

/** The Huallet cards of a feed document, in feed order; empty when the document is unusable. */
export function parseFeed(feed: unknown, now = Date.now()): Promo[] {
  const list = (feed as { promos?: unknown } | null)?.promos;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .map((p) => parsePromo(p, now))
    .filter((p): p is Promo => !!p && !seen.has(p.id) && !!seen.add(p.id));
}

/** Copy of the feed shipped with the app (same format as promos.json). */
export const BUNDLED_FEED = {
  version: 1,
  promos: [
    {
      id: "dogtags",
      eyebrow: "Chihuahua name service",
      title: "Give your wallet a name",
      body: "Register a short tag that points to your chihuahua1… address. The fee is burned forever.",
      cta: "Get your collar",
      url: "https://tags.chihuahua.wtf",
      accent: "#F0A841",
      icon: "tag",
      targets: ["explorer", "huallet"],
    },
    {
      id: "predict",
      eyebrow: "Huahua Prediction",
      title: "Call the market up or down",
      body: "BTC & ETH up-or-down rounds on Chihuahua. Bets in USDC, settled on-chain.",
      cta: "Make your call",
      url: "https://predict.chihuahua.wtf",
      accent: "#1F9E57",
      icon: "trending-up",
      targets: ["explorer", "huallet"],
    },
    {
      id: "burn",
      eyebrow: "$HUAHUA burned forever",
      title: "Every fee feeds the fire",
      body: "A share of every transaction is burned and gone for good. Watch the counter climb.",
      cta: "Watch it burn",
      url: "https://burn.chihuahua.wtf",
      accent: "#F26A3C",
      icon: "flame",
      targets: ["explorer", "huallet"],
    },
  ],
};
