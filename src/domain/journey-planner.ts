export interface TimetableLeg {
    id: string;
    route: "tra" | "thsr" | "bus" | "walk";
    service: string;
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    reserved?: boolean;
}

export interface Journey {
    id: string;
    departure: string;
    arrival: string;
    durationMinutes: number;
    transferStops: string[];
    legs: TimetableLeg[];
}

interface BuildJourneysInput {
    now: string;
    origin: string;
    destination: string;
    departureLeadMinutes: number;
    transferMinutes: Record<string, number>;
    maximumTransferMinutes?: number;
    maximumTransferMinutesByStop?: Record<string, number>;
    legs: TimetableLeg[];
    reservedOnlyFrom?: string;
}

const minutesBetween = (start: string, end: string): number =>
    Math.round((Date.parse(end) - Date.parse(start)) / 60_000);

export function buildJourneys(input: BuildJourneysInput): Journey[] {
    const earliestDeparture = Date.parse(input.now) + input.departureLeadMinutes * 60_000;
    const journeys: Journey[] = [];

    const walk = (currentStop: string, path: TimetableLeg[]): void => {
        if (currentStop === input.destination && path.length > 0) {
            const first = path[0];
            const last = path.at(-1);
            if (!first || !last) {
                return;
            }

            journeys.push({
                id: path.map((leg) => leg.id).join("__"),
                departure: first.departure,
                arrival: last.arrival,
                durationMinutes: minutesBetween(first.departure, last.arrival),
                transferStops: path.slice(0, -1).map((leg) => leg.destination),
                legs: path,
            });
            return;
        }

        const previous = path.at(-1);
        for (const leg of input.legs) {
            if (leg.origin !== currentStop || path.some((item) => item.id === leg.id)) {
                continue;
            }
            if (!previous && Date.parse(leg.departure) < earliestDeparture) {
                continue;
            }
            if (previous) {
                if (leg.route === "walk" && leg.id !== `walk-${previous.id}`) {
                    continue;
                }
                const minimumTransfer = input.transferMinutes[currentStop] ?? 0;
                const transferStart = previous.route === "walk"
                    ? path.at(-2)?.arrival ?? previous.arrival
                    : previous.arrival;
                const minimumTransferDuration = minutesBetween(previous.arrival, leg.departure);
                const transferDuration = minutesBetween(transferStart, leg.departure);
                if (minimumTransferDuration < 0) {
                    continue;
                }
                const comparableMinimum = previous.route === "walk"
                    ? transferDuration
                    : minimumTransferDuration;
                if (comparableMinimum < minimumTransfer) {
                    continue;
                }
                const maximumTransfer = input.maximumTransferMinutesByStop?.[currentStop]
                    ?? input.maximumTransferMinutes;
                if (
                    maximumTransfer !== undefined
                    && transferDuration >= maximumTransfer
                ) {
                    continue;
                }
            }
            if (
                input.reservedOnlyFrom === leg.origin
                && leg.route === "tra"
                && !leg.reserved
            ) {
                continue;
            }
            if (path.length >= input.legs.length) {
                continue;
            }
            walk(leg.destination, [...path, leg]);
        }
    };

    walk(input.origin, []);

    return journeys.sort((left, right) => {
        const departureDifference = Date.parse(left.departure) - Date.parse(right.departure);
        return departureDifference || left.legs.length - right.legs.length;
    });
}
