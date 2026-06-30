'use client';

export function SkeletonCard() {
  return (
    <div className="card-premium p-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-md animate-shimmer" />
        <div className="h-3 w-24 rounded animate-shimmer" />
        <div className="h-3 w-12 rounded animate-shimmer ml-auto" />
      </div>

      {/* Title skeleton */}
      <div className="space-y-1.5 mb-3">
        <div className="h-4 w-full rounded animate-shimmer" />
        <div className="h-4 w-3/4 rounded animate-shimmer" />
      </div>

      {/* Description skeleton */}
      <div className="space-y-1 mb-3">
        <div className="h-3 w-full rounded animate-shimmer" />
        <div className="h-3 w-5/6 rounded animate-shimmer" />
      </div>

      {/* Tags skeleton */}
      <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="h-5 w-12 rounded-full animate-shimmer" />
        <div className="h-5 w-16 rounded-full animate-shimmer" />
      </div>
    </div>
  );
}

export function SkeletonCryptoCard() {
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full animate-shimmer" />
        <div>
          <div className="h-4 w-20 rounded animate-shimmer mb-1" />
          <div className="h-3 w-10 rounded animate-shimmer" />
        </div>
      </div>
      <div className="h-7 w-28 rounded animate-shimmer mb-3" />
      <div className="h-12 w-full rounded animate-shimmer mb-3" />
      <div className="flex justify-between pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="h-3 w-20 rounded animate-shimmer" />
        <div className="h-3 w-20 rounded animate-shimmer" />
      </div>
    </div>
  );
}

export function SkeletonGithubCard() {
  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-full animate-shimmer" />
        <div>
          <div className="h-3 w-16 rounded animate-shimmer mb-1" />
          <div className="h-4 w-28 rounded animate-shimmer" />
        </div>
      </div>
      <div className="h-3 w-full rounded animate-shimmer mb-1" />
      <div className="h-3 w-3/4 rounded animate-shimmer mb-3" />
      <div className="flex gap-1 mb-3">
        <div className="h-5 w-14 rounded-full animate-shimmer" />
        <div className="h-5 w-16 rounded-full animate-shimmer" />
      </div>
      <div className="flex gap-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="h-3 w-14 rounded animate-shimmer" />
        <div className="h-3 w-12 rounded animate-shimmer" />
        <div className="h-3 w-10 rounded animate-shimmer" />
      </div>
    </div>
  );
}
