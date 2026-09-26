import logoUrl from "@/assets/chihuahua-logo.svg";
import { cx } from "./ui";

export function Mascot({ size = 40, className }: { size?: number; className?: string }) {
  return <img src={logoUrl} width={size} height={size} alt="" className={cx("shrink-0 select-none", className)} draggable={false} />;
}

export function Logo({ size = 36, className, withText = true }: { size?: number; className?: string; withText?: boolean }) {
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <Mascot size={size} />
      {withText && (
        <span className="font-display text-xl font-bold tracking-tight">
          Hua<span className="text-rust">llet</span>
        </span>
      )}
    </div>
  );
}
