'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getVideoSignedUrl, VideoAccessError } from '@/lib/cloudflare-access';

export interface VideoAccessState {
  hasAccess: boolean;
  loading: boolean;
  signedUrl: string | null;
  needsMint: boolean;
  mintUrl: string | null;
  error: string | null;
}

const initialState: VideoAccessState = {
  hasAccess: false,
  loading: true,
  signedUrl: null,
  needsMint: false,
  mintUrl: null,
  error: null,
};

/**
 * useVideoAccess
 *
 * React hook that orchestrates NFT-gated video access via Cloudflare Worker signed URLs.
 *
 * - Uses Privy access token when available.
 * - In simulation mode (explicit demo or no real Worker config - reduced per critical fix/review) returns a playable stream immediately.
 * - Exposes clear loading / needsMint / error states for the UI (Watch page, Film detail, etc.).
 */
export function useVideoAccess(filmHash: string): VideoAccessState {
  const { getAccessToken, authenticated } = usePrivy();
  const [state, setState] = useState<VideoAccessState>(initialState);

  const refresh = useCallback(async () => {
    if (!filmHash) {
      setState({ ...initialState, loading: false });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      let token: string | null = null;
      if (authenticated) {
        try {
          token = await getAccessToken();
        } catch {
          // Privy not fully ready — proceed without token (simulation will handle)
        }
      }

      const url = await getVideoSignedUrl(filmHash, token);

      if (url) {
        setState({
          hasAccess: true,
          loading: false,
          signedUrl: url,
          needsMint: false,
          mintUrl: null,
          error: null,
        });
      } else {
        setState({
          hasAccess: false,
          loading: false,
          signedUrl: null,
          needsMint: true,
          mintUrl: `/mint?film=${encodeURIComponent(filmHash)}`,
          error: null,
        });
      }
    } catch (err: any) {
      if (err && err.needsMint) {
        setState({
          hasAccess: false,
          loading: false,
          signedUrl: null,
          needsMint: true,
          mintUrl: err.mintUrl || `/mint?film=${encodeURIComponent(filmHash)}`,
          error: err.message || null,
        });
        return;
      }

      // Unexpected error — surface it but keep the UI usable
      setState({
        hasAccess: false,
        loading: false,
        signedUrl: null,
        needsMint: false,
        mintUrl: `/mint?film=${encodeURIComponent(filmHash)}`,
        error: err?.message || 'Failed to verify access',
      });
    }
  }, [filmHash, authenticated, getAccessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return state;
}
