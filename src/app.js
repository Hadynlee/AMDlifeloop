const { users, missionTemplates, rewards, privacyRules, pageCopy } = window.LIFELOOP_DATA;
const icons = window.LIFELOOP_ICONS;

const STORAGE_KEY = "lifeloop-social-state-v1";

const userSelect = document.querySelector("#user-select");
const navButtons = document.querySelectorAll(".nav-button");
const sections = document.querySelectorAll(".section");
const matchListElement = document.querySelector("#match-list");
const profileEditorElement = document.querySelector("#profile-editor");
const profileTabbar = document.querySelector("#profile-tabbar");
const profileMessage = document.querySelector("#profile-message");
const feedForm = document.querySelector("#feed-form");
const feedInput = document.querySelector("#feed-input");
const feedList = document.querySelector("#feed-list");
const connectionsList = document.querySelector("#connections-list");
const incomingRequestsList = document.querySelector("#incoming-requests-list");
const outgoingRequestsList = document.querySelector("#outgoing-requests-list");

const state = {
  social: loadSocialState(),
  activeProfileView: "feed",
};

let profileMessageTimer = null;

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
      feed: [
        {
          id: `${user.id}-welcome-post`,
          text: `Started a new routine loop in LifeLoop today.`,
          createdAt: nowIso(),
        },
      ],
      connections: [],
      incomingRequests: [],
      outgoingRequests: [],
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
    const feed = Array.isArray(incoming.feed) ? incoming.feed : defaultRecord.feed;

    social[user.id] = {
      profile: {
        displayName: String(profile.displayName || defaultRecord.profile.displayName).slice(0, 42),
        bio: String(profile.bio || defaultRecord.profile.bio).slice(0, 220),
        avatarDataUrl: String(profile.avatarDataUrl || ""),
      },
      feed: feed
        .filter(item => item && typeof item.text === "string")
        .map(item => ({
          id: String(item.id || `${user.id}-${Math.random()}`),
          text: String(item.text).slice(0, 220),
          createdAt: item.createdAt ? String(item.createdAt) : nowIso(),
        }))
        .slice(0, 30),
      connections: sanitizeIds(incoming.connections, user.id),
      incomingRequests: sanitizeIds(incoming.incomingRequests, user.id),
      outgoingRequests: sanitizeIds(incoming.outgoingRequests, user.id),
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.social));
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
      feed: [],
      connections: [],
      incomingRequests: [],
      outgoingRequests: [],
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
  document.querySelector("#match-list").innerHTML = scoreMatches(user).map(match => {
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
          <div class="avatar-name">
            ${avatarMarkup(match.id, "avatar")}
            <div>
              <h3>${escapeHtml(getDisplayName(match.id))}</h3>
              <p class="explain">Privacy-safe profile</p>
            </div>
          </div>
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

function formatPostTime(value) {
  const date = new Date(value);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderProfileEditor(user) {
  const social = getSocialRecord(user.id);
  profileEditorElement.innerHTML = `
    <form class="profile-form" id="profile-form">
      <div class="profile-avatar-row">
        ${avatarMarkup(user.id, "profile-avatar")}
        <div class="profile-avatar-actions">
          <input type="file" id="profile-avatar-input" accept="image/*">
          <button class="ghost-button compact" type="button" id="profile-upload-btn">Upload photo</button>
          <button class="ghost-button compact" type="button" id="profile-remove-photo" ${social.profile.avatarDataUrl ? "" : "disabled"}>Remove</button>
        </div>
      </div>
      <label class="field-label" for="profile-name-input">Profile name</label>
      <input class="field-input" id="profile-name-input" maxlength="42" value="${escapeHtml(social.profile.displayName)}" required>
      <label class="field-label" for="profile-bio-input">Bio</label>
      <textarea class="field-input bio-input" id="profile-bio-input" rows="4" maxlength="220" placeholder="Tell your connections what you enjoy.">${escapeHtml(social.profile.bio)}</textarea>
      <button class="connect profile-save" type="submit">Save Profile</button>
    </form>
  `;

  const form = document.querySelector("#profile-form");
  const uploadButton = document.querySelector("#profile-upload-btn");
  const removeButton = document.querySelector("#profile-remove-photo");
  const avatarInput = document.querySelector("#profile-avatar-input");

  uploadButton.addEventListener("click", () => avatarInput.click());

  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setProfileMessage("Please choose an image file.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = event => {
      getSocialRecord(user.id).profile.avatarDataUrl = String(event.target?.result || "");
      saveSocialState();
      renderMatches(user);
      renderProfile(user);
      setProfileMessage("Profile photo updated.");
    };
    reader.readAsDataURL(file);
  });

  removeButton.addEventListener("click", () => {
    getSocialRecord(user.id).profile.avatarDataUrl = "";
    saveSocialState();
    renderMatches(user);
    renderProfile(user);
    setProfileMessage("Profile photo removed.");
  });

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
    saveSocialState();
    refreshUserSelect();
    renderMatches(user);
    renderProfile(user);
    setProfileMessage("Profile saved.");
  });
}

function renderFeed(userId) {
  const feed = getSocialRecord(userId).feed;
  if (!feed.length) {
    feedList.innerHTML = `<div class="empty-state">No posts yet. Share your first update above.</div>`;
    return;
  }
  feedList.innerHTML = feed
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(post => `
      <article class="feed-item">
        <div class="feed-head">
          <strong>${escapeHtml(getDisplayName(userId))}</strong>
          <span>${formatPostTime(post.createdAt)}</span>
        </div>
        <p>${escapeHtml(post.text).replace(/\n/g, "<br>")}</p>
        <button type="button" class="ghost-button compact danger-subtle" data-feed-remove="${post.id}">Delete</button>
      </article>
    `).join("");
}

function renderConnections(userId) {
  const connections = getSocialRecord(userId).connections;
  if (!connections.length) {
    connectionsList.innerHTML = `<div class="empty-state">No connections yet. Send safe intros from your matches.</div>`;
    return;
  }
  connectionsList.innerHTML = connections.map(otherId => `
    <article class="connection-item">
      <div class="connection-info">
        ${avatarMarkup(otherId, "mini-avatar")}
        <div>
          <strong>${escapeHtml(getDisplayName(otherId))}</strong>
          <span>Private connection</span>
        </div>
      </div>
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
        <div class="connection-info">
          ${avatarMarkup(otherId, "mini-avatar")}
          <div>
            <strong>${escapeHtml(getDisplayName(otherId))}</strong>
            <span>Wants to connect with you</span>
          </div>
        </div>
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
        <div class="connection-info">
          ${avatarMarkup(otherId, "mini-avatar")}
          <div>
            <strong>${escapeHtml(getDisplayName(otherId))}</strong>
            <span>Waiting for response</span>
          </div>
        </div>
        <button type="button" class="ghost-button compact danger-subtle" data-cancel-request="${otherId}">Cancel</button>
      </article>
    `).join("");
  }
}

function renderProfile(user) {
  renderProfileEditor(user);
  renderFeed(user.id);
  renderConnections(user.id);
  renderRequests(user.id);

  document.querySelectorAll(".profile-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.profileView === state.activeProfileView);
  });
  document.querySelector("#profile-feed-pane").classList.toggle("active", state.activeProfileView === "feed");
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

profileTabbar.addEventListener("click", event => {
  const button = event.target.closest(".profile-tab");
  if (!button) {
    return;
  }
  state.activeProfileView = button.dataset.profileView || "feed";
  renderProfile(currentUser());
});

feedForm.addEventListener("submit", event => {
  event.preventDefault();
  const user = currentUser();
  const text = String(feedInput.value || "").trim();
  if (!text) {
    setProfileMessage("Write something before posting.", "error");
    return;
  }
  getSocialRecord(user.id).feed.unshift({
    id: `${user.id}-${Date.now()}`,
    text: text.slice(0, 220),
    createdAt: nowIso(),
  });
  getSocialRecord(user.id).feed = getSocialRecord(user.id).feed.slice(0, 40);
  saveSocialState();
  feedInput.value = "";
  renderFeed(user.id);
  setProfileMessage("Posted to your private feed.");
});

feedList.addEventListener("click", event => {
  const button = event.target.closest("button[data-feed-remove]");
  if (!button) {
    return;
  }
  const user = currentUser();
  const postId = button.dataset.feedRemove;
  getSocialRecord(user.id).feed = getSocialRecord(user.id).feed.filter(item => item.id !== postId);
  saveSocialState();
  renderFeed(user.id);
  setProfileMessage("Post removed.");
});

connectionsList.addEventListener("click", event => {
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

refreshUserSelect();
userSelect.value = users[0].id;
render();
