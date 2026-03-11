/**
 * WL Repricer — Gadget → Local SQLite Migration Script
 *
 * Usage:
 *   node scripts/migrate-from-gadget.js --api-key=YOUR_GADGET_API_KEY
 *
 * How to get your Gadget API key:
 *   1. Go to https://wl-repricer.gadget.app (your Gadget dashboard)
 *   2. Settings → API Keys → Create API key (or copy existing)
 *   3. Run this script with that key
 */

import { PrismaClient } from "@prisma/client";

// ─── Parse CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const apiKeyArg = args.find(a => a.startsWith("--api-key="));
const API_KEY = apiKeyArg ? apiKeyArg.split("=")[1] : process.env.GADGET_API_KEY;

if (!API_KEY) {
  console.error("\n❌  No API key provided.\n");
  console.error("Usage: node scripts/migrate-from-gadget.js --api-key=YOUR_KEY");
  console.error("   or: set GADGET_API_KEY=YOUR_KEY and run the script\n");
  console.error("Get your key: Gadget Dashboard → Settings → API Keys\n");
  process.exit(1);
}

const GADGET_ENDPOINT = "https://wl-repricer--development.gadget.app/api/graphql";
const SHOP_DOMAIN = "stagingracketworlduk.myshopify.com";

const prisma = new PrismaClient();

// ─── GraphQL helper ───────────────────────────────────────────────────────────
async function gql(query, variables = {}) {
  const res = await fetch(GADGET_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  // Log non-fatal errors but don't throw — partial data is still usable
  if (json.errors) {
    const unique = [...new Set(json.errors.map(e => e.message.split(":")[0]))];
    console.warn(`    ⚠️  GraphQL warnings: ${unique.join(", ")}`);
  }
  return json.data;
}

// Paginate through all records of a given model
async function fetchAll(modelKey, query) {
  const all = [];
  let cursor = null;

  while (true) {
    const data = await gql(query, { after: cursor });
    const connection = data[modelKey];
    const edges = connection?.edges || [];
    all.push(...edges.map(e => e.node));

    const pageInfo = connection?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  return all;
}

// ─── Queries ─────────────────────────────────────────────────────────────────
const SCRAPED_PRICE_QUERY = `
  query($after: String) {
    scrapedPrices(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          createdAt
          updatedAt
          myProductUrl
          myProductPrice
          competitor1Name
          competitor1Url
          competitor1Price
          competitor2Name
          competitor2Url
          competitor2Price
          competitor3Name
          competitor3Url
          competitor3Price
          competitor4Name
          competitor4Url
          competitor4Price
        }
      }
    }
  }
`;

const SCRAPED_COMPETITOR_QUERY = `
  query($after: String) {
    scrapedCompetitors(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          createdAt
          updatedAt
          url
          domain
          pageTitle
          price
          scrapedAt
        }
      }
    }
  }
`;

const PRICE_HISTORY_QUERY = `
  query($after: String) {
    priceHistories(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          createdAt
          updatedAt
          competitorName
          competitorPrice
          oldPrice
          newPrice
          changeType
          productId
        }
      }
    }
  }
`;

const SALES_TRACKING_QUERY = `
  query($after: String) {
    salesTrackings(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          createdAt
          updatedAt
          oldPrice
          newPrice
          beforeStartDate
          beforeEndDate
          beforeUnitsSold
          beforeRevenue
          afterStartDate
          afterEndDate
          afterUnitsSold
          afterRevenue
          dataCollectionComplete
          productId
        }
      }
    }
  }
`;

const SHIPPING_COST_QUERY = `
  query($after: String) {
    shippingCosts(first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          createdAt
          updatedAt
          pdhsports
          prodirectsport
          tennisnuts
          allthingstennis
        }
      }
    }
  }
`;

// ─── Migrate functions ────────────────────────────────────────────────────────
async function migrateScrapedPrices() {
  console.log("\n📦  Fetching ScrapedPrices from Gadget…");
  const records = await fetchAll("scrapedPrices", SCRAPED_PRICE_QUERY);
  console.log(`    Found ${records.length} records`);

  let created = 0, failed = 0;
  for (const r of records) {
    const shop = SHOP_DOMAIN;
    try {
      await prisma.scrapedPrice.upsert({
        where: { id: r.id },
        update: {
          shop,
          myProductUrl:     r.myProductUrl    || null,
          myProductPrice:   r.myProductPrice  != null ? parseFloat(r.myProductPrice)  : null,
          competitor1Name:  r.competitor1Name || null,
          competitor1Url:   r.competitor1Url  || null,
          competitor1Price: r.competitor1Price != null ? parseFloat(r.competitor1Price) : null,
          competitor2Name:  r.competitor2Name || null,
          competitor2Url:   r.competitor2Url  || null,
          competitor2Price: r.competitor2Price != null ? parseFloat(r.competitor2Price) : null,
          competitor3Name:  r.competitor3Name || null,
          competitor3Url:   r.competitor3Url  || null,
          competitor3Price: r.competitor3Price != null ? parseFloat(r.competitor3Price) : null,
          competitor4Name:  r.competitor4Name || null,
          competitor4Url:   r.competitor4Url  || null,
          competitor4Price: r.competitor4Price != null ? parseFloat(r.competitor4Price) : null,
          updatedAt:        new Date(r.updatedAt),
        },
        create: {
          id:               r.id,
          shop,
          myProductUrl:     r.myProductUrl    || null,
          myProductPrice:   r.myProductPrice  != null ? parseFloat(r.myProductPrice)  : null,
          competitor1Name:  r.competitor1Name || null,
          competitor1Url:   r.competitor1Url  || null,
          competitor1Price: r.competitor1Price != null ? parseFloat(r.competitor1Price) : null,
          competitor2Name:  r.competitor2Name || null,
          competitor2Url:   r.competitor2Url  || null,
          competitor2Price: r.competitor2Price != null ? parseFloat(r.competitor2Price) : null,
          competitor3Name:  r.competitor3Name || null,
          competitor3Url:   r.competitor3Url  || null,
          competitor3Price: r.competitor3Price != null ? parseFloat(r.competitor3Price) : null,
          competitor4Name:  r.competitor4Name || null,
          competitor4Url:   r.competitor4Url  || null,
          competitor4Price: r.competitor4Price != null ? parseFloat(r.competitor4Price) : null,
          createdAt:        new Date(r.createdAt),
          updatedAt:        new Date(r.updatedAt),
        },
      });
      created++;
    } catch (err) {
      failed++;
      console.error(`    ❌  ScrapedPrice ${r.id}: ${err.message}`);
    }
  }
  if (failed) console.log(`    ⚠️  ${failed} failed`);
  console.log(`    ✅  ${created} upserted`);
}

async function migrateScrapedCompetitors() {
  console.log("\n📦  Fetching ScrapedCompetitors from Gadget…");
  const records = await fetchAll("scrapedCompetitors", SCRAPED_COMPETITOR_QUERY);
  console.log(`    Found ${records.length} records`);

  let created = 0, failed = 0;
  for (const r of records) {
    const shop = SHOP_DOMAIN;
    try {
      await prisma.scrapedCompetitor.upsert({
        where: { id: r.id },
        update: {
          shop,
          url:       r.url || "",
          domain:    r.domain    || null,
          pageTitle: r.pageTitle || null,
          price:     r.price     != null ? parseFloat(r.price) : null,
          scrapedAt: r.scrapedAt ? new Date(r.scrapedAt) : null,
          updatedAt: new Date(r.updatedAt),
        },
        create: {
          id:        r.id,
          shop,
          url:       r.url || "",
          domain:    r.domain    || null,
          pageTitle: r.pageTitle || null,
          price:     r.price     != null ? parseFloat(r.price) : null,
          scrapedAt: r.scrapedAt ? new Date(r.scrapedAt) : null,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        },
      });
      created++;
    } catch (err) {
      failed++;
      console.error(`    ❌  ScrapedCompetitor ${r.id}: ${err.message}`);
    }
  }
  console.log(`    ✅  ${created} upserted, ${failed} failed`);
}

async function migratePriceHistory() {
  console.log("\n📦  Fetching PriceHistory from Gadget…");
  const records = await fetchAll("priceHistories", PRICE_HISTORY_QUERY);
  console.log(`    Found ${records.length} records`);

  let created = 0, failed = 0;
  for (const r of records) {
    const shop = SHOP_DOMAIN;
    try {
      await prisma.priceHistory.upsert({
        where: { id: r.id },
        update: {
          shop,
          productId:      r.productId || null,
          competitorName: r.competitorName || null,
          competitorPrice:r.competitorPrice != null ? parseFloat(r.competitorPrice) : null,
          oldPrice:       r.oldPrice != null ? parseFloat(r.oldPrice) : null,
          newPrice:       r.newPrice != null ? parseFloat(r.newPrice) : null,
          changeType:     r.changeType || null,
          updatedAt:      new Date(r.updatedAt),
        },
        create: {
          id:             r.id,
          shop,
          productId:      r.productId || null,
          competitorName: r.competitorName || null,
          competitorPrice:r.competitorPrice != null ? parseFloat(r.competitorPrice) : null,
          oldPrice:       r.oldPrice != null ? parseFloat(r.oldPrice) : null,
          newPrice:       r.newPrice != null ? parseFloat(r.newPrice) : null,
          changeType:     r.changeType || null,
          createdAt:      new Date(r.createdAt),
          updatedAt:      new Date(r.updatedAt),
        },
      });
      created++;
    } catch (err) {
      failed++;
      console.error(`    ❌  PriceHistory ${r.id}: ${err.message}`);
    }
  }
  console.log(`    ✅  ${created} upserted, ${failed} failed`);
}

async function migrateSalesTracking() {
  console.log("\n📦  Fetching SalesTracking from Gadget…");
  const records = await fetchAll("salesTrackings", SALES_TRACKING_QUERY);
  console.log(`    Found ${records.length} records`);

  let created = 0, failed = 0;
  for (const r of records) {
    const shop = SHOP_DOMAIN;
    try {
      await prisma.salesTracking.upsert({
        where: { id: r.id },
        update: {
          shop,
          productId:             r.productId || null,
          oldPrice:              r.oldPrice  != null ? parseFloat(r.oldPrice)  : null,
          newPrice:              r.newPrice  != null ? parseFloat(r.newPrice)  : null,
          beforeStartDate:       r.beforeStartDate ? new Date(r.beforeStartDate) : null,
          beforeEndDate:         r.beforeEndDate   ? new Date(r.beforeEndDate)   : null,
          beforeUnitsSold:       r.beforeUnitsSold  || 0,
          beforeRevenue:         r.beforeRevenue    != null ? parseFloat(r.beforeRevenue)  : 0,
          afterStartDate:        r.afterStartDate  ? new Date(r.afterStartDate)  : null,
          afterEndDate:          r.afterEndDate    ? new Date(r.afterEndDate)    : null,
          afterUnitsSold:        r.afterUnitsSold   || 0,
          afterRevenue:          r.afterRevenue     != null ? parseFloat(r.afterRevenue)   : 0,
          dataCollectionComplete:r.dataCollectionComplete || false,
          updatedAt:             new Date(r.updatedAt),
        },
        create: {
          id:                    r.id,
          shop,
          productId:             r.productId || null,
          oldPrice:              r.oldPrice  != null ? parseFloat(r.oldPrice)  : null,
          newPrice:              r.newPrice  != null ? parseFloat(r.newPrice)  : null,
          beforeStartDate:       r.beforeStartDate ? new Date(r.beforeStartDate) : null,
          beforeEndDate:         r.beforeEndDate   ? new Date(r.beforeEndDate)   : null,
          beforeUnitsSold:       r.beforeUnitsSold  || 0,
          beforeRevenue:         r.beforeRevenue    != null ? parseFloat(r.beforeRevenue)  : 0,
          afterStartDate:        r.afterStartDate  ? new Date(r.afterStartDate)  : null,
          afterEndDate:          r.afterEndDate    ? new Date(r.afterEndDate)    : null,
          afterUnitsSold:        r.afterUnitsSold   || 0,
          afterRevenue:          r.afterRevenue     != null ? parseFloat(r.afterRevenue)   : 0,
          dataCollectionComplete:r.dataCollectionComplete || false,
          createdAt:             new Date(r.createdAt),
          updatedAt:             new Date(r.updatedAt),
        },
      });
      created++;
    } catch (err) {
      failed++;
      console.error(`    ❌  SalesTracking ${r.id}: ${err.message}`);
    }
  }
  console.log(`    ✅  ${created} upserted, ${failed} failed`);
}

async function migrateShippingCosts() {
  console.log("\n📦  Fetching ShippingCosts from Gadget…");
  const records = await fetchAll("shippingCosts", SHIPPING_COST_QUERY);
  console.log(`    Found ${records.length} records`);

  let created = 0, failed = 0;
  for (const r of records) {
    const shop = SHOP_DOMAIN;
    try {
      await prisma.shippingCost.upsert({
        where: { id: r.id },
        update: {
          shop,
          pdhsports:       r.pdhsports       != null ? parseFloat(r.pdhsports)       : null,
          prodirectsport:  r.prodirectsport   != null ? parseFloat(r.prodirectsport)  : null,
          tennisnuts:      r.tennisnuts       != null ? parseFloat(r.tennisnuts)      : null,
          allthingstennis: r.allthingstennis  != null ? parseFloat(r.allthingstennis) : null,
          updatedAt:       new Date(r.updatedAt),
        },
        create: {
          id:              r.id,
          shop,
          pdhsports:       r.pdhsports       != null ? parseFloat(r.pdhsports)       : null,
          prodirectsport:  r.prodirectsport   != null ? parseFloat(r.prodirectsport)  : null,
          tennisnuts:      r.tennisnuts       != null ? parseFloat(r.tennisnuts)      : null,
          allthingstennis: r.allthingstennis  != null ? parseFloat(r.allthingstennis) : null,
          createdAt:       new Date(r.createdAt),
          updatedAt:       new Date(r.updatedAt),
        },
      });
      created++;
    } catch (err) {
      failed++;
      console.error(`    ❌  ShippingCost ${r.id}: ${err.message}`);
    }
  }
  console.log(`    ✅  ${created} upserted, ${failed} failed`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🚀  WL Repricer — Gadget → SQLite Migration");
  console.log("=".repeat(50));
  console.log(`   Gadget endpoint: ${GADGET_ENDPOINT}`);
  console.log(`   API key: ${API_KEY.substring(0, 8)}…`);

  // Test connection
  try {
    await gql(`query { gadgetMeta { name } }`);
    console.log("   ✅  Gadget API connection OK\n");
  } catch (err) {
    console.error(`\n❌  Cannot connect to Gadget API: ${err.message}`);
    console.error("    Check your API key and that the Gadget app is running.\n");
    process.exit(1);
  }

  const start = Date.now();

  await migrateScrapedPrices();
  await migrateScrapedCompetitors();
  await migratePriceHistory();
  await migrateSalesTracking();
  await migrateShippingCosts();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅  Migration complete in ${elapsed}s`);
  console.log("=".repeat(50));
  console.log("   Your local app now has all Gadget data.\n");
}

main()
  .catch(err => { console.error("\n❌  Fatal error:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
