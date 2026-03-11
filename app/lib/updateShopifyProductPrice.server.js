import prisma from "../db.server.js";

/**
 * Updates a Shopify product variant price.
 * Respects floor price stored in metadata (passed as param).
 * Creates a SalesTracking record on every successful update.
 */
export async function updateShopifyProductPrice({
  variantId,
  price,
  competitorPrice,
  shopDomain,
  accessToken,
  shop,
  floorPrice = null,
  productId = null,
  productTitle = null,
  competitorName = null,
  competitorPriceValue = null,
}) {
  if (!variantId || (!price && !competitorPrice)) {
    return { success: false, error: 'Missing required parameters: variantId and price or competitorPrice' };
  }
  if (!shopDomain || !accessToken) {
    return { success: false, error: 'Missing shopDomain or accessToken' };
  }

  try {
    // Fetch current variant from Shopify
    const variantRes = await fetch(
      `https://${shopDomain}/admin/api/2025-04/variants/${variantId}.json`,
      { headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken } }
    );
    if (!variantRes.ok) {
      return { success: false, error: `Failed to fetch variant: ${variantRes.status} ${variantRes.statusText}` };
    }
    const variantData = await variantRes.json();
    const oldPrice = parseFloat(variantData.variant.price);

    // Determine final price with floor price logic
    const inputPrice = parseFloat(competitorPrice || price);
    if (isNaN(inputPrice)) return { success: false, error: `Invalid price: ${competitorPrice || price}` };

    let finalPrice = inputPrice;
    let usedFloorPrice = false;

    if (floorPrice != null) {
      const floor = parseFloat(floorPrice);
      if (!isNaN(floor)) {
        // Already at floor price - skip
        if (parseFloat(oldPrice.toFixed(2)) === parseFloat(floor.toFixed(2))) {
          return { success: true, variantId, oldPrice, newPrice: oldPrice, priceUnchanged: true, message: 'Already at floor price' };
        }
        if (inputPrice < floor) {
          finalPrice = floor;
          usedFloorPrice = true;
        }
      }
    }

    // Skip if no change
    if (parseFloat(finalPrice.toFixed(2)) === parseFloat(oldPrice.toFixed(2))) {
      return { success: true, variantId, oldPrice, newPrice: finalPrice, priceUnchanged: true, message: 'Price unchanged' };
    }

    // Update price in Shopify
    const updateRes = await fetch(
      `https://${shopDomain}/admin/api/2025-04/variants/${variantId}.json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ variant: { id: variantId, price: finalPrice.toString() } })
      }
    );
    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      return { success: false, error: `Shopify API error: ${updateRes.status}`, responseData: updateData };
    }

    // Determine change type
    let changeType = 'Price Match';
    if (finalPrice < oldPrice) changeType = 'Price Drop';
    if (finalPrice > oldPrice) changeType = 'Price Increase';

    // Persist price history
    await prisma.priceHistory.create({
      data: {
        shop,
        productId: productId || variantData.variant.product_id?.toString(),
        productTitle,
        variantId: variantId.toString(),
        competitorName,
        competitorPrice: competitorPriceValue != null ? parseFloat(competitorPriceValue) : null,
        oldPrice,
        newPrice: finalPrice,
        changeType,
      }
    });

    // Create sales tracking record (30 days window)
    const now = new Date();
    const pastDate = new Date(now); pastDate.setDate(now.getDate() - 30);
    const futureDate = new Date(now); futureDate.setDate(now.getDate() + 30);

    await prisma.salesTracking.create({
      data: {
        shop,
        productId: productId || variantData.variant.product_id?.toString(),
        productTitle,
        oldPrice,
        newPrice: finalPrice,
        beforeStartDate: pastDate,
        beforeEndDate: now,
        afterStartDate: now,
        afterEndDate: futureDate,
        beforeUnitsSold: 0,
        beforeRevenue: 0,
        afterUnitsSold: 0,
        afterRevenue: 0,
        dataCollectionComplete: false,
      }
    });

    return { success: true, variantId, oldPrice, newPrice: finalPrice, usedFloorPrice, changeType, data: updateData };

  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
