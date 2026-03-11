import prisma from "../db.server.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { url, title, price } = body;

    if (!url || !title || price == null) {
      return new Response(
        JSON.stringify({ success: false, message: "url, title, and price are required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Find the first available shop session
    const session = await prisma.session.findFirst({ select: { shop: true } });
    const shop = session?.shop || "unknown";

    // Try to find an existing record by competitor2Url
    const existing = await prisma.scrapedPrice.findFirst({
      where: { competitor2Url: url, shop }
    });

    let record;
    let isUpdate = false;

    if (existing) {
      record = await prisma.scrapedPrice.update({
        where: { id: existing.id },
        data: { competitor2Price: parseFloat(price) }
      });
      isUpdate = true;
    } else {
      record = await prisma.scrapedPrice.create({
        data: {
          shop,
          myProductUrl: url,
          myProductPrice: parseFloat(price),
          competitor1Name: "Unknown Competitor",
          competitor1Url: url,
          competitor1Price: parseFloat(price),
        }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: isUpdate ? "Updated successfully" : "Created successfully",
        operation: isUpdate ? "update" : "create",
        recordId: record.id,
      }),
      { status: isUpdate ? 200 : 201, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: "Failed to save scraped price data", error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
