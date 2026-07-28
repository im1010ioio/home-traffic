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

    it("把午夜後抵達的台鐵班次標示為隔日，避免負數總時數", () => {
        const legs = transformRailOd({
            response: [{
                TrainInfo: {
                    TrainNo: "152",
                    TrainTypeName: { Zh_tw: "自強號" },
                },
                StopTimes: [
                    {
                        StationID: "1210",
                        StationName: { Zh_tw: "新竹" },
                        DepartureTime: "22:48",
                    },
                    {
                        StationID: "1000",
                        StationName: { Zh_tw: "臺北" },
                        ArrivalTime: "00:02",
                    },
                ],
            }],
            date: "2026-07-28",
            originId: "1210",
            destinationId: "1000",
            route: "tra",
        });

        expect(legs[0]?.departure).toBe("2026-07-28T22:48:00+08:00");
        expect(legs[0]?.arrival).toBe("2026-07-29T00:02:00+08:00");
    });
});

describe("公路客運今日營運班次", () => {
    it("合併指定路線在朝陽路口發車且前往台北的站別時刻", () => {
        const legs = transformBusStopTimetables({
            response: {
                DailyTimetables: [{
                    Date: "2026-07-28",
                    RouteName: { Zh_tw: "1820A" },
                    SubRouteName: { Zh_tw: "1820A" },
                    Timetables: [{
                        TripID: "trip-1",
                        StopTimes: [
                            {
                                StopName: { Zh_tw: "朝陽路口" },
                                ArrivalTime: "07:15",
                                DepartureTime: "07:15",
                            },
                            {
                                StopName: { Zh_tw: "臺北轉運站" },
                                ArrivalTime: "08:40",
                                DepartureTime: "08:40",
                            },
                        ],
                    }],
                }],
            },
            date: "2026-07-28",
            routeName: "1820A",
            subRouteNames: ["1820A"],
            originName: "朝陽路口",
            destinationNames: ["臺北轉運站"],
            canonicalDestination: "台北",
            operatorName: "國光客運",
            serviceNote: "繞駛關西市區",
        });

        expect(legs).toEqual([
            {
                id: "bus-1820A-朝陽路口-台北-2026-07-28-07:15",
                route: "bus",
                service: "國光客運 1820A（繞駛關西市區）",
                origin: "朝陽路口",
                destination: "台北",
                departure: "2026-07-28T07:15:00+08:00",
                arrival: "2026-07-28T08:40:00+08:00",
                reserved: false,
            },
        ]);
    });

    it("從 1820 主路線回應中只取指定的 1820A 附屬路線", () => {
        const timetable = (subRouteName: string, departureTime: string) => ({
            SubRouteName: { Zh_tw: subRouteName },
            Timetables: [{
                StopTimes: [
                    { StopName: { Zh_tw: "朝陽路口" }, DepartureTime: departureTime },
                    { StopName: { Zh_tw: "臺北轉運站" }, ArrivalTime: "09:00" },
                ],
            }],
        });
        const legs = transformBusStopTimetables({
            response: [timetable("1820", "07:00"), timetable("1820A", "07:30")],
            date: "2026-07-28",
            routeName: "1820A",
            subRouteNames: ["1820A"],
            originName: "朝陽路口",
            destinationNames: ["臺北轉運站"],
            canonicalDestination: "台北",
        });

        expect(legs).toHaveLength(1);
        expect(legs[0]?.service).toBe("公車 1820A");
        expect(legs[0]?.departure).toContain("07:30");

        const mainLine = transformBusStopTimetables({
            response: [timetable("18200", "07:00"), timetable("1820A", "07:30")],
            date: "2026-07-28",
            routeName: "1820",
            subRouteNames: ["1820", "18200"],
            originName: "朝陽路口",
            destinationNames: ["臺北轉運站"],
            canonicalDestination: "台北",
        });
        expect(mainLine).toHaveLength(1);
        expect(mainLine[0]?.service).toBe("公車 1820");
        expect(mainLine[0]?.departure).toContain("07:00");
    });

    it("使用官方站名並排除反向班次", () => {
        const response = {
            DailyTimetables: [
                {
                    Timetables: [{
                        TripID: "outbound",
                        StopTimes: [
                            { StopName: { Zh_tw: "朝陽路口" }, DepartureTime: "07:15" },
                            { StopName: { Zh_tw: "臺北轉運站" }, ArrivalTime: "08:40" },
                        ],
                    }],
                },
                {
                    Timetables: [{
                        TripID: "return",
                        StopTimes: [
                            { StopName: { Zh_tw: "臺北轉運站" }, DepartureTime: "10:00" },
                            { StopName: { Zh_tw: "朝陽路口" }, ArrivalTime: "11:25" },
                        ],
                    }],
                },
            ],
        };
        const legs = transformBusStopTimetables({
            response,
            date: "2026-07-28",
            routeName: "1820",
            originName: "朝陽路口",
            destinationNames: ["臺北轉運站"],
            canonicalDestination: "台北",
        });

        expect(legs).toHaveLength(1);
        expect(legs[0]?.origin).toBe("朝陽路口");
        expect(legs[0]?.departure).toContain("07:15");
    });

    it("排除 TDX 標示為其他營運日期的公車班表", () => {
        const legs = transformBusStopTimetables({
            response: {
                DailyTimetables: [{
                    BusDate: "2026-07-27T00:00:00+08:00",
                    Stops: [
                        {
                            StopName: { Zh_tw: "朝陽路口" },
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
            originName: "朝陽路口",
            destinationNames: ["臺北轉運站"],
            canonicalDestination: "台北",
        });

        expect(legs).toEqual([]);
    });
});
