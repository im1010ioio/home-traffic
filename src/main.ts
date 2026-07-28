import { registerSW } from "virtual:pwa-register";
import "./style.css";
import { loadDailyData } from "./data-loader.ts";
import type { Journey } from "./domain/journey-planner.ts";
import type { DailyData } from "./domain/daily-data.ts";
import { buildRouteJourneys, type TabId } from "./domain/route-journeys.ts";

const STATUS_READY_ICON = '<svg class="status__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10s10-4.5 10-10S17.5 2 12 2m-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8z"/></svg>';
const STATUS_WARNING_ICON = '<svg class="status__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13 13h-2V7h2m0 10h-2v-2h2M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2"/></svg>';
const OFFICIAL_LINKS = {
    "1820": "https://www.taiwanbus.tw/eBUSPage/Query/QueryResult.aspx?rno=18200&lan=C",
    "1820A": "https://www.taiwanbus.tw/eBUSPage/Query/QueryResult.aspx?rno=1820A&rn=1730352355334&lan=C",
} as const;

const RESERVED_FILTER_KEY = "home-traffic:reserved-only";
const DIRECT_FILTER_KEY = "home-traffic:direct-to-hsinchu-only";
const TO_HSINCHU_FILTER_KEY = "home-traffic:to-hsinchu";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
    throw new Error("找不到應用程式容器");
}
const appElement = app;

let activeTab: TabId = "bus";
let reservedOnly = localStorage.getItem(RESERVED_FILTER_KEY) !== "false";
let directToHsinchuOnly = localStorage.getItem(DIRECT_FILTER_KEY) === "true";
let toHsinchu = localStorage.getItem(TO_HSINCHU_FILTER_KEY) === "true";
let dailyData: DailyData;
let offline = false;
let showingAll = false;
let scheduleTab: "tra" | "thsr" = "tra";
let showPastSchedules = false;
let schedulePageActive = false;

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

const hasNoStandingTickets = (service: string): boolean =>
    /(3000|普悠瑪|太魯閣)/.test(service);

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
        toHsinchu,
        fresh: dailyData.status === "ready" && dailyData.serviceDate === taipeiDate() && !offline,
    });
}

function statusBanner(): string {
    const stale = dailyData.status !== "ready" || dailyData.serviceDate !== taipeiDate();
    if (!stale && !offline) {
        const generatedAt = new Date(dailyData.generatedAt!);
        const generatedDate = taipeiDate(generatedAt).replaceAll("-", "/");
        return `<div class="status status--ok">
            ${STATUS_READY_ICON}
            <span>今日班表已更新 · ${generatedDate} ${time(dailyData.generatedAt!)}</span>
        </div>`;
    }
    const title = dailyData.status === "unavailable" ? "今日資料尚未更新" : "目前顯示舊班表";
    const detail = dailyData.generatedAt
        ? `最後更新：${taipeiDate(new Date(dailyData.generatedAt)).replaceAll("-", "/")} ${time(dailyData.generatedAt)}`
        : "尚無成功更新紀錄";
    return `<div class="status status--warning" role="alert">
        ${STATUS_WARNING_ICON}
        <div class="status__copy">
            <strong>${offline ? "離線資料 · " : ""}${title}</strong>
            <span>${detail}，請以官方資訊為準。</span>
        </div>
        <a href="https://github.com/im1010ioio/home-traffic/actions/workflows/daily-data.yml" target="_blank" rel="noreferrer">手動更新</a>
    </div>`;
}

function journeyCard(journey: Journey, fresh: boolean): string {
    const vehicleLegs = journey.legs.filter((leg) => leg.route !== "walk");
    const transferCount = Math.max(0, vehicleLegs.length - 1);
    const destination = vehicleLegs.at(-1)?.destination ?? "目的地";
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
        const noStandingTickets = leg.route === "tra"
            && leg.reserved
            && hasNoStandingTickets(leg.service);
        const service = leg.route === "bus" && leg.service.includes("1820A") && !leg.service.includes("繞駛關西市區")
            ? `${leg.service}（繞駛關西市區）`
            : leg.service;
        return `<li>
                    <div class="timeline__dot" aria-hidden="true"></div>
                    <div class="timeline__content">
                        <div class="timeline__row"><strong>${leg.origin} → ${leg.destination}</strong><span>${service}</span></div>
                        <div class="timeline__row"><span>${time(leg.departure)} 發車</span><span>${time(leg.arrival)} 抵達</span></div>
                        ${direct ? '<span class="badge">直達新竹</span>' : ""}
                        ${leg.reserved && leg.route === "tra" ? '<span class="badge badge--amber">對號列車</span>' : ""}
                        ${noStandingTickets ? '<span class="badge badge--danger">無售站票</span>' : ""}
                        ${transfer ? `<p class="transfer">${transfer}</p>` : ""}
                    </div>
                </li>`;
    }).join("")}
        </ol>
        <footer class="arrival">${time(journey.arrival)} 抵達${destination} · ${transferCount} 次轉乘</footer>
    </article>`;
}

function tabPanel(): string {
    const fresh = dailyData.status === "ready" && dailyData.serviceDate === taipeiDate() && !offline;
    const journeys = journeysFor(activeTab);
    const visible = showingAll ? journeys : journeys.slice(0, 3);
    const traFilters = activeTab === "tra" ? `<div class="filter-group">
        ${toHsinchu ? "" : `<label class="filter">
            <input id="reserved-filter" type="checkbox" ${reservedOnly ? "checked" : ""}>
            <span>對號列車</span>
        </label>
        <label class="filter">
            <input id="direct-filter" type="checkbox" ${directToHsinchuOnly ? "checked" : ""}>
            <span>直達新竹</span>
        </label>`}
        <label class="filter">
            <input id="to-hsinchu-filter" type="checkbox" ${toHsinchu ? "checked" : ""}>
            <span>僅前往新竹</span>
        </label>
    </div>` : "";
    const busLinks = activeTab === "bus" ? `<div class="realtime-links" aria-label="官方即時資訊">
        ${(["1820", "1820A"] as const).map((route) => `<a href="${OFFICIAL_LINKS[route]}" target="_blank" rel="noreferrer">${route} 即時動態 ↗</a>`).join("")}
    </div>` : "";
    return `<section class="panel" role="tabpanel">
        <div class="panel__toolbar"><div class="journey-summary"><span>${journeys.length} 組可搭行程</span><a class="help-link" href="#guide" aria-label="查看行程顯示規則">?</a></div>${traFilters}${busLinks}</div>
        <div class="journeys">
            ${visible.length ? visible.map((journey) => journeyCard(journey, fresh)).join("") : `<div class="empty-state">
                <strong>${dailyData.status === "unavailable" ? "等待今日班表" : "今日已無符合條件的行程"}</strong>
            </div>`}
        </div>
        ${journeys.length > 3 ? `<button class="secondary-button" id="show-all">${showingAll ? "只顯示最近 3 組" : "顯示今日全部"}</button>` : ""}
    </section>`;
}

function schedulesPage(): string {
    const isTra = scheduleTab === "tra";
    const routeTitle = isTra ? "今日台鐵・新竹 → 台北" : "今日高鐵・新竹 → 台北";
    return `<main class="shell">
        <a class="back-link" href="#">← 返回可搭組合</a>
        <header class="page-heading"><div><p class="eyebrow">今日固定班表</p><h1>台鐵、高鐵固定班表</h1><p>查詢新竹至台北的台鐵與高鐵班次。</p></div></header>
        ${statusBanner()}
        <div class="schedule-sticky">
            <nav class="schedule-tabs" role="tablist" aria-label="班表類型">
                <button role="tab" aria-selected="${isTra}" data-schedule-tab="tra"><span aria-hidden="true">🚃</span><span>台鐵</span></button>
                <button role="tab" aria-selected="${!isTra}" data-schedule-tab="thsr"><span aria-hidden="true">🚄</span><span>高鐵</span></button>
            </nav>
            <div class="schedule-filters">
                ${isTra ? `<label class="filter"><input id="reserved-filter" type="checkbox" ${reservedOnly ? "checked" : ""}><span>對號列車</span></label>` : ""}
                <label class="filter"><input id="past-filter" type="checkbox" ${showPastSchedules ? "checked" : ""}><span>顯示已過班次</span></label>
            </div>
        </div>
        <section class="schedule-section" role="tabpanel">
            <div class="schedule-section__heading"><h2>${routeTitle}</h2><a class="help-link" href="#guide" aria-label="查看行程顯示規則">?</a></div>
            ${simpleTimetable(scheduleTab)}
        </section>
        ${footer()}
    </main>`;
}

function simpleTimetable(route: "tra" | "thsr"): string {
    const currentTime = Date.now();
    const legs = dailyData.legs.filter((leg) =>
        leg.route === route
        && (leg.origin === "新竹" || leg.origin === "高鐵新竹")
        && leg.destination === "台北"
        && (showPastSchedules || Date.parse(leg.departure) >= currentTime)
        && (route === "thsr" || !reservedOnly || leg.reserved),
    );
    if (!legs.length) {
        return '<p class="empty-inline">目前沒有可顯示的班次。</p>';
    }
    return `<div class="timetable">${legs.map((leg) => {
        const departureAt = Date.parse(leg.departure);
        const isPast = departureAt < currentTime;
        const isSoon = !isPast && departureAt - currentTime <= 60 * 60_000;
        const noStandingTickets = route === "tra" && hasNoStandingTickets(leg.service);
        const statusClass = isPast
            ? "timetable-status--past"
            : isSoon
                ? "timetable-status--soon"
                : "timetable-status--upcoming";
        return `<div>
            <span class="timetable-status ${statusClass}">${isPast ? "已過班次" : "即將到來"}</span>
            <strong>${time(leg.departure)}</strong>
            <span class="timetable__service"><span>${leg.service}</span>${noStandingTickets ? '<span class="badge badge--danger">無售站票</span>' : ""}</span>
            <span class="timetable__arrival">${time(leg.arrival)} 抵達</span>
        </div>`;
    }).join("")}</div>`;
}

function footer(): string {
    return `<footer class="site-footer"><p>資料來源：交通部 TDX 運輸資料流通服務</p><p>班表僅供參考，實際營運以官方資訊為準。</p></footer>`;
}

function guidePage(): string {
    const updatedAt = dailyData.generatedAt
        ? `${taipeiDate(new Date(dailyData.generatedAt)).replaceAll("-", "/")} ${time(dailyData.generatedAt)}`
        : "尚無成功更新紀錄";
    return `<main class="shell">
        <a class="back-link" href="#" data-guide-back>← 返回上一頁</a>
        <header class="page-heading"><div><p class="eyebrow">使用說明</p><h1>行程顯示規則</h1><p>這個網頁以今日坐車需求而設計，只整理今天可搭的班次組合。</p></div></header>
        <section class="guide-intro">
            <strong>每日班表更新</strong>
            <p>GitHub Actions 每日約 04:30 開始抓取，完成時間會受 TDX 與 GitHub 執行狀況影響。</p>
            <p>目前資料最後更新：<time>${updatedAt}</time></p>
        </section>
        <div class="guide-grid">
            <section class="guide-card">
                <h2><span aria-hidden="true">🚌</span> 國光客運</h2>
                <ul>
                    <li>顯示最早在現在 15 分鐘後發車的今日組合，預留前往朝陽路口的時間。</li>
                    <li>朝陽路口直達台北，沒有轉乘間隔條件。</li>
                </ul>
            </section>
            <section class="guide-card">
                <h2><span aria-hidden="true">🚃</span> 台鐵</h2>
                <ul>
                    <li>顯示最早在現在 25 分鐘後從榮華發車的今日組合。</li>
                    <li>竹中轉乘：至少 5 分鐘、未滿 20 分鐘。</li>
                    <li>新竹轉乘：至少 5 分鐘、未滿 20 分鐘。</li>
                    <li>榮華直達新竹的班次不需在竹中轉乘，仍依新竹轉乘條件銜接台北。</li>
                    <li>開啟「僅前往新竹」後，會列出榮華直達新竹及在竹中轉乘的全部組合，不再銜接台北班次。</li>
                </ul>
            </section>
            <section class="guide-card">
                <h2><span aria-hidden="true">🚄</span> 高鐵</h2>
                <ul>
                    <li>顯示最早在現在 25 分鐘後從榮華發車的今日組合。</li>
                    <li>竹中轉乘：至少 5 分鐘、未滿 20 分鐘。</li>
                    <li>六家抵達至高鐵新竹發車：至少 10 分鐘、未滿 40 分鐘，間隔包含步行時間。</li>
                </ul>
            </section>
            <section class="guide-card">
                <h2><span aria-hidden="true">🕒</span> 台鐵、高鐵固定班表</h2>
                <ul>
                    <li>距離發車 1 小時內的「即將到來」班次會以黃色 warning 標示。</li>
                </ul>
            </section>
        </div>
        <p class="guide-note">首頁預設顯示最近 3 組，可使用「顯示今日全部」查看當天其餘符合條件的組合。</p>
        ${footer()}
    </main>`;
}

function homePage(): string {
    const labels: Record<TabId, string> = { bus: "國光客運", tra: "台鐵", thsr: "高鐵" };
    const emojis: Record<TabId, string> = { bus: "🚌", tra: "🚃", thsr: "🚄" };
    return `<main class="shell">
        <header class="hero"><div><p class="eyebrow">今天怎麼去台北？</p><h1>竹東往台北轉乘攻略</h1><p>把轉乘算好，從容選下一班。</p></div><div class="hero__actions"><a class="schedule-link" href="#schedules">台鐵、高鐵固定班表</a><a class="schedule-link" href="https://www.taiwanbus.tw/eBUSPage/Query/QueryResult.aspx?rn=1611494980221&rno=56080&lan=C" target="_blank" rel="noreferrer">往新竹 5608 即時動態 ↗</a></div></header>
        ${statusBanner()}
        <nav class="tabs" role="tablist" aria-label="交通方式">
            ${(Object.keys(labels) as TabId[]).map((id) => `<button role="tab" aria-selected="${activeTab === id}" data-tab="${id}"><span class="tab__emoji" aria-hidden="true">${emojis[id]}</span><span>${labels[id]}</span></button>`).join("")}
        </nav>
        ${tabPanel()}
        ${footer()}
    </main>`;
}

function bindEvents(): void {
    document.querySelector<HTMLAnchorElement>("[data-guide-back]")?.addEventListener("click", (event) => {
        event.preventDefault();
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.hash = "";
        }
    });
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
    document.querySelector<HTMLInputElement>("#to-hsinchu-filter")?.addEventListener("change", (event) => {
        toHsinchu = (event.currentTarget as HTMLInputElement).checked;
        localStorage.setItem(TO_HSINCHU_FILTER_KEY, String(toHsinchu));
        showingAll = false;
        render();
    });
    document.querySelectorAll<HTMLButtonElement>("[data-schedule-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            scheduleTab = button.dataset.scheduleTab as "tra" | "thsr";
            render();
        });
    });
    document.querySelector<HTMLInputElement>("#past-filter")?.addEventListener("change", (event) => {
        showPastSchedules = (event.currentTarget as HTMLInputElement).checked;
        render();
    });
    document.querySelector<HTMLButtonElement>("#show-all")?.addEventListener("click", () => {
        showingAll = !showingAll;
        render();
    });
}

function render(): void {
    const isSchedulesPage = location.hash === "#schedules";
    if (isSchedulesPage && !schedulePageActive) {
        scheduleTab = "tra";
        showPastSchedules = false;
    }
    schedulePageActive = isSchedulesPage;
    appElement.innerHTML = isSchedulesPage
        ? schedulesPage()
        : location.hash === "#guide"
            ? guidePage()
            : homePage();
    bindEvents();
}

window.addEventListener("hashchange", render);
registerSW({ immediate: true });

const loaded = await loadDailyData();
dailyData = loaded.data;
offline = loaded.offline;
render();
window.setInterval(render, 60_000);
