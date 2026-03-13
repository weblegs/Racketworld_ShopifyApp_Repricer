# PriceSync Pro — App Overview

## What Does This App Do?

**PriceSync Pro** is a Shopify embedded app that automatically monitors competitor prices and updates your product prices accordingly. It runs inside your Shopify Admin panel and works in the background without any manual effort.

### Core Workflow
1. You add products you want to monitor along with competitor URLs
2. The app scrapes competitor prices 3 times a day (9am, 1pm, 6pm UK time)
3. It compares competitor prices to your current prices
4. It updates your Shopify product prices automatically

---

## Competitors Being Monitored

| Competitor | Website |
|-----------|---------|
| PDH Sports | pdhsports.com |
| ProDirect Sport | prodirectsport.com |
| Tennis Nuts | tennisnuts.com |
| All Things Tennis | allthingstennis.co.uk |

---

## Dashboard Tabs

### 1. Dashboard
- Summary stats: total products monitored, how many are lowest price, how many need attention
- Recent price changes list
- Sales revenue overview (All Time, Last 7 Days, Last 15 Days)

### 2. Price Comparison
- Table of all monitored products
- Shows your price vs each competitor's price
- Highlights when you are the lowest
- Optional shipping cost toggle to compare true final prices
- Manual "Update Price" button per product

### 3. Competitor Sites
- Add new products to monitor
- Enter up to 4 competitor URLs per product
- Bulk import/export via CSV
- Manual scrape trigger for testing

### 4. Price History
- Full audit log of every price change ever made
- Shows old price → new price, date/time, and reason

### 5. Settings
- Configure shipping costs per competitor
- Set floor prices (minimum price — app will never go below this)
- Manually trigger the scraper for testing

---

## Automated Scraping Schedule

The app runs automatically at these times every day (UK time):

| Time | Action |
|------|--------|
| 9:00 AM | Scrape all competitor prices, update Shopify prices |
| 1:00 PM | Scrape all competitor prices, update Shopify prices |
| 6:00 PM | Scrape all competitor prices, update Shopify prices |

No manual action is needed — this runs in the background on the server.

---

## Floor Price Protection

Every product can have a **floor price** set. This is the minimum price the app will ever set — even if a competitor is cheaper, the app will not go below this amount. This protects profit margins.

---

## Shipping Cost Logic

Each competitor has a configured shipping cost. When the "Include Shipping" toggle is on in Price Comparison, the app adds the shipping cost to each competitor's price so you can see the true cost to the customer — not just the product price.

---

## Tech Stack (For Developers)

| Component | Technology |
|----------|-----------|
| Framework | React Router v7 (Node.js) |
| Database | PostgreSQL (hosted on Railway) |
| ORM | Prisma |
| Shopify Integration | Shopify Admin GraphQL + REST API |
| Web Scraping | Cheerio.js (HTML parsing) |
| Scheduling | node-cron |
| UI | Shopify Polaris |
| Hosting | Railway |
| Version Control | GitHub |

---

## Database Tables

| Table | What It Stores |
|-------|---------------|
| Session | Shopify OAuth tokens |
| ScrapedPrice | Competitor prices per product |
| ScrapedCompetitor | Individual scraped URLs and their prices |
| PriceHistory | Log of every price change |
| SalesTracking | Sales data before/after price changes |
| ShippingCost | Shipping costs per competitor |

---

## Key Files (For Developers)

```
app/
├── lib/
│   ├── scheduler.server.js              — Cron job setup (9am/1pm/6pm)
│   ├── dailyPriceScraper.server.js      — Main scraper orchestration
│   ├── priceScraper.js                  — Cheerio scraping logic per competitor
│   ├── updateShopifyProductPrice.server.js — Pushes price updates to Shopify
│   └── shippingCalculator.js            — Shipping cost per competitor
├── routes/
│   ├── app._index.jsx                   — Main dashboard (all 5 tabs)
│   ├── api.get-urls-to-scrape.js        — API: fetch URLs for external scraper
│   └── api.save-scraped-price.js        — API: receive scraped prices
prisma/
│   └── schema.prisma                    — Database models
shopify.app.toml                         — Shopify app config (scopes, URLs)
```

---

## Shopify Permissions Required

| Permission | Reason |
|-----------|--------|
| `write_products` | Update product variant prices |
| `read_orders` | Calculate sales revenue stats |

---

## Hosting & Deployment

- **App URL:** `https://racketworldshopifyapprepricer-production.up.railway.app`
- **Database:** PostgreSQL on Railway
- **Deploy:** Push to `main` branch on GitHub → Railway auto-deploys
- **Store:** `stagingracketworlduk.myshopify.com`
