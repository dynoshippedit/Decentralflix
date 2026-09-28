/**
 * Typed wrappers for the TicketNFT contract (ERC-721 film access tickets).
 * One function per contract function. All inputs are validated before any
 * chain interaction; writes need a signer, reads accept signer or provider.
 */
import type {
  Contract,
  ContractRunner,
  ContractTransactionResponse,
} from 'ethers';
import { getTicketNFT } from '../contracts';
import type { TicketFilm, WriteOverrides } from '../types';
import {
  reqAddress,
  reqBool,
  reqBytes,
  reqBytes4,
  reqNonEmptyString,
  reqUint,
  reqWei,
} from './validate';

export type { TicketFilm, WriteOverrides };

// ── reads ────────────────────────────────────────────────────────────────────

/** ERC-721 approve spender for a token (write). */
export async function approve(
  signer: ContractRunner,
  to: string,
  tokenId: number | bigint | string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.approve(reqAddress(to, 'to'), reqUint(tokenId, 'tokenId'), { ...(overrides ?? {}) });
}

export async function balanceOf(runner: ContractRunner, owner: string): Promise<bigint> {
  const c: Contract = getTicketNFT(runner);
  return c.balanceOf(reqAddress(owner, 'owner')) as Promise<bigint>;
}

export async function getApproved(runner: ContractRunner, tokenId: number | bigint | string): Promise<string> {
  const c: Contract = getTicketNFT(runner);
  return c.getApproved(reqUint(tokenId, 'tokenId')) as Promise<string>;
}

export async function getFilm(runner: ContractRunner, filmId: number | bigint | string): Promise<TicketFilm> {
  const c: Contract = getTicketNFT(runner);
  const r = (await c.getFilm(reqUint(filmId, 'filmId'))) as {
    title: string; priceWei: bigint; filmmaker: string; active: boolean;
    soulbound: boolean; metadataURI: string; exists: boolean;
  };
  return {
    title: r.title, priceWei: BigInt(r.priceWei), filmmaker: r.filmmaker,
    active: r.active, soulbound: r.soulbound, metadataURI: r.metadataURI, exists: r.exists,
  };
}

export async function hasValidTicket(
  runner: ContractRunner,
  holder: string,
  filmId: number | bigint | string,
): Promise<boolean> {
  const c: Contract = getTicketNFT(runner);
  return c.hasValidTicket(reqAddress(holder, 'holder'), reqUint(filmId, 'filmId')) as Promise<boolean>;
}

export async function isApprovedForAll(
  runner: ContractRunner,
  owner: string,
  operator: string,
): Promise<boolean> {
  const c: Contract = getTicketNFT(runner);
  return c.isApprovedForAll(reqAddress(owner, 'owner'), reqAddress(operator, 'operator')) as Promise<boolean>;
}

/** Mint a ticket for a film. `valueWei` must cover the film price. */
export async function mintTicket(
  signer: ContractRunner,
  filmId: number | bigint | string,
  valueWei: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.mintTicket(reqUint(filmId, 'filmId'), { value: reqWei(valueWei, 'valueWei'), ...(overrides ?? {}) });
}

export async function name(runner: ContractRunner): Promise<string> {
  const c: Contract = getTicketNFT(runner);
  return c.name() as Promise<string>;
}

export async function nextTokenId(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getTicketNFT(runner);
  return c.nextTokenId() as Promise<bigint>;
}

export async function owner(runner: ContractRunner): Promise<string> {
  const c: Contract = getTicketNFT(runner);
  return c.owner() as Promise<string>;
}

export async function ownerOf(runner: ContractRunner, tokenId: number | bigint | string): Promise<string> {
  const c: Contract = getTicketNFT(runner);
  return c.ownerOf(reqUint(tokenId, 'tokenId')) as Promise<string>;
}

/** Burn/redeem a ticket after use. */
export async function redeemTicket(
  signer: ContractRunner,
  tokenId: number | bigint | string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.redeemTicket(reqUint(tokenId, 'tokenId'), { ...(overrides ?? {}) });
}

/** Register a film (owner only). */
export async function registerFilm(
  signer: ContractRunner,
  filmId: number | bigint | string,
  title: string,
  priceWei: bigint,
  filmmaker: string,
  soulbound: boolean,
  metadataURI: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.registerFilm(
    reqUint(filmId, 'filmId'),
    reqNonEmptyString(title, 'title'),
    reqWei(priceWei, 'priceWei'),
    reqAddress(filmmaker, 'filmmaker'),
    reqBool(soulbound, 'soulbound'),
    reqNonEmptyString(metadataURI, 'metadataURI'),
    { ...(overrides ?? {}) },
  );
}

export async function renounceOwnership(
  signer: ContractRunner,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.renounceOwnership({ ...(overrides ?? {}) });
}

/** Safe transfer, 3-arg overload (no data). */
export async function safeTransferFrom(
  signer: ContractRunner,
  from: string,
  to: string,
  tokenId: number | bigint | string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  const fn = c.getFunction('safeTransferFrom(address,address,uint256)');
  return fn(reqAddress(from, 'from'), reqAddress(to, 'to'), reqUint(tokenId, 'tokenId'), {
    ...(overrides ?? {}),
  }) as Promise<ContractTransactionResponse>;
}

/** Safe transfer, 4-arg overload (with bytes data). */
export async function safeTransferFromWithData(
  signer: ContractRunner,
  from: string,
  to: string,
  tokenId: number | bigint | string,
  data: string | Uint8Array,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  const fn = c.getFunction('safeTransferFrom(address,address,uint256,bytes)');
  return fn(
    reqAddress(from, 'from'),
    reqAddress(to, 'to'),
    reqUint(tokenId, 'tokenId'),
    reqBytes(data, 'data'),
    { ...(overrides ?? {}) },
  ) as Promise<ContractTransactionResponse>;
}

export async function setApprovalForAll(
  signer: ContractRunner,
  operator: string,
  approved: boolean,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.setApprovalForAll(reqAddress(operator, 'operator'), reqBool(approved, 'approved'), {
    ...(overrides ?? {}),
  });
}

/** Activate/deactivate a film listing (owner only). */
export async function setFilmActive(
  signer: ContractRunner,
  filmId: number | bigint | string,
  active: boolean,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.setFilmActive(reqUint(filmId, 'filmId'), reqBool(active, 'active'), { ...(overrides ?? {}) });
}

/** Update a film's ticket price in wei (owner only). */
export async function setFilmPrice(
  signer: ContractRunner,
  filmId: number | bigint | string,
  newPriceWei: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.setFilmPrice(reqUint(filmId, 'filmId'), reqWei(newPriceWei, 'newPriceWei'), {
    ...(overrides ?? {}),
  });
}

export async function supportsInterface(runner: ContractRunner, interfaceId: string): Promise<boolean> {
  const c: Contract = getTicketNFT(runner);
  return c.supportsInterface(reqBytes4(interfaceId, 'interfaceId')) as Promise<boolean>;
}

export async function symbol(runner: ContractRunner): Promise<string> {
  const c: Contract = getTicketNFT(runner);
  return c.symbol() as Promise<string>;
}

export async function ticketFilm(runner: ContractRunner, tokenId: number | bigint | string): Promise<bigint> {
  const c: Contract = getTicketNFT(runner);
  return c.ticketFilm(reqUint(tokenId, 'tokenId')) as Promise<bigint>;
}

export async function tokenURI(runner: ContractRunner, tokenId: number | bigint | string): Promise<string> {
  const c: Contract = getTicketNFT(runner);
  return c.tokenURI(reqUint(tokenId, 'tokenId')) as Promise<string>;
}

export async function transferFrom(
  signer: ContractRunner,
  from: string,
  to: string,
  tokenId: number | bigint | string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.transferFrom(reqAddress(from, 'from'), reqAddress(to, 'to'), reqUint(tokenId, 'tokenId'), {
    ...(overrides ?? {}),
  });
}

export async function transferOwnership(
  signer: ContractRunner,
  newOwner: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getTicketNFT(signer);
  return c.transferOwnership(reqAddress(newOwner, 'newOwner'), { ...(overrides ?? {}) });
}

export async function validTicketCount(
  runner: ContractRunner,
  holder: string,
  filmId: number | bigint | string,
): Promise<bigint> {
  const c: Contract = getTicketNFT(runner);
  return c.validTicketCount(reqAddress(holder, 'holder'), reqUint(filmId, 'filmId')) as Promise<bigint>;
}
