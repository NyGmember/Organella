import json
import logging
from typing import Any, Dict, Optional

import redis.asyncio as redis

from organella_core.config import settings

logger = logging.getLogger("organella.event_bus")

_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def publish_event(channel: str, event_name: str, payload: Dict[str, Any]) -> bool:
    """
    Publishes an event to the Redis Event Bus for module listeners and background tasks.
    """
    message = {
        "event": event_name,
        "payload": payload,
    }
    try:
        client = get_redis_client()
        await client.publish(channel, json.dumps(message))
        logger.info(f"[EventBus] Published '{event_name}' to channel '{channel}'")
        return True
    except Exception as e:
        logger.warning(f"[EventBus] Failed to publish event '{event_name}' to Redis: {e}")
        return False


async def publish_patient_event(
    event_name: str, patient_id: str, hn: str, details: Optional[Dict[str, Any]] = None
):
    return await publish_event(
        channel="organella:patient_events",
        event_name=event_name,
        payload={
            "patient_id": patient_id,
            "hn": hn,
            "details": details or {},
        },
    )
