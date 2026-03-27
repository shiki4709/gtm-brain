"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Overview" },
  { href: "/outbound", label: "Outbound", badge: 23 },
  { href: "/inbound", label: "Inbound", badge: 5 },
];

export default function Nav() {
  const path = usePathname();

  return (
    <header className="border-b border-rule">
      <div className="max-w-5xl mx-auto px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between py-3 text-sm">
          <div className="text-ink-3">
            Logged in as <strong className="text-ink">maruthi@nevara.io</strong>
          </div>
          <div className="text-xs text-ink-4">
            ICP: VP Engineering, CTO, Head of Product ·{" "}
            <button className="text-accent hover:underline">Edit</button>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-0" role="tablist" aria-label="Main navigation">
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/" ? path === "/" : path.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                className={`
                  font-[family-name:var(--font-head)] text-sm font-semibold
                  px-5 py-3 border-b-[2.5px] transition-colors
                  ${isActive
                    ? "text-ink border-accent"
                    : "text-ink-4 border-transparent hover:text-ink-3"
                  }
                `}
              >
                {tab.label}
                {tab.badge && (
                  <span className="ml-1.5 badge-count">{tab.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
