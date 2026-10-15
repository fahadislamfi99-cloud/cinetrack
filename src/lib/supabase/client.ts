"use client";

import { authClient } from "@/lib/auth/auth-client";

const authListeners = new Set<(event: string, session: any) => void>();

export function notifyAuthChange(event: string, session: any) {
  authListeners.forEach((fn) => {
    try {
      fn(event, session);
    } catch (e) {
      console.error("Auth listener error:", e);
    }
  });
}

function mapUser(authUser: any) {
  if (!authUser) return null;
  return {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name,
    image: authUser.image,
    user_metadata: {
      user_name: authUser.name || undefined,
      name: authUser.name || undefined,
      full_name: authUser.name || undefined,
      avatar_url: authUser.image || undefined,
    },
    app_metadata: {
      provider: "email",
      providers: ["email"],
    },
  };
}

export function createClient() {
  return {
    auth: {
      getUser: async (): Promise<{ data: { user: any }; error: Error | null }> => {
        try {
          const res = await authClient.getSession();
          const user = mapUser(res?.data?.user);
          return {
            data: { user },
            error: user ? null : new Error("Not authenticated"),
          };
        } catch {
          return { data: { user: null }, error: new Error("Network error") };
        }
      },
      getSession: async (): Promise<{ data: { session: any }; error: Error | null }> => {
        try {
          const res = await authClient.getSession();
          const user = mapUser(res?.data?.user);
          return {
            data: {
              session: res?.data?.session
                ? {
                    ...res.data.session,
                    user,
                  }
                : null,
            },
            error: res?.data?.session ? null : new Error("No session"),
          };
        } catch {
          return { data: { session: null }, error: new Error("Network error") };
        }
      },
      signOut: async (): Promise<{ error: Error | null }> => {
        try {
          await authClient.signOut();
          if (typeof document !== "undefined") {
            document.cookie = "cinetrack_username=; path=/; max-age=0";
          }
          notifyAuthChange("SIGNED_OUT", null);
          return { error: null };
        } catch (err: any) {
          return { error: err instanceof Error ? err : new Error(String(err)) };
        }
      },
      onAuthStateChange: (callback: (event: string, session: any) => void) => {
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authListeners.delete(callback);
              },
            },
          },
        };
      },
      signInWithPassword: async ({
        email,
        password,
      }: {
        email: string;
        password: string;
      }): Promise<{ data: any; error: Error | null }> => {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) {
          return {
            data: { user: null, session: null },
            error: new Error(res.error.message || "Invalid email or password."),
          };
        }
        const user = mapUser((res.data as any)?.user);
        const session = (res.data as any)?.session
          ? { ...(res.data as any).session, user }
          : null;
        notifyAuthChange("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      },
      signUp: async ({
        email,
        password,
      }: {
        email: string;
        password: string;
      }): Promise<{ data: any; error: Error | null }> => {
        const res = await authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0],
        });
        if (res.error) {
          return {
            data: { user: null, session: null },
            error: new Error(res.error.message || "Sign up failed."),
          };
        }
        const user = mapUser((res.data as any)?.user);
        const session = (res.data as any)?.session
          ? { ...(res.data as any).session, user }
          : null;
        notifyAuthChange("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      },
      signInWithOAuth: async ({
        provider,
        options,
      }: {
        provider: string;
        options?: any;
      }): Promise<{ data: { url?: string } | null; error: Error | null }> => {
        if (provider === "google") {
          const res = await authClient.signIn.social({
            provider: "google",
            callbackURL: options?.redirectTo || (typeof window !== "undefined" ? window.location.origin : "/"),
          });
          if (res?.error) {
            return {
              data: null,
              error: new Error(res.error.message || "Google sign in failed"),
            };
          }
          const redirectUrl = (res as any)?.url || (res as any)?.data?.url;
          return { data: { url: redirectUrl }, error: null };
        }
        return { data: null, error: new Error("Provider not supported") };
      },
      resetPasswordForEmail: async (
        _email: string,
        _options?: any
      ): Promise<{ data: any; error: Error | null }> => {
        return { data: null, error: null };
      },
      updateUser: async (_updates: any): Promise<{ data: any; error: Error | null }> => {
        return { data: null, error: null };
      },
    },
  };
}
