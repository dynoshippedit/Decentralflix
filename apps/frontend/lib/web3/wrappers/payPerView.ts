/**
 * Typed wrappers for the PayPerView contract (one-off film purchases).
 * One function per contract function. All inputs validated before any
 * chain interaction; writes need a signer, reads accept signer or provider.
 *
 * df-cycle-12/13: PayPerView splits every purchase 75/25 at buy time through
 * the shared RevenueSplitter. There is no fee setter, no withdraw, no accrued
 * balance — those functions do not exist on-chain.
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

/**
 * Read the immutable platform fee (basis points) from the contract.
 * 2500 = 25% platform, 75% creator. No setter exists on-chain by design.
 */
export async function platformFeeBps(runner: ContractRunner): Promise<bigint> {
  const c: Contract = getPayPerView(runner);
  return c.PLATFORM_FEE_BPS() as Promise<bigint>;
}

/** Buy access to a film. `valueWei` must equal the film price exactly (split at purchase). */
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

/** Register a film with its price in wei, naming the filmmaker (owner only). */
export async function registerFilm(
  signer: ContractRunner,
  filmId: number | bigint | string,
  priceWei: bigint,
  filmmaker: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.registerFilm(
    reqUint(filmId, 'filmId'),
    reqWei(priceWei, 'priceWei'),
    reqAddress(filmmaker, 'filmmaker'),
    { ...(overrides ?? {}) },
  );
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

export async function transferOwnership(
  signer: ContractRunner,
  newOwner: string,
  overrides?: WriteOverrides,
): Promise<ContractTransactionResponse> {
  const c: Contract = getPayPerView(signer);
  return c.transferOwnership(reqAddress(newOwner, 'newOwner'), { ...(overrides ?? {}) });
}
