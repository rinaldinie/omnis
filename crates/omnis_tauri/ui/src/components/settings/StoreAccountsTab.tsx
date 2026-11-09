import React, { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  ShieldCheck,
  Check,
  HelpCircle,
} from "lucide-react";
import soundEffects from "../../utils/soundEffects";
import { openExternalUrl } from "../../utils/openUrl";
import { useTranslation } from "../../i18n/i18nContext";
import {
  StoreAccount,
  StoreSyncProgress,
  StoreIntegrationSettings,
} from "../store_accounts/types";
import { DisconnectStoreModal } from "../modals/DisconnectStoreModal";
import { SettingGroup, SettingRow, ToggleSwitch } from "./SettingsControls";
import {
  STORE_LIST,
  useStoreAccountsManager,
  SteamAuthForm,
  OAuthStoreSection,
} from "./store_accounts";

export { STORE_LIST };
export type { StoreAccount, StoreSyncProgress, StoreIntegrationSettings };

export interface StoreAccountsTabProps {
  onSyncComplete?: () => void;
  onClose?: () => void;
  selectedStoreId?: string;
  onSelectStore?: (storeId: string) => void;
  hideTabBar?: boolean;
}

export const StoreAccountsTab: React.FC<StoreAccountsTabProps> = ({
  onSyncComplete,
  onClose,
  selectedStoreId: controlledStoreId,
  onSelectStore,
  hideTabBar = false,
}) => {
  const { t } = useTranslation();
  const [internalStoreId, setInternalStoreId] = useState<string>("steam");
  const selectedStoreId = controlledStoreId ?? internalStoreId;

  const setSelectedStoreId = (id: string) => {
    setInternalStoreId(id);
    onSelectStore?.(id);
  };

  const {
    accounts,
    settingsMap,
    vaultStatus,
    isLoading,
    isSaving,
    actionLoading,
    syncProgress,
    banner,
    showTroubleshoot,
    setShowTroubleshoot,
    disconnectTarget,
    setDisconnectTarget,
    updateSetting,
    handleSaveSettings,
    handleConnectOAuth,
    handleConfirmDisconnect,
    handleManualSync,
  } = useStoreAccountsManager(onSyncComplete);

  const currentMeta = STORE_LIST.find((s) => s.id === selectedStoreId) || STORE_LIST[0];
  const currentAccount: StoreAccount = accounts.find((a) => a.store_id === selectedStoreId) || {
    store_id: selectedStoreId,
    name: currentMeta.name,
    username: "",
    avatar_url: null,
    is_connected: false,
    last_sync: null,
  };
  const currentSettings = settingsMap[selectedStoreId] || {
    store_id: selectedStoreId,
    import_installed: true,
    connect_account: false,
    import_uninstalled: true,
    ignore_other_accounts: true,
    account_id: "",
    api_key: "",
    import_free_items: false,
    import_family_sharing: true,
    import_game_pass: true,
    custom_client_path: "",
  };

  const isCurrentlySyncing =
    syncProgress[selectedStoreId]?.status === "syncing" || actionLoading[selectedStoreId];

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-sky-400 mb-3" />
        <p className="text-xs">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {/* Fallback vault warning if master key is unencrypted fallback */}
      {vaultStatus?.is_fallback && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-200 shrink-0">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">{t("store_accounts.vault_fallback_title")}</p>
            <p className="text-slate-300">
              {vaultStatus.warning || t("store_accounts.vault_fallback_desc")}
            </p>
          </div>
        </div>
      )}

      {/* Action banner feedback */}
      {banner && (
        <div
          className={`mx-6 mt-4 p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in shrink-0 ${
            banner.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-200"
              : banner.type === "error"
              ? "bg-rose-500/10 border-rose-500/25 text-rose-200"
              : "bg-sky-500/10 border-sky-500/25 text-sky-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {banner.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {banner.type === "info" && <Info className="w-4 h-4 text-sky-400 shrink-0" />}
            <span>{banner.message}</span>
          </div>
        </div>
      )}

      {/* Sub Tab Navigation */}
      {!hideTabBar && (
        <div
          className="flex items-center gap-1.5 px-6 pt-3 border-b bg-black/10 shrink-0 overflow-x-auto custom-scrollbar"
          style={{ borderColor: "var(--border-color)" }}
        >
          {STORE_LIST.map((store) => {
            const acc = accounts.find((a) => a.store_id === store.id);
            const isSelected = selectedStoreId === store.id;

            return (
              <button
                key={store.id}
                type="button"
                onClick={() => {
                  soundEffects.playNav();
                  setSelectedStoreId(store.id);
                }}
                className={`relative flex items-center gap-2 px-3 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected ? "text-white bg-white/5" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                }`}
              >
                {store.icon("w-4 h-4")}
                <span>{store.name}</span>
                <span
                  className={`w-2 h-2 rounded-full ml-1 ${
                    acc?.is_connected ? "bg-emerald-400 shadow-xs" : "bg-white/10"
                  }`}
                />
                {isSelected && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content for Selected Store */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar min-h-0">
        <SettingGroup
          title={currentMeta.name}
          description="Gestisci la connessione e le modalità di importazione dei giochi."
          icon={currentMeta.icon("w-4 h-4")}
        >
          <SettingRow
            title={t("store_accounts.import_installed")}
            description="Rileva ed elenca i giochi installati localmente sul computer."
          >
            <ToggleSwitch
              checked={currentSettings.import_installed}
              onChange={(val) => updateSetting(selectedStoreId, "import_installed", val)}
              ariaLabel={t("store_accounts.import_installed")}
            />
          </SettingRow>

          <SettingRow
            title={t("store_accounts.connect_account")}
            description="Collega l'account per sincronizzare libreria cloud, tempi di gioco e dettagli."
            badge={
              currentAccount.is_connected ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                    borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                    color: "var(--accent-primary)",
                  }}
                >
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                  <span>{t("store_accounts.authenticated")}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/5 text-slate-400 border border-white/10">
                  <span>{t("store_accounts.not_authenticated")}</span>
                </span>
              )
            }
          >
            <ToggleSwitch
              checked={currentSettings.connect_account}
              onChange={(val) => updateSetting(selectedStoreId, "connect_account", val)}
              ariaLabel={t("store_accounts.connect_account")}
            />
          </SettingRow>
        </SettingGroup>

        {/* Sub-options when "Connetti l'account" is enabled */}
        {currentSettings.connect_account && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <SettingGroup
              title="Filtri & Opzioni Sincronizzazione"
              description="Personalizza quali contenuti sincronizzare dalla piattaforma."
            >
              <SettingRow
                title={t("store_accounts.import_uninstalled")}
                description="Importa nella libreria Omnis anche i titoli posseduti ma non scaricati."
              >
                <ToggleSwitch
                  checked={currentSettings.import_uninstalled}
                  onChange={(val) => updateSetting(selectedStoreId, "import_uninstalled", val)}
                  ariaLabel={t("store_accounts.import_uninstalled")}
                />
              </SettingRow>

              <SettingRow
                title={t("store_accounts.ignore_other_accounts")}
                description="Ignora i giochi installati da altri account utente rilevati localmente."
              >
                <ToggleSwitch
                  checked={currentSettings.ignore_other_accounts}
                  onChange={(val) => updateSetting(selectedStoreId, "ignore_other_accounts", val)}
                  ariaLabel={t("store_accounts.ignore_other_accounts")}
                />
              </SettingRow>

              {selectedStoreId === "steam" && (
                <>
                  <SettingRow
                    title={t("store_accounts.import_free_items")}
                    description="Include oggetti gratuiti, software e strumenti associati alla licenza Steam."
                  >
                    <ToggleSwitch
                      checked={currentSettings.import_free_items || false}
                      onChange={(val) => updateSetting(selectedStoreId, "import_free_items", val)}
                      ariaLabel={t("store_accounts.import_free_items")}
                    />
                  </SettingRow>

                  <SettingRow
                    title={t("store_accounts.import_family_sharing")}
                    description="Importa i titoli condivisi dagli altri membri della famiglia Steam."
                  >
                    <ToggleSwitch
                      checked={currentSettings.import_family_sharing || false}
                      onChange={(val) => updateSetting(selectedStoreId, "import_family_sharing", val)}
                      ariaLabel={t("store_accounts.import_family_sharing")}
                    />
                  </SettingRow>
                </>
              )}

              {selectedStoreId === "xbox" && (
                <SettingRow
                  title={t("store_accounts.import_game_pass")}
                  description="Importa l'intero catalogo PC Game Pass collegato alla sottoscrizione attiva."
                >
                  <ToggleSwitch
                    checked={currentSettings.import_game_pass || false}
                    onChange={(val) => updateSetting(selectedStoreId, "import_game_pass", val)}
                    ariaLabel={t("store_accounts.import_game_pass")}
                  />
                </SettingRow>
              )}
            </SettingGroup>

            {/* CREDENZIALI & AUTENTICAZIONE SPECIFICA PER STORE */}
            {selectedStoreId === "steam" ? (
              <SteamAuthForm
                settings={currentSettings}
                updateSetting={(key, val) => updateSetting("steam", key, val)}
              />
            ) : (
              <OAuthStoreSection
                storeId={selectedStoreId}
                storeName={currentMeta.name}
                account={currentAccount}
                isLoading={!!actionLoading[selectedStoreId]}
                onConnect={() => handleConnectOAuth(selectedStoreId)}
                onRequestDisconnect={(sId, sName) => setDisconnectTarget({ id: sId, name: sName })}
              />
            )}

            {/* Troubleshoot link */}
            <div>
              <button
                type="button"
                onClick={() => setShowTroubleshoot(true)}
                className="text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                style={{ color: "var(--accent-primary)" }}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{t("store_accounts.troubleshoot")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleManualSync(selectedStoreId)}
            disabled={isCurrentlySyncing || !currentAccount.is_connected}
            title={isCurrentlySyncing ? t("store_accounts.syncing") : t("store_accounts.sync_now")}
            aria-label={isCurrentlySyncing ? t("store_accounts.syncing") : t("store_accounts.sync_now")}
            className="p-2.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isCurrentlySyncing ? "animate-spin text-sky-400" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => handleSaveSettings(selectedStoreId)}
            disabled={isSaving}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>{t("common.save")}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/10 hover:bg-white/10 transition-colors text-slate-300 cursor-pointer"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </div>

      {/* Troubleshooting Dialog Modal */}
      {showTroubleshoot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-lg rounded-2xl border p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <HelpCircle className="w-4 h-4 text-sky-400" />
                <span>{t("store_accounts.troubleshoot_title")}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTroubleshoot(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <p>
                <strong>{t("store_accounts.troubleshoot_step1_title")}</strong>
                <br />
                {t("store_accounts.troubleshoot_step1_desc")}
              </p>
              <p>
                <strong>{t("store_accounts.troubleshoot_step2_title")}</strong>
                <br />
                {t("store_accounts.troubleshoot_step2_desc")}{" "}
                <a
                  href="https://steamcommunity.com/dev/apikey"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.preventDefault();
                    openExternalUrl("https://steamcommunity.com/dev/apikey");
                  }}
                  className="text-sky-400 underline font-bold cursor-pointer"
                >
                  steamcommunity.com/dev/apikey
                </a>
              </p>
              <p>
                <strong>{t("store_accounts.troubleshoot_step3_title")}</strong>
                <br />
                {t("store_accounts.troubleshoot_step3_desc")}
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTroubleshoot(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all cursor-pointer hover:brightness-110 active:scale-95"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                {t("store_accounts.troubleshoot_got_it")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect confirmation modal with library cleanup options */}
      <DisconnectStoreModal
        isOpen={disconnectTarget !== null}
        storeId={disconnectTarget?.id || ""}
        storeName={disconnectTarget?.name || ""}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={handleConfirmDisconnect}
      />
    </div>
  );
};

export default StoreAccountsTab;
