const sensors = [
  { name: "Sensor 1", latitude: 45.06358, longitude: 7.6599 },
  { name: "Sensor 2", latitude: 45.06232, longitude: 7.66042 },
  { name: "Sensor 3", latitude: 45.0641, longitude: 7.6579 },
];

function line(label, ok, extra = "") {
  return `<p><strong>${label}:</strong> ${ok ? "✅" : "❌"} ${extra}</p>`;
}

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
/*
async function requestCameraAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return false;
  }

  try {//this asks the browser for permission to access the camera if user accepts
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.error("Camera access error:", error);
    return false;
  }
}

*/
//hl2 hun el program logic
async function runCheck() {
  const status = document.getElementById("status");

  const hasAFrame = typeof AFRAME !== "undefined";
  const hasCameraAPI = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );
  const hasGeolocation = "geolocation" in navigator;
  const hasDeviceOrientation = "DeviceOrientationEvent" in window;

  status.innerHTML = `
    <p>Checking environment and sensor distances...</p>
  `;
/*
  let cameraGranted = false;
  if (hasCameraAPI) {
    cameraGranted = await requestCameraAccess();
  }
*/
  let sensorHtml = `<p><strong>Sensor distances:</strong> Could not get location.</p>`;

  try {
    const position = await getUserLocation();
    const userLat = position.coords.latitude;
    const userLon = position.coords.longitude;

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

  status.innerHTML = `
    ${line("A-Frame loaded", hasAFrame)}
    ${line("Camera API", hasCameraAPI)}
    ${line("Geolocation API", hasGeolocation)}
    ${line("Device orientation API", hasDeviceOrientation)}
    ${sensorHtml}
  `;

  console.log("Environment check complete");
}

document.getElementById("checkBtn").addEventListener("click", runCheck);

window.addEventListener("load", () => {
  runCheck();
});
