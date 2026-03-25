/**
 * NowPlayingContext
 * 
 * Provides currently-playing Spotify track to any screen.
 * Polling only runs when a token is set (i.e. user is logged into Spotify).
 * 
 * Usage:
 *   1. Wrap your app root with <NowPlayingProvider> (alongside BleProvider, MoodProvider)
 *   2. In playlist.tsx, call setToken(token) after Spotify login
 *   3. In any screen, call useNowPlaying() to get { nowPlaying, token, setToken }
 */

import React, {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from 'react';
import { getNowPlaying, NowPlaying } from '@/lib/spotifyApi';

const POLL_MS = 15_000; // 15 s — matches playlist.tsx's previous inline interval

type NowPlayingContextType = {
  nowPlaying:  NowPlaying | null;
  token:       string | null;
  setToken:    (t: string | null) => void;
  refresh:     () => Promise<void>;
};

const NowPlayingContext = createContext<NowPlayingContextType>({
  nowPlaying: null,
  token:      null,
  setToken:   () => {},
  refresh:    async () => {},
});

export function useNowPlaying() {
  return useContext(NowPlayingContext);
}

export function NowPlayingProvider({ children }: { children: React.ReactNode }) {
  const [token,      setToken]      = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) { setNowPlaying(null); return; }
    const np = await getNowPlaying(token);
    setNowPlaying(np);
  }, [token]);

  useEffect(() => {
    refresh();
    if (!token) return;

    timerRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, token]);

  return (
    <NowPlayingContext.Provider value={{ nowPlaying, token, setToken, refresh }}>
      {children}
    </NowPlayingContext.Provider>
  );
}