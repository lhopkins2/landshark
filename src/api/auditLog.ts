import apiClient from "./client";

export interface AuditLogEntry {
  id: string;
  action: "upload" | "update" | "delete" | "download" | "analysis_run";
  user_email: string;
  user_name: string;
  document_name: string;
  document_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const auditLogApi = {
  list: (params?: { action?: string; search?: string; page?: number }) =>
    apiClient.get<PaginatedResponse<AuditLogEntry>>("/audit-log/", { params }),
};
