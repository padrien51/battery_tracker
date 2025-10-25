"""The Battery Tracker integration."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Battery Tracker component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Battery Tracker from a config entry."""
    ent_reg = er.async_get(hass)

    async def handle_set_battery_changed_date(call: ServiceCall):
        """Handle the service call to fire an event to update a battery changed date."""
        entity_ids = call.data.get("entity_id")
        changed_at_str = call.data.get("changed_at")

        if not entity_ids:
            return
        
        if isinstance(entity_ids, str):
            entity_ids = [entity_ids]

        target_datetime = datetime.now(timezone.utc)
        if changed_at_str:
            try:
                target_datetime = datetime.fromisoformat(str(changed_at_str)).astimezone(timezone.utc)
            except (ValueError, TypeError):
                _LOGGER.error(f"Invalid date format for 'changed_at': {changed_at_str}")
                return

        for entity_id in entity_ids:
            source_entity = ent_reg.async_get(entity_id)
            if not source_entity:
                _LOGGER.warning(f"Entity {entity_id} not found in registry")
                continue

            companion_unique_id = f"{source_entity.unique_id}-last-battery-change"
            
            _LOGGER.debug(f"Firing event to update {companion_unique_id}")
            hass.bus.async_fire(
                f"{DOMAIN}_update_event",
                {
                    "unique_id": companion_unique_id,
                    "datetime": target_datetime.isoformat(),
                },
            )

    hass.services.async_register(DOMAIN, "set_battery_changed_date", handle_set_battery_changed_date)
    entry.async_on_unload(
        lambda: hass.services.async_remove(DOMAIN, "set_battery_changed_date")
    )

    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, ["sensor"])
