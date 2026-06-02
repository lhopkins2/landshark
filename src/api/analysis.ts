import apiClient from "./client";
import type {
  UserAnalysisSettings,
  COTAnalysis,
  COTAnalysisDebug,
  PaginatedResponse,
  ReanalyzePayload,
} from "../types/models";

/** Payload accepted by `PUT /api/analysis/settings/` (user or org). */
export interface AnalysisSettingsUpdate {
  default_provider?: string;
  default_model?: string;
  anthropic_api_key?: string;
  openai_api_key?: string;
  gemini_api_key?: string;
}

/** Single entry in the model list returned by `GET /api/analysis/models/`. */
export interface ProviderModelOption {
  id: string;
  name: string;
}

export const analysisSettingsApi = {
  get: () =>
    apiClient.get<UserAnalysisSettings>("/analysis/settings/"),
  update: (data: AnalysisSettingsUpdate) =>
    apiClient.put<UserAnalysisSettings>("/analysis/settings/", data),
  listModels: (provider: string) =>
    apiClient.get<{ models: ProviderModelOption[] }>(
      "/analysis/models/",
      { params: { provider } },
    ),
};

export const analysesApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<COTAnalysis>>("/analyses/", { params }),
  get: (id: string) =>
    apiClient.get<COTAnalysis>(`/analyses/${id}/`),
  run: (data: {
    document_id: string;
    analysis_order: string;
    output_format?: string;
    legal_description?: string;
    provider?: string;
    model?: string;
  }) =>
    apiClient.post<COTAnalysis>("/analysis/run/", data),
  cancel: (id: string) =>
    apiClient.post<COTAnalysis>(`/analysis/cancel/${id}/`),
  reanalyze: (id: string, payload: ReanalyzePayload) =>
    apiClient.post<COTAnalysis>(`/analysis/${id}/reanalyze/`, payload),
  /** Render the analysis output to PDF/DOCX (with optional Doc Pg strip) and trigger a browser download. */
  export: async (
    id: string,
    opts: { format: "pdf" | "docx"; strip_doc_pg?: boolean; filename?: string },
  ) => {
    const response = await apiClient.post(`/analysis/${id}/export/`, opts, {
      responseType: "blob",
    });
    const cd = (response.headers["content-disposition"] || "") as string;
    const match = cd.match(/filename="([^"]+)"/);
    const fallback = `analysis.${opts.format}`;
    const filename = opts.filename
      ? (opts.filename.toLowerCase().endsWith(`.${opts.format}`)
          ? opts.filename
          : `${opts.filename}.${opts.format}`)
      : (match ? match[1] : fallback);
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  debug: (id: string) =>
    apiClient.get<COTAnalysisDebug>(`/analysis/debug/${id}/`),
};

interface DashboardStats {
  total_documents: number;
  analyses_this_month: number;
  pending_analyses: number;
  recent_activity: {
    id: string;
    type: string;
    status: string;
    document_name: string | null;
    created_by_name: string | null;
    created_at: string;
  }[];
}

export const dashboardApi = {
  stats: () => apiClient.get<DashboardStats>("/dashboard/stats/"),
};
