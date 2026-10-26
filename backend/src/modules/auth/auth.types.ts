
import type {
  Role,
  UserStatus,
} from "../../generated/prisma/client.js";

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  roles: Array<{
    role: Role;
  }>;
}

export interface AuthContext {
  sessionId: string;
  user: AuthenticatedUser;
}

declare global {
  namespace Express {
    interface Locals {
      auth?: AuthContext;
    }
  }
}

export {};
