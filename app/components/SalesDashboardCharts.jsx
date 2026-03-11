import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Text, BlockStack, InlineStack, Card, Box } from "@shopify/polaris";

export function SalesDashboardCharts({ salesTracking = [] }) {
  if (!salesTracking || salesTracking.length === 0) {
    return (
      <Box paddingBlock="400">
        <Text as="p" tone="subdued" alignment="center">
          No sales tracking data available. Data will appear here after price changes are made.
        </Text>
      </Box>
    );
  }

  // Build chart data: before vs after for each tracked product
  const chartData = salesTracking
    .filter(st => st.productTitle && (st.beforeRevenue != null || st.afterRevenue != null))
    .slice(0, 10)
    .map(st => ({
      name: st.productTitle?.length > 20 ? st.productTitle.substring(0, 20) + "…" : st.productTitle,
      "Before Revenue": parseFloat(st.beforeRevenue || 0).toFixed(2),
      "After Revenue": parseFloat(st.afterRevenue || 0).toFixed(2),
      "Before Units": st.beforeUnitsSold || 0,
      "After Units": st.afterUnitsSold || 0,
      oldPrice: parseFloat(st.oldPrice || 0).toFixed(2),
      newPrice: parseFloat(st.newPrice || 0).toFixed(2),
    }));

  if (chartData.length === 0) {
    return (
      <Box paddingBlock="400">
        <Text as="p" tone="subdued" alignment="center">
          Sales data is being collected. Check back after 30 days for complete before/after comparison.
        </Text>
      </Box>
    );
  }

  return (
    <BlockStack gap="500">
      {/* Revenue comparison */}
      <BlockStack gap="200">
        <Text as="h4" variant="headingSm">Revenue: Before vs After Price Change</Text>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `£${v}`} />
              <Tooltip formatter={(v, name) => [`£${v}`, name]} />
              <Legend />
              <Bar dataKey="Before Revenue" fill="#94a3b8" radius={[4,4,0,0]} />
              <Bar dataKey="After Revenue" fill="#1c1c1e" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </BlockStack>

      {/* Units sold comparison */}
      <BlockStack gap="200">
        <Text as="h4" variant="headingSm">Units Sold: Before vs After Price Change</Text>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Before Units" fill="#cbd5e1" radius={[4,4,0,0]} />
              <Bar dataKey="After Units" fill="#475569" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </BlockStack>

      {/* Summary table */}
      <BlockStack gap="200">
        <Text as="h4" variant="headingSm">Price Change Summary</Text>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Product", "Old Price", "New Price", "Before Rev.", "After Rev.", "Before Units", "After Units"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salesTracking.slice(0, 10).map((st, i) => {
                const revDiff = (parseFloat(st.afterRevenue||0) - parseFloat(st.beforeRevenue||0));
                const improved = revDiff > 0;
                return (
                  <tr key={st.id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 12px" }}>{st.productTitle || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>£{parseFloat(st.oldPrice||0).toFixed(2)}</td>
                    <td style={{ padding: "8px 12px" }}>£{parseFloat(st.newPrice||0).toFixed(2)}</td>
                    <td style={{ padding: "8px 12px" }}>£{parseFloat(st.beforeRevenue||0).toFixed(2)}</td>
                    <td style={{ padding: "8px 12px", color: improved ? "#16a34a" : "#dc2626" }}>
                      £{parseFloat(st.afterRevenue||0).toFixed(2)}
                      {revDiff !== 0 && <span style={{ fontSize: 11, marginLeft: 4 }}>{improved ? "▲" : "▼"} £{Math.abs(revDiff).toFixed(2)}</span>}
                    </td>
                    <td style={{ padding: "8px 12px" }}>{st.beforeUnitsSold ?? 0}</td>
                    <td style={{ padding: "8px 12px" }}>{st.afterUnitsSold ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BlockStack>
    </BlockStack>
  );
}
