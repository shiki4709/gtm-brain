export default function Home() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="font-[family-name:var(--font-head)] text-4xl font-bold gradient-text mb-3">
        GTM Brain
      </h1>
      <p className="text-ink-2 text-lg mb-8">Your second brain for GTM.</p>

      {/* Gradient button */}
      <button className="px-6 py-3 rounded-lg text-white font-semibold text-sm shadow-lg"
        style={{ background: 'var(--gradient-main)', boxShadow: '0 4px 16px rgba(33,150,243,0.2), 0 2px 6px rgba(255,138,101,0.15)' }}>
        Get started
      </button>

      {/* Brain card */}
      <div className="brain-card mt-8">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-4 mb-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--gradient-main)' }} />
          This week&apos;s insight
        </div>
        <p className="text-[15px] leading-relaxed">
          Posts about <strong className="text-accent">engineering hiring</strong> yield 3x more ICP leads.
          DMs referencing comments get <strong style={{ color: 'var(--accent-orange)' }}>23% reply rate</strong>.
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-ink-4">
          <div className="conf-bar"><div className="conf-fill conf-high" style={{ width: '80%' }} /></div>
          High confidence · 12 scrapes
        </div>
      </div>

      {/* Brain nudge */}
      <div className="brain-nudge mt-4">
        <div className="brain-nudge-icon">B</div>
        <div className="flex-1">
          Your ICP engages most on <strong className="text-accent">Tuesdays</strong>. Today is Tuesday.
          Good day to scrape.
        </div>
        <span className="font-[family-name:var(--font-head)] text-xs font-semibold text-accent cursor-pointer whitespace-nowrap ml-2">
          Start →
        </span>
      </div>

      {/* Tags */}
      <div className="flex gap-2 mt-6">
        <span className="tag-outbound">outbound</span>
        <span className="tag-inbound">inbound</span>
      </div>
    </main>
  );
}
