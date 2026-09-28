export default function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white/5 animate-pulse">
      <div className="aspect-video bg-white/10" />
      <div className="p-4 space-y-2">
        <div className="h-5 bg-white/10 rounded w-3/4" />
        <div className="h-4 bg-white/10 rounded w-1/2" />
        <div className="h-4 bg-white/10 rounded w-1/3" />
      </div>
    </div>
  );
}
