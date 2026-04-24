import apiClient from "./client";
import type { PaginatedResponse } from "../types/models";

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

export const auditLogApi = {
  list: (params?: { action?: string; search?: string; page?: number }) =>
    apiClient.get<PaginatedResponse<AuditLogEntry>>("/audit-log/", { params }),
};
