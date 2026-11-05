export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type UserRole =
  | "CUSTOMER"
  | "SELLER"
  | "ADMIN";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  roles: Array<{
    role: UserRole;
  }>;
}

export interface ProfileUpdateInput {
  fullName?: string;
  phone?: string | null;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: AuthUser;
    expiresAt?: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[] | undefined>;
}