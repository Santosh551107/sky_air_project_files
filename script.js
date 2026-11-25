// ===== Sky & Air – complete script.js =====

let map = null;
let marker = null;
let currentTileLayer = null;

const TILE_PROVIDERS = [
  {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  {
    name: "CARTO",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  }
];

function renderMap(p) {
  const note = document.getElementById("map-note");
  if (!window.L) return;

  if (!map) {
    map = L.map("map").setView([p.lat, p.lon], 12);
  } else {
    map.setView([p.lat, p.lon], 12);
  }

  if (!marker) {
    marker = L.marker([p.lat, p.lon]).addTo(map);
  } else {
    marker.setLatLng([p.lat, p.lon]);
  }
  marker.bindPopup(p.name || "Location").openPopup();

  if (currentTileLayer) {
    map.removeLayer(currentTileLayer);
    currentTileLayer = null;
  }

  let i = 0;
  function tryNext() {
    if (i >= TILE_PROVIDERS.length) {
      if (note) note.textContent = "Map tiles unavailable.";
      return;
    }
    const prov = TILE_PROVIDERS[i++];
    if (note) note.textContent = "Loading " + prov.name + "…";
    let failed = false;
    const layer = L.tileLayer(prov.url, prov.options);
    layer.on("tileload", () => {
      if (!failed && note) note.textContent = "Map loaded (" + prov.name + ").";
    });
    layer.on("tileerror", () => {
      if (failed) return;
      failed = true;
      map.removeLayer(layer);
      tryNext();
    });
    layer.addTo(map);
    currentTileLayer = layer;
  }
  tryNext();

  setTimeout(() => map.invalidateSize(), 300);
}

// ---- Elements ----
const form = document.getElementById("form");
const placeInput = document.getElementById("place");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const goBtn = document.getElementById("go");
const locBtn = document.getElementById("current-location");

// ---- Geocode ----
async function geocodePlace(name) {
  // Try Open-Meteo first
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const r = data.results[0];
        return {
          lat: r.latitude,
          lon: r.longitude,
          name: [r.name, r.admin1, r.country].filter(Boolean).join(", ")
        };
      }
    }
  } catch (e) {
    console.warn("Open-Meteo geocode failed:", e.message);
  }

  // Fallback: Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(name)}&countrycodes=au&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Nominatim " + res.status);
    const data = await res.json();
    if (!data || data.length === 0) throw new Error("Not found");
    const r = data[0];
    return {
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      name: r.display_name || name
    };
  } catch (e) {
    console.error("Nominatim geocode failed:", e.message);
    throw new Error("Place not found");
  }
}

// ---- Weather ----
async function fetchWeather(p) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=auto&forecast_days=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather HTTP " + res.status);
  return res.json();
}

// ---- Air quality (optional) ----
async function fetchAirQuality(p) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.lat}&longitude=${p.lon}` +
      `&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("AQ failed:", e.message);
    return null;
  }
}

// ---- Descriptions ----
function weatherDesc(code) {
  const m = {0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",
    51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",
    71:"Light snow",73:"Snow",75:"Heavy snow",80:"Showers",81:"Showers",82:"Heavy showers",
    95:"Thunderstorm",96:"Thunderstorm",99:"Thunderstorm"};
  return m[code] || "—";
}
function aqiLabel(v) {
  if (v == null) return "No data";
  if (v <= 50) return "Good";
  if (v <= 100) return "Moderate";
  if (v <= 150) return "Unhealthy (sensitive)";
  if (v <= 200) return "Unhealthy";
  return "Very unhealthy";
}
function aqiColour(v) {
  if (v == null) return "#68758a";
  if (v <= 50) return "#147a43";
  if (v <= 100) return "#b56a00";
  if (v <= 150) return "#b45309";
  return "#b42318";
}

// ---- Render ----
function renderResults(p, wx, aq) {
  const cur = wx.current || {};
  const air = (aq && aq.current) || {};

  document.getElementById("name").textContent = p.name;
  document.getElementById("time").textContent =
    new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });

  document.getElementById("temp").textContent =
    cur.temperature_2m != null ? Math.round(cur.temperature_2m) + "°" : "--";
  document.getElementById("desc").textContent = weatherDesc(cur.weather_code);
  document.getElementById("feels").textContent =
    cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) + "°C" : "--";
  document.getElementById("humidity").textContent =
    cur.relative_humidity_2m != null ? cur.relative_humidity_2m + "%" : "--";
  document.getElementById("wind").textContent =
    cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) + " km/h" : "--";
  document.getElementById("rain").textContent =
    cur.precipitation != null ? cur.precipitation + " mm" : "--";

  const aqiVal = air.us_aqi ?? null;
  document.getElementById("aqi").textContent = aqiVal != null ? aqiVal : "--";
  const lbl = document.getElementById("aqilabel");
  lbl.textContent = aqiLabel(aqiVal);
  lbl.style.background = aqiColour(aqiVal) + "22";
  lbl.style.color = aqiColour(aqiVal);
  document.getElementById("aqinote").textContent =
    aqiVal != null ? `US AQI ${aqiVal} – ${aqiLabel(aqiVal)}` : "Air quality data unavailable.";
  document.getElementById("pm25").textContent = air.pm2_5 != null ? air.pm2_5.toFixed(1) + " µg/m³" : "--";
  document.getElementById("pm10").textContent = air.pm10 != null ? air.pm10.toFixed(1) + " µg/m³" : "--";
  document.getElementById("ozone").textContent = air.ozone != null ? air.ozone.toFixed(1) + " µg/m³" : "--";
  document.getElementById("no2").textContent = air.nitrogen_dioxide != null ? air.nitrogen_dioxide.toFixed(1) + " µg/m³" : "--";

  document.getElementById("recTitle").textContent = "Conditions summary";
  document.getElementById("rec").textContent =
    `Temperature ${cur.temperature_2m != null ? Math.round(cur.temperature_2m) + "°C" : "unknown"}, ` +
    `wind ${cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) + " km/h" : "unknown"}. ` +
    (aqiVal != null ? `Air quality is ${aqiLabel(aqiVal).toLowerCase()}.` : "");

  const fc = document.getElementById("forecast");
  fc.innerHTML = "";
  const daily = wx.daily || {};
  for (let i = 0; i < Math.min(5, (daily.time || []).length); i++) {
    const d = new Date(daily.time[i]);
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `<span>${d.toLocaleDateString("en-AU",{weekday:"short"})}</span>
      <strong>${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°</strong>
      <span style="font-size:11px;color:#68758a">${weatherDesc(daily.weather_code[i])}</span>`;
    fc.appendChild(div);
  }

  resultsEl.hidden = false;
  renderMap(p);
}

// ---- Search ----
async function doSearch(query) {
  if (!query || !query.trim()) {
    statusEl.textContent = "Please enter a place name.";
    statusEl.className = "error";
    return;
  }

  goBtn.disabled = true;
  statusEl.className = "";
  statusEl.textContent = "Searching…";

  try {
    const place = await geocodePlace(query.trim());
    statusEl.textContent = "Fetching conditions…";
    const [wx, aq] = await Promise.all([fetchWeather(place), fetchAirQuality(place)]);
    renderResults(place, wx, aq);
    statusEl.textContent = `Showing conditions for ${place.name}.`;
    statusEl.className = "";
      } catch (err) {
        console.error(err);
        if (err.message === "Place not found") {
            statusEl.textContent = "❌ Invalid location. Try a different Australian suburb or postcode.";
        } else {
            statusEl.textContent = "⚠️ API failure. Could not load data. Check your internet and try again.";
        }
        statusEl.className = "error";
    } finally {
        goBtn.disabled = false;
    }
}

// ---- Events ----
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    doSearch(placeInput.value);
  });
}

if (locBtn) {
  locBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      statusEl.textContent = "Geolocation not supported.";
      statusEl.className = "error";
      return;
    }
    statusEl.textContent = "Getting location…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          name: pos.coords.latitude.toFixed(4) + ", " + pos.coords.longitude.toFixed(4)
        };
        try {
          const [wx, aq] = await Promise.all([fetchWeather(p), fetchAirQuality(p)]);
          renderResults(p, wx, aq);
          statusEl.textContent = "Showing conditions for your location.";
        } catch (e) {
          statusEl.textContent = "Could not load conditions.";
          statusEl.className = "error";
        }
      },
      () => {
        statusEl.textContent = "Location permission denied.";
        statusEl.className = "error";
      }
    );
  });
}