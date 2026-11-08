import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Database,
  Image,
  Award,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  SlidersHorizontal,
  Folder,
  Star,
  Scroll,
  ArrowUp,
  ArrowDown,
  Info,
  Check,
} from "lucide-react";
import { api } from "../../api";
import { useTranslation } from "../../i18n";
import { openExternalUrl } from "../../utils/openUrl";
import { soundEffects } from "../../utils/soundEffects";
import { ProviderInfo, MetadataPipelineConfig } from "../../types";
import { SettingGroup, SettingRow, ToggleSwitch } from "./SettingsControls";
import { SteamIcon, GogIcon } from "../StoreBadge";

export type MetadataSubTab =
  | "igdb"
  | "steamgriddb"
  | "opencritic"
  | "hltb"
  | "pipeline";

export interface MetadataSettingsTabProps {
  activeSubTab: MetadataSubTab;
  onClose?: () => void;
  onSyncComplete?: () => void;
  hideTabBar?: boolean;
  onSelectSubTab?: (tab: MetadataSubTab) => void;
}

export const MetadataSettingsTab: React.FC<MetadataSettingsTabProps> = ({
  activeSubTab,
  onClose: _onClose,
  onSyncComplete: _onSyncComplete,
  hideTabBar = true,
  onSelectSubTab,
}) => {
  const { t } = useTranslation();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pipelineConfig, setPipelineConfig] = useState<MetadataPipelineConfig>({
    cover_source: "steamgriddb",
    background_source: "steamgriddb",
    score_source: "opencritic",
    details_source: "steam",
    preserve_existing_artwork: true,
  });

  const [settingsValues, setSettingsValues] = useState<
    Record<string, Record<string, any>>
  >({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<
    Record<string, { loading: boolean; success?: boolean; message?: string }>
  >({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [isSavingPipeline, setIsSavingPipeline] = useState<boolean>(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [provList, pipe] = await Promise.all([
        api.metadata.getProviders(),
        api.metadata.getPipelineConfig(),
      ]);

      if (provList && Array.isArray(provList)) {
        setProviders(provList);
        const map: Record<string, Record<string, any>> = {};
        provList.forEach((p) => {
          map[p.id] = { ...(p.settings_values || {}) };
        });
        setSettingsValues((prev) => ({ ...map, ...prev }));
      }

      if (pipe) {
        setPipelineConfig(pipe);
      }
    } catch (err) {
      console.warn("Failed loading metadata settings data:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Flash a notification banner for feedback
  const showBannerMessage = (
    type: "success" | "error" | "info",
    message: string
  ) => {
    setBanner({ type, message });
    setTimeout(() => {
      setBanner((cur) => (cur?.message === message ? null : cur));
    }, 4500);
  };

  const getProvider = (id: string): ProviderInfo | undefined => {
    return providers.find(
      (p) =>
        p.id === id ||
        (id === "hltb" && (p.id === "howlongtobeat" || p.id === "hltb"))
    );
  };

  const handleSettingChange = (
    providerId: string,
    key: string,
    value: string
  ) => {
    setSettingsValues((prev) => ({
      ...prev,
      [providerId]: {
        ...(prev[providerId] || {}),
        [key]: value,
      },
    }));
  };

  const handleToggle = async (providerId: string, enabled: boolean) => {
    try {
      soundEffects.playSelect();
      await api.metadata.toggleProvider(providerId, enabled);
      showBannerMessage(
        "success",
        enabled
          ? t("metadata_settings.provider_enabled", {
              defaultValue: `Provider ${providerId.toUpperCase()} abilitato con successo.`,
            })
          : t("metadata_settings.provider_disabled", {
              defaultValue: `Provider ${providerId.toUpperCase()} disabilitato.`,
            })
      );
      await loadData();
    } catch (err: any) {
      showBannerMessage(
        "error",
        `Errore durante l'attivazione: ${err?.message || err}`
      );
    }
  };

  const handleSaveSettings = async (providerId: string) => {
    setIsSaving((prev) => ({ ...prev, [providerId]: true }));
    try {
      soundEffects.playSelect();
      const s = settingsValues[providerId] || {};
      await api.metadata.saveProviderSettings(providerId, s);
      showBannerMessage(
        "success",
        t("metadata_settings.saved_success", {
          defaultValue: `Impostazioni di ${providerId.toUpperCase()} salvate correttamente.`,
        })
      );
      await loadData();
    } catch (err: any) {
      showBannerMessage(
        "error",
        `Errore durante il salvataggio: ${err?.message || err}`
      );
    } finally {
      setIsSaving((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTestStatus((prev) => ({
      ...prev,
      [providerId]: { loading: true },
    }));

    try {
      soundEffects.playSelect();
      // First persist any current typed settings so the backend tests the latest credentials
      const s = settingsValues[providerId] || {};
      await api.metadata.saveProviderSettings(providerId, s);

      const res = await api.metadata.testProviderConnection(providerId);
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: true,
          message: res || "Connessione riuscita!",
        },
      }));
      await loadData();
    } catch (err: any) {
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: false,
          message: String(err?.message || err),
        },
      }));
    }
  };

  const handleSavePipeline = async () => {
    setIsSavingPipeline(true);
    try {
      soundEffects.playSelect();
      await api.metadata.savePipelineConfig(pipelineConfig);
      showBannerMessage(
        "success",
        t("metadata_settings.pipeline_saved", {
          defaultValue: "Configurazione della pipeline salvata con successo.",
        })
      );
      await loadData();
    } catch (err: any) {
      showBannerMessage(
        "error",
        `Errore salvataggio pipeline: ${err?.message || err}`
      );
    } finally {
      setIsSavingPipeline(false);
    }
  };

  const defaultPriorityOrder = [
    "steamgriddb",
    "steam",
    "gog",
    "igdb",
    "opencritic",
    "howlongtobeat",
  ];

  const movePriority = (index: number, direction: "up" | "down") => {
    const list = [...defaultPriorityOrder];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar text-white">
      {/* Optional Top Sub-tab Bar if not controlled by modal tree */}
      {!hideTabBar && (
        <div
          className="flex items-center gap-2 pb-4 border-b overflow-x-auto"
          style={{ borderColor: "var(--border-color)" }}
        >
          {[
            { id: "igdb" as MetadataSubTab, label: "IGDB", icon: Database },
            {
              id: "steamgriddb" as MetadataSubTab,
              label: "SteamGridDB",
              icon: Image,
            },
            {
              id: "opencritic" as MetadataSubTab,
              label: "OpenCritic",
              icon: Award,
            },
            {
              id: "hltb" as MetadataSubTab,
              label: "HowLongToBeat",
              icon: Clock,
            },
            {
              id: "pipeline" as MetadataSubTab,
              label: "Priorità Pipeline",
              icon: SlidersHorizontal,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSel = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectSubTab?.(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  isSel
                    ? "text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                style={{
                  backgroundColor: isSel
                    ? "var(--accent-primary)"
                    : "transparent",
                }}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* BANNER NOTIFICATION */}
      {banner && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 animate-fade-in ${
            banner.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : banner.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-blue-500/10 border-blue-500/30 text-blue-300"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : banner.type === "error" ? (
            <AlertCircle className="w-5 h-5 shrink-0" />
          ) : (
            <Info className="w-5 h-5 shrink-0" />
          )}
          <span className="text-xs font-semibold">{banner.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. IGDB (Internet Game Database - Twitch)                                */}
      {/* ========================================================================= */}
      {activeSubTab === "igdb" && (() => {
        const prov = getProvider("igdb");
        const isEnabled = prov?.is_enabled ?? true;
        const hasKey = prov?.has_configured_key ?? false;
        const provSettings = settingsValues["igdb"] || {};
        const isEyeVisible = showSecret["igdb"] || false;
        const test = testStatus["igdb"];
        const saving = isSaving["igdb"] || false;

        return (
          <div className="space-y-6">
            {/* Header Card */}
            <div
              className="p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg shrink-0 border"
                  style={{
                    backgroundColor: "#9146ff",
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white">
                      IGDB (Internet Game Database)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Nativo
                    </span>
                    {isEnabled ? (
                      hasKey ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Autenticato</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Key className="w-3 h-3" />
                          <span>Credenziali mancanti</span>
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/50">
                        Disabilitato
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Database globale gestito da Twitch con sinossi ufficiali,
                    screenshot ad alta risoluzione, generi, date di rilascio e
                    valutazioni della critica.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                <span className="text-xs font-bold text-slate-300">
                  {isEnabled ? "Attivo" : "Disattivato"}
                </span>
                <ToggleSwitch
                  checked={isEnabled}
                  onChange={(val) => handleToggle("igdb", val)}
                  ariaLabel={isEnabled ? "Attivo" : "Disattivato"}
                />
              </div>
            </div>

            {/* Credentials & Settings Group */}
            <SettingGroup
              title="Credenziali API Twitch / IGDB"
              description="Richieste per autorizzare le chiamate Apicalypse v4 tramite OAuth2 Twitch"
            >
              <SettingRow
                title="Client ID Twitch"
                description="L'identificativo client della tua applicazione creata nella Twitch Developer Console."
              >
                <div className="w-full md:w-80">
                  <input
                    type="text"
                    value={provSettings["client_id"] || ""}
                    onChange={(e) =>
                      handleSettingChange("igdb", "client_id", e.target.value)
                    }
                    placeholder="Es: abcdef1234567890..."
                    className="w-full h-9 px-3 rounded-xl text-xs border font-mono focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </SettingRow>

              <SettingRow
                title="Client Secret Twitch"
                description="La chiave segreta dell'applicazione. Verrà cifrata e memorizzata in modo sicuro."
              >
                <div className="w-full md:w-80 relative flex items-center">
                  <input
                    type={isEyeVisible ? "text" : "password"}
                    value={provSettings["client_secret"] || ""}
                    onChange={(e) =>
                      handleSettingChange(
                        "igdb",
                        "client_secret",
                        e.target.value
                      )
                    }
                    placeholder="Es: 1234567890abcdef..."
                    className="w-full h-9 px-3 pr-9 rounded-xl text-xs border font-mono focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecret((prev) => ({
                        ...prev,
                        igdb: !prev["igdb"],
                      }))
                    }
                    className="absolute right-2.5 text-slate-400 hover:text-white"
                  >
                    {isEyeVisible ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </SettingRow>
            </SettingGroup>

            {/* Guide & External Link */}
            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="space-y-1">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-400" />
                  Come ottenere le credenziali gratuite:
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed max-w-xl">
                  Accedi a Twitch Dev Console, registra una nuova applicazione
                  (URL reindirizzamento: http://localhost, categoria: Application
                  Integration), genera un Client Secret e incollali qui sopra.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  openExternalUrl("https://dev.twitch.tv/console/apps")
                }
                className="px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 hover:bg-white/5 active:scale-95"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <span>Console Sviluppatori Twitch</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Test Connection & Save Action */}
            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="min-w-0">
                {test?.loading && (
                  <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Autenticazione OAuth e verifica IGDB in corso...</span>
                  </div>
                )}
                {!test?.loading && test?.message && (
                  <div
                    className={`flex items-center gap-2 text-xs font-semibold ${
                      test.success ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {test.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="truncate">{test.message}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  disabled={test?.loading}
                  onClick={() => handleTestConnection("igdb")}
                  className="px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-white/5 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Testa Connessione</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveSettings("igdb")}
                  className="px-5 py-2 rounded-xl text-xs font-black text-white shadow-md transition-all hover:brightness-110 active:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Salva Credenziali</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 2. STEAMGRIDDB                                                            */}
      {/* ========================================================================= */}
      {activeSubTab === "steamgriddb" && (() => {
        const prov = getProvider("steamgriddb");
        const isEnabled = prov?.is_enabled ?? true;
        const hasKey = prov?.has_configured_key ?? false;
        const provSettings = settingsValues["steamgriddb"] || {};
        const isEyeVisible = showSecret["steamgriddb"] || false;
        const test = testStatus["steamgriddb"];
        const saving = isSaving["steamgriddb"] || false;

        return (
          <div className="space-y-6">
            {/* Header Card */}
            <div
              className="p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg shrink-0 border"
                  style={{
                    backgroundColor: "#00aaff",
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <Image className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white">
                      SteamGridDB
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Nativo
                    </span>
                    {isEnabled ? (
                      hasKey ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Autenticato</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Key className="w-3 h-3" />
                          <span>API Key richiesta</span>
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/50">
                        Disabilitato
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Il gold standard della community per copertine verticali HD
                    (600x900), sfondi panoramici Hero (1920x1080 / 4K), loghi
                    trasparenti e icone.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                <span className="text-xs font-bold text-slate-300">
                  {isEnabled ? "Attivo" : "Disattivato"}
                </span>
                <ToggleSwitch
                  checked={isEnabled}
                  onChange={(val) => handleToggle("steamgriddb", val)}
                  ariaLabel={isEnabled ? "Attivo" : "Disattivato"}
                />
              </div>
            </div>

            {/* Credentials Group */}
            <SettingGroup
              title="Credenziali SteamGridDB"
              description="Richiesta una chiave API personale per effettuare ricerche e download di artwork HD"
            >
              <SettingRow
                title="API Key"
                description="La tua chiave API SteamGridDB personale (generabile dal tuo profilo)."
              >
                <div className="w-full md:w-80 relative flex items-center">
                  <input
                    type={isEyeVisible ? "text" : "password"}
                    value={provSettings["api_key"] || ""}
                    onChange={(e) =>
                      handleSettingChange(
                        "steamgriddb",
                        "api_key",
                        e.target.value
                      )
                    }
                    placeholder="Es: e4d909c298b3..."
                    className="w-full h-9 px-3 pr-9 rounded-xl text-xs border font-mono focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecret((prev) => ({
                        ...prev,
                        steamgriddb: !prev["steamgriddb"],
                      }))
                    }
                    className="absolute right-2.5 text-slate-400 hover:text-white"
                  >
                    {isEyeVisible ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </SettingRow>
            </SettingGroup>

            {/* Guide & External Link */}
            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="space-y-1">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-cyan-400" />
                  Come ottenere la tua chiave gratuita:
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed max-w-xl">
                  Accedi su steamgriddb.com con il tuo account, apri le
                  Preferenze del profilo &gt; sezione API, genera una nuova
                  chiave e incollala qui.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  openExternalUrl(
                    "https://www.steamgriddb.com/profile/preferences/api"
                  )
                }
                className="px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 hover:bg-white/5 active:scale-95"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <span>Genera API Key su SteamGridDB</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Test Connection & Save Action */}
            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="min-w-0">
                {test?.loading && (
                  <div className="flex items-center gap-2 text-xs text-cyan-400 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifica chiave SteamGridDB in corso...</span>
                  </div>
                )}
                {!test?.loading && test?.message && (
                  <div
                    className={`flex items-center gap-2 text-xs font-semibold ${
                      test.success ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {test.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="truncate">{test.message}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  disabled={test?.loading}
                  onClick={() => handleTestConnection("steamgriddb")}
                  className="px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-white/5 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Testa Connessione</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveSettings("steamgriddb")}
                  className="px-5 py-2 rounded-xl text-xs font-black text-white shadow-md transition-all hover:brightness-110 active:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Salva Impostazioni</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 3. OPENCRITIC                                                             */}
      {/* ========================================================================= */}
      {activeSubTab === "opencritic" && (() => {
        const prov = getProvider("opencritic");
        const isEnabled = prov?.is_enabled ?? true;
        const hasKey = prov?.has_configured_key ?? false;
        const provSettings = settingsValues["opencritic"] || {};
        const isEyeVisible = showSecret["opencritic"] || false;
        const test = testStatus["opencritic"];
        const saving = isSaving["opencritic"] || false;

        return (
          <div className="space-y-6">
            {/* Header Card */}
            <div
              className="p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg shrink-0 border"
                  style={{
                    backgroundColor: "#ff5900",
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white">OpenCritic</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Nativo
                    </span>
                    {isEnabled ? (
                      hasKey ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Autenticato</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Key className="w-3 h-3" />
                          <span>RapidAPI Key richiesta</span>
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/50">
                        Disabilitato
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Aggregatore globale di recensioni e voti della stampa
                    specializzata: Top Critic Score, percentuale di raccomandazione
                    e badge di fascia (Mighty, Strong, Fair, Weak).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                <span className="text-xs font-bold text-slate-300">
                  {isEnabled ? "Attivo" : "Disattivato"}
                </span>
                <ToggleSwitch
                  checked={isEnabled}
                  onChange={(val) => handleToggle("opencritic", val)}
                  ariaLabel={isEnabled ? "Attivo" : "Disattivato"}
                />
              </div>
            </div>

            {/* Credentials Group */}
            <SettingGroup
              title="Credenziali RapidAPI OpenCritic"
              description="OpenCritic distribuisce i propri endpoint tramite il portale per sviluppatori RapidAPI"
            >
              <SettingRow
                title="RapidAPI Key (X-RapidAPI-Key)"
                description="La chiave personale per effettuare le richieste verso l'endpoint opencritic-api."
              >
                <div className="w-full md:w-80 relative flex items-center">
                  <input
                    type={isEyeVisible ? "text" : "password"}
                    value={provSettings["rapidapi_key"] || ""}
                    onChange={(e) =>
                      handleSettingChange(
                        "opencritic",
                        "rapidapi_key",
                        e.target.value
                      )
                    }
                    placeholder="Es: a1b2c3d4e5f6..."
                    className="w-full h-9 px-3 pr-9 rounded-xl text-xs border font-mono focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowSecret((prev) => ({
                        ...prev,
                        opencritic: !prev["opencritic"],
                      }))
                    }
                    className="absolute right-2.5 text-slate-400 hover:text-white"
                  >
                    {isEyeVisible ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </SettingRow>
            </SettingGroup>

            {/* Guide & External Link */}
            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="space-y-1">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-amber-400" />
                  Piano gratuito RapidAPI:
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed max-w-xl">
                  Iscriviti su rapidapi.com, sottoscrivi il piano Basic
                  (gratuito) dell&apos;API OpenCritic e copia la chiave
                  dall&apos;header di prova X-RapidAPI-Key.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  openExternalUrl(
                    "https://rapidapi.com/auth?referral=/opencritic-opencritic-v1/api/opencritic-api"
                  )
                }
                className="px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 hover:bg-white/5 active:scale-95"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <span>Iscriviti su RapidAPI</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Test Connection & Save Action */}
            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="min-w-0">
                {test?.loading && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifica endpoint OpenCritic in corso...</span>
                  </div>
                )}
                {!test?.loading && test?.message && (
                  <div
                    className={`flex items-center gap-2 text-xs font-semibold ${
                      test.success ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {test.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="truncate">{test.message}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  disabled={test?.loading}
                  onClick={() => handleTestConnection("opencritic")}
                  className="px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-white/5 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Testa Connessione</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveSettings("opencritic")}
                  className="px-5 py-2 rounded-xl text-xs font-black text-white shadow-md transition-all hover:brightness-110 active:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Salva Impostazioni</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 4. HOWLONGTOBEAT (HLTB)                                                   */}
      {/* ========================================================================= */}
      {activeSubTab === "hltb" && (() => {
        const prov = getProvider("hltb");
        const isEnabled = prov?.is_enabled ?? true;
        const test = testStatus["howlongtobeat"] || testStatus["hltb"];
        const saving = isSaving["howlongtobeat"] || false;

        return (
          <div className="space-y-6">
            {/* Header Card */}
            <div
              className="p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg shrink-0 border"
                  style={{
                    backgroundColor: "#2980b9",
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-white">
                      HowLongToBeat (HLTB)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Nativo Integrato
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Zero-Config
                    </span>
                    {isEnabled ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Attivo</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/50">
                        Disabilitato
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Recupera in tempo reale le durate medie di completamento
                    fornite dalla community di HowLongToBeat, senza alcuna
                    configurazione o account richiesto.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                <span className="text-xs font-bold text-slate-300">
                  {isEnabled ? "Attivo" : "Disattivato"}
                </span>
                <ToggleSwitch
                  checked={isEnabled}
                  onChange={(val) =>
                    handleToggle(prov?.id || "howlongtobeat", val)
                  }
                  ariaLabel={isEnabled ? "Attivo" : "Disattivato"}
                />
              </div>
            </div>

            {/* Feature Showcase Grid */}
            <SettingGroup
              title="Tempi di Gioco Tracciati"
              description="Ogni titolo nella tua libreria può visualizzare fino a tre metriche temporali stimate"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div
                  className="p-4 rounded-xl border space-y-1.5"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Storia Principale
                  </span>
                  <h4 className="text-sm font-bold text-white">Main Story</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Tempo necessario per completare la sola campagna principale
                    o i titoli di coda, tralasciando missioni secondarie o extra.
                  </p>
                </div>

                <div
                  className="p-4 rounded-xl border space-y-1.5"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                    Storia + Extra
                  </span>
                  <h4 className="text-sm font-bold text-white">Main + Extra</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Campagna principale godendosi missioni opzionali, collezionabili
                    chiave e contenuti secondari della mappa.
                  </p>
                </div>

                <div
                  className="p-4 rounded-xl border space-y-1.5"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Completamento Totale
                  </span>
                  <h4 className="text-sm font-bold text-white">Completionist</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    100% di completamento: sblocco di tutti gli obiettivi/trofei,
                    segreti, equipaggiamenti massimi e sfide bonus.
                  </p>
                </div>
              </div>
            </SettingGroup>

            {/* Integration info box */}
            <div
              className="p-4 rounded-xl border space-y-2 text-xs"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
              }}
            >
              <span className="font-bold text-white flex items-center gap-1.5">
                <Info className="w-4 h-4 text-cyan-400" />
                Integrazione Nativa in Omnis:
              </span>
              <ul className="text-slate-400 text-[11px] space-y-1 list-disc pl-5 leading-relaxed">
                <li>
                  I tempi di gioco vengono memorizzati nei metadati estesi del
                  titolo e visualizzati direttamente nella scheda dettagli del gioco.
                </li>
                <li>
                  Nel modale <strong>Sincronizzazione Metadati Batch</strong> è
                  disponibile il preset dedicato &quot;Mancanti di HowLongToBeat&quot;
                  per arricchire la libreria con un solo clic.
                </li>
                <li>
                  Dalla scheda dettagli di qualsiasi gioco puoi cliccare sul
                  pulsante di aggiornamento HLTB per ricalcolare i tempi in tempo
                  reale.
                </li>
              </ul>
            </div>

            {/* Test Connection Action */}
            <div
              className="p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="min-w-0">
                {test?.loading && (
                  <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifica endpoint di ricerca HowLongToBeat in corso...</span>
                  </div>
                )}
                {!test?.loading && test?.message && (
                  <div
                    className={`flex items-center gap-2 text-xs font-semibold ${
                      test.success ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {test.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="truncate">{test.message}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  disabled={test?.loading}
                  onClick={() =>
                    handleTestConnection(prov?.id || "howlongtobeat")
                  }
                  className="px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-white/5 disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Testa Connettività HLTB</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    handleSaveSettings(prov?.id || "howlongtobeat")
                  }
                  className="px-5 py-2 rounded-xl text-xs font-black text-white shadow-md transition-all hover:brightness-110 active:opacity-90 flex items-center gap-1.5"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Salva Stato</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 5. PRIORITÀ & REGOLE PIPELINE                                            */}
      {/* ========================================================================= */}
      {activeSubTab === "pipeline" && (
        <div className="space-y-6">
          {/* Header Card */}
          <div
            className="p-6 rounded-2xl border"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <SlidersHorizontal
                className="w-5 h-5"
                style={{ color: "var(--accent-primary)" }}
              />
              <h3 className="text-base font-bold text-white">
                Regole e Risoluzione dei Metadati
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Imposta da quale sorgente recuperare copertine verticali, sfondi
              panoramici, valutazioni della critica e dettagli testuali durante la
              sincronizzazione automatica o batch.
            </p>
          </div>

          {/* Granular Source Selectors */}
          <SettingGroup
            title="Sorgenti Preferite per Campo"
            description="Seleziona il provider prioritario per ciascun elemento multimediale del gioco"
          >
            <SettingRow
              title="Copertina Principale (Cover Grid 600x900)"
              description="Visualizzata nella visualizzazione a griglia e nella copertina frontale 3D."
            >
              <select
                value={pipelineConfig.cover_source}
                onChange={(e) =>
                  setPipelineConfig({
                    ...pipelineConfig,
                    cover_source: e.target.value,
                  })
                }
                className="w-full md:w-80 h-9 px-3 rounded-xl text-xs border font-sans focus:outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="steamgriddb">
                  SteamGridDB (Artwork HD 600x900)
                </option>
                <option value="steam">Steam Store CDN (Ufficiale)</option>
                <option value="gog">GOG Catalog (Ufficiale DRM-Free)</option>
                <option value="igdb">IGDB (Twitch Database)</option>
              </select>
            </SettingRow>

            <SettingRow
              title="Sfondo Panoramico (Hero Background)"
              description="Mostrato nell'intestazione dettagli, visualizzazione desktop e fullscreen."
            >
              <select
                value={pipelineConfig.background_source}
                onChange={(e) =>
                  setPipelineConfig({
                    ...pipelineConfig,
                    background_source: e.target.value,
                  })
                }
                className="w-full md:w-80 h-9 px-3 rounded-xl text-xs border font-sans focus:outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="steamgriddb">
                  SteamGridDB (Hero 1920x1080 / 4K)
                </option>
                <option value="steam">Steam Store CDN (Ufficiale)</option>
                <option value="gog">GOG Catalog (Artwork HD)</option>
                <option value="igdb">IGDB (Screenshot HD)</option>
              </select>
            </SettingRow>

            <SettingRow
              title="Valutazione Critica (Score & Voti)"
              description="Sorgente del punteggio numerico e del badge mostrato sul gioco."
            >
              <select
                value={pipelineConfig.score_source}
                onChange={(e) =>
                  setPipelineConfig({
                    ...pipelineConfig,
                    score_source: e.target.value,
                  })
                }
                className="w-full md:w-80 h-9 px-3 rounded-xl text-xs border font-sans focus:outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="opencritic">
                  OpenCritic (Top Critic Score & Tier)
                </option>
                <option value="igdb">
                  IGDB (Total Rating / Critic Score)
                </option>
                <option value="steam">Steam Metacritic</option>
              </select>
            </SettingRow>

            <SettingRow
              title="Descrizioni e Sinossi"
              description="Sorgente del testo della trama, sviluppatore, data e generi del gioco."
            >
              <select
                value={pipelineConfig.details_source}
                onChange={(e) =>
                  setPipelineConfig({
                    ...pipelineConfig,
                    details_source: e.target.value,
                  })
                }
                className="w-full md:w-80 h-9 px-3 rounded-xl text-xs border font-sans focus:outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="steam">
                  Steam Store Engine (Localizzato in Italiano)
                </option>
                <option value="gog">GOG Catalog (Catalogo DRM-Free)</option>
                <option value="igdb">IGDB (Twitch Gaming Database)</option>
              </select>
            </SettingRow>
          </SettingGroup>

          {/* Preserve Existing Artwork Protection */}
          <SettingGroup
            title="Protezione Media Esistenti"
            description="Impedisci la sovrascrittura accidentale delle copertine e degli sfondi già scaricati"
          >
            <SettingRow
              title="Conserva Copertine e Sfondi Esistenti"
              description="Se attivato, il download batch arricchisce soltanto i titoli sprovvisti di immagini o voti, senza sostituire i media attuali."
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-slate-300">
                  {pipelineConfig.preserve_existing_artwork !== false
                    ? "Protetto"
                    : "Sovrascrivi"}
                </span>
                <ToggleSwitch
                  checked={pipelineConfig.preserve_existing_artwork !== false}
                  onChange={(val) =>
                    setPipelineConfig({
                      ...pipelineConfig,
                      preserve_existing_artwork: val,
                    })
                  }
                  ariaLabel="Conserva Copertine Esistenti"
                />
              </div>
            </SettingRow>
          </SettingGroup>

          {/* Save Action */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={isSavingPipeline}
              onClick={handleSavePipeline}
              className="px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg transition-all hover:brightness-110 active:opacity-90 flex items-center gap-2"
              style={{ backgroundColor: "var(--accent-primary)" }}
            >
              {isSavingPipeline ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>Salva Configurazione Pipeline</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
