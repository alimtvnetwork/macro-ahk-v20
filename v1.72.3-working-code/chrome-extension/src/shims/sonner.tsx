import { Toaster as AppToaster } from "@/components/ui/toaster";
import { toast as appToast } from "@/hooks/use-toast";
import type { ReactNode } from "react";

type ToastInput = string | { title?: ReactNode; description?: ReactNode };

type SonnerToast = {
  (input: ToastInput): string;
  success: (input: ToastInput) => string;
  error: (input: ToastInput) => string;
  info: (input: ToastInput) => string;
  remove: (id?: string) => void;
};

const activeToasts = new Map<string, () => void>();

function normalizeInput(input: ToastInput): { title?: ReactNode; description?: ReactNode } {
  if (typeof input === "string") {
    return { title: input };
  }
  return input;
}

function pushToast(input: ToastInput): string {
  const payload = normalizeInput(input);
  const created = appToast({ title: payload.title, description: payload.description });
  activeToasts.set(created.id, created.dismiss);
  return created.id;
}

export const toast = Object.assign(
  (input: ToastInput) => pushToast(input),
  {
    success: (input: ToastInput) => pushToast(input),
    error: (input: ToastInput) => pushToast(input),
    info: (input: ToastInput) => pushToast(input),
    remove: (id?: string) => {
      if (id) {
        const dismiss = activeToasts.get(id);
        dismiss?.();
        activeToasts.delete(id);
        return;
      }

      activeToasts.forEach((dismiss) => dismiss());
      activeToasts.clear();
    },
  },
) as SonnerToast;

export const Toaster = () => <AppToaster />;
