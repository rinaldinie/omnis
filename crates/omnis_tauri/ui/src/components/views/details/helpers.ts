import type { TranslateFn } from "../../../types";

export interface CompletionStatusInfo {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}

export function getCompletionStatusInfo(
  status: string | null | undefined,
  t: TranslateFn
): CompletionStatusInfo {
  switch (status) {
    case "Playing":
      return {
        label: t("completion_status.playing"),
        color: "text-sky-300",
        bg: "bg-sky-500/10",
        border: "border-sky-500/20",
        dot: "bg-sky-400",
      };
    case "Completed":
      return {
        label: t("completion_status.completed"),
        color: "text-emerald-300",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        dot: "bg-emerald-400",
      };
    case "Beaten":
      return {
        label: t("completion_status.beaten"),
        color: "text-purple-300",
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
        dot: "bg-purple-400",
      };
    case "Backlog":
      return {
        label: t("completion_status.backlog"),
        color: "text-amber-300",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        dot: "bg-amber-400",
      };
    case "PlanToPlay":
      return {
        label: t("completion_status.plan_to_play"),
        color: "text-indigo-300",
        bg: "bg-indigo-500/10",
        border: "border-indigo-500/20",
        dot: "bg-indigo-400",
      };
    case "Abandoned":
      return {
        label: t("completion_status.abandoned"),
        color: "text-rose-300",
        bg: "bg-rose-500/10",
        border: "border-rose-500/20",
        dot: "bg-rose-400",
      };
    case "NotPlayed":
    default:
      return {
        label: t("completion_status.not_played"),
        color: "text-slate-300",
        bg: "bg-slate-500/10",
        border: "border-slate-500/20",
        dot: "bg-slate-400",
      };
  }
}
