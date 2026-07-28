import { describe, expect, it } from "vitest";
import { buildRouteJourneys } from "../src/domain/route-journeys.ts";
import type { DailyData } from "../src/domain/daily-data.ts";

const data: DailyData = {
    schemaVersion: 1,
    serviceDate: "2026-07-29",
    generatedAt: "2026-07-29T04:30:00+08:00",
    status: "ready",
    sources: ["TDX"],
    legs: [
        { id: "direct", route: "tra", service: "區間 1802", origin: "榮華", destination: "新竹", departure: "2026-07-29T08:00:00+08:00", arrival: "2026-07-29T08:25:00+08:00" },
        { id: "to-zhuzhong", route: "tra", service: "區間 1804", origin: "榮華", destination: "竹中", departure: "2026-07-29T08:05:00+08:00", arrival: "2026-07-29T08:16:00+08:00" },
        { id: "to-hsinchu", route: "tra", service: "區間 1743", origin: "竹中", destination: "新竹", departure: "2026-07-29T08:21:00+08:00", arrival: "2026-07-29T08:35:00+08:00" },
        { id: "to-taipei", route: "tra", service: "自強 112", origin: "新竹", destination: "台北", departure: "2026-07-29T08:40:00+08:00", arrival: "2026-07-29T09:45:00+08:00", reserved: true },
    ],
};

describe("台鐵直達新竹組合", () => {
    it("預設與竹中轉乘組合一起排序，開啟篩選後只保留直達組合", () => {
        const common = {
            tab: "tra" as const,
            data,
            now: "2026-07-29T00:00:00+08:00",
            reservedOnly: true,
            toHsinchu: false,
            fresh: false,
        };
        const all = buildRouteJourneys({ ...common, directToHsinchuOnly: false });
        const direct = buildRouteJourneys({ ...common, directToHsinchuOnly: true });

        expect(all.map((journey) => journey.legs[0]?.id)).toEqual(["direct", "to-zhuzhong"]);
        expect(direct).toHaveLength(1);
        expect(direct[0]?.legs[0]?.id).toBe("direct");
    });

    it("僅前往新竹時列出直達與竹中轉乘組合，不接續台北車班", () => {
        const journeys = buildRouteJourneys({
            tab: "tra",
            data,
            now: "2026-07-29T00:00:00+08:00",
            reservedOnly: true,
            directToHsinchuOnly: false,
            toHsinchu: true,
            fresh: false,
        });

        expect(journeys.map((journey) => journey.legs.map((leg) => leg.id))).toEqual([
            ["direct"],
            ["to-zhuzhong", "to-hsinchu"],
        ]);
        expect(journeys.every((journey) => journey.legs.at(-1)?.destination === "新竹")).toBe(true);
    });

    it("僅前往新竹與直達新竹同時開啟時只保留直達組合", () => {
        const journeys = buildRouteJourneys({
            tab: "tra",
            data,
            now: "2026-07-29T00:00:00+08:00",
            reservedOnly: true,
            directToHsinchuOnly: true,
            toHsinchu: true,
            fresh: false,
        });

        expect(journeys.map((journey) => journey.legs.map((leg) => leg.id))).toEqual([["direct"]]);
    });
});
