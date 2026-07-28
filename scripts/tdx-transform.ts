import type { TimetableLeg } from "../src/domain/journey-planner.ts";

type LocalizedName = { Zh_tw?: string };

interface RailStopTime {
    StationID?: string;
    StationName?: LocalizedName;
    ArrivalTime?: string;
    DepartureTime?: string;
}

interface RailTimetable {
    TrainInfo?: {
        TrainNo?: string;
        TrainTypeName?: LocalizedName;
    };
    DailyTrainInfo?: {
        TrainNo?: string;
        TrainTypeName?: LocalizedName;
    };
    StopTimes?: RailStopTime[];
    OriginStopTime?: RailStopTime;
    DestinationStopTime?: RailStopTime;
}

interface TransformRailInput {
    response: unknown;
    date: string;
    originId: string;
    destinationId: string;
    route: "tra" | "thsr";
}

const canonicalStationName = (name: string): string =>
    name === "臺北" ? "台北" : name;

const atTaipei = (date: string, time: string): string => `${date}T${time}:00+08:00`;

const nextDate = (date: string): string => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
};

function datedRange(date: string, departureTime: string, arrivalTime: string): {
    departure: string;
    arrival: string;
} {
    const departure = atTaipei(date, departureTime);
    let arrival = atTaipei(date, arrivalTime);
    if (Date.parse(arrival) < Date.parse(departure)) {
        arrival = atTaipei(nextDate(date), arrivalTime);
    }
    return { departure, arrival };
}

function timetablesFrom(response: unknown): RailTimetable[] {
    if (Array.isArray(response)) {
        return response as RailTimetable[];
    }
    if (response && typeof response === "object") {
        const record = response as Record<string, unknown>;
        const candidate = record.TrainTimetables ?? record.DailyTimetables;
        if (Array.isArray(candidate)) {
            return candidate as RailTimetable[];
        }
    }
    return [];
}

export function transformRailOd(input: TransformRailInput): TimetableLeg[] {
    return timetablesFrom(input.response).flatMap((timetable) => {
        const info = timetable.TrainInfo ?? timetable.DailyTrainInfo;
        const stops = timetable.StopTimes ?? [
            timetable.OriginStopTime,
            timetable.DestinationStopTime,
        ].filter((stop): stop is RailStopTime => Boolean(stop));
        const origin = stops.find((stop) => stop.StationID === input.originId);
        const destination = stops.find((stop) => stop.StationID === input.destinationId);
        const trainNo = info?.TrainNo;
        const trainType = info?.TrainTypeName?.Zh_tw
            ?? (input.route === "thsr" ? "高鐵" : "台鐵");
        const originName = origin?.StationName?.Zh_tw;
        const destinationName = destination?.StationName?.Zh_tw;
        const departureTime = origin?.DepartureTime ?? origin?.ArrivalTime;
        const arrivalTime = destination?.ArrivalTime ?? destination?.DepartureTime;

        if (
            !trainNo
            || !originName
            || !destinationName
            || !departureTime
            || !arrivalTime
        ) {
            return [];
        }

        const range = datedRange(input.date, departureTime, arrivalTime);
        return [{
            id: `${input.route}-${trainNo}-${input.originId}-${input.destinationId}-${input.date}`,
            route: input.route,
            service: `${trainType} ${trainNo}`,
            origin: canonicalStationName(originName),
            destination: canonicalStationName(destinationName),
            departure: range.departure,
            arrival: range.arrival,
            reserved: input.route === "thsr" || !trainType.includes("區間"),
        } satisfies TimetableLeg];
    });
}

interface BusStopTime {
    StopName?: LocalizedName;
    ArrivalTime?: string;
    DepartureTime?: string;
    TripID?: string;
    Sequence?: number;
    TimeTables?: BusStopTime[];
}

interface BusStopTimetable {
    BusDate?: string;
    Date?: string;
    RouteName?: LocalizedName;
    SubRouteName?: LocalizedName;
    StopTimes?: BusStopTime[];
    Stops?: BusStopTime[];
    Timetables?: Array<{
        TripID?: string;
        StopTimes?: BusStopTime[];
    }>;
}

interface TransformBusInput {
    response: unknown;
    date: string;
    routeName: string;
    subRouteNames?: string[];
    originName: string;
    canonicalOrigin?: string;
    destinationNames: string[];
    canonicalDestination: string;
    operatorName?: string;
    serviceNote?: string;
}

function busTimetablesFrom(response: unknown): BusStopTimetable[] {
    if (Array.isArray(response)) {
        return response as BusStopTimetable[];
    }
    if (response && typeof response === "object") {
        const record = response as Record<string, unknown>;
        const candidate = record.DailyTimetables
            ?? record.StopTimeTables
            ?? record.DailyStopTimeTables;
        if (Array.isArray(candidate)) {
            return candidate as BusStopTimetable[];
        }
    }
    return [];
}

function responseBusDate(response: unknown): string | undefined {
    if (!response || Array.isArray(response) || typeof response !== "object") {
        return undefined;
    }
    const value = (response as Record<string, unknown>).BusDate;
    return typeof value === "string" ? value : undefined;
}

export function transformBusStopTimetables(input: TransformBusInput): TimetableLeg[] {
    if (responseBusDate(input.response) && responseBusDate(input.response) !== input.date) {
        return [];
    }

    return busTimetablesFrom(input.response).flatMap((timetable) => {
        if (
            input.subRouteNames
            && !input.subRouteNames.includes(timetable.SubRouteName?.Zh_tw ?? "")
        ) {
            return [];
        }

        // DailyTimeTable normally returns only today's operated trips. Keep
        // the service-date guard as a fail-safe when the provider includes it.
        const timetableDate = (timetable.BusDate ?? timetable.Date)?.slice(0, 10);
        if (timetableDate && timetableDate !== input.date) {
            return [];
        }

        if (timetable.Timetables) {
            return timetable.Timetables.flatMap((trip) =>
                busLegFromOrderedStops(input, trip.StopTimes ?? []));
        }

        if (timetable.Stops) {
            const originIndex = timetable.Stops.findIndex((stop) => stop.StopName?.Zh_tw === input.originName);
            const destinationIndex = timetable.Stops.findIndex((stop) =>
                input.destinationNames.includes(stop.StopName?.Zh_tw ?? ""),
            );
            if (originIndex < 0 || destinationIndex <= originIndex) {
                return [];
            }
            const originStop = timetable.Stops[originIndex];
            const destinationStop = timetable.Stops[destinationIndex];
            return (originStop?.TimeTables ?? []).flatMap((originTime) => {
                const key = originTime.TripID ?? String(originTime.Sequence ?? "");
                const destinationTime = (destinationStop?.TimeTables ?? []).find((candidate) =>
                    (candidate.TripID ?? String(candidate.Sequence ?? "")) === key,
                );
                const departureTime = originTime.DepartureTime ?? originTime.ArrivalTime;
                const arrivalTime = destinationTime?.ArrivalTime ?? destinationTime?.DepartureTime;
                return departureTime && arrivalTime
                    ? [busLeg(input, departureTime, arrivalTime)]
                    : [];
            });
        }

        return busLegFromOrderedStops(input, timetable.StopTimes ?? []);
    });
}

function busLegFromOrderedStops(input: TransformBusInput, stops: BusStopTime[]): TimetableLeg[] {
    const originIndex = stops.findIndex((stop) => stop.StopName?.Zh_tw === input.originName);
    const destinationIndex = stops.findIndex((stop) =>
        input.destinationNames.includes(stop.StopName?.Zh_tw ?? ""),
    );
    if (originIndex < 0 || destinationIndex <= originIndex) {
        return [];
    }
    const origin = stops[originIndex];
    const destination = stops[destinationIndex];
    const departureTime = origin?.DepartureTime ?? origin?.ArrivalTime;
    const arrivalTime = destination?.ArrivalTime ?? destination?.DepartureTime;
    return departureTime && arrivalTime ? [busLeg(input, departureTime, arrivalTime)] : [];
}

function busLeg(input: TransformBusInput, departureTime: string, arrivalTime: string): TimetableLeg {
    const range = datedRange(input.date, departureTime, arrivalTime);
    return {
        id: `bus-${input.routeName}-${input.originName}-${input.canonicalDestination}-${input.date}-${departureTime}`,
        route: "bus",
        service: `${input.operatorName ?? "公車"} ${input.routeName}${input.serviceNote ? `（${input.serviceNote}）` : ""}`,
        origin: input.canonicalOrigin ?? input.originName,
        destination: input.canonicalDestination,
        departure: range.departure,
        arrival: range.arrival,
        reserved: false,
    };
}
