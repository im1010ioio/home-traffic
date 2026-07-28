import type { TimetableLeg } from "./journey-planner.ts";

export interface DailyData {
    schemaVersion: 1;
    serviceDate: string;
    generatedAt: string | null;
    status: "ready" | "unavailable";
    legs: TimetableLeg[];
    sources: string[];
}

export const unavailableDailyData: DailyData = {
    schemaVersion: 1,
    serviceDate: "",
    generatedAt: null,
    status: "unavailable",
    legs: [],
    sources: [],
};

export function isDailyData(value: unknown): value is DailyData {
    if (!value || typeof value !== "object") {
        return false;
    }
    const record = value as Record<string, unknown>;
    return record.schemaVersion === 1
        && typeof record.serviceDate === "string"
        && (record.generatedAt === null || typeof record.generatedAt === "string")
        && (record.status === "ready" || record.status === "unavailable")
        && Array.isArray(record.legs)
        && Array.isArray(record.sources);
}
