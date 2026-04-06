/**
 * Unit tests — Network Handler
 *
 * Tests NETWORK_STATUS message handling and session storage.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getMockSessionSnapshot,
} from "../mocks/chrome-storage";

installChromeMock();

const { handleNetworkStatus } = await import(
    "../../src/background/network-handler"
);

describe("Network Handler", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("stores online status in session storage", async () => {
        const result = await handleNetworkStatus({
            type: "NETWORK_STATUS",
            isOnline: true,
        } as any);

        expect(result.isOk).toBe(true);

        const session = getMockSessionSnapshot();

        expect(session["marco_network_online"]).toBe(true);
    });

    it("stores offline status in session storage", async () => {
        const result = await handleNetworkStatus({
            type: "NETWORK_STATUS",
            isOnline: false,
        } as any);

        expect(result.isOk).toBe(true);

        const session = getMockSessionSnapshot();

        expect(session["marco_network_online"]).toBe(false);
    });
});
