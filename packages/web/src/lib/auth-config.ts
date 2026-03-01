import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import CognitoProvider from "next-auth/providers/cognito";
import { UserRole } from "@handycall/shared";
import { decodeJWT, extractUserRole } from "@/lib/jwt";
import type { JWT } from "next-auth/jwt";

// Prefer injected env, but fall back to production defaults; avoid mutating env to keep
// the bundle side-effect free.
const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "https://handycall.org";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.handycall.org/api/v1";
const COGNITO_REGION =
  process.env.COGNITO_REGION ??
  process.env.AWS_COGNITO_REGION ??
  process.env.NEXT_PUBLIC_COGNITO_REGION ??
  "us-east-1";
const COGNITO_USER_POOL_ID =
  process.env.COGNITO_USER_POOL_ID ??
  process.env.AWS_COGNITO_USERS_POOL_ID ??
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ??
  "us-east-1_gBsGtRPnM";
const COGNITO_ISSUER =
  process.env.COGNITO_ISSUER ??
  (COGNITO_REGION && COGNITO_USER_POOL_ID
    ? `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
    : undefined);
const COGNITO_CLIENT_ID =
  process.env.COGNITO_CLIENT_ID ??
  process.env.AWS_COGNITO_USERS_CLIENT_ID ??
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ??
  "3vhh0artoakoardoi4e9rdm3m9";
const COGNITO_CLIENT_SECRET =
  process.env.COGNITO_CLIENT_SECRET ??
  process.env.AWS_COGNITO_USERS_CLIENT_SECRET ??
  "";
const COGNITO_GOOGLE_IDP = process.env.COGNITO_GOOGLE_IDP ?? "Google";
const COGNITO_APPLE_IDP = process.env.COGNITO_APPLE_IDP ?? "SignInWithApple";
const COGNITO_AUTH_DOMAIN =
  process.env.COGNITO_AUTH_DOMAIN ??
  process.env.NEXT_PUBLIC_COGNITO_AUTH_DOMAIN ??
  process.env.COGNITO_DOMAIN ??
  process.env.NEXT_PUBLIC_COGNITO_DOMAIN ??
  "handycall";
const COGNITO_AUTH_BASE_URL = COGNITO_AUTH_DOMAIN
  ? COGNITO_AUTH_DOMAIN.startsWith("http")
    ? COGNITO_AUTH_DOMAIN
    : `https://${COGNITO_AUTH_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com`
  : undefined;

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function getTokenExpiryMs(token?: string) {
  if (!token) return null;
  const decoded = decodeJWT(token);
  const exp = decoded?.exp;
  if (!exp) return null;
  return exp * 1000;
}

async function refreshCognitoTokens(token: JWT): Promise<JWT> {
  const refreshToken = token.refreshToken as string | undefined;
  const idToken = token.idToken as string | undefined;
  const decoded = idToken ? decodeJWT(idToken) : null;
  const email =
    (token.email as string | undefined) ||
    (decoded?.email as string | undefined) ||
    (token.sub as string | undefined);
  if (!refreshToken || !email) {
    return {
      ...token,
      accessToken: undefined,
      idToken: undefined,
      error: "RefreshAccessTokenError",
    };
  }

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: refreshToken,
        email,
        pool_type: (token.poolType as string | undefined) || 'auto',
      }),
    });

    if (!response.ok) {
      return {
        ...token,
        accessToken: undefined,
        idToken: undefined,
        error: "RefreshAccessTokenError",
      };
    }

    const data = await response.json();
    const accessToken = data.access_token || data.accessToken;
    const idToken = data.id_token || data.idToken;
    const nextRefreshToken = data.refresh_token || data.refreshToken || refreshToken;

    return {
      ...token,
      accessToken: accessToken || token.accessToken,
      idToken: idToken || token.idToken,
      refreshToken: nextRefreshToken,
      error: undefined,
    };
  } catch {
    return {
      ...token,
      accessToken: undefined,
      idToken: undefined,
      error: "RefreshAccessTokenError",
    };
  }
}

const buildCognitoProvider = (options: {
  id: string;
  name: string;
  identityProvider: string;
}) =>
  CognitoProvider({
    id: options.id,
    name: options.name,
    clientId: COGNITO_CLIENT_ID,
    clientSecret: COGNITO_CLIENT_SECRET,
    issuer: COGNITO_ISSUER,
    checks: ["state", "nonce"],
    ...(COGNITO_AUTH_BASE_URL
      ? {
          authorization: {
            url: `${COGNITO_AUTH_BASE_URL}/oauth2/authorize`,
            params: {
              identity_provider: options.identityProvider,
              response_type: "code",
              scope: "openid email profile",
            },
          },
          token: `${COGNITO_AUTH_BASE_URL}/oauth2/token`,
          userinfo: `${COGNITO_AUTH_BASE_URL}/oauth2/userInfo`,
        }
      : {
          authorization: {
            params: {
              identity_provider: options.identityProvider,
              response_type: "code",
              scope: "openid email profile",
            },
          },
        }),
  });

export const authOptions: NextAuthOptions = {
  providers: [
    ...(COGNITO_ISSUER && COGNITO_CLIENT_ID
      ? [
          buildCognitoProvider({
            id: "cognito-google",
            name: "Google",
            identityProvider: COGNITO_GOOGLE_IDP,
          }),
          buildCognitoProvider({
            id: "cognito-apple",
            name: "Apple",
            identityProvider: COGNITO_APPLE_IDP,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        pool_type: { label: "Pool", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        try {
          // Use backend's login endpoint which handles Cognito authentication
          // This avoids needing client secret in Next.js and reuses existing backend logic
          const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
              pool_type: (credentials as any).pool_type || 'auto',
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || errorData.message || "Authentication failed";
            throw new Error(errorMessage);
          }

          const data = await response.json();

          if (data?.requiresPasswordChange && data?.session) {
            const payload = {
              code: 'NEW_PASSWORD_REQUIRED',
              session: data.session,
              poolType: data.poolType || data.pool_type || 'users',
              email: credentials.email,
              userRole: data.userRole,
            };
            const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
            throw new Error(`NEW_PASSWORD_REQUIRED:${encoded}`);
          }

          // Backend returns Cognito tokens via loginWithCognito
          // Extract tokens from response
          const idToken = data.id_token || data.idToken;
          const accessToken = data.access_token || data.accessToken;
          const refreshToken = data.refresh_token || data.refreshToken;
          const nameFromResponse = (data.name as string | undefined) || (data.fullName as string | undefined);
          const givenNameFromResponse = (data.first_name as string | undefined) || (data.given_name as string | undefined);
          const familyNameFromResponse = (data.last_name as string | undefined) || (data.family_name as string | undefined);
          const poolTypeFromResponse =
            (data.poolType as string | undefined) ||
            (data.pool_type as string | undefined) ||
            (data.isAdmin ? 'admin' : undefined);
          const isAdminUser =
            poolTypeFromResponse === 'admin' ||
            data.isAdmin === true ||
            (data.userRole as UserRole | undefined) === UserRole.ADMIN;
          const resolvedUserRole =
            (data.userRole as UserRole | undefined) ||
            (isAdminUser ? UserRole.ADMIN : UserRole.OWNER);
          const poolType =
            poolTypeFromResponse === 'admin' || resolvedUserRole === UserRole.ADMIN
              ? 'admin'
              : poolTypeFromResponse === 'customer'
              ? 'customer'
              : 'users';
          const decoded = idToken ? decodeJWT(idToken) : null;
          const resolvedName =
            nameFromResponse ||
            decoded?.name ||
            [givenNameFromResponse || decoded?.given_name, familyNameFromResponse || decoded?.family_name]
              .filter(Boolean)
              .join(' ') ||
            undefined;
          const resolvedGivenName = givenNameFromResponse || (decoded?.given_name as string | undefined);
          const resolvedFamilyName = familyNameFromResponse || (decoded?.family_name as string | undefined);

          if (!idToken || !accessToken) {
            throw new Error("Invalid response from authentication server");
          }

          // Return user info and tokens for NextAuth to store
          return {
            id: credentials.email,
            email: credentials.email,
            accessToken: accessToken,
            idToken: idToken,
            refreshToken: refreshToken,
            userRole: resolvedUserRole,
            poolType: poolType,
            name: resolvedName,
            given_name: resolvedGivenName,
            family_name: resolvedFamilyName,
          };
        } catch (error: any) {
          // Return user-friendly error messages
          if (error.message) {
            throw error;
          }
          throw new Error("Authentication failed. Please check your credentials.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account && account.provider !== "credentials") {
        const idToken = (account as any).id_token as string | undefined;
        const accessToken = (account as any).access_token as string | undefined;
        const refreshToken = (account as any).refresh_token as string | undefined;

        if (accessToken) token.accessToken = accessToken;
        if (idToken) token.idToken = idToken;
        if (refreshToken) token.refreshToken = refreshToken;

        const decoded = idToken ? decodeJWT(idToken) : null;
        const derivedRole = idToken ? extractUserRole(idToken) : null;

        token.sub = token.sub || (decoded?.sub as string | undefined);
        token.email =
          token.email ||
          (decoded?.email as string | undefined) ||
          ((profile as any)?.email as string | undefined);
        token.userRole = token.userRole || derivedRole || UserRole.OWNER;
        token.poolType = token.poolType || "users";
        token.name = token.name || (decoded?.name as string | undefined) || ((profile as any)?.name as string | undefined);
        token.given_name =
          token.given_name ||
          (decoded?.given_name as string | undefined) ||
          ((profile as any)?.given_name as string | undefined);
        token.family_name =
          token.family_name ||
          (decoded?.family_name as string | undefined) ||
          ((profile as any)?.family_name as string | undefined);
      }

      // Persist tokens from credentials provider without clobbering OAuth tokens
      if (user) {
        if ((user as any).accessToken || (user as any).idToken) {
          token.accessToken = (user as any).accessToken ?? token.accessToken;
          token.idToken = (user as any).idToken ?? token.idToken;
          token.refreshToken = (user as any).refreshToken ?? token.refreshToken;
        }
        token.sub = token.sub || user.id;
        token.email = token.email || user.email;
        token.userRole = token.userRole || (user as any).userRole;
        token.poolType = token.poolType || (user as any).poolType;
        token.name = token.name || (user as any).name;
        token.given_name = token.given_name || (user as any).given_name;
        token.family_name = token.family_name || (user as any).family_name;
      }

      if (!token.userRole && token.poolType === 'admin') {
        token.userRole = UserRole.ADMIN;
      } else if (!token.userRole) {
        token.userRole = UserRole.OWNER;
      }

      if (!token.poolType) {
        token.poolType = token.userRole === UserRole.ADMIN ? 'admin' : 'users';
      }

      const expiryMs =
        getTokenExpiryMs(token.idToken as string | undefined) ??
        getTokenExpiryMs(token.accessToken as string | undefined);
      if (expiryMs && Date.now() > expiryMs - TOKEN_REFRESH_BUFFER_MS) {
        token = await refreshCognitoTokens(token);
      }

      return token;
    },
    async session({ session, token }) {
      // Store tokens and role in session for server-side proxy to use
      if (token) {
        (session as any).accessToken = token.accessToken as string;
        (session as any).idToken = token.idToken as string;
        (session as any).refreshToken = token.refreshToken as string;
        const email = (token.email as string | undefined) || session.user?.email;
        const derivedRole =
          (token.userRole as UserRole | undefined) ||
          (token.poolType === 'admin' ? UserRole.ADMIN : UserRole.OWNER);
        const poolType =
          (token.poolType as string | undefined) ||
          (derivedRole === UserRole.ADMIN ? 'admin' : 'users');
        const name =
          (token.name as string | undefined) ||
          [token.given_name, token.family_name].filter(Boolean).join(' ') ||
          session.user?.name ||
          undefined;

        session.user = {
          ...(session.user || {}),
          id: (token.sub as string | undefined) || (session.user as any)?.id,
          email,
          name: name || email || undefined,
        };

        (session.user as any).role = derivedRole;
        (session.user as any).given_name = token.given_name;
        (session.user as any).family_name = token.family_name;
        (session as any).userRole = derivedRole;
        (session as any).poolType = poolType;
        (session as any).error = token.error;
      }
      return session;
    },
  },
  session: {
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 10,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  // Set the base URL for NextAuth callbacks
  useSecureCookies: process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development' || process.env.NEXTAUTH_DEBUG === 'true',
  logger: {
    error(code, metadata) {
      console.error('[NextAuth Error]', code, metadata);
    },
    warn(code) {
      console.warn('[NextAuth Warning]', code);
    },
  },
};
