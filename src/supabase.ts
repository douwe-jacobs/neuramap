import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Safari normal mode: navigator.locks can deadlock the Supabase auth client.
// When a previous page load is frozen in Safari's Back/Forward Cache (BFCache)
// while holding the session lock, new calls to navigator.locks.request() with
// acquireTimeout=-1 (wait forever) block indefinitely — getSession() never
// resolves and onAuthStateChange never fires, leaving the app on the loading screen.
//
// Fix: provide a custom lock that caps the wait at 3 seconds. If the lock
// can't be acquired (stale BFCache holder), we warn and run without cross-tab
// session protection. Within-instance serialization is still handled by
// GoTrueClient's lockAcquired flag + pendingInLock queue.
async function lockWithBFCacheGuard(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return fn();
  }

  if (acquireTimeout === 0) {
    return navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error(`Lock "${name}" not immediately available`);
      return fn();
    });
  }

  // Map acquireTimeout=-1 (wait forever) to 3 s to prevent BFCache deadlock.
  const ms = acquireTimeout > 0 ? acquireTimeout : 3000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);

  try {
    return await navigator.locks.request(name, { mode: 'exclusive', signal: ac.signal }, fn);
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.warn('[neura] session lock timed out (Safari BFCache) — proceeding without cross-tab lock');
      return fn();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.localStorage,
    lock: lockWithBFCacheGuard,
  },
});
