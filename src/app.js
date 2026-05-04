const { users, missionTemplates, rewards, privacyRules, pageCopy } = window.LIFELOOP_DATA;
const icons = window.LIFELOOP_ICONS;

const userSelect = document.querySelector("#user-select");
const navButtons = document.querySelectorAll(".nav-button");
const sections = document.querySelectorAll(".section");

users.forEach(user => {
  const option = document.createElement("option");
  option.value = user.id;
  option.textContent = user.name;
  userSelect.appendChild(option);
});

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
    [`${matches[0].score}%`, "top lifestyle match"],
    [`${user.tags.length}`, "inferred lifestyle tags"]
  ].map(([value, label]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderMatches(user) {
  document.querySelector("#match-list").innerHTML = scoreMatches(user).map(match => `
    <article class="card">
      <div class="avatar-row">
        <div class="avatar-name">
          <div class="avatar">${match.name.slice(0, 1)}</div>
          <div>
            <h3>${match.name}</h3>
            <p class="explain">Privacy-safe profile</p>
          </div>
        </div>
        <div class="score">${match.score}%</div>
      </div>
      <div class="tag-row">${match.shared.map(tag => `<span class="tag blue">${tag}</span>`).join("")}</div>
      <p class="explain">You matched because both profiles show similar repeated lifestyle patterns around ${match.shared.slice(0, 3).join(", ").toLowerCase()}. Exact places and times are hidden.</p>
      <button class="connect">${icons.send} Send safe intro</button>
    </article>
  `).join("");
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

function render() {
  const user = users.find(item => item.id === userSelect.value) || users[0];
  renderMap(user);
  renderRoutines(user);
  renderSummary(user);
  renderMatches(user);
  renderMissions(user);
  renderPrivacy();
}

navButtons.forEach(button => {
  button.addEventListener("click", () => {
    const target = button.dataset.section;
    navButtons.forEach(item => item.classList.toggle("active", item === button));
    sections.forEach(section => section.classList.toggle("active", section.id === target));
    document.querySelector("#page-title").textContent = pageCopy[target][0];
    document.querySelector("#page-subtitle").textContent = pageCopy[target][1];
  });
});

userSelect.addEventListener("change", render);
document.querySelector("#rerun").addEventListener("click", render);
userSelect.value = "jia";
render();
