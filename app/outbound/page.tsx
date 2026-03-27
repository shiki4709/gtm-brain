"use client";
import { useState } from "react";

const pipeline = [
  { label: "Scraped", count: 920, active: false },
  { label: "ICP", count: 142, active: true },
  { label: "DM Sent", count: 34, active: false },
  { label: "Replied", count: 7, active: false },
  { label: "Meeting", count: 2, active: false },
];

const leads = [
  { name: "Sarah Chen", title: "VP of Engineering", company: "Datadog", comment: "Completely agree about the shift to...", status: "replied" },
  { name: "Marcus Rivera", title: "CTO", company: "Series B fintech", comment: "This is exactly what we're seeing...", status: "new" },
  { name: "Priya Patel", title: "Head of Engineering", company: "Notion", comment: "", status: "sent" },
  { name: "James Wu", title: "Director of Engineering", company: "Stripe", comment: "", status: "new" },
  { name: "Lisa Park", title: "VP Product", company: "Figma", comment: "The GTM shift is real, especially for...", status: "new" },
  { name: "David Kim", title: "CTO", company: "Ramp", comment: "", status: "drafted" },
];

export default function Outbound() {
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);

  return (
    <>
      <p className="text-sm text-ink-3 mb-5">
        Find leads from other people&apos;s posts → filter to ICP → draft DMs → send
      </p>

      {/* Scrape input */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={scrapeUrl}
          onChange={(e) => setScrapeUrl(e.target.value)}
          placeholder="Paste a LinkedIn post URL..."
          className="input flex-1"
        />
        <button
          onClick={() => { setScraping(true); setTimeout(() => setScraping(false), 2000); }}
          disabled={scraping}
          className="btn-primary"
        >
          {scraping ? "Scraping..." : "Scrape"}
        </button>
      </div>
      <div className="text-xs text-ink-4 mb-6">
        Or <button className="text-accent hover:underline font-medium">search for posts</button> · <button className="text-accent hover:underline font-medium">check watch list</button>
      </div>

      {/* Brain nudge */}
      <div className="brain-nudge mb-6">
        <div className="brain-nudge-icon">B</div>
        <div className="flex-1 text-sm">
          Posts about <strong className="text-accent">engineering hiring</strong> yield 12% ICP match rate. This topic works best for your ICP.
        </div>
      </div>

      {/* Pipeline */}
      <div className="section-label">Pipeline</div>
      <div className="flex items-center gap-1.5 mb-6">
        {pipeline.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={s.active ? "pipe-step pipe-active" : "pipe-step"}>
              {s.count} {s.label.toLowerCase()}
            </span>
            {i < pipeline.length - 1 && <span className="pipe-arrow">→</span>}
          </div>
        ))}
      </div>

      {/* Lead list */}
      <div className="section-label">ICP Leads — 23 new</div>
      <div className="flex flex-col gap-1.5">
        {leads.map((l, i) => (
          <div key={i} className="card flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-head text-sm font-semibold">{l.name}</span>
                <span className="badge badge-icp">ICP</span>
                {l.status === "sent" && <span className="badge badge-sent">DM Sent</span>}
                {l.status === "replied" && <span className="badge badge-replied">Replied</span>}
                {l.status === "drafted" && <span className="badge badge-drafted">Drafted</span>}
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5">
                {l.title} at {l.company}
                {l.comment && <> · &quot;{l.comment}&quot;</>}
              </div>
            </div>
            <div className="flex gap-1.5">
              {l.status === "new" && <button className="btn-accent">Draft DM</button>}
              <button className="btn-outline">View</button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center py-4 text-xs text-ink-4">
        + 136 more ICP leads · <button className="text-accent font-semibold hover:underline">Export to Sales Nav CSV</button>
      </div>
    </>
  );
}
