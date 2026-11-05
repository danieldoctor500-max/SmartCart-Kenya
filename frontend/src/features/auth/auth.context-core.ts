
import { createContext } from "react";
import type { LoginInput } from "./auth.api";
import type { AuthUser, ProfileUpdateInput } from "./auth.types";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  login: (input: LoginInput) => Promise<AuthUser>;
  updateProfile: (input: ProfileUpdateInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<
  AuthContextValue | undefined
>(undefined);
