import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ReferenceLine, ResponsiveContainer, Label,
} from 'recharts';

const SKELETON_WIDTHS = ['72%', '88%', '65%', '95%', '58%', '80%', '70%', '90%'];

const formatFeatureName = (name) => {
  const readable = name.replace(/_/g, ' ');
  return readable.length > 25 ? readable.slice(0, 24) + '…' : readable;
};

/**
 * Waterfall logic — builds rows in the correct order, then reverses for display.
 *
 * Processing order (bottom → top in the final chart):
 *   1. "N other features"  (always at the very bottom, closest to E[f(x)])
 *   2. Top features sorted by |value| ascending (smallest → largest)
 *
 * Running total starts at E[f(x)] and flows through all items.
 * For each item the "left edge" of its colored bar is:
 *   - positive value  →  spacer = running          (bar goes RIGHT from current position)
 *   - negative value  →  spacer = running + value   (bar goes RIGHT from the new lower position)
 * In both cases  barWidth = |value|  and  bar spans [spacer, spacer + barWidth].
 *
 * After computing positions we REVERSE the array so the largest contributor is at the top.
 *
 * To eliminate the large dead space caused by recharts always stacking from 0,
 * we shift every spacer value by  offset = -minEdge  so the leftmost bar starts at 0.
 * The x-axis tick formatter subtracts the offset to show original log-odds values.
 */
const buildWaterfallRows = ({ expected_value, features, other_sum, n_other }) => {
  // Ascending by |value|: smallest contributor first → ends up at the bottom of chart
  const sortedAsc = Object.entries(features).sort(([, a], [, b]) => Math.abs(a) - Math.abs(b));

  const items = [];

  if (n_other > 0 && other_sum !== 0) {
    items.push({ name: `${n_other} other features`, label: `${n_other} other features`, value: other_sum, isOther: true });
  }

  for (const [name, value] of sortedAsc) {
    items.push({ name, label: formatFeatureName(name), value });
  }

  // Compute running totals from E[f(x)]
  let running = expected_value;
  const rowsBottomFirst = items.map((item) => {
    const leftEdge = item.value >= 0 ? running : running + item.value;
    const row = { ...item, spacer: leftEdge, barWidth: Math.abs(item.value) };
    running += item.value;
    return row;
  });

  const finalValue = running;

  // Compute shift so all bar edges are non-negative (eliminates dead space)
  const allEdges = rowsBottomFirst.flatMap(r => [r.spacer, r.spacer + r.barWidth]);
  allEdges.push(expected_value, finalValue);
  const minEdge = Math.min(...allEdges);
  const maxEdge = Math.max(...allEdges);
  const offset = -minEdge; // spacerShifted = spacer + offset ≥ 0 for all rows

  // Reverse: largest contributor moves to row 0 (top of chart)
  const rows = [...rowsBottomFirst].reverse().map(r => ({
    ...r,
    spacerShifted: r.spacer + offset,
  }));

  return { rows, finalValue, offset, minEdge, maxEdge };
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = (payload.find(p => p.dataKey === 'barWidth') ?? payload[0])?.payload;
  if (!row) return null;
  const sign = row.value >= 0 ? '+' : '';
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border-color)',
      padding: '8px 12px',
      borderRadius: 8,
      maxWidth: 300,
    }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4, wordBreak: 'break-word' }}>
        {row.name}
      </p>
      <p style={{ color: row.value >= 0 ? '#fd1158' : '#408efc', fontSize: 13, fontWeight: 600 }}>
        {sign}{row.value.toFixed(4)}
      </p>
    </div>
  );
};

export default function ShapWaterfallChart({ shapValues, loading }) {
  if (loading) {
    return (
      <div className="mt-6 text-left">
        <div className="h-4 bg-border rounded animate-pulse mb-4 w-3/4" />
        {SKELETON_WIDTHS.map((w, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <div className="h-3 bg-border rounded animate-pulse w-36 shrink-0" />
            <div className="h-5 bg-border rounded animate-pulse" style={{ width: w }} />
          </div>
        ))}
      </div>
    );
  }

  if (
    !shapValues ||
    typeof shapValues !== 'object' ||
    !('expected_value' in shapValues) ||
    !shapValues.features ||
    Object.keys(shapValues.features).length === 0
  ) {
    return null;
  }

  const { expected_value } = shapValues;
  const { rows, finalValue, offset, minEdge, maxEdge } = buildWaterfallRows(shapValues);

  const range = maxEdge - minEdge;
  const pad = Math.max(range * 0.04, 0.02);
  // Domain starts just below 0 (= f(x) side) and ends just past E[f(x)] side
  const domain = [0 - pad, range + pad];

  const efxShifted = expected_value + offset;
  const fxShifted = finalValue + offset;
  const chartHeight = rows.length * 38 + 32;

  return (
    <div className="mt-6 text-left">
      <h3 className="text-sm font-semibold text-main mb-2">
        Model's prediction explanation
      </h3>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 30, right: 16, left: 0, bottom: 22 }}
          barCategoryGap="28%"
        >
          <XAxis
            type="number"
            domain={domain}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => (v - offset).toFixed(2)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={178}
            tick={{ fontSize: 10, fill: 'var(--text-main)' }}
            axisLine={false}
            tickLine={false}
          />

          {/* f(x) label at the top, above the left edge of the topmost bar */}
          <ReferenceLine x={fxShifted} stroke="none">
            <Label
              value={`f(x) = ${finalValue.toFixed(4)}`}
              position="insideTopRight"
              offset={-1}
              fontSize={10}
              fontWeight={600}
              fill="var(--text-main)"
            />
          </ReferenceLine>

          {/* E[f(x)] dashed reference line with label at the bottom */}
          <ReferenceLine
            x={efxShifted}
            stroke="var(--text-muted)"
            strokeDasharray="4 3"
            strokeWidth={1}
          >
            <Label
              value={`E[f(x)] = ${expected_value.toFixed(4)}`}
              position="insideBottomLeft"
              offset={2}
              fontSize={10}
              fill="var(--text-muted)"
            />
          </ReferenceLine>

          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(128,128,128,0.06)' }} />

          {/* Transparent spacer — positions each colored bar at the correct x offset */}
          <Bar dataKey="spacerShifted" stackId="wf" fill="transparent" isAnimationActive={false} />

          {/* Colored contribution bar */}
          <Bar dataKey="barWidth" stackId="wf" maxBarSize={20} radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {rows.map((row, i) => (
              <Cell
                key={i}
                fill={row.value >= 0 ? '#fd1158' : '#408efc'}
                fillOpacity={row.isOther ? 0.55 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#fd1158]" /> increases the risk
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#408efc]" /> decreases the risk
        </span>
      </div>
    </div>
  );
}
