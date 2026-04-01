AFRAME.registerComponent("look-at-y", {
  init: function () {
    this.targetPos = new THREE.Vector3();
    this.selfPos = new THREE.Vector3();
    this.cameraEuler = new THREE.Euler();
  },

  tick: function () {
    const target = document.querySelector("#sensor1");
    const camera = document.querySelector("[gps-new-camera]");
    if (!target || !camera) return;

    target.object3D.getWorldPosition(this.targetPos);
    this.el.object3D.getWorldPosition(this.selfPos);

    const dx = this.targetPos.x - this.selfPos.x;
    const dz = this.targetPos.z - this.selfPos.z;

    // Bearing in world space
    const targetAngle = Math.atan2(dx, dz);

    // Camera yaw in world space
    this.cameraEuler.setFromQuaternion(camera.object3D.quaternion, "YXZ");
    const cameraYaw = this.cameraEuler.y;

    // Convert world bearing to camera-local desired yaw
    // NOTE: Some 3D arrow models face "backwards" relative to A-Frame forward (-Z).
    // If the tail is pointing at the sensor instead of the tip, keep this offset enabled.
    // TESTING/CONFIG: set to 0 if your model already points correctly.
    const modelYawOffset = Math.PI; // 180° flip so arrow tip points to target

    const desiredAngle = targetAngle - cameraYaw + modelYawOffset;

    // Smooth + fast interpolation (shortest angle path)
    const currentAngle = this.el.object3D.rotation.y;
    const smoothing = 0.25; // higher = faster response
    const angleDiff = Math.atan2(
      Math.sin(desiredAngle - currentAngle),
      Math.cos(desiredAngle - currentAngle),
    );

    this.el.object3D.rotation.y =
      currentAngle + angleDiff * smoothing;
  },
});
const sensors = [
  { name: "Sensor 1", latitude: 45.0645, longitude: 7.6165 },
  { name: "Sensor 2", latitude: 45.0646, longitude: 7.6166 },
  { name: "Sensor 3", latitude: 45.0644, longitude: 7.6164 },
  { name: "Sensor 4", latitude: 45.06455, longitude: 7.61645 },
];

function formatDistance(distance) {
  if (distance < 1000) {
    return `${distance.toFixed(2)} meters`;
  }
  return `${(distance / 1000).toFixed(2)} km`;
}

// based on something called "Haversine formula,
// which is the standard method for computing distances on the Earth.
//takes 2 points as input, outputs distance in degrees
//so i formatted them to distance in meters
// distance = Earth radius × central angle
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

//deriving my own location, gps
// this function uses Geolocation API
// It returns a Promise that resolves with the position data
// or rejects with an error if geolocation is not supported or if there is an issue retrieving the location.
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    //this asks the brower for the current gps coordinates
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0, //so it doesnt use cached position
    });
  });
}

//hl2 hun el program logic
async function runCheck() {
  const status = document.getElementById("status");

  let sensorHtml = `<p><strong>Sensor distances:</strong> Could not get location.</p>`;

  try {
    const position = await getUserLocation();
    const userLat = position.coords.latitude;
    const userLon = position.coords.longitude;

    // TESTING ONLY (remove later):
    // Move Sensor 1 to a fake nearby GPS coordinate so it appears close indoors.
    // This keeps the arrow hardcoded to #sensor1 while making the target visible nearby.
    const sensor1 = sensors.find((s) => s.name === "Sensor 1");
    if (sensor1) {
      const metersNorth = 6; // a few meters away
      const metersEast = 4; // a few meters away
      const metersPerDegLat = 111111;
      const metersPerDegLon = 111111 * Math.cos((userLat * Math.PI) / 180);

      const fakeLat = userLat + metersNorth / metersPerDegLat;
      const fakeLon = userLon + metersEast / metersPerDegLon;

      sensor1.latitude = fakeLat;
      sensor1.longitude = fakeLon;

      const sensor1El = document.querySelector("#sensor1");
      if (sensor1El) {
        sensor1El.setAttribute(
          "gps-new-entity-place",
          `latitude: ${fakeLat}; longitude: ${fakeLon};`,
        );
      }
    }

    const sensorResults = sensors
      .map((sensor) => ({
        ...sensor,
        distance: getDistanceMeters(
          userLat,
          userLon,
          sensor.latitude,
          sensor.longitude,
        ),
      }))
      .sort((a, b) => a.distance - b.distance);

    sensorHtml = `
      <hr>
      <p><strong>Your location:</strong></p>
      <p>Latitude: ${userLat.toFixed(6)}</p>
      <p>Longitude: ${userLon.toFixed(6)}</p>
      <hr>
      <p><strong>Sensor distances:</strong></p>
      ${sensorResults
        .map(
          (sensor) => `
            <p>
              <strong>${sensor.name}</strong><br>
              Latitude: ${sensor.latitude}<br>
              Longitude: ${sensor.longitude}<br>
              Distance: ${formatDistance(sensor.distance)}
            </p>
          `,
        )
        .join("")}
    `;
  } catch (error) {
    sensorHtml = `<hr><p><strong>Location error:</strong> ${error.message}</p>`;
    console.error("Location error:", error);
  }

  if (status) status.innerHTML = sensorHtml;
}
const btn = document.getElementById("checkBtn");
if (btn) {
  btn.addEventListener("click", runCheck);
}

document.querySelector("a-scene").addEventListener("loaded", () => {
  const camera = document.querySelector("[gps-new-camera]");
  const arrow = document.getElementById("arrow");

  if (camera && arrow) {
    camera.appendChild(arrow);
    arrow.setAttribute("position", "0 -1 -2");
  }

  runCheck();
});
