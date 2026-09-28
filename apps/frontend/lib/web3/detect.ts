/**
 * Wallet detection: EIP-6963 discovery + legacy window.ethereum fallback.
 *
 * All functions are SSR-safe: when `window` is undefined (SSR, node, tests)
 * they return empty results / null instead of throwing.
 */

import type { DiscoveredProvider, Eip1193Provider } from './types';

const ANNOUNCE_EVENT = 'eip6963:announceProvider';
const REQUEST_EVENT = 'eip6963:requestProvider';

interface Eip6963Info {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Eip6963Detail {
  info: Eip6963Info;
  provider: Eip1193Provider;
}

/** SSR guard: the real window, or undefined outside the browser. */
function getWindow(): (Window & typeof globalThis & Record<string, unknown>) | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as unknown as (Window & typeof globalThis & Record<string, unknown>);
}

/**
 * Discover injected wallets.
 *
 * 1. Registers a one-shot EIP-6963 `announceProvider` listener,
 * 2. dispatches `requestProvider` (injected wallets announce synchronously),
 * 3. falls back to legacy `window.ethereum` (incl. `ethereum.providers[]`)
 *    for wallets that predate EIP-6963.
 *
 * Results are deduplicated by uuid. Safe to call on the server (returns []).
 */
export function listProviders(): DiscoveredProvider[] {
  const w = getWindow();
  if (!w) return [];

  const found = new Map<string, DiscoveredProvider>();

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    if (!detail || !detail.info || !detail.provider) return;
    const { uuid, name, rdns } = detail.info;
    if (!uuid || typeof detail.provider.request !== 'function') return;
    found.set(uuid, {
      uuid,
      name: name || 'Unknown wallet',
      rdns: rdns || '',
      provider: detail.provider,
    });
  };

  try {
    w.addEventListener(ANNOUNCE_EVENT, onAnnounce as EventListener);
    w.dispatchEvent(new CustomEvent<Eip6963Detail>(REQUEST_EVENT));
  } catch {
    // A hostile or partial DOM shim must not break detection.
  } finally {
    try {
      w.removeEventListener(ANNOUNCE_EVENT, onAnnounce as EventListener);
    } catch {
      /* ignore */
    }
  }

  // Legacy fallback: window.ethereum (or its providers[] multiplexer).
  const eth = w['ethereum'] as (Eip1193Provider & { providers?: Eip1193Provider[] } & Record<string, unknown>) | undefined;
  const legacy: Eip1193Provider[] = [];
  if (eth && typeof eth.request === 'function') {
    if (Array.isArray(eth.providers) && eth.providers.length > 0) legacy.push(...eth.providers);
    else legacy.push(eth);
  }
  for (const p of legacy) {
    if ([...found.values()].some((d) => d.provider === p)) continue;
    const flags = p as unknown as Record<string, unknown>;
    const name =
      (flags['isMetaMask'] && 'MetaMask') ||
      (flags['isCoinbaseWallet'] && 'Coinbase Wallet') ||
      'Injected wallet';
    found.set(`legacy:${found.size}`, {
      uuid: `legacy:${found.size}`,
      name: name as string,
      rdns: '',
      provider: p,
    });
  }

  return [...found.values()];
}

/**
 * Pick a provider from a discovery list. Prefers an exact rdns (or name)
 * match when given; otherwise returns the first discovered wallet.
 * Pure function — safe anywhere, no window access.
 */
export function pickProvider(
  providers: DiscoveredProvider[],
  rdns?: string,
): DiscoveredProvider | undefined {
  if (providers.length === 0) return undefined;
  if (rdns) {
    const want = rdns.toLowerCase();
    const hit = providers.find(
      (p) => p.rdns.toLowerCase() === want || p.name.toLowerCase() === want,
    );
    if (hit) return hit;
  }
  return providers[0];
}

/** The injected MetaMask provider, or null. SSR-safe. */
export function detectMetaMask(): DiscoveredProvider | null {
  const hit = listProviders().find(
    (p) =>
      p.rdns.toLowerCase().includes('metamask') ||
      (p.provider as unknown as Record<string, unknown>)['isMetaMask'] === true,
  );
  return hit ?? null;
}

/** The injected Coinbase Wallet provider, or null. SSR-safe. */
export function detectCoinbaseWallet(): DiscoveredProvider | null {
  const hit = listProviders().find(
    (p) =>
      p.rdns.toLowerCase().includes('coinbase') ||
      (p.provider as unknown as Record<string, unknown>)['isCoinbaseWallet'] === true,
  );
  return hit ?? null;
}

/** True when at least one wallet is discoverable. SSR-safe. */
export function hasInjectedWallet(): boolean {
  return listProviders().length > 0;
}
