import { ResponsiveContainer } from 'recharts';
import { Card, Empty, Spinner } from './ui.jsx';
import { fmtAxisTime, fmtTooltipTime } from '../utils/format.js';

// Data series use cool hues so green/red/amber keep their meaning (normal / stopped / warning).
export const COLORS = {
  power: '#0369a1',
  current: '#4338ca',
  pf: '#0f766e',
  energy: '#475569',
  bar: '#0369a1',
  grid: '#e2e8f0',
  axis: '#64748b',
  threshold: '#b45309',
};

export const axisProps = { stroke: COLORS.axis, fontSize: 12, tickLine: false };
export const gridProps = { stroke: COLORS.grid, strokeDasharray: '3 3', vertical: false };
export const tooltipProps = {
  contentStyle: { fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' },
  labelStyle: { fontWeight: 600 },
};

/** Props for a numeric time x-axis. */
export const timeAxis = (spanMs) => ({
  dataKey: 't',
  type: 'number',
  scale: 'time',
  domain: ['dataMin', 'dataMax'],
  tickFormatter: (v) => fmtAxisTime(v, spanMs),
  minTickGap: 40,
  ...axisProps,
});
export const timeTooltip = { labelFormatter: fmtTooltipTime };

/** Card wrapper with loading / empty handling and a responsive container. */
export function ChartCard({ title, subtitle, height = 260, loading, empty, emptyText = 'No data for this period', note, actions, children }) {
  return (
    <Card title={title} subtitle={subtitle} actions={actions}>
      {loading ? (
        <div style={{ height }} className="flex items-center justify-center">
          <Spinner />
        </div>
      ) : empty ? (
        <div style={{ height }} className="flex items-center justify-center">
          <Empty title={emptyText} />
        </div>
      ) : (
        <div style={{ height }} className="w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </Card>
  );
}
