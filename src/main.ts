import { registerSW } from "virtual:pwa-register";
import "./style.css";
import { loadDailyData } from "./data-loader.ts";
import type { Journey } from "./domain/journey-planner.ts";
import type { DailyData } from "./domain/daily-data.ts";
import { buildRouteJourneys, type TabId } from "./domain/route-journeys.ts";

const OFFICIAL_LINKS = {
    "1820": "https://www.taiwanbus.tw/eBUSPage/Query/QueryResult.aspx?rno=18200&lan=C",
    "1820A": "https://www.taiwanbus.tw/eBUSPage/Query/QueryResult.aspx?rno=1820A&rn=1730352355334&lan=C",
} as const;

const RESERVED_FILTER_KEY = "home-traffic:reserved-only";
const DIRECT_FILTER_KEY = "home-traffic:direct-to-hsinchu-only";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
    throw new Error("找不到應用程式容器");
}
const appElement = app;

let activeTab: TabId = "bus";
let reservedOnly = localStorage.getItem(RESERVED_FILTER_KEY) !== "false";
let directToHsinchuOnly = localStorage.getItem(DIRECT_FILTER_KEY) === "true";
let dailyData: DailyData;
let offline = false;
let showingAll = false;

const taipeiDate = (date = new Date()): string =>
    new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);

const time = (iso: string): string =>
    new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(iso));

const duration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours > 0 ? `${hours} 小時 ${remainder} 分` : `${remainder} 分`;
};

const countdown = (iso: string): string => {
    const minutes = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
    return minutes >= 60
        ? `還有 ${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`
        : `還有 ${minutes} 分鐘`;
};

function journeysFor(tab: TabId): Journey[] {
    return buildRouteJourneys({
        tab,
        data: dailyData,
        now: new Date().toISOString(),
        reservedOnly,
        directToHsinchuOnly,
        fresh: dailyData.status === "ready" && dailyData.serviceDate === taipeiDate() && !offline,
    });
}

function statusBanner(): string {
    const stale = dailyData.status !== "ready" || dailyData.serviceDate !== taipeiDate();
    if (!stale && !offline) {
        return `<div class="status status--ok">今日班表已更新 · ${time(dailyData.generatedAt!)}</div>`;
    }
    const title = dailyData.status === "unavailable" ? "今日資料尚未更新" : "目前顯示舊班表";
    const detail = dailyData.generatedAt
        ? `最後更新：${dailyData.serviceDate} ${time(dailyData.generatedAt)}`
        : "尚無成功更新紀錄";
    return `<div class="status status--warning" role="alert">
        <strong>${offline ? "離線資料 · " : ""}${title}</strong>
        <span>${detail}，請以官方資訊為準。</span>
        <a href="https://github.com/im1010ioio/home-traffic/actions" target="_blank" rel="noreferrer">手動更新</a>
    </div>`;
}

function journeyCard(journey: Journey, fresh: boolean): string {
    const vehicleLegs = journey.legs.filter((leg) => leg.route !== "walk");
    const transferCount = Math.max(0, vehicleLegs.length - 1);
    return `<article class="journey-card">
        <header class="journey-card__header">
            <div>
                ${fresh ? `<p class="countdown">${countdown(journey.departure)}</p>` : ""}
                <p class="departure">${time(journey.departure)} 從 ${journey.legs[0]?.origin} 發車</p>
            </div>
            <div class="duration"><span>總時數</span><strong>${duration(journey.durationMinutes)}</strong></div>
        </header>
        <ol class="timeline">
            ${vehicleLegs.map((leg, index) => {
        const next = vehicleLegs[index + 1];
        const originalIndex = journey.legs.indexOf(leg);
        const walkingLeg = journey.legs[originalIndex + 1]?.route === "walk"
            ? journey.legs[originalIndex + 1]
            : undefined;
        const interval = next
            ? Math.round((Date.parse(next.departure) - Date.parse(leg.arrival)) / 60_000)
            : null;
        const transfer = interval === null
            ? ""
            : walkingLeg
                ? `步行至 ${walkingLeg.destination} 轉乘 · 間隔 ${interval} 分鐘`
                : `於 ${leg.destination} 轉乘 · 間隔 ${interval} 分鐘`;
        const direct = index === 0 && leg.origin === "榮華" && leg.destination === "新竹";
        return `<li>
                    <div class="timeline__dot" aria-hidden="true"></div>
                    <div class="timeline__content">
                        <div class="timeline__row"><strong>${leg.origin} → ${leg.destination}</strong><span>${leg.service}</span></div>
                        <div class="timeline__row"><span>${time(leg.departure)} 發車</span><span>${time(leg.arrival)} 抵達</span></div>
                        ${direct ? '<span class="badge">直達新竹</span>' : ""}
                        ${leg.reserved && leg.route === "tra" ? '<span class="badge badge--amber">對號列車</span>' : ""}
                        ${transfer ? `<p class="transfer">${transfer}</p>` : ""}
                    </div>
                </li>`;
    }).join("")}
        </ol>
        <footer class="arrival">${time(journey.arrival)} 抵達台北 · ${transferCount} 次轉乘</footer>
    </article>`;
}

function tabPanel(): string {
    const fresh = dailyData.status === "ready" && dailyData.serviceDate === taipeiDate() && !offline;
    const journeys = journeysFor(activeTab);
    const visible = showingAll ? journeys : journeys.slice(0, 3);
    const traFilters = activeTab === "tra" ? `<div class="filter-group">
        <label class="filter">
            <input id="reserved-filter" type="checkbox" ${reservedOnly ? "checked" : ""}>
            <span>僅顯示對號列車</span>
        </label>
        <label class="filter">
            <input id="direct-filter" type="checkbox" ${directToHsinchuOnly ? "checked" : ""}>
            <span>直達新竹</span>
        </label>
    </div>` : "";
    return `<section class="panel" role="tabpanel">
        <div class="panel__toolbar"><span>${journeys.length} 組可搭行程</span>${traFilters}</div>
        <div class="journeys">
            ${visible.length ? visible.map((journey) => journeyCard(journey, fresh)).join("") : `<div class="empty-state">
                <strong>${dailyData.status === "unavailable" ? "等待今日班表" : "今日已無符合條件的行程"}</strong>
                <span>請查看列車班表或官方資訊。</span>
            </div>`}
        </div>
        ${journeys.length > 3 ? `<button class="secondary-button" id="show-all">${showingAll ? "只顯示最近 3 組" : "顯示今日全部"}</button>` : ""}
    </section>`;
}

function schedulesPage(): string {
    return `<main class="shell">
        <a class="back-link" href="#">← 返回可搭組合</a>
        <header class="page-heading"><p class="eyebrow">今日固定班表</p><h1>各段班表</h1><p>查詢新竹至台北的台鐵與高鐵班次。</p></header>
        ${statusBanner()}
        <section class="schedule-section"><h2>新竹 → 台北</h2>
            <label class="filter"><input id="reserved-filter" type="checkbox" ${reservedOnly ? "checked" : ""}><span>僅顯示對號列車</span></label>
            ${simpleTimetable("tra")}
            <h3>高鐵固定班次</h3>${simpleTimetable("thsr")}
        </section>
        ${footer()}
    </main>`;
}

function simpleTimetable(route: "tra" | "thsr"): string {
    const legs = dailyData.legs.filter((leg) =>
        leg.route === route
        && (leg.origin === "新竹" || leg.origin === "高鐵新竹")
        && leg.destination === "台北"
        && (route === "thsr" || !reservedOnly || leg.reserved),
    );
    if (!legs.length) {
        return '<p class="empty-inline">目前沒有可顯示的班次。</p>';
    }
    return `<div class="timetable">${legs.map((leg) => `<div><strong>${time(leg.departure)}</strong><span>${leg.service}</span><span>${time(leg.arrival)} 抵達</span></div>`).join("")}</div>`;
}

function footer(): string {
    return `<footer class="site-footer"><p>資料來源：交通部 TDX 運輸資料流通服務</p><p>班表僅供參考，實際營運以官方資訊為準。</p></footer>`;
}

function homePage(): string {
    const labels: Record<TabId, string> = { bus: "國光客運", tra: "台鐵", thsr: "高鐵" };
    return `<main class="shell">
        <header class="hero"><div><p class="eyebrow">今天怎麼去台北？</p><h1>竹東往台北轉乘攻略</h1><p>把轉乘算好，從容選下一班。</p></div><a class="schedule-link" href="#schedules">各段班表</a></header>
        ${statusBanner()}
        <nav class="tabs" role="tablist" aria-label="交通方式">
            ${(Object.keys(labels) as TabId[]).map((id) => `<button role="tab" aria-selected="${activeTab === id}" data-tab="${id}">${labels[id]}</button>`).join("")}
        </nav>
        ${tabPanel()}
        <section class="official-links"><h2>官方即時資訊</h2><div>${(["1820", "1820A"] as const).map((route) => `<a href="${OFFICIAL_LINKS[route]}" target="_blank" rel="noreferrer">${route} 即時動態 ↗</a>`).join("")}</div></section>
        ${footer()}
    </main>`;
}

function bindEvents(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            activeTab = button.dataset.tab as TabId;
            showingAll = false;
            render();
        });
    });
    document.querySelector<HTMLInputElement>("#reserved-filter")?.addEventListener("change", (event) => {
        reservedOnly = (event.currentTarget as HTMLInputElement).checked;
        localStorage.setItem(RESERVED_FILTER_KEY, String(reservedOnly));
        render();
    });
    document.querySelector<HTMLInputElement>("#direct-filter")?.addEventListener("change", (event) => {
        directToHsinchuOnly = (event.currentTarget as HTMLInputElement).checked;
        localStorage.setItem(DIRECT_FILTER_KEY, String(directToHsinchuOnly));
        showingAll = false;
        render();
    });
    document.querySelector<HTMLButtonElement>("#show-all")?.addEventListener("click", () => {
        showingAll = !showingAll;
        render();
    });
}

function render(): void {
    appElement.innerHTML = location.hash === "#schedules" ? schedulesPage() : homePage();
    bindEvents();
}

window.addEventListener("hashchange", render);
registerSW({ immediate: true });

const loaded = await loadDailyData();
dailyData = loaded.data;
offline = loaded.offline;
render();
window.setInterval(render, 60_000);
