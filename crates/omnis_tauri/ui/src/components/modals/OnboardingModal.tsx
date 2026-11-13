import React, { useState, useEffect, useRef } from "react";
import {
  Zap,
  Check,
  Info,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Image as ImageIcon,
  KeyRound,
  UserRound,
  Gamepad2,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import soundEffects from "../../utils/soundEffects";
import { api, TAURI_EVENTS, listenTauri } from "../../api";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon, SwitchIcon } from "../StoreBadge";
import type { SettingsTab } from "../settings";
import {
  dismissOnboardingForSession,
  markOnboardingCompleted,
  shouldShowOnboarding,
} from "./onboardingState";
import { buildImportSummary, needsMetadataKeys, ImportSummary } from "./onboardingSummary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StoreDetectionResult {
  id: string;
  name: string;
  detected: boolean;
  requires_login: boolean;
  icon: string;
}

export interface OnboardingModalProps {
  /** Closes the wizard after the summary */
  onComplete: () => void;
  onSkip: () => void;
  /** Reloads the library behind the wizard once the import is done */
  onLibraryImported?: () => void | Promise<void>;
  /** Starts the metadata / cover download; keeps running after the wizard is closed */
  onStartMetadataDownload?: () => Promise<void>;
  /** Opens a Settings page (used by the summary tips) */
  onOpenSettings?: (tab: SettingsTab) => void;
}

type Phase = "welcome" | "detecting" | "select" | "keys" | "importing" | "summary";
type SourceState = "pending" | "running" | "done" | "error";
type MetadataState = "idle" | "running" | "done" | "error";

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
    case "switch":
      return <SwitchIcon className={cls} />;
    default:
      return <Zap className={cls} />;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const AUTO_SCAN_KEY = "omnis_auto_scan_on_startup";
const LOGIN_STORES = new Set(["steam", "epic", "gog", "xbox"]);

export default function OnboardingModal({
  onComplete,
  onSkip,
  onLibraryImported,
  onStartMetadataDownload,
  onOpenSettings,
}: OnboardingModalProps) {
  const { t } = useTranslation();
  const mounted = useRef(true);

  const [phase, setPhase] = useState<Phase>("welcome");
  /** Sources waiting for the emulator-keys question before being imported */
  const [pendingImport, setPendingImport] = useState<string[]>([]);
  const [stores, setStores] = useState<StoreDetectionResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceState, setSourceState] = useState<Record<string, SourceState>>({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showKeyTip, setShowKeyTip] = useState(false);
  const [metadataState, setMetadataState] = useState<MetadataState>("idle");
  const [metadataProgress, setMetadataProgress] = useState<{
    current: number;
    total: number;
    title: string;
  } | null>(null);
  const [autoScan, setAutoScan] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTO_SCAN_KEY);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── Detect stores when the user starts ──────────────────────────────────────
  const startDetection = async () => {
    soundEffects.playSelect();
    setPhase("detecting");
    try {
      const results = await api.games.detectStores();
      if (!mounted.current) return;
      setStores(results ?? []);
      // Pre-select all detected sources
      setSelected(new Set((results ?? []).filter((s) => s.detected).map((s) => s.id)));
    } catch (err) {
      console.error("detect_stores failed:", err);
      if (mounted.current) setStores([]);
    } finally {
      if (mounted.current) setPhase("select");
    }
  };

  // ── Live metadata progress while the summary is open ──────────────────────
  useEffect(() => {
    if (phase !== "summary") return;
    let unlisten: (() => void) | null = null;
    listenTauri<{ current: number; total: number; title: string }>(
      TAURI_EVENTS.METADATA_PROGRESS,
      (payload) => {
        if (mounted.current) setMetadataProgress(payload);
      }
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [phase]);

  // ── Toggle source selection ─────────────────────────────────────────────────
  const toggleStore = (id: string, detected: boolean) => {
    if (!detected) return;
    soundEffects.playSelect();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ── Toggle auto-scan setting ────────────────────────────────────────────────
  const toggleAutoScan = () => {
    soundEffects.playSelect();
    const next = !autoScan;
    setAutoScan(next);
    try {
      localStorage.setItem(AUTO_SCAN_KEY, JSON.stringify(next));
    } catch {
      /* per-viewer convenience only */
    }
  };

  // ── Import: ask about emulator keys first when Switch is selected ──────────
  const handleImport = async () => {
    if (phase !== "select") return;
    const ids = stores.filter((s) => selected.has(s.id)).map((s) => s.id);
    if (ids.length === 0) return;
    soundEffects.playSelect();

    if (ids.includes("switch")) {
      const [status, settings] = await Promise.all([
        api.games.getEmulatorStatus().catch(() => []),
        api.games.getEmulatorSettings().catch(() => null),
      ]);
      if (status.some((e) => e.has_keys) && settings && !settings.use_emulator_keys) {
        setPendingImport(ids);
        setPhase("keys");
        return;
      }
    }
    runImport(ids);
  };

  /** Answer to the emulator-keys question, then continue with the import. */
  const handleKeysChoice = async (useKeys: boolean) => {
    soundEffects.playSelect();
    if (useKeys) {
      try {
        const settings = await api.games.getEmulatorSettings();
        await api.games.setEmulatorSettings({ ...settings, use_emulator_keys: true });
      } catch (err) {
        console.warn("Failed to enable emulator keys:", err);
      }
    }
    runImport(pendingImport);
  };

  // ── Import the selected sources, one at a time ─────────────────────────────
  const runImport = async (ids: string[]) => {
    setSourceState(Object.fromEntries(ids.map((id) => [id, "pending" as SourceState])));
    setPhase("importing");

    for (const id of ids) {
      setSourceState((prev) => ({ ...prev, [id]: "running" }));
      try {
        await api.games.syncSelectedLibraries([id]);
        setSourceState((prev) => ({ ...prev, [id]: "done" }));
      } catch (err) {
        console.error(`Import of ${id} failed during onboarding:`, err);
        setSourceState((prev) => ({ ...prev, [id]: "error" }));
      }
    }

    await markOnboardingCompleted();
    try {
      await onLibraryImported?.();
    } catch (err) {
      console.warn("Library refresh after onboarding failed:", err);
    }

    const [games, providers] = await Promise.all([
      api.games.getGames().catch(() => []),
      api.metadata.getProviders().catch(() => []),
    ]);
    if (!mounted.current) return;
    setSummary(buildImportSummary(games, ids));
    setShowKeyTip(needsMetadataKeys(providers));
    setPhase("summary");

    // Data and covers download in the background and keeps going after the wizard closes
    if (games.length > 0 && onStartMetadataDownload) {
      setMetadataState("running");
      onStartMetadataDownload()
        .then(() => mounted.current && setMetadataState("done"))
        .catch(() => mounted.current && setMetadataState("error"));
    }
  };

  // ── Skip for now (back at next launch) / never show again ──────────────────
  const handleSkip = () => {
    soundEffects.playSelect();
    dismissOnboardingForSession();
    onSkip();
  };

  const handleNeverShow = async () => {
    soundEffects.playSelect();
    await markOnboardingCompleted();
    onSkip();
  };

  const openSettingsFromTip = (tab: SettingsTab) => {
    soundEffects.playSelect();
    onComplete();
    onOpenSettings?.(tab);
  };

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id;
  const noSourceFound = phase === "select" && !stores.some((s) => s.detected);
  const loginTipStores = stores.filter((s) => s.detected && LOGIN_STORES.has(s.id));

  const isBusy = phase === "detecting" || phase === "importing";

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !isBusy) {
          if (phase === "summary") {
            soundEffects.playSelect();
            onComplete();
          } else {
            handleSkip();
          }
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[200] bg-black/75 backdrop-blur-sm"
        className="z-[200] max-w-lg w-full p-0 rounded-2xl overflow-hidden gap-0"
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <DialogHeader className="flex-row items-center gap-3 px-6 pt-6 pb-4 border-b border-border space-y-0 text-left">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{
              backgroundColor: phase === "summary" ? "rgb(16, 185, 129)" : "var(--accent-primary)",
              boxShadow: "0 0 18px var(--accent-glow)",
            }}
          >
            {phase === "summary" ? (
              <Check className="w-4.5 h-4.5 text-white" />
            ) : (
              <Zap className="w-4.5 h-4.5 text-white fill-white" />
            )}
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-sm font-black text-foreground">
              {phase === "summary"
                ? t("onboarding.summary_title")
                : phase === "importing"
                ? t("onboarding.importing_title")
                : phase === "keys"
                ? t("onboarding.keys_title")
                : t("onboarding.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {phase === "summary"
                ? summary && summary.total > 0
                  ? t("onboarding.summary_subtitle", { total: summary.total })
                  : t("onboarding.summary_empty")
                : phase === "importing"
                ? t("onboarding.importing_desc")
                : phase === "welcome"
                ? t("onboarding.welcome_subtitle")
                : phase === "keys"
                ? t("onboarding.keys_subtitle")
                : t("onboarding.subtitle")}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <ScrollArea className="max-h-[60vh]">
          <div className="px-6 py-4 space-y-2">
          {phase === "welcome" && (
            <div className="space-y-3 py-1">
              <p className="text-xs text-slate-300 leading-relaxed">{t("onboarding.welcome_desc")}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {["steam", "epic", "gog", "xbox", "switch"].map((id) => (
                  <div
                    key={id}
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
                  >
                    <StoreIconById id={id} className="w-4 h-4 text-slate-300" />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">{t("onboarding.welcome_later")}</p>
            </div>
          )}

          {phase === "keys" && (
            <div className="space-y-3 py-1">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
                >
                  <SwitchIcon className="w-5 h-5 text-slate-200" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{t("onboarding.keys_desc")}</p>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span className="text-[11px] text-slate-400">{t("onboarding.keys_privacy")}</span>
              </div>
              <p className="text-[10px] text-slate-500">{t("onboarding.keys_playtime_note")}</p>
            </div>
          )}

          {phase === "detecting" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <p className="text-xs text-slate-400">{t("onboarding.detecting")}</p>
            </div>
          )}

          {phase === "select" &&
            stores.map((store) => {
              const isChecked = selected.has(store.id);
              const isDisabled = !store.detected;

              return (
                <div
                  key={store.id}
                  onClick={() => toggleStore(store.id, store.detected)}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all select-none ${
                    isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-white/5"
                  } ${isChecked ? "bg-white/[0.04] border border-white/[0.08]" : "border border-transparent"}`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
                  >
                    <StoreIconById id={store.id} className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{store.name}</span>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                          store.detected ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-500"
                        }`}
                      >
                        {store.detected ? t("onboarding.detected_badge") : t("onboarding.not_found_badge")}
                      </span>
                    </div>
                    {store.id === "switch" && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Gamepad2 className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-[10px] text-slate-400">{t("onboarding.emulator_hint")}</span>
                      </div>
                    )}
                    {store.detected && store.requires_login && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Info className="w-3 h-3 text-sky-400 shrink-0" />
                        <span className="text-[10px] text-sky-400">{t("onboarding.requires_login")}</span>
                      </div>
                    )}
                  </div>

                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                      isChecked ? "border-0" : "border border-white/20 bg-transparent"
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
            })}

          {noSourceFound && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-[11px] text-slate-300 border border-dashed border-white/10">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>{t("onboarding.no_sources")}</span>
            </div>
          )}

          {phase === "importing" &&
            Object.entries(sourceState).map(([id, state]) => (
              <div key={id} className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06]">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
                >
                  <StoreIconById id={id} className="w-4 h-4" />
                </div>
                <span className="flex-1 text-xs font-bold text-white">{storeName(id)}</span>
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  {state === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {state === "done" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  {state === "error" && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  {t(`onboarding.source_${state}`)}
                </span>
              </div>
            ))}

          {phase === "summary" && summary && (
            <div className="space-y-3 animate-in fade-in duration-300">
              {/* Games per source */}
              <div className="space-y-1.5">
                {summary.sources.map((src) => (
                  <div key={src.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03]">
                    <StoreIconById id={src.id} className="w-4 h-4 text-slate-300" />
                    <span className="flex-1 text-xs text-white">{storeName(src.id)}</span>
                    {sourceState[src.id] === "error" ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                        <AlertTriangle className="w-3 h-3" /> {t("onboarding.source_error")}
                      </span>
                    ) : (
                      <span className="text-sm font-black text-white tabular-nums">{src.count}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              {summary.total > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: t("onboarding.summary_games"), value: summary.total },
                    { label: t("onboarding.summary_installed"), value: summary.installed },
                    { label: t("onboarding.summary_playtime"), value: summary.playtimeHours },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="p-2.5 rounded-xl text-center border"
                      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-color)" }}
                    >
                      <div className="text-lg font-black text-white tabular-nums">{stat.value}</div>
                      <div className="text-[10px] text-slate-400">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Metadata download */}
              {metadataState !== "idle" && (
                <div className="p-3 rounded-xl border border-white/[0.06] space-y-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-300" />
                    <span className="flex-1 text-xs font-bold text-white">{t("onboarding.metadata_title")}</span>
                    {metadataState === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                    {metadataState === "done" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    {metadataState === "error" && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  {metadataState === "running" && (
                    <>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: metadataProgress?.total
                              ? `${Math.round((metadataProgress.current / metadataProgress.total) * 100)}%`
                              : "4%",
                            backgroundColor: "var(--accent-primary)",
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">
                        {metadataProgress
                          ? t("onboarding.metadata_running", {
                              current: metadataProgress.current,
                              total: metadataProgress.total,
                              title: metadataProgress.title,
                            })
                          : t("onboarding.metadata_starting")}
                      </p>
                      <p className="text-[10px] text-slate-500">{t("onboarding.metadata_background")}</p>
                    </>
                  )}
                  {metadataState === "done" && (
                    <p className="text-[10px] text-slate-400">{t("onboarding.metadata_done")}</p>
                  )}
                  {metadataState === "error" && (
                    <p className="text-[10px] text-amber-300">{t("onboarding.metadata_error")}</p>
                  )}
                </div>
              )}

              {/* Tips */}
              {showKeyTip && onOpenSettings && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-500/[0.06] border border-sky-500/20">
                  <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400" />
                  <span className="flex-1 text-[11px] text-slate-300">{t("onboarding.tip_keys")}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openSettingsFromTip("metadata-igdb")}
                    className="h-auto px-1.5 py-0.5 shrink-0 text-[10px] font-bold text-sky-300 hover:text-white"
                  >
                    {t("onboarding.tip_keys_btn")}
                  </Button>
                </div>
              )}
              {loginTipStores.length > 0 && onOpenSettings && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <UserRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span className="flex-1 text-[11px] text-slate-300">{t("onboarding.tip_login")}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openSettingsFromTip("accounts")}
                    className="h-auto px-1.5 py-0.5 shrink-0 text-[10px] font-bold text-slate-300 hover:text-white"
                  >
                    {t("onboarding.tip_login_btn")}
                  </Button>
                </div>
              )}
            </div>
          )}
          </div>
        </ScrollArea>

        {/* ── Auto-scan toggle ────────────────────────────────────────────────── */}
        {phase === "select" && !noSourceFound && (
          <div
            className="mx-6 mb-4 flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors border border-dashed select-none"
            style={{ borderColor: "var(--border-color)" }}
            onClick={toggleAutoScan}
          >
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                autoScan ? "border-0" : "border border-white/20 bg-transparent"
              }`}
              style={autoScan ? { backgroundColor: "var(--accent-primary)", boxShadow: "0 0 8px var(--accent-glow)" } : {}}
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
        {!isBusy && (
          <DialogFooter className="sm:justify-between gap-3 px-6 py-4 border-t border-border bg-black/20">
            {phase === "welcome" || phase === "select" ? (
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="h-auto px-1.5 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  {t("onboarding.skip_btn")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleNeverShow}
                  className="h-auto px-1.5 py-1 text-[10px] text-slate-500 hover:text-slate-300"
                >
                  {t("onboarding.never_btn")}
                </Button>
              </div>
            ) : phase === "keys" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleKeysChoice(false)}
                className="h-auto px-1.5 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                {t("onboarding.keys_no")}
              </Button>
            ) : (
              <span />
            )}

            {phase === "welcome" ? (
              <Button
                type="button"
                onClick={startDetection}
                className="px-5 py-2 h-auto font-bold shadow-lg"
                style={{ boxShadow: "0 0 15px var(--accent-glow)" }}
              >
                <span>{t("onboarding.start_scan_btn")}</span>
              </Button>
            ) : phase === "keys" ? (
              <Button
                type="button"
                onClick={() => handleKeysChoice(true)}
                className="px-5 py-2 h-auto font-bold shadow-lg"
                style={{ boxShadow: "0 0 15px var(--accent-glow)" }}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{t("onboarding.keys_yes")}</span>
              </Button>
            ) : phase === "select" ? (
              <Button
                type="button"
                onClick={handleImport}
                disabled={selected.size === 0}
                className="px-5 py-2 h-auto font-bold shadow-lg"
                style={{ boxShadow: "0 0 15px var(--accent-glow)" }}
              >
                <span>{t("onboarding.import_btn")}</span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  soundEffects.playSelect();
                  onComplete();
                }}
                className="px-5 py-2 h-auto font-bold shadow-lg"
                style={{ boxShadow: "0 0 15px var(--accent-glow)" }}
              >
                {metadataState === "running" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{t("onboarding.start_btn")}</span>
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Utility exports ──────────────────────────────────────────────────────────

/** Returns true if this is the first launch (wizard neither completed nor skipped). */
export { shouldShowOnboarding };

/** Returns true if the user opted for auto-scan on startup. */
export function shouldAutoScanOnStartup(): boolean {
  try {
    const saved = localStorage.getItem(AUTO_SCAN_KEY);
    return saved !== null ? JSON.parse(saved) : true;
  } catch {
    return true;
  }
}
