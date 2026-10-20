import React, { useState, useEffect } from "react";

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
  const [imgSrc, setImgSrc] = useState<string | null>(coverImage || null);
  const [isFallback, setIsFallback] = useState(false);
  const [hasError, setHasError] = useState(!coverImage);

  useEffect(() => {
    setImgSrc(coverImage || null);
    setIsFallback(false);
    setHasError(!coverImage);
  }, [coverImage]);

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

  return (
    <img
      key={imgSrc}
      data-omnis="game-card.cover"
      src={imgSrc}
      alt={title}
      className={imgClassName}
      loading="lazy"
      onError={handleError}
    />
  );
}
