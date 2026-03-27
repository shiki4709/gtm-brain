"use client";
import { useState } from "react";

const tweets = [
  {
    author: "Mark Roberge", handle: "markroberge", time: "2h",
    text: "Hot take: the best AEs in 2026 aren't \"closers.\" They're consultants who happen to sell. The playbook shifted and most orgs haven't caught up.",
    likes: 342, replies: 89, rts: 45,
  },
  {
    author: "Gergely Orosz", handle: "GergelyOrosz", time: "5h",
    text: "Engineering leaders still doing stack ranking in 2026 are losing their best people. Thread on what actually works.",
    likes: 1200, replies: 234, rts: 178,
  },
];

export default function Inbound() {
  const [source, setSource] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [draftReply, setDraftReply] = useState<number | null>(null);

  function handleGenerate() {
    if (!source.trim()) return;
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 2000);
  }

  return (
    <>
      <p className="text-sm text-ink-3 mb-5">
        Post content → attract engagement → stay active on X → leads come to you
      </p>

      {/* Content generation */}
      <div className="section-label">Create content</div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste a URL or topic to write about..."
          className="input flex-1"
        />
        <button onClick={handleGenerate} disabled={generating} className="btn-primary">
          {generating ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Brain suggestion */}
      <div className="brain-nudge mb-6">
        <div className="brain-nudge-icon">B</div>
        <div className="flex-1 text-sm">
          Based on your lead data, posts about <strong className="text-accent">engineering hiring</strong> attract the most ICP leads.
          <button className="text-accent font-semibold ml-1 hover:underline" onClick={() => setSource("engineering hiring challenges in 2026")}>
            Generate about hiring →
          </button>
        </div>
      </div>

      {/* Generated content */}
      {generated && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="card-flat">
            <div className="flex justify-between items-center mb-3">
              <span className="font-head text-[11px] font-bold uppercase tracking-wider text-accent">LinkedIn</span>
              <button className="btn-outline text-[11px] py-1 px-2.5">Copy</button>
            </div>
            <div className="text-xs text-ink-2 leading-relaxed whitespace-pre-line">
{`Most GTM playbooks were written for a world that no longer exists.

The shift isn't coming — it already happened:

→ Buyers do 80% of research before talking to sales
→ Cold outbound reply rates dropped 40% in 2 years
→ The best pipeline comes from content + warm engagement

The founders winning right now aren't hiring more SDRs. They're building systems that find the right people at the right moment.

What's working in your GTM right now?

#GTM #B2BSales #StartupGrowth`}
            </div>
          </div>
          <div className="card-flat">
            <div className="flex justify-between items-center mb-3">
              <span className="font-head text-[11px] font-bold uppercase tracking-wider text-accent">X Thread</span>
              <button className="btn-outline text-[11px] py-1 px-2.5">Copy</button>
            </div>
            <div className="text-xs text-ink-2 leading-relaxed whitespace-pre-line">
{`most GTM playbooks for 2026 are already dead. here's what replaced them:

---

cold outbound reply rates dropped 40% in 2 years. hiring more SDRs isn't the fix. the channel is saturated.

---

what's working: find the people already engaging with your space. they're commenting on posts, liking content. reach them there.

---

build systems, not headcount. content attracts. scraping identifies. AI drafts. human reviews and sends.`}
            </div>
          </div>
        </div>
      )}

      <hr className="border-rule-light my-6" />

      {/* X Engage */}
      <div className="section-label">X — Tweets to reply to</div>
      <div className="text-[11px] text-ink-4 mb-3">
        Watching: @markroberge, @kelseyhightower, @GergelyOrosz · Topics: engineering leadership, tech hiring
      </div>

      <div className="flex flex-col gap-2 mb-6">
        {tweets.map((tw, idx) => (
          <div key={idx} className="card">
            <div className="text-sm mb-1">
              <strong className="font-head">{tw.author}</strong>
              <span className="text-ink-4 font-normal"> @{tw.handle} · {tw.time}</span>
            </div>
            <div className="text-sm text-ink-2 leading-relaxed mb-2">{tw.text}</div>
            <div className="text-[11px] text-ink-4 mb-2">
              {tw.likes.toLocaleString()} likes · {tw.replies} replies · {tw.rts} RTs
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setDraftReply(idx)} className="btn-accent">Draft Reply</button>
              <button className="btn-outline">View on X</button>
            </div>

            {draftReply === idx && (
              <div className="mt-3 pt-3 border-t border-rule-light">
                <div className="text-xs text-ink-4 mb-1">Your draft reply:</div>
                <div className="text-sm text-ink font-medium mb-2">
                  &quot;seeing the same shift. best reps we work with lead with diagnosis, not demo. the ones who ask better questions close more.&quot;
                </div>
                <div className="flex gap-1.5">
                  <button className="btn-accent">Copy &amp; Post</button>
                  <button className="btn-outline">Rewrite</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <hr className="border-rule-light my-6" />

      {/* Your posts */}
      <div className="section-label">Your posts — engagement</div>
      <div className="card flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold font-head">&quot;Why your GTM playbook is outdated&quot;</div>
          <div className="text-[11px] text-ink-4">LinkedIn · 3h ago · 47 engagers · 12 ICP matches</div>
        </div>
        <button className="btn-orange">Scrape engagers →</button>
      </div>
    </>
  );
}
