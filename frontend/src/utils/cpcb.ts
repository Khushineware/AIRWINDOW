import { CpcbCategory } from '../types';

export const CPCB_COLORS: Record<CpcbCategory, string> = {
  Good: '#00B050',
  Satisfactory: '#92D050',
  Moderate: '#FFD400',
  Poor: '#FF9900',
  'Very Poor': '#E8341C',
  Severe: '#8B0000',
};

export const CPCB_BG_LIGHT: Record<CpcbCategory, string> = {
  Good: '#E6F8ED',
  Satisfactory: '#F3F9EA',
  Moderate: '#FFFDE6',
  Poor: '#FFF5E6',
  'Very Poor': '#FDECE9',
  Severe: '#F6E6E6',
};

export const CPCB_TEXT_DARK: Record<CpcbCategory, string> = {
  Good: '#0B6431',
  Satisfactory: '#476D19',
  Moderate: '#876700',
  Poor: '#A65100',
  'Very Poor': '#B3210F',
  Severe: '#6E0707',
};

export const CPCB_ADVISORIES: Record<CpcbCategory, string> = {
  Good: 'Minimal impact. Ideal for all outdoor aerobic activities.',
  Satisfactory: 'Minor breathing discomfort for sensitive individuals.',
  Moderate: 'Breathing discomfort to people with lungs, asthma, and heart diseases.',
  Poor: 'Breathing discomfort to most people on prolonged outdoor exposure.',
  'Very Poor': 'Respiratory illness on prolonged exposure. Clean window timing critical.',
  Severe: 'Affects healthy people and seriously impacts those with existing diseases.',
};

export function classifyCpcb(pm25: number): CpcbCategory {
  const v = Math.round(pm25);
  if (v <= 30) return 'Good';
  if (v <= 60) return 'Satisfactory';
  if (v <= 90) return 'Moderate';
  if (v <= 120) return 'Poor';
  if (v <= 250) return 'Very Poor';
  return 'Severe';
}
