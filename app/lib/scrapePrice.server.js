import prisma from "../db.server.js";
import { priceScraper } from "./priceScraper.js";

function extractDomain(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return 'invalid-url'; }
}

const COMPETITOR_DOMAINS = {
  competitor1: { domains: ['pdhsports', 'pdh.co.uk', 'pdhsports.com'] },
  competitor2: { domains: ['prodirectsport', 'prodirectsport.com'] },
  competitor3: { domains: ['tennisnuts', 'tennisnuts.com'] },
  competitor4: { domains: ['allthingstennis', 'allthingstennis.co.uk'] },
};

function matchDomain(result, domains) {
  const rd = extractDomain(result.url || '');
  const rn = (result.name || '').toLowerCase();
  return domains.some(d => {
    const nd = d.toLowerCase();
    return rd.includes(nd) || nd.includes(rd) || rn.includes(nd) || nd.includes(rn);
  });
}

/**
 * Scrape competitor prices, save ScrapedPrice + ScrapedCompetitor records.
 */
export async function scrapePrice({ competitorUrls, myProductUrl, myProductPrice, shop }) {
  if (!Array.isArray(competitorUrls) || !myProductUrl || !myProductPrice) {
    throw new Error('competitorUrls array, myProductUrl and myProductPrice are required');
  }

  const results = [];
  const competitors = [];

  for (let i = 0; i < competitorUrls.length; i++) {
    const competitor = competitorUrls[i];
    if (!competitor?.url?.trim()) {
      results.push({ name: competitor?.name || 'unknown', price: null, success: false, url: competitor?.url, domain: 'invalid' });
      continue;
    }

    try {
      const domain = extractDomain(competitor.url);
      const scraped = await priceScraper(competitor.url);

      results.push({
        name: competitor.name,
        price: scraped.price,
        success: scraped.success,
        url: competitor.url,
        domain: scraped.domain || domain,
        originalIndex: i
      });

      if (scraped.success) {
        const rec = await prisma.scrapedCompetitor.create({
          data: {
            shop,
            url: competitor.url,
            domain: scraped.domain || domain,
            pageTitle: scraped.pageTitle || null,
            price: scraped.price || null,
            scrapedAt: new Date(),
          }
        });
        competitors.push(rec);
      }
    } catch (err) {
      results.push({ name: competitor.name, price: null, success: false, url: competitor.url, domain: extractDomain(competitor.url) });
    }

    // Polite delay between requests
    await new Promise(r => setTimeout(r, 800));
  }

  // Build scrapedPrice record
  const spData = { shop, myProductUrl, myProductPrice };
  const matched = new Set();

  for (const [key, { domains }] of Object.entries(COMPETITOR_DOMAINS)) {
    let match = null;
    for (let i = 0; i < results.length; i++) {
      if (matched.has(i)) continue;
      if (matchDomain(results[i], domains)) { match = results[i]; matched.add(i); break; }
    }
    const idx = key.replace('competitor', '');
    spData[`competitor${idx}Name`]  = match?.name || domains[0];
    spData[`competitor${idx}Price`] = match?.success && match.price != null ? Math.round(match.price * 100) / 100 : null;
    spData[`competitor${idx}Url`]   = match?.url || null;
  }

  const scrapedPriceRecord = await prisma.scrapedPrice.create({ data: spData });

  return {
    success: true,
    scrapedPriceId: scrapedPriceRecord.id,
    competitors: competitors.map(c => ({ id: c.id, domain: c.domain, price: c.price })),
    scrapingResults: results.map(r => ({ name: r.name, domain: r.domain, success: r.success, price: r.price }))
  };
}
