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
from homeassistant.helpers.restore_state import RestoreEntity

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

        # Ignorer nos propres capteurs compagnons pour éviter une boucle infinie
        if entity_id.endswith("_last_known_battery_level") or entity_id.endswith("_last_battery_change"):
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
            self.async_add_entities([
                BatteryLastChangedSensor(self.hass, entity_entry),
                BatteryLastKnownLevelSensor(self.hass, entity_entry),
            ])


class BatteryLastChangedSensor(SensorEntity, RestoreEntity):
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

        if parent_device:
            self._attr_device_info = DeviceInfo(
                identifiers=parent_device.identifiers,
            )
        else:
            self._attr_device_info = DeviceInfo(
                identifiers={(DOMAIN, parent_entity.unique_id)},
                name=parent_entity.name or sanitized_parent_id,
            )

    async def async_added_to_hass(self) -> None:
        """Listen for our custom update event and restore state."""
        await super().async_added_to_hass()

        # Restore the last known state
        last_state = await self.async_get_last_state()
        if last_state and last_state.state not in ("unknown", "unavailable", "Non changée"):
            try:
                self.async_update_state(datetime.fromisoformat(last_state.state))
            except (ValueError, TypeError):
                _LOGGER.warning(f"Could not parse last state for {self.entity_id}: {last_state.state}")


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


class BatteryLastKnownLevelSensor(SensorEntity, RestoreEntity):
    """Representation of a sensor tracking the last known battery level."""

    _attr_has_entity_name = True
    _attr_device_class = SensorDeviceClass.BATTERY
    _attr_native_unit_of_measurement = "%"

    def __init__(self, hass: HomeAssistant, parent_entity: er.RegistryEntry) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._parent_entity = parent_entity
        self._attr_unique_id = f"{parent_entity.unique_id}-last-known-battery-level"
        sanitized_parent_id = parent_entity.entity_id.split(".")[-1]
        self.entity_id = f"sensor.{sanitized_parent_id}_last_known_battery_level"
        self._attr_native_value = None

        device_reg = dr.async_get(hass)
        parent_device = device_reg.async_get(parent_entity.device_id) if parent_entity.device_id else None

        if parent_device:
            self._attr_device_info = DeviceInfo(
                identifiers=parent_device.identifiers,
            )
        else:
            self._attr_device_info = DeviceInfo(
                identifiers={(DOMAIN, parent_entity.unique_id)},
                name=parent_entity.name or sanitized_parent_id,
            )

    async def async_added_to_hass(self) -> None:
        """Listen for state changes of the parent sensor."""
        await super().async_added_to_hass()
        from homeassistant.helpers.event import async_track_state_change_event

        # Restore the last known state
        last_state = await self.async_get_last_state()
        if last_state and last_state.state not in ("unknown", "unavailable"):
            try:
                self._attr_native_value = float(last_state.state)
            except ValueError:
                pass

        # Check current state of parent entity
        parent_state = self.hass.states.get(self._parent_entity.entity_id)
        if parent_state and parent_state.state not in ("unknown", "unavailable"):
            try:
                self._attr_native_value = float(parent_state.state)
            except ValueError:
                pass

        @callback
        def async_parent_state_changed(event: Event) -> None:
            """Handle parent state changes."""
            new_state = event.data.get("new_state")
            if new_state and new_state.state not in ("unknown", "unavailable"):
                try:
                    self._attr_native_value = float(new_state.state)
                    self.async_write_ha_state()
                except ValueError:
                    pass

        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [self._parent_entity.entity_id], async_parent_state_changed
            )
        )

    @property
    def name(self) -> str:
        return "Last known battery level"