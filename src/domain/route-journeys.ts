import { buildJourneys, type Journey } from "./journey-planner.ts";
import type { DailyData } from "./daily-data.ts";

export type Direction = "outbound" | "return";

export type TabId = "bus" | "tra" | "thsr";

interface RouteJourneyInput {
    direction?: Direction;
    tab: TabId;
    data: DailyData;
    now: string;
    reservedOnly: boolean;
    directToHsinchuOnly: boolean;
    toHsinchu: boolean;
    showPastJourneys: boolean;
    fresh: boolean;
}

export function buildRouteJourneys(input: RouteJourneyInput): Journey[] {
    const returning = input.direction === "return";
    const plannerNow = input.fresh && !input.showPastJourneys
        ? input.now
        : `${input.data.serviceDate || "1970-01-01"}T00:00:00+08:00`;
    const outboundPairs: Record<TabId, string[][]> = {
        bus: [["朝陽路口", "台北"]],
        tra: [["榮華", "新竹"], ["榮華", "竹中"], ["竹中", "新竹"], ["新竹", "台北"]],
        thsr: [["榮華", "竹中"], ["竹中", "六家"], ["六家", "高鐵新竹"], ["高鐵新竹", "台北"]],
    };
    const allowedPairs = outboundPairs[input.tab].map(([origin, destination]) =>
        returning ? [destination, origin] : [origin, destination]);
    const common = {
        now: plannerNow,
        destination: returning ? "榮華" : "台北",
        legs: input.data.legs.filter((leg) => allowedPairs.some(([origin, destination]) =>
            leg.origin === origin && leg.destination === destination)),
    };
    if (input.tab === "bus") {
        return buildJourneys({
            ...common,
            origin: returning ? "台北" : "朝陽路口",
            destination: returning ? "朝陽路口" : "台北",
            departureLeadMinutes: 0,
            transferMinutes: {},
        }).filter((journey) => journey.legs.every((leg) => leg.route === "bus"));
    }
    if (input.tab === "tra") {
        const journeys = buildJourneys({
            ...common,
            destination: returning ? "榮華" : input.toHsinchu ? "新竹" : "台北",
            origin: returning ? input.toHsinchu ? "新竹" : "台北" : "榮華",
            departureLeadMinutes: 0,
            transferMinutes: { 竹中: 5, 新竹: 5 },
            maximumTransferMinutes: 20,
            reservedOnlyFrom: !input.toHsinchu && input.reservedOnly ? returning ? "台北" : "新竹" : undefined,
        }).filter((journey) => journey.legs.every((leg) => leg.route === "tra"));
        return input.directToHsinchuOnly
            ? journeys.filter((journey) =>
                journey.legs.some((leg) => returning
                    ? leg.origin === "新竹" && leg.destination === "榮華"
                    : leg.origin === "榮華" && leg.destination === "新竹"))
            : journeys;
    }
    return buildJourneys({
        ...common,
        origin: returning ? "台北" : "榮華",
        departureLeadMinutes: 0,
        transferMinutes: { 竹中: 5, 六家: returning ? 10 : 0, 高鐵新竹: returning ? 0 : 10 },
        maximumTransferMinutesByStop: { 竹中: 20, [returning ? "六家" : "高鐵新竹"]: 40 },
    }).filter((journey) => journey.legs.some((leg) => leg.route === "thsr"));
}
