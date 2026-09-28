# ethers v6 wallet layer (Phase 2, step 4)

A standalone, import-safe wallet layer for the four Phase 2 contracts —
`TicketNFT`, `SubscriptionManager`, `PayPerView`, `DFLIX` — built on
ethers.js v6. It lives **alongside** the existing wagmi/viem + Privy stack;
nothing existing was rewired.

## Layout

```
lib/web3/
  types.ts            shared types (Eip1193Provider, DiscoveredProvider, views)
  detect.ts           EIP-6963 discovery + legacy window.ethereum fallback
  connect.ts          connectWallet / getChainId / switchChain / event subs
  contracts.ts        factories -> ethers.Contract (UNDEPLOYED guard)
  wrappers/
    validate.ts       input validation + ethToWei helpers
    ticketNft.ts      1:1 typed wrappers for TicketNFT
    subscriptionManager.ts
    payPerView.ts
    dflix.ts
  useWeb3Wallet.ts    React hook: connect / disconnect / live account+chain state
  index.ts            barrel
```

## Graceful degradation

Every module is import-safe with **no wallet and no `window`** (SSR, node,
tests): detection returns `[]`/`null`, the hook renders disconnected, and the
factories throw `UndeployedError` (not a silent mis-call) until real
addresses exist.

## Addresses (UNDEPLOYED until step 9)

`lib/contracts/config.ts` gained a Phase 2 section:

- `TICKET_NFT_ADDRESS` ← `NEXT_PUBLIC_TICKET_NFT_ADDRESS`
- `SUBSCRIPTION_MANAGER_ADDRESS` ← `NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS`
- `PAY_PER_VIEW_ADDRESS` ← `NEXT_PUBLIC_PAY_PER_VIEW_ADDRESS`
- `DFLIX_ADDRESS` ← `NEXT_PUBLIC_DFLIX_ADDRESS`

All default to the zero address. Step 9 (Sepolia testnet deploy) fills them in
via env vars; until then every factory throws:

```
UndeployedError: UNDEPLOYED: TicketNFT has no deployed address configured.
Set the NEXT_PUBLIC_TICKET_NFT_ADDRESS env var ...
```

## Quick start

```ts
import { useWeb3Wallet } from '@/lib/web3';
import * as ticketNft from '@/lib/web3/wrappers/ticketNft';
import { ethToWei } from '@/lib/web3/wrappers/validate';

function BuyTicket({ filmId }: { filmId: number }) {
  const { signer, address, isConnected, connect } = useWeb3Wallet();
  return (
    <button
      onClick={async () => {
        if (!isConnected) return connect('io.metamask'); // or connect() for first wallet
        const film = await ticketNft.getFilm(signer!, filmId);
        await ticketNft.mintTicket(signer!, filmId, film.priceWei); // pays exact price
      }}
    >
      {isConnected ? `Buy (${address})` : 'Connect wallet'}
    </button>
  );
}
```

Chain switching (Sepolia / Arbitrum Sepolia supported with add-chain fallback):

```ts
import { switchChain, SEPOLIA_CHAIN_ID } from '@/lib/web3';
await switchChain(rawProvider, SEPOLIA_CHAIN_ID);
```

## Integration point for the existing UI

- `components/WalletConnectButton` and the Privy flows are untouched.
  When the team is ready, the Phase 2 surfaces (ticket purchase, subscribe,
  PPV buy, DFLIX stake/claim) can call `useWeb3Wallet().connect()` and the
  wrappers above; or the hook can feed `signer` into existing components.
- wagmi/viem and this ethers layer share the same injected provider without
  conflict (both are read-only views over `window.ethereum`); just don't run
  two simultaneous `eth_requestAccounts` prompts for the same action.

## Tests

`npx vitest run lib/web3` — mocked EIP-1193 provider + EIP-6963 announcement
flow; stub-contract call assertions per wrapper; UNDEPLOYED errors; SSR safety.
