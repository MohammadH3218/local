import "next-auth";
import { UserRole } from "@handycall/shared";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    error?: string;
    userRole?: UserRole;
    poolType?: "users" | "admin" | "customer";
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      role?: UserRole;
      given_name?: string | null;
      family_name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    userRole?: UserRole;
    poolType?: "users" | "admin" | "customer";
    name?: string | null;
    given_name?: string | null;
    family_name?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    error?: string;
    sub?: string;
    email?: string;
    userRole?: UserRole;
    poolType?: "users" | "admin" | "customer";
    name?: string;
    given_name?: string;
    family_name?: string;
  }
}
