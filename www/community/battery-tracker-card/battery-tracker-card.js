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
      ha-card {
        padding: 16px;
      }
      .card-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .no-entities {
        text-align: center;
        padding: 24px;
        color: var(--secondary-text-color);
        font-style: italic;
      }
      .area-group {
        border: 1px solid var(--divider-color, rgba(0,0,0,0.12));
        border-radius: 8px;
        padding: 0 16px;
      }
      .area-header {
        margin: 16px 0 8px 0;
        font-size: 1.1em;
        font-weight: 500;
        color: var(--primary-text-color);
        border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        padding-bottom: 8px;
      }
      .battery-entity-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        gap: 12px;
        border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.05));
      }
      .battery-entity-row:last-child {
        border-bottom: none;
      }
      .icon-name {
        display: flex;
        align-items: center;
        flex: 1 1 150px;
        gap: 12px;
        min-width: 150px;
      }
      ha-icon {
        --mdc-icon-size: 24px;
        flex-shrink: 0;
      }
      .name-container {
        display: flex;
        flex-direction: column;
      }
      .name {
        font-weight: 500;
        color: var(--primary-text-color);
        line-height: 1.2;
      }
      .controls-container {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        flex: 1 0 auto;
        justify-content: flex-end;
      }
      .state-badge {
        font-weight: 500;
        font-size: 0.9em;
        background: rgba(150, 150, 150, 0.1);
        padding: 4px 10px;
        border-radius: 16px;
        min-width: 40px;
        text-align: center;
        color: var(--primary-text-color);
      }
      .last-changed {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        color: var(--secondary-text-color);
        font-size: 0.85em;
        min-width: 90px;
      }
      .last-changed .absolute-date {
        color: var(--primary-text-color);
      }
      
      /* Modern button style */
      .action-button {
        background-color: transparent;
        color: var(--primary-color);
        border: 1px solid var(--primary-color);
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s, color 0.2s;
        text-transform: uppercase;
      }
      .action-button:hover {
        background-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
      }
      .action-button.confirm-button {
        background-color: var(--primary-color);
        color: var(--text-primary-color, white);
        border: none;
      }
      .action-button.confirm-button:hover {
        opacity: 0.9;
      }
      .action-button.cancel-button {
        border: none;
        color: var(--secondary-text-color);
      }
      .action-button.cancel-button:hover {
        background-color: rgba(150, 150, 150, 0.1);
      }

      /* Dialog styles */
      .dialog-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); justify-content: center; align-items: center; z-index: 100; backdrop-filter: blur(2px); }
      .dialog-content { background-color: var(--card-background-color, white); padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); text-align: center; max-width: 300px; width: 100%; }
      .dialog-content h3 { margin-top: 0; font-weight: 400; color: var(--primary-text-color); }
      .dialog-content input[type="date"] { width: 100%; padding: 10px; margin: 16px 0; font-size: 16px; color: var(--primary-text-color); background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: 8px; outline: none; }
      .dialog-content input[type="date"]:focus { border-color: var(--primary-color); }
      .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    `;

    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'dialog-overlay';
    const dialogContent = document.createElement('div');
    dialogContent.className = 'dialog-content';
    dialogContent.innerHTML = `
        <h3>Date de remplacement</h3>
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
        const lastKnownLevelId = companionEntity.entity_id.replace("_last_battery_change", "_last_known_battery_level");
        const lastKnownLevelState = hass.states[lastKnownLevelId];

        groups[areaName].push({
          name: originalState.attributes.friendly_name || originalId,
          battery_level: originalState.state,
          last_known_battery_level: lastKnownLevelState ? lastKnownLevelState.state : null,
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
      const areaGroup = document.createElement('div');
      areaGroup.className = 'area-group';

      const areaHeader = document.createElement('h3');
      areaHeader.className = 'area-header';
      areaHeader.textContent = areaName;
      areaGroup.appendChild(areaHeader);

      groups[areaName].forEach(entity => {
        const row = document.createElement('div');
        row.className = 'battery-entity-row';

        // Use last known level for icon calculation if current is unavailable
        const isUnavailable = entity.battery_level === 'unavailable' || entity.battery_level === 'unknown';
        const levelForIcon = isUnavailable && entity.last_known_battery_level ? entity.last_known_battery_level : entity.battery_level;
        
        const { icon, color } = this._getBatteryIconAndColor(levelForIcon);
        const iconEl = document.createElement('ha-icon');
        iconEl.icon = icon;
        iconEl.style.color = isUnavailable ? 'var(--state-disabled-color, #a0a0a0)' : color;

        const nameContainerEl = document.createElement('div');
        nameContainerEl.className = 'name-container';

        const nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = entity.name;
        nameContainerEl.appendChild(nameEl);

        const iconNameContainer = document.createElement('div');
        iconNameContainer.className = 'icon-name';
        iconNameContainer.appendChild(iconEl);
        iconNameContainer.appendChild(nameContainerEl);

        const stateEl = document.createElement('div');
        stateEl.className = 'state-badge';
        
        if (isUnavailable) {
            if (entity.last_known_battery_level && entity.last_known_battery_level !== 'unavailable' && entity.last_known_battery_level !== 'unknown') {
                stateEl.textContent = `${entity.last_known_battery_level}%`;
                stateEl.style.color = 'var(--warning-color, #ff9800)';
                stateEl.title = 'Dernière valeur connue avant indisponibilité';
                stateEl.style.background = 'rgba(255, 152, 0, 0.1)';
            } else {
                stateEl.textContent = entity.battery_level === 'unavailable' ? 'Indisp.' : 'Inconnu';
                stateEl.style.color = 'var(--state-disabled-color, #a0a0a0)';
            }
        } else {
            stateEl.textContent = `${entity.battery_level}%`;
        }

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
        buttonEl.textContent = 'CHANGÉE';
        buttonEl.addEventListener('click', () => this._openDatePicker(entity));

        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'controls-container';
        controlsContainer.appendChild(stateEl);
        controlsContainer.appendChild(lastChangedEl);
        controlsContainer.appendChild(buttonEl);

        row.appendChild(iconNameContainer);
        row.appendChild(controlsContainer);
        areaGroup.appendChild(row);
      });
      
      content.appendChild(areaGroup);
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
