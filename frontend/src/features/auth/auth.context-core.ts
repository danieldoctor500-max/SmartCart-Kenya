
import { createContext } from "react";
import type { AuthUser } from "./auth.types";
import type { LoginInput } from "./auth.api";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<
  AuthContextValue | undefined
>(undefined);
