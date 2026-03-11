import { useState, useCallback } from "react";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { Page, Card, Modal, TextField, Banner, Text, Button, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";
import { scrapePrice } from "../lib/scrapePrice.server.js";
import { updateShopifyProductPrice } from "../lib/updateShopifyProductPrice.server.js";
import { runDailyPriceScraper } from "../lib/dailyPriceScraper.server.js";
import { SalesDashboardCharts } from "../components/SalesDashboardCharts.jsx";
import appCssUrl from "../styles/app.css?url";

export const links = () => [{ rel: "stylesheet", href: appCssUrl }];

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const [scrapedPrices, priceHistory, shippingCosts, salesTracking] = await Promise.all([
    prisma.scrapedPrice.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.priceHistory.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.shippingCost.findFirst({ where: { shop } }),
    prisma.salesTracking.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  let products = [];
  try {
    let hasNextPage = true;
    let cursor = null;
    while (hasNextPage) {
      const res = await admin.graphql(`
        query($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id title handle vendor
                images(first: 1) { edges { node { url } } }
                variants(first: 1) {
                  edges {
                    node {
                      id price sku
                      metafield(namespace: "custom", key: "floor_price") { value }
                    }
                  }
                }
              }
            }
          }
        }
      `, { variables: { cursor } });
      const data = await res.json();
      const page = data.data?.products;
      products = products.concat(page?.edges?.map(e => e.node) || []);
      hasNextPage = page?.pageInfo?.hasNextPage || false;
      cursor = page?.pageInfo?.endCursor || null;
    }
  } catch (err) {
    console.error("Error fetching products:", err);
  }

  return { shop, shopDomain: shop, scrapedPrices, priceHistory, shippingCosts: shippingCosts || null, salesTracking, products };
}

// ─── Action ───────────────────────────────────────────────────────────────────
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const accessToken = session.accessToken;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "scrape") {
    const competitorUrls = JSON.parse(formData.get("competitorUrls") || "[]");
    const myProductUrl   = formData.get("myProductUrl");
    const myProductPrice = parseFloat(formData.get("myProductPrice") || "0");
    try {
      const result = await scrapePrice({ competitorUrls, myProductUrl, myProductPrice, shop });
      return { success: true, action: "scrape", result };
    } catch (err) {
      return { success: false, action: "scrape", error: err.message };
    }
  }

  if (intent === "updatePrice") {
    const result = await updateShopifyProductPrice({
      variantId:            formData.get("variantId"),
      price:                formData.get("price"),
      shopDomain:           shop,
      accessToken,
      shop,
      floorPrice:           formData.get("floorPrice") || null,
      productId:            formData.get("productId"),
      productTitle:         formData.get("productTitle"),
      competitorName:       formData.get("competitorName"),
      competitorPriceValue: formData.get("competitorPrice"),
    });
    // Keep stored price in sync so display doesn't show stale value
    const spId = formData.get("spId");
    const newPrice = parseFloat(formData.get("price"));
    if (result.success && spId && !isNaN(newPrice)) {
      await prisma.scrapedPrice.update({ where: { id: spId }, data: { myProductPrice: newPrice } });
    }
    return { success: result.success, action: "updatePrice", result };
  }

  if (intent === "deleteScrapedPrice") {
    await prisma.scrapedPrice.delete({ where: { id: formData.get("id") } });
    return { success: true, action: "deleteScrapedPrice" };
  }

  if (intent === "updateScrapedPrice") {
    const data = JSON.parse(formData.get("data") || "{}");
    await prisma.scrapedPrice.update({ where: { id: formData.get("id") }, data });
    return { success: true, action: "updateScrapedPrice" };
  }

  if (intent === "saveShipping") {
    const data = JSON.parse(formData.get("data") || "{}");
    const existing = await prisma.shippingCost.findFirst({ where: { shop } });
    if (existing) {
      await prisma.shippingCost.update({ where: { id: existing.id }, data: { ...data, shop } });
    } else {
      await prisma.shippingCost.create({ data: { ...data, shop } });
    }
    return { success: true, action: "saveShipping" };
  }

  if (intent === "runScraper") {
    try {
      const stats = await runDailyPriceScraper();
      return { success: true, action: "runScraper", stats };
    } catch (err) {
      return { success: false, action: "runScraper", error: err.message };
    }
  }

  if (intent === "importCSV") {
    const rows = JSON.parse(formData.get("rows") || "[]");
    const results = [];
    for (const row of rows) {
      try {
        await scrapePrice({ competitorUrls: row.competitors, myProductUrl: row.productUrl, myProductPrice: row.price || 0, shop });
        results.push({ productUrl: row.productUrl, status: "success" });
      } catch (err) {
        results.push({ productUrl: row.productUrl, status: "failed", error: err.message });
      }
    }
    return { success: true, action: "importCSV", results };
  }

  return { success: false, error: "Unknown intent" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractHandle(url) {
  try {
    const p = new URL(url).pathname.split("/products/");
    return p.length > 1 ? p[1].split("?")[0] : null;
  } catch { return null; }
}

// Convert URL handle to readable title: "adidas-metalbone-padel-racket-2026" → "Adidas Metalbone Padel Racket 2026"
function handleToTitle(handle) {
  if (!handle) return "Unknown";
  return handle.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function fmt(v) { return v == null ? null : `£${parseFloat(v).toFixed(2)}`; }

function ToggleSwitch({ checked, onChange, disabled = false }) {
  return (
    <label className={`switch${disabled ? " disabled" : ""}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
      <span className="slider" />
    </label>
  );
}

function ProductImg({ src, alt, size = 70 }) {
  const [err, setErr] = useState(false);
  const valid = src && !err && src.startsWith("http");
  return (
    <div className="pid-prod-img" style={{ width: size, height: size }}>
      {valid
        ? <img src={src} alt={alt} onError={() => setErr(true)} />
        : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3-3a2 2 0 0 0-3 0L6 21"/></svg>
      }
    </div>
  );
}

const CSV_TEMPLATE = [
  ["Product URL","Competitor 1 Name","Competitor 1 URL","Competitor 2 Name","Competitor 2 URL","Competitor 3 Name","Competitor 3 URL","Competitor 4 Name","Competitor 4 URL"],
  ["https://your-store.myshopify.com/products/handle","pdhsports","https://pdhsports.com/products/example","prodirectsport","https://www.prodirectsport.com/p/example/","tennisnuts","https://www.tennisnuts.com/shop/example.html","allthingstennis","https://allthingstennis.co.uk/products/example"],
];

function downloadCSV(data, name) {
  const csv = data.map(r => r.map(f => String(f).includes(",") ? `"${f}"` : f).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name; a.click();
}

const COMPETITOR_FIELDS = [
  { key: "pdhsports",       label: "pdhsports UK Product URL",        ph: "https://pdhsports.com/products/…" },
  { key: "prodirectsport",  label: "prodirectsport UK Product URL",   ph: "https://www.prodirectsport.com/p/…" },
  { key: "tennisnuts",      label: "tennisnuts Product URL",          ph: "https://www.tennisnuts.com/shop/…" },
  { key: "allthingstennis", label: "allthingstennis Product URL",     ph: "https://allthingstennis.co.uk/products/…" },
];

const EMPTY_URLS = { pdhsports: "", prodirectsport: "", tennisnuts: "", allthingstennis: "" };

// Icons
const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IndexPage() {
  const { scrapedPrices, priceHistory, shippingCosts: initShipping, salesTracking, products, shopDomain } = useLoaderData();

  const submit = useSubmit();
  const nav    = useNavigation();
  const busy   = nav.state === "submitting";

  const [tab, setTab]               = useState(0);
  const [searchQ, setSearchQ]       = useState("");
  const [includeShipping, setIncludeShipping] = useState(false);

  // Add modal
  const [addOpen, setAddOpen]       = useState(false);
  const [selProd, setSelProd]       = useState(null);
  const [prodQ, setProdQ]           = useState("");
  const [showDrop, setShowDrop]     = useState(false);
  const [addUrls, setAddUrls]       = useState(EMPTY_URLS);
  const [adding, setAdding]         = useState(false);

  // Edit / Delete / Import
  const [editOpen, setEditOpen]     = useState(false);
  const [editRec, setEditRec]       = useState(null);
  const [editUrls, setEditUrls]     = useState(EMPTY_URLS);
  const [delOpen, setDelOpen]       = useState(false);
  const [delRec, setDelRec]         = useState(null);
  const [impOpen, setImpOpen]       = useState(false);
  const [impFile, setImpFile]       = useState(null);
  const [impStatus, setImpStatus]   = useState("");
  const [impBusy, setImpBusy]       = useState(false);

  // Shipping settings
  const [ship, setShip] = useState({
    pdhsports:       { enabled: true,  price: initShipping?.pdhsports?.toString()       || "4.99" },
    prodirectsport:  { enabled: true,  price: initShipping?.prodirectsport?.toString()  || "3.99" },
    tennisnuts:      { enabled: true,  price: initShipping?.tennisnuts?.toString()      || "4.99" },
    allthingstennis: { enabled: false, price: initShipping?.allthingstennis?.toString() || "4.99" },
  });

  const TABS = ["Dashboard", "Price Comparison", "Competitor Sites", "Price History", "Settings"];

  // Shipping cost lookup
  const getShipping = (competitorKey) => {
    if (!includeShipping) return 0;
    const s = ship[competitorKey];
    return s?.enabled ? (parseFloat(s.price) || 0) : 0;
  };

  const COMP_KEYS = ["pdhsports", "prodirectsport", "tennisnuts", "allthingstennis"];

  // Get competitor price + shipping for a scraped price record
  const getCompPrices = (sp) => [
    { key: "pdhsports",       name: "Allthingstennis", label: "Pdhsports",      price: sp.competitor1Price, url: sp.competitor1Url },
    { key: "prodirectsport",  name: "Prodirectsport",  label: "Prodirectsport", price: sp.competitor2Price, url: sp.competitor2Url },
    { key: "tennisnuts",      name: "Tennisnuts",      label: "Tennisnuts",     price: sp.competitor3Price, url: sp.competitor3Url },
    { key: "allthingstennis", name: "Allthingstennis", label: "Allthingstennis",price: sp.competitor4Price, url: sp.competitor4Url },
  ].map(c => ({
    ...c,
    displayPrice: c.price != null ? c.price + getShipping(c.key) : null,
  }));

  // Filtered products for search
  const filteredPrices = scrapedPrices.filter(sp => {
    if (!searchQ) return true;
    const handle = extractHandle(sp.myProductUrl) || "";
    const prod = products.find(p => p.handle === handle);
    const title = prod?.title || handle;
    return title.toLowerCase().includes(searchQ.toLowerCase());
  });

  const filteredProds = products.filter(p =>
    !prodQ || p.title?.toLowerCase().includes(prodQ.toLowerCase())
  );

  // ── Handlers ──
  const handleUpdatePrice = useCallback((sp) => {
    const handle = extractHandle(sp.myProductUrl);
    const prod   = handle ? products.find(p => p.handle === handle) : null;
    const v      = prod?.variants?.edges?.[0]?.node;
    if (!v) { shopify.toast.show("Variant not found", { isError: true }); return; }
    const comps = getCompPrices(sp).filter(c => c.displayPrice != null);
    const lowest = comps.sort((a,b) => a.displayPrice - b.displayPrice)[0];
    if (!lowest) { shopify.toast.show("No competitor prices available", { isError: true }); return; }
    const fd = new FormData();
    fd.append("intent","updatePrice");
    fd.append("spId",           sp.id);
    fd.append("variantId",      v.id.replace("gid://shopify/ProductVariant/",""));
    fd.append("price",          lowest.price.toString());
    fd.append("competitorName", lowest.label);
    fd.append("competitorPrice",lowest.price.toString());
    if (v.metafield?.value) fd.append("floorPrice", v.metafield.value);
    if (prod) {
      fd.append("productId",    prod.id.replace("gid://shopify/Product/",""));
      fd.append("productTitle", prod.title);
    }
    submit(fd, { method: "post" });
    shopify.toast.show("Updating price…");
  }, [products, submit, includeShipping, ship]);

  const handleAdd = async () => {
    if (!selProd) return;
    setAdding(true);
    const valid = Object.entries(addUrls)
      .filter(([,u]) => u.trim().startsWith("http"))
      .map(([k,u]) => ({ name: k, url: u.trim() }));
    if (!valid.length) { setAdding(false); return; }
    const price = parseFloat(selProd.variants?.edges?.[0]?.node?.price || "0");
    const fd = new FormData();
    fd.append("intent","scrape");
    fd.append("competitorUrls", JSON.stringify(valid));
    fd.append("myProductUrl", `https://${shopDomain}/products/${selProd.handle}`);
    fd.append("myProductPrice", price.toString());
    submit(fd, { method: "post" });
    setAddOpen(false); setAdding(false); setSelProd(null); setProdQ(""); setAddUrls(EMPTY_URLS);
    shopify.toast.show("Scraping competitor prices…");
  };

  const handleEditSave = () => {
    if (!editRec) return;
    const data = {};
    if (editUrls.pdhsports)       data.competitor1Url = editUrls.pdhsports;
    if (editUrls.prodirectsport)  data.competitor2Url = editUrls.prodirectsport;
    if (editUrls.tennisnuts)      data.competitor3Url = editUrls.tennisnuts;
    if (editUrls.allthingstennis) data.competitor4Url = editUrls.allthingstennis;
    const fd = new FormData();
    fd.append("intent","updateScrapedPrice");
    fd.append("id", editRec.id);
    fd.append("data", JSON.stringify(data));
    submit(fd, { method: "post" });
    setEditOpen(false); setEditRec(null);
    shopify.toast.show("URLs updated!");
  };

  const handleDel = () => {
    if (!delRec) return;
    const fd = new FormData();
    fd.append("intent","deleteScrapedPrice");
    fd.append("id", delRec.id);
    submit(fd, { method: "post" });
    setDelOpen(false); setDelRec(null);
    shopify.toast.show("Product monitoring deleted");
  };

  const handleSaveShip = () => {
    const data = Object.fromEntries(
      Object.entries(ship).map(([k,v]) => [k, v.enabled ? parseFloat(v.price)||null : null])
    );
    const fd = new FormData();
    fd.append("intent","saveShipping");
    fd.append("data", JSON.stringify(data));
    submit(fd, { method: "post" });
    shopify.toast.show("Shipping settings saved!");
  };

  const handleRunScraper = () => {
    const fd = new FormData(); fd.append("intent","runScraper");
    submit(fd, { method: "post" });
    shopify.toast.show("Scraper started…");
  };

  const parseCSV = (txt) => {
    const lines = txt.split("\n").filter(l => l.trim());
    const data  = lines[0]?.toLowerCase().includes("product") ? lines.slice(1) : lines;
    return data.map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/"/g,""));
      if (cols.length < 2) return null;
      const productUrl = cols[0];
      const competitors = [];
      for (let i=1; i<cols.length-1; i+=2) {
        const n=cols[i]; const u=cols[i+1];
        if (n && u?.startsWith("http")) competitors.push({ name: n, url: u });
      }
      return productUrl?.startsWith("http") && competitors.length ? { productUrl, competitors } : null;
    }).filter(Boolean);
  };

  const handleImport = async () => {
    if (!impFile) return;
    setImpBusy(true); setImpStatus("Reading file…");
    try {
      const txt  = await impFile.text();
      const rows = parseCSV(txt);
      if (!rows.length) { setImpStatus("No valid data found in file."); setImpBusy(false); return; }
      const fd = new FormData();
      fd.append("intent","importCSV");
      fd.append("rows", JSON.stringify(rows));
      submit(fd, { method: "post" });
      setImpStatus(`Importing ${rows.length} products…`);
      shopify.toast.show(`Importing ${rows.length} products…`);
    } catch(e) {
      setImpStatus("Error: "+e.message);
    } finally { setImpBusy(false); }
  };

  // ─── Tab Panels ───────────────────────────────────────────────────────────

  function DashboardPanel() {
    const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000);
    const recentChanges = priceHistory.filter(h => new Date(h.createdAt) >= sevenDaysAgo);

    // Count products where our price matches the lowest competitor
    // Use live Shopify price (same logic as the comparison table)
    const matchedLowest = scrapedPrices.filter(sp => {
      const handle = extractHandle(sp.myProductUrl);
      const prod   = handle ? products.find(p => p.handle === handle) : null;
      const v      = prod?.variants?.edges?.[0]?.node;
      const cur    = v?.price ? parseFloat(v.price) : sp.myProductPrice;
      const comps  = [sp.competitor1Price, sp.competitor2Price, sp.competitor3Price, sp.competitor4Price]
        .filter(p => p != null && p > 0);
      if (!comps.length || cur == null) return false;
      const lowest = Math.min(...comps);
      return cur <= lowest + 0.01;
    }).length;

    // Count times we had the lowest price (price drops that matched competitor)
    const minPriceHits = priceHistory.filter(h => h.changeType === "Price Drop").length;

    const statCards = [
      {
        value: matchedLowest,
        label: "Matched Lowest Competitor",
        desc: "Products matching competitor's lowest price",
        bg: "linear-gradient(135deg,#e0e7ff,#c7d2fe)",
        iconBg: "#4f46e5",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
      },
      {
        value: minPriceHits,
        label: "Min Price Hits",
        desc: "Times you had the lowest price",
        bg: "linear-gradient(135deg,#d1fae5,#a7f3d0)",
        iconBg: "#059669",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
      },
      {
        value: recentChanges.length,
        label: "Total Price Adjustments (last 7 days)",
        desc: "Automated price changes this week",
        bg: "linear-gradient(135deg,#fef3c7,#fde68a)",
        iconBg: "#d97706",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
      },
      {
        value: scrapedPrices.length,
        label: "Tracked Products",
        desc: "Products being monitored",
        bg: "linear-gradient(135deg,#ede9fe,#ddd6fe)",
        iconBg: "#7c3aed",
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      },
    ];

    return (
      <div style={{padding:"20px 0px"}}>
        {/* Colorful stat cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:24}}>
          {statCards.map(({ value, label, desc, bg, iconBg, icon }) => (
            <div key={label} style={{background:bg,borderRadius:12,padding:"20px 18px",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{width:44,height:44,borderRadius:10,background:iconBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {icon}
              </div>
              <div>
                <div style={{fontSize:28,fontWeight:700,color:"#111",lineHeight:1}}>{value}</div>
                <div style={{fontSize:13,fontWeight:500,color:"#374151",marginTop:4}}>{label}</div>
              </div>
              <div style={{fontSize:12,color:"#6b7280"}}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Recent changes */}
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:"1px solid #f3f4f6"}}>
            <span style={{fontWeight:600,fontSize:15,color:"#111"}}>Recent Price Changes</span>
          </div>
          {priceHistory.length === 0 ? (
            <div style={{padding:"32px",textAlign:"center",color:"#6b7280",fontSize:13}}>No price changes yet. Add products to start monitoring.</div>
          ) : (
            <div className="pid-table-wrap">
              <table className="pid-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Product</th><th>Competitor</th>
                    <th>Comp. Price</th><th>Old Price</th><th style={{fontWeight:700}}>New Price</th><th>Saving</th><th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.slice(0,20).map(h => {
                    const saving = h.oldPrice != null && h.newPrice != null ? (h.oldPrice - h.newPrice) : null;
                    const isDrop = h.changeType === "Price Drop";
                    const isRise = h.changeType === "Price Increase";
                    return (
                      <tr key={h.id}>
                        <td style={{color:"#6b7280",whiteSpace:"nowrap",fontSize:12}}>{new Date(h.createdAt).toLocaleDateString("en-GB")}</td>
                        <td style={{fontWeight:500,color:"#111"}}>{h.productTitle || "—"}</td>
                        <td style={{color:"#6b7280",fontSize:13}}>{h.competitorName || "—"}</td>
                        <td style={{color:"#374151"}}>{fmt(h.competitorPrice) || "—"}</td>
                        <td style={{color:"#6b7280"}}>{fmt(h.oldPrice) || "—"}</td>
                        <td style={{fontWeight:700,color:"#111"}}>{fmt(h.newPrice) || "—"}</td>
                        <td style={{fontWeight:600,color: saving == null ? "#6b7280" : saving > 0 ? "#d97706" : saving < 0 ? "#d97706" : "#6b7280"}}>
                          {saving != null ? (saving >= 0 ? `+${fmt(saving)}` : fmt(saving)) : "—"}
                        </td>
                        <td>
                          {isDrop
                            ? <span style={{display:"inline-flex",alignItems:"center",gap:4,background:"#d1fae5",color:"#065f46",fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:20}}>↓ Drop</span>
                            : isRise
                            ? <span style={{display:"inline-flex",alignItems:"center",gap:4,background:"#fef3c7",color:"#92400e",fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:20}}>↑ Rise</span>
                            : <span style={{display:"inline-flex",alignItems:"center",gap:4,background:"#f3f4f6",color:"#374151",fontSize:12,fontWeight:600,padding:"3px 10px",borderRadius:20}}>Match</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sales chart */}
        <div style={{marginTop:20}}>
          <Card>
            <div style={{padding:"16px 16px 0"}}>
              <Text as="h3" variant="headingMd">Sales Performance After Price Changes</Text>
            </div>
            <div style={{padding:"16px"}}>
              <SalesDashboardCharts salesTracking={salesTracking} />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  function PriceComparisonPanel() {
    return (
      <div style={{padding:"20px"}}>
        {/* Toolbar */}
        <div className="pid-toolbar">
          <Text as="h2" variant="headingLg" fontWeight="semibold">Price Comparison</Text>
          <div className="pid-btn-row">
            <button className="pid-action-btn pid-btn-primary" onClick={handleRunScraper} disabled={busy}>
              {busy ? "Running…" : "Refresh All"}
            </button>
            <button className="pid-action-btn pid-btn-primary" onClick={() => setAddOpen(true)}>
              Add Product
            </button>
          </div>
        </div>

        {/* Search + shipping toggle */}
        <div className="pid-search-wrap">
          <span className="pid-search-icon"><SearchIcon /></span>
          <input
            className="pid-search-input"
            placeholder="Search products..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,marginBottom:10,fontSize:13,fontWeight:500,color:"#202223"}}>
          <span>Include Shipping</span>
          <ToggleSwitch checked={includeShipping} onChange={setIncludeShipping} />
        </div>

        {filteredPrices.length === 0 ? (
          <Card>
            <div className="pid-empty">
              <h3>{searchQ ? "No products match your search" : "No products monitored yet"}</h3>
              <p>Click "Add Product" to start tracking competitor prices.</p>
              {!searchQ && (
                <button className="pid-action-btn pid-btn-primary" style={{marginTop:8}} onClick={() => setAddOpen(true)}>
                  Add Product
                </button>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div className="pid-table-wrap">
              <table className="pid-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Current Price</th>
                    <th>Competitor Prices</th>
                    <th>Lowest Price</th>
                    <th>Difference</th>
                    <th>Floor Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrices.map(sp => {
                    const handle  = extractHandle(sp.myProductUrl);
                    const prod    = handle ? products.find(p => p.handle === handle) : null;
                    const img     = prod?.images?.edges?.[0]?.node?.url || null;
                    const v       = prod?.variants?.edges?.[0]?.node;
                    const cur     = v?.price ? parseFloat(v.price) : sp.myProductPrice;
                    const floor   = v?.metafield?.value ? parseFloat(v.metafield.value) : null;
                    const comps   = getCompPrices(sp).filter(c => c.displayPrice != null);
                    const lowest  = comps.sort((a,b) => a.displayPrice - b.displayPrice)[0];
                    const diff    = lowest && cur != null ? lowest.displayPrice - cur : null;
                    const matched = diff != null && Math.abs(diff) < 0.01;
                    const title   = prod?.title || handleToTitle(handle);

                    return (
                      <tr key={sp.id}>
                        <td>
                          <div className="pid-prod-cell">
                            <ProductImg src={img} alt={title} />
                            <div>
                              <div className="pid-prod-name">{title.length > 30 ? title.substring(0,30)+"…" : title}</div>
                              {handle && (
                                <a
                                  className="pid-prod-link"
                                  href={`https://${shopDomain}/products/${handle}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  View Product
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="pid-price">{fmt(cur) || "—"}</span>
                        </td>
                        <td>
                          <div className="pid-comp-list">
                            {getCompPrices(sp).filter(c => c.price != null).map((c,i) => (
                              <div className="pid-comp-row" key={i}>
                                <span className="pid-comp-name-label">{c.label}:</span>
                                <span className="pid-comp-price-val">{fmt(c.displayPrice)}</span>
                              </div>
                            ))}
                            {getCompPrices(sp).every(c => c.price == null) && (
                              <span className="pid-price-na">No prices yet</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {lowest
                            ? <span className="pid-price-green">{fmt(lowest.displayPrice)}</span>
                            : <span className="pid-price-na">N/A</span>}
                        </td>
                        <td>
                          {diff != null ? (
                            <div className="pid-diff">
                              {diff < 0
                                ? <span style={{color:"#d72c0d"}}>↓ {fmt(Math.abs(diff))}</span>
                                : diff > 0.01
                                ? <span style={{color:"#008060"}}>↑ {fmt(diff)}</span>
                                : <span style={{color:"#d72c0d"}}>↓ £0.00</span>}
                            </div>
                          ) : <span className="pid-price-na">—</span>}
                        </td>
                        <td>
                          <span className="pid-price">{floor ? fmt(floor) : "—"}</span>
                        </td>
                        <td>
                          {matched
                            ? <button className="pid-action-btn pid-btn-matched">Matched Lowest Competitor</button>
                            : <button className="pid-action-btn pid-btn-update" onClick={() => handleUpdatePrice(sp)} disabled={busy}>
                                Update Price
                              </button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  }

  function CompetitorSitesPanel() {
    return (
      <div style={{padding:"20px"}}>
        <div className="pid-toolbar">
          <Text as="h2" variant="headingLg" fontWeight="semibold">All Competitors</Text>
          <div className="pid-btn-row">
            <button className="pid-action-btn pid-btn-primary" onClick={() => setAddOpen(true)}>
              Add Competitor URLs
            </button>
            <button className="pid-action-btn pid-btn-primary" onClick={() => setImpOpen(true)}>
              Import
            </button>
          </div>
        </div>

        {scrapedPrices.length === 0 ? (
          <Card>
            <div className="pid-empty">
              <h3>No competitor URLs configured</h3>
              <p>Add products to start monitoring competitor prices.</p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="pid-table-wrap">
              <table className="pid-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Current Price</th>
                    <th>pdhsports UK</th>
                    <th>prodirectsport UK</th>
                    <th>tennisnuts UK</th>
                    <th>allthingstennis UK</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapedPrices.map(sp => {
                    const handle = extractHandle(sp.myProductUrl);
                    const prod   = handle ? products.find(p => p.handle === handle) : null;
                    const img    = prod?.images?.edges?.[0]?.node?.url || null;
                    const v      = prod?.variants?.edges?.[0]?.node;
                    const cur    = v?.price ? parseFloat(v.price) : sp.myProductPrice;
                    const title  = prod?.title || handleToTitle(handle);

                    const compCols = [
                      { price: sp.competitor1Price, url: sp.competitor1Url },
                      { price: sp.competitor2Price, url: sp.competitor2Url },
                      { price: sp.competitor3Price, url: sp.competitor3Url },
                      { price: sp.competitor4Price, url: sp.competitor4Url },
                    ];

                    const getDomain = (url) => {
                      try { return new URL(url).hostname.replace("www.",""); } catch { return null; }
                    };

                    return (
                      <tr key={sp.id}>
                        <td>
                          <div className="pid-prod-cell">
                            <ProductImg src={img} alt={title} size={50} />
                            <div>
                              <div className="pid-prod-name" style={{fontSize:13}}>
                                {title.length > 25 ? title.substring(0,25)+"…" : title}
                              </div>
                              {handle && (
                                <a className="pid-prod-link" href={`https://${shopDomain}/products/${handle}`} target="_blank" rel="noopener noreferrer">
                                  {shopDomain.replace(".myshopify.com","")+".co.uk"}
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td><span className="pid-price">{fmt(cur) || "—"}</span></td>
                        {compCols.map((c,i) => (
                          <td key={i}>
                            {c.price != null ? (
                              <div className="pid-comp-cell">
                                <div className="pid-comp-cell-price">{fmt(c.price)}</div>
                                {c.url && (
                                  <a className="pid-comp-cell-link" href={c.url} target="_blank" rel="noopener noreferrer">
                                    {getDomain(c.url)}
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="pid-price-na">N/A</span>
                            )}
                          </td>
                        ))}
                        <td style={{color:"#6d7175",fontSize:12,whiteSpace:"nowrap"}}>
                          {new Date(sp.updatedAt).toLocaleString("en-GB",{dateStyle:"short",timeStyle:"short"})}
                        </td>
                        <td>
                          <div style={{display:"flex",gap:6}}>
                            <button className="pid-icon-btn" title="Edit URLs" onClick={() => {
                              setEditRec(sp);
                              setEditUrls({ pdhsports:sp.competitor1Url||"", prodirectsport:sp.competitor2Url||"", tennisnuts:sp.competitor3Url||"", allthingstennis:sp.competitor4Url||"" });
                              setEditOpen(true);
                            }}><EditIcon /></button>
                            <button className="pid-icon-btn" title="Delete" onClick={() => { setDelRec(sp); setDelOpen(true); }}><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  }

  function PriceHistoryPanel() {
    return (
      <div style={{padding:"20px"}}>
        <div className="pid-toolbar">
          <Text as="h2" variant="headingLg" fontWeight="semibold">Price History</Text>
          <Text as="p" tone="subdued">{priceHistory.length} price changes recorded</Text>
        </div>

        {priceHistory.length === 0 ? (
          <Card>
            <div className="pid-empty">
              <h3>No price changes recorded</h3>
              <p>Price changes will appear here when you update product prices.</p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="pid-table-wrap">
              <table className="pid-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Product</th><th>Competitor</th>
                    <th>Comp. Price</th><th>Old Price</th><th>New Price</th>
                    <th>Saving</th><th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map(h => {
                    const saving = h.oldPrice != null && h.newPrice != null ? h.oldPrice - h.newPrice : null;
                    return (
                      <tr key={h.id}>
                        <td style={{color:"#6d7175",whiteSpace:"nowrap",fontSize:12}}>{new Date(h.createdAt).toLocaleDateString("en-GB")}</td>
                        <td style={{fontWeight:500,maxWidth:200}}>{h.productTitle || "—"}</td>
                        <td style={{color:"#6d7175"}}>{h.competitorName || "—"}</td>
                        <td className="pid-price" style={{color:"#6d7175"}}>{fmt(h.competitorPrice) || "—"}</td>
                        <td className="pid-price">{fmt(h.oldPrice) || "—"}</td>
                        <td className="pid-price" style={{fontWeight:700}}>{fmt(h.newPrice) || "—"}</td>
                        <td>
                          {saving != null && saving > 0.01
                            ? <span style={{color:"#008060",fontWeight:600}}>-{fmt(saving)}</span>
                            : saving != null && saving < -0.01
                            ? <span style={{color:"#d72c0d",fontWeight:600}}>+{fmt(Math.abs(saving))}</span>
                            : <span style={{color:"#6d7175"}}>—</span>}
                        </td>
                        <td>
                          {h.changeType === "Price Drop"
                            ? <Badge tone="success">↓ Drop</Badge>
                            : h.changeType === "Price Increase"
                            ? <Badge tone="warning">↑ Rise</Badge>
                            : <Badge>Match</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  }

  function SettingsPanel() {
    return (
      <div style={{padding:"20px"}}>
        <div style={{marginBottom:20}}>
          <Text as="h2" variant="headingLg" fontWeight="semibold">Settings</Text>
        </div>

        <Card>
          <div style={{padding:"16px"}}>
            <Text as="h3" variant="headingMd">Shipping Costs by Competitor</Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Configure shipping costs added to competitor prices when comparing.
            </Text>
            <div style={{marginTop:16}}>
              {[
                { key:"pdhsports",       label:"PDH Sports"        },
                { key:"prodirectsport",  label:"ProDirect Sport"   },
                { key:"tennisnuts",      label:"Tennis Nuts"       },
                { key:"allthingstennis", label:"All Things Tennis" },
              ].map(({ key, label }) => (
                <div className="pid-ship-row" key={key}>
                  <div className="pid-ship-name">{label}</div>
                  <div className="switch-container">
                    <ToggleSwitch
                      checked={ship[key].enabled}
                      onChange={v => setShip(s => ({ ...s, [key]: { ...s[key], enabled: v } }))}
                    />
                    <span className={`toggle-label${ship[key].enabled ? " enabled" : ""}`}>
                      {ship[key].enabled ? "On" : "Off"}
                    </span>
                  </div>
                  <div style={{width:130}}>
                    <TextField
                      label="Cost" labelHidden
                      value={ship[key].price}
                      onChange={v => setShip(s => ({ ...s, [key]: { ...s[key], price: v } }))}
                      prefix="£"
                      disabled={!ship[key].enabled}
                      autoComplete="off"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{marginTop:20}}>
              <Button variant="primary" onClick={handleSaveShip}>Save Shipping Settings</Button>
            </div>
          </div>
        </Card>

        <div style={{marginTop:20}}>
          <Card>
            <div style={{padding:"16px"}}>
              <Text as="h3" variant="headingMd">Automatic Price Scraping</Text>
              <Text as="p" tone="subdued" variant="bodySm" style={{marginTop:4}}>
                Prices are automatically scraped at 9:00am, 1:00pm, and 6:00pm daily (UK time).
              </Text>
              <div className="pid-schedule-pills">
                {["9:00 AM","1:00 PM","6:00 PM"].map(t => (
                  <div className="pid-schedule-pill" key={t}>{t}</div>
                ))}
              </div>
              <div style={{marginTop:16}}>
                <Button onClick={handleRunScraper} loading={busy}>Run Scraper Now</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const panels = [DashboardPanel, PriceComparisonPanel, CompetitorSitesPanel, PriceHistoryPanel, SettingsPanel];
  const ActivePanel = panels[tab];

  return (
    <Page
      title="Price Intelligence Dashboard"
      subtitle="Advanced competitor monitoring and automated repricing for your Shopify store"
      fullWidth
    >
      {/* Full-width tabs */}
      <div className="pid-tabs">
        {TABS.map((t,i) => (
          <button key={t} className={`pid-tab${tab===i?" active":""}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      <ActivePanel />

      {/* ── Add Product Modal ── */}
      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); setSelProd(null); setProdQ(""); setAddUrls(EMPTY_URLS); }}
        title="Add Competitor URLs for Product"
        primaryAction={{ content: adding ? "Adding…" : "Add All URLs", onAction: handleAdd, loading: adding, disabled: !selProd }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAddOpen(false) }]}
      >
        <Modal.Section>
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <Text as="p" tone="subdued">
              Link your Shopify product with competitor URLs for price monitoring.
            </Text>
            <div style={{position:"relative"}}>
              <TextField
                label="Select Product *"
                value={prodQ}
                onChange={v => { setProdQ(v); setSelProd(null); }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 200)}
                placeholder="Type to search your products…"
                autoComplete="off"
              />
              {showDrop && (
                <div className="pid-prod-drop">
                  {filteredProds.length === 0
                    ? <div className="pid-prod-drop-empty">No products found</div>
                    : filteredProds.slice(0,30).map(p => (
                      <div
                        key={p.id}
                        className={`pid-prod-drop-item${selProd?.id===p.id?" selected":""}`}
                        onMouseDown={() => { setSelProd(p); setProdQ(p.title); setShowDrop(false); }}
                      >
                        <div style={{fontWeight:500,fontSize:13}}>{p.title}</div>
                        <div style={{fontSize:11,color:"#8c9196"}}>
                          {p.vendor} — £{parseFloat(p.variants?.edges?.[0]?.node?.price||0).toFixed(2)}
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
            {selProd && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {COMPETITOR_FIELDS.map(({ key, label, ph }) => (
                  <TextField key={key} label={label} value={addUrls[key]}
                    onChange={v => setAddUrls(u => ({ ...u, [key]: v }))}
                    placeholder={ph} autoComplete="off" />
                ))}
              </div>
            )}
            {!selProd && <Banner tone="warning">Please select a product first.</Banner>}
          </div>
        </Modal.Section>
      </Modal>

      {/* ── Import CSV Modal ── */}
      <Modal
        open={impOpen}
        onClose={() => { setImpOpen(false); setImpFile(null); setImpStatus(""); }}
        title="Import Competitor URLs from CSV"
        primaryAction={{ content: impBusy ? "Importing…" : "Import", onAction: handleImport, loading: impBusy, disabled: !impFile||impBusy }}
        secondaryActions={[{ content: "Cancel", onAction: () => setImpOpen(false) }]}
      >
        <Modal.Section>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Text as="p">Upload a CSV to import multiple products with competitor URLs.</Text>
            <button
              onClick={() => downloadCSV(CSV_TEMPLATE, "repricer-template.csv")}
              style={{width:"100%",padding:"10px",background:"#f6f6f7",border:"1px solid #c9cccf",borderRadius:6,cursor:"pointer",fontWeight:600,fontSize:13}}
            >
              ⬇ Download CSV Template
            </button>
            <label htmlFor="csv-file" className="pid-csv-drop">
              {impFile
                ? <div style={{fontWeight:600,fontSize:13}}>{impFile.name}</div>
                : <div style={{color:"#8c9196",fontSize:13}}>Click to upload .csv file</div>}
            </label>
            <input id="csv-file" type="file" accept=".csv" style={{display:"none"}}
              onChange={e => { const f=e.target.files?.[0]; if(f){ setImpFile(f); setImpStatus(""); } }} />
            {impStatus && <Text as="p" tone="subdued">{impStatus}</Text>}
          </div>
        </Modal.Section>
      </Modal>

      {/* ── Edit URLs Modal ── */}
      <Modal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditRec(null); }}
        title="Edit Competitor URLs"
        primaryAction={{ content: "Save Changes", onAction: handleEditSave }}
        secondaryActions={[{ content: "Cancel", onAction: () => setEditOpen(false) }]}
      >
        <Modal.Section>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {editRec && (
              <Text as="p" tone="subdued">
                Update competitor URLs for {extractHandle(editRec.myProductUrl) || editRec.myProductUrl}
              </Text>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {COMPETITOR_FIELDS.map(({ key, label }) => (
                <TextField key={key} label={label} value={editUrls[key]}
                  onChange={v => setEditUrls(u => ({ ...u, [key]: v }))} autoComplete="off" />
              ))}
            </div>
            <div style={{background:"#f0f5ff",padding:16,borderRadius:8}}>
              <Text as="p" variant="bodySm">
                This will update the competitor URLs. Price scraping will use the new URLs on the next update.
              </Text>
            </div>
          </div>
        </Modal.Section>
      </Modal>

      {/* ── Delete Confirmation ── */}
      <Modal
        open={delOpen}
        onClose={() => { setDelOpen(false); setDelRec(null); }}
        title="Delete Product Monitoring"
        primaryAction={{ content: "Delete", onAction: handleDel, tone: "critical" }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDelOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to stop monitoring this product? All competitor URLs will be removed. This cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
