"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfileSetupStatus } from "@/actions/profile";
import { ProfileSetupModal } from "./profile-setup-modal";
import { usePwaInstall } from "@/components/pwa/pwa-install-provider";

export function ProfileSetupProvider() {
  const pathname = usePathname();
  const { openInstallModal } = usePwaInstall();
  const [isOpen, setIsOpen] = useState(false);
  const [initialDisplayName, setInitialDisplayName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const checkStatus = useCallback(async () => {
    try {
      const status = await getProfileSetupStatus();
      if (status.authenticated && status.needsSetup) {
        setInitialDisplayName(status.initialDisplayName || "");
        setUserEmail(status.email || "");
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    } catch {
      // Ignore network errors during background check
    }
  }, []);

  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/auth/")) return;
    checkStatus();
  }, [pathname, checkStatus]);

  useEffect(() => {
    // Listen to Supabase auth events (e.g. immediate client signin/signup)
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (session?.user) {
          checkStatus();
        }
      } else if (event === "SIGNED_OUT") {
        setIsOpen(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkStatus]);

  const handleSetupCompleted = () => {
    setIsOpen(false);
    // User finished creating and configuring account -> Show PWA install popup!
    setTimeout(() => {
      openInstallModal(true);
    }, 700);
  };

  return (
    <ProfileSetupModal
      isOpen={isOpen}
      initialDisplayName={initialDisplayName}
      userEmail={userEmail}
      onCompleted={handleSetupCompleted}
    />
  );
}
