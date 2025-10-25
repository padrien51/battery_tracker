"""Sensor platform for Battery Tracker."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from homeassistant.core import (
    HomeAssistant,
    callback,
    Event,
    EVENT_HOMEASSISTANT_START,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the sensor platform."""
    _LOGGER.info("Setting up Battery Tracker sensor platform.")
    tracker = BatteryTracker(hass, entry, async_add_entities)
    tracker.initialize()


class BatteryTracker:
    """Tracks battery sensors and creates companion 'last changed' sensors."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        async_add_entities: AddEntitiesCallback,
    ):
        self.hass = hass
        self.entry = entry
        self.async_add_entities = async_add_entities
        self.tracked_entities = set()

    def initialize(self):
        """Initial discovery of battery sensors."""
        _LOGGER.debug("Initializing Battery Tracker.")

        @callback
        def async_entity_registry_updated(event: Event):
            """Handle entity registry updates for entities added after startup."""
            if event.data["action"] == "create":
                entity_id = event.data.get("entity_id")
                self.hass.async_create_task(self.async_process_new_entity(entity_id))

        @callback
        def async_scan_existing_entities(event: Event):
            """Scan for existing entities when Home Assistant is started."""
            for entity in self.hass.states.async_all():
                self.hass.async_create_task(self.async_process_new_entity(entity.entity_id))

        self.entry.async_on_unload(
            self.hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, async_entity_registry_updated)
        )
        self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_START, async_scan_existing_entities)

    async def async_process_new_entity(self, entity_id: str):
        """Process a new entity to see if it should be tracked."""
        if not isinstance(entity_id, str) or not entity_id.startswith("sensor."):
            return

        state = self.hass.states.get(entity_id)
        if not state:
            return

        if state.attributes.get("device_class") == SensorDeviceClass.BATTERY:
            ent_reg = er.async_get(self.hass)
            entity_entry = ent_reg.async_get(entity_id)

            if not entity_entry or not entity_entry.unique_id:
                _LOGGER.warning(f"Cannot track {entity_id} because it has no unique_id.")
                return
            
            if entity_id in self.tracked_entities:
                return

            self.tracked_entities.add(entity_id)
            self.async_add_entities([BatteryLastChangedSensor(self.hass, entity_entry)])


class BatteryLastChangedSensor(SensorEntity):
    """Representation of a last battery change sensor."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, parent_entity: er.RegistryEntry) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._parent_entity = parent_entity
        self._attr_unique_id = f"{parent_entity.unique_id}-last-battery-change"
        sanitized_parent_id = parent_entity.entity_id.split(".")[-1]
        self.entity_id = f"sensor.{sanitized_parent_id}_last_battery_change"
        self._attr_native_value = None
        self._attr_device_class = None

        device_reg = dr.async_get(hass)
        parent_device = device_reg.async_get(parent_entity.device_id) if parent_entity.device_id else None
        
        self._attr_device_info = DeviceInfo(
            identifiers=parent_device.identifiers if parent_device else {(DOMAIN, parent_entity.unique_id)},
            name=parent_device.name if parent_device else parent_entity.name or sanitized_parent_id,
            manufacturer=parent_device.manufacturer if parent_device else None,
            model=parent_device.model if parent_device else None,
            via_device=parent_device.via_device_id if parent_device else None,
        )

    async def async_added_to_hass(self) -> None:
        """Listen for our custom update event."""
        await super().async_added_to_hass()

        @callback
        def handle_update_event(event: Event):
            """Handle the service call event."""
            if event.data.get("unique_id") == self.unique_id:
                new_datetime = datetime.fromisoformat(event.data.get("datetime"))
                self.async_update_state(new_datetime)

        self.async_on_remove(
            self.hass.bus.async_listen(f"{DOMAIN}_update_event", handle_update_event)
        )

    @property
    def name(self) -> str:
        return "Last battery change"

    @property
    def native_value(self):
        """Return the state of the sensor."""
        if self._attr_native_value is None:
            return "Non changée"
        return self._attr_native_value

    @callback
    def async_update_state(self, new_datetime: datetime):
        """Update the state of the sensor."""
        self._attr_device_class = SensorDeviceClass.TIMESTAMP
        self._attr_native_value = new_datetime
        self.async_write_ha_state()