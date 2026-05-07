const STATIC_DATA = window.LIFELOOP_DATA;
const icons = window.LIFELOOP_ICONS;

const API_BASE = STATIC_DATA.apiBase || `${window.location.protocol}//${window.location.hostname}:8000`;

const userSelect = document.querySelector("#user-select");
const navButtons = document.querySelectorAll(".nav-button");
const sections = document.querySelectorAll(".section");
const rerunButton = document.querySelector("#rerun");

const loginModal = document.querySelector("#login-modal");
const loginName = document.querySelector("#login-name");
const loginEmail = document.querySelector("#login-email");
const loginContinue = document.querySelector("#login-continue");
const loginMessage = document.querySelector("#login-message");

const matchModal = document.querySelector("#match-modal");
const matchModalTitle = document.querySelector("#match-modal-title");
const matchModalBody = document.querySelector("#match-modal-body");
const matchModalTags = document.querySelector("#match-modal-tags");
const matchModalClose = document.querySelector("#match-modal-close");

const privacyForm = document.querySelector("#privacy-settings-form");
const privacyMessage = document.querySelector("#privacy-message");
const deleteHistoryButton = document.querySelector("#delete-history");

const routineMirrorSummary = document.querySelector("#routine-mirror-summary");
const routineMirrorHighlights = document.querySelector("#routine-mirror-highlights");
const routineMirrorAlerts = document.querySelector("#routine-mirror-alerts");
const routineChatLog = document.querySelector("#routine-chat-log");
const routineChatInput = document.querySelector("#routine-chat-input");
const routineChatSend = document.querySelector("#routine-chat-send");

const likedList = document.querySelector("#liked-list");
const friendList = document.querySelector("#friend-list");
const friendChatTitle = document.querySelector("#friend-chat-title");
const friendChatSubtitle = document.querySelector("#friend-chat-subtitle");
const friendWindows = document.querySelector("#friend-windows");
const friendPlaceScout = document.querySelector("#friend-place-scout");
const friendChatMessages = document.querySelector("#friend-chat-messages");
const friendChatInput = document.querySelector("#friend-chat-input");
const friendChatSend = document.querySelector("#friend-chat-send");
const safetyAlert = document.querySelector("#safety-alert");

const state = {
  apiReady: false,
  usingFallback: false,
  mapProvider: "mock",
  placesProvider: "seeded",
  googleMapsApiKey: null,
  googleMap: null,
  googleMapRoute: null,
  googleMapMarkers: [],
  users: [],
  currentUser: null,
  privacy: null,
  dailyRoutes: [],
  profile: null,
  locationLogs: [],
  matches: [],
  socialMatches: [],
  recommendations: [],
  likedPeople: [],
  friends: [],
  activeFriendId: null,
  activeThread: null,
  routineMirror: null,
  routineChatMessages: [],
  localLikes: {},
  localChats: {},
};

let googleMapsLoadPromise = null;

function clearGoogleMapOverlays() {
  if (!state.googleMapMarkers.length) {
    return;
  }
  state.googleMapMarkers.forEach(marker => marker.setMap(null));
  state.googleMapMarkers = [];
}

function shouldUseGoogleMap() {
  return state.mapProvider === "google" && Boolean(state.googleMapsApiKey);
}

async function ensureGoogleMapsLoaded() {
  if (!shouldUseGoogleMap()) {
    return false;
  }

  if (window.google && window.google.maps) {
    return true;
  }

  if (!googleMapsLoadPromise) {
    googleMapsLoadPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector("script[data-google-maps='lifeloop']");
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(true), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Google Maps script failed to load")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.googleMapsApiKey)}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMaps = "lifeloop";
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => reject(new Error("Google Maps script failed to load")), { once: true });
      document.head.appendChild(script);
    }).catch(() => {
      state.mapProvider = "mock";
      state.googleMapsApiKey = null;
      googleMapsLoadPromise = null;
      return false;
    });
  }

  return googleMapsLoadPromise;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatScore(value) {
  if (typeof value !== "number") {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}

function fallbackUsers() {
  return STATIC_DATA.users.map(user => ({
    user_id: user.id,
    name: user.name,
    email: `${user.id}@demo.local`,
    isFallback: true,
  }));
}

function currentPersonaUser() {
  if (!state.currentUser) {
    return STATIC_DATA.users[0];
  }

  const keyCandidates = [
    state.currentUser.user_id,
    String(state.currentUser.email || "").split("@")[0],
    String(state.currentUser.name || "").split(" ")[0].toLowerCase(),
  ];

  const persona = STATIC_DATA.users.find(user => keyCandidates.includes(user.id));
  return persona || STATIC_DATA.users[0];
}

function personaByUserId(userId) {
  const userRecord = state.users.find(item => String(item.user_id) === String(userId));
  if (!userRecord) {
    return STATIC_DATA.users[0];
  }

  const short = String(userRecord.email || "").split("@")[0] || String(userRecord.user_id).slice(0, 6);
  return STATIC_DATA.users.find(item => item.id === short || item.name === userRecord.name) || STATIC_DATA.users[0];
}

function cosine(a, b) {
  const keys = Object.keys(a);
  const dot = keys.reduce((sum, key) => sum + a[key] * (b[key] || 0), 0);
  const magA = Math.sqrt(keys.reduce((sum, key) => sum + a[key] * a[key], 0));
  const magB = Math.sqrt(keys.reduce((sum, key) => sum + (b[key] || 0) * (b[key] || 0), 0));
  if (!magA || !magB) {
    return 0;
  }
  return dot / (magA * magB);
}

function hashFraction(value) {
  const text = String(value);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function fallbackMatchesForPersona(persona) {
  return STATIC_DATA.users
    .filter(user => user.id !== persona.id)
    .map(user => {
      const rawScore = cosine(persona.vector, user.vector);
      const shared = persona.tags.filter(tag => user.tags.includes(tag));
      return {
        match_id: `${persona.id}_${user.id}`,
        user_id_1: persona.id,
        user_id_2: user.id,
        other_user_name: user.name,
        final_score: clamp(rawScore, 0, 1),
        route_similarity: clamp(rawScore * 0.9, 0, 1),
        time_similarity: clamp(rawScore * 0.82, 0, 1),
        place_similarity: clamp(shared.length / 5, 0, 1),
        lifestyle_similarity: clamp(rawScore, 0, 1),
        interest_similarity: clamp(shared.length / 6, 0, 1),
        explanation: `You both show similar weekday and weekend patterns around ${shared.slice(0, 3).join(", ").toLowerCase() || "lifestyle-friendly"} areas without sharing exact routes.`,
      };
    })
    .sort((a, b) => b.final_score - a.final_score);
}

function sharedTags(userA, userB) {
  return userA.tags.filter(tag => userB.tags.includes(tag)).slice(0, 3);
}

function fallbackSocialMatches(persona) {
  const likesForCurrent = state.localLikes[persona.id] || {};
  return fallbackMatchesForPersona(persona).map(match => {
    const otherPersona = STATIC_DATA.users.find(user => user.id === String(match.user_id_2)) || STATIC_DATA.users[0];
    const tagList = sharedTags(persona, otherPersona);
    const likeState = likesForCurrent[otherPersona.id] || "none";
    const reciprocal = (state.localLikes[otherPersona.id] || {})[persona.id] === "liked";

    return {
      ...match,
      fit_explanation: `You align on ${tagList[0] || "weekly rhythm"} and have compatible routine timing for low-friction planning.`,
      discovery_note: `Complementary pick: ${otherPersona.name} brings variety through ${otherPersona.tags.slice(0, 2).join(" + ").toLowerCase()}.`,
      like_state: likeState,
      is_mutual: likeState === "liked" && reciprocal,
      safe_icebreakers: [
        "What is one small win from your week?",
        "Would you prefer a short daytime meetup or an early-evening one?",
        "What kind of public place feels easiest for first meetings?",
      ],
      first_meet_activities: [
        "Cafe check-in near transit",
        "Park walk in daylight",
        "Casual food court meetup",
      ],
    };
  });
}

function fallbackPlannerWindows(persona, otherPersona) {
  const options = [
    "Weekday · Early Evening (6pm-9pm)",
    "Weekend · Morning (8am-11am)",
    "Weekend · Afternoon (1pm-4pm)",
  ];
  const score = cosine(persona.vector, otherPersona.vector);
  if (score > 0.7) {
    return [
      { label: options[0], bucket: "weekday", daypart: "evening", confidence: "high" },
      { label: options[1], bucket: "weekend", daypart: "morning", confidence: "medium" },
      { label: options[2], bucket: "weekend", daypart: "afternoon", confidence: "medium" },
    ];
  }
  return [
    { label: options[1], bucket: "weekend", daypart: "morning", confidence: "medium" },
    { label: options[2], bucket: "weekend", daypart: "afternoon", confidence: "medium" },
  ];
}

function fallbackPlaceScout(persona, otherPersona) {
  const shared = sharedTags(persona, otherPersona);
  return [
    {
      name: "Transit Commons Cafe",
      category: "cafe",
      rating: 4.4,
      price_level: 2,
      reason: `Matches both routines around ${shared[0] || "casual social"} vibes with easy transit exits.`,
      score: 0.88,
    },
    {
      name: "Open Park Hub",
      category: "nature",
      rating: 4.3,
      price_level: 0,
      reason: "Public daytime setting with low pressure and clear visibility.",
      score: 0.82,
    },
  ];
}

function chatKey(leftId, rightId) {
  return [String(leftId), String(rightId)].sort().join("::");
}

function ensureFallbackChat(leftId, rightId) {
  const key = chatKey(leftId, rightId);
  if (!state.localChats[key]) {
    state.localChats[key] = [
      {
        message_id: `${key}-1`,
        sender_user_id: rightId,
        body: "Hey, daytime meetups near transit work best for me.",
        safety_flagged: false,
        safety_reason: null,
        safety_alternatives: [],
        created_at: new Date().toISOString(),
      },
    ];
  }
  return state.localChats[key];
}

function fallbackLikedAndFriends(persona) {
  const likesForCurrent = state.localLikes[persona.id] || {};
  const likedPeople = Object.entries(likesForCurrent)
    .filter(([, stateValue]) => stateValue === "liked")
    .map(([otherId]) => {
      const otherPersona = STATIC_DATA.users.find(user => user.id === otherId);
      const reciprocal = (state.localLikes[otherId] || {})[persona.id] === "liked";
      return {
        other_user_id: otherId,
        other_user_name: otherPersona?.name || otherId,
        like_state: "liked",
        is_mutual: reciprocal,
        weekly_windows: fallbackPlannerWindows(persona, otherPersona || STATIC_DATA.users[0]),
      };
    });

  const friends = likedPeople
    .filter(person => person.is_mutual)
    .map(person => {
      const otherPersona = STATIC_DATA.users.find(user => user.id === person.other_user_id) || STATIC_DATA.users[0];
      ensureFallbackChat(persona.id, otherPersona.id);
      return {
        connection_id: chatKey(persona.id, otherPersona.id),
        friend_user_id: otherPersona.id,
        friend_name: otherPersona.name,
        connected_at: new Date().toISOString(),
        weekly_windows: person.weekly_windows,
        place_scout: fallbackPlaceScout(persona, otherPersona),
      };
    });

  return { likedPeople, friends };
}

function fallbackRoutineMirror(persona) {
  return {
    weekly_summary: `Routine Mirror sees stable ${persona.tags.slice(0, 2).join(" + ")} patterns this week.`,
    habit_highlights: [
      `Consistent ${persona.tags[0]} rhythm across weekdays.`,
      `Healthy weekend energy around ${persona.tags[1] || "social"} activities.`,
      "No severe routine drift detected.",
    ],
    energy_pattern: [
      "High movement tendency in evening windows.",
      "Weekend midday has strongest social compatibility.",
    ],
    routine_drift_alerts: [],
  };
}

async function apiRequest(path, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };

  if (options.body !== undefined) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, requestOptions);
  if (!response.ok) {
    let message = `API ${response.status}`;
    try {
      const errorPayload = await response.json();
      if (errorPayload.detail) {
        message = errorPayload.detail;
      }
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

async function checkApiHealth() {
  try {
    await apiRequest("/health");
    state.apiReady = true;
    state.usingFallback = false;

    const runtimeConfig = await apiRequest("/runtime/config").catch(() => null);
    state.mapProvider = runtimeConfig?.map_provider || "mock";
    state.placesProvider = runtimeConfig?.places_provider || "seeded";
    state.googleMapsApiKey = runtimeConfig?.google_maps_api_key || null;
  } catch {
    state.apiReady = false;
    state.usingFallback = true;
    state.mapProvider = "mock";
    state.placesProvider = "seeded";
    state.googleMapsApiKey = null;
  }
}

function populateUserSelect() {
  userSelect.innerHTML = "";
  state.users.forEach(user => {
    const option = document.createElement("option");
    option.value = user.user_id;
    option.textContent = user.name;
    userSelect.appendChild(option);
  });

  if (state.currentUser) {
    userSelect.value = state.currentUser.user_id;
  }
}

function locationPointFromZone(zone) {
  const lat = 1.24 + ((100 - zone.y) / 100) * 0.28;
  const lng = 103.72 + (zone.x / 100) * 0.28;
  return { lat, lng };
}

function generateSimulatedLogs(userId, persona) {
  const logs = [];
  const now = new Date();
  const zones = persona.zones.slice(0, Math.max(2, Math.min(4, persona.zones.length)));

  for (let dayOffset = 9; dayOffset >= 1; dayOffset -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - dayOffset);

    zones.forEach((zone, index) => {
      const baseTime = new Date(day);
      baseTime.setHours(8 + index * 4, 0, 0, 0);

      for (let tick = 0; tick < 3; tick += 1) {
        const jitterLat = (Math.random() - 0.5) * 0.0012;
        const jitterLng = (Math.random() - 0.5) * 0.0012;
        const point = locationPointFromZone(zone);

        logs.push({
          user_id: userId,
          timestamp: new Date(baseTime.getTime() + tick * 6 * 60 * 1000).toISOString(),
          latitude: point.lat + jitterLat,
          longitude: point.lng + jitterLng,
          accuracy_meters: 35,
          speed_mps: index === 1 ? 4.5 : 0.8,
          activity_type: zone.label.toLowerCase(),
        });
      }
    });
  }

  return logs;
}

async function ensureUserFromLogin(name, email) {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanName || !cleanEmail) {
    throw new Error("Name and email are required");
  }

  if (!state.apiReady) {
    const fallback = fallbackUsers();
    const existing = fallback.find(user => user.email === cleanEmail) || fallback[0];
    return existing;
  }

  const existingUsers = await apiRequest(`/users?email=${encodeURIComponent(cleanEmail)}`);
  if (existingUsers.length) {
    return existingUsers[0];
  }

  return apiRequest("/users", {
    method: "POST",
    body: { name: cleanName, email: cleanEmail },
  });
}

async function bootstrapUsers() {
  if (!state.apiReady) {
    state.users = fallbackUsers();
    return;
  }

  const users = await apiRequest("/users");
  state.users = users.length ? users : fallbackUsers();
}

async function loadPrivacySettings(userId) {
  if (!state.apiReady) {
    return {
      user_id: userId,
      tracking_enabled: true,
      matching_enabled: true,
      show_approx_area: true,
      allow_recommendations: true,
      hide_home_area: true,
      hide_work_area: true,
      data_retention_days: 30,
    };
  }

  return apiRequest(`/users/${userId}/privacy`, {
    method: "PATCH",
    body: {},
  });
}

async function loadSocialData(userId) {
  const persona = currentPersonaUser();

  if (!state.apiReady) {
    state.socialMatches = fallbackSocialMatches(persona);
    const fallback = fallbackLikedAndFriends(persona);
    state.likedPeople = fallback.likedPeople;
    state.friends = fallback.friends;
    state.routineMirror = fallbackRoutineMirror(persona);
    return;
  }

  const [coach, liked, friends, mirror] = await Promise.all([
    apiRequest(`/social/match-coach/${userId}`).catch(() => []),
    apiRequest(`/social/liked/${userId}`).catch(() => []),
    apiRequest(`/social/friends/${userId}`).catch(() => []),
    apiRequest(`/social/routine-mirror/${userId}`).catch(() => null),
  ]);

  state.socialMatches = coach;
  state.likedPeople = liked;
  state.friends = friends;
  state.routineMirror = mirror || fallbackRoutineMirror(persona);
}

async function recomputePipeline(userId, forceSynthetic = false) {
  if (!state.apiReady) {
    return;
  }

  const persona = currentPersonaUser();
  const history = await apiRequest(`/location/history/${userId}?limit=30`);

  if ((forceSynthetic || history.length === 0) && state.privacy?.tracking_enabled !== false) {
    const syntheticLogs = generateSimulatedLogs(userId, persona);
    if (syntheticLogs.length) {
      await apiRequest("/location/batch", {
        method: "POST",
        body: { logs: syntheticLogs },
      });
    }
  }

  await apiRequest(`/process/stay-points/${userId}`, { method: "POST" });
  state.dailyRoutes = await apiRequest(`/process/daily-routes/${userId}`, { method: "POST" });

  if (state.dailyRoutes.length > 0) {
    state.profile = await apiRequest(`/process/routine-profile/${userId}`, { method: "POST" });
  } else {
    state.profile = null;
  }

  try {
    state.matches = await apiRequest(`/match/recalculate/${userId}`, { method: "POST" });
  } catch {
    state.matches = [];
  }

  try {
    state.recommendations = await apiRequest(`/recommendations/recalculate/${userId}`, { method: "POST" });
  } catch {
    state.recommendations = [];
  }

  state.locationLogs = await apiRequest(`/location/history/${userId}?limit=500`);
  await loadSocialData(userId);
}

async function loadUserData(userId) {
  const persona = currentPersonaUser();

  if (!state.apiReady) {
    state.privacy = {
      user_id: userId,
      tracking_enabled: true,
      matching_enabled: true,
      show_approx_area: true,
      allow_recommendations: true,
      hide_home_area: true,
      hide_work_area: true,
      data_retention_days: 30,
    };
    state.locationLogs = [];
    state.dailyRoutes = [];
    state.profile = null;
    state.matches = fallbackMatchesForPersona(persona);
    state.recommendations = [];
    await loadSocialData(userId);
    return;
  }

  state.privacy = await loadPrivacySettings(userId);
  state.locationLogs = await apiRequest(`/location/history/${userId}?limit=500`);

  try {
    state.matches = await apiRequest(`/matches/${userId}`);
  } catch {
    state.matches = [];
  }

  try {
    state.recommendations = await apiRequest(`/recommendations/${userId}`);
  } catch {
    state.recommendations = [];
  }

  if (state.matches.length === 0 || state.recommendations.length === 0 || state.placesProvider === "google") {
    await recomputePipeline(userId, state.locationLogs.length === 0);
  } else {
    try {
      state.profile = await apiRequest(`/process/routine-profile/${userId}`, { method: "POST" });
    } catch {
      state.profile = null;
    }
    await loadSocialData(userId);
  }
}

function renderFallbackMap(persona) {
  const map = document.querySelector("#map");
  map.classList.remove("google-mode");

  if (state.googleMapRoute) {
    state.googleMapRoute.setMap(null);
    state.googleMapRoute = null;
  }
  clearGoogleMapOverlays();
  state.googleMap = null;

  const points = persona.zones.map(zone => `${zone.x},${zone.y}`).join(" ");
  map.innerHTML = `
    <div class="road r1"></div>
    <div class="road r2"></div>
    <div class="road r3"></div>
    <svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="#ee7b62" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"></polyline>
    </svg>
    ${persona.zones.map(zone => `
      <div class="zone ${zone.type}" style="left:${zone.x}%;top:${zone.y}%"></div>
      <div class="pin" style="left:${zone.x}%;top:${zone.y}%">
        <strong>${zone.label}</strong>
        <span>${zone.detail}</span>
      </div>
    `).join("")}
  `;
}

function personaPath(persona) {
  return persona.zones.map(zone => locationPointFromZone(zone));
}

function pathCenter(points) {
  if (!points.length) {
    return { lat: 1.3521, lng: 103.8198 };
  }

  const total = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: total.lat / points.length, lng: total.lng / points.length };
}

function recommendationPins() {
  return state.recommendations
    .map(reco => ({
      name: reco.place?.name || "Suggested Place",
      latitude: reco.place?.latitude,
      longitude: reco.place?.longitude,
      score: reco.score,
    }))
    .filter(place => typeof place.latitude === "number" && typeof place.longitude === "number")
    .slice(0, 12);
}

async function renderGoogleMap(persona) {
  const loaded = await ensureGoogleMapsLoaded();
  if (!loaded || !window.google || !window.google.maps) {
    renderFallbackMap(persona);
    return;
  }

  const mapElement = document.querySelector("#map");
  mapElement.classList.add("google-mode");

  if (!state.googleMap) {
    mapElement.innerHTML = "";
    state.googleMap = new window.google.maps.Map(mapElement, {
      center: { lat: 1.3521, lng: 103.8198 },
      zoom: 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
    });
  }

  if (state.googleMapRoute) {
    state.googleMapRoute.setMap(null);
    state.googleMapRoute = null;
  }
  clearGoogleMapOverlays();

  const routePoints = personaPath(persona);
  const center = pathCenter(routePoints);
  state.googleMap.setCenter(center);

  if (routePoints.length > 1) {
    state.googleMapRoute = new window.google.maps.Polyline({
      map: state.googleMap,
      path: routePoints,
      geodesic: true,
      strokeColor: "#ee7b62",
      strokeOpacity: 0.85,
      strokeWeight: 4,
    });
  }

  const bounds = new window.google.maps.LatLngBounds();

  routePoints.forEach((point, index) => {
    const zone = persona.zones[index];
    const marker = new window.google.maps.Marker({
      map: state.googleMap,
      position: point,
      title: zone?.label || "Routine zone",
      label: String(index + 1),
    });
    state.googleMapMarkers.push(marker);
    bounds.extend(point);
  });

  recommendationPins().forEach(place => {
    const marker = new window.google.maps.Marker({
      map: state.googleMap,
      position: { lat: place.latitude, lng: place.longitude },
      title: place.name,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 5,
        fillColor: "#2a7f62",
        fillOpacity: 0.9,
        strokeColor: "#ffffff",
        strokeWeight: 1.2,
      },
    });
    state.googleMapMarkers.push(marker);
    bounds.extend({ lat: place.latitude, lng: place.longitude });
  });

  if (!bounds.isEmpty()) {
    state.googleMap.fitBounds(bounds, 42);
  }
}

function renderMap(persona) {
  if (!shouldUseGoogleMap()) {
    renderFallbackMap(persona);
    return;
  }

  void renderGoogleMap(persona);
}

function renderRoutines(persona) {
  document.querySelector("#loop-count").textContent = `${persona.routines.length} loops`;
  document.querySelector("#routine-list").innerHTML = persona.routines.map(([title, body, icon]) => `
    <div class="routine-item">
      <div class="iconbox">${icons[icon]}</div>
      <div>
        <strong>${title}</strong>
        <span>${body}</span>
      </div>
    </div>
  `).join("");
}

function topCategoriesFromProfile() {
  const categories = (state.profile?.frequent_place_categories || [])
    .slice(0, 5)
    .map(item => item.category)
    .filter(Boolean);

  if (categories.length) {
    return categories;
  }

  return currentPersonaUser().tags.slice(0, 5);
}

function renderSummary(persona) {
  const tags = topCategoriesFromProfile();
  const topMatch = state.socialMatches[0] || state.matches[0];
  const trackingOn = state.privacy?.tracking_enabled !== false;

  const summaryLine = state.profile
    ? `Routine profile updated for ${state.profile.period_start} to ${state.profile.period_end}. Matching uses compressed routes and generalized stay points.`
    : `You appear to be a ${persona.persona}. This is based on simulated approximate movement data only.`;

  document.querySelector("#summary-text").textContent = summaryLine;
  document.querySelector("#summary-tags").innerHTML = tags.map((tag, index) => (
    `<span class="tag ${index % 3 === 1 ? "blue" : index % 3 === 2 ? "gold" : ""}">${tag}</span>`
  )).join("");

  const routineDays = new Set(state.locationLogs.map(log => String(log.timestamp).slice(0, 10))).size;

  document.querySelector("#metrics").innerHTML = [
    [trackingOn ? "On" : "Paused", "tracking status"],
    [`${routineDays}`, "routine days recorded"],
    [formatScore(topMatch?.final_score || 0), "latest top match"],
    [`${state.recommendations.length}`, "recommended places"],
  ].map(([value, label]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("");

  const sourceText = state.usingFallback
    ? "Backend offline: showing local demo mode with privacy-safe mock matching."
    : `Backend connected: using FastAPI + PostgreSQL routine processing. ${state.placesProvider === "google" ? "Google Places live mode." : "Seeded places mode."} ${shouldUseGoogleMap() ? "Google Maps mode." : "Mock map mode."}`;
  document.querySelector("#home-note").textContent = sourceText;
}

function renderMatchCard(match) {
  const tags = [
    `${formatScore(match.route_similarity)} route`,
    `${formatScore(match.time_similarity)} time`,
    `${formatScore(match.place_similarity)} place`,
  ];
  const name = match.other_user_name || `User ${String(match.user_id_2).slice(0, 6)}`;
  const isLiked = match.like_state === "liked";

  return `
    <article class="card" data-match-id="${match.match_id}" data-other-user-id="${match.user_id_2}">
      <div class="avatar-row">
        <div class="avatar-name">
          <div class="avatar">${name.slice(0, 1)}</div>
          <div>
            <h3>${name}</h3>
            <p class="explain">Privacy-safe profile</p>
          </div>
        </div>
        <div class="score">${formatScore(match.final_score)}</div>
      </div>
      <div class="tag-row">${tags.map(tag => `<span class="tag blue">${tag}</span>`).join("")}</div>
      <p class="explain">${match.fit_explanation || match.explanation}</p>
      <p class="explain"><strong>Discovery:</strong> ${match.discovery_note || "Complementary lifestyle signal available."}</p>
      <div class="card-actions">
        <button class="connect" data-action="like" data-match-id="${match.match_id}" data-other-user-id="${match.user_id_2}" ${isLiked ? "disabled" : ""}>${icons.send} ${isLiked ? "Liked" : "Like"}</button>
        <button class="connect secondary" data-action="detail" data-match-id="${match.match_id}">View detail</button>
        <button class="connect secondary" data-action="skip" data-match-id="${match.match_id}">Skip</button>
      </div>
      <div class="inset-top" ${isLiked ? "" : "hidden"} data-coach-panel>
        <p class="explain"><strong>Safe icebreakers</strong></p>
        <div class="tag-row">${(match.safe_icebreakers || []).map(item => `<span class="tag">${item}</span>`).join("")}</div>
        <p class="explain inset-top"><strong>First-meet activity types</strong></p>
        <div class="tag-row">${(match.first_meet_activities || []).map(item => `<span class="tag gold">${item}</span>`).join("")}</div>
      </div>
      <div class="chat-input-row inset-top">
        <input class="field-input" data-match-question placeholder="Ask Match Coach follow-up">
        <button class="connect secondary" data-action="ask-match" data-other-user-id="${match.user_id_2}">Ask</button>
      </div>
      <p class="explain" data-match-answer></p>
    </article>
  `;
}

async function handleLike(match) {
  if (!state.currentUser) {
    return;
  }

  if (state.apiReady) {
    await apiRequest("/social/likes", {
      method: "POST",
      body: {
        from_user_id: state.currentUser.user_id,
        to_user_id: match.user_id_2,
        action: "like",
      },
    });
    await loadSocialData(state.currentUser.user_id);
    renderMatches(currentPersonaUser());
    renderFriends();
    return;
  }

  const me = currentPersonaUser().id;
  const other = String(match.user_id_2);
  state.localLikes[me] = state.localLikes[me] || {};
  state.localLikes[me][other] = "liked";

  if (hashFraction(`${other}:${me}`) > 0.35) {
    state.localLikes[other] = state.localLikes[other] || {};
    state.localLikes[other][me] = "liked";
  }

  await loadSocialData(state.currentUser.user_id);
  renderMatches(currentPersonaUser());
  renderFriends();
}

async function askMatchCoach(otherUserId, question, answerTarget) {
  if (!state.currentUser || !question.trim()) {
    return;
  }

  answerTarget.textContent = "Thinking...";

  if (state.apiReady) {
    try {
      const response = await apiRequest(`/social/match-coach/${state.currentUser.user_id}/${otherUserId}/ask`, {
        method: "POST",
        body: { question },
      });
      answerTarget.textContent = response.answer;
    } catch (error) {
      answerTarget.textContent = `Unable to answer: ${error.message}`;
    }
    return;
  }

  const match = state.socialMatches.find(item => String(item.user_id_2) === String(otherUserId));
  if (!match) {
    answerTarget.textContent = "No match context available.";
    return;
  }

  if (question.toLowerCase().includes("why")) {
    answerTarget.textContent = match.fit_explanation;
  } else if (question.toLowerCase().includes("ice")) {
    answerTarget.textContent = (match.safe_icebreakers || ["Start with a low-pressure weekly highlight question."])[0];
  } else {
    answerTarget.textContent = (match.first_meet_activities || ["Public daytime meetup near transit."])[0];
  }
}

function renderMatches(persona) {
  const records = state.socialMatches.length ? state.socialMatches : fallbackSocialMatches(persona);
  document.querySelector("#match-list").innerHTML = records.map(renderMatchCard).join("");

  document.querySelectorAll("[data-action='detail']").forEach(button => {
    button.addEventListener("click", () => {
      const matchId = button.dataset.matchId;
      const record = records.find(item => String(item.match_id) === String(matchId));
      if (!record) {
        return;
      }

      matchModalTitle.textContent = `Match Detail · ${record.other_user_name || record.user_id_2}`;
      matchModalBody.textContent = record.fit_explanation || record.explanation;
      matchModalTags.innerHTML = [
        `Route ${formatScore(record.route_similarity)}`,
        `Time ${formatScore(record.time_similarity)}`,
        `Place ${formatScore(record.place_similarity)}`,
        `Lifestyle ${formatScore(record.lifestyle_similarity)}`,
        `Interest ${formatScore(record.interest_similarity)}`,
      ].map(text => `<span class="tag">${text}</span>`).join("");
      matchModal.classList.add("visible");
    });
  });

  document.querySelectorAll("[data-action='like']").forEach(button => {
    button.addEventListener("click", async () => {
      const matchId = button.dataset.matchId;
      const record = records.find(item => String(item.match_id) === String(matchId));
      if (!record) {
        return;
      }

      button.disabled = true;
      try {
        await handleLike(record);
      } catch (error) {
        button.disabled = false;
        privacyMessage.textContent = `Like failed: ${error.message}`;
      }
    });
  });

  document.querySelectorAll("[data-action='skip']").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".card");
      if (card) {
        card.remove();
      }
    });
  });

  document.querySelectorAll("[data-action='ask-match']").forEach(button => {
    button.addEventListener("click", async () => {
      const card = button.closest(".card");
      if (!card) {
        return;
      }

      const questionInput = card.querySelector("[data-match-question]");
      const answerTarget = card.querySelector("[data-match-answer]");
      if (!questionInput || !answerTarget) {
        return;
      }

      const question = questionInput.value.trim();
      if (!question) {
        return;
      }

      await askMatchCoach(button.dataset.otherUserId, question, answerTarget);
    });
  });
}

function renderRecommendations(persona) {
  if (state.recommendations.length) {
    document.querySelector("#points-total").textContent = `${state.recommendations.length} results`;
    document.querySelector("#mission-list").innerHTML = state.recommendations.map(reco => {
      const place = reco.place || {};
      const rating = place.rating ? ` · ${place.rating.toFixed(1)}★` : "";
      const category = place.category || "local";
      return `
        <div class="mission">
          <div class="iconbox">${icons.star}</div>
          <div>
            <h3>${place.name || "Suggested Place"}</h3>
            <p>${reco.reason}</p>
            <p class="explain">${category}${rating}</p>
          </div>
          <div class="points">${Math.round((reco.score || 0) * 100)}</div>
        </div>
      `;
    }).join("");
  } else {
    const selected = STATIC_DATA.missionTemplates
      .filter(mission => persona.vector[mission.needs] > 0.45)
      .sort((a, b) => persona.vector[b.needs] - persona.vector[a.needs])
      .slice(0, 4);

    document.querySelector("#points-total").textContent = `${selected.length} results`;
    document.querySelector("#mission-list").innerHTML = selected.map(mission => `
      <div class="mission">
        <div class="iconbox">${icons[mission.icon]}</div>
        <div>
          <h3>${mission.title}</h3>
          <p>${mission.body}</p>
        </div>
        <div class="points">+${mission.points}</div>
      </div>
    `).join("");
  }

  document.querySelector("#reward-list").innerHTML = STATIC_DATA.rewards.map(([title, body]) => `
    <div class="reward">
      <strong>${title}</strong>
      <span>${body}</span>
      <span class="tag gold">Approx-route relevant</span>
    </div>
  `).join("");
}

function renderPrivacyRules() {
  document.querySelector("#privacy-grid").innerHTML = STATIC_DATA.privacyRules.map(([title, body]) => `
    <div class="rule">
      <strong>${icons.shield}${title}</strong>
      <span>${body}</span>
    </div>
  `).join("");
}

function renderPrivacyControls() {
  if (!state.privacy) {
    privacyForm.innerHTML = "";
    return;
  }

  const controls = [
    ["tracking_enabled", "Tracking enabled", "Collect approximate GPS points"],
    ["matching_enabled", "Matching enabled", "Allow routine-based matching"],
    ["allow_recommendations", "Recommendations enabled", "Allow route-based place suggestions"],
    ["hide_home_area", "Hide home area", "Always keep home-like zones generalized"],
    ["hide_work_area", "Hide work area", "Always keep work/school zones generalized"],
  ];

  privacyForm.innerHTML = controls.map(([key, label, body]) => `
    <div class="setting">
      <div>
        <label for="privacy-${key}">${label}</label>
        <span>${body}</span>
      </div>
      <input class="toggle" type="checkbox" id="privacy-${key}" data-key="${key}" ${state.privacy[key] ? "checked" : ""}>
    </div>
  `).join("");

  privacyForm.querySelectorAll("input[data-key]").forEach(input => {
    input.addEventListener("change", async () => {
      const field = input.dataset.key;
      const value = input.checked;
      privacyMessage.textContent = "Saving...";

      if (!state.apiReady || !state.currentUser) {
        state.privacy[field] = value;
        privacyMessage.textContent = "Saved in demo mode.";
        return;
      }

      try {
        state.privacy = await apiRequest(`/users/${state.currentUser.user_id}/privacy`, {
          method: "PATCH",
          body: { [field]: value },
        });
        privacyMessage.textContent = "Saved.";
      } catch (error) {
        input.checked = !value;
        privacyMessage.textContent = `Failed: ${error.message}`;
      }
    });
  });
}

function renderRoutineMirror() {
  const mirror = state.routineMirror || fallbackRoutineMirror(currentPersonaUser());

  routineMirrorSummary.textContent = mirror.weekly_summary || "Routine Mirror summary unavailable.";
  const highlights = mirror.habit_highlights || [];
  routineMirrorHighlights.innerHTML = highlights.length
    ? highlights.map(item => `<span class="tag">${item}</span>`).join("")
    : "<span class='tag'>No highlights yet</span>";

  const alerts = mirror.routine_drift_alerts || [];
  routineMirrorAlerts.textContent = alerts.length
    ? `Routine drift alerts: ${alerts.join(" ")}`
    : "Routine drift alerts: No major drift detected this week.";

  routineChatLog.innerHTML = state.routineChatMessages.map(item => `
    <div class="chat-message ${item.role === "user" ? "mine" : ""}">
      ${item.text}
      <span class="meta">${item.role === "user" ? "You" : "Routine Mirror"}</span>
    </div>
  `).join("");
}

async function handleRoutineAsk() {
  if (!state.currentUser) {
    return;
  }

  const question = routineChatInput.value.trim();
  if (!question) {
    return;
  }

  state.routineChatMessages.push({ role: "user", text: question });
  routineChatInput.value = "";
  renderRoutineMirror();

  if (state.apiReady) {
    try {
      const response = await apiRequest(`/social/routine-mirror/${state.currentUser.user_id}/ask`, {
        method: "POST",
        body: { question },
      });
      state.routineChatMessages.push({ role: "assistant", text: response.answer });
    } catch (error) {
      state.routineChatMessages.push({ role: "assistant", text: `Unable to answer now: ${error.message}` });
    }
  } else {
    const lower = question.toLowerCase();
    if (lower.includes("drift")) {
      state.routineChatMessages.push({ role: "assistant", text: "No severe drift signal in demo mode. Keep your anchor weekday habit stable." });
    } else if (lower.includes("energy")) {
      state.routineChatMessages.push({ role: "assistant", text: "Your energy peaks in evening and weekend midday windows." });
    } else {
      state.routineChatMessages.push({ role: "assistant", text: "Ask me about drift, energy, or habit consistency for focused guidance." });
    }
  }

  renderRoutineMirror();
}

function renderLikedPeople() {
  if (!state.likedPeople.length) {
    likedList.innerHTML = "<p class='explain'>No liked people yet. Like someone in Matches first.</p>";
    return;
  }

  likedList.innerHTML = state.likedPeople.map(person => `
    <div class="liked-card">
      <div class="friend-head">
        <strong>${person.other_user_name}</strong>
        <span class="tag ${person.is_mutual ? "gold" : "blue"}">${person.is_mutual ? "Mutual" : "Waiting"}</span>
      </div>
      <div class="tag-row">${(person.weekly_windows || []).map(window => `<span class="tag">${window.label}</span>`).join("")}</div>
    </div>
  `).join("");
}

async function loadActiveThread(friendUserId) {
  if (!state.currentUser || !friendUserId) {
    state.activeThread = null;
    return;
  }

  if (state.apiReady) {
    try {
      state.activeThread = await apiRequest(`/social/chats/${state.currentUser.user_id}/${friendUserId}`);
      return;
    } catch (error) {
      state.activeThread = null;
      friendChatSubtitle.textContent = `Unable to load chat: ${error.message}`;
      return;
    }
  }

  const me = currentPersonaUser();
  const other = personaByUserId(friendUserId);
  const messages = ensureFallbackChat(me.id, other.id);
  const activeFriend = state.friends.find(friend => String(friend.friend_user_id) === String(friendUserId));
  state.activeThread = {
    connection_id: activeFriend?.connection_id || chatKey(me.id, other.id),
    friend_user_id: other.id,
    friend_name: other.name,
    weekly_windows: activeFriend?.weekly_windows || fallbackPlannerWindows(me, other),
    place_scout: activeFriend?.place_scout || fallbackPlaceScout(me, other),
    messages,
  };
}

function renderFriendThread() {
  safetyAlert.hidden = true;
  safetyAlert.textContent = "";

  if (!state.activeThread) {
    friendChatTitle.textContent = "Friend Chat";
    friendChatSubtitle.textContent = "Select a mutual friend to start chatting.";
    friendWindows.innerHTML = "";
    friendPlaceScout.innerHTML = "";
    friendChatMessages.innerHTML = "";
    return;
  }

  friendChatTitle.textContent = `Chat · ${state.activeThread.friend_name}`;
  friendChatSubtitle.textContent = "Safety Layer is active and monitors risky meetup signals.";

  friendWindows.innerHTML = (state.activeThread.weekly_windows || [])
    .map(window => `<span class="tag blue">${window.label}</span>`)
    .join("");

  friendPlaceScout.innerHTML = (state.activeThread.place_scout || []).map(place => `
    <div class="place-scout-item">
      <strong>${place.name}</strong>
      <p class="explain">${place.reason}</p>
      <span class="tag gold">${place.category}</span>
    </div>
  `).join("");

  friendChatMessages.innerHTML = (state.activeThread.messages || []).map(message => `
    <div class="chat-message ${String(message.sender_user_id) === String(state.currentUser?.user_id) ? "mine" : ""}">
      ${message.body}
      <span class="meta">${String(message.sender_user_id) === String(state.currentUser?.user_id) ? "You" : state.activeThread.friend_name}</span>
    </div>
  `).join("");
}

async function renderFriends() {
  renderLikedPeople();

  if (!state.friends.length) {
    friendList.innerHTML = "<p class='explain'>No mutual friends yet. A user appears here only when both of you like each other.</p>";
    state.activeFriendId = null;
    state.activeThread = null;
    renderFriendThread();
    return;
  }

  if (!state.activeFriendId || !state.friends.some(friend => String(friend.friend_user_id) === String(state.activeFriendId))) {
    state.activeFriendId = String(state.friends[0].friend_user_id);
    await loadActiveThread(state.activeFriendId);
  }

  friendList.innerHTML = state.friends.map(friend => `
    <button class="friend-card ${String(friend.friend_user_id) === String(state.activeFriendId) ? "active" : ""}" data-friend-id="${friend.friend_user_id}">
      <div class="friend-head">
        <strong>${friend.friend_name}</strong>
        <span class="tag gold">Mutual</span>
      </div>
      <div class="tag-row">${(friend.weekly_windows || []).map(window => `<span class="tag">${window.label}</span>`).join("")}</div>
    </button>
  `).join("");

  friendList.querySelectorAll("[data-friend-id]").forEach(button => {
    button.addEventListener("click", async () => {
      state.activeFriendId = button.dataset.friendId;
      await loadActiveThread(state.activeFriendId);
      await renderFriends();
    });
  });

  renderFriendThread();
}

async function handleFriendSend() {
  if (!state.currentUser || !state.activeFriendId) {
    return;
  }

  const body = friendChatInput.value.trim();
  if (!body) {
    return;
  }

  friendChatInput.value = "";

  if (state.apiReady) {
    try {
      const message = await apiRequest(`/social/chats/${state.currentUser.user_id}/${state.activeFriendId}/messages`, {
        method: "POST",
        body: {
          sender_user_id: state.currentUser.user_id,
          body,
        },
      });

      if (state.activeThread) {
        state.activeThread.messages.push(message);
      }

      if (message.safety_flagged) {
        safetyAlert.hidden = false;
        safetyAlert.textContent = `Safety alert: ${message.safety_reason}. ${message.safety_alternatives.join(" ")}`;
      } else {
        safetyAlert.hidden = true;
      }
      renderFriendThread();
    } catch (error) {
      safetyAlert.hidden = false;
      safetyAlert.textContent = `Send failed: ${error.message}`;
    }
    return;
  }

  const me = currentPersonaUser().id;
  const key = chatKey(me, state.activeFriendId);
  const message = {
    message_id: `${key}-${Date.now()}`,
    sender_user_id: me,
    body,
    safety_flagged: /my place|hotel|midnight|send money|secret/i.test(body),
    safety_reason: /my place|hotel/i.test(body)
      ? "Private-location pressure before trust"
      : /midnight|late night/i.test(body)
        ? "Very late meetup timing"
        : /send money/i.test(body)
          ? "Money request signal"
          : /secret/i.test(body)
            ? "Secrecy request"
            : null,
    safety_alternatives: [
      "Suggest a public venue.",
      "Prefer daytime or early evening windows.",
      "Pick a place near transit.",
    ],
    created_at: new Date().toISOString(),
  };
  state.localChats[key] = state.localChats[key] || [];
  state.localChats[key].push(message);

  if (state.activeThread) {
    state.activeThread.messages.push(message);
  }

  if (message.safety_flagged) {
    safetyAlert.hidden = false;
    safetyAlert.textContent = `Safety alert: ${message.safety_reason}. ${message.safety_alternatives.join(" ")}`;
  } else {
    safetyAlert.hidden = true;
  }

  renderFriendThread();
}

function updatePageHeader(sectionId) {
  const copy = STATIC_DATA.pageCopy[sectionId] || STATIC_DATA.pageCopy.routine;
  document.querySelector("#page-title").textContent = copy[0];
  document.querySelector("#page-subtitle").textContent = copy[1];
}

async function renderAll() {
  const persona = currentPersonaUser();
  renderMap(persona);
  renderRoutines(persona);
  renderSummary(persona);
  renderMatches(persona);
  renderRecommendations(persona);
  renderPrivacyRules();
  renderPrivacyControls();
  renderRoutineMirror();
  await renderFriends();
}

async function handleUserSwitch(userId) {
  const selected = state.users.find(item => String(item.user_id) === String(userId));
  if (!selected) {
    return;
  }

  state.currentUser = selected;
  userSelect.value = selected.user_id;
  privacyMessage.textContent = "";
  state.routineChatMessages = [];
  state.activeFriendId = null;
  state.activeThread = null;

  rerunButton.disabled = true;
  try {
    await loadUserData(selected.user_id);
  } catch (error) {
    state.usingFallback = true;
    state.matches = fallbackMatchesForPersona(currentPersonaUser());
    await loadSocialData(selected.user_id);
    privacyMessage.textContent = `Using fallback mode: ${error.message}`;
  } finally {
    rerunButton.disabled = false;
  }

  await renderAll();
}

async function handleLogin() {
  loginMessage.textContent = "";
  loginContinue.disabled = true;

  try {
    const user = await ensureUserFromLogin(loginName.value, loginEmail.value);

    if (state.apiReady) {
      await bootstrapUsers();
    } else {
      state.users = fallbackUsers();
    }

    state.currentUser = state.users.find(item => String(item.user_id) === String(user.user_id)) || state.users[0];
    populateUserSelect();
    await handleUserSwitch(state.currentUser.user_id);

    loginModal.classList.remove("visible");
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    loginContinue.disabled = false;
  }
}

function setupNavigation() {
  navButtons.forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.section;
      navButtons.forEach(item => item.classList.toggle("active", item === button));
      sections.forEach(section => section.classList.toggle("active", section.id === target));
      updatePageHeader(target);
    });
  });
}

function setupActions() {
  userSelect.addEventListener("change", async () => {
    await handleUserSwitch(userSelect.value);
  });

  rerunButton.addEventListener("click", async () => {
    if (!state.currentUser) {
      return;
    }

    rerunButton.disabled = true;
    privacyMessage.textContent = "Recomputing...";
    try {
      if (state.apiReady) {
        state.privacy = await loadPrivacySettings(state.currentUser.user_id);
        await recomputePipeline(state.currentUser.user_id, true);
      }
      privacyMessage.textContent = "Recompute complete.";
    } catch (error) {
      privacyMessage.textContent = `Recompute failed: ${error.message}`;
    } finally {
      rerunButton.disabled = false;
      await renderAll();
    }
  });

  deleteHistoryButton.addEventListener("click", async () => {
    if (!state.currentUser) {
      return;
    }

    if (!state.apiReady) {
      state.locationLogs = [];
      state.profile = null;
      state.dailyRoutes = [];
      state.matches = fallbackMatchesForPersona(currentPersonaUser());
      state.socialMatches = fallbackSocialMatches(currentPersonaUser());
      state.recommendations = [];
      state.likedPeople = [];
      state.friends = [];
      privacyMessage.textContent = "Local demo history cleared.";
      await renderAll();
      return;
    }

    deleteHistoryButton.disabled = true;
    try {
      const result = await apiRequest(`/location/history/${state.currentUser.user_id}`, { method: "DELETE" });
      privacyMessage.textContent = result.message;
      state.locationLogs = [];
      state.dailyRoutes = [];
      state.profile = null;
      state.matches = [];
      state.socialMatches = [];
      state.recommendations = [];
      state.likedPeople = [];
      state.friends = [];
      await renderAll();
    } catch (error) {
      privacyMessage.textContent = `Delete failed: ${error.message}`;
    } finally {
      deleteHistoryButton.disabled = false;
    }
  });

  matchModalClose.addEventListener("click", () => {
    matchModal.classList.remove("visible");
  });

  routineChatSend.addEventListener("click", () => {
    void handleRoutineAsk();
  });

  friendChatSend.addEventListener("click", () => {
    void handleFriendSend();
  });

  routineChatInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleRoutineAsk();
    }
  });

  friendChatInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleFriendSend();
    }
  });

  loginContinue.addEventListener("click", handleLogin);
}

async function init() {
  setupNavigation();
  setupActions();
  renderPrivacyRules();

  await checkApiHealth();
  await bootstrapUsers();

  const firstUser = state.users[0];
  if (firstUser) {
    loginName.value = firstUser.name;
    loginEmail.value = firstUser.email;
  }

  populateUserSelect();
  updatePageHeader("routine");
  await renderAll();
}

void init();
