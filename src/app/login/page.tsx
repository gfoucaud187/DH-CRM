'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Login failed'); setLoading(false); return }

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.id).single()

    if (profile?.role === 'admin') {
      router.push('/dashboard')
    } else if (profile?.role === 'client') {
      router.push('/portal/dashboard')
    } else {
      setError('Access denied.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>

      {/* Background stars effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(40)].map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white"
            style={{
              width: Math.random() * 2 + 1 + 'px',
              height: Math.random() * 2 + 1 + 'px',
              top: Math.random() * 100 + '%',
              left: Math.random() * 100 + '%',
              opacity: Math.random() * 0.4 + 0.1,
            }} />
        ))}
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-5"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', boxShadow: '0 0 40px rgba(99,102,241,0.4)' }}>
            <span className="text-3xl font-bold text-white">S</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Stellar</h1>
          <p className="text-sm text-white/40 mt-1 tracking-widest uppercase">DH Signature</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6 border border-white/10"
          style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/40 uppercase tracking-widest">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="mt-1.5 w-full h-11 rounded-xl px-3 text-sm text-white focus:outline-none placeholder-white/20 border border-white/10 transition-colors focus:border-indigo-500/50"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/40 uppercase tracking-widest">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="mt-1.5 w-full h-11 rounded-xl px-3 text-sm text-white focus:outline-none border border-white/10 transition-colors focus:border-indigo-500/50"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="rounded-lg px-3 py-2.5 text-xs text-red-300 border border-red-500/20"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 mt-2"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white', boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.3)' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/15 text-xs mt-8 tracking-wide">
          Stellar by DH Signature · Confidential
        </p>
      </div>
    </div>
  )
}