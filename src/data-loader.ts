import { isDailyData, unavailableDailyData, type DailyData } from "./domain/daily-data.ts";

const CACHE_KEY = "home-traffic:daily-data";

function readCache(): DailyData | null {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (!stored) {
            return null;
        }
        const parsed: unknown = JSON.parse(stored);
        return isDailyData(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export async function loadDailyData(): Promise<{ data: DailyData; offline: boolean }> {
    try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/today.json`, {
            cache: "no-cache",
        });
        if (!response.ok) {
            throw new Error(`班表下載失敗：${response.status}`);
        }
        const parsed: unknown = await response.json();
        if (!isDailyData(parsed)) {
            throw new Error("班表格式不正確");
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        return { data: parsed, offline: false };
    } catch {
        return { data: readCache() ?? unavailableDailyData, offline: true };
    }
}
