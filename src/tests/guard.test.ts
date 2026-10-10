import { verifyAgentAnswer } from '../server/core/guard';

export function runGuardTests() {
  console.log('Running Guard Tests...');

  const planData = {
    best: { label: '1:30 – 2:15 PM', dose_ug: 52.4, temp_c: 31.8, reduction_pct: 46 },
    inputs: { duration_min: 45, activity: 'running' },
    location: { name: 'Rohini' },
  };

  const badAnswer = 'You should go at 1:30 PM because pollution drops by 999 ug and you save 84 percent.';
  const { isValid: invalidCheck, unverified } = verifyAgentAnswer(badAnswer, planData);

  if (invalidCheck) {
    throw new Error('Guard should reject answer with unverified numbers 999 and 84');
  }
  if (!unverified.includes('999') && !unverified.includes('84')) {
    throw new Error(`Expected unverified to contain 999 or 84, got: ${unverified.join(', ')}`);
  }

  // Guard accepts cited and rounded numbers
  const goodPlanData = {
    best: { label: '1:30 – 2:15 PM', dose_ug: 52.4, temp_c: 31.8, reduction_pct: 46 },
    baseline: { label: 'your usual time', dose_ug: 97.2 },
    inputs: { duration_min: 45, activity: 'running' },
  };

  const goodAnswer = 'The cleanest time is 1:30 – 2:15 PM with 52.4 ug dose and 46 percent reduction.';
  const { isValid: validCheck, unverified: validUnverified } = verifyAgentAnswer(goodAnswer, goodPlanData);

  if (!validCheck) {
    throw new Error(`Guard should accept valid numbers, but rejected: ${validUnverified.join(', ')}`);
  }
  if (validUnverified.length !== 0) {
    throw new Error(`Expected empty unverified list, got: ${validUnverified.join(', ')}`);
  }

  // Guard accepts question numbers (e.g., 30 in 'What if I run 30 minutes?')
  const questionAnswer = 'If you run for 30 minutes, your dose is 52.4 ug with 46 percent reduction.';
  const { isValid: questionValidCheck, unverified: qUnverified } = verifyAgentAnswer(
    questionAnswer,
    goodPlanData,
    undefined,
    'What if I run 30 minutes?'
  );
  if (!questionValidCheck) {
    throw new Error(`Guard should accept number from user question, but rejected: ${qUnverified.join(', ')}`);
  }

  console.log('✓ Guard Tests Passed');
}
