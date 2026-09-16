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
            showPastJourneys: false,
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
            showPastJourneys: false,
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
            showPastJourneys: false,
            fresh: false,
        });

        expect(journeys.map((journey) => journey.legs.map((leg) => leg.id))).toEqual([["direct"]]);
    });

    it("顯示已過組合時保留今日已發車的行程", () => {
        const common = {
            tab: "tra" as const,
            data,
            now: "2026-07-29T10:00:00+08:00",
            reservedOnly: true,
            directToHsinchuOnly: false,
            toHsinchu: false,
            fresh: true,
        };

        expect(buildRouteJourneys({ ...common, showPastJourneys: false })).toHaveLength(0);
        expect(buildRouteJourneys({ ...common, showPastJourneys: true })).toHaveLength(2);
    });

    it("準備時間不足但尚未發車的行程仍會保留", () => {
        const journeys = buildRouteJourneys({
            tab: "tra",
            data,
            now: "2026-07-29T07:40:00+08:00",
            reservedOnly: true,
            directToHsinchuOnly: false,
            toHsinchu: false,
            showPastJourneys: false,
            fresh: true,
        });

        expect(journeys.map((journey) => journey.legs[0]?.id)).toEqual(["direct", "to-zhuzhong"]);
    });
});

// 以下時間僅供轉乘規則測試，並非營運班表。
describe("台北往竹東", () => {
    const leg = (id: string, origin: string, destination: string, departure: string, arrival: string, route: "tra" | "thsr" | "bus" | "walk" = "tra", reserved = false) => ({
        id, origin, destination, departure: `2026-07-29T${departure}:00+08:00`,
        arrival: `2026-07-29T${arrival}:00+08:00`, route, reserved, service: id,
    });
    const returnData: DailyData = { ...data, legs: [
        ...data.legs,
        leg("south", "台北", "新竹", "08:00", "09:00", "tra", true),
        leg("local", "台北", "新竹", "08:05", "09:00"),
        leg("home", "新竹", "榮華", "09:05", "09:30"),
        leg("branch", "新竹", "竹中", "09:05", "09:20"),
        leg("ronghua", "竹中", "榮華", "09:25", "09:35"),
        leg("bus-home", "台北", "朝陽路口", "08:00", "09:30", "bus"),
        leg("hsr-south", "台北", "高鐵新竹", "08:00", "08:35", "thsr"),
        leg("walk-hsr-south", "高鐵新竹", "六家", "08:35", "08:45", "walk"),
        leg("liujia-early", "六家", "竹中", "08:44", "09:15"),
        leg("liujia", "六家", "竹中", "08:45", "09:15"),
        leg("liujia-late", "六家", "竹中", "09:15", "09:20"),
    ] };
    const common = {
        direction: "return" as const, data: returnData, now: "2026-07-29T00:00:00+08:00",
        reservedOnly: true, directToHsinchuOnly: false, toHsinchu: false,
        showPastJourneys: false, fresh: true,
    };

    it("台鐵套用南下對號列車，銜接直達或竹中轉乘回榮華", () => {
        const journeys = buildRouteJourneys({ ...common, tab: "tra" });
        expect(journeys.map((journey) => journey.legs.map((item) => item.id))).toEqual([
            ["south", "home"], ["south", "branch", "ronghua"],
        ]);
        expect(buildRouteJourneys({ ...common, tab: "tra", directToHsinchuOnly: true })).toHaveLength(1);
        expect(buildRouteJourneys({ ...common, tab: "tra", reservedOnly: false })).toHaveLength(4);
    });

    it("僅從新竹出發不套用幹線對號條件", () => {
        const journeys = buildRouteJourneys({ ...common, tab: "tra", toHsinchu: true });
        expect(journeys).toHaveLength(2);
        expect(journeys.every((journey) => journey.legs[0]?.origin === "新竹")).toBe(true);
    });

    it("高鐵反向步行含在至少 10 分鐘、未滿 40 分鐘的轉乘間隔", () => {
        expect(buildRouteJourneys({ ...common, tab: "thsr" }).map((journey) => journey.legs.map((item) => item.id))).toEqual([
            ["hsr-south", "walk-hsr-south", "liujia", "ronghua"],
        ]);
    });

    it("客運回朝陽路口，保留已過行程切換", () => {
        expect(buildRouteJourneys({ ...common, tab: "bus" })[0]?.legs[0]?.id).toBe("bus-home");
        expect(buildRouteJourneys({ ...common, tab: "bus", now: "2026-07-29T10:00:00+08:00" })).toHaveLength(0);
        expect(buildRouteJourneys({ ...common, tab: "bus", now: "2026-07-29T10:00:00+08:00", showPastJourneys: true })).toHaveLength(1);
    });
});
