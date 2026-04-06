import { useCallback, useEffect, useState } from "react";
import { sendMessage } from "@/lib/message-client";

const ONBOARDING_KEY = "marco_onboarding_complete";

/* ------------------------------------------------------------------ */
/*  Chrome API accessor (typed, no `as any`)                           */
/* ------------------------------------------------------------------ */

interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

interface ChromePermissionsApi {
  getAll(): Promise<{ origins?: string[] }>;
  request(permissions: { origins: string[] }): Promise<boolean>;
}

interface ChromeWindow {
  chrome?: {
    storage?: { local?: ChromeStorageArea };
    permissions?: ChromePermissionsApi;
  };
}

function getChromeStorage(): ChromeStorageArea | undefined {
  return (globalThis as ChromeWindow).chrome?.storage?.local;
}

function getChromePermissions(): ChromePermissionsApi | undefined {
  return (globalThis as ChromeWindow).chrome?.permissions;
}

/* ------------------------------------------------------------------ */
/*  Onboarding hook                                                    */
/* ------------------------------------------------------------------ */

/** Hook to check and manage onboarding state. */
export function useOnboarding() {
  const [isComplete, setIsComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkOnboardingState();
  }, []);

  const checkOnboardingState = async () => {
    const storage = getChromeStorage();

    if (storage) {
      const result = await storage.get(ONBOARDING_KEY);
      const isDone = result[ONBOARDING_KEY] === true;
      setIsComplete(isDone);
    } else {
      // Dev fallback — skip onboarding by default for browser preview
      const isDone = localStorage.getItem(ONBOARDING_KEY) !== "false";
      setIsComplete(isDone);
    }
    setLoading(false);
  };

  const completeOnboarding = useCallback(async () => {
    const storage = getChromeStorage();

    if (storage) {
      await storage.set({ [ONBOARDING_KEY]: true });
    } else {
      localStorage.setItem(ONBOARDING_KEY, "true");
    }
    setIsComplete(true);
  }, []);

  const resetOnboarding = useCallback(async () => {
    const storage = getChromeStorage();

    if (storage) {
      await storage.remove(ONBOARDING_KEY);
    } else {
      localStorage.removeItem(ONBOARDING_KEY);
    }
    setIsComplete(false);
  }, []);

  return { isComplete, loading, completeOnboarding, resetOnboarding };
}

/* ------------------------------------------------------------------ */
/*  Permissions hook                                                   */
/* ------------------------------------------------------------------ */

/** Hook to manage optional host permissions. */
export function usePermissions() {
  const [granted, setGranted] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const checkPermissions = useCallback(async () => {
    const permissions = getChromePermissions();

    if (permissions) {
      const perms = await permissions.getAll();
      setGranted(perms.origins ?? []);
    }
  }, []);

  useEffect(() => {
    void checkPermissions();
  }, [checkPermissions]);

  const requestPermission = useCallback(async (origin: string): Promise<boolean> => {
    const permissions = getChromePermissions();

    if (permissions) {
      setLoading(true);
      try {
        const isGranted = await permissions.request({ origins: [origin] });

        if (isGranted) {
          setGranted((prev) => [...prev, origin]);
        }
        setLoading(false);
        return isGranted;
      } catch {
        setLoading(false);
        return false;
      }
    }

    // Dev fallback
    setGranted((prev) => [...prev, origin]);
    return true;
  }, []);

  return { granted, loading, requestPermission, checkPermissions };
}
