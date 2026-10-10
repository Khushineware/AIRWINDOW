import React from 'react';

interface WindowStripProps {
  recommendedStart?: string; // e.g. "2026-10-09T13:30:00" or "13:30"
  recommendedEnd?: string;   // e.g. "2026-10-09T14:15:00" or "14:15"
  usualStart?: string;       // e.g. "2026-10-09T18:00:00" or "18:00"
  usualEnd?: string;         // e.g. "2026-10-09T18:45:00" or "18:45"
  className?: string;
  showLabels?: boolean;
}

export function parseMinutesFromTimeOrIso(val?: string): number | null {
  if (!val) return null;
  let timeStr = val;
  if (val.includes('T')) {
    const parts = val.split('T')[1];
    timeStr = parts.split(/[Z+-]/)[0];
  }
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function computeTimelinePercent(totalMinutes: number): number {
  const startMin = 5 * 60;  // 05:00 = 300 min
  const endMin = 20 * 60;   // 20:00 = 1200 min
  const span = endMin - startMin; // 900 min
  const clamped = Math.max(startMin, Math.min(endMin, totalMinutes));
  return ((clamped - startMin) / span) * 100;
}

export const WindowStrip: React.FC<WindowStripProps> = ({
  recommendedStart,
  recommendedEnd,
  usualStart,
  usualEnd,
  className = '',
  showLabels = true,
}) => {
  const recStartMin = parseMinutesFromTimeOrIso(recommendedStart);
  const recEndMin = parseMinutesFromTimeOrIso(recommendedEnd);

  const usuStartMin = parseMinutesFromTimeOrIso(usualStart);
  const usuEndMin = parseMinutesFromTimeOrIso(usualEnd);

  const ticks = [
    { label: '05:00', pct: 0 },
    { label: '08:00', pct: computeTimelinePercent(8 * 60) },
    { label: '11:00', pct: computeTimelinePercent(11 * 60) },
    { label: '14:00', pct: computeTimelinePercent(14 * 60) },
    { label: '17:00', pct: computeTimelinePercent(17 * 60) },
    { label: '20:00', pct: 100 },
  ];

  let recLeft = 0;
  let recWidth = 0;
  if (recStartMin !== null && recEndMin !== null) {
    const sPct = computeTimelinePercent(recStartMin);
    const ePct = computeTimelinePercent(recEndMin);
    recLeft = Math.min(sPct, ePct);
    recWidth = Math.max(2, Math.abs(ePct - sPct));
  }

  let usuLeft = 0;
  let usuWidth = 0;
  if (usuStartMin !== null && usuEndMin !== null) {
    const sPct = computeTimelinePercent(usuStartMin);
    const ePct = computeTimelinePercent(usuEndMin);
    usuLeft = Math.min(sPct, ePct);
    usuWidth = Math.max(2, Math.abs(ePct - sPct));
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Strip bar container */}
      <div className="relative w-full h-8 bg-[#F4F7F4] border border-[#D9E4D6] rounded-lg overflow-hidden shadow-2xs">
        {/* Subtle grid lines */}
        {ticks.map((t) => (
          <div
            key={t.label}
            className="absolute top-0 bottom-0 w-[1px] bg-[#D9E4D6] pointer-events-none"
            style={{ left: `${t.pct}%` }}
          />
        ))}

        {/* Usual Window (outlined dashed) */}
        {usuWidth > 0 && (
          <div
            className="absolute top-1 bottom-1 border-2 border-dashed border-[#14211A] bg-[#14211A]/10 rounded-md transition-all duration-300 z-10 flex items-center justify-center"
            style={{ left: `${usuLeft}%`, width: `${usuWidth}%` }}
            title="Usual Time"
          >
            <span className="sr-only">Usual Time</span>
          </div>
        )}

        {/* Recommended Window (filled primary) */}
        {recWidth > 0 && (
          <div
            className="absolute top-1 bottom-1 bg-gradient-to-r from-[#1F7A4C] to-[#155C39] rounded-md transition-all duration-300 shadow-xs z-20 flex items-center justify-center text-white"
            style={{ left: `${recLeft}%`, width: `${recWidth}%` }}
            title="Cleanest Recommended Window"
          >
            <span className="sr-only">Recommended Window</span>
          </div>
        )}
      </div>

      {/* Ticks and Legend Row */}
      {showLabels && (
        <div className="flex justify-between items-center mt-2 text-[11px] font-mono tracking-[0.04em] text-[#4F6157]">
          <div className="flex gap-4 sm:gap-6">
            {ticks.map((t) => (
              <span key={t.label} className="hidden sm:inline">
                {t.label}
              </span>
            ))}
            <span className="sm:hidden">05:00</span>
            <span className="sm:hidden">11:00</span>
            <span className="sm:hidden">14:00</span>
            <span className="sm:hidden">20:00</span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3">
            {usuWidth > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-2.5 border-2 border-dashed border-[#14211A] bg-[#14211A]/10 rounded-xs" />
                <span className="text-[11px] text-[#14211A] font-semibold">USUAL</span>
              </div>
            )}
            {recWidth > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-2.5 bg-[#1F7A4C] rounded-xs shadow-2xs" />
                <span className="text-[11px] text-[#1F7A4C] font-semibold">RECOMMENDED</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
