'use client'

import { useState, useEffect, useCallback } from 'react'

interface ApiKey {
  id: string
  key_prefix: string
  name: string
  permissions: string[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

interface Transaction {
  amount: number
  type: string
  api_endpoint: string | null
  created_at: string
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchData = useCallback(async () => {
    const [keysRes, creditsRes] = await Promise.all([
      fetch('/api/v1/keys'),
      fetch('/api/v1/credits'),
    ])
    const keysData = await keysRes.json()
    const creditsData = await creditsRes.json()
    if (keysData.ok) setKeys(keysData.data.keys)
    if (creditsData.ok) {
      setBalance(creditsData.data.balance)
      setTransactions(creditsData.data.transactions)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function createKey() {
    setCreating(true)
    const res = await fetch('/api/v1/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName || 'Default' }),
    })
    const data = await res.json()
    if (data.ok) {
      setCreatedKey(data.data.key)
      setNewKeyName('')
      await fetchData()
    }
    setCreating(false)
  }

  async function revokeKey(keyId: string) {
    await fetch(`/api/v1/keys?id=${keyId}`, { method: 'DELETE' })
    await fetchData()
  }

  function copyKey() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return <div className="p-6 text-zinc-400">Loading...</div>
  }

  const activeKeys = keys.filter(k => !k.revoked_at)

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Developer API</h1>
        <p className="text-zinc-400 text-sm">Build with Nevara's scoring, reply, and content generation APIs.</p>
      </div>

      {/* Created Key Modal */}
      {createdKey && (
        <div className="bg-emerald-950/50 border border-emerald-800 rounded-lg p-4">
          <p className="text-emerald-400 text-sm font-medium mb-2">API Key Created — Save it now. It won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-zinc-900 text-emerald-300 px-3 py-2 rounded text-sm font-mono break-all">
              {createdKey}
            </code>
            <button
              onClick={copyKey}
              className="px-3 py-2 bg-emerald-800 hover:bg-emerald-700 text-white text-sm rounded transition-colors"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-2 text-zinc-500 text-xs hover:text-zinc-300"
          >
            I've saved it, dismiss
          </button>
        </div>
      )}

      {/* API Keys */}
      <section>
        <h2 className="text-lg font-medium text-white mb-3">API Keys</h2>
        <div className="space-y-2 mb-4">
          {activeKeys.length === 0 ? (
            <p className="text-zinc-500 text-sm">No API keys yet. Create one to get started.</p>
          ) : (
            activeKeys.map(key => (
              <div key={key.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-zinc-300 text-sm font-mono">{key.key_prefix}...</code>
                    <span className="text-zinc-500 text-xs">{key.name}</span>
                  </div>
                  <div className="text-zinc-600 text-xs mt-1">
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="text-red-500 hover:text-red-400 text-xs px-2 py-1"
                >
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
        {activeKeys.length < 5 && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Key name (optional)"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500 flex-1 max-w-xs"
            />
            <button
              onClick={createKey}
              disabled={creating}
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        )}
      </section>

      {/* Credits */}
      <section>
        <h2 className="text-lg font-medium text-white mb-3">Credits</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-semibold text-white">{balance ?? 0}</span>
            <span className="text-zinc-500 text-sm">credits remaining</span>
          </div>
          <div className="text-zinc-500 text-xs space-y-1">
            <p>Reply: 2 credits · Repurpose: 3 credits · Discover: 1 credit · Score: 1 credit</p>
          </div>
          {transactions.length > 0 && (
            <div className="mt-4 border-t border-zinc-800 pt-3">
              <p className="text-zinc-500 text-xs mb-2">Recent activity</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {transactions.slice(0, 10).map((tx, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">
                      {tx.type === 'signup_bonus' ? 'Signup bonus' : tx.api_endpoint?.replace('/api/v1/', '') ?? tx.type}
                    </span>
                    <span className={tx.amount > 0 ? 'text-emerald-400' : 'text-zinc-500'}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Quick Start */}
      <section>
        <h2 className="text-lg font-medium text-white mb-3">Quick Start</h2>
        <div className="space-y-4">
          <CodeBlock
            title="Score posts for ICP relevance"
            code={`curl -X POST https://your-domain.com/api/v1/score \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "posts": [{"text": "Just shipped our new AI pipeline for sales teams"}],
    "icp_config": {
      "track_keywords": ["ai", "sales", "pipeline"],
      "icp_titles": ["VP Sales", "Head of Revenue"]
    }
  }'`}
          />
          <CodeBlock
            title="Generate a smart reply"
            code={`curl -X POST https://your-domain.com/api/v1/reply \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "post_text": "We just hit $10M ARR with zero paid ads",
    "author_name": "Sarah Chen",
    "platform": "x"
  }'`}
          />
          <CodeBlock
            title="Repurpose content across platforms"
            code={`curl -X POST https://your-domain.com/api/v1/repurpose \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_text": "Thread: 5 things I learned scaling from 0 to $5M...",
    "source_platform": "x",
    "target_formats": ["linkedin", "thread"]
  }'`}
          />
          <CodeBlock
            title="Discover high-engagement posts"
            code={`curl -X POST https://your-domain.com/api/v1/discover \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "keywords": "AI agents B2B",
    "platform": "x",
    "min_engagement": 50
  }'`}
          />
        </div>
      </section>
    </div>
  )
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-zinc-400 text-sm">{title}</span>
        <button onClick={copy} className="text-zinc-500 hover:text-zinc-300 text-xs">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-sm text-zinc-300 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  )
}
