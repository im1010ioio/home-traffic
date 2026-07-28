import { describe, expect, it } from "vitest";
import { buildJourneys, type TimetableLeg } from "../src/domain/journey-planner.ts";

const legs: TimetableLeg[] = [
    {
        id: "ronghua-zhuzhong-0810",
        route: "tra",
        service: "區間車 1802",
        origin: "榮華",
        destination: "竹中",
        departure: "2026-07-28T08:10:00+08:00",
        arrival: "2026-07-28T08:22:00+08:00",
        reserved: false,
    },
    {
        id: "zhuzhong-hsinchu-0830",
        route: "tra",
        service: "區間車 1721",
        origin: "竹中",
        destination: "新竹",
        departure: "2026-07-28T08:30:00+08:00",
        arrival: "2026-07-28T08:47:00+08:00",
        reserved: false,
    },
    {
        id: "hsinchu-taipei-0900",
        route: "tra",
        service: "自強號 112",
        origin: "新竹",
        destination: "台北",
        departure: "2026-07-28T09:00:00+08:00",
        arrival: "2026-07-28T10:05:00+08:00",
        reserved: true,
    },
];

describe("行程組合器", () => {
    it("只產生符合出發準備與各站最短轉乘時間的榮華至台北組合", () => {
        const journeys = buildJourneys({
            now: "2026-07-28T07:40:00+08:00",
            origin: "榮華",
            destination: "台北",
            departureLeadMinutes: 25,
            transferMinutes: {
                竹中: 8,
                新竹: 10,
            },
            legs,
        });

        expect(journeys).toHaveLength(1);
        expect(journeys[0]).toMatchObject({
            departure: "2026-07-28T08:10:00+08:00",
            arrival: "2026-07-28T10:05:00+08:00",
            durationMinutes: 115,
            transferStops: ["竹中", "新竹"],
        });
    });

    it("六家抵達班次只銜接由該班次建立的步行轉乘", () => {
        const highSpeedLegs: TimetableLeg[] = [
            {
                id: "tra-a",
                route: "tra",
                service: "區間車 A",
                origin: "榮華",
                destination: "六家",
                departure: "2026-07-28T08:00:00+08:00",
                arrival: "2026-07-28T08:30:00+08:00",
            },
            {
                id: "tra-b",
                route: "tra",
                service: "區間車 B",
                origin: "榮華",
                destination: "六家",
                departure: "2026-07-28T08:20:00+08:00",
                arrival: "2026-07-28T08:50:00+08:00",
            },
            {
                id: "walk-tra-a",
                route: "walk",
                service: "步行轉乘",
                origin: "六家",
                destination: "高鐵新竹",
                departure: "2026-07-28T08:30:00+08:00",
                arrival: "2026-07-28T08:40:00+08:00",
            },
            {
                id: "walk-tra-b",
                route: "walk",
                service: "步行轉乘",
                origin: "六家",
                destination: "高鐵新竹",
                departure: "2026-07-28T08:50:00+08:00",
                arrival: "2026-07-28T09:00:00+08:00",
            },
            {
                id: "thsr-0908",
                route: "thsr",
                service: "高鐵 608",
                origin: "高鐵新竹",
                destination: "台北",
                departure: "2026-07-28T09:08:00+08:00",
                arrival: "2026-07-28T09:42:00+08:00",
            },
        ];

        const journeys = buildJourneys({
            now: "2026-07-28T07:00:00+08:00",
            origin: "榮華",
            destination: "台北",
            departureLeadMinutes: 25,
            transferMinutes: { 六家: 0, 高鐵新竹: 0 },
            legs: highSpeedLegs,
        });

        expect(journeys).toHaveLength(2);
    });
});
