import { describe, expect, it } from "vitest";
import { transformBusStopTimetables, transformRailOd } from "../scripts/tdx-transform.ts";

describe("TDX 每日資料轉換", () => {
    it("把官方軌道 OD 回應轉成行程組合器可使用的班次", () => {
        const legs = transformRailOd({
            response: {
                TrainTimetables: [
                    {
                        TrainInfo: {
                            TrainNo: "112",
                            TrainTypeName: { Zh_tw: "自強號" },
                            TripLine: 1,
                        },
                        StopTimes: [
                            {
                                StationID: "1210",
                                StationName: { Zh_tw: "新竹" },
                                ArrivalTime: "09:00",
                                DepartureTime: "09:02",
                            },
                            {
                                StationID: "1000",
                                StationName: { Zh_tw: "臺北" },
                                ArrivalTime: "10:05",
                                DepartureTime: "10:07",
                            },
                        ],
                    },
                ],
            },
            date: "2026-07-28",
            originId: "1210",
            destinationId: "1000",
            route: "tra",
        });

        expect(legs).toEqual([
            {
                id: "tra-112-1210-1000-2026-07-28",
                route: "tra",
                service: "自強號 112",
                origin: "新竹",
                destination: "台北",
                departure: "2026-07-28T09:02:00+08:00",
                arrival: "2026-07-28T10:05:00+08:00",
                reserved: true,
            },
        ]);
    });
});

describe("公路客運今日營運班次", () => {
    it("合併指定路線在朝陽路發車且前往台北的站別時刻", () => {
        const legs = transformBusStopTimetables({
            response: {
                DailyStopTimeTables: [{
                    RouteName: { Zh_tw: "1820A" },
                    Stops: [
                        {
                            StopName: { Zh_tw: "朝陽路" },
                            TimeTables: [{
                                TripID: "trip-1",
                                ArrivalTime: "07:15",
                                DepartureTime: "07:15",
                            }],
                        },
                        {
                            StopName: { Zh_tw: "臺北轉運站" },
                            TimeTables: [{
                                TripID: "trip-1",
                                ArrivalTime: "08:40",
                                DepartureTime: "08:40",
                            }],
                        },
                    ],
                }],
            },
            date: "2026-07-28",
            routeName: "1820A",
            originName: "朝陽路",
            destinationNames: ["臺北轉運站"],
            canonicalDestination: "台北",
            operatorName: "國光客運",
        });

        expect(legs).toEqual([
            {
                id: "bus-1820A-朝陽路-台北-2026-07-28-07:15",
                route: "bus",
                service: "國光客運 1820A",
                origin: "朝陽路",
                destination: "台北",
                departure: "2026-07-28T07:15:00+08:00",
                arrival: "2026-07-28T08:40:00+08:00",
                reserved: false,
            },
        ]);
    });

    it("排除 TDX 標示為其他營運日期的公車班表", () => {
        const legs = transformBusStopTimetables({
            response: {
                DailyStopTimeTables: [{
                    BusDate: "2026-07-27",
                    Stops: [
                        {
                            StopName: { Zh_tw: "朝陽路" },
                            TimeTables: [{ TripID: "trip-1", DepartureTime: "07:15" }],
                        },
                        {
                            StopName: { Zh_tw: "臺北轉運站" },
                            TimeTables: [{ TripID: "trip-1", ArrivalTime: "08:40" }],
                        },
                    ],
                }],
            },
            date: "2026-07-28",
            routeName: "1820",
            originName: "朝陽路",
            destinationNames: ["臺北轉運站"],
            canonicalDestination: "台北",
        });

        expect(legs).toEqual([]);
    });
});
