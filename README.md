# AirWindow

> Tells people the cleanest time to do an outdoor activity in India, and explains why.

AirWindow is a responsive full-stack web application designed for citizens across India (runners, walkers, cyclists, outdoor workers) to schedule outdoor activities during times of lowest particulate air pollution (PM2.5) while accounting for thermal comfort and physiological ventilation rates.

---

## Architecture Decision & Runtime Environment

### Why Full-Stack Node/Express + TypeScript Core?
In this self-contained container environment, the runtime executes a single unified process on port 3000 (`tsx server.ts`). Python 3 is present without a package manager (`pip` is not available in the sandbox). To provide a **100% operational, real working backend** with zero mock fallbacks and NO external cloud accounts (no AWS credentials, no Bedrock, no Lambda/DynamoDB/S3):
1. **Core Algorithms Ported to TypeScript with Full Test Parity**:
   All core domain logic (`series`, `exposure`, `optimizer`, `correction`, `confidence`, `guard`) was ported from Python to TypeScript under `src/server/core/`. The test suite (`src/tests/run_all.ts`) validates 100% mathematical and logical parity against the Python unit tests.
2. **Local Full-Stack Server (`server.ts` & `src/server/routes.ts`)**:
   Express mounts the API endpoints under `/api/*` and integrates Vite in development mode as middleware on port 3000.
3. **Agent Intelligence with AWS Strands Agents SDK**:
   The `/api/agent/ask` service is built with the official AWS Strands Agents SDK (`@strands-agents/sdk`), using the Gemini model provider (`@strands-agents/sdk/models/google`) with `gemini-3.8-flash`. Four typed Strands tools (`tool()` with Zod input schemas) wrap the core logic. Real tool execution lifecycles and durations are recorded via Strands event hooks (`BeforeToolCallEvent`, `AfterToolCallEvent`). Responses are verified through an anti-hallucination guard (`verifyAgentAnswer`) with a deterministic template fallback.
4. **Lightweight Local Persistence**:
   Saved plans and forecast accuracy verification logs are persisted locally in `data/plans.json` and `data/accuracy_logs.json`—no external database needed.
5. **Decommissioned AWS Artifacts**:
   All AWS-specific serverless files (SAM `template.yaml`, `samconfig.toml`, `amplify.yml`, and DynamoDB/S3 adapters) have been safely isolated under `unused_aws/`.

---

## Role of the AWS Strands Agents SDK

AirWindow uses the open-source **AWS Strands Agents SDK** (`@strands-agents/sdk`) together with the Google Gemini model provider (`@strands-agents/sdk/models/google`) to power its scheduling explanation agent:

1. **Agent Orchestration**:
   An `Agent` instance coordinates reasoning using `GoogleModel` configured with the server-side `GEMINI_API_KEY` and `GEMINI_MODEL_ID` (default: `gemini-2.5-flash`).
2. **Typed Tools (`tool()` + Zod)**:
   Four deterministic tools are registered directly with the Strands Agent:
   - `get_forecast`: Retrieves atmospheric CAMS PM2.5 and temperature forecast series for Indian coordinates.
   - `compute_exposure`: Computes physiological inhaled dose (µg) based on activity ventilation rate and duration.
   - `optimize_schedule`: Evaluates candidate time windows across the forecast horizon against baseline.
   - `get_station_status`: Checks ground monitoring station freshness and confidence ratings.
3. **Real Tool Execution Trace via Event Hooks**:
   Instead of mock text or static timelines, Strands lifecycle hooks (`BeforeToolCallEvent` and `AfterToolCallEvent`) intercept each tool execution as it happens, capturing the tool name, exact input parameters, output payload, and live duration in milliseconds (`duration_ms`). This execution trace is returned in the API response and displayed on the "Why This Time" screen.
4. **Anti-Hallucination Guard**:
   The agent's synthesized response is verified by `verifyAgentAnswer`, checking that every cited number matches the tool outputs or verified plan facts. If verification fails after two attempts or if Gemini is unavailable, the system safely falls back to a deterministic explanation tagged `TEMPLATE EXPLANATION`. Successful verified answers are tagged `WRITTEN BY AI`.

---

## Data Pipeline & Real Upstream APIs

- **Open-Meteo Air Quality API**: CAMS-based PM2.5 numerical atmospheric chemistry forecast (hourly, timezone: Asia/Kolkata, past_days=2, forecast_days=2). No API key required.
- **Open-Meteo Weather Forecast API**: 2m ambient air temperature for heat stress penalties (>35°C threshold).
- **India Geocoding Cascade**: Photon (Komoot) autocomplete restricted to India (`Lat 6°N - 37°N`, `Lon 68°E - 98°E`), with OpenStreetMap Nominatim and Open-Meteo geocoding fallbacks, plus GPS reverse geocoding.
- **OpenAQ v3 Ground Observations**: Continuous monitoring stations within 25 km using OpenAQ API v3 exclusively with `X-API-Key` authentication. If key is missing or station data unavailable, falls back gracefully to uncorrected CAMS forecast with clear explanatory note.

---

## Core Algorithm Specifications

1. **Time Series Interpolation (`src/server/core/series.ts`)**:
   - Converts hourly forecast data into continuous 15-minute intervals via linear interpolation.
   - Categorizes every point using official Indian Central Pollution Control Board (CPCB) air quality standards:
     - Good (0–30 µg/m³)
     - Satisfactory (31–60 µg/m³)
     - Moderate (61–90 µg/m³)
     - Poor (91–120 µg/m³)
     - Very Poor (121–250 µg/m³)
     - Severe (>250 µg/m³)
2. **Physiological Dose Calculation (`src/server/core/exposure.ts`)**:
   - Computes actual inhaled mass in micrograms (µg):
     $$\text{Dose} (\mu\text{g}) = \sum \text{Effective PM2.5} \times \left(\frac{\text{Breathing Rate (L/min)}}{1000}\right) \times 15\text{ min}$$
   - Activity ventilation rates: Running (40 L/min), Walking (20 L/min), Cycling (30 L/min), Sports (35 L/min).
   - Consumer mask factor: 0.67 (33% particulate filtration).
3. **Sliding Window Schedule Optimizer (`src/server/core/optimizer.ts`)**:
   - Slides a window of requested duration in 15-minute steps across the search window.
   - Evaluates heat stress penalty: $+2\%$ per °C above 35°C.
   - Minimizes $\text{Rank Metric} = \text{Dose} \times (1 + \text{Heat Penalty})$.
   - Compares against baseline (user's usual time or window median) to compute particulate dose reduction percentage.
   - Selects top 2 non-overlapping alternative slots.
4. **Anti-Hallucination Guard (`src/server/core/guard.ts`)**:
   - Automatically extracts all numeric entities from LLM responses.
   - Cross-checks that every single number exists within tolerance in the tool outputs or plan JSON.
   - Rejects hallucinated numbers and triggers deterministic template fallback.

---

## Running Locally

### Install Dependencies
```bash
npm install
```

### Run Unit Tests
```bash
npm test
```
Executes the comprehensive algorithm test suite covering exposure calculation, optimizer ranking, heat stress penalties, confidence rules, and anti-hallucination verification.

### Start Full-Stack Dev Server
```bash
npm run dev
```
Starts Express + Vite on `http://localhost:3000`. The frontend communicates directly with `/api/*` endpoints.

---

## Environment Configuration (`.env`)

```ini
# Google Gemini API key: Automatically provided in AI Studio
GEMINI_API_KEY="your-gemini-key"

# OpenAQ API key (optional): for continuous ground monitoring calibration
OPENAQ_API_KEY=""

# Server Port (default 3000)
PORT="3000"

# Fixtures toggle (set to true only for UI mock development, default false)
VITE_USE_FIXTURES="false"
```
