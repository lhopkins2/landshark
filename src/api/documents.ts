import apiClient from "./client";
import type { Document, PaginatedResponse } from "../types/models";

export const documentsApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Document>>("/documents/", { params }),
  get: (id: string) =>
    apiClient.get<Document>(`/documents/${id}/`),
  upload: (data: FormData) =>
    apiClient.post<Document>("/documents/", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id: string, data: Partial<Document>) =>
    apiClient.patch<Document>(`/documents/${id}/`, data),
  delete: (id: string) =>
    apiClient.delete(`/documents/${id}/`),
  download: async (downloadUrl: string, filename: string) => {
    const response = await apiClient.get(downloadUrl, { responseType: "blob" });
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
