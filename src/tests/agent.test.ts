import assert from 'assert';
import { PlanData } from '../types';
import { buildTemplateExplanation, createStrandsTools } from '../server/agent/geminiAgent';

export function runAgentTests() {
  console.log('Running Strands Agent & Tools Tests...');

  const mockPlan: PlanData = {
    plan_id: 'test-plan-123',
    location: { name: 'Connaught Place, Delhi', lat: 28.63, lon: 77.22 },
    inputs: {
      activity: 'running',
      duration_min: 45,
      window_start: '2026-10-10T06:00:00+05:30',
      window_end: '2026-10-10T12:00:00+05:30',
      mask: false,
    },
    best: {
      start: '2026-10-10T06:30:00+05:30',
      end: '2026-10-10T07:15:00+05:30',
      label: '6:30 AM – 7:15 AM',
      dose_ug: 18.5,
      exposure_score: 18.5,
      reduction_pct: 46,
      temp_c: 24.0,
    },
    baseline: {
      start: '2026-10-10T10:00:00+05:30',
      end: '2026-10-10T10:45:00+05:30',
      label: '10:00 AM – 10:45 AM',
      dose_ug: 34.2,
      exposure_score: 34.2,
      temp_c: 30.0,
      kind: 'usual',
    },
    alternatives: [],
    series: [
      { time: '2026-10-10T06:00:00+05:30', pm25: 35.0, pm25_raw: 35.0, temp_c: 24.0, category: 'Satisfactory' },
      { time: '2026-10-10T07:00:00+05:30', pm25: 42.0, pm25_raw: 42.0, temp_c: 25.0, category: 'Satisfactory' },
    ],
    confidence: {
      level: 'high',
      reasons: ['2 ground stations active within 25 km'],
      live_stations_count: 2,
      stale_stations_count: 0,
      total_stations: 2,
    },
    assumptions: {
      breathing_rate_lpm: 40.0,
      mask_factor: 0.67,
    },
    current: {
      pm25: 38.0,
      category: 'Satisfactory',
      updated_minutes_ago: 10,
      stations_used: 2,
    },
    data_notes: [],
  };

  // Test 1: Template explanation contains exact numbers
  const explanation = buildTemplateExplanation(mockPlan);
  assert(explanation.includes('6:30 AM – 7:15 AM'), 'Explanation contains best window');
  assert(explanation.includes('18.5 µg'), 'Explanation contains best dose');
  assert(explanation.includes('34.2 µg'), 'Explanation contains baseline dose');
  assert(explanation.includes('46%'), 'Explanation contains reduction percentage');

  // Test 1b: Question-aware template explanations
  const expl30 = buildTemplateExplanation(mockPlan, 'What if I run 30 minutes?');
  assert(expl30.includes('30 minutes'), 'Mentions 30 minutes');
  assert(expl30 !== explanation, 'Answer is different from general explanation');

  const explWalk = buildTemplateExplanation(mockPlan, 'Is walking safer?');
  assert(explWalk.includes('walking') && explWalk.includes('safer'), 'Mentions walking is safer');
  assert(explWalk !== explanation && explWalk !== expl30, 'Walking answer is unique');

  const explMorn = buildTemplateExplanation(mockPlan, 'Why not mornings?');
  assert(explMorn.includes('Morning') || explMorn.includes('morning'), 'Mentions morning inversions');
  assert(explMorn !== explanation, 'Mornings answer is unique');

  // Test 2: Strands tools instantiation and tool names
  const tools = createStrandsTools(mockPlan);
  assert.strictEqual(tools.length, 4, '4 Strands tools registered');
  const toolNames = tools.map((t) => t.name);
  assert(toolNames.includes('get_forecast'), 'Has get_forecast tool');
  assert(toolNames.includes('compute_exposure'), 'Has compute_exposure tool');
  assert(toolNames.includes('optimize_schedule'), 'Has optimize_schedule tool');
  assert(toolNames.includes('get_station_status'), 'Has get_station_status tool');

  console.log('✓ All Strands Agent & Tools tests passed.');
}
