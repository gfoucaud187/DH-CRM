'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/log-activity';
import './login.css';

interface Star {
  top: string;
  left: string;
  size: string;
  opacity: number;
  duration: string;
  delay: string;
}

function generateStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const size = Math.random() * 2.5 + 0.5;
    stars.push({
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: `${size}px`,
      opacity: Math.random() * 0.65 + 0.15,
      duration: `${Math.random() * 3 + 2}s`,
      delay: `${Math.random() * 4}s`,
    });
  }
  return stars;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stars, setStars] = useState<Star[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setStars(generateStars(160));
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data?.user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      await logActivity({ action: 'login', entityType: 'auth' });

      if (profile?.role === 'customer') {
        router.push('/portal/dashboard');
      } else {
        router.push('/dashboard');
      }
    }
  };

  return (
    <div className="login-root">
      <svg className="orbit-rings" viewBox="0 0 1000 1000">
        <g fill="none" stroke="rgba(167,139,250,.1)" strokeWidth="1.2">
          <circle cx="500" cy="500" r="230" />
          <circle cx="500" cy="500" r="350" />
          <circle cx="500" cy="500" r="480" />
        </g>
      </svg>

      <div className="atmosphere-glow" />

      {mounted && (
        <div className="stars-layer">
          {stars.map((star, i) => (
            <div
              key={i}
              className="star"
              style={{
                top: star.top,
                left: star.left,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                ['--dur' as string]: star.duration,
                ['--del' as string]: star.delay,
              }}
            />
          ))}
        </div>
      )}

      <div className="content">
        <div className="logo-block">
          <div className="logo-icon-wrap">
            <div className="logo-aura" />
            <div className="logo-icon">
              <svg viewBox="0 0 100 100" style={{ width: 52, height: 52, overflow: 'visible', filter: 'drop-shadow(0 1px 6px rgba(60,28,150,.55))' }}>
                <path d="M50 3 C53.5 35 64 46.5 97 50 C64 53.5 53.5 64 50 97 C46.5 64 36 53.5 3 50 C36 46.5 46.5 35 50 3 Z" fill="#fff" />
                <path d="M50 3 C53.5 35 64 46.5 97 50 C64 53.5 53.5 64 50 97 C46.5 64 36 53.5 3 50 C36 46.5 46.5 35 50 3 Z" transform="translate(62 2) scale(0.23)" fill="#fff" opacity="0.92" />
              </svg>
            </div>
          </div>
          <div className="logo-title">Stellar</div>
          <div className="logo-subtitle">DH Signature</div>
        </div>

        <div className="card">
          {error && <div className="error-msg">{error}</div>}

          <form onSubmit={handleLogin}>
            <label className="field-label">Email</label>
            <input
              type="email"
              className="field-input"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div className="field-gap-sm" />

            <label className="field-label">Password</label>
            <input
              type="password"
              className="field-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <div className="field-gap-md" />

            <button type="submit" className="btn-signin" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <div className="footer-text">Stellar by DH Signature · Confidential</div>
      </div>
    </div>
  );
}