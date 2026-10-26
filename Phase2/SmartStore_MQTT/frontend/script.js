const BACKEND_URL = 'http://10.0.0.72:5000';
const REFRESH_EVERY_MS = 3000;
const THERMOMETER_MIN_C = -10;
const THERMOMETER_MAX_C = 40;
const fridges = [{
		id: 'Frig1',
		displayName: 'Fridge 1'
	},
	{
		id: 'Frig2',
		displayName: 'Fridge 2'
	},
];
let currentThresholds = {};
let fanIsOn = false;
let lastAlertSeen = '';
let isFirstRefresh = true;
async function callBackend(path, options) {
	const response = await fetch(BACKEND_URL + path, {
		headers: {
			'Content-Type': 'application/json'
		},
		method: options.method,
		body: options.body,
	});
	const data = await response.json();
	if (!response.ok) {
		throw new Error(data.message);
	}
	return data;
}

function getStatusFromBackend() {
	return callBackend('/status', {
		method: 'GET'
	});
}

function sendNewThreshold(fridgeId, newThreshold) {
	return callBackend('/thresholds/' + fridgeId, {
		method: 'PUT',
		body: JSON.stringify({
			threshold: newThreshold
		}),
	});
}

function sendFanCommand(turnOn) {
	const state = turnOn ? 'ON' : 'OFF';
	return callBackend('/fan', {
		method: 'POST',
		body: JSON.stringify({
			state: state
		}),
	});
}

function createThermometerHtml() {
	return `
    <svg class="thermo" viewBox="0 0 70 228" role="img" aria-label="Temperature gauge">
      <rect class="thermometer-liquid fill" x="25" y="170" width="10" height="0" rx="5" fill="var(--cold)"/>
      <circle class="thermometer-bulb" cx="30" cy="198" r="16" fill="var(--cold)"/>
      <path class="tube" d="M22 176V18a8 8 0 0 1 16 0V176a24 24 0 1 1-16 0Z"/>
      <line class="tick" x1="38" x2="52" y1="170" y2="170"/>
      <line class="tick" x1="38" x2="46" y1="130" y2="130"/>
      <line class="tick" x1="38" x2="52" y1="90" y2="90"/>
      <line class="tick" x1="38" x2="46" y1="50" y2="50"/>
      <line class="tick" x1="38" x2="52" y1="10" y2="10"/>
      <line class="thermometer-threshold-line limit" x1="14" x2="60" y1="100" y2="100"/>
    </svg>`;
}

function createHumidityGaugeHtml() {
	return `
    <svg class="arc" viewBox="0 0 200 120" role="img" aria-label="Humidity gauge">
      <path class="track" d="M20 100A80 80 0 0 1 180 100" pathLength="100"/>
      <path class="humidity-arc val" d="M20 100A80 80 0 0 1 180 100" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
      <text class="end" x="20" y="118" text-anchor="middle">0</text>
      <text class="end" x="180" y="118" text-anchor="middle">100</text>
      <text class="humidity-number num" x="100" y="92" text-anchor="middle">–</text>
      <text class="sub" x="100" y="110" text-anchor="middle">percent</text>
    </svg>`;
}

function createFridgeCardHtml(fridge) {
	return `
    <section class="fridge" id="card-${fridge.id}">
      <h2>${fridge.displayName} <span class="badge fridge-status">Waiting for data</span></h2>

      <div class="gauge">
        <h3>Temperature</h3>
        ${createThermometerHtml()}
        <div class="reading temperature-text">–</div>
      </div>

      <div class="gauge">
        <h3>Humidity</h3>
        ${createHumidityGaugeHtml()}
      </div>

      <div class="threshold">
        <h3>${fridge.displayName} temp. threshold</h3>
        <p class="big threshold-text">–</p>
        <form class="hidden threshold-form">
          <input class="threshold-input" type="number" step="0.5" min="-30" max="60" required>
          <button class="primary">Save</button>
          <button type="button" class="cancel-button">Cancel</button>
        </form>
        <button type="button" class="edit-button">Edit</button>
      </div>
    </section>`;
}

function showThresholdForm(card, fridgeId) {
	card.querySelector('.threshold-input').value = currentThresholds[fridgeId];
	card.querySelector('.threshold-form').classList.remove('hidden');
	card.querySelector('.edit-button').classList.add('hidden');
	card.querySelector('.threshold-input').focus();
}

function hideThresholdForm(card) {
	card.querySelector('.threshold-form').classList.add('hidden');
	card.querySelector('.edit-button').classList.remove('hidden');
}
async function saveThreshold(card, fridge) {
	const newThreshold = parseFloat(card.querySelector('.threshold-input').value);
	try {
		await sendNewThreshold(fridge.id, newThreshold);
		currentThresholds[fridge.id] = newThreshold;
		card.querySelector('.threshold-text').textContent = newThreshold + ' °C';
		hideThresholdForm(card);
		showToast(fridge.displayName + ' threshold saved', 'Now ' + newThreshold + ' °C', 'info');
		refreshDashboard();
	} catch (error) {
		showToast('Could not save threshold', error.message);
	}
}
async function toggleFan() {
	try {
		const result = await sendFanCommand(!fanIsOn);
		showFanState(result.fan === 'ON');
	} catch (error) {
		showToast('Could not change the fan', 'Check the connection to the Raspberry Pi.');
	}
}

function buildDashboard() {
	const container = document.querySelector('#fridges');
	container.innerHTML = '';
	for (const fridge of fridges) {
		container.innerHTML += createFridgeCardHtml(fridge);
	}
	for (const fridge of fridges) {
		const card = document.querySelector('#card-' + fridge.id);
		currentThresholds[fridge.id] = '';
		card.querySelector('.edit-button').onclick = function() {
			showThresholdForm(card, fridge.id);
		};
		card.querySelector('.cancel-button').onclick = function() {
			hideThresholdForm(card);
		};
		card.querySelector('.threshold-form').onsubmit = function(event) {
			event.preventDefault();
			saveThreshold(card, fridge);
		};
	}
	document.querySelector('#fanBtn').onclick = toggleFan;
}

function temperatureToPercent(temperature) {
	const percent = (temperature - THERMOMETER_MIN_C) / (THERMOMETER_MAX_C - THERMOMETER_MIN_C);
	if (percent < 0) return 0;
	if (percent > 1) return 1;
	return percent;
}

function showThermometer(card, temperature, threshold, isTooWarm) {
	const liquidHeight = temperatureToPercent(temperature) * 160;
	const liquid = card.querySelector('.thermometer-liquid');
	liquid.setAttribute('y', 170 - liquidHeight);
	liquid.setAttribute('height', liquidHeight + 10);
	let color = 'var(--ok)';
	if (isTooWarm) {
		color = 'var(--hot)';
	} else if (temperature < 0) {
		color = 'var(--cold)';
	}
	liquid.setAttribute('fill', color);
	card.querySelector('.thermometer-bulb').setAttribute('fill', color);
	if (threshold !== null && threshold !== undefined) {
		const lineY = 170 - temperatureToPercent(threshold) * 160;
		const line = card.querySelector('.thermometer-threshold-line');
		line.setAttribute('y1', lineY);
		line.setAttribute('y2', lineY);
	}
	card.querySelector('.temperature-text').textContent = temperature.toFixed(1) + ' °C';
}

function showHumidity(card, humidity) {
	let percent = humidity;
	if (percent < 0) percent = 0;
	if (percent > 100) percent = 100;
	card.querySelector('.humidity-arc').setAttribute('stroke-dashoffset', 100 - percent);
	card.querySelector('.humidity-number').textContent = Number(humidity).toFixed(2);
}

function showFridgeStatus(card, isTooWarm) {
	const badge = card.querySelector('.fridge-status');
	if (isTooWarm) {
		badge.textContent = 'Over threshold';
		badge.classList.add('hot');
		card.classList.add('alert');
	} else {
		badge.textContent = 'Normal';
		badge.classList.remove('hot');
		card.classList.remove('alert');
	}
}

function showThreshold(card, fridgeId, threshold) {
	currentThresholds[fridgeId] = threshold;
	const formIsOpen = !card.querySelector('.threshold-form').classList.contains('hidden');
	if (!formIsOpen) {
		card.querySelector('.threshold-text').textContent = threshold + ' °C';
	}
}

function showFridge(fridge, reading, threshold) {
	const card = document.querySelector('#card-' + fridge.id);
	if (threshold !== null && threshold !== undefined) {
		showThreshold(card, fridge.id, threshold);
	}
	if (!reading || reading.temperature === null) {
		return;
	}
	const isTooWarm = threshold !== null && threshold !== undefined && reading.temperature > threshold;
	showThermometer(card, reading.temperature, threshold, isTooWarm);
	showHumidity(card, reading.humidity);
	showFridgeStatus(card, isTooWarm);
}

function showFanState(isOn) {
	fanIsOn = isOn;
	document.querySelector('#fanState').textContent = isOn ? 'Fan on' : 'Fan off';
	document.querySelector('#fanState').classList.toggle('off', !isOn);
	document.querySelector('#fanBtn').textContent = isOn ? 'Turn fan off' : 'Turn fan on';
}

function showToast(title, message, type) {
	const toast = document.createElement('div');
	toast.className = 'toast ' + (type || '');
	const titleElement = document.createElement('b');
	titleElement.textContent = title;
	const messageElement = document.createElement('span');
	messageElement.textContent = message;
	toast.appendChild(titleElement);
	toast.appendChild(messageElement);
	document.querySelector('#toasts').appendChild(toast);
	setTimeout(function() {
		toast.remove();
	}, 9000);
}

function showAlertIfNew(alert) {
	if (!alert) return;
	const alertId = alert.fridge + alert.time + alert.message;
	if (alertId === lastAlertSeen) return;
	lastAlertSeen = alertId;
	if (isFirstRefresh) return;
	const fridge = fridges.find(function(f) {
		return f.id === alert.fridge;
	});
	const title = fridge.displayName + ' is too warm';
	const message = alert.message + ' (' + alert.time + ')';
	showToast(title, message);
	if ('Notification' in window && Notification.permission === 'granted') {
		new Notification(title, {
			body: message
		});
	}
}
async function refreshDashboard() {
	const statusText = document.querySelector('#status');
	try {
		const status = await getStatusFromBackend();
		for (const fridge of fridges) {
			showFridge(fridge, status[fridge.id], status.thresholds[fridge.id]);
		}
		showFanState(status.fan === 'ON');
		showAlertIfNew(status.alert);
		isFirstRefresh = false;
		statusText.textContent = 'Live · updated ' + new Date().toLocaleTimeString();
		statusText.classList.remove('bad');
	} catch (error) {
		statusText.textContent = 'Can’t reach the Raspberry Pi – retrying';
		statusText.classList.add('bad');
	}
}
buildDashboard();
if ('Notification' in window && Notification.permission === 'default') {
	Notification.requestPermission();
}
refreshDashboard();
setInterval(refreshDashboard, REFRESH_EVERY_MS);