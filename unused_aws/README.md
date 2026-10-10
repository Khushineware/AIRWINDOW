# Decommissioned AWS Serverless Infrastructure

This directory contains the original AWS Serverless Application Model (SAM) templates, Lambda handlers, DynamoDB/S3 storage adapters, and Bedrock model configurations that were used for AWS cloud deployments.

## Why Decommissioned
As per architecture requirements, AirWindow is configured to run fully self-contained in this local development and preview environment with **NO AWS account, NO AWS credentials, NO Bedrock, and NO Lambda/DynamoDB/S3**.

## Active Runtime
- **Backend Server**: Node.js + Express (`server.ts` / `src/server/`)
- **Agent Intelligence**: Google Gemini (`gemini-3.8-flash` via `@google/genai`) with Strands tool-calling pattern, anti-hallucination guard, and deterministic template fallback
- **Real Upstream APIs**: Open-Meteo Air Quality (CAMS PM2.5), Open-Meteo Weather Forecast (temperature), Open-Meteo Geocoding (India territory), and OpenAQ ground continuous monitoring stations
- **Persistence**: Lightweight zero-dependency local JSON file store (`data/plans.json` & `data/accuracy_logs.json`)
