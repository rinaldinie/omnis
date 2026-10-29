import React, { useState, useEffect } from "react";
import { Zap, Check, Info, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "../../i18n";
import soundEffects from "../../utils/soundEffects";
import { invokeTauri } from "../../types";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon } from "../StoreBadge";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StoreDetectionResult {
  id: string;
  name: string;
  detected: boolean;
  requires_login: boolean;
  icon: string;
}

export interface OnboardingModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

// ─── Store icon resolver ──────────────────────────────────────────────────────

function StoreIconById({ id, className }: { id: string; className?: string }) {
  const cls = className ?? "w-5 h-5";
  switch (id) {
    case "steam":
      return <SteamIcon className={cls} />;
    case "epic":
      return <EpicIcon className={cls} />;
    case "gog":
      return <GogIcon className={cls} />;
    case "xbox":
      return <XboxIcon className={cls} />;
    default:
      return <Zap className={cls} />;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const ONBOARDING_DONE_KEY = "omnis_onboarding_completed";
const AUTO_SCAN_KEY = "omnis_auto_scan_on_startup";

export default function OnboardingModal({ onComplete, onSkip }: OnboardingModalProps) {
  const { t } = useTranslation();

  const [stores, setStores] = useState<StoreDetectionResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDetecting, setIsDetecting] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [autoScan, setAutoScan] = useState<boolean>(() => {
    const saved = localStorage.getItem(AUTO_SCAN_KEY);
    return saved !== null ? JSON.parse(saved) : true;
  });

  // ── Detect stores on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const detect = async () => {
      try {
        const results = await invokeTauri<StoreDetectionResult[]>("detect_stores");
        if (results) {
          setStores(results);
          // Pre-select all detected stores
          setSelected(new Set(results.filter((s) => s.detected).map((s) => s.id)));
        } else {
          setStores([]);
        }
      } catch (err) {
        console.error("detect_stores failed:", err);
        setStores([]);
      } finally {
        setIsDetecting(false);
      }
    };
    detect();
  }, []);

  // ── Toggle store selection ──────────────────────────────────────────────────
  const toggleStore = (id: string, detected: boolean) => {
    if (!detected) return;
    soundEffects.playSelect();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Toggle auto-scan setting ────────────────────────────────────────────────
  const toggleAutoScan = () => {
    soundEffects.playSelect();
    const next = !autoScan;
    setAutoScan(next);
    localStorage.setItem(AUTO_SCAN_KEY, JSON.stringify(next));
  };

  // ── Import selected libraries ───────────────────────────────────────────────
  const handleImport = async () => {
    if (isImporting) return;
    soundEffects.playSelect();
    setIsImporting(true);
    try {
      await invokeTauri("sync_library");
      setIsDone(true);
      localStorage.setItem(ONBOARDING_DONE_KEY, "true");
      // Brief success state before dismissing
      setTimeout(() => onComplete(), 1800);
    } catch (err) {
      console.error("sync_library failed during onboarding:", err);
      setIsImporting(false);
    }
  };

  // ── Skip ───────────────────────────────────────────────────────────────────
  const handleSkip = () => {
    soundEffects.playSelect();
    localStorage.setItem(ONBOARDING_DONE_KEY, "true");
    onSkip();
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-6 pt-6 pb-4 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: "0 0 18px var(--accent-glow)",
            }}
          >
            <Zap className="w-4.5 h-4.5 text-white fill-white" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">{t("onboarding.title")}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t("onboarding.subtitle")}</p>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 space-y-2">
          {isDetecting ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <p className="text-xs text-slate-400">{t("onboarding.detecting")}</p>
            </div>
          ) : isDone ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 animate-in fade-in duration-300">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(52, 211, 153, 0.15)", border: "1px solid rgba(52, 211, 153, 0.4)" }}
              >
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">{t("onboarding.success_title")}</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">{t("onboarding.success_desc")}</p>
              </div>
            </div>
          ) : (
            stores.map((store) => {
              const isChecked = selected.has(store.id);
              const isDisabled = !store.detected;

              return (
                <div
                  key={store.id}
                  onClick={() => toggleStore(store.id, store.detected)}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all select-none ${
                    isDisabled
                      ? "opacity-40 cursor-not-allowed"
                      : "cursor-pointer hover:bg-white/5"
                  } ${isChecked ? "bg-white/[0.04] border border-white/[0.08]" : "border border-transparent"}`}
                >
                  {/* Store icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
                  >
                    <StoreIconById id={store.id} className="w-4 h-4" />
                  </div>

                  {/* Store info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{store.name}</span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                          store.detected
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-slate-500/15 text-slate-500"
                        }`}
                      >
                        {store.detected
                          ? t("onboarding.detected_badge")
                          : t("onboarding.not_found_badge")}
                      </span>
                    </div>
                    {store.detected && store.requires_login && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Info className="w-3 h-3 text-sky-400 shrink-0" />
                        <span className="text-[10px] text-sky-400">{t("onboarding.requires_login")}</span>
                      </div>
                    )}
                  </div>

                  {/* Custom checkbox */}
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                      isChecked
                        ? "border-0"
                        : "border border-white/20 bg-transparent"
                    }`}
                    style={
                      isChecked
                        ? { backgroundColor: "var(--accent-primary)", boxShadow: "0 0 8px var(--accent-glow)" }
                        : {}
                    }
                  >
                    {isChecked && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Auto-scan toggle ────────────────────────────────────────────────── */}
        {!isDetecting && !isDone && (
          <div
            className="mx-6 mb-4 flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors border border-dashed select-none"
            style={{ borderColor: "var(--border-color)" }}
            onClick={toggleAutoScan}
          >
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                autoScan ? "border-0" : "border border-white/20 bg-transparent"
              }`}
              style={
                autoScan
                  ? { backgroundColor: "var(--accent-primary)", boxShadow: "0 0 8px var(--accent-glow)" }
                  : {}
              }
            >
              {autoScan && <Check className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{t("onboarding.auto_scan_label")}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{t("onboarding.auto_scan_desc")}</p>
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        {!isDone && (
          <div
            className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-black/20"
            style={{ borderColor: "var(--border-color)" }}
          >
            <button
              type="button"
              onClick={handleSkip}
              disabled={isImporting}
              className="text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {t("onboarding.skip_btn")}
            </button>

            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || isDetecting || selected.size === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 active:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: "0 0 15px var(--accent-glow)",
              }}
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("onboarding.importing_btn")}</span>
                </>
              ) : (
                <span>{t("onboarding.import_btn")}</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Utility export ───────────────────────────────────────────────────────────

/** Returns true if this is the first launch (onboarding not yet completed). */
export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) !== "true";
}

/** Returns true if the user opted for auto-scan on startup. */
export function shouldAutoScanOnStartup(): boolean {
  const saved = localStorage.getItem(AUTO_SCAN_KEY);
  return saved !== null ? JSON.parse(saved) : true;
}
