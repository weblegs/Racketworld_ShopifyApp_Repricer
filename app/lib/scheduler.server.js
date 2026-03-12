import cron from "node-cron";
import { runDailyPriceScraper } from "./dailyPriceScraper.server.js";

let schedulerStarted = false;

/**
 * Start cron jobs — call once at server startup.
 * Schedules: 9am, 1pm, 6pm daily (UK time).
 */
export function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  console.log("[Scheduler] Starting price scraper cron jobs");

  // TEST: 10:17am (remove after testing)
  cron.schedule("17 10 * * *", async () => {
    console.log("[Scheduler] 10:17am TEST trigger — running daily price scraper");
    try { await runDailyPriceScraper(); }
    catch (err) { console.error("[Scheduler] 10:17am test job failed:", err); }
  }, { timezone: "Europe/London" });

  // 9am daily
  cron.schedule("0 9 * * *", async () => {
    console.log("[Scheduler] 9am trigger — running daily price scraper");
    try { await runDailyPriceScraper(); }
    catch (err) { console.error("[Scheduler] 9am job failed:", err); }
  }, { timezone: "Europe/London" });

  // 1pm daily
  cron.schedule("0 13 * * *", async () => {
    console.log("[Scheduler] 1pm trigger — running daily price scraper");
    try { await runDailyPriceScraper(); }
    catch (err) { console.error("[Scheduler] 1pm job failed:", err); }
  }, { timezone: "Europe/London" });

  // 6pm daily
  cron.schedule("0 18 * * *", async () => {
    console.log("[Scheduler] 6pm trigger — running daily price scraper");
    try { await runDailyPriceScraper(); }
    catch (err) { console.error("[Scheduler] 6pm job failed:", err); }
  }, { timezone: "Europe/London" });

  console.log("[Scheduler] Cron jobs registered (9am, 1pm, 6pm)");
}
