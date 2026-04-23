import apiClient from "./client";
import type { OrgMember } from "../types/models";

export const orgApi = {
  listMembers: () =>
    apiClient.get<OrgMember[]>("/auth/org/members/"),

  getMember: (id: string) =>
    apiClient.get<OrgMember>(`/auth/org/members/${id}/`),

  createMember: (data: {
    email: string;
    first_name: string;
    last_name: string;
    password: string;
    role: string;
    has_api_key_access: boolean;
    is_developer?: boolean;
  }) =>
    apiClient.post<OrgMember>("/auth/org/members/", data),

  updateMember: (id: string, data: Partial<Pick<OrgMember, "role" | "has_api_key_access" | "is_active">>) =>
    apiClient.patch<OrgMember>(`/auth/org/members/${id}/`, data),

  deactivateMember: (id: string) =>
    apiClient.delete(`/auth/org/members/${id}/`),
};
