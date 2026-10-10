import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
} from 'recharts';
import { SeriesPoint, CpcbCategory } from '../types';
import { CPCB_COLORS, CPCB_BG_LIGHT, CPCB_TEXT_DARK } from '../utils/cpcb';

interface AirChartProps {
  series: SeriesPoint[];
  bestStart?: string;
  bestEnd?: string;
  usualStart?: string;
  usualEnd?: string;
}

function formatHour(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      const parts = isoString.split('T');
      return parts[1] ? parts[1].substring(0, 5) : isoString;
    }
    const h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    const m = d.getMinutes();
    if (m === 0) return `${displayH} ${ampm}`;
    return `${displayH}:${m < 10 ? '0' : ''}${m}`;
  } catch {
    return isoString;
  }
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload) return null;
  const cat = (payload.category as CpcbCategory) || 'Moderate';
  const color = CPCB_COLORS[cat] || '#1F7A4C';
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={color}
      stroke="#FFFFFF"
      strokeWidth={1.5}
      className="transition-transform duration-150 hover:scale-150"
    />
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as SeriesPoint;
    const cat = data.category as CpcbCategory;
    const catColor = CPCB_COLORS[cat] || '#1F7A4C';
    const catBg = CPCB_BG_LIGHT[cat] || '#F3F7F2';
    const catText = CPCB_TEXT_DARK[cat] || '#14211A';

    return (
      <div className="bg-[#FFFFFF] border border-[#D9E4D6] rounded-xl p-3 text-xs shadow-md">
        <div className="flex items-center justify-between gap-4 font-mono text-[11px] text-[#4F6157] mb-1.5 pb-1 border-b border-[#D9E4D6]">
          <span>{formatHour(data.time)}</span>
          <span className="font-semibold text-[#14211A]">{data.temp_c}°C</span>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-xl font-bold font-mono text-[#14211A]">
            {data.pm25}
          </span>
          <span className="text-[11px] text-[#4F6157] font-mono">µg/m³ PM2.5</span>
        </div>
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
          style={{ backgroundColor: catBg, color: catText }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: catColor }}
          />
          <span>CPCB: {data.category}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const AirChart: React.FC<AirChartProps> = ({
  series,
  bestStart,
  bestEnd,
  usualStart,
  usualEnd,
}) => {
  if (!series || series.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-xs text-[#4F6157] font-mono">
        No forecast series data available
      </div>
    );
  }

  // Find matching timestamps in series
  let bestX1: string | undefined;
  let bestX2: string | undefined;
  let usualX1: string | undefined;
  let usualX2: string | undefined;

  if (bestStart && bestEnd) {
    const sPrefix = bestStart.substring(0, 16);
    const ePrefix = bestEnd.substring(0, 16);
    const match1 = series.find((p) => p.time.startsWith(sPrefix));
    const match2 = series.find((p) => p.time.startsWith(ePrefix));
    if (match1) bestX1 = match1.time;
    if (match2) bestX2 = match2.time;
  }

  if (usualStart && usualEnd) {
    const sPrefix = usualStart.substring(0, 16);
    const ePrefix = usualEnd.substring(0, 16);
    const match1 = series.find((p) => p.time.startsWith(sPrefix));
    const match2 = series.find((p) => p.time.startsWith(ePrefix));
    if (match1) usualX1 = match1.time;
    if (match2) usualX2 = match2.time;
  }

  return (
    <div className="w-full h-80 py-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 12, right: 12, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBEFEA" />

          {/* Shaded best window (primary-tint) */}
          {bestX1 && bestX2 && (
            <ReferenceArea
              x1={bestX1}
              x2={bestX2}
              fill="#E4F2E8"
              fillOpacity={0.85}
              stroke="#1F7A4C"
              strokeOpacity={0.3}
            />
          )}

          {/* Outlined usual window */}
          {usualX1 && usualX2 && (
            <ReferenceArea
              x1={usualX1}
              x2={usualX2}
              stroke="#14211A"
              strokeDasharray="4 4"
              fill="#14211A"
              fillOpacity={0.05}
            />
          )}

          <XAxis
            dataKey="time"
            tickFormatter={formatHour}
            stroke="#D9E4D6"
            tick={{ fill: '#4F6157', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#D9E4D6"
            tick={{ fill: '#4F6157', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            unit=" µg"
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="pm25"
            stroke="#1F7A4C"
            strokeWidth={2.5}
            dot={<CustomDot />}
            activeDot={{ r: 6, fill: '#1F7A4C', stroke: '#FFFFFF', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
