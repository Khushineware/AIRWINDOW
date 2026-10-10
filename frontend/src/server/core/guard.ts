/**
 * Guard module: ensures LLM hallucination prevention by validating all numbers against source data.
 */

function extractNumbersFromStructure(
  data: any,
  foundFloats: Set<number>,
  foundStrings: Set<string>
): void {
  if (data === null || data === undefined) return;

  if (typeof data === 'number') {
    const val = Number(data);
    foundFloats.add(Math.round(val * 100) / 100);
    foundFloats.add(Math.round(val * 10) / 10);
    foundFloats.add(Math.round(val));
    foundStrings.add(String(Math.round(val)));
    foundStrings.add(String(Math.round(val * 10) / 10));
  } else if (typeof data === 'string') {
    const matches = data.matchAll(/(\d+(?:\.\d+)?)/g);
    for (const match of matches) {
      const numS = match[1];
      foundStrings.add(numS);
      const numF = parseFloat(numS);
      if (!isNaN(numF)) {
        foundStrings.add(String(numF));
        foundFloats.add(Math.round(numF * 100) / 100);
        foundFloats.add(Math.round(numF * 10) / 10);
        foundFloats.add(Math.round(numF));
      }
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      extractNumbersFromStructure(item, foundFloats, foundStrings);
    }
  } else if (typeof data === 'object') {
    for (const key of Object.keys(data)) {
      extractNumbersFromStructure(data[key], foundFloats, foundStrings);
    }
  }
}

export function extractNumbersFromText(text: string): Array<{ raw: string; val: number }> {
  const results: Array<{ raw: string; val: number }> = [];
  const matches = text.matchAll(/\b(\d+(?:\.\d+)?)\b/g);
  for (const m of matches) {
    const s = m[1];
    const val = parseFloat(s);
    if (!isNaN(val)) {
      results.push({ raw: s, val });
    }
  }
  return results;
}

export function verifyAgentAnswer(
  answer: string,
  planJson: any,
  toolOutputs?: any[],
  question?: string
): { isValid: boolean; unverified: string[] } {
  if (!answer || !answer.trim()) {
    return { isValid: true, unverified: [] };
  }

  const allowedFloats = new Set<number>();
  const allowedStrings = new Set<string>();

  extractNumbersFromStructure(planJson, allowedFloats, allowedStrings);

  if (toolOutputs) {
    for (const toolOut of toolOutputs) {
      extractNumbersFromStructure(toolOut, allowedFloats, allowedStrings);
    }
  }

  if (question) {
    extractNumbersFromStructure(question, allowedFloats, allowedStrings);
  }

  const answerNumbers = extractNumbersFromText(answer);
  const unverified: string[] = [];

  for (const { raw, val } of answerNumbers) {
    // 1. Exact string match
    if (allowedStrings.has(raw)) {
      continue;
    }

    // 2. Float tolerance match
    let isMatched = false;
    const rounded1 = Math.round(val * 10) / 10;
    const rounded0 = Math.round(val);

    if (allowedFloats.has(rounded1) || allowedFloats.has(rounded0)) {
      isMatched = true;
    } else {
      for (const allowedF of allowedFloats) {
        if (Math.abs(val - allowedF) <= 1.0) {
          isMatched = true;
          break;
        }
      }
    }

    if (!isMatched) {
      unverified.push(raw);
    }
  }

  return {
    isValid: unverified.length === 0,
    unverified,
  };
}
