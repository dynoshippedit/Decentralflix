/**
 * Tests for lib/web3/connect.ts using a mock EIP-1193 provider.
 * connectWallet() runs against the REAL ethers v6 BrowserProvider to prove
 * the wiring works; switchChain payloads are asserted verbatim.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ARBITRUM_SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  connectWallet,
  getChainId,
  onAccountsChanged,
  onChainChanged,
  switchChain,
} from './connect';
import type { Eip1193Provider } from './types';

const ADDR = '0x1111111111111111111111111111111111111111';

interface MockEip1193 extends Eip1193Provider {
  __calls: Array<{ method: string; params?: unknown }>;
  __emit: (event: string, ...args: unknown[]) => void;
}

function mockEip1193(handlers: Record<string, (params?: unknown) => unknown>): MockEip1193 {
  const calls: Array<{ method: string; params?: unknown }> = [];
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>();
  const p = {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
      calls.push({ method, params });
      const h = handlers[method];
      if (!h) throw new Error(`unexpected method: ${method}`);
      return h(params);
    },
    on: (ev: string, cb: (...a: unknown[]) => void) => {
      const arr = listeners.get(ev) ?? [];
      arr.push(cb);
      listeners.set(ev, arr);
    },
    removeListener: (ev: string, cb: (...a: unknown[]) => void) => {
      listeners.set(
        ev,
        (listeners.get(ev) ?? []).filter((x) => x !== cb),
      );
    },
    __calls: calls,
    __emit: (ev: string, ...args: unknown[]) => {
      for (const cb of listeners.get(ev) ?? []) cb(...args);
    },
  };
  return p as MockEip1193;
}

const connectedHandlers = () => ({
  eth_requestAccounts: () => [ADDR],
  eth_accounts: () => [ADDR],
  eth_chainId: () => '0xaa36a7', // Sepolia
});

describe('connectWallet', () => {
  it('returns provider, signer, address and numeric chainId', async () => {
    const raw = mockEip1193(connectedHandlers());
    const conn = await connectWallet(raw);
    expect(conn.address.toLowerCase()).toBe(ADDR);
    expect(conn.chainId).toBe(SEPOLIA_CHAIN_ID);
    expect(conn.raw).toBe(raw);
    expect(conn.provider).toBeDefined();
    expect(conn.signer).toBeDefined();
    // BrowserProvider may probe eth_chainId on construction; find the accounts request.
    expect(raw.__calls).toContainEqual({ method: 'eth_requestAccounts', params: [] });
  });

  it('throws on an invalid provider', async () => {
    await expect(connectWallet(undefined as unknown as Eip1193Provider)).rejects.toThrow(
      'EIP-1193',
    );
    await expect(connectWallet({} as Eip1193Provider)).rejects.toThrow('EIP-1193');
  });

  it('throws when the wallet returns no accounts', async () => {
    const raw = mockEip1193({ ...connectedHandlers(), eth_requestAccounts: () => [] });
    await expect(connectWallet(raw)).rejects.toThrow('no accounts');
  });

  it('throws a descriptive error when the user rejects', async () => {
    const raw = mockEip1193({
      ...connectedHandlers(),
      eth_requestAccounts: () => {
        throw new Error('user rejected');
      },
    });
    await expect(connectWallet(raw)).rejects.toThrow('eth_requestAccounts failed');
  });
});

describe('getChainId', () => {
  it('parses the hex chain id', async () => {
    const raw = mockEip1193(connectedHandlers());
    expect(await getChainId(raw)).toBe(11155111);
  });

  it('throws on an invalid provider or garbage value', async () => {
    await expect(getChainId({} as Eip1193Provider)).rejects.toThrow('EIP-1193');
    const raw = mockEip1193({ eth_chainId: () => 'garbage' });
    await expect(getChainId(raw)).rejects.toThrow('invalid chain id');
  });
});

describe('switchChain', () => {
  it('requests wallet_switchEthereumChain with 0x hex', async () => {
    const raw = mockEip1193({ wallet_switchEthereumChain: () => null });
    await switchChain(raw, SEPOLIA_CHAIN_ID);
    expect(raw.__calls).toEqual([
      { method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] },
    ]);
  });

  it('falls back to wallet_addEthereumChain on 4902 with Sepolia params', async () => {
    const raw = mockEip1193({
      wallet_switchEthereumChain: () => {
        const e = new Error('unknown chain') as Error & { code: number };
        e.code = 4902;
        throw e;
      },
      wallet_addEthereumChain: () => null,
    });
    await switchChain(raw, SEPOLIA_CHAIN_ID);
    expect(raw.__calls[1]?.method).toBe('wallet_addEthereumChain');
    const params = (raw.__calls[1]?.params as Array<Record<string, unknown>>)[0];
    expect(params).toMatchObject({
      chainId: '0xaa36a7',
      chainName: 'Sepolia',
      nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    });
    expect(params['rpcUrls']).toBeDefined();
    expect(params['blockExplorerUrls']).toBeDefined();
  });

  it('adds Arbitrum Sepolia with the right params on 4902', async () => {
    const raw = mockEip1193({
      wallet_switchEthereumChain: () => {
        const e = new Error('unknown chain') as Error & { code: number };
        e.code = 4902;
        throw e;
      },
      wallet_addEthereumChain: () => null,
    });
    await switchChain(raw, ARBITRUM_SEPOLIA_CHAIN_ID);
    const params = (raw.__calls[1]?.params as Array<Record<string, unknown>>)[0];
    expect(params).toMatchObject({ chainId: '0x66eee', chainName: 'Arbitrum Sepolia' });
  });

  it('throws a clear error for an unconfigured chain on 4902', async () => {
    const raw = mockEip1193({
      wallet_switchEthereumChain: () => {
        const e = new Error('unknown chain') as Error & { code: number };
        e.code = 4902;
        throw e;
      },
    });
    await expect(switchChain(raw, 1)).rejects.toThrow('no add-chain params are configured');
  });

  it('rethrows non-4902 errors', async () => {
    const raw = mockEip1193({
      wallet_switchEthereumChain: () => {
        throw new Error('user said no');
      },
    });
    await expect(switchChain(raw, SEPOLIA_CHAIN_ID)).rejects.toThrow('wallet_switchEthereumChain failed');
  });

  it('validates the chain id', async () => {
    const raw = mockEip1193({});
    await expect(switchChain(raw, -5)).rejects.toThrow('positive integer');
    await expect(switchChain({} as Eip1193Provider, 1)).rejects.toThrow('EIP-1193');
  });
});

describe('event subscriptions', () => {
  it('onAccountsChanged delivers accounts and unsubscribes', () => {
    const raw = mockEip1193({});
    const cb = vi.fn();
    const unsub = onAccountsChanged(raw, cb);
    raw.__emit('accountsChanged', [ADDR]);
    expect(cb).toHaveBeenCalledWith([ADDR]);
    unsub();
    raw.__emit('accountsChanged', ['0x999']);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('onAccountsChanged normalizes non-array payloads to []', () => {
    const raw = mockEip1193({});
    const cb = vi.fn();
    onAccountsChanged(raw, cb);
    raw.__emit('accountsChanged', null);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('onChainChanged delivers numeric chain ids', () => {
    const raw = mockEip1193({});
    const cb = vi.fn();
    const unsub = onChainChanged(raw, cb);
    raw.__emit('chainChanged', '0x66eee');
    expect(cb).toHaveBeenCalledWith(ARBITRUM_SEPOLIA_CHAIN_ID);
    unsub();
    raw.__emit('chainChanged', '0x1');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscription helpers are no-ops without .on', () => {
    const raw = { request: async () => null } as Eip1193Provider;
    const un1 = onAccountsChanged(raw, () => {});
    const un2 = onChainChanged(raw, () => {});
    expect(() => {
      un1();
      un2();
    }).not.toThrow();
  });
});
