import apiClient from "./client";
import type { Document, DocumentFolder, PaginatedResponse } from "../types/models";

export const foldersApi = {
  list: () =>
    apiClient.get<PaginatedResponse<DocumentFolder>>("/document-folders/"),
  create: (data: { name: string; description?: string }) =>
    apiClient.post<DocumentFolder>("/document-folders/", data),
  update: (id: string, data: Partial<DocumentFolder>) =>
    apiClient.patch<DocumentFolder>(`/document-folders/${id}/`, data),
  delete: (id: string) =>
    apiClient.delete(`/document-folders/${id}/`),
};

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
  moveToFolder: (documentIds: string[], folderId: string | null) =>
    apiClient.post("/documents/move-to-folder/", { document_ids: documentIds, folder_id: folderId }),
  extractText: (id: string) =>
    apiClient.get<{ text: string }>(`/documents/${id}/extract-text/`),
  downloadBlob: (id: string) =>
    apiClient.get(`/documents/${id}/download/`, { responseType: "blob" }),
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
