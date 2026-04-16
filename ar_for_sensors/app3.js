let sensors = [];
let selectedSensorIndex = null;
let selectedSensorEntity = null;
let trackingIntervalId = null;
let currentUserLat = null;
let currentUserLon = null;
let lastDistanceMeters = null;
let appInitialized = false;

AFRAME.registerComponent("look-at-y", {
  init: function () {
    this.targetPos = new THREE.Vector3();
    this.selfPos = new THREE.Vector3();
    this.cameraEuler = new THREE.Euler();
  },

  tick: function () {
    if (
      selectedSensorIndex === null ||
      currentUserLat === null ||
      currentUserLon === null
    ) {
      return;
    }

    const camera = document.querySelector("[gps-new-camera]");
    if (!camera) return;

    const sensor = sensors[selectedSensorIndex];
    if (!sensor) return;

    // Use real geographic bearing from user location to selected sensor.
    const targetAngle = getBearingRadians(
      currentUserLat,
      currentUserLon,
      sensor.latitude,
      sensor.longitude,
    );

    this.cameraEuler.setFromQuaternion(camera.object3D.quaternion, "YXZ");
    const cameraYaw = this.cameraEuler.y;

    const modelYawOffset = Math.PI;
    const desiredAngle = targetAngle - cameraYaw + modelYawOffset;

    const currentAngle = this.el.object3D.rotation.y;
    const smoothing = 0.25;
    const angleDiff = Math.atan2(
      Math.sin(desiredAngle - currentAngle),
      Math.cos(desiredAngle - currentAngle),
    );

    this.el.object3D.rotation.y = currentAngle + angleDiff * smoothing;
  },
});

function formatDistance(distance) {
  if (distance < 1000) return `${distance.toFixed(2)} meters`;
  return `${(distance / 1000).toFixed(2)} km`;
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function getBearingRadians(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const lambda1 = toRadians(lon1);
  const lambda2 = toRadians(lon2);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return Math.atan2(y, x);
}

function radiansToCompassDegrees(angle) {
  const degrees = (angle * 180) / Math.PI;
  return (degrees + 360) % 360;
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

function updateStatus(message) {
  const status = document.getElementById("status");
  if (status) status.innerHTML = message;
}

function generateSensorsAroundBase(baseLat, baseLon) {
  const metersPerDegLat = 111111;
  const metersPerDegLon = 111111 * Math.cos((baseLat * Math.PI) / 180);
  const offsetLat = (metersNorth) => metersNorth / metersPerDegLat;
  const offsetLon = (metersEast) => metersEast / metersPerDegLon;

  return [
    {
      name: "North (8m)",
      latitude: baseLat + offsetLat(8),
      longitude: baseLon,
    },
    {
      name: "South (8m)",
      latitude: baseLat + offsetLat(-8),
      longitude: baseLon,
    },
    {
      name: "East (8m)",
      latitude: baseLat,
      longitude: baseLon + offsetLon(8),
    },
    {
      name: "West (8m)",
      latitude: baseLat,
      longitude: baseLon + offsetLon(-8),
    },
    {
      name: "North-East (8m,8m)",
      latitude: baseLat + offsetLat(8),
      longitude: baseLon + offsetLon(8),
    },
    {
      name: "North-West (8m,8m)",
      latitude: baseLat + offsetLat(8),
      longitude: baseLon + offsetLon(-8),
    },
    {
      name: "South-East (8m,8m)",
      latitude: baseLat + offsetLat(-8),
      longitude: baseLon + offsetLon(8),
    },
    {
      name: "South-West (8m,8m)",
      latitude: baseLat + offsetLat(-8),
      longitude: baseLon + offsetLon(-8),
    },
  ];
}

function buildSensorCoordinatesDebugText() {
  const lines = sensors.map(
    (sensor) =>
      `${sensor.name}: ${sensor.latitude.toFixed(6)}, ${sensor.longitude.toFixed(6)}`,
  );
  return lines.join("<br>");
}

async function initializeSensorsFromLiveLocation() {
  updateStatus("Initializing sensors from your live location...");

  try {
    const position = await getUserLocation();
    const baseLat = position.coords.latitude;
    const baseLon = position.coords.longitude;
    currentUserLat = baseLat;
    currentUserLon = baseLon;
    sensors = generateSensorsAroundBase(baseLat, baseLon);

    updateStatus(
      `Sensors initialized around your current position.<br><br><strong>Generated sensors:</strong><br>${buildSensorCoordinatesDebugText()}`,
    );
    return true;
  } catch (error) {
    updateStatus(
      `Sensors not initialized yet.<br>Waiting for live geolocation failed: ${error.message}`,
    );
    return false;
  }
}

function createSensorEntities() {
  const scene = document.querySelector("a-scene");
  if (!scene) return;

  document.querySelectorAll('[id^="sensor-"]').forEach((existing) => {
    existing.parentNode?.removeChild(existing);
  });

  sensors.forEach((sensor, index) => {
    const entity = document.createElement("a-entity");
    entity.setAttribute("id", `sensor-${index}`);
    entity.setAttribute(
      "gps-new-entity-place",
      `latitude: ${sensor.latitude}; longitude: ${sensor.longitude};`,
    );
    entity.setAttribute("geometry", "primitive: box");
    entity.setAttribute("material", "color: #666; opacity: 0.6");
    entity.setAttribute("scale", "0.35 0.35 0.35");
    entity.setAttribute("position", "0 -8 0");
    entity.setAttribute("look-at", "[gps-new-camera]");
    scene.appendChild(entity);
  });
}

function populateSensorDropdown() {
  const sensorSelect = document.getElementById("sensorSelect");
  if (!sensorSelect) return;

  sensorSelect.innerHTML = "";
  sensors.forEach((sensor, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = sensor.name;
    sensorSelect.appendChild(option);
  });
}

function highlightSelectedSensor() {
  sensors.forEach((_, index) => {
    const entity = document.getElementById(`sensor-${index}`);
    if (!entity) return;

    if (index === selectedSensorIndex) {
      entity.setAttribute("material", "color: #ff3b30; opacity: 1");
      entity.setAttribute("scale", "0.8 0.8 0.8");
    } else {
      entity.setAttribute("material", "color: #666; opacity: 0.45");
      entity.setAttribute("scale", "0.25 0.25 0.25");
    }
  });
}

function setSelectedSensor(index) {
  if (Number.isNaN(index) || !sensors[index]) return;

  selectedSensorIndex = index;
  selectedSensorEntity = document.getElementById(`sensor-${index}`);

  highlightSelectedSensor();
  updateStatus(
    `Following <strong>${sensors[index].name}</strong>...`,
  );
  startTrackingSelectedSensor();
}

async function trackSelectedSensorDistance() {
  if (selectedSensorIndex === null || !sensors[selectedSensorIndex]) return;

  try {
    const position = await getUserLocation();
    const userLat = position.coords.latitude;
    const userLon = position.coords.longitude;
    currentUserLat = userLat;
    currentUserLon = userLon;
    const sensor = sensors[selectedSensorIndex];

    const distance = getDistanceMeters(
      userLat,
      userLon,
      sensor.latitude,
      sensor.longitude,
    );
    lastDistanceMeters = distance;
    const bearingRadians = getBearingRadians(
      userLat,
      userLon,
      sensor.latitude,
      sensor.longitude,
    );
    const bearingDegrees = radiansToCompassDegrees(bearingRadians);
    const bearingText = `${bearingDegrees.toFixed(1)}°`;

    if (distance <= 10) {
      updateStatus(
        `You have reached <strong>${sensor.name}</strong>.<br>Distance: ${formatDistance(
          distance,
        )}<br>Target bearing: ${bearingText}`,
      );
      return;
    }

    updateStatus(
      `Following <strong>${sensor.name}</strong>.<br>Distance: ${formatDistance(
        distance,
      )}<br>Target bearing: ${bearingText}`,
    );
  } catch (error) {
    updateStatus(`Location error: ${error.message}`);
  }
}

function startTrackingSelectedSensor() {
  if (trackingIntervalId) clearInterval(trackingIntervalId);
  trackSelectedSensorDistance();
  trackingIntervalId = setInterval(trackSelectedSensorDistance, 1500);
}

function bindUiEvents() {
  const followBtn = document.getElementById("followBtn");
  const sensorSelect = document.getElementById("sensorSelect");
  if (!followBtn || !sensorSelect) return;

  followBtn.addEventListener("click", () => {
    const selectedIndex = Number(sensorSelect.value);
    setSelectedSensor(selectedIndex);
  });

  // Live switch target directly from dropdown, no reset button needed.
  sensorSelect.addEventListener("change", () => {
    const selectedIndex = Number(sensorSelect.value);
    setSelectedSensor(selectedIndex);
  });
}

async function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  const camera = document.querySelector("[gps-new-camera]");
  const arrow = document.getElementById("arrow");

  if (camera && arrow) {
    camera.appendChild(arrow);
    arrow.setAttribute("position", "0 -1 -2");
  }

  const sensorsReady = await initializeSensorsFromLiveLocation();
  if (!sensorsReady) return;

  createSensorEntities();
  populateSensorDropdown();
  bindUiEvents();
  updateStatus(
    `Loaded ${sensors.length} sensors around your live location.<br>Choose one and tap Follow Sensor.<br><br><strong>Generated sensors:</strong><br>${buildSensorCoordinatesDebugText()}`,
  );
}

const scene = document.querySelector("a-scene");
if (scene) {
  if (scene.hasLoaded) {
    void initApp();
  } else {
    scene.addEventListener("loaded", () => {
      void initApp();
    }, { once: true });
  }
}
