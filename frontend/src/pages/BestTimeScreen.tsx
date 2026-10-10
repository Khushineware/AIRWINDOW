import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Flame,
  Footprints,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Thermometer,
  Zap,
} from 'lucide-react';
import { getPlanById } from '../api/client';
import { PlanData } from '../types';
import { WindowStrip } from '../components/WindowStrip';
import { AirChart } from '../components/AirChart';

interface BestTimeScreenProps {
  currentPlan?: PlanData | null;
}

export const BestTimeScreen: React.FC<BestTimeScreenProps> = ({ currentPlan }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<PlanData | null>(currentPlan || null);
  const [loading, setLoading] = useState<boolean>(!currentPlan);
  const [error, setError] = useState<string | null>(null);
  const [showOtherOptions, setShowOtherOptions] = useState(false);

  // Animated percentage counter effect
  const [displayedPct, setDisplayedPct] = useState<number>(0);

  useEffect(() => {
    if (!plan && id) {
      setLoading(true);
      getPlanById(id)
        .then((data) => {
          setPlan(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Could not load plan.');
          setLoading(false);
        });
    }
  }, [id, plan]);

  useEffect(() => {
    if (plan?.best?.reduction_pct) {
      const target = plan.best.reduction_pct;
      let current = 0;
      const step = Math.max(1, Math.floor(target / 20));
      const interval = setInterval(() => {
        current += step;
        if (current >= target) {
          setDisplayedPct(target);
          clearInterval(interval);
        } else {
          setDisplayedPct(current);
        }
      }, 25);
      return () => clearInterval(interval);
    }
  }, [plan]);

  if (loading) {
    return (
      <div className="w-full py-16 space-y-6">
        <div className="h-6 w-36 bg-[#D9E4D6] rounded-md animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-80 bg-[#D9E4D6] rounded-3xl animate-pulse" />
          <div className="h-80 bg-[#D9E4D6] rounded-3xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="max-w-[560px] mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#E4F2E8] border border-[#1F7A4C]/20 flex items-center justify-center text-[#1F7A4C] mx-auto">
          <Calendar className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-[#14211A]">Create a plan first</h2>
        <p className="text-sm text-[#4F6157] max-w-[40ch] mx-auto">
          Please select your location and schedule parameters on the Planner to view your cleanest time window.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 py-3 px-6 bg-[#1F7A4C] text-white text-sm font-semibold rounded-xl hover:bg-[#155C39] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go to Planner</span>
        </Link>
      </div>
    );
  }

  const { best, baseline, alternatives, inputs, confidence, series, data_notes, location } = plan;
  const reductionText = baseline.kind === 'usual' ? 'your usual time' : 'a typical time in your window';
  const confidenceSummary = confidence.reasons.length > 0 ? confidence.reasons[0] : 'Ground station calibrated';

  const confBadgeStyle =
    confidence.level === 'high'
      ? 'bg-[#E4F2E8] text-[#1F7A4C] border-[#1F7A4C]/30'
      : confidence.level === 'medium'
      ? 'bg-[#FFF5E6] text-[#A65100] border-[#FF9900]/30'
      : 'bg-[#FDECE9] text-[#B3210F] border-[#E8341C]/30';

  return (
    <div className="w-full py-8 sm:py-12 space-y-8">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.06em] text-[#4F6157] hover:text-[#14211A] transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change Inputs</span>
        </Link>

        {/* Location & Activity Metadata */}
        <div className="text-right text-xs font-mono text-[#4F6157]">
          <span>{location.name}</span> · <span className="uppercase font-semibold text-[#14211A]">{inputs.activity} {inputs.duration_min}m</span>
        </div>
      </div>

      {/* Timeline WindowStrip Across Full Container */}
      <div className="bg-white border border-[#D9E4D6] rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3 text-xs font-mono uppercase tracking-[0.06em] text-[#4F6157]">
          <span>Full Day Activity Horizon (05:00 – 20:00)</span>
          <span className="text-[#1F7A4C] font-semibold">RECOMMENDED VS USUAL</span>
        </div>
        <WindowStrip
          recommendedStart={best.start}
          recommendedEnd={best.end}
          usualStart={baseline.kind === 'usual' ? baseline.start : undefined}
          usualEnd={baseline.kind === 'usual' ? baseline.end : undefined}
        />
      </div>

      {/* Side-by-Side Laptop Layout: Hero (Left) + Chart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Hero Recommendation Showcase Card (5 cols) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#FFFFFF] to-[#F4F7F4] border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E4F2E8] border border-[#1F7A4C]/20 text-[#1F7A4C] text-xs font-mono font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-[#1F7A4C]" />
                <span>Cleanest Window</span>
              </div>

              {/* Animated Count-Up Pill */}
              <div className="bg-[#1F7A4C] text-white px-3.5 py-1 rounded-full font-mono font-bold text-xs">
                -{displayedPct}% Intake
              </div>
            </div>

            {/* Huge Recommended Time Window */}
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-[#4F6157] mb-1">
                RECOMMENDED OUTDOOR TIME
              </div>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-5xl font-bold tracking-tight text-[#14211A]">
                {best.label}
              </h1>
            </div>

            {/* Explanation sentence */}
            <p className="text-sm sm:text-base text-[#4F6157] leading-relaxed">
              You'd breathe in{' '}
              <strong className="text-[#1F7A4C] font-bold">
                {displayedPct}% less particulate pollution
              </strong>{' '}
              than {reductionText}.
            </p>

            {/* Subtitle metrics */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-1">
              <div className="p-2.5 rounded-xl bg-white border border-[#D9E4D6]">
                <div className="text-[10px] text-[#4F6157]">INHALED DOSE</div>
                <div className="font-bold text-[#14211A] text-sm">{best.dose_ug} µg</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-[#D9E4D6]">
                <div className="text-[10px] text-[#4F6157]">PEAK TEMP</div>
                <div className="font-bold text-[#14211A] text-sm">{best.temp_c}°C</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-[#D9E4D6]">
                <div className="text-[10px] text-[#4F6157]">INDEX SCORE</div>
                <div className="font-bold text-[#14211A] text-sm">{best.exposure_score}/100</div>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-3 pt-4 border-t border-[#D9E4D6]">
            <button
              type="button"
              onClick={() => navigate(`/plan/${plan.plan_id}/why`)}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-[#1F7A4C] to-[#155C39] hover:from-[#155C39] hover:to-[#0F4229] text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Why this time? (Ask the AI agent)</span>
            </button>

            <Link
              to={`/plan/${plan.plan_id}/change`}
              className="w-full py-3 px-6 bg-white border border-[#D9E4D6] hover:border-[#1F7A4C] text-[#14211A] hover:text-[#1F7A4C] rounded-xl font-semibold text-sm transition-colors text-center block shadow-2xs"
            >
              Try a change (What-if)
            </Link>

            {/* Confidence row */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-bold uppercase tracking-wider ${confBadgeStyle}`}>
                Confidence: {confidence.level}
              </span>
              <span className="text-[11px] font-mono text-[#4F6157]">{confidenceSummary}</span>
            </div>
          </div>
        </div>

        {/* Right: PM2.5 Hourly Forecast Chart Card (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#14211A]">
                Hourly PM2.5 Forecast & Temperature
              </h2>
              <p className="text-xs text-[#4F6157]">
                Copernicus atmospheric model calibrated against CPCB ground monitors
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-[#4F6157]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#E4F2E8] border border-[#1F7A4C]/40" />
                <span>Cleanest Window</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs border border-dashed border-[#14211A]" />
                <span>Usual Time</span>
              </span>
            </div>
          </div>

          <AirChart
            series={series}
            bestStart={best.start}
            bestEnd={best.end}
            usualStart={baseline.kind === 'usual' ? baseline.start : undefined}
            usualEnd={baseline.kind === 'usual' ? baseline.end : undefined}
          />
        </div>
      </div>

      {/* Lower Row Grid: Dose Comparison (Left) & Alternatives (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* "Dose, not AQI" Mini Educational Card */}
        <div className="bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#1F7A4C] font-semibold mb-1">
              <Zap className="w-3.5 h-3.5" />
              <span>Physiological Science · Dose, Not AQI</span>
            </div>
            <h3 className="font-serif text-lg font-bold text-[#14211A]">
              Why timing exercise matters more than checking AQI
            </h3>
            <p className="text-xs text-[#4F6157] leading-relaxed mt-1">
              AQI measures particulate density in the air. But your <strong>inhaled dose</strong> depends on how much air your lungs pull in. Running inhales twice as much air as walking (40 L/min vs 20 L/min) in the exact same air quality!
            </p>
          </div>

          {/* Visual Comparison Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="p-3.5 rounded-2xl bg-[#F4F7F4] border border-[#D9E4D6] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-[#14211A]">
                  <Footprints className="w-4 h-4 text-[#1F7A4C]" />
                  <span>Walking (45m)</span>
                </span>
                <span className="font-mono text-[11px] text-[#4F6157]">20 L/min</span>
              </div>
              <div className="w-full bg-[#D9E4D6] h-3 rounded-full overflow-hidden">
                <div className="bg-[#1F7A4C] h-full rounded-full" style={{ width: '50%' }} />
              </div>
              <div className="text-[11px] font-mono text-[#4F6157] flex justify-between">
                <span>900 Liters Volume</span>
                <span className="font-semibold text-[#14211A]">1x Baseline</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F4F7F4] border border-[#D9E4D6] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-[#14211A]">
                  <Flame className="w-4 h-4 text-[#FF9900]" />
                  <span>Running (45m)</span>
                </span>
                <span className="font-mono text-[11px] text-[#4F6157]">40 L/min</span>
              </div>
              <div className="w-full bg-[#D9E4D6] h-3 rounded-full overflow-hidden">
                <div className="bg-[#FF9900] h-full rounded-full" style={{ width: '100%' }} />
              </div>
              <div className="text-[11px] font-mono text-[#4F6157] flex justify-between">
                <span>1,800 Liters Volume</span>
                <span className="font-semibold text-[#B3261E]">2x Dose Inhaled</span>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Alternatives Shown as Cards */}
        <div className="bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#D9E4D6] pb-3">
            <h3 className="font-serif text-lg font-bold text-[#14211A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1F7A4C]" />
              <span>Alternative Slots & Baseline</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowOtherOptions(!showOtherOptions)}
              className="text-xs font-mono text-[#1F7A4C] hover:underline flex items-center gap-1"
            >
              <span>{showOtherOptions ? 'Hide' : 'View All'}</span>
              {showOtherOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {alternatives.map((alt, idx) => (
              <div
                key={alt.start}
                className="p-4 rounded-2xl bg-[#F4F7F4] border border-[#D9E4D6] space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#14211A]">
                    Alt #{idx + 1}
                  </span>
                  <span className="text-xs font-mono font-bold text-[#1F7A4C]">
                    -{alt.reduction_pct ?? 0}%
                  </span>
                </div>
                <div className="font-serif text-base font-bold text-[#14211A]">
                  {alt.label}
                </div>
                <div className="flex justify-between text-[11px] font-mono text-[#4F6157] pt-1 border-t border-[#D9E4D6]">
                  <span>Dose: {alt.dose_ug} µg</span>
                  <span>Temp: {alt.temp_c}°C</span>
                </div>
              </div>
            ))}

            {/* Baseline Card */}
            <div className="p-4 rounded-2xl bg-[#F4F7F4] border border-dashed border-[#14211A]/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#14211A]">
                  Baseline ({baseline.label})
                </span>
                <span className="text-xs font-mono text-[#4F6157]">Benchmark</span>
              </div>
              <div className="font-serif text-base font-bold text-[#14211A]">
                {baseline.start.substring(11, 16)}
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[#4F6157] pt-1 border-t border-[#D9E4D6]">
                <span>Dose: {baseline.dose_ug} µg</span>
                <span>Score: {baseline.exposure_score}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Notes */}
      {data_notes && data_notes.length > 0 && (
        <div className="text-xs font-mono text-[#B26A00] p-4 rounded-2xl bg-[#FFF5E6] border border-[#B26A00]/20">
          Note: {data_notes.join(' ')}
        </div>
      )}
    </div>
  );
};
