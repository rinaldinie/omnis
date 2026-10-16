import React from "react";
import { Gamepad2 } from "lucide-react";

export function SteamIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Steam">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 12-5.373 12-12S18.605 0 11.979 0zM7.545 18.082l-1.93-.797c.306.697.947 1.22 1.728 1.341l-.428-.887.63.343zm4.434-9.172a2.825 2.825 0 1 0 0 5.65 2.825 2.825 0 0 0 0-5.65zm3.959 2.825a1.134 1.134 0 1 1-2.268 0 1.134 1.134 0 0 1 2.268 0z" />
    </svg>
  );
}

export function EpicIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Epic Games">
      <path d="M12 0C7.14 0 5.4 1.13 5.4 1.13l-.53 14.54L12 24l7.13-8.33-.53-14.54S16.86 0 12 0zm0 2.87c2.6 0 4.1.6 4.1.6l.37 10.22L12 18.91l-4.47-5.22.37-10.22s1.5-.6 4.1-.6zm-.97 3.3v1.8h2.07v1.27h-2.07v1.87h2.24v1.3H9.4V6.17h1.63z" />
    </svg>
  );
}

export function GogIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="GOG Galaxy">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.8 5.4a3.3 3.3 0 0 1 3.3 3.3v.6h-2.1v-.6a1.2 1.2 0 0 0-2.4 0v6.6a1.2 1.2 0 0 0 2.4 0v-.6h2.1v.6a3.3 3.3 0 0 1-6.6 0V8.7a3.3 3.3 0 0 1 3.3-3.3zm6.6 0a3.3 3.3 0 0 1 3.3 3.3v6.6a3.3 3.3 0 0 1-6.6 0V8.7a3.3 3.3 0 0 1 3.3-3.3zm0 2.1a1.2 1.2 0 0 0-1.2 1.2v6.6a1.2 1.2 0 0 0 2.4 0V8.7a1.2 1.2 0 0 0-1.2-1.2z" />
    </svg>
  );
}

export function StoreIcon({ library, className = "w-3.5 h-3.5" }: { library: string; className?: string }) {
  const lib = library.toLowerCase();
  if (lib.includes("steam")) {
    return <SteamIcon className={className} />;
  }
  if (lib.includes("epic")) {
    return <EpicIcon className={className} />;
  }
  if (lib.includes("gog")) {
    return <GogIcon className={className} />;
  }
  return <Gamepad2 className={className} />;
}

export function StoreBadge({
  library,
  showName = false,
  className = "",
}: {
  library: string;
  showName?: boolean;
  className?: string;
}) {
  const lib = library.toLowerCase();

  if (lib.includes("steam")) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${className}`}
        style={{
          background: "linear-gradient(135deg, rgba(23, 53, 77, 0.9) 0%, rgba(16, 33, 48, 0.9) 100%)",
          borderColor: "rgba(102, 192, 244, 0.4)",
          color: "#66c0f4",
        }}
        title="Disponibile su Steam"
      >
        <SteamIcon className="w-3.5 h-3.5 text-[#66c0f4] shrink-0" />
        {showName && <span className="font-bold">Steam</span>}
      </span>
    );
  }

  if (lib.includes("epic")) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${className}`}
        style={{
          background: "linear-gradient(135deg, rgba(43, 43, 43, 0.9) 0%, rgba(24, 24, 24, 0.9) 100%)",
          borderColor: "rgba(255, 255, 255, 0.3)",
          color: "#ffffff",
        }}
        title="Disponibile su Epic Games"
      >
        <EpicIcon className="w-3.5 h-3.5 text-white shrink-0" />
        {showName && <span className="font-bold">Epic</span>}
      </span>
    );
  }

  if (lib.includes("gog")) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${className}`}
        style={{
          background: "linear-gradient(135deg, rgba(72, 18, 84, 0.9) 0%, rgba(38, 5, 48, 0.9) 100%)",
          borderColor: "rgba(226, 138, 255, 0.45)",
          color: "#e28aff",
        }}
        title="Disponibile su GOG Galaxy"
      >
        <GogIcon className="w-3.5 h-3.5 text-[#e28aff] shrink-0" />
        {showName && <span className="font-bold">GOG</span>}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
      <span>{library}</span>
    </span>
  );
}
