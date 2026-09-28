/**
 * Typed wrappers for the PayPerView contract (one-off film purchases).
 * One function per contract function. All inputs validated before any
 * chain interaction; writes need a signer, reads accept signer or provider.
 */
import type {
  Contract,
  ContractRunner,
  ContractTransactionResponse,
} from 'ethers';
import { getPayPerView } from '../contracts';
import type { PpvFilm, WriteOverrides } from '../types';
import { reqAddress, reqUint, reqWei } from './validate';

export type { PpvFilm, WriteOverrides };

export async function maxPlatformFeeBps(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getPayPerView(runner);
  return c.MAX_PLATFORM_FEE_BPS() as Promise<bigint>;
}

export async function accruedPlatformFees(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getPayPerView(runner);
  return c.accruedPlatformFees() as Promise<bigint>;
}

/** Buy access to a film. `valueWei` must cover the film price. */
export async function buyAccess(
  signer: ContractRunner,
  filmId: number | bigint | string,
  valueWei: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.buyAccess(reqUint(filmId, 'filmId'), {
    value: reqWei(valueWei, 'valueWei'),
    ...(overrides ?? {}),
  });
}

export async function filmRevenue(
  runner: ContractRunner,
  filmId: number | bigint | string,
): Promise<bigint> {
  const c: Contract = getPayPerView(runner);
  return c.filmRevenue(reqUint(filmId, 'filmId')) as Promise<bigint>;
}

export async function getFilm(runner: ContractRunner, filmId: number | bigint | string): Promise<PpvFilm> {
  const c: Contract = getPayPerView(runner);
  const r = (await c.getFilm(reqUint(filmId, 'filmId'))) as {
    filmmaker: string; priceWei: bigint; exists: boolean;
  };
  return { filmmaker: r.filmmaker, priceWei: BigInt(r.priceWei), exists: r.exists };
}

export async function hasAccess(
  runner: ContractRunner,
  user: string,
  filmId: number | bigint | string,
): Promise<boolean> {
  const c: Contract = getPayPerView(runner);
  return c.hasAccess(reqAddress(user, 'user'), reqUint(filmId, 'filmId')) as Promise<boolean>;
}

export async function owner(runner: ContractRunner): Promise<string> {
  const c: Contract = getPayPerView(runner);
  return c.owner() as Promise<string>;
}

export async function platformFeeBps(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getPayPerView(runner);
  return c.platformFeeBps() as Promise<bigint>;
}

/** Register a film with its price in wei (owner only). */
export async function registerFilm(
  signer: ContractRunner,
  filmId: number | bigint | string,
  priceWei: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.registerFilm(reqUint(filmId, 'filmId'), reqWei(priceWei, 'priceWei'), {
    ...(overrides ?? {}),
  });
}

export async function renounceOwnership(
  signer: ContractRunner,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.renounceOwnership({ ...(overrides ?? {}) });
}

/** Update a film's price in wei (owner only). */
export async function setFilmPrice(
  signer: ContractRunner,
  filmId: number | bigint | string,
  newPriceWei: bigint,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.setFilmPrice(reqUint(filmId, 'filmId'), reqWei(newPriceWei, 'newPriceWei'), {
    ...(overrides ?? {}),
  });
}

/** Set the platform fee in basis points (owner only, ≤ 10000). */
export async function setPlatformFeeBps(
  signer: ContractRunner,
  newFeeBps: number | bigint | string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  const bps = reqUint(newFeeBps, 'newFeeBps');
  if (bps > BigInt(10000)) {
    throw new Error(`newFeeBps: basis points must be ≤ 10000 (100%), got ${bps}`);
  }
  return c.setPlatformFeeBps(bps, { ...(overrides ?? {}) });
}

export async function transferOwnership(
  signer: ContractRunner,
  newOwner: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.transferOwnership(reqAddress(newOwner, 'newOwner'), { ...(overrides ?? {}) });
}

/** Withdraw accrued platform fees (owner only). */
export async function withdrawPlatformFees(
  signer: ContractRunner,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.withdrawPlatformFees({ ...(overrides ?? {}) });
}

/** Withdraw a film's revenue to its filmmaker (owner only). */
export async function withdrawRevenue(
  signer: ContractRunner,
  filmId: number | bigint | string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.withdrawRevenue(reqUint(filmId, 'filmId'), { ...(overrides ?? {}) });
}
