"""Storage module: manages DynamoDB single-table persistence and S3 raw snapshots."""
from __future__ import annotations
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Environment variables injected by SAM template
TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "AirWindowTable")
BUCKET_NAME = os.environ.get("SNAPSHOT_BUCKET_NAME", "airwindow-snapshots-local")

# Lazy boto3 initialization for cold-start performance & unit testing
_dynamodb = None
_s3 = None


def get_dynamo_resource():
    global _dynamodb
    if _dynamodb is None:
        import boto3
        _dynamodb = boto3.resource("dynamodb")
    return _dynamodb


def get_s3_client():
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3")
    return _s3


def make_location_key(lat: float, lon: float) -> str:
    """Canonical 2-decimal rounded location key for privacy and grouping."""
    return f"{round(lat, 2):.2f}_{round(lon, 2):.2f}"


# --- Plan Operations ---

def save_plan(plan_data: Dict[str, Any]) -> None:
    """Save user plan to DynamoDB with 7-day TTL."""
    table = get_dynamo_resource().Table(TABLE_NAME)
    plan_id = plan_data["plan_id"]
    ttl_timestamp = int(time.time()) + (7 * 86400)  # 7 days

    item = {
        "PK": f"PLAN#{plan_id}",
        "SK": "META",
        "ttl": ttl_timestamp,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data": json.dumps(plan_data),
    }
    table.put_item(Item=item)

    # Write TRACK#location item so hourly ingest monitors this area
    loc = plan_data.get("location", {})
    lat = loc.get("lat")
    lon = loc.get("lon")
    if lat is not None and lon is not None:
        track_key = make_location_key(float(lat), float(lon))
        track_ttl = int(time.time()) + (48 * 3600)  # 48 hours
        table.put_item(
            Item={
                "PK": f"TRACK#{track_key}",
                "SK": "META",
                "ttl": track_ttl,
                "lat": str(round(float(lat), 4)),
                "lon": str(round(float(lon), 4)),
                "name": loc.get("name", "Unknown"),
                "last_requested": datetime.now(timezone.utc).isoformat(),
            }
        )


def get_plan(plan_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve saved plan from DynamoDB."""
    table = get_dynamo_resource().Table(TABLE_NAME)
    resp = table.get_item(Key={"PK": f"PLAN#{plan_id}", "SK": "META"})
    item = resp.get("Item")
    if not item or "data" not in item:
        return None
    return json.loads(item["data"])


# --- Active Tracking Locations ---

def get_active_tracking_locations() -> List[Dict[str, Any]]:
    """Query currently tracked active locations from DynamoDB."""
    table = get_dynamo_resource().Table(TABLE_NAME)
    # Query or scan for TRACK# partition keys
    resp = table.scan(
        FilterExpression="begins_with(PK, :track_prefix) AND SK = :meta",
        ExpressionAttributeValues={":track_prefix": "TRACK#", ":meta": "META"},
    )
    items = resp.get("Items", [])
    locations = []
    for it in items:
        try:
            locations.append({
                "key": it["PK"].replace("TRACK#", ""),
                "lat": float(it["lat"]),
                "lon": float(it["lon"]),
                "name": it.get("name", "Tracked Location"),
            })
        except Exception:
            continue
    return locations


# --- Forecast Logs & MAE Trust Metrics ---

def log_lead12_forecast(
    loc_key: str,
    target_hour_iso: str,
    pm25_raw: float,
    pm25_calibrated: float,
) -> None:
    """Store a 12-hour-lead forecast target for later verification against observations."""
    table = get_dynamo_resource().Table(TABLE_NAME)
    ttl_timestamp = int(time.time()) + (8 * 86400)  # 8 days
    item = {
        "PK": f"LOC#{loc_key}",
        "SK": f"LEAD12#{target_hour_iso}",
        "ttl": ttl_timestamp,
        "target_hour": target_hour_iso,
        "pm25_raw": str(round(pm25_raw, 1)),
        "pm25_calibrated": str(round(pm25_calibrated, 1)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    table.put_item(Item=item)


def fill_observed_reading(
    loc_key: str,
    target_hour_iso: str,
    observed_pm25: float,
) -> None:
    """Update a previously logged forecast with verified ground observed PM2.5."""
    table = get_dynamo_resource().Table(TABLE_NAME)
    try:
        table.update_item(
            Key={"PK": f"LOC#{loc_key}", "SK": f"LEAD12#{target_hour_iso}"},
            UpdateExpression="SET observed_pm25 = :obs",
            ExpressionAttributeValues={":obs": str(round(observed_pm25, 1))},
        )
    except Exception as e:
        logger.warning(f"Could not fill observed reading: {e}")


def compute_trust_metrics(lat: float, lon: float) -> Dict[str, Any]:
    """Compute Mean Absolute Error (MAE) from 12-hour-lead forecast log over the last 7 days.
    
    If fewer than 24 pairs, return mae: null and since date ('collecting data').
    """
    loc_key = make_location_key(lat, lon)
    table = get_dynamo_resource().Table(TABLE_NAME)
    resp = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
        ExpressionAttributeValues={
            ":pk": f"LOC#{loc_key}",
            ":sk_prefix": "LEAD12#",
        },
        Limit=200,
    )
    items = resp.get("Items", [])

    raw_errors = []
    calibrated_errors = []
    earliest_date = None

    for item in items:
        if "observed_pm25" in item and "pm25_raw" in item and "pm25_calibrated" in item:
            obs = float(item["observed_pm25"])
            r_pred = float(item["pm25_raw"])
            c_pred = float(item["pm25_calibrated"])
            raw_errors.append(abs(obs - r_pred))
            calibrated_errors.append(abs(obs - c_pred))

        th = item.get("target_hour")
        if th and (earliest_date is None or th < earliest_date):
            earliest_date = th

    pairs = len(raw_errors)
    since_str = earliest_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if pairs < 24:
        return {
            "mae_raw": None,
            "mae_corrected": None,
            "pairs": pairs,
            "since": since_str,
            "status_text": "collecting data",
        }

    mae_raw = round(sum(raw_errors) / pairs, 1)
    mae_corr = round(sum(calibrated_errors) / pairs, 1)

    return {
        "mae_raw": mae_raw,
        "mae_corrected": mae_corr,
        "pairs": pairs,
        "since": since_str,
        "status_text": "verified",
    }


# --- Pipeline Status Items ---

def save_ingest_step_status(step_name: str, aws_services: str, ok: bool, details: Optional[str] = None) -> None:
    """Record health and execution timestamp of an ingest pipeline step."""
    table = get_dynamo_resource().Table(TABLE_NAME)
    item = {
        "PK": f"INGEST#{step_name}",
        "SK": "META",
        "ttl": int(time.time()) + (14 * 86400),
        "name": step_name,
        "aws": aws_services,
        "last_run": datetime.now(timezone.utc).isoformat(),
        "ok": ok,
        "details": details or "OK",
    }
    table.put_item(Item=item)


def get_all_step_statuses() -> List[Dict[str, Any]]:
    """Return latest status of all pipeline steps."""
    table = get_dynamo_resource().Table(TABLE_NAME)
    resp = table.scan(
        FilterExpression="begins_with(PK, :prefix) AND SK = :meta",
        ExpressionAttributeValues={":prefix": "INGEST#", ":meta": "META"},
    )
    items = resp.get("Items", [])
    
    # Standard steps expected by system architecture
    step_order = ["Data", "Forecast", "Plan", "Explain", "Deliver"]
    found_map = {it.get("name"): it for it in items}
    
    results = []
    now_iso = datetime.now(timezone.utc).isoformat()
    defaults = {
        "Data": {"aws": "EventBridge + Lambda (ingest) + S3", "ok": True},
        "Forecast": {"aws": "Open-Meteo CAMS + OpenAQ + DynamoDB", "ok": True},
        "Plan": {"aws": "API Gateway HTTP API + Lambda (api)", "ok": True},
        "Explain": {"aws": "Strands SDK + Amazon Bedrock", "ok": True},
        "Deliver": {"aws": "AWS Amplify Hosting (SPA)", "ok": True},
    }

    for step in step_order:
        if step in found_map:
            it = found_map[step]
            results.append({
                "name": step,
                "aws": it.get("aws", defaults.get(step, {}).get("aws", "AWS")),
                "last_run": it.get("last_run", now_iso),
                "ok": bool(it.get("ok", True)),
            })
        else:
            def_meta = defaults.get(step, {"aws": "AWS", "ok": True})
            results.append({
                "name": step,
                "aws": def_meta["aws"],
                "last_run": now_iso,
                "ok": def_meta["ok"],
            })
    return results


# --- S3 Raw Snapshots ---

def save_raw_snapshot(location_key: str, snapshot_data: Dict[str, Any]) -> str:
    """Save raw Open-Meteo & OpenAQ JSON snapshot to private S3 bucket."""
    s3 = get_s3_client()
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    s3_key = f"raw/{location_key}/{ts}.json"
    
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=s3_key,
        Body=json.dumps(snapshot_data),
        ContentType="application/json",
    )
    return s3_key


def get_latest_snapshot(location_key: str, max_age_hours: float = 6.0) -> Optional[Dict[str, Any]]:
    """Retrieve the most recent S3 raw snapshot if under max_age_hours old."""
    s3 = get_s3_client()
    prefix = f"raw/{location_key}/"
    try:
        resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix, MaxKeys=20)
        contents = resp.get("Contents", [])
        if not contents:
            return None

        # Sort descending by LastModified
        sorted_objs = sorted(contents, key=lambda x: x["LastModified"], reverse=True)
        latest_obj = sorted_objs[0]

        age_seconds = (datetime.now(timezone.utc) - latest_obj["LastModified"]).total_seconds()
        if age_seconds > (max_age_hours * 3600.0):
            return None

        obj_resp = s3.get_object(Bucket=BUCKET_NAME, Key=latest_obj["Key"])
        body = obj_resp["Body"].read().decode("utf-8")
        data = json.loads(body)
        data["_snapshot_age_hours"] = round(age_seconds / 3600.0, 1)
        return data
    except Exception as e:
        logger.warning(f"Error checking S3 snapshot for {location_key}: {e}")
        return None
