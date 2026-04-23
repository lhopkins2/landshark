import apiClient from "./client";
import type { PaginatedResponse } from "../types/models";

export interface EnterpriseStats {
  total_organizations: number;
  active_organizations: number;
  total_users: number;
  total_documents: number;
  total_analyses: number;
}

export interface EnterpriseOrg {
  id: string;
  name: string;
  is_active: boolean;
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

export interface OrgTokenUsage {
  org_id: string;
  org_name: string;
  analysis_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ApiUsageResponse {
  period: string;
  platform_totals: {
    analysis_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  organizations: OrgTokenUsage[];
}

export const enterpriseApi = {
  stats: () => apiClient.get<EnterpriseStats>("/enterprise/stats/"),

  listOrgs: (params?: { search?: string; is_active?: string }) =>
    apiClient.get<PaginatedResponse<EnterpriseOrg>>("/enterprise/organizations/", { params }),

  createOrg: (data: {
    name: string;
    admin_email: string;
    admin_first_name?: string;
    admin_last_name?: string;
    admin_password: string;
  }) => apiClient.post<EnterpriseOrg>("/enterprise/organizations/", data),

  getOrg: (id: string) =>
    apiClient.get<EnterpriseOrg>(`/enterprise/organizations/${id}/`),

  updateOrg: (id: string, data: { name?: string; is_active?: boolean }) =>
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

  apiUsage: () => apiClient.get<ApiUsageResponse>("/enterprise/api-usage/"),
};
