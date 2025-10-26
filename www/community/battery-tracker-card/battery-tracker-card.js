class BatteryTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._editingEntityId = null;
  }

  setConfig(config) {
    if (this.shadowRoot.lastChild) this.shadowRoot.removeChild(this.shadowRoot.lastChild);

    const card = document.createElement('ha-card');
    card.header = config.title || 'Suivi des Piles';
    const style = document.createElement('style');
    const content = document.createElement('div');
    content.className = 'card-content';

    style.textContent = `
      .card-content { padding: 0 16px 16px; }
      .no-entities { text-align: center; padding-top: 16px; }
      .area-header { margin: 16px 0 8px 0; font-size: 1.2em; font-weight: 500; border-bottom: 1px solid var(--divider-color); padding-bottom: 4px; }
      .battery-entity-row { display: flex; align-items: center; padding: 8px 0; gap: 16px; }
      .icon-name { display: flex; align-items: center; flex: 1; gap: 16px; min-width: 0; }
      .name { font-weight: 500; word-break: break-word; }
      .state { width: 50px; text-align: right; }
      .last-changed { display: flex; flex-direction: column; align-items: flex-end; color: var(--secondary-text-color); font-size: 0.9em; }
      .last-changed .absolute-date { font-weight: 500; color: var(--primary-text-color); }
      .action-button { background-color: var(--primary-color); color: var(--text-primary-color, white); border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }

      /* Dialog styles */
      .dialog-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); justify-content: center; align-items: center; z-index: 10; }
      .dialog-content { background-color: var(--card-background-color, white); padding: 20px; border-radius: 8px; text-align: center; }
      .dialog-content h3 { margin-top: 0; }
      .dialog-content input[type="date"] { width: 100%; padding: 8px; margin: 16px 0; box-sizing: border-box; border: 1px solid var(--divider-color); border-radius: 4px; }
      .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
    `;

    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    const dialogContent = document.createElement('div');
    dialogContent.className = 'dialog-content';
    dialogContent.innerHTML = `
        <h3>Quand la pile a-t-elle été changée ?</h3>
        <input type="date" />
        <div class="dialog-actions">
            <button class="action-button cancel-button">Annuler</button>
            <button class="action-button confirm-button">Confirmer</button>
        </div>
    `;
    dialogOverlay.appendChild(dialogContent);

    card.appendChild(style);
    card.appendChild(content);
    this.shadowRoot.appendChild(card);
    this.shadowRoot.appendChild(dialogOverlay);

    dialogContent.querySelector('.cancel-button').addEventListener('click', () => this._closeDatePicker());
    dialogContent.querySelector('.confirm-button').addEventListener('click', () => this._confirmDateChange());

    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    const content = this.shadowRoot.querySelector('.card-content');
    if (!content) return;

    const groups = {};
    const noAreaGroupName = "Sans pièce";

    Object.values(hass.states)
      .filter(e => e.entity_id.startsWith("sensor.") && e.entity_id.endsWith("_last_battery_change"))
      .forEach(companionEntity => {
        const originalId = companionEntity.entity_id.replace("_last_battery_change", "");
        const originalState = hass.states[originalId];
        if (!originalState) return;

        let areaName = noAreaGroupName;
        const entityEntry = hass.entities[originalId];
        let areaId = null;

        if (entityEntry) {
          areaId = entityEntry.area_id;
          if (!areaId && entityEntry.device_id) {
            const deviceEntry = hass.devices[entityEntry.device_id];
            if (deviceEntry) areaId = deviceEntry.area_id;
          }
        }

        if (areaId) {
          const areaEntry = hass.areas[areaId];
          if (areaEntry && areaEntry.name) areaName = areaEntry.name;
        }

        if (!groups[areaName]) groups[areaName] = [];
        groups[areaName].push({
          name: originalState.attributes.friendly_name || originalId,
          battery_level: originalState.state,
          last_changed_iso: companionEntity.state,
          original_entity_id: originalId,
        });
      });

    Object.values(groups).forEach(group => group.sort((a, b) => a.name.localeCompare(b.name)));

    content.innerHTML = '';
    const sortedAreaNames = Object.keys(groups).sort((a, b) => {
      if (a === noAreaGroupName) return 1;
      if (b === noAreaGroupName) return -1;
      return a.localeCompare(b);
    });

    if (sortedAreaNames.length === 0) {
        content.innerHTML = '<div class="no-entities">Aucun capteur de batterie suivi trouvé.</div>';
        return;
    }

    sortedAreaNames.forEach(areaName => {
      const areaHeader = document.createElement('h3');
      areaHeader.className = 'area-header';
      areaHeader.textContent = areaName;
      content.appendChild(areaHeader);

      groups[areaName].forEach(entity => {
        const row = document.createElement('div');
        row.className = 'battery-entity-row';

        const { icon, color } = this._getBatteryIconAndColor(entity.battery_level);
        const iconEl = document.createElement('ha-icon');
        iconEl.icon = icon;
        iconEl.style.color = color;

        const nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = entity.name;

        const iconNameContainer = document.createElement('div');
        iconNameContainer.className = 'icon-name';
        iconNameContainer.appendChild(iconEl);
        iconNameContainer.appendChild(nameEl);

        const stateEl = document.createElement('div');
        stateEl.className = 'state';
        stateEl.textContent = `${entity.battery_level}%`;

        const lastChangedEl = document.createElement('div');
        lastChangedEl.className = 'last-changed';

        if (entity.last_changed_iso === 'Non changée') {
            const absoluteDate = document.createElement('div');
            absoluteDate.className = 'absolute-date';
            absoluteDate.textContent = 'Non changée';
            lastChangedEl.appendChild(absoluteDate);
        } else {
            const absoluteDate = document.createElement('div');
            absoluteDate.className = 'absolute-date';
            absoluteDate.textContent = new Date(entity.last_changed_iso).toLocaleDateString();
            const relativeDate = document.createElement('ha-relative-time');
            relativeDate.hass = this._hass;
            relativeDate.datetime = entity.last_changed_iso;
            lastChangedEl.appendChild(absoluteDate);
            lastChangedEl.appendChild(relativeDate);
        }

        const buttonEl = document.createElement('button');
        buttonEl.className = 'action-button';
        buttonEl.textContent = 'Changée';
        buttonEl.addEventListener('click', () => this._openDatePicker(entity));

        row.appendChild(iconNameContainer);
        row.appendChild(stateEl);
        row.appendChild(lastChangedEl);
        row.appendChild(buttonEl);
        content.appendChild(row);
      });
    });
  }

  _getBatteryIconAndColor(level) {
    const numericLevel = Number(level);
    let icon = 'mdi:battery';
    let color = 'var(--state-icon-color)';
    if (isNaN(numericLevel)) return { icon: 'mdi:battery-unknown', color: 'var(--state-disabled-color)' };
    if (numericLevel <= 10) { icon = 'mdi:battery-outline'; color = 'var(--label-badge-red)'; }
    else if (numericLevel <= 30) { icon = 'mdi:battery-30'; color = 'var(--label-badge-red)'; }
    else if (numericLevel <= 50) { icon = 'mdi:battery-50'; color = 'var(--label-badge-yellow)'; }
    else if (numericLevel <= 90) { icon = `mdi:battery-${Math.round(numericLevel / 10) * 10}`; }
    return { icon, color };
  }

  _openDatePicker(entity) {
    this._editingEntityId = entity.original_entity_id;
    const dialog = this.shadowRoot.querySelector('.dialog-overlay');
    const dateInput = dialog.querySelector('input[type="date"]');
    dateInput.value = new Date().toISOString().slice(0, 10);
    dialog.style.display = 'flex';
  }

  _closeDatePicker() {
    this.shadowRoot.querySelector('.dialog-overlay').style.display = 'none';
    this._editingEntityId = null;
  }

  _confirmDateChange() {
    const dateInput = this.shadowRoot.querySelector('input[type="date"]');
    if (dateInput.value && this._editingEntityId) {
      const now = new Date();
      const dateParts = dateInput.value.split('-');
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const day = parseInt(dateParts[2], 10);
      
      const selectedDate = new Date(); // Create a date object with current time
      selectedDate.setFullYear(year, month, day); // Set the date part
      
      const isoDate = selectedDate.toISOString();

      this._hass.callService('battery_tracker', 'set_battery_changed_date', {
        entity_id: this._editingEntityId,
        changed_at: isoDate,
      });
    }
    this._closeDatePicker();
  }

  getCardSize() { return 3; }
}

if (!customElements.get('battery-tracker-card')) {
  customElements.define('battery-tracker-card', BatteryTrackerCard);
}
