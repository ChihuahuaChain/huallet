import { Flame, Tag, TrendingUp, type LucideIcon } from "lucide-react";

/**
 * Promotional "news" cards shown on the desktop dashboard, MetaMask-style:
 * one card at a time, with a stack peeking out behind when more are queued.
 * The content mirrors the Chihuahua explorer's ecosystem banners.
 *
 * Each promo needs a STABLE `id`: once a user dismisses an id it is never shown
 * again (the id is remembered in settings). Editing a card's text keeps it
 * dismissed; giving a card a NEW id makes it resurface as fresh news.
 *
 * The thumbnail is a crisp vector icon on a brand-colour tile. If a project ever
 * ships a clean square logo, drop it in `src/assets/promos/` and swap the tile
 * for an <img> in PromoCards.tsx.
 */
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

export const PROMOS: Promo[] = [
  {
    id: "dogtags",
    eyebrow: "Chihuahua name service",
    title: "Give your wallet a name",
    body: "Register a short tag that points to your chihuahua1… address. The fee is burned forever.",
    cta: "Get your collar",
    url: "https://tags.chihuahua.wtf",
    icon: Tag,
    accent: "#F0A841",
  },
  {
    id: "predict",
    eyebrow: "Huahua Prediction",
    title: "Call the market up or down",
    body: "BTC & ETH up-or-down rounds on Chihuahua. Bets in USDC, settled on-chain.",
    cta: "Make your call",
    url: "https://predict.chihuahua.wtf",
    icon: TrendingUp,
    accent: "#1F9E57",
  },
  {
    id: "burn",
    eyebrow: "$HUAHUA burned forever",
    title: "Every fee feeds the fire",
    body: "A share of every transaction is burned and gone for good. Watch the counter climb.",
    cta: "Watch it burn",
    url: "https://burn.chihuahua.wtf",
    icon: Flame,
    accent: "#F26A3C",
  },
];
