'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import type { ReactNode } from 'react';
import { arbitrumSepolia } from 'viem/chains';

/**
 * Privy + SIWE Provider for Decentralflix
 *
 * This enables:
 * - Embedded wallets (email, social, passkey)
 * - External wallet connection (MetaMask, WalletConnect, etc.)
 * - SIWE (Sign-In With Ethereum) for secure authentication
 *
 * Setup required:
 * 1. Create a Privy app at https://dashboard.privy.io
 * 2. Add your App ID below via NEXT_PUBLIC_PRIVY_APP_ID
 * 3. In Privy dashboard: Enable "Sign in with Ethereum" (SIWE)
 * 4. Add your localhost + production domains to allowed origins
 */

interface PrivyWrapperProps {
  children: ReactNode;
}

export function PrivyWrapper({ children }: PrivyWrapperProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    console.warn('[Privy] NEXT_PUBLIC_PRIVY_APP_ID is not set. Wallet connection will not work.');
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Appearance - cinematic dark theme matching Decentralflix
        appearance: {
          theme: 'dark',
          accentColor: '#ffffff',
          logo: 'https://arweave.net/your-logo-txid', // TODO: replace with real logo once uploaded
          showWalletLoginFirst: false,
        },
        // Login methods
        loginMethods: ['email', 'wallet', 'google', 'twitter'],
        // Embedded wallets config for Privy v3+
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets', // Auto-create embedded wallet if user has none
          },
        },
        // Supported chains - Arbitrum Sepolia for Phase 0
        supportedChains: [arbitrumSepolia],
        // Wallet connect / external wallets
        walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, // optional
      }}
    >
      {children}
    </PrivyProvider>
  );
}
