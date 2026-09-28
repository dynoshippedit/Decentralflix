/**
 * Tests for lib/web3/detect.ts — EIP-6963 discovery + legacy fallback.
 * A fake `window` is installed per-test; everything is SSR-safe by default
 * (node env has no window).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectCoinbaseWallet,
  detectMetaMask,
  hasInjectedWallet,
  listProviders,
  pickProvider,
} from './detect';
import type { DiscoveredProvider, Eip1193Provider } from './types';

const MM_RDNS = 'io.metamask';

function fakeProvider(flags: Record<string, unknown> = {}): Eip1193Provider {
  return {
    request: async () => null,
    ...flags,
  } as unknown as Eip1193Provider;
}

function installWindow(ethereum?: unknown) {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const w: Record<string, unknown> = {
    addEventListener: (t: string, h: (e: unknown) => void) => {
      const arr = listeners.get(t) ?? [];
      arr.push(h);
      listeners.set(t, arr);
    },
    removeEventListener: (t: string, h: (e: unknown) => void) => {
      listeners.set(
        t,
        (listeners.get(t) ?? []).filter((x) => x !== h),
      );
    },
    dispatchEvent: (e: { type: string }) => {
      for (const h of listeners.get(e.type) ?? []) h(e);
      return true;
    },
  };
  if (ethereum !== undefined) w['ethereum'] = ethereum;
  (globalThis as Record<string, unknown>)['window'] = w;
  return { listeners };
}

function announce(
  listeners: Map<string, Array<(e: unknown) => void>>,
  detail: { info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193Provider },
) {
  for (const h of listeners.get('eip6963:announceProvider') ?? []) {
    h({ type: 'eip6963:announceProvider', detail });
  }
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)['window'];
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['window'];
});

describe('SSR / no-window safety', () => {
  it('listProviders returns [] with no window', () => {
    expect(listProviders()).toEqual([]);
  });
  it('detectMetaMask / detectCoinbaseWallet return null with no window', () => {
    expect(detectMetaMask()).toBeNull();
    expect(detectCoinbaseWallet()).toBeNull();
  });
  it('hasInjectedWallet is false with no window', () => {
    expect(hasInjectedWallet()).toBe(false);
  });
});

describe('EIP-6963 discovery', () => {
  it('collects announced providers with uuid/name/rdns', () => {
    const { listeners } = installWindow();
    const p1 = fakeProvider();
    const p2 = fakeProvider();
    // Announce AFTER listProviders registers its listener: simulate a wallet
    // that responds to the requestProvider dispatch by announcing synchronously.
    const origDispatch = (globalThis as Record<string, unknown>)['window'] as Record<string, unknown>;
    const w = origDispatch;
    const realDispatch = w['dispatchEvent'] as (e: { type: string }) => boolean;
    w['dispatchEvent'] = (e: { type: string }) => {
      const out = realDispatch(e);
      if (e.type === 'eip6963:requestProvider') {
        announce(listeners, {
          info: { uuid: 'uuid-1', name: 'MetaMask', icon: 'icon', rdns: 'io.metamask' },
          provider: p1,
        });
        announce(listeners, {
          info: { uuid: 'uuid-2', name: 'Phantom', icon: 'icon', rdns: 'app.phantom' },
          provider: p2,
        });
      }
      return out;
    };
    const found = listProviders();
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ uuid: 'uuid-1', name: 'MetaMask', rdns: 'io.metamask', provider: p1 });
    expect(found[1]).toMatchObject({ uuid: 'uuid-2', name: 'Phantom', rdns: 'app.phantom' });
  });

  it('ignores malformed announcements', () => {
    const { listeners } = installWindow();
    announce(listeners, { info: { uuid: '', name: 'X', icon: '', rdns: '' }, provider: fakeProvider() });
    announce(listeners, {
      info: { uuid: 'u', name: 'X', icon: '', rdns: '' },
      provider: { notRequest: true } as unknown as Eip1193Provider,
    });
    expect(listProviders()).toEqual([]);
  });

  it('dedupes by uuid', () => {
    const { listeners } = installWindow();
    const p = fakeProvider();
    const w = (globalThis as Record<string, unknown>)['window'] as Record<string, unknown>;
    const realDispatch = w['dispatchEvent'] as (e: { type: string }) => boolean;
    w['dispatchEvent'] = (e: { type: string }) => {
      const out = realDispatch(e);
      if (e.type === 'eip6963:requestProvider') {
        const d = {
          info: { uuid: 'same', name: 'Dup', icon: '', rdns: 'dup.wallet' },
          provider: p,
        };
        announce(listeners, d);
        announce(listeners, d);
      }
      return out;
    };
    expect(listProviders()).toHaveLength(1);
  });
});

describe('legacy window.ethereum fallback', () => {
  it('falls back to window.ethereum when nothing announces', () => {
    installWindow(fakeProvider({ isMetaMask: true }));
    const found = listProviders();
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('MetaMask');
    expect(detectMetaMask()).not.toBeNull();
  });

  it('detects Coinbase Wallet via isCoinbaseWallet flag', () => {
    installWindow(fakeProvider({ isCoinbaseWallet: true }));
    const cb = detectCoinbaseWallet();
    expect(cb).not.toBeNull();
    expect(cb!.name).toBe('Coinbase Wallet');
    expect(detectMetaMask()).toBeNull();
  });

  it('expands ethereum.providers[] multiplexers', () => {
    const eth = fakeProvider();
    (eth as unknown as Record<string, unknown>)['providers'] = [fakeProvider(), fakeProvider()];
    installWindow(eth);
    expect(listProviders()).toHaveLength(2);
  });

  it('does not double-count a provider seen via 6963 and legacy', () => {
    const p = fakeProvider({ isMetaMask: true });
    const { listeners } = installWindow(p);
    const w = (globalThis as Record<string, unknown>)['window'] as Record<string, unknown>;
    const realDispatch = w['dispatchEvent'] as (e: { type: string }) => boolean;
    w['dispatchEvent'] = (e: { type: string }) => {
      const out = realDispatch(e);
      if (e.type === 'eip6963:requestProvider') {
        announce(listeners, {
          info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
          provider: p,
        });
      }
      return out;
    };
    expect(listProviders()).toHaveLength(1);
  });
});

describe('pickProvider', () => {
  const a: DiscoveredProvider = { uuid: 'a', name: 'MetaMask', rdns: 'io.metamask', provider: fakeProvider() };
  const b: DiscoveredProvider = { uuid: 'b', name: 'Coinbase Wallet', rdns: 'com.coinbase.wallet', provider: fakeProvider() };

  it('returns undefined for an empty list', () => {
    expect(pickProvider([])).toBeUndefined();
  });
  it('returns the first provider when no rdns given', () => {
    expect(pickProvider([a, b])).toBe(a);
  });
  it('matches by rdns (case-insensitive)', () => {
    expect(pickProvider([a, b], 'COM.COINBASE.WALLET')).toBe(b);
  });
  it('matches by wallet name', () => {
    expect(pickProvider([a, b], 'metamask')).toBe(a);
  });
  it('falls back to first when rdns matches nothing', () => {
    expect(pickProvider([a, b], 'nope.wallet')).toBe(a);
  });
});

describe('detectMetaMask / detectCoinbaseWallet via 6963 rdns', () => {
  it('finds MetaMask by rdns substring', () => {
    const { listeners } = installWindow();
    const w = (globalThis as Record<string, unknown>)['window'] as Record<string, unknown>;
    const realDispatch = w['dispatchEvent'] as (e: { type: string }) => boolean;
    w['dispatchEvent'] = (e: { type: string }) => {
      const out = realDispatch(e);
      if (e.type === 'eip6963:requestProvider') {
        announce(listeners, {
          info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: MM_RDNS },
          provider: fakeProvider(),
        });
      }
      return out;
    };
    expect(detectMetaMask()?.rdns).toBe('io.metamask');
    expect(detectCoinbaseWallet()).toBeNull();
    expect(hasInjectedWallet()).toBe(true);
  });
});
