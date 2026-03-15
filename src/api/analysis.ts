import apiClient from "./client";
import type {
  FormTemplate,
  UserAnalysisSettings,
  COTAnalysis,
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
    form_template_id?: string | null;
    analysis_order: string;
    output_format?: string;
    custom_request?: string;
    provider?: string;
    model?: string;
  }) =>
    apiClient.post<COTAnalysis>("/analysis/run/", data),
};
