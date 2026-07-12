'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'

export default function PortalLoginPage() {
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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) { setError(signInError.message); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Could not get user'); setLoading(false); return }
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles').select('role, customer_id').eq('id', user.id).single()
    if (profileError) { setError('Profile error: ' + profileError.message); setLoading(false); return }
    if (profile?.role === 'client') {
      await logActivity({
        action: 'login',
        entityType: 'auth',
        entityRef: email,
        metadata: { role: 'client', customer_id: profile.customer_id },
      })
      router.push('/portal/dashboard')
    } else {
      await supabase.auth.signOut()
      setError('This portal is for distributors only.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white tracking-tight">dh.</div>
          <div className="text-xs text-gray-500 font-bold tracking-widest mt-1">SIGNATURE</div>
          <p className="text-gray-400 text-sm mt-4">Client Portal</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="mt-1.5 w-full h-10 rounded-lg bg-gray-800 border border-gray-700 px-3 text-sm text-white focus:outline-none focus:border-gray-500 placeholder-gray-600"
                placeholder="your@email.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="mt-1.5 w-full h-10 rounded-lg bg-gray-800 border border-gray-700 px-3 text-sm text-white focus:outline-none focus:border-gray-500"
                placeholder="••••••••" />
            </div>
            {error && <p className="text-red-400 text-xs bg-red-950 p-2 rounded">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full h-10 rounded-lg bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 transition-colors mt-2">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
        <div className="text-center mt-4 space-y-2">
          <p className="text-gray-600 text-xs">DH Signature · Trade Portal · Confidential</p>
          <Link href="/login" className="text-gray-500 text-xs hover:text-gray-300 underline block">
            Admin login →
          </Link>
        </div>
      </div>
    </div>
  )
}