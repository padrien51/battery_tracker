"""Config flow for Battery Tracker."""
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN

@config_entries.HANDLERS.register(DOMAIN)
class BatteryTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Battery Tracker."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Battery Tracker", data={})

        return self.async_show_form(
            step_id="user", data_schema=vol.Schema({})
        )
