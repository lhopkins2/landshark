import apiClient from "./client";
import type { AuthUser } from "../types/models";

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  access: string;
  refresh: string;
  user: AuthUser;
}

interface TokenResponse {
  access: string;
  refresh: string;
}

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<LoginResponse>("/auth/login/", data),

  refreshToken: (refresh: string) =>
    apiClient.post<TokenResponse>("/auth/token/refresh/", { refresh }),

  logout: (refresh: string) =>
    apiClient.post("/auth/logout/", { refresh }),

  getProfile: () =>
    apiClient.get<AuthUser>("/auth/me/"),
};
