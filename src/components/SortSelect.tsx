import { ArrowUpDown } from "lucide-react";
import { Select, cx } from "@/components/ui";
import { useT } from "@/i18n";

export function SortSelect<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  const t = useT();
  return (
    <div className="relative inline-flex">
      <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
      <Select className={cx(className ?? "h-9 w-auto! min-w-36 text-sm", "pl-8!")} value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={t("common.sort")} title={t("common.sort")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </div>
  );
}
