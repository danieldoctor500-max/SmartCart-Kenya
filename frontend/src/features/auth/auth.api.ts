import { api } from "../../lib/api";
import type {
  AuthResponse,
  AuthUser,
} from "./auth.types";

interface RegistrationInput {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

interface CurrentUserResponse {
  success: boolean;
  data: {
    user: AuthUser;
  };
}

interface LogoutResponse {
  success: boolean;
  message: string;
}

export const authApi = {
  async register(input: RegistrationInput): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>(
      "/auth/register",
      input,
    );

    return response.data;
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>(
      "/auth/login",
      input,
    );

    return response.data;
  },

  async getCurrentUser(): Promise<AuthUser> {
    const response = await api.get<CurrentUserResponse>(
      "/auth/me",
    );

    return response.data.data.user;
  },

  async logout(): Promise<LogoutResponse> {
    const response = await api.post<LogoutResponse>(
      "/auth/logout",
    );

    return response.data;
  },
};