"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/Icon";
import { usePulseOnIncrease } from "@/components/ui/usePulseOnIncrease";

export type PosRailItem = { id: string; label: string; icon: IconName; href: string; badge?: number };

function Badge({ value }: { value: number }) {
  const ref = usePulseOnIncrease<HTMLSpanElement>(value);
  if (value <= 0) return null;
  return (
    <span ref={ref} className="pos-rail-badge" aria-label={`${value} bekliyor`}>
      {value}
    </span>
  );
}

/** Sol 72 px ray (dikeyde alt çubuk). Etkin öğe yol + `sekme` parametresine göre bulunur. */
export function PosRail({ items }: { items: PosRailItem[] }) {
  const path = usePathname();
  const search = useSearchParams();
  const sekme = search.get("sekme");
  return (
    <nav aria-label="Personel bölümleri" className="pos-rail">
      {items.map((item) => {
        const [hrefPath, hrefQuery] = item.href.split("?");
        const wanted = hrefQuery ? new URLSearchParams(hrefQuery).get("sekme") : null;
        const active = path === hrefPath && (hrefPath === "/kasa" ? sekme === wanted : true);
        return (
          <Link key={item.id} href={item.href} aria-current={active ? "page" : undefined} className="pos-rail-item">
            <Icon name={item.icon} size={24} />
            <span>{item.label}</span>
            {item.badge ? <Badge value={item.badge} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
