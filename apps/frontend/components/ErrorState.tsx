type Props = {
  title?: string;
  description?: string;
  onRetry?: () => void;
};

export default function ErrorState({
  title = 'Something went wrong',
  description = 'An error occurred. Please try again.',
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="text-4xl mb-4">⚠</div>
      <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
      <p className="text-white/50 max-w-sm mb-6">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-6 py-2.5 bg-white text-black font-medium rounded-full hover:bg-white/90 transition"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
