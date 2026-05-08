const STATIC_DATA = window.LIFELOOP_DATA;
const icons = window.LIFELOOP_ICONS;

const API_BASE = STATIC_DATA.apiBase || `${window.location.protocol}//${window.location.hostname}:8000`;
const PROFILE_STORAGE_KEY = "lifeloop-social-state-v4";
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
const logoutButton = document.querySelector("#logout-button");
const profileEditorElement = document.querySelector("#profile-editor");
const profileMessageElement = document.querySelector("#profile-message");
const zoomModal = document.querySelector("#profile-zoom-modal");
const zoomImage = document.querySelector("#profile-zoom-image");
const zoomClose = document.querySelector("#profile-zoom-close");
const publicProfileModal = document.querySelector("#public-profile-modal");
const publicProfileContent = document.querySelector("#public-profile-content");
const publicProfileClose = document.querySelector("#public-profile-close");

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
  profileSocial: {},
  profileEditMode: false,
};

let googleMapsLoadPromise = null;
let profileMessageTimer = null;

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

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function profileNormalizeId(value) {
  return String(value || "").trim();
}

function profileCurrentUserId() {
  return profileNormalizeId(state.currentUser?.user_id);
}

function profileUserById(userId) {
  return state.users.find(user => profileNormalizeId(user.user_id) === userId) || null;
}

function profileSanitizeImageDataUrl(value, maxLength) {
  const dataUrl = String(value || "");
  if (!dataUrl.startsWith("data:image/")) {
    return "";
  }
  return dataUrl.length <= maxLength ? dataUrl : "";
}

function profileRemoveFromArray(list, value) {
  const index = list.indexOf(value);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

function profileSanitizeIdList(list, userId) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(item => profileNormalizeId(item))
    .filter(item => item && item !== userId)
    .filter(item => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

function profileDefaultRecord(userId, fallbackName = "User") {
  const staticUser = STATIC_DATA.users.find(user => profileNormalizeId(user.id) === userId);
  const knownUser = profileUserById(userId);
  const displayName = staticUser?.name || knownUser?.name || fallbackName || "User";
  const bio = staticUser?.persona
    ? `Lifestyle: ${String(staticUser.persona).slice(0, 1).toUpperCase()}${String(staticUser.persona).slice(1)}.`
    : "Lifestyle explorer.";
  return {
    profile: {
      displayName: displayName.slice(0, 42),
      bio: bio.slice(0, 220),
      avatarDataUrl: "",
    },
    gallery: [],
    connections: [],
    incomingRequests: [],
    outgoingRequests: [],
    updatedAt: nowIso(),
  };
}

function profileConnectRecords(records, leftId, rightId) {
  if (!leftId || !rightId || leftId === rightId || !records[leftId] || !records[rightId]) {
    return;
  }
  if (!records[leftId].connections.includes(rightId)) {
    records[leftId].connections.push(rightId);
  }
  if (!records[rightId].connections.includes(leftId)) {
    records[rightId].connections.push(leftId);
  }
  profileRemoveFromArray(records[leftId].incomingRequests, rightId);
  profileRemoveFromArray(records[leftId].outgoingRequests, rightId);
  profileRemoveFromArray(records[rightId].incomingRequests, leftId);
  profileRemoveFromArray(records[rightId].outgoingRequests, leftId);
}

function profileCreateRequestRecord(records, fromId, toId) {
  if (!fromId || !toId || fromId === toId || !records[fromId] || !records[toId]) {
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

function createProfileDefaultState() {
  const records = {};
  STATIC_DATA.users.forEach(user => {
    const userId = profileNormalizeId(user.id);
    records[userId] = profileDefaultRecord(userId, user.name);
  });

  if (records.jia && records.arjun) {
    profileConnectRecords(records, "jia", "arjun");
  }
  if (records.mei && records.sara) {
    profileConnectRecords(records, "mei", "sara");
  }
  if (records.mei && records.jia) {
    profileCreateRequestRecord(records, "mei", "jia");
  }
  if (records.sara && records.jia) {
    profileCreateRequestRecord(records, "sara", "jia");
  }

  return records;
}

function normalizeProfileState(rawState) {
  const defaults = createProfileDefaultState();
  const source = rawState && typeof rawState === "object" ? rawState : {};
  const social = {};
  const allIds = new Set([...Object.keys(defaults), ...Object.keys(source)]);

  allIds.forEach(item => {
    const userId = profileNormalizeId(item);
    if (!userId) {
      return;
    }
    const incoming = source[userId] && typeof source[userId] === "object" ? source[userId] : {};
    const fallbackName = STATIC_DATA.users.find(user => profileNormalizeId(user.id) === userId)?.name
      || profileUserById(userId)?.name
      || "User";
    const fallback = defaults[userId] || profileDefaultRecord(userId, fallbackName);
    const profile = incoming.profile && typeof incoming.profile === "object" ? incoming.profile : {};

    social[userId] = {
      profile: {
        displayName: String(profile.displayName || fallback.profile.displayName).slice(0, 42),
        bio: String(profile.bio || fallback.profile.bio).slice(0, 220),
        avatarDataUrl: profileSanitizeImageDataUrl(profile.avatarDataUrl, AVATAR_IMAGE_OPTIONS.maxLength * 2),
      },
      gallery: (Array.isArray(incoming.gallery) ? incoming.gallery : [])
        .map(item => profileSanitizeImageDataUrl(item, GALLERY_IMAGE_OPTIONS.maxLength * 2))
        .filter(Boolean)
        .slice(0, MAX_GALLERY_PHOTOS),
      connections: profileSanitizeIdList(incoming.connections, userId),
      incomingRequests: profileSanitizeIdList(incoming.incomingRequests, userId),
      outgoingRequests: profileSanitizeIdList(incoming.outgoingRequests, userId),
      updatedAt: String(incoming.updatedAt || fallback.updatedAt || nowIso()),
    };
  });

  Object.keys(social).forEach(userId => {
    social[userId].connections.forEach(otherId => {
      if (!social[otherId]) {
        social[otherId] = profileDefaultRecord(otherId, "User");
      }
      if (!social[otherId].connections.includes(userId)) {
        social[otherId].connections.push(userId);
      }
    });
  });

  Object.keys(social).forEach(userId => {
    social[userId].incomingRequests = social[userId].incomingRequests.filter(otherId => !social[userId].connections.includes(otherId));
    social[userId].outgoingRequests = social[userId].outgoingRequests.filter(otherId => !social[userId].connections.includes(otherId));
  });

  Object.keys(social).forEach(userId => {
    social[userId].incomingRequests.forEach(fromId => {
      if (!social[fromId]) {
        social[fromId] = profileDefaultRecord(fromId, "User");
      }
      if (!social[fromId].outgoingRequests.includes(userId)) {
        social[fromId].outgoingRequests.push(userId);
      }
    });
    social[userId].outgoingRequests.forEach(toId => {
      if (!social[toId]) {
        social[toId] = profileDefaultRecord(toId, "User");
      }
      if (!social[toId].incomingRequests.includes(userId)) {
        social[toId].incomingRequests.push(userId);
      }
    });
  });

  return social;
}

function loadProfileSocialState() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return createProfileDefaultState();
    }
    return normalizeProfileState(JSON.parse(raw));
  } catch {
    return createProfileDefaultState();
  }
}

function saveProfileSocialState() {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(state.profileSocial));
    return true;
  } catch (error) {
    console.warn("Unable to persist profile social state.", error);
    return false;
  }
}

function getProfileRecord(userId, fallbackName = "User") {
  const cleanId = profileNormalizeId(userId);
  if (!cleanId) {
    return profileDefaultRecord("anonymous", fallbackName);
  }
  if (!state.profileSocial[cleanId]) {
    state.profileSocial[cleanId] = profileDefaultRecord(cleanId, fallbackName);
  }
  return state.profileSocial[cleanId];
}

function ensureProfileUserRecord(userId, fallbackName = "User") {
  getProfileRecord(userId, fallbackName);
}

function profileDisplayName(userId, fallbackName = "User") {
  const cleanId = profileNormalizeId(userId);
  const profileName = getProfileRecord(cleanId, fallbackName).profile.displayName;
  if (profileName && profileName.trim()) {
    return profileName.trim();
  }
  const known = profileUserById(cleanId);
  if (known?.name) {
    return known.name;
  }
  const staticUser = STATIC_DATA.users.find(user => profileNormalizeId(user.id) === cleanId);
  if (staticUser?.name) {
    return staticUser.name;
  }
  return fallbackName || "User";
}

function profileAvatarMarkup(userId, className = "mini-avatar", fallbackName = "User") {
  const profile = getProfileRecord(userId, fallbackName).profile;
  const fallbackLetter = profileDisplayName(userId, fallbackName).charAt(0).toUpperCase() || "U";
  if (profile.avatarDataUrl) {
    return `<div class="${className} has-image"><img src="${escapeHtml(profile.avatarDataUrl)}" alt="${escapeHtml(profileDisplayName(userId, fallbackName))}"></div>`;
  }
  return `<div class="${className}">${escapeHtml(fallbackLetter)}</div>`;
}

function profileRelationshipWith(userId, otherId) {
  const social = getProfileRecord(userId);
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

function profileMatchTargetId(match) {
  return profileNormalizeId(match?.user_id_2 || match?.other_user_name || match?.match_id);
}

function profileMatchTargetName(match) {
  const known = profileUserById(profileNormalizeId(match?.user_id_2));
  if (known?.name) {
    return known.name;
  }
  if (match?.other_user_name) {
    return String(match.other_user_name);
  }
  return `User ${String(profileMatchTargetId(match)).slice(0, 6) || "?"}`;
}

function sendProfileRequest(userId, otherId, otherName = "User") {
  ensureProfileUserRecord(userId, profileDisplayName(userId));
  ensureProfileUserRecord(otherId, otherName);
  const relationship = profileRelationshipWith(userId, otherId);

  if (relationship === "connected") {
    return "You are already connected.";
  }
  if (relationship === "outgoing") {
    return `Request already sent to ${profileDisplayName(otherId, otherName)}.`;
  }
  if (relationship === "incoming") {
    profileConnectRecords(state.profileSocial, userId, otherId);
    saveProfileSocialState();
    return `Connection accepted with ${profileDisplayName(otherId, otherName)}.`;
  }

  const userRecord = getProfileRecord(userId);
  const otherRecord = getProfileRecord(otherId, otherName);
  if (!userRecord.outgoingRequests.includes(otherId)) {
    userRecord.outgoingRequests.push(otherId);
  }
  if (!otherRecord.incomingRequests.includes(userId)) {
    otherRecord.incomingRequests.push(userId);
  }
  saveProfileSocialState();
  return `Connection request sent to ${profileDisplayName(otherId, otherName)}.`;
}

function acceptProfileRequest(userId, requesterId) {
  profileConnectRecords(state.profileSocial, userId, requesterId);
  saveProfileSocialState();
  return `Connected with ${profileDisplayName(requesterId)}.`;
}

function declineProfileRequest(userId, requesterId) {
  profileRemoveFromArray(getProfileRecord(userId).incomingRequests, requesterId);
  profileRemoveFromArray(getProfileRecord(requesterId).outgoingRequests, userId);
  saveProfileSocialState();
  return `Request declined from ${profileDisplayName(requesterId)}.`;
}

function cancelProfileRequest(userId, recipientId) {
  profileRemoveFromArray(getProfileRecord(userId).outgoingRequests, recipientId);
  profileRemoveFromArray(getProfileRecord(recipientId).incomingRequests, userId);
  saveProfileSocialState();
  return `Request to ${profileDisplayName(recipientId)} canceled.`;
}

function removeProfileConnection(userId, otherId) {
  profileRemoveFromArray(getProfileRecord(userId).connections, otherId);
  profileRemoveFromArray(getProfileRecord(otherId).connections, userId);
  saveProfileSocialState();
  return `${profileDisplayName(otherId)} removed from your connections.`;
}

function setProfileMessage(text, type = "success") {
  if (!profileMessageElement) {
    return;
  }
  profileMessageElement.textContent = text;
  profileMessageElement.classList.toggle("error", type === "error");
  if (profileMessageTimer) {
    clearTimeout(profileMessageTimer);
  }
  profileMessageTimer = setTimeout(() => {
    profileMessageElement.textContent = "";
    profileMessageElement.classList.remove("error");
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

function profileGalleryItemsMarkup(userId, compact = false) {
  const gallery = getProfileRecord(userId).gallery || [];
  if (!gallery.length) {
    return `<div class="empty-state small-empty">No gallery photos yet.</div>`;
  }
  return `
    <div class="gallery-grid ${compact ? "compact" : ""}">
      ${gallery.map((item, index) => `
        <button type="button" class="gallery-tile" data-zoom-src="${escapeHtml(item)}" data-zoom-alt="${escapeHtml(profileDisplayName(userId))} photo ${index + 1}">
          <img src="${escapeHtml(item)}" alt="${escapeHtml(profileDisplayName(userId))} gallery photo ${index + 1}">
        </button>
      `).join("")}
    </div>
  `;
}

function openProfileImageZoom(src, alt = "Image preview") {
  if (!zoomModal || !zoomImage) {
    return;
  }
  zoomImage.src = src;
  zoomImage.alt = alt;
  zoomModal.classList.add("visible");
  zoomModal.setAttribute("aria-hidden", "false");
}

function closeProfileImageZoom() {
  if (!zoomModal) {
    return;
  }
  zoomModal.classList.remove("visible");
  zoomModal.setAttribute("aria-hidden", "true");
}

function openPublicProfile(userId, fallbackName = "User") {
  if (!publicProfileModal || !publicProfileContent) {
    return;
  }
  const social = getProfileRecord(userId, fallbackName);
  const bio = social.profile.bio ? escapeHtml(social.profile.bio) : "No bio yet.";
  publicProfileContent.innerHTML = `
    <div class="public-head">
      ${profileAvatarMarkup(userId, "mini-avatar public-avatar", fallbackName)}
      <div>
        <h3>${escapeHtml(profileDisplayName(userId, fallbackName))}</h3>
        <p class="explain">${bio}</p>
      </div>
    </div>
    <div class="public-stats">
      <span><strong>${social.connections.length}</strong> connections</span>
      <span><strong>${social.incomingRequests.length + social.outgoingRequests.length}</strong> requests</span>
    </div>
    <h4 class="public-gallery-title">Photo Gallery</h4>
    ${profileGalleryItemsMarkup(userId, true)}
  `;
  publicProfileModal.classList.add("visible");
  publicProfileModal.setAttribute("aria-hidden", "false");
}

function closePublicProfile() {
  if (!publicProfileModal) {
    return;
  }
  publicProfileModal.classList.remove("visible");
  publicProfileModal.setAttribute("aria-hidden", "true");
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
    option.textContent = profileDisplayName(user.user_id, user.name || "User");
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
  const targetId = profileMatchTargetId(match);
  const name = profileMatchTargetName(match);
  const isLiked = match.like_state === "liked";
  const currentUserId = profileCurrentUserId();
  ensureProfileUserRecord(targetId, name);
  const relationship = currentUserId ? profileRelationshipWith(currentUserId, targetId) : "none";
  const connectLabel = relationship === "connected"
    ? "Connected"
    : relationship === "outgoing"
      ? "Request sent"
      : relationship === "incoming"
        ? "Accept request"
        : "Send safe intro";
  const connectDisabled = !currentUserId || relationship === "connected" || relationship === "outgoing";
  const relationTag = relationship === "incoming"
    ? `<span class="tag gold">Requested you</span>`
    : relationship === "outgoing"
      ? `<span class="tag gold">Pending</span>`
      : relationship === "connected"
        ? `<span class="tag gold">In connections</span>`
        : "";

  return `
    <article class="card" data-match-id="${match.match_id}" data-other-user-id="${match.user_id_2}">
      <div class="avatar-row">
        <button class="avatar-name open-profile" type="button" data-open-profile="${escapeHtml(targetId)}" data-open-profile-name="${escapeHtml(name)}">
          ${profileAvatarMarkup(targetId, "avatar", name)}
          <span>
            <strong>${escapeHtml(profileDisplayName(targetId, name))}</strong>
            <small>Tap to view gallery</small>
          </span>
        </button>
        <div class="score">${formatScore(match.final_score)}</div>
      </div>
      <div class="tag-row">${tags.map(tag => `<span class="tag blue">${tag}</span>`).join("")}${relationTag}</div>
      <p class="explain">${match.fit_explanation || match.explanation}</p>
      <p class="explain"><strong>Discovery:</strong> ${match.discovery_note || "Complementary lifestyle signal available."}</p>
      <div class="card-actions">
        <button class="connect" data-action="like" data-match-id="${match.match_id}" data-other-user-id="${match.user_id_2}" ${isLiked ? "disabled" : ""}>${icons.send} ${isLiked ? "Liked" : "Like"}</button>
        <button class="connect secondary" data-action="profile-connect" data-target-id="${escapeHtml(targetId)}" data-target-name="${escapeHtml(name)}" ${connectDisabled ? "disabled" : ""}>${!currentUserId ? "Login to connect" : connectLabel}</button>
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
  const matchList = document.querySelector("#match-list");
  if (!matchList) {
    return;
  }
  matchList.innerHTML = records.map(renderMatchCard).join("");

  matchList.querySelectorAll("button[data-open-profile]").forEach(button => {
    button.addEventListener("click", () => {
      const targetId = profileNormalizeId(button.dataset.openProfile);
      if (!targetId) {
        return;
      }
      openPublicProfile(targetId, button.dataset.openProfileName || "User");
    });
  });

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

  document.querySelectorAll("[data-action='profile-connect']").forEach(button => {
    button.addEventListener("click", () => {
      const currentUserId = profileCurrentUserId();
      const targetId = profileNormalizeId(button.dataset.targetId);
      if (!currentUserId || !targetId) {
        return;
      }
      const targetName = button.dataset.targetName || "User";
      const message = sendProfileRequest(currentUserId, targetId, targetName);
      renderMatches(persona);
      renderProfile();
      setProfileMessage(message);
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

function renderProfileEditor() {
  if (!profileEditorElement) {
    return;
  }

  const userId = profileCurrentUserId();
  if (!userId) {
    profileEditorElement.innerHTML = `<div class="empty-state">Login to manage your profile.</div>`;
    return;
  }

  const social = getProfileRecord(userId, state.currentUser?.name || "User");
  const remainingSlots = Math.max(0, MAX_GALLERY_PHOTOS - social.gallery.length);
  const profileName = profileDisplayName(userId, state.currentUser?.name || "User");
  const profileBio = String(social.profile.bio || "").trim();

  profileEditorElement.innerHTML = `
    <form class="profile-form" id="profile-form">
      <div class="profile-header">
        <button class="profile-avatar-button centered" type="button" data-avatar-upload="true">
          ${profileAvatarMarkup(userId, "profile-avatar", state.currentUser?.name || "User")}
          <span>Tap to add or change photo</span>
        </button>
        <div class="profile-identity">
          <h4>${escapeHtml(profileName)}</h4>
          <p class="profile-bio-display ${profileBio ? "" : "muted"}">${profileBio ? escapeHtml(profileBio) : "No bio yet. Press Edit Profile to add one."}</p>
        </div>
      </div>
      <div class="profile-avatar-actions">
        <input type="file" id="profile-avatar-input" accept="image/*">
        <input type="file" id="profile-gallery-input" accept="image/*" multiple>
        <button class="ghost-button compact" type="button" data-upload-avatar="true">Upload photo</button>
        <button class="ghost-button compact" type="button" data-remove-avatar="true" ${social.profile.avatarDataUrl ? "" : "disabled"}>Remove photo</button>
      </div>
      ${state.profileEditMode ? `
        <div class="profile-edit-fields">
          <label class="field-label" for="profile-name-input">Profile name</label>
          <input class="field-input" id="profile-name-input" maxlength="42" value="${escapeHtml(social.profile.displayName)}" required>
          <label class="field-label" for="profile-bio-input">Bio</label>
          <textarea class="field-input bio-input" id="profile-bio-input" rows="4" maxlength="220" placeholder="Tell others what you enjoy.">${escapeHtml(social.profile.bio)}</textarea>
        </div>
      ` : ""}
      <div class="profile-edit-actions">
        ${state.profileEditMode
    ? `<button class="connect profile-save" type="submit">Save Profile</button>`
    : `<button class="connect profile-save" type="button" data-edit-profile="true">Edit Profile</button>`}
      </div>
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
                <button type="button" class="gallery-tile" data-zoom-src="${escapeHtml(item)}" data-zoom-alt="${escapeHtml(profileDisplayName(userId))} gallery photo ${index + 1}">
                  <img src="${escapeHtml(item)}" alt="${escapeHtml(profileDisplayName(userId))} gallery photo ${index + 1}">
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
  if (!form || !avatarInput || !galleryInput) {
    return;
  }

  const editButton = form.querySelector("[data-edit-profile]");
  editButton?.addEventListener("click", () => {
    state.profileEditMode = true;
    renderProfile();
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!state.profileEditMode) {
      return;
    }
    const nameInput = document.querySelector("#profile-name-input");
    const bioInput = document.querySelector("#profile-bio-input");
    const cleanName = String(nameInput?.value || "").trim();
    const cleanBio = String(bioInput?.value || "").trim();

    if (!cleanName) {
      setProfileMessage("Profile name cannot be empty.", "error");
      return;
    }

    const record = getProfileRecord(userId, state.currentUser?.name || "User");
    record.profile.displayName = cleanName.slice(0, 42);
    record.profile.bio = cleanBio.slice(0, 220);
    record.updatedAt = nowIso();
    saveProfileSocialState();
    state.profileEditMode = false;
    populateUserSelect();
    if (state.currentUser) {
      userSelect.value = state.currentUser.user_id;
    }
    renderMatches(currentPersonaUser());
    renderProfile();
    setProfileMessage("Profile saved.");
  });

  const avatarTapUploadButton = profileEditorElement.querySelector("[data-avatar-upload]");
  const uploadButton = profileEditorElement.querySelector("[data-upload-avatar]");
  const removeButton = profileEditorElement.querySelector("[data-remove-avatar]");
  avatarTapUploadButton?.addEventListener("click", () => avatarInput.click());
  uploadButton?.addEventListener("click", () => avatarInput.click());

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
      const record = getProfileRecord(userId, state.currentUser?.name || "User");
      record.profile.avatarDataUrl = optimized;
      record.updatedAt = nowIso();
      const saved = saveProfileSocialState();
      renderMatches(currentPersonaUser());
      renderProfile();
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

  removeButton?.addEventListener("click", () => {
    const record = getProfileRecord(userId, state.currentUser?.name || "User");
    record.profile.avatarDataUrl = "";
    record.updatedAt = nowIso();
    const saved = saveProfileSocialState();
    renderMatches(currentPersonaUser());
    renderProfile();
    if (!saved) {
      setProfileMessage("Photo removed, but save failed on this device.", "error");
      return;
    }
    setProfileMessage("Profile photo removed.");
  });

  const uploadGalleryButton = profileEditorElement.querySelector("[data-upload-gallery]");
  uploadGalleryButton?.addEventListener("click", () => galleryInput.click());

  galleryInput.addEventListener("change", async () => {
    const files = Array.from(galleryInput.files || []).filter(file => file.type.startsWith("image/"));
    if (!files.length) {
      return;
    }
    const record = getProfileRecord(userId, state.currentUser?.name || "User");
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
    const saved = saveProfileSocialState();
    renderProfile();
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
      const record = getProfileRecord(userId, state.currentUser?.name || "User");
      record.gallery = record.gallery.filter((_, itemIndex) => itemIndex !== index);
      record.updatedAt = nowIso();
      const saved = saveProfileSocialState();
      renderProfile();
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
      openProfileImageZoom(src, button.dataset.zoomAlt || "Gallery image");
    });
  });
}

function renderProfile() {
  renderProfileEditor();
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

      try {
        await loadActiveThread(state.activeFriendId);
      } catch (threadError) {
        if (state.activeThread) {
          state.activeThread.messages.push(message);
        }
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
  renderProfile();
  renderRoutineMirror();
  await renderFriends();
}

async function handleUserSwitch(userId) {
  const selected = state.users.find(item => String(item.user_id) === String(userId));
  if (!selected) {
    return;
  }

  state.currentUser = selected;
  ensureProfileUserRecord(profileNormalizeId(selected.user_id), selected.name || "User");
  userSelect.value = selected.user_id;
  privacyMessage.textContent = "";
  if (profileMessageElement) {
    profileMessageElement.textContent = "";
  }
  state.profileEditMode = false;
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

function handleLogout() {
  const lastUserName = state.currentUser?.name || "";
  const lastUserEmail = state.currentUser?.email || "";

  state.currentUser = null;
  state.profileEditMode = false;
  state.activeFriendId = null;
  state.activeThread = null;
  state.routineChatMessages = [];

  if (profileMessageElement) {
    profileMessageElement.textContent = "";
    profileMessageElement.classList.remove("error");
  }
  if (privacyMessage) {
    privacyMessage.textContent = "";
  }
  if (safetyAlert) {
    safetyAlert.hidden = true;
    safetyAlert.textContent = "";
  }

  matchModal.classList.remove("visible");
  closeProfileImageZoom();
  closePublicProfile();

  navButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.section === "routine");
  });
  sections.forEach(section => {
    section.classList.toggle("active", section.id === "routine");
  });
  updatePageHeader("routine");

  loginMessage.textContent = "";
  loginName.value = lastUserName;
  loginEmail.value = lastUserEmail;
  loginModal.classList.add("visible");
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

  deleteHistoryButton?.addEventListener("click", async () => {
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

  logoutButton?.addEventListener("click", handleLogout);

  matchModalClose.addEventListener("click", () => {
    matchModal.classList.remove("visible");
  });

  zoomClose?.addEventListener("click", closeProfileImageZoom);
  zoomModal?.addEventListener("click", event => {
    const closeTarget = event.target.closest("[data-zoom-close]");
    if (closeTarget) {
      closeProfileImageZoom();
    }
  });

  publicProfileClose?.addEventListener("click", closePublicProfile);
  publicProfileModal?.addEventListener("click", event => {
    const closeTarget = event.target.closest("[data-public-close]");
    if (closeTarget) {
      closePublicProfile();
      return;
    }
    const zoomTile = event.target.closest("[data-zoom-src]");
    if (zoomTile) {
      const src = zoomTile.dataset.zoomSrc;
      if (src) {
        openProfileImageZoom(src, zoomTile.dataset.zoomAlt || "Gallery image");
      }
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && zoomModal?.classList.contains("visible")) {
      closeProfileImageZoom();
      return;
    }
    if (event.key === "Escape" && publicProfileModal?.classList.contains("visible")) {
      closePublicProfile();
      return;
    }
    if (event.key === "Escape" && matchModal.classList.contains("visible")) {
      matchModal.classList.remove("visible");
    }
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
  state.profileSocial = loadProfileSocialState();
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
