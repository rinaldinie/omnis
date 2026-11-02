import { invokeIpc } from "./client";
import type {
  GameDto,
  MetadataPipelineConfig,
  ProviderInfo,
} from "../types";
import type { MetadataCandidateDto } from "../components/MetadataResolutionModal";

export const metadataApi = {
  /** Fetch all registered metadata providers */
  getProviders: (): Promise<ProviderInfo[]> =>
    invokeIpc<ProviderInfo[]>("get_metadata_providers"),

  /** Refresh external metadata provider plugins */
  refreshProviders: (): Promise<ProviderInfo[]> =>
    invokeIpc<ProviderInfo[]>("refresh_metadata_providers"),

  /** Save provider API key and configuration settings */
  saveProviderSettings: (
    providerId: string,
    settings: Record<string, unknown>
  ): Promise<boolean> =>
    invokeIpc<boolean>("save_provider_settings", { providerId, settings }),

  /** Toggle provider active/disabled status */
  toggleProvider: (providerId: string, enabled: boolean): Promise<boolean> =>
    invokeIpc<boolean>("toggle_provider", { providerId, enabled }),

  /** Test provider API credentials / connectivity */
  testProviderConnection: (providerId: string): Promise<string> =>
    invokeIpc<string>("test_provider_connection", { providerId }),

  /** Get metadata priority pipeline configuration */
  getPipelineConfig: (): Promise<MetadataPipelineConfig> =>
    invokeIpc<MetadataPipelineConfig>("get_metadata_pipeline_config"),

  /** Save metadata priority pipeline configuration */
  savePipelineConfig: (config: MetadataPipelineConfig): Promise<boolean> =>
    invokeIpc<boolean>("save_metadata_pipeline_config", { config }),

  /** Download metadata for all library games */
  downloadAllMetadata: (): Promise<number> =>
    invokeIpc<number>("download_all_metadata"),

  /** Cancel in-progress bulk metadata download */
  cancelMetadataDownload: (): Promise<boolean> =>
    invokeIpc<boolean>("cancel_metadata_download"),

  /** Download metadata for a specific batch of games */
  downloadBatchMetadata: (gameIds: string[]): Promise<number> =>
    invokeIpc<number>("download_batch_metadata", { gameIds }),

  /** Search metadata candidates for manual resolution */
  searchMetadataCandidates: (
    title: string,
    providerId?: string
  ): Promise<MetadataCandidateDto[]> =>
    invokeIpc<MetadataCandidateDto[]>("search_metadata_candidates", {
      title,
      providerId,
    }),

  /** Apply chosen metadata candidate to a game */
  applyMetadataCandidate: (
    gameId: string,
    candidate: MetadataCandidateDto,
    fields: string[]
  ): Promise<GameDto> =>
    invokeIpc<GameDto>("apply_metadata_candidate", {
      gameId,
      candidate,
      fields,
    }),
};
