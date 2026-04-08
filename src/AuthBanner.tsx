import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthBannerProps {
  user: User | null;
}

export function AuthBanner({ user }: AuthBannerProps) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('neura_auth_skipped') === '1'
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const isAnonymous = !user || user.is_anonymous;
  const email = user?.email;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const initial = email?.[0]?.toUpperCase() ?? '?';

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://neuramap.io' },
    });
  };

  const handleSkip = () => {
    sessionStorage.setItem('neura_auth_skipped', '1');
    setDismissed(true);
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    // App will re-create an anonymous session via onAuthStateChange
  };

  // ── Signed-in user: avatar + dropdown near the logo ──────────────────────
  if (!isAnonymous) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 'max(28px, env(safe-area-inset-top))',
          left: 64,
          zIndex: 2000,
        }}
      >
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '1.5px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.06)',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
              {initial}
            </span>
          )}
        </button>

        {menuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 2001 }}
              onClick={() => setMenuOpen(false)}
            />
            <div
              style={{
                position: 'absolute',
                top: 34,
                left: 0,
                background: 'rgba(8,10,18,0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 11,
                padding: '6px 0',
                minWidth: 190,
                boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                zIndex: 2002,
              }}
            >
              {email && (
                <div
                  style={{
                    padding: '7px 14px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.35)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      marginBottom: 3,
                    }}
                  >
                    Signed in as
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.7)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {email}
                  </div>
                </div>
              )}
              <button
                onClick={handleSignOut}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 14px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.88)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)'; }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Anonymous: one-time sign-in prompt ────────────────────────────────────
  if (dismissed) return null;

  return (
    <>
      <style>{`
        @keyframes authBannerEnter {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(max(20px, env(safe-area-inset-bottom)) + 92px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 500,
          animation: 'authBannerEnter 0.45s cubic-bezier(0.34,1.56,0.64,1) both',
          animationDelay: '1.2s',
          opacity: 0,
        }}
      >
        <div
          style={{
            background: 'rgba(6,8,16,0.93)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 14,
            padding: '12px 16px 10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 9,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Save your maps
          </div>

          <button
            onClick={handleSignIn}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.88)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              transition: 'background 0.15s, border-color 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.13)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.26)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.14)';
            }}
          >
            <GoogleIcon />
            Sign in with Google
          </button>

          <button
            onClick={handleSkip}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.25)',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: '0.05em',
              padding: '1px 0 3px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; }}
          >
            Continue without account
          </button>
        </div>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.45 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
