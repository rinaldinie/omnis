import React, { useEffect, useMemo, useState } from "react";
import {
  Bug,
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Info,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { api, BUG_REPORT_AREAS, BugReportArea } from "../../api";
import { useTranslation } from "../../i18n";
import soundEffects from "../../utils/soundEffects";
import { openExternalUrl } from "../../utils/openUrl";
import { getErrorMessage } from "../../utils/errors";
import type { BugReportPrefill } from "../../stores/useModalStore";
import packageJson from "../../../package.json";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: BugReportPrefill | null;
}

const GITHUB_BUG_REPORT_BASE = "https://github.com/rinaldinie/omnis/issues/new";

function buildFallbackIssueUrl(params: {
  title: string;
  description: string;
  reproduction: string;
  expected: string;
  actual: string;
  area: string;
  os: string;
  version: string;
  logs?: string;
}): { url: string; logsTruncated: boolean } {
  const url = new URL(GITHUB_BUG_REPORT_BASE);
  url.searchParams.set("template", "bug_report.yml");
  if (params.title) url.searchParams.set("title", params.title);
  url.searchParams.set("description", params.description);
  url.searchParams.set("reproduction", params.reproduction);
  url.searchParams.set("expected", params.expected);
  url.searchParams.set("actual", params.actual);
  url.searchParams.set("area", params.area);
  url.searchParams.set("os", params.os);
  url.searchParams.set("version", params.version);

  const rawLogs = params.logs?.trim() ?? "";
  if (!rawLogs) {
    return { url: url.toString(), logsTruncated: false };
  }

  url.searchParams.set("logs", rawLogs);
  if (url.toString().length <= 7000) {
    return { url: url.toString(), logsTruncated: false };
  }

  const truncatedLogs = `... [truncated; full logs copied to clipboard] ...\n${rawLogs.slice(-1800)}`;
  url.searchParams.set("logs", truncatedLogs);
  return { url: url.toString(), logsTruncated: true };
}

export default function BugReportModal({
  isOpen,
  onClose,
  prefill,
}: BugReportModalProps) {
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [area, setArea] = useState<BugReportArea>("UI / UX");
  const [description, setDescription] = useState("");
  const [reproduction, setReproduction] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [osInfo, setOsInfo] = useState("");
  const [appVersion, setAppVersion] = useState(`v${packageJson.version}`);
  const [backendLogs, setBackendLogs] = useState("");
  const [logFileName, setLogFileName] = useState<string | null>(null);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<{
    opened: boolean;
    truncated: boolean;
  } | null>(null);
  const [logsCopied, setLogsCopied] = useState(false);

  const combinedLogs = useMemo(() => {
    const parts: string[] = [];
    if (prefill?.extraLogs?.trim()) {
      parts.push(`[UI Error Details]\n${prefill.extraLogs.trim()}`);
    }
    if (backendLogs.trim()) {
      parts.push(backendLogs.trim());
    }
    return parts.join("\n\n");
  }, [prefill?.extraLogs, backendLogs]);

  useEffect(() => {
    if (!isOpen) return;

    setTitle(prefill?.title ?? "");
    setArea(prefill?.area ?? "UI / UX");
    setDescription(prefill?.description ?? "");
    setReproduction(prefill?.reproduction ?? "");
    setExpected(prefill?.expected ?? "");
    setActual(prefill?.actual ?? "");
    setIncludeLogs(true);
    setErrorMsg(null);
    setSubmitNotice(null);
    setLogsCopied(false);

    let cancelled = false;
    setIsLoadingContext(true);

    api.bugReport
      .getContext()
      .then((ctx) => {
        if (cancelled) return;
        setAppVersion(ctx.app_version || `v${packageJson.version}`);
        setOsInfo(ctx.os_info || "");
        setBackendLogs(ctx.logs_excerpt || "");
        setLogFileName(ctx.log_file_name ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackOs =
          typeof navigator !== "undefined" ? navigator.platform || "Unknown OS" : "Unknown OS";
        setOsInfo(fallbackOs);
        setAppVersion(`v${packageJson.version}`);
        setBackendLogs("");
        setLogFileName(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContext(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, prefill]);

  const copyLogsToClipboard = async (): Promise<boolean> => {
    if (!combinedLogs || typeof navigator === "undefined" || !navigator.clipboard) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(combinedLogs);
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2500);
      return true;
    } catch {
      return false;
    }
  };

  const handleOpenLogsFolder = () => {
    soundEffects.playSelect();
    api.window.openFolder("logs").catch((err) => {
      console.warn("Failed to open logs folder:", err);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitNotice(null);

    if (
      !title.trim() ||
      !description.trim() ||
      !reproduction.trim() ||
      !expected.trim() ||
      !actual.trim()
    ) {
      setErrorMsg(
        t("bug_report.validation_required", {
          defaultValue: "Please fill in all required fields before opening GitHub.",
        })
      );
      return;
    }

    soundEffects.playSelect();
    setIsSubmitting(true);

    const payload = {
      title: title.trim(),
      description: description.trim(),
      reproduction: reproduction.trim(),
      expected: expected.trim(),
      actual: actual.trim(),
      area,
      os: osInfo.trim() || "Unknown OS",
      version: appVersion.trim() || `v${packageJson.version}`,
      logs: includeLogs && combinedLogs ? combinedLogs : undefined,
    };

    try {
      let truncated = false;
      try {
        const res = await api.bugReport.openGitHubBugReport(payload);
        truncated = res.logs_truncated;
      } catch (ipcErr) {
        if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
          throw ipcErr;
        }
        const fallback = buildFallbackIssueUrl(payload);
        truncated = fallback.logsTruncated;
        await openExternalUrl(fallback.url);
      }

      if (truncated && includeLogs && combinedLogs) {
        await copyLogsToClipboard();
      }
      setSubmitNotice({ opened: true, truncated });
    } catch (err) {
      setErrorMsg(
        getErrorMessage(
          err,
          t("common.error", { defaultValue: "Error" })
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="backdrop-blur-md"
        className="max-w-2xl rounded-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden gap-0"
      >
        <DialogHeader className="flex-row justify-between items-center px-6 py-4 border-b border-border shrink-0 bg-black/25 space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border border-border bg-card shadow-md shrink-0"
              style={{ color: "var(--accent-primary)" }}
            >
              <Bug className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-black text-foreground">
                {t("bug_report.modal_title", {
                  defaultValue: "Report a Bug on GitHub",
                })}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                {t("bug_report.modal_subtitle", {
                  defaultValue:
                    "Fills out the GitHub issue form with your system info and sanitized logs",
                })}
              </DialogDescription>
            </div>
          </div>
          <ActionTooltip label={t("common.close", { defaultValue: "Close" })}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-full text-muted-foreground hover:text-foreground shrink-0"
              aria-label={t("common.close", { defaultValue: "Close" })}
            >
              <X className="w-4 h-4" />
            </Button>
          </ActionTooltip>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <ScrollArea className="flex-1 min-h-0" viewportClassName="p-6 space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {submitNotice?.opened && (
              <div
                role="status"
                className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>
                    {t("bug_report.opened_notice", {
                      defaultValue:
                        'GitHub issue page opened in your browser. Review the details and click "Create" to submit.',
                    })}
                  </p>
                  {submitNotice.truncated && (
                    <p className="text-emerald-300/90">
                      {t("bug_report.truncated_notice", {
                        defaultValue:
                          "Logs were too long for the URL and were truncated, but the full sanitized excerpt was copied to your clipboard.",
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Title & Area */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  {t("bug_report.field_title", { defaultValue: "Title" })} *
                </label>
                <Input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("bug_report.placeholder_title", {
                    defaultValue: "Short summary of the bug...",
                  })}
                  className="bg-black/30 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  {t("bug_report.field_area", { defaultValue: "Affected area" })} *
                </label>
                <Select
                  value={area}
                  onValueChange={(val) => setArea(val as BugReportArea)}
                >
                  <SelectTrigger className="bg-black/30 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUG_REPORT_AREAS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bug Description */}
            <div>
              <label className="block text-xs font-medium mb-1.5 text-slate-300">
                {t("bug_report.field_description", {
                  defaultValue: "Bug Description",
                })}{" "}
                *
              </label>
              <Textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("bug_report.placeholder_description", {
                  defaultValue: "Clear and concise description of what happened...",
                })}
                className="bg-black/30 min-h-[72px]"
              />
            </div>

            {/* Steps to Reproduce */}
            <div>
              <label className="block text-xs font-medium mb-1.5 text-slate-300">
                {t("bug_report.field_reproduction", {
                  defaultValue: "Steps to Reproduce",
                })}{" "}
                *
              </label>
              <Textarea
                required
                rows={3}
                value={reproduction}
                onChange={(e) => setReproduction(e.target.value)}
                placeholder={t("bug_report.placeholder_reproduction", {
                  defaultValue: "1. Go to ...\n2. Click on ...\n3. See error",
                })}
                className="bg-black/30 min-h-[72px]"
              />
            </div>

            {/* Expected & Actual */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  {t("bug_report.field_expected", {
                    defaultValue: "Expected Behavior",
                  })}{" "}
                  *
                </label>
                <Textarea
                  required
                  rows={2}
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  placeholder={t("bug_report.placeholder_expected", {
                    defaultValue: "What you expected to happen...",
                  })}
                  className="bg-black/30 min-h-[64px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  {t("bug_report.field_actual", {
                    defaultValue: "Actual Behavior",
                  })}{" "}
                  *
                </label>
                <Textarea
                  required
                  rows={2}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder={t("bug_report.placeholder_actual", {
                    defaultValue: "What actually happened instead...",
                  })}
                  className="bg-black/30 min-h-[64px]"
                />
              </div>
            </div>

            {/* OS & Version */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  {t("bug_report.field_os", {
                    defaultValue: "Operating System",
                  })}
                </label>
                <Input
                  type="text"
                  value={osInfo}
                  onChange={(e) => setOsInfo(e.target.value)}
                  placeholder={isLoadingContext ? "..." : "Windows 11"}
                  className="bg-black/30 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  {t("bug_report.field_version", {
                    defaultValue: "Omnis Version",
                  })}
                </label>
                <Input
                  type="text"
                  value={appVersion}
                  onChange={(e) => setAppVersion(e.target.value)}
                  className="bg-black/30 text-xs font-mono"
                />
              </div>
            </div>

            {/* Sanitized Logs Section */}
            <div className="rounded-2xl border border-border bg-black/20 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <Checkbox
                    checked={includeLogs}
                    onCheckedChange={(checked) =>
                      setIncludeLogs(Boolean(checked))
                    }
                  />
                  <div>
                    <span className="text-xs font-semibold text-foreground block">
                      {t("bug_report.include_logs", {
                        defaultValue: "Include sanitized recent logs",
                      })}
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      {t("bug_report.include_logs_hint", {
                        defaultValue:
                          "Local usernames and detected credentials are automatically redacted.",
                      })}
                    </span>
                  </div>
                </label>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!combinedLogs}
                    onClick={() => {
                      soundEffects.playSelect();
                      void copyLogsToClipboard();
                    }}
                    className="h-7 text-[11px]"
                  >
                    {logsCopied ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>
                      {logsCopied
                        ? t("bug_report.logs_copied", {
                            defaultValue: "Logs copied!",
                          })
                        : t("bug_report.copy_logs", {
                            defaultValue: "Copy logs",
                          })}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleOpenLogsFolder}
                    className="h-7 text-[11px]"
                  >
                    <FolderOpen className="w-3 h-3" />
                    <span>
                      {t("bug_report.open_logs_folder", {
                        defaultValue: "Logs folder",
                      })}
                    </span>
                  </Button>
                </div>
              </div>

              {includeLogs && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {t("bug_report.logs_preview", {
                        defaultValue: "Diagnostic log preview",
                      })}
                    </span>
                    {logFileName && (
                      <span className="font-mono text-[10px]">
                        {logFileName}
                      </span>
                    )}
                  </div>
                  <ScrollArea className="h-28 rounded-xl border border-white/10 bg-black/40">
                    <pre className="p-2.5 text-[10px] font-mono text-slate-300 whitespace-pre-wrap break-all">
                      {isLoadingContext
                        ? t("common.loading", { defaultValue: "Loading..." })
                        : combinedLogs ||
                          t("bug_report.logs_empty", {
                            defaultValue: "No log entries found.",
                          })}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t("bug_report.privacy_note", {
                  defaultValue:
                    "Opens GitHub in your browser with the form pre-filled so you can review before submitting.",
                })}
              </span>
            </div>
          </ScrollArea>

          <DialogFooter className="flex-row justify-end gap-2 px-6 py-4 border-t border-border bg-black/25 shrink-0 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
            >
              {t("common.close", { defaultValue: "Close" })}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="shadow-lg"
              style={{ boxShadow: "0 4px 14px var(--accent-glow)" }}
            >
              <ExternalLink className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? t("bug_report.submitting", {
                      defaultValue: "Opening GitHub...",
                    })
                  : t("bug_report.submit_github", {
                      defaultValue: "Open pre-filled GitHub Issue",
                    })}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
