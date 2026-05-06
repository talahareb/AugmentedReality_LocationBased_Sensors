let sensors = [];
let selectedSensorIndex = null;
let trackingIntervalId = null;
let currentUserLat = null;
let currentUserLon = null;
let lastDistanceMeters = null;
let appInitialized = false;
let stabilizedUserLat = null;
let stabilizedUserLon = null;
const CONFIG = {
  // Main distance from base point to each generated sensor.
  sensorOffsetMeters: 12,
  // Smoothing for live user location updates (0-1).
  userPositionSmoothingAlpha: 0.25,
  // Ignore GPS movement smaller than this threshold.
  userPositionMinUpdateMeters: 1.5,
  // Sensor box style.
  sensorColor: "#ff4fa3",
  sensorOpacity: 0.9,
  sensorScaleDefault: "0.45 0.45 0.45",
  sensorScaleSelected: "0.75 0.75 0.75",
  // Arrow heading calibration: 0 (normal), Math.PI (flip 180).
  arrowYawOffsetRadians: 0,
  // Distance refresh rate.
  trackingIntervalMs: 1500,
};

const STATIC_SENSORS = [
  {
    name: "Static Sensor 1",
    latitude: 45.063226,
    longitude: 7.658016
  },
  {
    name: "Static Sensor 2",
    latitude: 45.063849,
    longitude: 7.658587
  },
];

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

    const desiredAngle = targetAngle - cameraYaw + CONFIG.arrowYawOffsetRadians;

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

function updateStabilizedUserLocation(lat, lon) {
  if (stabilizedUserLat === null || stabilizedUserLon === null) {
    stabilizedUserLat = lat;
    stabilizedUserLon = lon;
    return;
  }

  const deltaFromStabilized = getDistanceMeters(
    stabilizedUserLat,
    stabilizedUserLon,
    lat,
    lon,
  );

  // Ignore tiny GPS wobble to keep AR targets visually steady.
  if (deltaFromStabilized < CONFIG.userPositionMinUpdateMeters) return;

  stabilizedUserLat +=
    (lat - stabilizedUserLat) * CONFIG.userPositionSmoothingAlpha;
  stabilizedUserLon +=
    (lon - stabilizedUserLon) * CONFIG.userPositionSmoothingAlpha;
}

function generateSensorsAroundBase(baseLat, baseLon) {
  const metersPerDegLat = 111111;
  const metersPerDegLon = 111111 * Math.cos((baseLat * Math.PI) / 180);
  const offsetLat = (metersNorth) => metersNorth / metersPerDegLat;
  const offsetLon = (metersEast) => metersEast / metersPerDegLon;

  return [
    {
      name: `North (${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat + offsetLat(CONFIG.sensorOffsetMeters),
      longitude: baseLon,
    },
    {
      name: `South (${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat + offsetLat(-CONFIG.sensorOffsetMeters),
      longitude: baseLon,
    },
    {
      name: `East (${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat,
      longitude: baseLon + offsetLon(-CONFIG.sensorOffsetMeters),
    },
    {
      name: `West (${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat,
      longitude: baseLon + offsetLon(CONFIG.sensorOffsetMeters),
    },
    {
      name: `North-East (${CONFIG.sensorOffsetMeters}m,${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat + offsetLat(CONFIG.sensorOffsetMeters),
      longitude: baseLon + offsetLon(-CONFIG.sensorOffsetMeters),
    },
    {
      name: `North-West (${CONFIG.sensorOffsetMeters}m,${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat + offsetLat(CONFIG.sensorOffsetMeters),
      longitude: baseLon + offsetLon(CONFIG.sensorOffsetMeters),
    },
    {
      name: `South-East (${CONFIG.sensorOffsetMeters}m,${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat + offsetLat(-CONFIG.sensorOffsetMeters),
      longitude: baseLon + offsetLon(-CONFIG.sensorOffsetMeters),
    },
    {
      name: `South-West (${CONFIG.sensorOffsetMeters}m,${CONFIG.sensorOffsetMeters}m)`,
      latitude: baseLat + offsetLat(-CONFIG.sensorOffsetMeters),
      longitude: baseLon + offsetLon(CONFIG.sensorOffsetMeters),
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
    stabilizedUserLat = baseLat;
    stabilizedUserLon = baseLon;
    const dynamicSensors = generateSensorsAroundBase(baseLat, baseLon);
    sensors = [...dynamicSensors, ...STATIC_SENSORS];

    updateStatus(
      `Sensors initialized around your current position.<br><br><strong>Available sensors:</strong><br>${buildSensorCoordinatesDebugText()}`,
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
    entity.setAttribute("class", "sensor-box");
    entity.dataset.sensorIndex = String(index);
    entity.setAttribute(
      "gps-new-entity-place",
      `latitude: ${sensor.latitude}; longitude: ${sensor.longitude};`,
    );
    entity.setAttribute("geometry", "primitive: box");
    entity.setAttribute(
      "material",
      `color: ${CONFIG.sensorColor}; opacity: ${CONFIG.sensorOpacity}`,
    );
    entity.setAttribute("scale", CONFIG.sensorScaleDefault);
    entity.setAttribute("position", "0 0 0");
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

  // Ensure a deterministic initial target so arrow yaw updates immediately.
  if (sensors.length > 0) {
    sensorSelect.value = "0";
  }
}

function highlightSelectedSensor() {
  const sensorEntities = document.querySelectorAll(".sensor-box");
  sensorEntities.forEach((entity) => {
    const entityIndex = Number(entity.dataset.sensorIndex);
    if (Number.isNaN(entityIndex)) return;

    entity.setAttribute(
      "material",
      `color: ${CONFIG.sensorColor}; opacity: ${CONFIG.sensorOpacity}`,
    );

    if (entityIndex === selectedSensorIndex) {
      entity.setAttribute("scale", CONFIG.sensorScaleSelected);
    } else {
      entity.setAttribute("scale", CONFIG.sensorScaleDefault);
    }
  });
}

function setSelectedSensor(index) {
  if (Number.isNaN(index) || !sensors[index]) return;

  selectedSensorIndex = index;
  const sensorSelect = document.getElementById("sensorSelect");
  if (sensorSelect) {
    sensorSelect.value = String(index);
  }

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
    const rawUserLat = position.coords.latitude;
    const rawUserLon = position.coords.longitude;
    updateStabilizedUserLocation(rawUserLat, rawUserLon);
    const trackedUserLat = stabilizedUserLat ?? rawUserLat;
    const trackedUserLon = stabilizedUserLon ?? rawUserLon;
    currentUserLat = trackedUserLat;
    currentUserLon = trackedUserLon;
    const sensor = sensors[selectedSensorIndex];

    const distance = getDistanceMeters(
      trackedUserLat,
      trackedUserLon,
      sensor.latitude,
      sensor.longitude,
    );
    lastDistanceMeters = distance;
    const bearingRadians = getBearingRadians(
      trackedUserLat,
      trackedUserLon,
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
  trackingIntervalId = setInterval(
    trackSelectedSensorDistance,
    CONFIG.trackingIntervalMs,
  );
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
  if (sensors.length > 0) {
    setSelectedSensor(0);
  }
  updateStatus(
    `Loaded ${sensors.length} sensors (dynamic + static).<br>Auto-following the first sensor. You can switch from the dropdown anytime.<br><br><strong>Available sensors:</strong><br>${buildSensorCoordinatesDebugText()}`,
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
