import { buildJourneys, type Journey } from "./journey-planner.ts";
import type { DailyData } from "./daily-data.ts";

export type TabId = "bus" | "tra" | "thsr";

interface RouteJourneyInput {
    tab: TabId;
    data: DailyData;
    now: string;
    reservedOnly: boolean;
    directToHsinchuOnly: boolean;
    fresh: boolean;
}

export function buildRouteJourneys(input: RouteJourneyInput): Journey[] {
    const plannerNow = input.fresh
        ? input.now
        : `${input.data.serviceDate || "1970-01-01"}T00:00:00+08:00`;
    const common = {
        now: plannerNow,
        destination: "台北",
        legs: input.data.legs,
    };
    if (input.tab === "bus") {
        return buildJourneys({
            ...common,
            origin: "朝陽路",
            departureLeadMinutes: input.fresh ? 15 : 0,
            transferMinutes: {},
        }).filter((journey) => journey.legs.every((leg) => leg.route === "bus"));
    }
    if (input.tab === "tra") {
        const journeys = buildJourneys({
            ...common,
            origin: "榮華",
            departureLeadMinutes: input.fresh ? 25 : 0,
            transferMinutes: { 竹中: 5, 新竹: 5 },
            maximumTransferMinutes: 20,
            reservedOnlyFrom: input.reservedOnly ? "新竹" : undefined,
        }).filter((journey) => journey.legs.every((leg) => leg.route === "tra"));
        return input.directToHsinchuOnly
            ? journeys.filter((journey) =>
                journey.legs[0]?.origin === "榮華"
                && journey.legs[0]?.destination === "新竹")
            : journeys;
    }
    return buildJourneys({
        ...common,
        origin: "榮華",
        departureLeadMinutes: input.fresh ? 25 : 0,
        transferMinutes: { 竹中: 8, 六家: 0, 高鐵新竹: 0 },
    }).filter((journey) => journey.legs.some((leg) => leg.route === "thsr"));
}
