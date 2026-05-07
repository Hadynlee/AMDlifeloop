const { users, missionTemplates, rewards, privacyRules, pageCopy } = window.LIFELOOP_DATA;
const icons = window.LIFELOOP_ICONS;

const STORAGE_KEY = "lifeloop-social-state-v3";
const MAX_GALLERY_PHOTOS = 4;
const AVATAR_IMAGE_OPTIONS = {
  maxDimension: 720,
  quality: 0.84,
  maxLength: 260000,
};
const GALLERY_IMAGE_OPTIONS = {
  maxDimension: 1280,
  quality: 0.82,
  maxLength: 460000,
};

const userSelect = document.querySelector("#user-select");
const navButtons = document.querySelectorAll(".nav-button");
const sections = document.querySelectorAll(".section");
const matchListElement = document.querySelector("#match-list");
const profileEditorElement = document.querySelector("#profile-editor");
const profileMessage = document.querySelector("#profile-message");
const connectionsList = document.querySelector("#connections-list");
const incomingRequestsList = document.querySelector("#incoming-requests-list");
const outgoingRequestsList = document.querySelector("#outgoing-requests-list");
const zoomModal = document.querySelector("#profile-zoom-modal");
const zoomImage = document.querySelector("#profile-zoom-image");
const zoomClose = document.querySelector("#profile-zoom-close");
const publicProfileModal = document.querySelector("#public-profile-modal");
const publicProfileContent = document.querySelector("#public-profile-content");
const publicProfileClose = document.querySelector("#public-profile-close");

const state = {
  social: loadSocialState(),
  activeProfileView: "connections",
};

let profileMessageTimer = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeImageDataUrl(value, maxLength) {
  const dataUrl = String(value || "");
  if (!dataUrl.startsWith("data:image/")) {
    return "";
  }
  return dataUrl.length <= maxLength ? dataUrl : "";
}

function titleCase(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "Lifestyle Explorer";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sanitizeIds(value, userId) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  return list
    .map(item => String(item))
    .filter(item => item && item !== userId && users.some(user => user.id === item))
    .filter(item => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

function connectUsers(records, leftId, rightId) {
  if (leftId === rightId || !records[leftId] || !records[rightId]) {
    return;
  }
  if (!records[leftId].connections.includes(rightId)) {
    records[leftId].connections.push(rightId);
  }
  if (!records[rightId].connections.includes(leftId)) {
    records[rightId].connections.push(leftId);
  }
  removeFromArray(records[leftId].incomingRequests, rightId);
  removeFromArray(records[leftId].outgoingRequests, rightId);
  removeFromArray(records[rightId].incomingRequests, leftId);
  removeFromArray(records[rightId].outgoingRequests, leftId);
}

function createRequest(records, fromId, toId) {
  if (fromId === toId || !records[fromId] || !records[toId]) {
    return;
  }
  if (records[fromId].connections.includes(toId)) {
    return;
  }
  if (records[toId].incomingRequests.includes(fromId)) {
    return;
  }
  if (!records[fromId].outgoingRequests.includes(toId)) {
    records[fromId].outgoingRequests.push(toId);
  }
  if (!records[toId].incomingRequests.includes(fromId)) {
    records[toId].incomingRequests.push(fromId);
  }
}

function seedSocialRelationships(records) {
  connectUsers(records, "jia", "arjun");
  connectUsers(records, "mei", "sara");
  createRequest(records, "mei", "jia");
  createRequest(records, "sara", "jia");
}

function createDefaultSocialState() {
  const records = {};
  users.forEach(user => {
    records[user.id] = {
      profile: {
        displayName: user.name,
        bio: `Lifestyle: ${titleCase(user.persona)}.`,
        avatarDataUrl: "",
      },
      gallery: [],
      connections: [],
      incomingRequests: [],
      outgoingRequests: [],
      updatedAt: nowIso(),
    };
  });
  seedSocialRelationships(records);
  return records;
}

function normalizeSocialState(rawState) {
  const defaults = createDefaultSocialState();
  const social = {};

  users.forEach(user => {
    const incoming = rawState && rawState[user.id] ? rawState[user.id] : {};
    const defaultRecord = defaults[user.id];
    const profile = incoming.profile || {};

    social[user.id] = {
      profile: {
        displayName: String(profile.displayName || defaultRecord.profile.displayName).slice(0, 42),
        bio: String(profile.bio || defaultRecord.profile.bio).slice(0, 220),
        avatarDataUrl: sanitizeImageDataUrl(profile.avatarDataUrl, AVATAR_IMAGE_OPTIONS.maxLength * 2),
      },
      gallery: (Array.isArray(incoming.gallery) ? incoming.gallery : [])
        .map(item => sanitizeImageDataUrl(item, GALLERY_IMAGE_OPTIONS.maxLength * 2))
        .filter(Boolean)
        .slice(0, MAX_GALLERY_PHOTOS),
      connections: sanitizeIds(incoming.connections, user.id),
      incomingRequests: sanitizeIds(incoming.incomingRequests, user.id),
      outgoingRequests: sanitizeIds(incoming.outgoingRequests, user.id),
      updatedAt: String(incoming.updatedAt || defaultRecord.updatedAt || nowIso()),
    };
  });

  users.forEach(user => {
    social[user.id].connections.forEach(otherId => {
      if (!social[otherId].connections.includes(user.id)) {
        social[otherId].connections.push(user.id);
      }
    });
  });

  users.forEach(user => {
    social[user.id].incomingRequests = social[user.id].incomingRequests.filter(otherId => !social[user.id].connections.includes(otherId));
    social[user.id].outgoingRequests = social[user.id].outgoingRequests.filter(otherId => !social[user.id].connections.includes(otherId));
  });

  users.forEach(user => {
    social[user.id].incomingRequests.forEach(fromId => {
      if (!social[fromId].outgoingRequests.includes(user.id)) {
        social[fromId].outgoingRequests.push(user.id);
      }
    });
    social[user.id].outgoingRequests.forEach(toId => {
      if (!social[toId].incomingRequests.includes(user.id)) {
        social[toId].incomingRequests.push(user.id);
      }
    });
  });

  return social;
}

function loadSocialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultSocialState();
    }
    return normalizeSocialState(JSON.parse(raw));
  } catch {
    return createDefaultSocialState();
  }
}

function saveSocialState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.social));
    return true;
  } catch (error) {
    console.warn("Unable to persist social state.", error);
    return false;
  }
}

function getUserById(userId) {
  return users.find(user => user.id === userId);
}

function getSocialRecord(userId) {
  if (!state.social[userId]) {
    state.social[userId] = {
      profile: {
        displayName: getUserById(userId)?.name || "User",
        bio: "Lifestyle explorer.",
        avatarDataUrl: "",
      },
      gallery: [],
      connections: [],
      incomingRequests: [],
      outgoingRequests: [],
      updatedAt: nowIso(),
    };
  }
  return state.social[userId];
}

function getDisplayName(userId) {
  const profileName = getSocialRecord(userId).profile.displayName;
  if (profileName && profileName.trim()) {
    return profileName.trim();
  }
  return getUserById(userId)?.name || "User";
}

function avatarMarkup(userId, className = "mini-avatar") {
  const profile = getSocialRecord(userId).profile;
  const fallbackLetter = getDisplayName(userId).charAt(0).toUpperCase();
  if (profile.avatarDataUrl) {
    return `<div class="${className} has-image"><img src="${escapeHtml(profile.avatarDataUrl)}" alt="${escapeHtml(getDisplayName(userId))}"></div>`;
  }
  return `<div class="${className}">${escapeHtml(fallbackLetter)}</div>`;
}

function refreshUserSelect() {
  const selected = userSelect.value || users[0].id;
  userSelect.innerHTML = "";
  users.forEach(user => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = getDisplayName(user.id);
    userSelect.appendChild(option);
  });
  userSelect.value = selected;
}

function currentUser() {
  return users.find(user => user.id === userSelect.value) || users[0];
}

function removeFromArray(list, value) {
  const index = list.indexOf(value);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

function relationshipWith(userId, otherId) {
  const social = getSocialRecord(userId);
  if (social.connections.includes(otherId)) {
    return "connected";
  }
  if (social.incomingRequests.includes(otherId)) {
    return "incoming";
  }
  if (social.outgoingRequests.includes(otherId)) {
    return "outgoing";
  }
  return "none";
}

function sendRequest(userId, otherId) {
  const userRecord = getSocialRecord(userId);
  const otherRecord = getSocialRecord(otherId);
  const relationship = relationshipWith(userId, otherId);

  if (relationship === "connected") {
    return "You are already connected.";
  }
  if (relationship === "outgoing") {
    return `Request already sent to ${getDisplayName(otherId)}.`;
  }
  if (relationship === "incoming") {
    connectUsers(state.social, userId, otherId);
    saveSocialState();
    return `Connection accepted with ${getDisplayName(otherId)}.`;
  }

  if (!userRecord.outgoingRequests.includes(otherId)) {
    userRecord.outgoingRequests.push(otherId);
  }
  if (!otherRecord.incomingRequests.includes(userId)) {
    otherRecord.incomingRequests.push(userId);
  }
  saveSocialState();
  return `Connection request sent to ${getDisplayName(otherId)}.`;
}

function acceptRequest(userId, requesterId) {
  connectUsers(state.social, userId, requesterId);
  saveSocialState();
  return `Connected with ${getDisplayName(requesterId)}.`;
}

function declineRequest(userId, requesterId) {
  removeFromArray(getSocialRecord(userId).incomingRequests, requesterId);
  removeFromArray(getSocialRecord(requesterId).outgoingRequests, userId);
  saveSocialState();
  return `Request declined from ${getDisplayName(requesterId)}.`;
}

function cancelRequest(userId, recipientId) {
  removeFromArray(getSocialRecord(userId).outgoingRequests, recipientId);
  removeFromArray(getSocialRecord(recipientId).incomingRequests, userId);
  saveSocialState();
  return `Request to ${getDisplayName(recipientId)} canceled.`;
}

function removeConnection(userId, otherId) {
  removeFromArray(getSocialRecord(userId).connections, otherId);
  removeFromArray(getSocialRecord(otherId).connections, userId);
  saveSocialState();
  return `${getDisplayName(otherId)} removed from your connections.`;
}

function setProfileMessage(text, type = "success") {
  profileMessage.textContent = text;
  profileMessage.classList.toggle("error", type === "error");
  if (profileMessageTimer) {
    clearTimeout(profileMessageTimer);
  }
  profileMessageTimer = setTimeout(() => {
    profileMessage.textContent = "";
    profileMessage.classList.remove("error");
  }, 2200);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(String(event.target?.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode image."));
    image.src = dataUrl;
  });
}

function optimizeDataUrlImage(image, options) {
  const maxDimension = Math.max(240, Number(options.maxDimension || 1280));
  const minQuality = 0.52;
  let quality = Math.min(0.92, Math.max(minQuality, Number(options.quality || 0.82)));
  const targetMaxLength = Math.max(120000, Number(options.maxLength || 420000));

  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  let width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  let height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const output = canvas.toDataURL("image/jpeg", quality);
    if (output.length <= targetMaxLength || attempt === 7) {
      return output;
    }

    if (quality > minQuality + 0.04) {
      quality -= 0.08;
      continue;
    }

    width = Math.max(180, Math.round(width * 0.88));
    height = Math.max(180, Math.round(height * 0.88));
  }

  return "";
}

async function readOptimizedImage(file, options) {
  const original = await readFileAsDataUrl(file);
  const image = await readImageElement(original);
  const optimized = optimizeDataUrlImage(image, options);
  return optimized || original;
}

function galleryItemsMarkup(userId, compact = false) {
  const gallery = getSocialRecord(userId).gallery || [];
  if (!gallery.length) {
    return `<div class="empty-state small-empty">No gallery photos yet.</div>`;
  }
  return `
    <div class="gallery-grid ${compact ? "compact" : ""}">
      ${gallery.map((item, index) => `
        <button type="button" class="gallery-tile" data-zoom-src="${escapeHtml(item)}" data-zoom-alt="${escapeHtml(getDisplayName(userId))} photo ${index + 1}">
          <img src="${escapeHtml(item)}" alt="${escapeHtml(getDisplayName(userId))} gallery photo ${index + 1}">
        </button>
      `).join("")}
    </div>
  `;
}

function openImageZoom(src, alt = "Image preview") {
  zoomImage.src = src;
  zoomImage.alt = alt;
  zoomModal.classList.add("visible");
  zoomModal.setAttribute("aria-hidden", "false");
}

function closeProfileZoom() {
  zoomModal.classList.remove("visible");
  zoomModal.setAttribute("aria-hidden", "true");
}

function openPublicProfile(userId) {
  const user = getUserById(userId);
  if (!user) {
    return;
  }
  const social = getSocialRecord(userId);
  const bio = social.profile.bio ? escapeHtml(social.profile.bio) : "No bio yet.";
  publicProfileContent.innerHTML = `
    <div class="public-head">
      ${avatarMarkup(userId, "mini-avatar public-avatar")}
      <div>
        <h3>${escapeHtml(getDisplayName(userId))}</h3>
        <p class="explain">${bio}</p>
      </div>
    </div>
    <div class="public-stats">
      <span><strong>${social.connections.length}</strong> connections</span>
      <span><strong>${social.incomingRequests.length + social.outgoingRequests.length}</strong> requests</span>
    </div>
    <h4 class="public-gallery-title">Photo Gallery</h4>
    ${galleryItemsMarkup(userId, true)}
  `;
  publicProfileModal.classList.add("visible");
  publicProfileModal.setAttribute("aria-hidden", "false");
}

function closePublicProfile() {
  publicProfileModal.classList.remove("visible");
  publicProfileModal.setAttribute("aria-hidden", "true");
}

function setActiveProfileView(view, jumpToPane = false) {
  if (view !== "connections" && view !== "requests") {
    return;
  }
  state.activeProfileView = view;
  renderProfile(currentUser());
  if (jumpToPane) {
    const targetPane = document.querySelector(view === "connections" ? "#profile-connections-pane" : "#profile-requests-pane");
    if (targetPane) {
      requestAnimationFrame(() => {
        targetPane.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
}

function cosine(a, b) {
  const keys = Object.keys(a);
  const dot = keys.reduce((sum, key) => sum + a[key] * b[key], 0);
  const magA = Math.sqrt(keys.reduce((sum, key) => sum + a[key] * a[key], 0));
  const magB = Math.sqrt(keys.reduce((sum, key) => sum + b[key] * b[key], 0));
  return dot / (magA * magB);
}

function scoreMatches(current) {
  return users
    .filter(user => user.id !== current.id)
    .map(user => {
      const score = Math.round(cosine(current.vector, user.vector) * 100);
      const shared = current.tags.filter(tag => user.tags.includes(tag));
      const fallback = Object.entries(current.vector)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([key]) => key[0].toUpperCase() + key.slice(1));

      return { ...user, score, shared: shared.length ? shared : fallback };
    })
    .sort((a, b) => b.score - a.score);
}

function renderMap(user) {
  const map = document.querySelector("#map");
  const points = user.zones.map(zone => `${zone.x},${zone.y}`).join(" ");
  map.innerHTML = `
    <div class="road r1"></div>
    <div class="road r2"></div>
    <div class="road r3"></div>
    <svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="#ee7b62" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"></polyline>
    </svg>
    ${user.zones.map(zone => `
      <div class="zone ${zone.type}" style="left:${zone.x}%;top:${zone.y}%"></div>
      <div class="pin" style="left:${zone.x}%;top:${zone.y}%">
        <strong>${zone.label}</strong>
        <span>${zone.detail}</span>
      </div>
    `).join("")}
  `;
}

function renderRoutines(user) {
  document.querySelector("#loop-count").textContent = `${user.routines.length} routines`;
  document.querySelector("#routine-list").innerHTML = user.routines.map(([title, body, icon]) => `
    <div class="routine-item">
      <div class="iconbox">${icons[icon]}</div>
      <div>
        <strong>${title}</strong>
        <span>${body}</span>
      </div>
    </div>
  `).join("");
}

function renderSummary(user) {
  document.querySelector("#summary-text").textContent = `You appear to be a ${user.persona}. LifeLoop uses this as a private lifestyle profile, not a public movement log.`;
  document.querySelector("#summary-tags").innerHTML = user.tags.map((tag, index) => `<span class="tag ${index % 3 === 1 ? "blue" : index % 3 === 2 ? "gold" : ""}">${tag}</span>`).join("");
  const matches = scoreMatches(user);
  document.querySelector("#metrics").innerHTML = [
    [`${user.logs}`, "simulated weekly logs"],
    [`${user.routines.length}`, "detected routine loops"],
    [`${matches.length ? matches[0].score : 0}%`, "top lifestyle match"],
    [`${user.tags.length}`, "inferred lifestyle tags"]
  ].map(([value, label]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderMatches(user) {
  matchListElement.innerHTML = scoreMatches(user).map(match => {
    const relationship = relationshipWith(user.id, match.id);
    const actionLabel = relationship === "connected"
      ? "Connected"
      : relationship === "outgoing"
        ? "Request sent"
        : relationship === "incoming"
          ? "Accept request"
          : "Send safe intro";
    const action = relationship === "incoming" ? "accept-request" : "send-request";
    const disabled = relationship === "connected" || relationship === "outgoing";
    const relationTag = relationship === "incoming"
      ? `<span class="tag gold">Requested you</span>`
      : relationship === "outgoing"
        ? `<span class="tag gold">Pending</span>`
        : relationship === "connected"
          ? `<span class="tag gold">In connections</span>`
          : "";

    return `
      <article class="card">
        <div class="avatar-row">
          <button class="avatar-name open-profile" type="button" data-open-profile="${match.id}">
            ${avatarMarkup(match.id, "avatar")}
            <span>
              <strong>${escapeHtml(getDisplayName(match.id))}</strong>
              <small>Tap to view gallery</small>
            </span>
          </button>
          <div class="score">${match.score}%</div>
        </div>
        <div class="tag-row">${match.shared.map(tag => `<span class="tag blue">${escapeHtml(tag)}</span>`).join("")}${relationTag}</div>
        <p class="explain">You matched because both profiles show similar repeated lifestyle patterns around ${escapeHtml(match.shared.slice(0, 3).join(", ").toLowerCase())}. Exact places and times are hidden.</p>
        <button class="connect ${disabled ? "secondary" : ""}" data-action="${action}" data-target="${match.id}" ${disabled ? "disabled" : ""}>${icons.send} ${actionLabel}</button>
      </article>
    `;
  }).join("");
}

function renderMissions(user) {
  const selected = missionTemplates
    .filter(mission => user.vector[mission.needs] > 0.45)
    .sort((a, b) => user.vector[b.needs] - user.vector[a.needs])
    .slice(0, 4);

  document.querySelector("#points-total").textContent = `${selected.reduce((sum, mission) => sum + mission.points, 0)} possible points`;
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

  document.querySelector("#reward-list").innerHTML = rewards.map(([title, body]) => `
    <div class="reward">
      <strong>${title}</strong>
      <span>${body}</span>
      <span class="tag gold">Route relevant</span>
    </div>
  `).join("");
}

function renderPrivacy() {
  document.querySelector("#privacy-grid").innerHTML = privacyRules.map(([title, body]) => `
    <div class="rule">
      <strong>${icons.shield}${title}</strong>
      <span>${body}</span>
    </div>
  `).join("");
}

function renderProfileEditor(user) {
  const social = getSocialRecord(user.id);
  const connectionsCount = social.connections.length;
  const requestCount = social.incomingRequests.length + social.outgoingRequests.length;
  const remainingSlots = Math.max(0, MAX_GALLERY_PHOTOS - social.gallery.length);
  profileEditorElement.innerHTML = `
    <form class="profile-form" id="profile-form">
      <div class="profile-top-row">
        <button class="profile-avatar-button" type="button" data-avatar-upload="true">
          ${avatarMarkup(user.id, "profile-avatar")}
          <span>Tap to add or change photo</span>
        </button>
        <div class="profile-connection-side">
          <button class="profile-switch-card ${state.activeProfileView === "connections" ? "active" : ""}" type="button" data-profile-view="connections">
            <span>Connections</span>
            <strong>${connectionsCount}</strong>
          </button>
          <button class="profile-switch-card ${state.activeProfileView === "requests" ? "active" : ""}" type="button" data-profile-view="requests">
            <span>Requests</span>
            <strong>${requestCount}</strong>
          </button>
        </div>
      </div>
      <div class="profile-avatar-actions">
        <input type="file" id="profile-avatar-input" accept="image/*">
        <input type="file" id="profile-gallery-input" accept="image/*" multiple>
        <button class="ghost-button compact" type="button" data-upload-avatar="true">Upload photo</button>
        <button class="ghost-button compact" type="button" data-remove-avatar="true" ${social.profile.avatarDataUrl ? "" : "disabled"}>Remove photo</button>
      </div>
      <label class="field-label" for="profile-name-input">Profile name</label>
      <input class="field-input" id="profile-name-input" maxlength="42" value="${escapeHtml(social.profile.displayName)}" required>
      <label class="field-label" for="profile-bio-input">Bio</label>
      <textarea class="field-input bio-input" id="profile-bio-input" rows="4" maxlength="220" placeholder="Tell your connections what you enjoy.">${escapeHtml(social.profile.bio)}</textarea>
      <button class="connect profile-save" type="submit">Save Profile</button>
      <div class="gallery-editor">
        <div class="gallery-head">
          <strong>Photo Gallery</strong>
          <span>${social.gallery.length}/${MAX_GALLERY_PHOTOS} used</span>
        </div>
        <div class="gallery-upload-row">
          <button class="ghost-button compact" type="button" data-upload-gallery="true" ${remainingSlots ? "" : "disabled"}>${remainingSlots ? "Add Gallery Photos" : "Gallery full"}</button>
          <span class="gallery-help">Tap a photo to zoom.</span>
        </div>
        ${social.gallery.length ? `
          <div class="gallery-grid editor-grid">
            ${social.gallery.map((item, index) => `
              <div class="gallery-editor-tile">
                <button type="button" class="gallery-tile" data-zoom-src="${escapeHtml(item)}" data-zoom-alt="${escapeHtml(getDisplayName(user.id))} gallery photo ${index + 1}">
                  <img src="${escapeHtml(item)}" alt="${escapeHtml(getDisplayName(user.id))} gallery photo ${index + 1}">
                </button>
                <button type="button" class="gallery-remove" data-gallery-remove="${index}" aria-label="Remove gallery image ${index + 1}">Remove</button>
              </div>
            `).join("")}
          </div>
        ` : `<div class="empty-state small-empty">No gallery photos yet. Add up to ${MAX_GALLERY_PHOTOS} photos.</div>`}
      </div>
    </form>
  `;

  const form = document.querySelector("#profile-form");
  const avatarInput = document.querySelector("#profile-avatar-input");
  const galleryInput = document.querySelector("#profile-gallery-input");

  form.addEventListener("submit", event => {
    event.preventDefault();
    const nameInput = document.querySelector("#profile-name-input");
    const bioInput = document.querySelector("#profile-bio-input");
    const cleanName = String(nameInput.value || "").trim();
    const cleanBio = String(bioInput.value || "").trim();

    if (!cleanName) {
      setProfileMessage("Profile name cannot be empty.", "error");
      return;
    }

    const profile = getSocialRecord(user.id).profile;
    profile.displayName = cleanName.slice(0, 42);
    profile.bio = cleanBio.slice(0, 220);
    getSocialRecord(user.id).updatedAt = nowIso();
    saveSocialState();
    refreshUserSelect();
    renderMatches(user);
    renderProfile(user);
    setProfileMessage("Profile saved.");
  });

  profileEditorElement.querySelectorAll("[data-profile-view]").forEach(button => {
    button.addEventListener("click", () => {
      setActiveProfileView(button.dataset.profileView, true);
    });
  });

  const avatarTapUploadButton = profileEditorElement.querySelector("[data-avatar-upload]");
  const uploadButton = profileEditorElement.querySelector("[data-upload-avatar]");
  const removeButton = profileEditorElement.querySelector("[data-remove-avatar]");
  avatarTapUploadButton.addEventListener("click", () => avatarInput.click());

  uploadButton.addEventListener("click", () => avatarInput.click());

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setProfileMessage("Please choose an image file.", "error");
      avatarInput.value = "";
      return;
    }
    try {
      const optimized = await readOptimizedImage(file, AVATAR_IMAGE_OPTIONS);
      if (!optimized) {
        setProfileMessage("Unable to process selected photo.", "error");
        return;
      }
      const record = getSocialRecord(user.id);
      record.profile.avatarDataUrl = optimized;
      record.updatedAt = nowIso();
      const saved = saveSocialState();
      renderMatches(user);
      renderProfile(user);
      if (!saved) {
        setProfileMessage("Photo added, but not saved. Please remove older photos and try again.", "error");
        return;
      }
      setProfileMessage("Profile photo updated.");
    } catch {
      setProfileMessage("Unable to process selected photo.", "error");
    } finally {
      avatarInput.value = "";
    }
  });

  removeButton.addEventListener("click", () => {
    getSocialRecord(user.id).profile.avatarDataUrl = "";
    getSocialRecord(user.id).updatedAt = nowIso();
    const saved = saveSocialState();
    renderMatches(user);
    renderProfile(user);
    if (!saved) {
      setProfileMessage("Photo removed, but save failed on this device.", "error");
      return;
    }
    setProfileMessage("Profile photo removed.");
  });

  const uploadGalleryButton = profileEditorElement.querySelector("[data-upload-gallery]");
  if (uploadGalleryButton) {
    uploadGalleryButton.addEventListener("click", () => galleryInput.click());
  }

  galleryInput.addEventListener("change", async () => {
    const files = Array.from(galleryInput.files || []).filter(file => file.type.startsWith("image/"));
    if (!files.length) {
      return;
    }
    const record = getSocialRecord(user.id);
    const remaining = Math.max(0, MAX_GALLERY_PHOTOS - record.gallery.length);
    if (!remaining) {
      setProfileMessage(`Gallery is already full (${MAX_GALLERY_PHOTOS} photos).`, "error");
      galleryInput.value = "";
      return;
    }

    const acceptedFiles = files.slice(0, remaining);
    const dataUrls = [];
    for (const file of acceptedFiles) {
      try {
        const dataUrl = await readOptimizedImage(file, GALLERY_IMAGE_OPTIONS);
        if (dataUrl) {
          dataUrls.push(dataUrl);
        }
      } catch {
        // Ignore failed reads and continue.
      }
    }

    if (!dataUrls.length) {
      setProfileMessage("Unable to add selected photos.", "error");
      galleryInput.value = "";
      return;
    }

    record.gallery = record.gallery.concat(dataUrls).slice(0, MAX_GALLERY_PHOTOS);
    record.updatedAt = nowIso();
    const saved = saveSocialState();
    renderProfile(user);
    if (!saved) {
      setProfileMessage("Photos added, but not saved. Remove older photos and retry.", "error");
      galleryInput.value = "";
      return;
    }
    setProfileMessage(`${dataUrls.length} photo${dataUrls.length > 1 ? "s" : ""} added.`);
    galleryInput.value = "";
  });

  profileEditorElement.querySelectorAll("[data-gallery-remove]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.galleryRemove);
      if (!Number.isInteger(index)) {
        return;
      }
      const record = getSocialRecord(user.id);
      record.gallery = record.gallery.filter((_, itemIndex) => itemIndex !== index);
      record.updatedAt = nowIso();
      const saved = saveSocialState();
      renderProfile(user);
      if (!saved) {
        setProfileMessage("Photo removed, but save failed on this device.", "error");
        return;
      }
      setProfileMessage("Photo removed from gallery.");
    });
  });

  profileEditorElement.querySelectorAll("[data-zoom-src]").forEach(button => {
    button.addEventListener("click", () => {
      const src = button.dataset.zoomSrc;
      if (!src) {
        return;
      }
      openImageZoom(src, button.dataset.zoomAlt || "Gallery image");
    });
  });
}

function renderConnections(userId) {
  const connections = getSocialRecord(userId).connections;
  if (!connections.length) {
    connectionsList.innerHTML = `<div class="empty-state">No connections yet. Send safe intros from your matches.</div>`;
    return;
  }
  connectionsList.innerHTML = connections.map(otherId => `
    <article class="connection-item">
      <button class="connection-info open-profile" type="button" data-open-profile="${otherId}">
        ${avatarMarkup(otherId, "mini-avatar")}
        <div>
          <strong>${escapeHtml(getDisplayName(otherId))}</strong>
          <span>Tap to view profile gallery</span>
        </div>
      </button>
      <button type="button" class="ghost-button compact danger-subtle" data-remove-connection="${otherId}">Remove</button>
    </article>
  `).join("");
}

function renderRequests(userId) {
  const social = getSocialRecord(userId);

  if (!social.incomingRequests.length) {
    incomingRequestsList.innerHTML = `<div class="empty-state">No incoming requests right now.</div>`;
  } else {
    incomingRequestsList.innerHTML = social.incomingRequests.map(otherId => `
      <article class="request-item">
        <button class="connection-info open-profile" type="button" data-open-profile="${otherId}">
          ${avatarMarkup(otherId, "mini-avatar")}
          <div>
            <strong>${escapeHtml(getDisplayName(otherId))}</strong>
            <span>Wants to connect with you</span>
          </div>
        </button>
        <div class="request-actions">
          <button type="button" class="ghost-button compact" data-accept-request="${otherId}">Accept</button>
          <button type="button" class="ghost-button compact danger-subtle" data-decline-request="${otherId}">Decline</button>
        </div>
      </article>
    `).join("");
  }

  if (!social.outgoingRequests.length) {
    outgoingRequestsList.innerHTML = `<div class="empty-state">No pending sent requests.</div>`;
  } else {
    outgoingRequestsList.innerHTML = social.outgoingRequests.map(otherId => `
      <article class="request-item">
        <button class="connection-info open-profile" type="button" data-open-profile="${otherId}">
          ${avatarMarkup(otherId, "mini-avatar")}
          <div>
            <strong>${escapeHtml(getDisplayName(otherId))}</strong>
            <span>Waiting for response</span>
          </div>
        </button>
        <button type="button" class="ghost-button compact danger-subtle" data-cancel-request="${otherId}">Cancel</button>
      </article>
    `).join("");
  }
}

function renderProfile(user) {
  renderProfileEditor(user);
  renderConnections(user.id);
  renderRequests(user.id);
  document.querySelector("#profile-connections-pane").classList.toggle("active", state.activeProfileView === "connections");
  document.querySelector("#profile-requests-pane").classList.toggle("active", state.activeProfileView === "requests");
}

function render() {
  const user = currentUser();
  renderMap(user);
  renderRoutines(user);
  renderSummary(user);
  renderMatches(user);
  renderMissions(user);
  renderPrivacy();
  renderProfile(user);
}

function switchSection(target) {
  navButtons.forEach(item => item.classList.toggle("active", item.dataset.section === target));
  sections.forEach(section => section.classList.toggle("active", section.id === target));
  document.querySelector("#page-title").textContent = pageCopy[target] ? pageCopy[target][0] : "LifeLoop";
  document.querySelector("#page-subtitle").textContent = pageCopy[target] ? pageCopy[target][1] : "Lifestyle routines and social discovery.";
}

navButtons.forEach(button => {
  button.addEventListener("click", () => {
    switchSection(button.dataset.section);
  });
});

userSelect.addEventListener("change", () => {
  profileMessage.textContent = "";
  render();
});

document.querySelector("#rerun").addEventListener("click", render);

matchListElement.addEventListener("click", event => {
  const openProfileButton = event.target.closest("button[data-open-profile]");
  if (openProfileButton) {
    const profileId = openProfileButton.dataset.openProfile;
    if (profileId) {
      openPublicProfile(profileId);
    }
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const user = currentUser();
  const targetId = button.dataset.target;
  if (!targetId) {
    return;
  }
  const message = button.dataset.action === "accept-request"
    ? acceptRequest(user.id, targetId)
    : sendRequest(user.id, targetId);
  renderMatches(user);
  renderProfile(user);
  setProfileMessage(message);
});

connectionsList.addEventListener("click", event => {
  const openProfileButton = event.target.closest("button[data-open-profile]");
  if (openProfileButton) {
    const profileId = openProfileButton.dataset.openProfile;
    if (profileId) {
      openPublicProfile(profileId);
    }
    return;
  }

  const button = event.target.closest("button[data-remove-connection]");
  if (!button) {
    return;
  }
  const user = currentUser();
  const otherId = button.dataset.removeConnection;
  if (!otherId) {
    return;
  }
  const message = removeConnection(user.id, otherId);
  renderMatches(user);
  renderProfile(user);
  setProfileMessage(message);
});

incomingRequestsList.addEventListener("click", event => {
  const openProfileButton = event.target.closest("button[data-open-profile]");
  if (openProfileButton) {
    const profileId = openProfileButton.dataset.openProfile;
    if (profileId) {
      openPublicProfile(profileId);
    }
    return;
  }

  const acceptButton = event.target.closest("button[data-accept-request]");
  const declineButton = event.target.closest("button[data-decline-request]");
  if (!acceptButton && !declineButton) {
    return;
  }
  const user = currentUser();
  const requesterId = acceptButton ? acceptButton.dataset.acceptRequest : declineButton.dataset.declineRequest;
  if (!requesterId) {
    return;
  }
  const message = acceptButton ? acceptRequest(user.id, requesterId) : declineRequest(user.id, requesterId);
  renderMatches(user);
  renderProfile(user);
  setProfileMessage(message);
});

outgoingRequestsList.addEventListener("click", event => {
  const openProfileButton = event.target.closest("button[data-open-profile]");
  if (openProfileButton) {
    const profileId = openProfileButton.dataset.openProfile;
    if (profileId) {
      openPublicProfile(profileId);
    }
    return;
  }

  const button = event.target.closest("button[data-cancel-request]");
  if (!button) {
    return;
  }
  const user = currentUser();
  const recipientId = button.dataset.cancelRequest;
  if (!recipientId) {
    return;
  }
  const message = cancelRequest(user.id, recipientId);
  renderMatches(user);
  renderProfile(user);
  setProfileMessage(message);
});

zoomClose.addEventListener("click", closeProfileZoom);
zoomModal.addEventListener("click", event => {
  const closeTarget = event.target.closest("[data-zoom-close]");
  if (closeTarget) {
    closeProfileZoom();
  }
});

publicProfileClose.addEventListener("click", closePublicProfile);
publicProfileModal.addEventListener("click", event => {
  const closeTarget = event.target.closest("[data-public-close]");
  if (closeTarget) {
    closePublicProfile();
    return;
  }
  const zoomTile = event.target.closest("[data-zoom-src]");
  if (zoomTile) {
    const src = zoomTile.dataset.zoomSrc;
    if (src) {
      openImageZoom(src, zoomTile.dataset.zoomAlt || "Gallery image");
    }
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && zoomModal.classList.contains("visible")) {
    closeProfileZoom();
    return;
  }
  if (event.key === "Escape" && publicProfileModal.classList.contains("visible")) {
    closePublicProfile();
  }
});

refreshUserSelect();
userSelect.value = users[0].id;
render();
