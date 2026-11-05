
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { authApi } from "./auth.api";
import type { LoginInput } from "./auth.api";
import type { AuthUser, ProfileUpdateInput } from "./auth.types";
import {
  AuthContext,
  type AuthContextValue,
} from "./auth.context-core";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<void> => {
    setIsLoading(true);

    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkSession(): Promise<void> {
      try {
        const currentUser = await authApi.getCurrentUser();

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (input: LoginInput): Promise<AuthUser> => {
      const response = await authApi.login(input);
      setUser(response.data.user);
      return response.data.user;
    },
    [],
  );

  const updateProfile = useCallback(
    async (input: ProfileUpdateInput): Promise<AuthUser> => {
      const updatedUser = await authApi.updateProfile(input);
      setUser(updatedUser);
      return updatedUser;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      refreshUser,
      login,
      updateProfile,
      logout,
    }),
    [user, isLoading, refreshUser, login, updateProfile, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
