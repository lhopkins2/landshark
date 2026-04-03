import apiClient from "./client";
import type {
  FormTemplate,
  UserAnalysisSettings,
  COTAnalysis,
  COTAnalysisDebug,
  PaginatedResponse,
} from "../types/models";

export const formTemplatesApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<FormTemplate>>("/form-templates/", { params }),
  get: (id: string) =>
    apiClient.get<FormTemplate>(`/form-templates/${id}/`),
  upload: (data: FormData) =>
    apiClient.post<FormTemplate>("/form-templates/", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id: string, data: Partial<Pick<FormTemplate, "name" | "description" | "custom_prompt">>) =>
    apiClient.patch<FormTemplate>(`/form-templates/${id}/`, data),
  delete: (id: string) =>
    apiClient.delete(`/form-templates/${id}/`),
};

export const analysisSettingsApi = {
  get: () =>
    apiClient.get<UserAnalysisSettings>("/analysis/settings/"),
  update: (data: {
    default_provider?: string;
    default_model?: string;
    anthropic_api_key?: string;
    openai_api_key?: string;
    gemini_api_key?: string;
  }) =>
    apiClient.put<UserAnalysisSettings>("/analysis/settings/", data),
  listModels: (provider: string) =>
    apiClient.get<{ models: { id: string; name: string }[] }>(
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
    custom_request?: string;
    provider?: string;
    model?: string;
  }) =>
    apiClient.post<COTAnalysis>("/analysis/run/", data),
  cancel: (id: string) =>
    apiClient.post<COTAnalysis>(`/analysis/cancel/${id}/`),
  debug: (id: string) =>
    apiClient.get<COTAnalysisDebug>(`/analysis/debug/${id}/`),
};
