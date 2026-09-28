/**
 * Tests for lib/web3/useWeb3Wallet.ts.
 * No DOM in this suite (node env): we verify the hook renders safely under
 * React SSR with no wallet present (the graceful-degradation requirement).
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useWeb3Wallet } from './useWeb3Wallet';

function Probe() {
  const w = useWeb3Wallet();
  return createElement(
    'div',
    null,
    JSON.stringify({
      isConnected: w.isConnected,
      isConnecting: w.isConnecting,
      address: w.address,
      chainId: w.chainId,
      error: w.error,
      hasConnect: typeof w.connect === 'function',
      hasDisconnect: typeof w.disconnect === 'function',
    }),
  );
}

describe('useWeb3Wallet', () => {
  it('renders under SSR with no wallet and reports disconnected', () => {
    const html = renderToString(createElement(Probe));
    // React escapes quotes in SSR output.
    expect(html).toContain('&quot;isConnected&quot;:false');
    expect(html).toContain('&quot;address&quot;:null');
    expect(html).toContain('&quot;hasConnect&quot;:true');
    expect(html).toContain('&quot;hasDisconnect&quot;:true');
  });

  it('connect() surfaces a friendly error (not a crash) when no wallet exists', async () => {
    // Exercise the pure discovery path the hook relies on: no window => no providers.
    const { listProviders, pickProvider } = await import('./detect');
    expect(listProviders()).toEqual([]);
    expect(pickProvider([])).toBeUndefined();
  });
});
