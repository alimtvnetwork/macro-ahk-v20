/**
 * Marco — Message Client
 *
 * Thin wrapper around the platform adapter's sendMessage.
 * All mock data lives in the preview adapter (src/platform/preview-adapter.ts).
 *
 * Components can import { sendMessage } from "@/lib/message-client"
 * or call getPlatform().sendMessage() directly — both resolve identically.
 */

import { getPlatform } from "@/platform";
import type { MessagePayload } from "@/platform/platform-adapter";

/** Sends a typed message to the background service worker (or preview mock). */
export async function sendMessage<T = unknown>(
  message: MessagePayload,
): Promise<T> {
  const platform = getPlatform();
  return platform.sendMessage<T>(message);
}
