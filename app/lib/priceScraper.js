import * as cheerio from 'cheerio';

// Competitor-specific CSS selector configs
const competitorConfigs = {
  'pdhsports.com': {
    name: 'PDH Sports',
    selectors: [
      { selector: '.price' },
      { selector: '.product-price' },
      { selector: '.current-price' },
      { selector: '[data-price]', attribute: 'data-price' },
      { selector: '.price-current' },
      { selector: '.sale-price' }
    ]
  },
  'prodirectsport.com': {
    name: 'ProDirectSport',
    selectors: [
      { selector: '.pdp-price__current' },
      { selector: '.price-current' },
      { selector: '.price__current' },
      { selector: '[data-testid="price-current"]' },
      { selector: '.product-price .price' },
      { selector: '.price-box .price' },
      { selector: '.current-price' },
      { selector: '.sale-price' },
      { selector: '.price' },
      { selector: '[data-price]', attribute: 'data-price' }
    ],
    priceFormat: { currencySymbol: '£' }
  },
  'sportsgalaxy.in': {
    name: 'Sports Galaxy',
    selectors: [
      { selector: '.price' },
      { selector: '.product-price' },
      { selector: '.current-price' }
    ]
  },
  'sportsdirect.com': {
    name: 'Sports Direct',
    selectors: [
      { selector: '.price' },
      { selector: '.product-price' },
      { selector: '.current-price' }
    ]
  },
  'decathlon.co.uk': {
    name: 'Decathlon UK',
    selectors: [
      { selector: '.price' },
      { selector: '.product-price' },
      { selector: '[data-price]', attribute: 'data-price' }
    ]
  },
  'tennisnuts.com': {
    name: 'Tennis Nuts',
    selectors: [
      { selector: 'input[data-price]', attribute: 'data-price' },
      { selector: '[data-selected-price="true"]' },
      { selector: '.price' },
      { selector: '.current-price' },
      { selector: '.sale-price' },
      { selector: '.product-price' }
    ],
    priceFormat: { currencySymbol: '£' }
  },
  'allthingstennis.co.uk': {
    name: 'All Things Tennis',
    selectors: [
      { selector: '.price' },
      { selector: '.product-price' },
      { selector: '.current-price' },
      { selector: '.sale-price' },
      { selector: '[data-price]', attribute: 'data-price' },
      { selector: '.price-current' },
      { selector: '.regular-price' },
      { selector: '.final-price' }
    ],
    priceFormat: { currencySymbol: '£' }
  }
};

const commonPlatformSelectors = {
  shopify: [
    { selector: '.price__current' },
    { selector: '[data-price]', attribute: 'data-price' },
    { selector: '.price-item--regular' }
  ],
  woocommerce: [
    { selector: '.price' },
    { selector: '.woocommerce-Price-amount' },
    { selector: '[data-product-price]' }
  ],
  magento: [
    { selector: '.price-box .price' },
    { selector: '.special-price .price' },
    { selector: '[data-price-type="finalPrice"]' }
  ]
};

export function extractDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function extractCurrency(text) {
  const map = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
  for (const [sym, code] of Object.entries(map)) {
    if (text.includes(sym)) return code;
  }
  for (const code of ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD']) {
    if (text.toUpperCase().includes(code)) return code;
  }
  return undefined;
}

export function extractPriceFromText(text, format) {
  let clean = text.replace(/\s+/g, ' ').trim();
  if (format) {
    const thou = format.thousandsSeparator || ',';
    const dec  = format.decimalSeparator  || '.';
    clean = clean.replace(new RegExp(`\\${thou}`, 'g'), '').replace(new RegExp(`\\${dec}`, 'g'), '.');
  }
  clean = clean.replace(/[^\d.]/g, '');
  const price = parseFloat(clean);
  if (!isNaN(price) && price > 0) {
    let currency = 'GBP';
    if (format?.currencySymbol) {
      const symMap = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
      currency = symMap[format.currencySymbol] || 'GBP';
    } else {
      currency = extractCurrency(text) || 'GBP';
    }
    return { price, currency };
  }
  return {};
}

export function extractPriceFromJsonLd($) {
  const result = {};
  try {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).html();
        if (!raw) return;
        const data = JSON.parse(raw);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product' && item.offers) {
            const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
            for (const offer of offers) {
              if (offer.price) {
                const v = parseFloat(offer.price);
                if (!isNaN(v)) {
                  result.price = v;
                  result.currency = offer.priceCurrency || 'GBP';
                  result.priceText = offer.price.toString();
                  return false;
                }
              }
            }
          }
          if (item.price) {
            const v = parseFloat(item.price);
            if (!isNaN(v)) {
              result.price = v;
              result.currency = item.priceCurrency || 'GBP';
              result.priceText = item.price.toString();
              return false;
            }
          }
        }
      } catch { /* ignore parse errors */ }
    });
  } catch { /* ignore */ }
  return result;
}

export async function priceScraper(url, customSelectors) {
  const result = { success: false, scrapedAt: new Date(), domain: extractDomainFromUrl(url) };

  try {
    let fetchUrl = url;
    if (result.domain?.toLowerCase().includes('tennisnuts.com')) {
      const u = new URL(url);
      u.searchParams.set('currency_code', 'GBP');
      fetchUrl = u.toString();
    }

    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const content = await response.text();
    const $ = cheerio.load(content);
    result.pageTitle = $('title').text().trim();

    // Try JSON-LD first
    const jsonLd = extractPriceFromJsonLd($);
    if (jsonLd.price) {
      result.success = true;
      result.price = jsonLd.price;
      result.currency = jsonLd.currency;
      result.priceText = jsonLd.priceText;
      result.selector = 'JSON-LD';
      return result;
    }

    const domain = result.domain?.toLowerCase() || '';
    const competitorConfig = Object.entries(competitorConfigs).find(([k]) => domain.includes(k))?.[1];

    const platformSelectors = Object.entries(commonPlatformSelectors).find(([platform]) => {
      const sigs = { shopify: ['Shopify.theme', 'shopify-section'], woocommerce: ['woocommerce', 'wp-content'], magento: ['mage-init', 'magento-init'] };
      return sigs[platform]?.some(s => content.includes(s));
    })?.[1] || [];

    const defaultSelectors = [
      { selector: '[data-testid*="price"]' },
      { selector: '.price' },
      { selector: '.product-price' },
      { selector: '.current-price' },
      { selector: '.sale-price' },
      { selector: '.price-current' },
      { selector: '[class*="price"]' },
      { selector: '[id*="price"]' },
      { selector: '.amount' },
      { selector: 'span[data-price]', attribute: 'data-price' },
      { selector: 'meta[property="product:price:amount"]', attribute: 'content' },
      { selector: 'meta[property="og:price:amount"]', attribute: 'content' }
    ];

    const allSelectors = [
      ...(customSelectors || []),
      ...(competitorConfig?.selectors || []),
      ...platformSelectors,
      ...defaultSelectors
    ];

    for (const cfg of allSelectors) {
      const elements = $(cfg.selector);
      if (elements.length > 0) {
        elements.each((_, el) => {
          if (result.success) return false;
          const text = cfg.attribute ? $(el).attr(cfg.attribute) || '' : $(el).text().trim();
          if (text) {
            const pr = extractPriceFromText(text, competitorConfig?.priceFormat);
            if (pr.price) {
              result.success = true;
              result.price = pr.price;
              result.currency = pr.currency;
              result.priceText = text;
              result.selector = cfg.selector;
              return false;
            }
          }
        });
        if (result.success) break;
      }
    }

    if (!result.success) result.errorMessage = 'No price found with any selector';

  } catch (err) {
    result.errorMessage = err instanceof Error ? `Scraping failed: ${err.message}` : 'Unknown scraping error';
  }

  return result;
}
