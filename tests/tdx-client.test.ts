import { describe, expect, it, vi } from "vitest";
import { createTdxClient } from "../scripts/tdx-client.ts";

describe("TDX 基礎會員請求節流", () => {
    it("即使同時排入多筆資料請求，也會保持指定間隔且共用權杖", async () => {
        let clock = 0;
        const requestTimes: number[] = [];
        const fetchImpl = vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.includes("openid-connect/token")) {
                return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), {
                    status: 200,
                });
            }
            requestTimes.push(clock);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as typeof fetch;
        const client = createTdxClient({
            clientId: "id",
            clientSecret: "secret",
            fetchImpl,
            requestIntervalMs: 13_000,
            now: () => clock,
            sleep: async (milliseconds) => {
                clock += milliseconds;
            },
        });

        await Promise.all([
            client.getJson("/first"),
            client.getJson("/second"),
            client.getJson("/third"),
        ]);

        expect(requestTimes).toEqual([0, 13_000, 26_000]);
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });
});
