/**
 * Transfer data from local SQLite → Railway PostgreSQL
 * Usage: node scripts/transfer-to-postgres.js
 * Requires: DATABASE_URL env var pointing to Railway PostgreSQL
 */

import { PrismaClient as PgClient } from "@prisma/client";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = path.join(__dirname, "../prisma/dev.sqlite");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  console.error("   Set it to your Railway PostgreSQL connection URL");
  process.exit(1);
}

const pg = new PgClient();
const sqlite = new Database(SQLITE_PATH);

async function transfer() {
  console.log("🔌 Connecting to PostgreSQL...");
  await pg.$connect();
  console.log("✅ Connected\n");

  // ── ScrapedPrice ──────────────────────────────────────────────────────
  const scrapedPrices = sqlite.prepare("SELECT * FROM ScrapedPrice").all();
  console.log(`📦 Transferring ${scrapedPrices.length} ScrapedPrice records...`);
  let count = 0;
  for (const r of scrapedPrices) {
    await pg.scrapedPrice.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id:               r.id,
        shop:             r.shop,
        myProductUrl:     r.myProductUrl    || null,
        myProductPrice:   r.myProductPrice  != null ? Number(r.myProductPrice)  : null,
        competitor1Name:  r.competitor1Name  || null,
        competitor1Url:   r.competitor1Url   || null,
        competitor1Price: r.competitor1Price != null ? Number(r.competitor1Price) : null,
        competitor2Name:  r.competitor2Name  || null,
        competitor2Url:   r.competitor2Url   || null,
        competitor2Price: r.competitor2Price != null ? Number(r.competitor2Price) : null,
        competitor3Name:  r.competitor3Name  || null,
        competitor3Url:   r.competitor3Url   || null,
        competitor3Price: r.competitor3Price != null ? Number(r.competitor3Price) : null,
        competitor4Name:  r.competitor4Name  || null,
        competitor4Url:   r.competitor4Url   || null,
        competitor4Price: r.competitor4Price != null ? Number(r.competitor4Price) : null,
        createdAt:        new Date(r.createdAt),
        updatedAt:        new Date(r.updatedAt),
      },
    });
    count++;
  }
  console.log(`   ✅ ${count} ScrapedPrice records done\n`);

  // ── ScrapedCompetitor ─────────────────────────────────────────────────
  const competitors = sqlite.prepare("SELECT * FROM ScrapedCompetitor").all();
  console.log(`📦 Transferring ${competitors.length} ScrapedCompetitor records...`);
  count = 0;
  for (const r of competitors) {
    await pg.scrapedCompetitor.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id:        r.id,
        shop:      r.shop,
        url:       r.url,
        domain:    r.domain    || null,
        pageTitle: r.pageTitle || null,
        price:     r.price     != null ? Number(r.price) : null,
        scrapedAt: r.scrapedAt ? new Date(r.scrapedAt) : null,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      },
    });
    count++;
  }
  console.log(`   ✅ ${count} ScrapedCompetitor records done\n`);

  // ── PriceHistory ──────────────────────────────────────────────────────
  const history = sqlite.prepare("SELECT * FROM PriceHistory").all();
  console.log(`📦 Transferring ${history.length} PriceHistory records...`);
  count = 0;
  for (const r of history) {
    await pg.priceHistory.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id:              r.id,
        shop:            r.shop,
        productId:       r.productId       || null,
        productTitle:    r.productTitle    || null,
        competitorName:  r.competitorName  || null,
        competitorPrice: r.competitorPrice != null ? Number(r.competitorPrice) : null,
        oldPrice:        r.oldPrice        != null ? Number(r.oldPrice)        : null,
        newPrice:        r.newPrice        != null ? Number(r.newPrice)        : null,
        changeType:      r.changeType      || null,
        variantId:       r.variantId       || null,
        createdAt:       new Date(r.createdAt),
        updatedAt:       new Date(r.updatedAt),
      },
    });
    count++;
  }
  console.log(`   ✅ ${count} PriceHistory records done\n`);

  // ── SalesTracking ─────────────────────────────────────────────────────
  const sales = sqlite.prepare("SELECT * FROM SalesTracking").all();
  console.log(`📦 Transferring ${sales.length} SalesTracking records...`);
  count = 0;
  for (const r of sales) {
    await pg.salesTracking.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id:                    r.id,
        shop:                  r.shop,
        productId:             r.productId      || null,
        productTitle:          r.productTitle   || null,
        oldPrice:              r.oldPrice       != null ? Number(r.oldPrice)       : null,
        newPrice:              r.newPrice       != null ? Number(r.newPrice)       : null,
        beforeStartDate:       r.beforeStartDate ? new Date(r.beforeStartDate) : null,
        beforeEndDate:         r.beforeEndDate   ? new Date(r.beforeEndDate)   : null,
        beforeUnitsSold:       r.beforeUnitsSold != null ? Number(r.beforeUnitsSold) : 0,
        beforeRevenue:         r.beforeRevenue   != null ? Number(r.beforeRevenue)   : 0,
        afterStartDate:        r.afterStartDate  ? new Date(r.afterStartDate)  : null,
        afterEndDate:          r.afterEndDate    ? new Date(r.afterEndDate)    : null,
        afterUnitsSold:        r.afterUnitsSold  != null ? Number(r.afterUnitsSold)  : 0,
        afterRevenue:          r.afterRevenue    != null ? Number(r.afterRevenue)    : 0,
        dataCollectionComplete: r.dataCollectionComplete === 1,
        createdAt:             new Date(r.createdAt),
        updatedAt:             new Date(r.updatedAt),
      },
    });
    count++;
  }
  console.log(`   ✅ ${count} SalesTracking records done\n`);

  // ── ShippingCost ──────────────────────────────────────────────────────
  const shipping = sqlite.prepare("SELECT * FROM ShippingCost").all();
  console.log(`📦 Transferring ${shipping.length} ShippingCost records...`);
  count = 0;
  for (const r of shipping) {
    await pg.shippingCost.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id:              r.id,
        shop:            r.shop,
        pdhsports:       r.pdhsports       != null ? Number(r.pdhsports)       : null,
        prodirectsport:  r.prodirectsport  != null ? Number(r.prodirectsport)  : null,
        tennisnuts:      r.tennisnuts      != null ? Number(r.tennisnuts)      : null,
        allthingstennis: r.allthingstennis != null ? Number(r.allthingstennis) : null,
        createdAt:       new Date(r.createdAt),
        updatedAt:       new Date(r.updatedAt),
      },
    });
    count++;
  }
  console.log(`   ✅ ${count} ShippingCost records done\n`);

  await pg.$disconnect();
  sqlite.close();
  console.log("🎉 All data transferred successfully!");
}

transfer().catch(err => {
  console.error("❌ Transfer failed:", err.message);
  process.exit(1);
});
