import prisma from "../db.server.js";

export async function loader({ request }) {
  // CORS headers for external Python scraper
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const records = await prisma.scrapedPrice.findMany({
      where: { competitor2Url: { not: null } },
      select: { competitor2Url: true },
      take: 250,
    });

    const unique = [...new Set(records.map(r => r.competitor2Url).filter(Boolean))].slice(0, 50);

    return new Response(JSON.stringify(unique), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", message: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}
