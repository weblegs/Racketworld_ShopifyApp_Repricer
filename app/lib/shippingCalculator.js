const COMPETITOR_CONFIGS = [
  { name: 'pdh sports',       dbField: 'pdhsports',       fallbackCost: 4.99, freeShippingThreshold: 40 },
  { name: 'pdhsports',        dbField: 'pdhsports',       fallbackCost: 4.99, freeShippingThreshold: 40 },
  { name: 'prodirect sport',  dbField: 'prodirectsport',  fallbackCost: 3.99 },
  { name: 'prodirectsport',   dbField: 'prodirectsport',  fallbackCost: 3.99 },
  { name: 'tennis nuts',      dbField: 'tennisnuts',      fallbackCost: 4.99, freeShippingThreshold: 50 },
  { name: 'tennisnuts',       dbField: 'tennisnuts',      fallbackCost: 4.99, freeShippingThreshold: 50 },
  { name: 'all things tennis',dbField: 'allthingstennis', fallbackCost: 4.99, freeShippingThreshold: 50 },
  { name: 'allthingstennis',  dbField: 'allthingstennis', fallbackCost: 4.99, freeShippingThreshold: 50 }
];

export function calculateShippingCost(competitorName, productPrice, storedShippingCosts) {
  if (!competitorName?.trim()) throw new Error('Competitor name must be a non-empty string');
  if (typeof productPrice !== 'number' || productPrice < 0) throw new Error('Product price must be a non-negative number');

  const norm = competitorName.toLowerCase().trim();
  const config = COMPETITOR_CONFIGS.find(c => c.name === norm);

  if (!config) {
    return { shippingCost: 0, isFreeShipping: false, reason: `Unknown competitor: ${competitorName}` };
  }

  const storedCost = storedShippingCosts?.[config.dbField];
  const baseCost = (storedCost != null && !isNaN(storedCost)) ? storedCost : config.fallbackCost;

  if (config.freeShippingThreshold && productPrice >= config.freeShippingThreshold) {
    return {
      shippingCost: 0,
      isFreeShipping: true,
      reason: `Free shipping for ${competitorName} on orders £${config.freeShippingThreshold}+`
    };
  }

  const usingFallback = storedCost == null || isNaN(storedCost);
  return {
    shippingCost: baseCost,
    isFreeShipping: false,
    reason: usingFallback ? `Using fallback shipping cost for ${competitorName}` : `Using stored shipping cost for ${competitorName}`
  };
}

export function getSupportedCompetitors() {
  return [...new Set(COMPETITOR_CONFIGS.map(c => c.name))];
}

export function getFreeShippingThreshold(competitorName) {
  const config = COMPETITOR_CONFIGS.find(c => c.name === competitorName.toLowerCase().trim());
  return config?.freeShippingThreshold ?? null;
}
