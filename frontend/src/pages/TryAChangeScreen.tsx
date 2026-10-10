import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Flame,
  Footprints,
  Bike,
  Trophy,
  Shield,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { getPlanById, postWhatIf } from '../api/client';
import { PlanData, WhatIfResponse } from '../types';
import { WindowStrip } from '../components/WindowStrip';

interface TryAChangeScreenProps {
  currentPlan?: PlanData | null;
  onPlanUpdated?: (plan: PlanData) => void;
}

const ACTIVITIES = [
  { id: 'running', label: 'Running', icon: Flame, rate: '40 L/min' },
  { id: 'walking', label: 'Walking', icon: Footprints, rate: '20 L/min' },
  { id: 'cycling', label: 'Cycling', icon: Bike, rate: '30 L/min' },
  { id: 'sports', label: 'Sports', icon: Trophy, rate: '35 L/min' },
] as const;

const DURATIONS = [15, 30, 45, 60, 90] as const;

export const TryAChangeScreen: React.FC<TryAChangeScreenProps> = ({
  currentPlan,
  onPlanUpdated,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [basePlan, setBasePlan] = useState<PlanData | null>(currentPlan || null);
  const [loadingBase, setLoadingBase] = useState<boolean>(!currentPlan);

  // Changed input states
  const [durationMin, setDurationMin] = useState<number>(currentPlan?.inputs.duration_min || 45);
  const [activity, setActivity] = useState<string>(currentPlan?.inputs.activity || 'running');
  const [mask, setMask] = useState<boolean>(currentPlan?.inputs.mask || false);

  // WhatIf results
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResponse | null>(null);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const debounceRef = useRef<any>(null);

  // Animated delta pct
  const [displayedDelta, setDisplayedDelta] = useState<number>(0);

  // Load base plan if missing
  useEffect(() => {
    if (!basePlan && id) {
      setLoadingBase(true);
      getPlanById(id)
        .then((p) => {
          setBasePlan(p);
          setDurationMin(p.inputs.duration_min);
          setActivity(p.inputs.activity);
          setMask(Boolean(p.inputs.mask));
          setLoadingBase(false);
        })
        .catch(() => setLoadingBase(false));
    }
  }, [id, basePlan]);

  // Recalculate what-if when inputs change with 300ms debounce
  useEffect(() => {
    if (!basePlan || !id) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setRecalculating(true);

    debounceRef.current = setTimeout(() => {
      postWhatIf({
        plan_id: basePlan.plan_id,
        changes: {
          duration_min: durationMin,
          activity,
          mask,
        },
      })
        .then((res) => {
          setWhatIfResult(res);
          setRecalculating(false);
        })
        .catch(() => {
          setRecalculating(false);
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [basePlan, id, durationMin, activity, mask]);

  // Animate delta counter
  useEffect(() => {
    if (whatIfResult) {
      const target = whatIfResult.delta_pct;
      let cur = 0;
      const step = Math.max(1, Math.floor(target / 15));
      const interval = setInterval(() => {
        cur += step;
        if (cur >= target) {
          setDisplayedDelta(target);
          clearInterval(interval);
        } else {
          setDisplayedDelta(cur);
        }
      }, 20);
      return () => clearInterval(interval);
    }
  }, [whatIfResult]);

  if (loadingBase) {
    return (
      <div className="w-full py-16 space-y-6">
        <div className="h-6 w-32 bg-[#D9E4D6] rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-80 bg-[#D9E4D6] rounded-3xl animate-pulse" />
          <div className="h-80 bg-[#D9E4D6] rounded-3xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!basePlan) {
    return (
      <div className="max-w-[560px] mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#E4F2E8] border border-[#1F7A4C]/20 flex items-center justify-center text-[#1F7A4C] mx-auto">
          <RotateCcw className="w-8 h-8" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-[#14211A]">Create a plan first</h2>
        <p className="text-sm text-[#4F6157] max-w-[40ch] mx-auto">
          Create an activity plan first to experiment with what-if scenarios like changing duration, activity, or wearing a mask.
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

  const beforeDose = whatIfResult ? whatIfResult.before.dose_ug : basePlan.best.dose_ug;
  const afterDose = whatIfResult ? whatIfResult.after.dose_ug : basePlan.best.dose_ug;
  const deltaPct = whatIfResult ? whatIfResult.delta_pct : 0;
  const maxBarDose = Math.max(beforeDose, afterDose, 1.0);
  const beforeWidthPct = Math.min(100, (beforeDose / maxBarDose) * 100);
  const afterWidthPct = Math.min(100, (afterDose / maxBarDose) * 100);

  const handleUseThisPlan = () => {
    if (whatIfResult && whatIfResult.plan_id) {
      navigate(`/plan/${whatIfResult.plan_id}`);
    } else {
      navigate(`/plan/${basePlan.plan_id}`);
    }
  };

  return (
    <div className="w-full py-8 sm:py-12 space-y-8">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          to={`/plan/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.06em] text-[#4F6157] hover:text-[#14211A] transition-colors py-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Best Time</span>
        </Link>

        <span className="text-xs font-mono text-[#4F6157]">
          What-If Exposure Sandbox
        </span>
      </div>

      {/* Screen Title */}
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#14211A] mb-2">
          What if you changed it?
        </h1>
        <p className="text-base text-[#4F6157] max-w-[65ch]">
          Adjust your duration, activity type, or mask usage to see the instantaneous impact on inhaled particulate dose.
        </p>
      </div>

      {/* Two-Column Laptop Layout: Controls on Left (6 cols), Before/After on Right (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Modification Interactive Controls (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-xs space-y-7">
          <h2 className="font-serif text-xl font-bold text-[#14211A] border-b border-[#D9E4D6] pb-3">
            Change Exercise Parameters
          </h2>

          {/* 1. Duration Chips */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-[#14211A]">
                Exercise Duration
              </label>
              <span className="text-sm font-mono font-bold text-[#1F7A4C]">{durationMin} minutes</span>
            </div>

            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map((dur) => (
                <button
                  type="button"
                  key={dur}
                  onClick={() => setDurationMin(dur)}
                  className={`py-2 px-5 text-sm font-mono font-semibold rounded-xl border transition-all ${
                    durationMin === dur
                      ? 'bg-[#1F7A4C] text-white border-[#1F7A4C] shadow-2xs'
                      : 'bg-[#F4F7F4]/70 text-[#14211A] border-[#D9E4D6] hover:bg-white hover:border-[#1F7A4C]/40'
                  }`}
                >
                  {dur} MIN
                </button>
              ))}
            </div>
          </div>

          {/* 2. Activity Chips with Icons */}
          <div className="space-y-2.5">
            <label className="text-sm font-semibold text-[#14211A]">
              Activity Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ACTIVITIES.map((act) => {
                const active = activity === act.id;
                const Icon = act.icon;
                return (
                  <button
                    type="button"
                    key={act.id}
                    onClick={() => setActivity(act.id)}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between h-20 ${
                      active
                        ? 'bg-[#1F7A4C] text-white border-[#1F7A4C] shadow-2xs'
                        : 'bg-[#F4F7F4]/70 text-[#14211A] border-[#D9E4D6] hover:bg-white hover:border-[#1F7A4C]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-[#1F7A4C]'}`} />
                      <span className={`text-[10px] font-mono ${active ? 'text-white/80' : 'text-[#4F6157]'}`}>
                        {act.rate}
                      </span>
                    </div>
                    <div className="font-semibold text-xs">{act.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Mask Toggle */}
          <div className="space-y-2.5 pt-1 border-t border-[#D9E4D6]">
            <label className="text-sm font-semibold text-[#14211A] flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#1F7A4C]" />
              <span>Wearing a mask?</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMask(false)}
                className={`py-3 px-4 rounded-xl border text-xs font-semibold transition-all ${
                  !mask
                    ? 'bg-[#1F7A4C] text-white border-[#1F7A4C] shadow-2xs'
                    : 'bg-[#F4F7F4]/70 text-[#14211A] border-[#D9E4D6] hover:bg-white'
                }`}
              >
                No mask (100% penetration)
              </button>
              <button
                type="button"
                onClick={() => setMask(true)}
                className={`py-3 px-4 rounded-xl border text-xs font-semibold transition-all ${
                  mask
                    ? 'bg-[#1F7A4C] text-white border-[#1F7A4C] shadow-2xs'
                    : 'bg-[#F4F7F4]/70 text-[#14211A] border-[#D9E4D6] hover:bg-white'
                }`}
              >
                Well-fitted mask (33% reduction)
              </button>
            </div>
            <p className="text-xs text-[#4F6157] mt-1.5">
              Mask factor: 0.67 particulate penetration assumption. Real-world sealing and fit varies.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-[#D9E4D6]">
            <button
              type="button"
              onClick={handleUseThisPlan}
              className="w-full sm:w-auto flex-1 py-3.5 px-6 bg-gradient-to-r from-[#1F7A4C] to-[#155C39] hover:from-[#155C39] hover:to-[#0F4229] text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Use this plan</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <Link
              to="/"
              className="w-full sm:w-auto py-3.5 px-6 bg-white border border-[#D9E4D6] hover:border-[#1F7A4C] text-[#14211A] rounded-xl font-semibold text-sm transition-colors text-center flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Start over</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Before/After Comparison Bars & Timeline (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Timeline Overview Card */}
          <div className="bg-white border border-[#D9E4D6] rounded-2xl p-5 shadow-2xs">
            <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#4F6157] mb-2">
              Reference Time Horizon
            </div>
            <WindowStrip
              recommendedStart={basePlan.best.start}
              recommendedEnd={basePlan.best.end}
            />
          </div>

          {/* Live Before/After Comparison Card */}
          <div className="bg-gradient-to-br from-[#FFFFFF] to-[#F4F7F4] border border-[#D9E4D6] rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D9E4D6] pb-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-[0.08em] text-[#1F7A4C] font-semibold mb-1">
                  RECOMPUTED INTAKE DELTA
                </div>
                {recalculating ? (
                  <div className="h-12 w-44 bg-[#D9E4D6] rounded-xl animate-pulse" />
                ) : (
                  <div className="font-serif text-4xl sm:text-5xl font-bold text-[#1F7A4C] tracking-tight">
                    {displayedDelta > 0 ? `${displayedDelta}% less dose` : 'Same intake'}
                  </div>
                )}
                <p className="text-sm text-[#4F6157] mt-1">
                  Inhaled dose shifts from <strong className="font-mono text-[#14211A]">{beforeDose} µg</strong> down to{' '}
                  <strong className="font-mono text-[#1F7A4C]">{afterDose} µg</strong> during the optimal slot.
                </p>
              </div>
            </div>

            {/* To-Scale Comparison Bars */}
            <div className="space-y-5 pt-1">
              {/* Before Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#4F6157] font-medium">
                    BEFORE: {basePlan.inputs.duration_min}m {basePlan.inputs.activity.toUpperCase()}
                  </span>
                  <span className="font-bold text-[#14211A] text-sm">{beforeDose} µg</span>
                </div>
                <div className="w-full bg-[#D9E4D6]/50 h-5 rounded-lg overflow-hidden p-0.5">
                  <div
                    className="bg-[#4F6157] h-full rounded-md transition-all duration-300"
                    style={{ width: `${beforeWidthPct}%` }}
                  />
                </div>
              </div>

              {/* After Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#1F7A4C] font-bold">
                    AFTER: {durationMin}m {activity.toUpperCase()}{mask ? ' + MASK' : ''}
                  </span>
                  <span className="font-extrabold text-[#1F7A4C] text-sm">{afterDose} µg</span>
                </div>
                <div className="w-full bg-[#D9E4D6]/50 h-5 rounded-lg overflow-hidden p-0.5">
                  <div
                    className="bg-gradient-to-r from-[#1F7A4C] to-[#155C39] h-full rounded-md transition-all duration-300 shadow-2xs"
                    style={{ width: `${afterWidthPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 text-xs text-[#4F6157] bg-white p-4 rounded-2xl border border-[#D9E4D6]">
              <strong>Calculation method:</strong> Inhaled dose equals the sum over 15-minute intervals of PM2.5 × (ventilation / 1000) × 15 minutes. If wearing a mask, effective PM2.5 is multiplied by 0.67.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
