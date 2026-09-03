import "server-only";

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  authNoStoreHeaders,
  parseAuthLinkForm,
  requestHasExpectedOrigin,
  type AuthLinkPurpose,
} from "@/features/auth/link-consumption";
import {
  issueRecoveryGrant,
  RECOVERY_GRANT_COOKIE_NAME,
  recoveryGrantCookieOptions,
} from "@/features/auth/recovery-grant";
import { parseWorkspaceCookie, workspaceRowsSchema } from "@/features/workspaces/schemas";
import {
  chooseWorkspace,
  serializeWorkspaceSelection,
  WORKSPACE_COOKIE_NAME,
  workspaceCookieOptions,
  workspaceLanding,
} from "@/features/workspaces/state";
import { getServerEnvironment } from "@/lib/env/server";
import type { Database } from "@/types/database.generated";

const MAX_AUTH_LINK_BODY_BYTES = 8 * 1024;
const verifiedClaimsSchema = z.object({
  sub: z.uuid(),
  session_id: z.uuid(),
});

type SupabaseCookieScope = Readonly<{
  domain?: string;
  path: string;
}>;

function applyNoStore(response: NextResponse) {
  Object.entries(authNoStoreHeaders).forEach(([name, value]) => response.headers.set(name, value));
}

function redirectResponse(appUrl: string, path: string) {
  const response = NextResponse.redirect(new URL(path, appUrl), 303);
  applyNoStore(response);
  return response;
}

function expiredPath(purpose: AuthLinkPurpose) {
  return purpose === "email"
    ? "/auth/verify?status=expired"
    : "/auth/forgot-password?status=expired";
}

function requestMayContainSession(request: NextRequest) {
  return request.cookies.getAll().some(({ name, value }) => name.startsWith("sb-") && value !== "");
}

function expireSupabaseCookies(
  response: NextResponse,
  cookieScopes: ReadonlyMap<string, SupabaseCookieScope>,
) {
  for (const [name, scope] of cookieScopes) {
    response.cookies.set(name, "", {
      ...scope,
      expires: new Date(0),
      maxAge: 0,
    });
  }
}

async function readBoundedUrlEncodedForm(request: NextRequest): Promise<FormData | null> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded" || request.body === null) return null;

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > MAX_AUTH_LINK_BODY_BYTES
    ) {
      return null;
    }
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAX_AUTH_LINK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }

  const formData = new FormData();
  for (const [key, value] of new URLSearchParams(decoded)) formData.append(key, value);
  return formData;
}

export async function consumeAuthLink(request: NextRequest, purpose: AuthLinkPurpose) {
  const environment = getServerEnvironment();
  const response = redirectResponse(environment.NEXT_PUBLIC_APP_URL, expiredPath(purpose));

  if (!requestHasExpectedOrigin(request.headers.get("origin"), environment.NEXT_PUBLIC_APP_URL)) {
    return response;
  }

  let credential: ReturnType<typeof parseAuthLinkForm>;
  try {
    const formData = await readBoundedUrlEncodedForm(request);
    if (formData === null) return response;
    credential = parseAuthLinkForm(formData, purpose);
  } catch {
    return response;
  }
  if (credential === null) return response;

  const supabaseCookieScopes = new Map<string, SupabaseCookieScope>();
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-")) supabaseCookieScopes.set(name, { path: "/" });
  }

  const supabase = createServerClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (name.startsWith("sb-")) {
              supabaseCookieScopes.set(name, {
                path: options?.path ?? "/",
                ...(options?.domain === undefined ? {} : { domain: options.domain }),
              });
            }
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    },
  );
  let linkSessionEstablished = false;
  let linkAccepted = false;

  try {
    if (requestMayContainSession(request)) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error !== null) {
        throw new Error("The ambient session could not be replaced.");
      }
    }

    let pkceRedirectType: string | null | undefined;
    const result =
      credential.kind === "token_hash"
        ? await supabase.auth.verifyOtp({
            token_hash: credential.tokenHash,
            type: credential.type,
          })
        : await supabase.auth.exchangeCodeForSession(credential.code).then((exchangeResult) => {
            pkceRedirectType =
              "redirectType" in exchangeResult.data &&
              (typeof exchangeResult.data.redirectType === "string" ||
                exchangeResult.data.redirectType === null)
                ? exchangeResult.data.redirectType
                : undefined;
            return exchangeResult;
          });

    if (result.error !== null || result.data.session === null || result.data.user === null) {
      throw new Error("The email credential could not establish a complete session.");
    }
    linkSessionEstablished = true;

    if (
      credential.kind === "code" &&
      (purpose === "recovery" ? pkceRedirectType !== "recovery" : pkceRedirectType !== null)
    ) {
      throw new Error("The PKCE code purpose did not match this confirmation boundary.");
    }

    if (purpose === "recovery") {
      const claimsResult = await supabase.auth.getClaims(result.data.session.access_token);
      const claims = verifiedClaimsSchema.safeParse(claimsResult.data?.claims);
      if (claimsResult.error !== null || !claims.success) {
        throw new Error("The recovery session claims could not be verified.");
      }

      response.cookies.set(
        RECOVERY_GRANT_COOKIE_NAME,
        issueRecoveryGrant(
          { userId: claims.data.sub, sessionId: claims.data.session_id },
          environment.AUTH_RECOVERY_TOKEN_SECRET,
        ),
        recoveryGrantCookieOptions(environment.HUDDLE_ENVIRONMENT),
      );
      response.cookies.set(WORKSPACE_COOKIE_NAME, "", {
        ...workspaceCookieOptions(),
        maxAge: 0,
      });
      response.headers.set(
        "location",
        new URL("/auth/reset-password", environment.NEXT_PUBLIC_APP_URL).toString(),
      );
      linkAccepted = true;
    } else {
      response.cookies.set(RECOVERY_GRANT_COOKIE_NAME, "", {
        ...recoveryGrantCookieOptions(environment.HUDDLE_ENVIRONMENT),
        maxAge: 0,
      });

      let destination = "/onboarding";
      try {
        const { data, error } = await supabase.rpc("list_my_workspaces");
        if (error === null) {
          const available = workspaceRowsSchema.parse(data).map((workspace) => ({
            kind: workspace.workspace_kind,
            id: workspace.workspace_id,
            slug: workspace.slug,
            label: workspace.name,
            role: workspace.role,
          }));
          const remembered = parseWorkspaceCookie(
            request.cookies.get(WORKSPACE_COOKIE_NAME)?.value,
          );
          const active = chooseWorkspace(available, remembered);
          if (active === null) {
            response.cookies.set(WORKSPACE_COOKIE_NAME, "", {
              ...workspaceCookieOptions(),
              maxAge: 0,
            });
          } else {
            destination = workspaceLanding(active);
            response.cookies.set(
              WORKSPACE_COOKIE_NAME,
              serializeWorkspaceSelection({ kind: active.kind, id: active.id }),
              workspaceCookieOptions(),
            );
          }
        }
      } catch {
        // Workspace projection failures fall back to safe onboarding.
      }
      response.headers.set(
        "location",
        new URL(destination, environment.NEXT_PUBLIC_APP_URL).toString(),
      );
      linkAccepted = true;
    }
  } catch {
    // Invalid, expired, used, and temporarily unavailable credentials share one response.
  }

  if (!linkAccepted && (linkSessionEstablished || supabaseCookieScopes.size > 0)) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // The response stays expired. Cookie expiry below does not depend on the provider.
    }
    expireSupabaseCookies(response, supabaseCookieScopes);
  }

  applyNoStore(response);
  return response;
}

export function passiveLegacyAuthRedirect(appUrl: string, purpose: AuthLinkPurpose) {
  return redirectResponse(appUrl, expiredPath(purpose));
}
