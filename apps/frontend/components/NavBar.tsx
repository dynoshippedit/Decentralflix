'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

const NAV_LINKS = [
  { href: '/catalog', label: 'Browse' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/upload', label: 'Upload' },
  { href: '/collection', label: 'My Films' },
  { href: '/dashboard', label: 'Dashboard' },
];

export default function NavBar() {
  const pathname = usePathname();
  const { authenticated, login, logout, user } = usePrivy();

  return (
    <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="font-semibold tracking-tight text-white hover:text-white/80 transition shrink-0">
          DecentralFlix
        </Link>

        {/* Links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 text-sm rounded-lg transition ${
                pathname.startsWith(l.href)
                  ? 'text-white bg-white/10'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-2 shrink-0">
          {authenticated ? (
            <div className="flex items-center gap-2">
              <span className="text-white/30 text-xs hidden sm:block truncate max-w-[120px]">
                {user?.wallet?.address?.slice(0, 6)}...{user?.wallet?.address?.slice(-4)}
              </span>
              <button
                onClick={logout}
                className="text-xs text-white/40 hover:text-white border border-white/20 px-3 py-1.5 rounded-full transition"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="text-sm font-medium bg-white text-black px-4 py-1.5 rounded-full hover:bg-white/90 transition"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
