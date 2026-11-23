"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import FilterRow from "@/app/admin/_components/ui/FilterRow";
import { Select } from "@/app/admin/_components/ui/Input";

/**
 * The documents hub's filter row (V4 Stage G). The URL is the state: search
 * writes `q`, the selects write `status` and `type`, and the view (`view`)
 * is kept; paging resets on every change.
 */
export default function DocumentFilterRow({
  view,
  status,
  type,
  owner,
  q,
  typeOptions,
}: {
  view: string;
  status: string;
  type: string;
  owner: string;
  q: string;
  typeOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setText(q), [q]);

  const go = (next: Partial<{ status: string; type: string; q: string; owner: string }>) => {
    const p = new URLSearchParams();
    if (view !== "all") p.set("view", view);
    const st = next.status ?? status;
    if (st !== "active") p.set("status", st);
    const ty = next.type ?? type;
    if (ty !== "all") p.set("type", ty);
    const ow = next.owner ?? owner;
    if (ow !== "all") p.set("owner", ow);
    const nq = (next.q ?? text).trim();
    if (nq) p.set("q", nq);
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const onSearch = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v }), 300);
  };

  const active = (status !== "active" ? 1 : 0) + (type !== "all" ? 1 : 0) + (owner !== "all" ? 1 : 0) + (q ? 1 : 0);

  return (
    <FilterRow
      search={{ value: text, onChange: onSearch, label: "Search documents", placeholder: "Search title or filename" }}
      quickFilters={[
        {
          key: "archived",
          label: "Archived",
          active: status === "archived",
          onClick: () => go({ status: status === "archived" ? "active" : "archived" }),
        },
        ...(owner !== "all" ? [{ key: "owner", label: "One uploader", active: true, onClick: () => go({ owner: "all" }) }] : []),
      ]}
      onClearAll={
        active > 0
          ? () => {
              setText("");
              go({ status: "active", type: "all", owner: "all", q: "" });
            }
          : undefined
      }
      right={
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Status" value={status} onChange={(e) => go({ status: e.target.value })} className="!w-auto">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">Any status</option>
          </Select>
          <Select aria-label="Type" value={type} onChange={(e) => go({ type: e.target.value })} className="!w-auto max-w-[220px]">
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      }
    />
  );
}
