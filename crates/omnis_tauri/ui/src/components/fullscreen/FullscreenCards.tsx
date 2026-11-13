import React from "react";
import type { GameDto } from "../../types";
import { formatImageUrl } from "../../types";
import { StoreIcon } from "../common/StoreBadge";

export const CARD_W_REM = 12;
export const CARD_FOCUSED_W_REM = 32;
export const CARD_H_REM = 18;
export const CARD_GAP_REM = 1.25;
export const GRID_CARD_W_REM = 10.5;
export const GRID_GAP_REM = 1.25;
export const RECENT_CARD_W_REM = 13;
export const RECENT_ROW_SIZE = 6;
export const RECENT_ROW_MIN_VIEWPORT_REM = 54;

export function resolveImage(src: string | null | undefined): string | null {
  if (!src) return null;
  const formatted = formatImageUrl(src);
  if (!formatted) return null;
  if (formatted.startsWith("http://") || formatted.startsWith("https://")) return formatted;
  if (formatted.startsWith("asset://") || formatted.startsWith("http://asset.localhost/")) return formatted;
  return formatted;
}

/** Image that walks a list of candidate sources on error, then falls back to a title block. */
export const ArtImage = React.memo(function ArtImage({
  sources,
  title,
  library,
  showFallbackTitle = true,
}: {
  sources: Array<string | null | undefined>;
  title: string;
  library: string;
  /** Off when the caller already overlays the title */
  showFallbackTitle?: boolean;
}) {
  const sourcesKey = sources.join("\0");
  const cachedRef = React.useRef<{ key: string; candidates: string[] } | null>(null);
  if (!cachedRef.current || cachedRef.current.key !== sourcesKey) {
    const out: string[] = [];
    for (const src of sources) {
      const url = resolveImage(src);
      if (!url || out.includes(url)) continue;
      out.push(url);
      if (url.includes("library_600x900_2x.jpg")) {
        const header = url.replace("library_600x900_2x.jpg", "header.jpg");
        if (!out.includes(header)) out.push(header);
      }
    }
    cachedRef.current = { key: sourcesKey, candidates: out };
  }
  const candidates = cachedRef.current.candidates;

  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [candidates]);

  if (index >= candidates.length) {
    return (
      <div
        className="w-full h-full flex flex-col justify-between p-4"
        style={{ background: "linear-gradient(160deg, var(--bg-card), var(--bg-surface))" }}
      >
        <StoreIcon library={library} className="w-5 h-5 text-white/70" />
        {showFallbackTitle && (
          <span className="text-lg font-semibold text-white leading-snug line-clamp-4 break-words">{title}</span>
        )}
      </div>
    );
  }

  return (
    <img
      key={candidates[index]}
      src={candidates[index]}
      alt={title}
      className="w-full h-full object-cover [transform:translateZ(0)]"
      loading="lazy"
      draggable={false}
      onError={() => setIndex((i) => i + 1)}
    />
  );
});

export interface ShelfCardProps {
  game: GameDto;
  isFocused: boolean;
  isRunning: boolean;
  hasFocusRing?: boolean;
  liveLabel?: string;
  onClick?: () => void;
}

export const ShelfCard = React.memo(function ShelfCard({
  game,
  isFocused,
  isRunning,
  hasFocusRing = true,
  liveLabel = "Live",
  onClick,
}: ShelfCardProps) {
  const widthRem = isFocused ? CARD_FOCUSED_W_REM : CARD_W_REM;
  return (
    <div
      onClick={onClick}
      className="cursor-pointer relative shrink-0 rounded-md overflow-hidden transition-[width,box-shadow,opacity] duration-200 ease-out"
      style={{
        width: `${widthRem}rem`,
        height: `${CARD_H_REM}rem`,
        backgroundColor: "var(--bg-card)",
        opacity: isFocused ? 1 : 0.85,
        boxShadow:
          isFocused && hasFocusRing
            ? "0 0 0 0.2rem rgba(255, 255, 255, 0.92), 0 1.5rem 3rem -1rem rgba(0, 0, 0, 0.85)"
            : "0 1rem 2rem -1.25rem rgba(0, 0, 0, 0.8)",
        contentVisibility: "auto",
        containIntrinsicSize: `${widthRem}rem ${CARD_H_REM}rem`,
      }}
    >
      <ArtImage
        sources={isFocused ? [game.background_image, game.cover_image] : [game.cover_image, game.background_image]}
        title={game.title}
        library={game.library}
      />

      {isRunning && (
        <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          {liveLabel}
        </span>
      )}

      {isFocused && (
        <span className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/65 flex items-center justify-center">
          <StoreIcon library={game.library} className="w-4 h-4 text-white" />
        </span>
      )}
    </div>
  );
});

export const RecentCard = React.memo(function RecentCard({
  game,
  isFocused,
  onClick,
}: {
  game: GameDto;
  isFocused: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer relative shrink-0 rounded-md overflow-hidden transition-[transform,box-shadow,opacity] duration-150 ease-out"
      style={{
        width: `${RECENT_CARD_W_REM}rem`,
        height: `${(RECENT_CARD_W_REM * 9) / 16}rem`,
        backgroundColor: "var(--bg-card)",
        opacity: isFocused ? 1 : 0.8,
        transform: isFocused ? "scale(1.05)" : "none",
        boxShadow: isFocused
          ? "0 0 0 0.2rem rgba(255, 255, 255, 0.92), 0 1rem 2rem -0.75rem rgba(0, 0, 0, 0.85)"
          : "0 0.75rem 1.5rem -1rem rgba(0, 0, 0, 0.8)",
      }}
    >
      <ArtImage
        sources={[game.background_image, game.cover_image]}
        title={game.title}
        library={game.library}
        showFallbackTitle={false}
      />
      <div className="absolute inset-x-0 bottom-0 px-3 pt-6 pb-2 bg-gradient-to-t from-black/85 to-transparent">
        <span className="block text-sm font-semibold text-white truncate">{game.title}</span>
      </div>
    </div>
  );
});

export const GridCard = React.memo(function GridCard({ game, isFocused, isRunning, onClick }: ShelfCardProps) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer relative rounded-md overflow-hidden transition-[transform,box-shadow,opacity] duration-150 ease-out"
      style={{
        paddingTop: "150%",
        backgroundColor: "var(--bg-card)",
        opacity: isFocused ? 1 : 0.8,
        transform: isFocused ? "scale(1.05)" : "none",
        zIndex: isFocused ? 10 : undefined,
        boxShadow: isFocused
          ? "0 0 0 0.2rem rgba(255, 255, 255, 0.92), 0 1.25rem 2.5rem -0.75rem rgba(0, 0, 0, 0.85)"
          : "0 0.75rem 1.5rem -1rem rgba(0, 0, 0, 0.8)",
      }}
    >
      <div className="absolute inset-0">
        <ArtImage sources={[game.cover_image, game.background_image]} title={game.title} library={game.library} />
      </div>
      {isRunning && (
        <span className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse ring-2 ring-black/50" />
      )}
    </div>
  );
});
