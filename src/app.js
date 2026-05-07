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

const state = {
  apiReady: false,
  usingFallback: false,
  users: [],
  currentUser: null,
  privacy: null,
  dailyRoutes: [],
  profile: null,
  locationLogs: [],
  matches: [],
  recommendations: [],
};

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
      // Ignore parse failure and use default message.
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
  } catch {
    state.apiReady = false;
    state.usingFallback = true;
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

  if (state.matches.length === 0 || state.recommendations.length === 0) {
    await recomputePipeline(userId, state.locationLogs.length === 0);
  } else {
    try {
      state.profile = await apiRequest(`/process/routine-profile/${userId}`, { method: "POST" });
    } catch {
      state.profile = null;
    }
  }
}

function renderMap(persona) {
  const map = document.querySelector("#map");
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
  const topMatch = state.matches[0];
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
    : "Backend connected: using FastAPI + PostgreSQL routine processing.";
  document.querySelector("#home-note").textContent = sourceText;
}

function renderMatchCard(match) {
  const tags = [
    `${formatScore(match.route_similarity)} route`,
    `${formatScore(match.time_similarity)} time`,
    `${formatScore(match.place_similarity)} place`,
  ];
  const name = match.other_user_name || `User ${String(match.user_id_2).slice(0, 6)}`;

  return `
    <article class="card" data-match-id="${match.match_id}">
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
      <p class="explain">${match.explanation}</p>
      <div class="card-actions">
        <button class="connect" data-action="like" data-match-id="${match.match_id}">${icons.send} Like</button>
        <button class="connect secondary" data-action="detail" data-match-id="${match.match_id}">View detail</button>
        <button class="connect secondary" data-action="skip" data-match-id="${match.match_id}">Skip</button>
      </div>
    </article>
  `;
}

function renderMatches(persona) {
  const fallbackMatches = fallbackMatchesForPersona(persona);
  const records = state.matches.length ? state.matches : fallbackMatches;
  document.querySelector("#match-list").innerHTML = records.map(renderMatchCard).join("");

  document.querySelectorAll("[data-action='detail']").forEach(button => {
    button.addEventListener("click", () => {
      const matchId = button.dataset.matchId;
      const record = records.find(item => String(item.match_id) === String(matchId));
      if (!record) {
        return;
      }

      matchModalTitle.textContent = `Match Detail · ${record.other_user_name || record.user_id_2}`;
      matchModalBody.textContent = record.explanation;
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
    button.addEventListener("click", () => {
      button.textContent = "Liked";
      button.disabled = true;
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

function updatePageHeader(sectionId) {
  const copy = STATIC_DATA.pageCopy[sectionId] || STATIC_DATA.pageCopy.routine;
  document.querySelector("#page-title").textContent = copy[0];
  document.querySelector("#page-subtitle").textContent = copy[1];
}

function renderAll() {
  const persona = currentPersonaUser();
  renderMap(persona);
  renderRoutines(persona);
  renderSummary(persona);
  renderMatches(persona);
  renderRecommendations(persona);
  renderPrivacyRules();
  renderPrivacyControls();
}

async function handleUserSwitch(userId) {
  const selected = state.users.find(item => String(item.user_id) === String(userId));
  if (!selected) {
    return;
  }

  state.currentUser = selected;
  userSelect.value = selected.user_id;
  privacyMessage.textContent = "";

  rerunButton.disabled = true;
  try {
    await loadUserData(selected.user_id);
  } catch (error) {
    state.usingFallback = true;
    state.matches = fallbackMatchesForPersona(currentPersonaUser());
    privacyMessage.textContent = `Using fallback mode: ${error.message}`;
  } finally {
    rerunButton.disabled = false;
  }

  renderAll();
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
      renderAll();
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
      state.recommendations = [];
      privacyMessage.textContent = "Local demo history cleared.";
      renderAll();
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
      state.recommendations = [];
      renderAll();
    } catch (error) {
      privacyMessage.textContent = `Delete failed: ${error.message}`;
    } finally {
      deleteHistoryButton.disabled = false;
    }
  });

  matchModalClose.addEventListener("click", () => {
    matchModal.classList.remove("visible");
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
  renderAll();
}

init();
