window.LIFELOOP_DATA = {
  users: [
    {
      id: "jia",
      name: "Jia Hong",
      persona: "weekday campus learner, evening sports participant, and weekend cafe explorer",
      zones: [
        { label: "Campus area", detail: "Weekday mornings", x: 28, y: 34, type: "big" },
        { label: "Sports zone", detail: "Evening visits", x: 61, y: 48, type: "mid" },
        { label: "Cafe district", detail: "Weekend afternoons", x: 42, y: 73, type: "mid" },
        { label: "Transit corridor", detail: "Frequent pass-through", x: 74, y: 28, type: "mid" }
      ],
      routines: [
        ["Campus loop", "Repeated weekday study or work pattern around a campus zone.", "book"],
        ["Evening racket sports", "Meaningful sports visits twice a week after normal hours.", "activity"],
        ["Weekend cafe exploration", "Longer dwell time around cafe clusters on weekends.", "coffee"],
        ["Food corridor pass-by", "Often passes a dinner area but rarely stops there.", "route"]
      ],
      tags: ["Campus", "Badminton", "Cafes", "Evening Activities", "Food Exploration"],
      vector: { campus: 0.95, sports: 0.88, cafe: 0.82, nightlife: 0.22, nature: 0.25, shopping: 0.31, food: 0.72, fitness: 0.69 },
      logs: 34
    },
    {
      id: "mei",
      name: "Mei Lin",
      persona: "creative cafe regular, bookstore browser, and weekend arts explorer",
      zones: [
        { label: "Design school zone", detail: "Weekday afternoons", x: 32, y: 38, type: "big" },
        { label: "Cafe district", detail: "Frequent long visits", x: 48, y: 72, type: "mid" },
        { label: "Arts cluster", detail: "Weekend visits", x: 72, y: 54, type: "mid" }
      ],
      routines: [
        ["Creative campus loop", "Repeated weekday visits around learning and studio areas.", "book"],
        ["Cafe work sessions", "Long dwell time at cafes during afternoons and weekends.", "coffee"],
        ["Arts weekend loop", "Regular visits to galleries, bookstores, or creative venues.", "star"]
      ],
      tags: ["Campus", "Cafes", "Arts", "Books", "Weekend Exploration"],
      vector: { campus: 0.82, sports: 0.2, cafe: 0.96, nightlife: 0.28, nature: 0.31, shopping: 0.44, food: 0.64, fitness: 0.18 },
      logs: 29
    },
    {
      id: "arjun",
      name: "Arjun",
      persona: "fitness-focused commuter, post-work dinner explorer, and activity buddy",
      zones: [
        { label: "Office zone", detail: "Weekday daytime", x: 68, y: 31, type: "big" },
        { label: "Gym corridor", detail: "Evenings", x: 56, y: 56, type: "mid" },
        { label: "Dinner area", detail: "Post-work stops", x: 38, y: 70, type: "mid" }
      ],
      routines: [
        ["Workday corridor", "Stable weekday commute and office-area routine.", "route"],
        ["Evening fitness", "Repeated gym or sports visits after work.", "activity"],
        ["Post-work food loop", "Often stops near food clusters after fitness sessions.", "coffee"]
      ],
      tags: ["Fitness", "Food", "Evening Activities", "Commute", "Gym"],
      vector: { campus: 0.28, sports: 0.77, cafe: 0.46, nightlife: 0.34, nature: 0.38, shopping: 0.35, food: 0.9, fitness: 0.94 },
      logs: 31
    },
    {
      id: "sara",
      name: "Sara",
      persona: "nature walker, brunch planner, and weekend neighborhood explorer",
      zones: [
        { label: "Residential zone", detail: "Generalized home area", x: 24, y: 63, type: "big" },
        { label: "Park belt", detail: "Morning walks", x: 62, y: 35, type: "mid" },
        { label: "Brunch cluster", detail: "Weekend late mornings", x: 48, y: 76, type: "mid" }
      ],
      routines: [
        ["Morning green loop", "Repeated nature visits during morning time bands.", "route"],
        ["Weekend brunch", "Meaningful weekend dwell time at food and cafe zones.", "coffee"],
        ["Neighborhood discovery", "Explores nearby places without leaving exact route traces.", "star"]
      ],
      tags: ["Nature", "Cafes", "Brunch", "Walking", "Weekend Exploration"],
      vector: { campus: 0.12, sports: 0.32, cafe: 0.74, nightlife: 0.18, nature: 0.95, shopping: 0.26, food: 0.78, fitness: 0.46 },
      logs: 27
    }
  ],
  missionTemplates: [
    { icon: "coffee", title: "Try a new cafe near your weekend route", body: "Suggested because your routine shows repeated cafe exploration with room for novelty.", points: 60, needs: "cafe" },
    { icon: "activity", title: "Visit a new sports venue after your usual day", body: "A low-friction mission near your evening activity pattern.", points: 80, needs: "sports" },
    { icon: "route", title: "Pause at a place you usually pass by", body: "Your route shows frequent pass-through behavior near a food corridor.", points: 50, needs: "food" },
    { icon: "star", title: "Complete a shared activity mission", body: "Invite a compatible lifestyle match without exposing exact location history.", points: 120, needs: "fitness" },
    { icon: "book", title: "Explore a quiet study or creative space", body: "A calm discovery mission aligned with campus and cafe routines.", points: 70, needs: "campus" },
    { icon: "route", title: "Take a short green detour", body: "A nearby park mission balanced against your existing route comfort.", points: 55, needs: "nature" }
  ],
  rewards: [
    ["Cafe Voucher", "$2 off a relevant cafe mission"],
    ["Gym Trial", "One activity pass near your route"],
    ["Food Reward", "Discount for a matched dinner mission"],
    ["Arts Pass", "Weekend activity coupon"]
  ],
  privacyRules: [
    ["No real-time exposure", "Matches see lifestyle overlap, never where someone is right now."],
    ["Generalized sensitive places", "Home, work, and school are converted into broad zones."],
    ["Delayed matching signals", "Recommendations use repeated patterns rather than live proximity."],
    ["Consent-based connection", "A social recommendation is shown only as a privacy-safe intro."],
    ["Lifestyle labels only", "The UI says evening sports routine, not exact venue and time."],
    ["Sponsored mission guardrail", "Merchant missions must be relevant before they can appear."]
  ],
  apiBase: `${window.location.protocol}//${window.location.hostname}:8000`,
  pageCopy: {
    routine: ["My Routine", "Generalized zones summarize repeated movement patterns while hiding exact GPS and real-time location."],
    summary: ["Home Dashboard", "Track routine coverage, top categories, and privacy-safe matching progress over the latest 30 days."],
    matches: ["Privacy-Safe Matches", "Match scores are computed from approximate cells, route patterns, and broad activity windows only."],
    missions: ["Recommended Places", "Nearby places are suggested from routine cells and category fit, not exact path disclosure."],
    privacy: ["Privacy Controls", "Pause tracking or matching anytime, and permanently delete stored location history on demand."]
  }
};
