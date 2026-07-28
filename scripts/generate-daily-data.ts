import { mkdir, writeFile } from "node:fs/promises";
import { createTdxClient } from "./tdx-client.ts";
import { transformBusStopTimetables, transformRailOd } from "./tdx-transform.ts";
import type { DailyData } from "../src/domain/daily-data.ts";
import type { TimetableLeg } from "../src/domain/journey-planner.ts";

const clientId = process.env.TDX_CLIENT_ID;
const clientSecret = process.env.TDX_CLIENT_SECRET;
if (!clientId || !clientSecret) {
    throw new Error("缺少 TDX_CLIENT_ID 或 TDX_CLIENT_SECRET");
}

const client = createTdxClient({ clientId, clientSecret });
const serviceDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
}).format(new Date());

interface Station {
    StationID?: string;
    StationName?: { Zh_tw?: string };
}

function recordsFrom<T>(value: unknown, keys: string[]): T[] {
    if (Array.isArray(value)) {
        return value as T[];
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            if (Array.isArray(record[key])) {
                return record[key] as T[];
            }
        }
    }
    return [];
}

function stationId(stations: Station[], names: string[]): string {
    const station = stations.find((candidate) =>
        names.includes(candidate.StationName?.Zh_tw ?? ""),
    );
    if (!station?.StationID) {
        throw new Error(`TDX 找不到車站：${names.join("／")}`);
    }
    return station.StationID;
}

const formatQuery = "?$format=JSON";

async function main(): Promise<void> {
    const [traStationsResponse, thsrStationsResponse] = await Promise.all([
        client.getJson(`/v3/Rail/TRA/Station${formatQuery}`),
        client.getJson(`/v2/Rail/THSR/Station${formatQuery}`),
    ]);
    const traStations = recordsFrom<Station>(traStationsResponse, ["Stations"]);
    const thsrStations = recordsFrom<Station>(thsrStationsResponse, ["Stations"]);

    const tra = {
        榮華: stationId(traStations, ["榮華"]),
        竹中: stationId(traStations, ["竹中"]),
        六家: stationId(traStations, ["六家"]),
        新竹: stationId(traStations, ["新竹"]),
        台北: stationId(traStations, ["臺北", "台北"]),
    };
    const thsr = {
        新竹: stationId(thsrStations, ["新竹"]),
        台北: stationId(thsrStations, ["台北", "臺北"]),
    };

    const railRequests = [
        { route: "tra" as const, from: tra.榮華, to: tra.竹中 },
        { route: "tra" as const, from: tra.榮華, to: tra.新竹 },
        { route: "tra" as const, from: tra.竹中, to: tra.新竹 },
        { route: "tra" as const, from: tra.竹中, to: tra.六家 },
        { route: "tra" as const, from: tra.新竹, to: tra.台北 },
        { route: "thsr" as const, from: thsr.新竹, to: thsr.台北 },
    ];

    const railResponses = await Promise.all(railRequests.map(({ route, from, to }) => {
        const path = route === "tra"
            ? `/v3/Rail/TRA/DailyTrainTimetable/OD/Inclusive/${from}/to/${to}/${serviceDate}`
            : `/v2/Rail/THSR/DailyTimetable/OD/${from}/to/${to}/${serviceDate}`;
        return client.getJson(`${path}${formatQuery}`);
    }));

    const railLegs = railResponses.flatMap((response, index) => {
        const request = railRequests[index];
        if (!request) {
            return [];
        }
        return transformRailOd({
            response,
            date: serviceDate,
            originId: request.from,
            destinationId: request.to,
            route: request.route,
        }).map((leg) => request.route === "thsr"
            ? { ...leg, origin: "高鐵新竹", destination: "台北", service: leg.service.replace(/^台鐵/, "高鐵") }
            : leg);
    });

    const walkingLegs: TimetableLeg[] = railLegs
        .filter((leg) => leg.route === "tra" && leg.destination === "六家")
        .map((leg) => ({
            id: `walk-${leg.id}`,
            route: "walk",
            service: "步行轉乘",
            origin: "六家",
            destination: "高鐵新竹",
            departure: leg.arrival,
            arrival: new Date(Date.parse(leg.arrival) + 10 * 60_000).toISOString().replace(".000Z", "+00:00"),
            reserved: false,
        }));

    const busDefinitions = [
        { path: "/v2/Bus/DailyStopTimeTable/InterCity/1820", routeName: "1820", operatorName: "國光客運", originName: "朝陽路", destinationNames: ["臺北轉運站", "台北轉運站"], canonicalDestination: "台北" },
        { path: "/v2/Bus/DailyStopTimeTable/InterCity/1820A", routeName: "1820A", operatorName: "國光客運", originName: "朝陽路", destinationNames: ["臺北轉運站", "台北轉運站"], canonicalDestination: "台北" },
        { path: "/v2/Bus/DailyStopTimeTable/InterCity/9003", routeName: "9003", originName: "馬偕醫院", destinationNames: ["臺北轉運站", "台北轉運站"], canonicalDestination: "台北" },
        { path: "/v2/Bus/DailyStopTimeTable/City/HsinchuCounty/5608", routeName: "5608", operatorName: "新竹客運", originName: "新光大樓", destinationNames: ["馬偕醫院"], canonicalDestination: "馬偕醫院" },
    ];
    const busResponses = await Promise.all(busDefinitions.map((definition) =>
        client.getJson(`${definition.path}${formatQuery}`),
    ));
    const busLegs = busResponses.flatMap((response, index) => {
        const definition = busDefinitions[index];
        return definition ? transformBusStopTimetables({ response, date: serviceDate, ...definition }) : [];
    });

    const data: DailyData = {
        schemaVersion: 1,
        serviceDate,
        generatedAt: new Date().toISOString(),
        status: "ready",
        legs: [...railLegs, ...walkingLegs, ...busLegs].sort((a, b) =>
            Date.parse(a.departure) - Date.parse(b.departure),
        ),
        sources: ["TDX 公共運輸-軌道", "TDX 公共運輸-公車"],
    };

    await mkdir("public/data", { recursive: true });
    await writeFile("public/data/today.json", `${JSON.stringify(data, null, 4)}\n`, "utf8");
    process.stdout.write(`已產生 ${serviceDate} 班表，共 ${data.legs.length} 段。\n`);
}

await main();
