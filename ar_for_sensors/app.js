function line(label, ok, extra = "") {
  return `<p><strong>${label}:</strong> ${ok ? "✅ Available" : "❌ Not available"} ${extra}</p>`;
}

function checkEnvironment() {
  const status = document.getElementById("status");

  const hasAFrame = typeof AFRAME !== "undefined";
  const hasCameraAPI = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );
  const hasGeolocation = "geolocation" in navigator;
  const hasDeviceOrientation = "DeviceOrientationEvent" in window;

  status.innerHTML = `
    ${line("A-Frame loaded", hasAFrame)}
    ${line("Camera API", hasCameraAPI)}
    ${line("Geolocation API", hasGeolocation)}
    ${line("Device orientation API", hasDeviceOrientation)}
  `;

  console.log("Phase 1 environment check:");
  console.log({
    hasAFrame,
    hasCameraAPI,
    hasGeolocation,
    hasDeviceOrientation,
  });
}

document.getElementById("checkBtn").addEventListener("click", checkEnvironment);

window.addEventListener("load", () => {
  checkEnvironment();
});
