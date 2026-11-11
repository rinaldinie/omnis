import React, { useState, useEffect } from "react";
import { formatImageUrl } from "../../types";

/**
 * Width/height ratios treated as "square" artwork (e.g. Nintendo Switch icons, 1:1).
 * Cropping those to the 2:3 card would cut a third of the image, so they are shown whole,
 * centred, on the theme's card background colour.
 */
export const SQUARE_ART_MIN_RATIO = 0.8;
export const SQUARE_ART_MAX_RATIO = 1.25;

export function isSquareArt(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= SQUARE_ART_MIN_RATIO && ratio <= SQUARE_ART_MAX_RATIO;
}

export interface GameCardCoverProps {
  coverImage?: string | null;
  backgroundImage?: string | null;
  title: string;
  imgClassName?: string;
  placeholderClassName?: string;
}

export function GameCardCover({
  coverImage,
  backgroundImage,
  title,
  imgClassName = "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 [transform:translateZ(0)] [backface-visibility:hidden]",
  placeholderClassName = "w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-slate-800/80 via-slate-900/90 to-slate-950/95 select-none [transform:translateZ(0)] [backface-visibility:hidden]",
}: GameCardCoverProps) {
  const formattedCover = formatImageUrl(coverImage) || null;
  const [imgSrc, setImgSrc] = useState<string | null>(formattedCover);
  const [isFallback, setIsFallback] = useState(false);
  const [hasError, setHasError] = useState(!formattedCover);
  const [isSquare, setIsSquare] = useState(false);

  useEffect(() => {
    const formatted = formatImageUrl(coverImage) || null;
    setImgSrc(formatted);
    setIsFallback(false);
    setHasError(!formatted);
    setIsSquare(false);
  }, [coverImage]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setIsSquare(isSquareArt(naturalWidth, naturalHeight));
  };

  const handleError = () => {
    if (imgSrc && imgSrc.includes("library_600x900_2x.jpg") && !isFallback) {
      setIsFallback(true);
      setImgSrc(imgSrc.replace("library_600x900_2x.jpg", "header.jpg"));
    } else if (backgroundImage && imgSrc !== backgroundImage && !isFallback) {
      setIsFallback(true);
      setImgSrc(backgroundImage);
    } else {
      setHasError(true);
    }
  };

  if (hasError || !imgSrc) {
    return (
      <div className={placeholderClassName}>
        <span
          className="w-12 h-12 rounded-xl font-black text-lg flex items-center justify-center mb-1.5 shadow-inner border border-white/5 select-none [transform:translateZ(0)] shrink-0"
          style={{
            backgroundColor: "var(--accent-glow)",
            color: "var(--accent-primary)",
          }}
        >
          {title ? title.slice(0, 2).toUpperCase() : "??"}
        </span>
        <span className="text-[11px] font-bold text-white line-clamp-2 leading-tight break-words select-none px-1 [transform:translateZ(0)]">
          {title}
        </span>
      </div>
    );
  }

  const image = (
    <img
      key={imgSrc}
      data-omnis="game-card.cover"
      data-fit={isSquare ? "square" : "cover"}
      src={imgSrc}
      alt={title}
      className={imgClassName}
      loading="lazy"
      onLoad={handleLoad}
      onError={handleError}
    />
  );

  if (!isSquare) {
    return image;
  }

  // Square art: the whole image, centred, with the space above and below painted in the
  // active theme's card colour, so it follows theme changes like the rest of the card.
  return (
    <div
      className="w-full h-full flex items-center overflow-hidden [transform:translateZ(0)]"
      style={{ backgroundColor: "var(--bg-card)" }}
    >
      <div className="w-full aspect-square">{image}</div>
    </div>
  );
}
