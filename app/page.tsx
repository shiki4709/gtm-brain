import Link from "next/link";

const stats = [
  { num: "142", label: "ICP leads", cls: "stat-num-blue" },
  { num: "34", label: "DMs sent", cls: "stat-num-green" },
  { num: "7", label: "Replies", cls: "stat-num-orange" },
  { num: "12", label: "X replies", cls: "stat-num-blue" },
  { num: "3", label: "Posts published", cls: "stat-num-orange" },
];

const actions = [
  { count: 23, text: "new ICP leads to review", tag: "outbound", href: "/outbound" },
  { count: 8, text: "DMs drafted, ready to send", tag: "outbound", href: "/outbound" },
  { count: 5, text: "tweets worth replying to", tag: "inbound", href: "/inbound" },
  { count: 2, text: "leads replied to your DM", tag: "outbound", href: "/outbound" },
  { count: 1, text: "post ready to publish", tag: "inbound", href: "/inbound" },
];

const activity = [
  { time: "2m", text: "Scraped rmeadows post — 920 engagers, 142 ICP", tag: "outbound" },
  { time: "15m", text: "Sarah Chen (VP Eng, Datadog) replied to your DM", tag: "outbound" },
  { time: "1h", text: "Replied to @markroberge thread on sales hiring", tag: "inbound" },
  { time: "3h", text: 'Published "Why your GTM playbook is outdated" on LinkedIn', tag: "inbound" },
  { time: "5h", text: "Sent 12 DMs to ICP leads from landon-tracy post", tag: "outbound" },
  { time: "Yday", text: "Your LinkedIn post attracted 47 engagers — 12 ICP matches", tag: "inbound" },
];

export default function Overview() {
  return (
    <>
      {/* Brain insight */}
      <div className="brain-card mb-6">
        <div className="flex items-center gap-1.5 section-label mb-2">
          <div className="w-1.5 h-1.5 rounded-full gradient-dot" />
          This week&apos;s insight
        </div>
        <p className="text-[15px] leading-relaxed">
          Posts about <strong className="text-accent">engineering hiring</strong> yield 3x more ICP leads than product launches.
          DMs referencing comments get <strong className="text-orange">23% reply rate</strong> vs 8% for generic.
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-ink-4">
          <div className="conf-bar"><div className="conf-fill conf-high" style={{ width: "80%" }} /></div>
          High confidence · 12 scrapes, 34 DMs
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`stat-num ${s.cls}`}>{s.num}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="section-label">Needs your attention</div>
      <div className="flex flex-col gap-2 mb-8">
        {actions.map((a, i) => (
          <Link key={i} href={a.href} className="card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-1.5 h-1.5 rounded-full ${a.tag === "outbound" ? "bg-accent" : "bg-orange"}`} />
              <span className="text-sm"><strong>{a.count}</strong> {a.text}</span>
              <span className={a.tag === "outbound" ? "tag-outbound" : "tag-inbound"}>{a.tag}</span>
            </div>
            <span className="font-head text-xs font-semibold text-accent">
              {a.tag === "outbound" ? "Review" : "View"} →
            </span>
          </Link>
        ))}
      </div>

      {/* Activity */}
      <div className="section-label">Activity</div>
      <div className="flex flex-col">
        {activity.map((a, i) => (
          <div key={i} className="flex gap-3 py-2 border-b border-rule-light text-xs">
            <span className="text-ink-4 w-10 shrink-0">{a.time}</span>
            <span className="text-ink-2 flex-1">{a.text}</span>
            <span className={a.tag === "outbound" ? "tag-outbound" : "tag-inbound"}>
              {a.tag === "outbound" ? "out" : "in"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
