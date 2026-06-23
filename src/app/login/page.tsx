'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Star {
  style: React.CSSProperties;
}

function generateStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const size = Math.random() * 2.5 + 0.5;
    const opacity = Math.random() * 0.65 + 0.15;
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const delay = Math.random() * 4;
    const duration = Math.random() * 3 + 2;
    stars.push({
      style: {
        position: 'absolute',
        borderRadius: '50%',
        width: `${size}px`,
        height: `${size}px`,
        top: `${top}%`,
        left: `${left}%`,
        background: 'white',
        opacity,
        animation: `twinkle ${duration}s ${delay}s infinite alternate ease-in-out`,
      },
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
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  useEffect(() => {
    setStars(generateStars(160));
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
      // Check if admin or portal user
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profile?.role === 'customer') {
        router.push('/portal/dashboard');
      } else {
        router.push('/dashboard');
      }
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #080612; }

        @keyframes twinkle {
          0%   { opacity: var(--op-from); transform: scale(1); }
          100% { opacity: var(--op-to);   transform: scale(1.4); }
        }

        .login-root {
          position: relative;
          width: 100vw;
          min-height: 100vh;
          overflow: hidden;
          background: radial-gradient(110% 78% at 50% 132%, #5b21b6 0%, #2e1563 19%, #150e30 49%, #080612 100%);
          font-family: 'Space Grotesk', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .orbit-rings {
          position: absolute;
          left: 50%;
          top: 55%;
          width: 900px;
          height: 900px;
          transform: translate(-50%, -50%);
          z-index: 1;
          opacity: 0.55;
          pointer-events: none;
        }

        .atmosphere-glow {
          position: absolute;
          left: 50%;
          top: -8%;
          width: 380px;
          height: 440px;
          transform: translateX(-50%);
          z-index: 1;
          background: radial-gradient(50% 60% at 50% 0%, rgba(167,139,250,.18), transparent 70%);
          filter: blur(8px);
          pointer-events: none;
        }

        .stars-layer {
          position: absolute;
          inset: 0;
          z-index: 2;
          overflow: hidden;
          pointer-events: none;
        }

        .content {
          position: relative;
          z-index: 3;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          padding: 40px 20px;
        }

        /* ---- Logo block ---- */
        .logo-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 40px;
        }

        .logo-icon-wrap {
          position: relative;
          margin-bottom: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-aura {
          position: absolute;
          left: 50%; top: 50%;
          width: 220px; height: 220px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(150,110,250,.5), transparent 62%);
          filter: blur(13px);
        }

        .logo-icon {
          position: relative;
          width: 98px;
          height: 98px;
          border-radius: 27px;
          background: linear-gradient(155deg, #B89CFF 0%, #7C5CFF 46%, #5B30D6 100%);
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,.5),
            0 0 0 1px rgba(255,255,255,.08),
            0 22px 50px -10px rgba(124,92,255,.8);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-title {
          font-size: 46px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #fff;
          margin-bottom: 13px;
          line-height: 1;
        }

        .logo-subtitle {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: #9a93b8;
          line-height: 1;
        }

        /* ---- Card ---- */
        .card {
          width: 100%;
          max-width: 500px;
          background: rgba(12,8,28,.32);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 22px;
          padding: 36px 40px 40px;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          box-shadow: 0 30px 90px -24px rgba(0,0,0,.75);
        }

        .field-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #9a95b8;
          margin-bottom: 12px;
          display: block;
        }

        .field-input {
          width: 100%;
          height: 56px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.05);
          padding: 0 18px;
          font-size: 15px;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 400;
          color: #fff;
          outline: none;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
          display: block;
        }

        .field-input::placeholder {
          color: rgba(255,255,255,.28);
        }

        .field-input:focus,
        .field-input.focused {
          border: 1px solid rgba(167,139,250,.8);
          background: rgba(124,92,255,.12);
          box-shadow: 0 0 0 4px rgba(124,92,255,.18);
        }

        .field-gap-sm { height: 22px; }
        .field-gap-md { height: 30px; }

        .btn-signin {
          width: 100%;
          height: 58px;
          border: none;
          border-radius: 14px;
          background: linear-gradient(180deg, #9B7BFF, #6D44E8);
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          font-family: 'Space Grotesk', sans-serif;
          cursor: pointer;
          box-shadow:
            0 14px 36px -8px rgba(124,92,255,.85),
            inset 0 1px 0 rgba(255,255,255,.4);
          transition: filter 0.15s, box-shadow 0.15s, opacity 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .btn-signin:hover:not(:disabled) {
          filter: brightness(1.08);
          box-shadow:
            0 18px 44px -8px rgba(124,92,255,1),
            inset 0 1px 0 rgba(255,255,255,.45);
        }

        .btn-signin:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .error-msg {
          margin-bottom: 18px;
          padding: 12px 16px;
          border-radius: 12px;
          background: rgba(220,38,38,.15);
          border: 1px solid rgba(220,38,38,.3);
          color: #fca5a5;
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        }

        .footer-text {
          margin-top: 26px;
          font-size: 13px;
          font-weight: 500;
          color: #7a749a;
          text-align: center;
        }

        /* Spinner */
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 540px) {
          .card { padding: 28px 20px 32px; border-radius: 18px; }
          .logo-title { font-size: 36px; }
          .orbit-rings { width: 600px; height: 600px; }
        }
      `}</style>

      <div className="login-root">
        {/* Orbit rings */}
        <svg className="orbit-rings" viewBox="0 0 1000 1000">
          <g fill="none" stroke="rgba(167,139,250,.1)" strokeWidth="1.2">
            <circle cx="500" cy="500" r="230" />
            <circle cx="500" cy="500" r="350" />
            <circle cx="500" cy="500" r="480" />
          </g>
        </svg>

        {/* Atmosphere glow */}
        <div className="atmosphere-glow" />

        {/* Stars */}
        <div className="stars-layer">
          {stars.map((star, i) => (
            <div key={i} style={star.style} />
          ))}
        </div>

        {/* Content */}
        <div className="content">
          {/* Logo */}
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

          {/* Card */}
          <div className="card">
            {error && (
              <div className="error-msg">{error}</div>
            )}

            <form onSubmit={handleLogin}>
              <label className="field-label">Email</label>
              <input
                type="email"
                className={`field-input${emailFocused ? ' focused' : ''}`}
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                required
                autoComplete="email"
              />

              <div className="field-gap-sm" />

              <label className="field-label">Password</label>
              <input
                type="password"
                className={`field-input${passwordFocused ? ' focused' : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
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
    </>
  );
}