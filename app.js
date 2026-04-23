const STORAGE_KEY = "reading-strava.activities.v1";

const installButton = document.getElementById("installButton");
const installStatus = document.getElementById("installStatus");
const sessionForm = document.getElementById("sessionForm");
const sessionDate = document.getElementById("sessionDate");
const activityFeed = document.getElementById("activityFeed");
const shelfGrid = document.getElementById("shelfGrid");
const challengeGrid = document.getElementById("challengeGrid");
const leaderboardList = document.getElementById("leaderboardList");
const weekChart = document.getElementById("weekChart");

const metricTargets = {
  monthlyPages: 800,
  monthlyMinutes: 900,
  streak: 20
};

const sessionLabels = [
  "Morning pages",
  "Lunch lap",
  "Late-night climb",
  "Weekend push",
  "Commute chapter"
];

let deferredInstallPrompt = null;
let activities = loadActivities();

sessionDate.value = toISODate(new Date());

renderApp();
attachEvents();
registerServiceWorker();

function attachEvents() {
  installButton.addEventListener("click", handleInstall);
  sessionForm.addEventListener("submit", handleSessionSubmit);

  activityFeed.addEventListener("click", (event) => {
    const button = event.target.closest("[data-applaud-id]");
    if (!button) {
      return;
    }

    const targetId = button.getAttribute("data-applaud-id");
    activities = activities.map((activity) => {
      if (activity.id !== targetId) {
        return activity;
      }
      return { ...activity, applause: activity.applause + 1 };
    });
    saveActivities(activities);
    renderFeed(activities);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
    installStatus.textContent = "Install Reading Strava as a standalone app from this browser.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    installStatus.textContent = "Reading Strava is installed. Open it from your home screen.";
  });
}

async function handleInstall() {
  if (window.matchMedia("(display-mode: standalone)").matches) {
    installButton.hidden = true;
    installStatus.textContent = "Reading Strava is already running as an installed app.";
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    installStatus.textContent = choice.outcome === "accepted"
      ? "Install accepted. Reading Strava will appear on your device soon."
      : "Install dismissed. You can still add it from your browser menu later.";
    deferredInstallPrompt = null;
    return;
  }

  if (isIOS()) {
    installStatus.textContent = "On iPhone: tap Share, then Add to Home Screen.";
    return;
  }

  installStatus.textContent = "Use your browser menu to install or bookmark this app on your phone.";
}

function handleSessionSubmit(event) {
  event.preventDefault();

  const formData = new FormData(sessionForm);
  const newActivity = {
    id: generateId(),
    title: `${formData.get("title")}`.trim(),
    author: `${formData.get("author")}`.trim(),
    pages: Number.parseInt(`${formData.get("pages")}`, 10),
    minutes: Number.parseInt(`${formData.get("minutes")}`, 10),
    date: `${formData.get("date")}`,
    mood: `${formData.get("mood")}`,
    notes: `${formData.get("notes")}`.trim(),
    label: sessionLabels[Math.floor(Math.random() * sessionLabels.length)],
    applause: 0
  };

  if (!newActivity.title || !newActivity.author || !newActivity.date) {
    return;
  }

  if (Number.isNaN(newActivity.pages) || Number.isNaN(newActivity.minutes) || newActivity.pages < 1 || newActivity.minutes < 1) {
    return;
  }

  activities = [newActivity, ...activities].sort((left, right) => right.date.localeCompare(left.date));
  saveActivities(activities);
  sessionForm.reset();
  sessionDate.value = toISODate(new Date());
  renderApp();
}

function renderApp() {
  const metrics = calculateMetrics(activities);
  renderHero(metrics);
  renderStats(metrics);
  renderWeekChart(metrics.weeklySeries);
  renderFeed(activities);
  renderShelf(activities);
  renderChallenges(metrics);
  renderLeaderboard(metrics.monthlyPages);
}

function renderHero(metrics) {
  document.getElementById("heroStreak").textContent = `${metrics.currentStreak} days`;
  document.getElementById("heroWeekPages").textContent = `${metrics.weeklyPages} pages`;
  document.getElementById("heroPace").textContent = `${metrics.averagePace} p/h`;
}

function renderStats(metrics) {
  document.getElementById("streakValue").textContent = `${metrics.currentStreak}`;
  document.getElementById("pagesValue").textContent = `${metrics.weeklyPages}`;
  document.getElementById("minutesValue").textContent = `${metrics.weeklyMinutes}`;
  document.getElementById("paceValue").textContent = `${metrics.averagePace}`;
}

function renderWeekChart(weeklySeries) {
  const maxPages = Math.max(...weeklySeries.map((day) => day.pages), 1);

  weekChart.innerHTML = weeklySeries.map((day) => {
    const height = day.pages === 0 ? 0 : Math.max(12, Math.round((day.pages / maxPages) * 100));
    return `
      <article class="week-bar">
        <div class="week-bar__track">
          <div class="week-bar__fill" style="height: ${height}%;"></div>
        </div>
        <div class="week-bar__meta">
          <span class="week-bar__day">${day.label}</span>
          <span class="week-bar__pages">${day.pages}p</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderFeed(records) {
  activityFeed.innerHTML = records.map((activity) => {
    const pace = Math.round((activity.pages / activity.minutes) * 60);
    return `
      <article class="activity-card">
        <div class="activity-card__top">
          <div>
            <p class="activity-card__date">${formatReadableDate(activity.date)}</p>
            <h3>${escapeHtml(activity.title)}</h3>
            <p class="activity-card__author">${escapeHtml(activity.author)}</p>
          </div>
          <span class="activity-card__badge">${escapeHtml(activity.label)}</span>
        </div>
        <ul class="activity-card__stats">
          <li>${activity.pages} pages</li>
          <li>${activity.minutes} min</li>
          <li>${pace} p/h</li>
          <li>${escapeHtml(activity.mood)}</li>
        </ul>
        <p class="activity-card__notes">${escapeHtml(activity.notes || "No notes for this session.")}</p>
        <div class="activity-card__bottom">
          <span class="activity-card__date">Logged locally on your device</span>
          <button class="activity-card__applause" type="button" data-applaud-id="${activity.id}">
            Applaud ${activity.applause}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderShelf(records) {
  const byBook = new Map();

  records.forEach((activity) => {
    const key = `${activity.title}__${activity.author}`;
    const entry = byBook.get(key) || {
      title: activity.title,
      author: activity.author,
      pages: 0,
      minutes: 0,
      sessions: 0
    };
    entry.pages += activity.pages;
    entry.minutes += activity.minutes;
    entry.sessions += 1;
    byBook.set(key, entry);
  });

  const topBooks = [...byBook.values()]
    .sort((left, right) => right.pages - left.pages)
    .slice(0, 4);

  shelfGrid.innerHTML = topBooks.map((book) => {
    const pace = Math.round((book.pages / book.minutes) * 60);
    return `
      <article class="shelf-card">
        <h3>${escapeHtml(book.title)}</h3>
        <p>${escapeHtml(book.author)}</p>
        <div class="shelf-card__pills">
          <span class="book-pill">${book.pages} pages</span>
          <span class="book-pill">${book.sessions} sessions</span>
          <span class="book-pill">${pace} p/h</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderChallenges(metrics) {
  const challengeData = [
    {
      title: "Page Summit",
      description: "Hit a bold monthly page target without turning reading into a chore.",
      value: metrics.monthlyPages,
      target: metricTargets.monthlyPages,
      unit: "pages"
    },
    {
      title: "Time in the Chair",
      description: "Build consistency by protecting long-form reading minutes.",
      value: metrics.monthlyMinutes,
      target: metricTargets.monthlyMinutes,
      unit: "minutes"
    },
    {
      title: "Streak Builder",
      description: "Keep a daily habit alive with a realistic streak target for the month.",
      value: metrics.currentStreak,
      target: metricTargets.streak,
      unit: "days"
    }
  ];

  challengeGrid.innerHTML = challengeData.map((challenge) => {
    const percentage = Math.min(100, Math.round((challenge.value / challenge.target) * 100));
    return `
      <article class="challenge-card">
        <h3>${challenge.title}</h3>
        <p>${challenge.description}</p>
        <div class="progress-row">
          <span>${challenge.value} / ${challenge.target} ${challenge.unit}</span>
          <strong>${percentage}%</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${percentage}%;"></div>
        </div>
      </article>
    `;
  }).join("");
}

function renderLeaderboard(monthlyPages) {
  const leaderboard = [
    { name: "Mina", note: "Book club captain", pages: 612 },
    { name: "Joel", note: "Commute chapter specialist", pages: 544 },
    { name: "You", note: "Current device owner", pages: monthlyPages },
    { name: "Ari", note: "Weekend deep-dive reader", pages: 438 },
    { name: "Sana", note: "Non-fiction streak keeper", pages: 392 }
  ].sort((left, right) => right.pages - left.pages);

  leaderboardList.innerHTML = leaderboard.map((entry) => `
    <li>
      <div>
        <strong>${entry.name}</strong>
        <span>${entry.note}</span>
      </div>
      <b>${entry.pages}p</b>
    </li>
  `).join("");
}

function calculateMetrics(records) {
  const weeklySeries = buildWeeklySeries(records);
  const weeklyPages = weeklySeries.reduce((total, day) => total + day.pages, 0);
  const weeklyMinutes = weeklySeries.reduce((total, day) => total + day.minutes, 0);
  const monthlyPages = getMonthlyTotal(records, "pages");
  const monthlyMinutes = getMonthlyTotal(records, "minutes");
  const averagePace = weeklyMinutes > 0 ? Math.round((weeklyPages / weeklyMinutes) * 60) : 0;

  return {
    currentStreak: getCurrentStreak(records),
    weeklyPages,
    weeklyMinutes,
    monthlyPages,
    monthlyMinutes,
    averagePace,
    weeklySeries
  };
}

function buildWeeklySeries(records) {
  const today = new Date();
  const buckets = [];

  for (let index = 6; index >= 0; index -= 1) {
    const current = new Date(today);
    current.setHours(12, 0, 0, 0);
    current.setDate(today.getDate() - index);
    const isoDate = toISODate(current);
    const matching = records.filter((activity) => activity.date === isoDate);

    buckets.push({
      date: isoDate,
      label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(current),
      pages: matching.reduce((total, activity) => total + activity.pages, 0),
      minutes: matching.reduce((total, activity) => total + activity.minutes, 0)
    });
  }

  return buckets;
}

function getCurrentStreak(records) {
  const uniqueDates = [...new Set(records.map((activity) => activity.date))].sort().reverse();
  if (uniqueDates.length === 0) {
    return 0;
  }

  let streak = 1;
  let cursor = new Date(`${uniqueDates[0]}T12:00:00`);

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const next = new Date(`${uniqueDates[index]}T12:00:00`);
    const expected = new Date(cursor);
    expected.setDate(cursor.getDate() - 1);

    if (toISODate(next) !== toISODate(expected)) {
      break;
    }

    streak += 1;
    cursor = next;
  }

  return streak;
}

function getMonthlyTotal(records, field) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  return records.reduce((total, activity) => {
    const readingDate = new Date(`${activity.date}T12:00:00`);
    if (readingDate.getMonth() === month && readingDate.getFullYear() === year) {
      return total + activity[field];
    }
    return total;
  }, 0);
}

function loadActivities() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedActivities();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    const seeded = createSeedActivities();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch (error) {
    const seeded = createSeedActivities();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveActivities(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function createSeedActivities() {
  return [
    buildSeedActivity(0, "Piranesi", "Susanna Clarke", 38, 48, "Locked in", "Got to the part where the house itself feels like a character."),
    buildSeedActivity(1, "Braiding Sweetgrass", "Robin Wall Kimmerer", 26, 34, "Reflective", "Slow reading, a lot of stopping to underline."),
    buildSeedActivity(2, "Orbital", "Samantha Harvey", 22, 30, "Steady", "Perfect short session between meetings."),
    buildSeedActivity(3, "The Left Hand of Darkness", "Ursula K. Le Guin", 31, 43, "Locked in", "The world-building finally snapped into focus."),
    buildSeedActivity(5, "On Writing", "Stephen King", 18, 24, "Recovery read", "Quick craft refill before bed."),
    buildSeedActivity(6, "The Book of Delights", "Ross Gay", 14, 16, "Reflective", "A compact session with enough warmth to keep the streak alive.")
  ];
}

function buildSeedActivity(daysAgo, title, author, pages, minutes, mood, notes) {
  return {
    id: generateId(),
    title,
    author,
    pages,
    minutes,
    date: shiftDate(daysAgo),
    mood,
    notes,
    label: sessionLabels[daysAgo % sessionLabels.length],
    applause: Math.max(2, 8 - daysAgo)
  };
}

function shiftDate(daysAgo) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return toISODate(date);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReadableDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return `${value}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      installStatus.textContent = "Offline caching could not be enabled in this browser.";
    });
  });
}
