"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  AtSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { LogoIcon } from "@/components/ui/logo-icon";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  checkUsernameAvailability,
  generateUsernameSuggestions,
  completeProfileSetup,
} from "@/actions/profile";

interface ProfileSetupModalProps {
  isOpen: boolean;
  initialDisplayName?: string;
  userEmail?: string;
  onCompleted?: () => void;
}

type AvailabilityStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "reserved"
  | "error";

export function ProfileSetupModal({
  isOpen,
  initialDisplayName = "",
  userEmail = "",
  onCompleted,
}: ProfileSetupModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<AvailabilityStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Lock background scrolling while modal is open
  useScrollLock(isOpen);

  // Update initial display name if prop arrives late (e.g. from async auth check)
  useEffect(() => {
    if (initialDisplayName && !displayName) {
      setDisplayName(initialDisplayName);
    }
  }, [initialDisplayName, displayName]);

  // Generate suggestions whenever display name changes
  useEffect(() => {
    if (!isOpen) return;

    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
    }

    const baseName = displayName.trim() || initialDisplayName || userEmail.split("@")[0] || "";
    if (baseName.length < 2) {
      setSuggestions([]);
      return;
    }

    suggestionTimerRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const results = await generateUsernameSuggestions(baseName, username);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 350);

    return () => {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, [displayName, initialDisplayName, userEmail, isOpen]);

  // Debounced real-time username validation and availability checking
  const handleUsernameChange = (val: string) => {
    const raw = val.trim().toLowerCase().replace(/^@/, "");
    setUsername(raw);
    setSubmitError(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!raw) {
      setStatus("idle");
      setStatusMessage("");
      return;
    }

    // Instant client-side format feedback before network hit
    if (raw.length < 3) {
      setStatus("invalid");
      setStatusMessage("Must be at least 3 characters");
      return;
    }

    if (raw.length > 25) {
      setStatus("invalid");
      setStatusMessage("Must be 25 characters or fewer");
      return;
    }

    if (!/^[a-z0-9._]+$/.test(raw)) {
      setStatus("invalid");
      setStatusMessage("Only lowercase letters, numbers, underscores, and dots");
      return;
    }

    if (/^[._]/.test(raw) || /[._]$/.test(raw)) {
      setStatus("invalid");
      setStatusMessage("Cannot start or end with a dot or underscore");
      return;
    }

    if (/\.\./.test(raw) || /__/.test(raw) || /\._|\_\./.test(raw)) {
      setStatus("invalid");
      setStatusMessage("Cannot contain consecutive punctuation");
      return;
    }

    // Indicate check in progress
    setStatus("checking");
    setStatusMessage("Checking availability...");

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(raw);
        if (result.available) {
          setStatus("available");
          setStatusMessage(`@${raw} is available`);
        } else {
          if (result.error?.includes("taken")) {
            setStatus("taken");
            setStatusMessage("Username already taken");
          } else if (result.error?.includes("reserved")) {
            setStatus("reserved");
            setStatusMessage(result.error);
          } else {
            setStatus("invalid");
            setStatusMessage(result.error || "Invalid username");
          }
        }
      } catch {
        setStatus("error");
        setStatusMessage("Unable to verify username right now");
      }
    }, 300);
  };

  const handleSelectSuggestion = (suggested: string) => {
    setUsername(suggested);
    setStatus("available");
    setStatusMessage(`@${suggested} is available`);
    setSubmitError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || status !== "available" || !username) {
      return;
    }

    setSubmitError(null);

    startTransition(async () => {
      try {
        const result = await completeProfileSetup({
          displayName: displayName.trim(),
          username: username.trim().toLowerCase(),
        });

        if (result.error) {
          setSubmitError(result.error);
          return;
        }

        if (result.success) {
          if (onCompleted) {
            onCompleted();
          }
          if (
            result.username &&
            typeof window !== "undefined" &&
            window.location.pathname === "/library"
          ) {
            router.replace(`/${result.username}`);
          } else {
            router.refresh();
          }
        }
      } catch (err: any) {
        setSubmitError(err?.message || "Failed to save profile. Please try again.");
      }
    });
  };

  if (!isOpen) return null;

  const isFormValid =
    displayName.trim().length >= 2 &&
    status === "available" &&
    username.trim().length >= 3 &&
    !isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-lenis-prevent="true"
      aria-labelledby="profile-setup-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overscroll-contain"
    >
      <div
        className="w-full max-w-[460px] bg-[#151C27] border border-white/[0.1] rounded-3xl p-6 sm:p-8 shadow-2xl relative flex flex-col max-h-[90dvh] overflow-y-auto overscroll-contain modal-scrollbar"
        data-modal-scroll="true"
        data-lenis-prevent="true"
      >
        {/* Subtle Ambient Radial Glow */}
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-40 rounded-3xl overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 15%, rgba(59, 158, 255, 0.12), transparent 75%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#3B9EFF]/10 border border-[#3B9EFF]/20 flex items-center justify-center text-[#3B9EFF] mb-3.5 shadow-sm">
              <LogoIcon className="w-7 h-7" size={28} />
            </div>

            <h2
              id="profile-setup-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7FA]"
            >
              Complete your profile
            </h2>
            <p className="text-xs sm:text-sm text-[#A8B0BD] mt-1.5 leading-relaxed">
              Choose how you will appear on CineTrack.
            </p>
          </div>

          {/* Submission Error Banner */}
          {submitError && (
            <div className="mb-4 p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-xs text-[#EF4444] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Display Name Field */}
            <div className="space-y-1.5 text-left">
              <label
                htmlFor="setup-display-name"
                className="block text-xs font-semibold text-[#CBD5E1]"
              >
                Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#6F7886] absolute left-3.5 top-3.5 pointer-events-none" />
                <input
                  id="setup-display-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Fahad Islam"
                  maxLength={50}
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#0F141D] text-xs sm:text-sm text-[#F5F7FA] placeholder-[#4B5563] border border-white/[0.08] focus:outline-none focus:border-[#3B9EFF] focus:ring-1 focus:ring-[#3B9EFF] transition-all font-sans"
                />
              </div>
            </div>

            {/* Username Field */}
            <div className="space-y-1.5 text-left">
              <label
                htmlFor="setup-username"
                className="block text-xs font-semibold text-[#CBD5E1]"
              >
                Username
              </label>
              <div className="relative">
                <span className="text-sm font-semibold text-[#6F7886] absolute left-3.5 top-3 pointer-events-none">
                  @
                </span>
                <input
                  id="setup-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="e.g. fahadislam"
                  maxLength={25}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full h-11 pl-8 pr-10 rounded-xl bg-[#0F141D] text-xs sm:text-sm text-[#F5F7FA] placeholder-[#4B5563] border border-white/[0.08] focus:outline-none focus:border-[#3B9EFF] focus:ring-1 focus:ring-[#3B9EFF] transition-all font-sans"
                />

                {/* Right Status Icon Indicator */}
                <div className="absolute right-3.5 top-3.5 flex items-center">
                  {status === "checking" && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#3B9EFF]" />
                  )}
                  {status === "available" && (
                    <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                  )}
                  {(status === "taken" || status === "invalid" || status === "reserved" || status === "error") && (
                    <AlertCircle className="w-4 h-4 text-[#EF4444]" />
                  )}
                </div>
              </div>

              {/* Status Message */}
              <div className="min-h-[18px] px-1">
                {status !== "idle" && (
                  <p
                    className={`text-[11px] font-medium tracking-tight flex items-center gap-1.5 ${
                      status === "available"
                        ? "text-[#22C55E]"
                        : status === "checking"
                        ? "text-[#6F7886]"
                        : "text-[#EF4444]"
                    }`}
                  >
                    <span>{statusMessage}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Clickable Username Suggestions */}
            {suggestions.length > 0 && (
              <div className="text-left space-y-1.5 -mt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6F7886] block">
                  Suggestions
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {suggestions.map((sug) => {
                    const isSelected = username === sug;
                    return (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleSelectSuggestion(sug)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#3B9EFF]/20 border-[#3B9EFF] text-[#3B9EFF]"
                            : "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.08] hover:border-white/[0.15] text-[#A8B0BD] hover:text-white"
                        }`}
                      >
                        @{sug}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Submit Primary Button */}
            <button
              type="submit"
              disabled={!isFormValid}
              className="w-full h-11 sm:h-12 mt-3 rounded-xl bg-[#3B9EFF] hover:bg-[#5AAFFF] disabled:opacity-40 disabled:hover:bg-[#3B9EFF] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#3B9EFF]/25 active:scale-98 transition-all cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <>
                  <span>Complete Profile</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
