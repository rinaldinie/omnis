import { invokeIpc } from "./client";

export const BUG_REPORT_AREAS = [
  "UI / UX",
  "Fullscreen / Gamepad Mode",
  "Library Scanning",
  "Metadata Pipeline",
  "Process Tracking",
  "Plugins",
  "Core Engine",
  "CLI",
  "Other",
] as const;

export type BugReportArea = (typeof BUG_REPORT_AREAS)[number];

export interface BugReportContext {
  app_version: string;
  os_info: string;
  logs_excerpt: string;
  log_file_name: string | null;
}

export interface GitHubBugReportPayload {
  title: string;
  description: string;
  reproduction: string;
  expected: string;
  actual: string;
  area: BugReportArea | string;
  os: string;
  version: string;
  logs?: string;
}

export interface BugReportLaunchResult {
  url: string;
  logs_truncated: boolean;
}

export const bugReportApi = {
  /** Collect app version, OS details, and a sanitized tail of the latest log file */
  getContext: (): Promise<BugReportContext> =>
    invokeIpc<BugReportContext>("get_bug_report_context"),

  /** Build a pre-filled GitHub issue URL matching bug_report.yml and open it in the browser */
  openGitHubBugReport: (
    payload: GitHubBugReportPayload
  ): Promise<BugReportLaunchResult> =>
    invokeIpc<BugReportLaunchResult>("open_github_bug_report", { payload }),
};
