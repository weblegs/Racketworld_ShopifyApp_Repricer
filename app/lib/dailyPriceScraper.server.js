import prisma from "../db.server.js";
import { priceScraper } from "./priceScraper.js";

const DELAY_MS = 1000;
const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * Daily price scraper — updates ScrapedCompetitor and ScrapedPrice records.
 * Called by the cron scheduler.
 */
export async function runDailyPriceScraper() {
  console.log('[DailyPriceScraper] Starting job');

  const competitorStats = { total: 0, success: 0, failed: 0 };
  const scrapedPriceStats = { total: 0, success: 0, failed: 0 };
  const priceUpdateStats  = { total: 0, success: 0, failed: 0 };

  try {
    // --- 1. Update ScrapedCompetitor records ---
    const competitors = await prisma.scrapedCompetitor.findMany();
    console.log(`[DailyPriceScraper] Found ${competitors.length} ScrapedCompetitor records`);

    for (const comp of competitors) {
      competitorStats.total++;
      try {
        const scraped = await priceScraper(comp.url);
        if (scraped.price != null) {
          await prisma.scrapedCompetitor.update({
            where: { id: comp.id },
            data: {
              price: scraped.price,
              scrapedAt: new Date(),
              ...(scraped.domain    && { domain: scraped.domain }),
              ...(scraped.pageTitle && { pageTitle: scraped.pageTitle }),
            }
          });
          competitorStats.success++;
        } else {
          competitorStats.failed++;
        }
      } catch (err) {
        competitorStats.failed++;
        console.error(`[DailyPriceScraper] Failed competitor ${comp.id}:`, err.message);
      }
      await delay(DELAY_MS);
    }

    // --- 2. Update ScrapedPrice competitor price fields ---
    const scrapedPrices = (await prisma.scrapedPrice.findMany()).filter(
      sp => sp.competitor1Url || sp.competitor2Url || sp.competitor3Url || sp.competitor4Url
    );
    console.log(`[DailyPriceScraper] Found ${scrapedPrices.length} ScrapedPrice records`);

    for (const sp of scrapedPrices) {
      scrapedPriceStats.total++;
      const updates = {};
      let hasUpdates = false;

      const fields = [
        { url: sp.competitor1Url, priceKey: 'competitor1Price', nameKey: 'competitor1Name' },
        { url: sp.competitor2Url, priceKey: 'competitor2Price', nameKey: 'competitor2Name' },
        { url: sp.competitor3Url, priceKey: 'competitor3Price', nameKey: 'competitor3Name' },
        { url: sp.competitor4Url, priceKey: 'competitor4Price', nameKey: 'competitor4Name' },
      ];

      for (const f of fields) {
        if (!f.url) continue;
        try {
          const scraped = await priceScraper(f.url);
          if (scraped.price != null) {
            updates[f.priceKey] = scraped.price;
            if (scraped.domain) updates[f.nameKey] = scraped.domain;
            hasUpdates = true;
          }
        } catch (err) {
          console.error(`[DailyPriceScraper] Error scraping ${f.url}:`, err.message);
        }
        await delay(DELAY_MS);
      }

      if (hasUpdates) {
        try {
          await prisma.scrapedPrice.update({ where: { id: sp.id }, data: updates });
          scrapedPriceStats.success++;
        } catch (err) {
          scrapedPriceStats.failed++;
        }
      } else {
        scrapedPriceStats.failed++;
      }
    }

    // --- 3. Sync myProductPrice with actual Shopify price (via Shopify Admin REST) ---
    // We look up the session for each shop to get the access token
    for (const sp of scrapedPrices) {
      if (!sp.myProductUrl) continue;
      priceUpdateStats.total++;

      try {
        const handle = sp.myProductUrl.includes('/products/')
          ? sp.myProductUrl.split('/products/')[1]?.split('?')[0]?.split('#')[0]?.trim()
          : sp.myProductUrl.split('?')[0].split('#')[0].trim();

        if (!handle) { priceUpdateStats.failed++; continue; }

        // Get session for shop
        const session = await prisma.session.findFirst({ where: { shop: sp.shop } });
        if (!session?.accessToken) { priceUpdateStats.failed++; continue; }

        const productRes = await fetch(
          `https://${sp.shop}/admin/api/2025-04/products.json?handle=${handle}&fields=id,variants`,
          { headers: { 'X-Shopify-Access-Token': session.accessToken } }
        );
        if (!productRes.ok) { priceUpdateStats.failed++; continue; }

        const productData = await productRes.json();
        const product = productData.products?.[0];
        if (!product?.variants?.length) { priceUpdateStats.failed++; continue; }

        const currentPrice = parseFloat(product.variants[0].price);
        if (isNaN(currentPrice)) { priceUpdateStats.failed++; continue; }

        if (sp.myProductPrice !== currentPrice) {
          await prisma.scrapedPrice.update({ where: { id: sp.id }, data: { myProductPrice: currentPrice } });
        }
        priceUpdateStats.success++;
      } catch (err) {
        priceUpdateStats.failed++;
        console.error(`[DailyPriceScraper] Price sync error for ${sp.id}:`, err.message);
      }
    }

    console.log('[DailyPriceScraper] Complete', { competitorStats, scrapedPriceStats, priceUpdateStats });
    return { competitors: competitorStats, scrapedPrices: scrapedPriceStats, priceUpdates: priceUpdateStats };

  } catch (err) {
    console.error('[DailyPriceScraper] Fatal error:', err);
    throw err;
  }
}
