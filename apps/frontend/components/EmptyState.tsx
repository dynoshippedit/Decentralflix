import Link from 'next/link';

type Props = {
  icon?: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCta?: () => void;
};

export default function EmptyState({ icon = '🎬', title, description, ctaLabel, ctaHref, onCta }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="text-5xl mb-5">{icon}</div>
      <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
      <p className="text-white/50 max-w-sm mb-6">{description}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="px-6 py-2.5 bg-white text-black font-medium rounded-full hover:bg-white/90 transition"
        >
          {ctaLabel}
        </Link>
      )}
      {ctaLabel && onCta && !ctaHref && (
        <button
          onClick={onCta}
          className="px-6 py-2.5 bg-white text-black font-medium rounded-full hover:bg-white/90 transition"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
