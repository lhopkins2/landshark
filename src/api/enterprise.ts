import apiClient from "./client";
import type { PaginatedResponse } from "../types/models";

interface EnterpriseStats {
  total_organizations: number;
  active_organizations: number;
  total_users: number;
  total_documents: number;
  total_analyses: number;
}

export type OrgTier = "standard" | "enterprise";

export interface EnterpriseOrg {
  id: string;
  name: string;
  is_active: boolean;
  tier: OrgTier;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface EnterpriseOrgMember {
  id: string;
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  has_api_key_access: boolean;
  is_active: boolean;
  created_at: string;
}

export interface EnterpriseTemplate {
  id: string;
  name: string;
  original_filename: string;
  file_size: number;
  uploaded_by_name: string | null;
  organizations: { id: string; name: string }[];
  created_at: string;
}

export interface OrgTokenUsage {
  org_id: string;
  org_name: string;
  analysis_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface ApiUsageResponse {
  period: string;
  platform_totals: {
    analysis_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  organizations: OrgTokenUsage[];
}

export interface UserDailyUsage {
  date: string;
  count: number;
}

export interface UserUsageRow {
  user_id: number;
  name: string;
  email: string;
  org_name: string;
  analysis_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  daily: UserDailyUsage[];
}

interface UserUsageResponse {
  period: string;
  totals: {
    user_count: number;
    analysis_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  users: UserUsageRow[];
}

export const enterpriseApi = {
  stats: () => apiClient.get<EnterpriseStats>("/enterprise/stats/"),

  listOrgs: (params?: { search?: string; is_active?: string }) =>
    apiClient.get<PaginatedResponse<EnterpriseOrg>>("/enterprise/organizations/", { params }),

  createOrg: (data: {
    name: string;
    tier?: OrgTier;
    admin_email: string;
    admin_first_name?: string;
    admin_last_name?: string;
    admin_password: string;
  }) => apiClient.post<EnterpriseOrg>("/enterprise/organizations/", data),

  getOrg: (id: string) =>
    apiClient.get<EnterpriseOrg>(`/enterprise/organizations/${id}/`),

  updateOrg: (id: string, data: { name?: string; is_active?: boolean; tier?: OrgTier }) =>
    apiClient.patch<EnterpriseOrg>(`/enterprise/organizations/${id}/`, data),

  listMembers: (orgId: string) =>
    apiClient.get<EnterpriseOrgMember[]>(`/enterprise/organizations/${orgId}/members/`),

  addMember: (orgId: string, data: {
    email: string;
    first_name?: string;
    last_name?: string;
    password: string;
    role: string;
  }) => apiClient.post<EnterpriseOrgMember>(`/enterprise/organizations/${orgId}/members/`, data),

  // Template catalog (Enterprise → Templates tab). `orgId` filters to templates assigned to that org.
  listTemplates: (orgId?: string) =>
    apiClient.get<EnterpriseTemplate[]>("/enterprise/templates/", {
      params: orgId ? { organization: orgId } : undefined,
    }),

  uploadTemplate: (data: FormData) =>
    apiClient.post<EnterpriseTemplate>("/enterprise/templates/", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  deleteTemplate: (templateId: string) =>
    apiClient.delete(`/enterprise/templates/${templateId}/`),

  /** Replace the template's full set of assigned org ids. */
  setTemplateOrgs: (templateId: string, organizationIds: string[]) =>
    apiClient.put<EnterpriseTemplate>(`/enterprise/templates/${templateId}/`, {
      organization_ids: organizationIds,
    }),

  apiUsage: () => apiClient.get<ApiUsageResponse>("/enterprise/api-usage/"),

  // Per-user usage for the Usage tab. `month` is "YYYY-MM"; omit for current month.
  userUsage: (month?: string) =>
    apiClient.get<UserUsageResponse>("/enterprise/user-usage/", {
      params: month ? { month } : undefined,
    }),
};
