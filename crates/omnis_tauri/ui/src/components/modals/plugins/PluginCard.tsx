import React from "react";
import {
  Folder,
  CheckCircle2,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  ProviderInfo,
  PluginSettingsMap,
  PluginSettingFieldSchema,
  PluginSettingFieldType,
} from "../../../types";
import { useTranslation } from "../../../i18n";
import { renderProviderIcon, getProviderColor } from "./constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PluginCardProps {
  prov: ProviderInfo;
  isEnabled: boolean;
  onToggle: (provId: string, enabled: boolean) => void;
  onUninstall: (pluginId: string) => void;
  settings: PluginSettingsMap;
  onSettingChange: (provId: string, key: string, value: string) => void;
  isApiKeyVisible: boolean;
  onToggleApiKeyVisibility: (provId: string) => void;
  testInfo?: { loading: boolean; success?: boolean; message?: string };
  onTestConnection: (provId: string) => void;
  onSaveSettings: (provId: string) => void;
}

export const PluginCard: React.FC<PluginCardProps> = ({
  prov,
  isEnabled,
  onToggle,
  onUninstall,
  settings,
  onSettingChange,
  isApiKeyVisible,
  onToggleApiKeyVisibility,
  testInfo,
  onTestConnection,
  onSaveSettings,
}) => {
  const { t } = useTranslation();

  // 1. INACTIVE / DISABLED COMPACT CARD (NO DETAILS, ULTRA CLEAN)
  if (!isEnabled) {
    return (
      <div
        key={prov.id}
        className="px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-4 bg-slate-900/30 border-white/5 hover:border-white/10"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/5 bg-slate-800/80">
            {renderProviderIcon(prov.id, false)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-300 truncate">{prov.name}</h4>
              <Badge
                variant="outline"
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border-slate-700/50"
              >
                {t("plugin_manager.disabled")}
              </Badge>
              {prov.version && (
                <span className="text-[10px] font-mono text-slate-500">v{prov.version}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5 max-w-lg">
              {prov.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {prov.is_builtin === false && (
            <ActionTooltip label={t("plugin_manager.uninstall_title")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onUninstall(prov.id)}
                className="h-auto px-3 py-1.5 rounded-xl text-xs font-bold text-rose-400 hover:text-white hover:border-rose-500/50 hover:bg-rose-500/10 gap-1.5"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
                aria-label={t("plugin_manager.uninstall_title")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("plugin_manager.uninstall")}</span>
              </Button>
            </ActionTooltip>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onToggle(prov.id, true)}
            className="h-auto px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 gap-1.5"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <Power className="w-3 h-3 text-emerald-400" />
            <span>{t("plugin_manager.enable")}</span>
          </Button>
        </div>
      </div>
    );
  }

  // 2. ACTIVE PLUGIN CARD (CLEAN & DETAILED)
  return (
    <div
      key={prov.id}
      className="p-5 rounded-2xl border space-y-4 transition-all shadow-lg"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-md shrink-0 border"
            style={{
              backgroundColor: getProviderColor(prov.id),
              borderColor: "rgba(255,255,255,0.15)",
            }}
          >
            {renderProviderIcon(prov.id, true)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black text-white">{prov.name}</h4>
              <Badge
                variant="outline"
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              >
                {t("plugin_manager.active")}
              </Badge>
              {prov.is_builtin !== false ? (
                <Badge
                  variant="outline"
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border-blue-500/30"
                >
                  {t("plugin_manager.builtin")}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border-purple-500/30 gap-1"
                >
                  <Folder className="w-3 h-3 text-purple-400" />
                  <span>{t("plugin_manager.external", { version: prov.version || "1.0" })}</span>
                </Badge>
              )}
              {prov.requires_api_key ? (
                prov.has_configured_key ? (
                  <Badge
                    variant="outline"
                    className="gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{t("plugin_manager.authenticated")}</span>
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border-amber-500/30"
                  >
                    <Key className="w-3 h-3" />
                    <span>{t("plugin_manager.requires_key")}</span>
                  </Badge>
                )
              ) : (
                <Badge
                  variant="outline"
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                >
                  Zero-Config
                </Badge>
              )}
            </div>

            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {prov.description}
            </p>

            {prov.plugin_path && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-300/80 mt-1 truncate">
                <Folder className="w-3 h-3 text-purple-400 shrink-0" />
                <span className="truncate" title={prov.plugin_path}>
                  {prov.plugin_path}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {prov.is_builtin === false && (
            <ActionTooltip label={t("plugin_manager.uninstall_title")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onUninstall(prov.id)}
                className="h-auto px-3 py-1.5 rounded-xl text-xs font-bold text-rose-400 hover:text-white hover:border-rose-500/50 hover:bg-rose-500/10 gap-1.5"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
                aria-label={t("plugin_manager.uninstall_title")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("plugin_manager.uninstall")}</span>
              </Button>
            </ActionTooltip>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onToggle(prov.id, false)}
            className="h-auto px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40"
          >
            {t("plugin_manager.disable")}
          </Button>
        </div>
      </div>

      {/* Capabilities Chips */}
      {prov.supported_fields && prov.supported_fields.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            {t("plugin_manager.fields_provided")}
          </span>
          {prov.supported_fields.map((f) => (
            <span
              key={f}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium border"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Provider Settings (if any) */}
      {prov.settings_schema && (
        <div
          className="p-3.5 rounded-xl border space-y-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-color)",
          }}
        >
          {prov.settings_schema.groups.map((group) => (
            <div key={group.id} className="space-y-2">
              {group.fields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-white flex items-center gap-1.5">
                      <Key className="w-3 h-3 text-indigo-400" />
                      <span>{field.label}</span>
                    </label>
                    {prov.key_help_url && (
                      <a
                        href={prov.key_help_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold flex items-center gap-1 hover:underline"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        <span>{t("plugin_manager.get_free_key")}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  {((): React.ReactNode => {
                    const legacyField = field as PluginSettingFieldSchema & PluginSettingFieldType;
                    const fieldType = legacyField.type || field.field_type?.type;
                    const fieldOptions = legacyField.options || field.field_type?.options;
                    const fieldDefault = legacyField.default || field.field_type?.default;
                    const fieldPlaceholder = legacyField.placeholder || field.field_type?.placeholder;
                    const isEnum = fieldType === "Enum" || !!fieldOptions;
                    const isSecret = fieldType === "SecretString";

                    if (isEnum) {
                      return (
                        <Select
                          value={settings[field.key] || fieldDefault || undefined}
                          onValueChange={(value) => onSettingChange(prov.id, field.key, value)}
                        >
                          <SelectTrigger
                            className="w-full h-8 px-3 rounded-lg text-xs font-sans"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <SelectValue placeholder={t("plugin_manager.enter_value")} />
                          </SelectTrigger>
                          <SelectContent>
                            {(fieldOptions || []).map((opt: string) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }

                    return (
                      <div className="relative flex items-center">
                        <Input
                          type={isSecret && !isApiKeyVisible ? "password" : "text"}
                          placeholder={fieldPlaceholder || t("plugin_manager.enter_value")}
                          value={settings[field.key] || ""}
                          onChange={(e) => onSettingChange(prov.id, field.key, e.target.value)}
                          className="w-full h-8 px-3 pr-9 rounded-lg text-xs font-mono"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        {isSecret && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onToggleApiKeyVisibility(prov.id)}
                            className="h-auto w-auto p-1 absolute right-2 text-slate-400 hover:text-white hover:bg-transparent"
                          >
                            {isApiKeyVisible ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                  {field.description && (
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {field.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Actions: Save Settings & Test Connection */}
          <div
            className="flex items-center justify-between pt-2 border-t"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex-1 mr-3">
              {testInfo?.loading && (
                <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("plugin_manager.testing")}</span>
                </div>
              )}
              {!testInfo?.loading && testInfo?.message && (
                <div
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    testInfo.success ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {testInfo.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{testInfo.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onTestConnection(prov.id)}
                disabled={testInfo?.loading}
                className="h-auto px-3 py-1.5 rounded-lg text-xs font-bold gap-1.5 hover:bg-white/5 active:opacity-80"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t("plugins_modal.test_connection")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onSaveSettings(prov.id)}
                className="h-auto px-4 py-1.5 rounded-lg text-xs font-black text-white shadow-md hover:brightness-110 active:opacity-90"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
