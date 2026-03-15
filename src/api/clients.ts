import apiClient from "./client";
import type { Client, Project, ChainOfTitle, PaginatedResponse } from "../types/models";

export const clientsApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Client>>("/clients/", { params }),
  get: (id: string) =>
    apiClient.get<Client>(`/clients/${id}/`),
  create: (data: Partial<Client>) =>
    apiClient.post<Client>("/clients/", data),
  update: (id: string, data: Partial<Client>) =>
    apiClient.patch<Client>(`/clients/${id}/`, data),
  delete: (id: string) =>
    apiClient.delete(`/clients/${id}/`),
};

export const projectsApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<Project>>("/projects/", { params }),
  get: (id: string) =>
    apiClient.get<Project>(`/projects/${id}/`),
  create: (data: Partial<Project>) =>
    apiClient.post<Project>("/projects/", data),
  update: (id: string, data: Partial<Project>) =>
    apiClient.patch<Project>(`/projects/${id}/`, data),
  delete: (id: string) =>
    apiClient.delete(`/projects/${id}/`),
};

export const chainsApi = {
  list: (params?: Record<string, string>) =>
    apiClient.get<PaginatedResponse<ChainOfTitle>>("/chains-of-title/", { params }),
  get: (id: string) =>
    apiClient.get<ChainOfTitle>(`/chains-of-title/${id}/`),
  create: (data: Partial<ChainOfTitle>) =>
    apiClient.post<ChainOfTitle>("/chains-of-title/", data),
  update: (id: string, data: Partial<ChainOfTitle>) =>
    apiClient.patch<ChainOfTitle>(`/chains-of-title/${id}/`, data),
  delete: (id: string) =>
    apiClient.delete(`/chains-of-title/${id}/`),
};
