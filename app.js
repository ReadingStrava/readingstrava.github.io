const STORAGE_KEY = "reading-strava.activities.v1";

const installButton = document.getElementById("installButton");
const installStatus = document.getElementById("installStatus");
const sessionForm = document.getElementById("sessionForm");
const sessionDate = document.getElementById("sessionDate");
const sessionSummary = document.getElementById("sessionSummary");
const activityFeed = document.getElementById("activityFeed");
const shelfGrid = document.getElementById("shelfGrid");
const challengeGrid = document.getElementById("challengeGrid");
const leaderboardList = document.getElementById("leaderboardList");
const weekChart = document.getElementById("weekChart");
const storyModal = document.getElementById("storyModal");
const storyCanvas = document.getElementById("storyCanvas");
const storyDetails = document.getElementById("storyDetails");
const storyStatus = document.getElementById("storyStatus");
const shareStoryButton = document.getElementById("shareStoryButton");
const saveStoryButton = document.getElementById("saveStoryButton");

const formFields = {
  title: sessionForm.elements.namedItem("title"),
  author: sessionForm.elements.namedItem("author"),
  startPage: sessionForm.elements.namedItem("startPage"),
  endPage: sessionForm.elements.namedItem("endPage"),
  minutes: sessionForm.elements.namedItem("minutes")
};

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
let activeStory = null;

sessionDate.value = toISODate(new Date());
updateSessionSummary();
renderApp();
attachEvents();
registerServiceWorker();

function attachEvents() {
  installButton.addEventListener("click", handleInstall);
  sessionForm.addEventListener("submit", handleSessionSubmit);
  sessionForm.addEventListener("input", updateSessionSummary);
  sessionForm.addEventListener("change", updateSessionSummary);

  activityFeed.addEventListener("click", handleFeedClick);

  shareStoryButton.addEventListener("click", handleShareStory);
  saveStoryButton.addEventListener("click", handleSaveStory);

  storyModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-story]")) {
      closeStoryModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !storyModal.hidden) {
      closeStoryModal();
    }
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

function handleFeedClick(event) {
  const storyButton = event.target.closest("[data-story-id]");
  if (storyButton) {
    const targetId = storyButton.getAttribute("data-story-id");
    const activity = activities.find((item) => item.id === targetId);
    if (activity) {
      openStoryModal(activity);
    }
    return;
  }

  const applauseButton = event.target.closest("[data-applaud-id]");
  if (!applauseButton) {
    return;
  }

  const targetId = applauseButton.getAttribute("data-applaud-id");
  activities = activities.map((activity) => {
    if (activity.id !== targetId) {
      return activity;
    }
    return { ...activity, applause: activity.applause + 1 };
  });

  saveActivities(activities);
  renderFeed(activities);
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

  if (!sessionForm.reportValidity()) {
    return;
  }

  const draft = getSessionDraft();
  if (draft.error) {
    setSessionSummary(draft.error, true);
    formFields.endPage.reportValidity();
    return;
  }

  const formData = new FormData(sessionForm);
  const newActivity = normalizeActivity({
    id: generateId(),
    title: `${formData.get("title")}`.trim(),
    author: `${formData.get("author")}`.trim(),
    startPage: draft.startPage,
    endPage: draft.endPage,
    pages: draft.pages,
    minutes: draft.minutes,
    date: `${formData.get("date")}`,
    mood: `${formData.get("mood")}`,
    notes: `${formData.get("notes")}`.trim(),
    label: sessionLabels[Math.floor(Math.random() * sessionLabels.length)],
    applause: 0
  });

  if (!newActivity) {
    setSessionSummary("This session is missing required details.", true);
    return;
  }

  activities = [newActivity, ...activities].sort((left, right) => right.date.localeCompare(left.date));
  saveActivities(activities);
  renderApp();
  openStoryModal(newActivity);

  sessionForm.reset();
  sessionDate.value = toISODate(new Date());
  updateSessionSummary();
}

function updateSessionSummary() {
  const draft = getSessionDraft();

  if (draft.error) {
    setSessionSummary(draft.error, true);
    return;
  }

  if (draft.pages && draft.minutes) {
    const pace = formatPacePerPage(draft.minutes, draft.pages);
    setSessionSummary(
      `${draft.pages} pages from page ${draft.startPage} to ${draft.endPage} in ${formatDurationClock(draft.minutes)}. Pace: ${pace}/p.`,
      false
    );
    return;
  }

  setSessionSummary("Enter a page range to see pages read and pace before you save.", false);
}

function setSessionSummary(message, isError) {
  sessionSummary.textContent = message;
  sessionSummary.classList.toggle("session-summary--error", isError);
  formFields.endPage.setCustomValidity(isError ? message : "");
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
  if (records.length === 0) {
    activityFeed.innerHTML = '<p class="empty-state">Log a session to start your reading feed.</p>';
    return;
  }

  activityFeed.innerHTML = records.map((activity) => {
    const pace = getPagesPerHour(activity.pages, activity.minutes);
    const range = formatPageRange(activity);

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
          ${range ? `<li>${escapeHtml(range)}</li>` : ""}
          <li>${activity.minutes} min</li>
          <li>${pace} p/h</li>
          <li>${escapeHtml(activity.mood)}</li>
        </ul>
        <p class="activity-card__notes">${escapeHtml(activity.notes || "No notes for this session.")}</p>
        <div class="activity-card__bottom">
          <span class="activity-card__date">${range || "Logged locally on your device"}</span>
          <div class="activity-card__actions">
            <button class="button button--ghost activity-card__story" type="button" data-story-id="${activity.id}">
              Story Card
            </button>
            <button class="activity-card__applause" type="button" data-applaud-id="${activity.id}">
              Applaud ${activity.applause}
            </button>
          </div>
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
    const pace = getPagesPerHour(book.pages, book.minutes);
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

function openStoryModal(activity) {
  activeStory = activity;
  storyModal.hidden = false;
  storyModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("story-open");

  const parts = [
    `${activity.title} by ${activity.author}`,
    `${activity.pages} pages`,
    formatPageRange(activity),
    `${formatDurationClock(activity.minutes)} total`,
    `${formatPacePerPage(activity.minutes, activity.pages)}/p`
  ].filter(Boolean);

  storyDetails.textContent = parts.join("  |  ");
  setStoryStatus(getDefaultStoryStatus(), false);
  renderStoryCard(activity);
}

function closeStoryModal() {
  storyModal.hidden = true;
  storyModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("story-open");
}

async function handleShareStory() {
  if (!activeStory) {
    return;
  }

  setStoryStatus("Preparing your story image...", false);

  try {
    const blob = await canvasToBlob(storyCanvas);
    const fileName = makeShareFilename(activeStory);
    const shareText = createShareText(activeStory);

    if (typeof File === "function") {
      const file = new File([blob], fileName, { type: "image/png" });
      if (canShareImageFile(file)) {
        await navigator.share({
          title: `Reading Strava: ${activeStory.title}`,
          text: shareText,
          files: [file]
        });
        setStoryStatus("Share sheet opened. If Instagram Story is not listed, save the image and add it from your gallery.", false);
        return;
      }
    }

    downloadBlob(blob, fileName);
    setStoryStatus(getSaveFallbackMessage(), false);
  } catch (error) {
    if (error && error.name === "AbortError") {
      setStoryStatus("Share cancelled. You can still save the image and add it to your story.", false);
      return;
    }

    setStoryStatus("This browser could not open the share sheet. Save the image instead.", true);
  }
}

async function handleSaveStory() {
  if (!activeStory) {
    return;
  }

  setStoryStatus("Preparing your story image...", false);

  try {
    const blob = await canvasToBlob(storyCanvas);
    downloadBlob(blob, makeShareFilename(activeStory));
    setStoryStatus(getSaveFallbackMessage(), false);
  } catch (error) {
    setStoryStatus("The story image could not be created on this device.", true);
  }
}

function setStoryStatus(message, isError) {
  storyStatus.textContent = message;
  storyStatus.classList.toggle("story-status--error", isError);
}

function renderStoryCard(activity) {
  const render = () => {
    if (!activeStory || activeStory.id !== activity.id) {
      return;
    }

    drawStoryCard(activity);
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(render);
    return;
  }

  render();
}

function drawStoryCard(activity) {
  const context = storyCanvas.getContext("2d");
  const { width, height } = storyCanvas;

  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#060606");
  background.addColorStop(1, "#000000");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width / 2, height * 0.82, 0, width / 2, height * 0.82, width * 0.52);
  glow.addColorStop(0, "rgba(255, 96, 38, 0.18)");
  glow.addColorStop(1, "rgba(255, 96, 38, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.textAlign = "center";
  context.fillStyle = "rgba(255, 255, 255, 0.7)";
  context.font = '700 34px "Space Grotesk", "Segoe UI", sans-serif';
  context.fillText("READING STRAVA", width / 2, 96);

  const lastTitleY = drawWrappedCenteredText(
    context,
    activity.title,
    width / 2,
    170,
    width - 220,
    2,
    68,
    80,
    "#ffffff"
  );

  context.fillStyle = "rgba(255, 255, 255, 0.6)";
  context.font = '500 38px "Space Grotesk", "Segoe UI", sans-serif';
  context.fillText(activity.author, width / 2, lastTitleY + 54);

  drawStoryStat(context, {
    label: "PAGE(S)",
    value: `${activity.pages}`,
    labelY: 420,
    valueY: 650,
    valueSize: 250
  });

  drawStoryStat(context, {
    label: "PACE",
    value: formatPacePerPage(activity.minutes, activity.pages),
    suffix: "/p",
    labelY: 820,
    valueY: 1040,
    valueSize: 165
  });

  drawStoryStat(context, {
    label: "TIME",
    value: formatDurationClock(activity.minutes),
    labelY: 1185,
    valueY: 1405,
    valueSize: 185
  });

  context.fillStyle = "rgba(255, 255, 255, 0.72)";
  context.font = '600 36px "Space Grotesk", "Segoe UI", sans-serif';
  context.fillText(formatPageRange(activity) || `${activity.pages} pages logged`, width / 2, 1545);
  context.fillText(formatReadableDate(activity.date), width / 2, 1600);

  drawStoryBookIcon(context, width / 2, 1735, 208);

  context.fillStyle = "#ffffff";
  context.font = '700 62px "Space Grotesk", "Segoe UI", sans-serif';
  context.fillText("READING STRAVA", width / 2, 1870);
  context.restore();
}

function drawStoryStat(context, options) {
  const centerX = storyCanvas.width / 2;

  context.save();
  context.textAlign = "center";
  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  context.font = '700 58px "Space Grotesk", "Segoe UI", sans-serif';
  context.fillText(options.label, centerX, options.labelY);

  if (options.suffix) {
    drawCenteredValueWithSuffix(
      context,
      options.value,
      options.suffix,
      centerX,
      options.valueY,
      options.valueSize,
      Math.round(options.valueSize * 0.34)
    );
  } else {
    context.fillStyle = "#ffffff";
    context.font = `700 ${options.valueSize}px "Space Grotesk", "Segoe UI", sans-serif`;
    context.fillText(options.value, centerX, options.valueY);
  }

  context.restore();
}

function drawCenteredValueWithSuffix(context, value, suffix, centerX, y, valueSize, suffixSize) {
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  context.font = `700 ${valueSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  const valueWidth = context.measureText(value).width;

  context.font = `700 ${suffixSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  const suffixText = ` ${suffix}`;
  const suffixWidth = context.measureText(suffixText).width;

  const startX = centerX - ((valueWidth + suffixWidth) / 2);

  context.fillStyle = "#ffffff";
  context.font = `700 ${valueSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  context.fillText(value, startX, y);

  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.font = `700 ${suffixSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  context.fillText(suffixText, startX + valueWidth, y);
  context.restore();
}

function drawWrappedCenteredText(context, text, centerX, startY, maxWidth, maxLines, fontSize, lineHeight, color) {
  const words = `${text}`.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  context.save();
  context.textAlign = "center";
  context.fillStyle = color;
  context.font = `700 ${fontSize}px "Space Grotesk", "Segoe UI", sans-serif`;

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth || currentLine.length === 0) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length > maxLines) {
    const visibleLines = lines.slice(0, maxLines);
    let lastLine = visibleLines[maxLines - 1];

    while (context.measureText(`${lastLine}...`).width > maxWidth && lastLine.length > 0) {
      lastLine = lastLine.slice(0, -1).trim();
    }

    visibleLines[maxLines - 1] = `${lastLine}...`;
    lines.length = 0;
    lines.push(...visibleLines);
  }

  lines.forEach((line, index) => {
    context.fillText(line, centerX, startY + (index * lineHeight));
  });

  context.restore();
  return startY + ((lines.length - 1) * lineHeight);
}

function drawStoryBookIcon(context, centerX, centerY, size) {
  const unit = size / 208;

  context.save();
  context.translate(centerX, centerY);
  context.strokeStyle = "#ff5a1f";
  context.lineWidth = 10 * unit;
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.moveTo(-64 * unit, -32 * unit);
  context.quadraticCurveTo(-94 * unit, -84 * unit, -146 * unit, -70 * unit);
  context.lineTo(-142 * unit, 34 * unit);
  context.quadraticCurveTo(-86 * unit, 16 * unit, -16 * unit, 36 * unit);
  context.quadraticCurveTo(-6 * unit, 38 * unit, 0, 52 * unit);
  context.stroke();

  context.beginPath();
  context.moveTo(64 * unit, -32 * unit);
  context.quadraticCurveTo(94 * unit, -84 * unit, 146 * unit, -70 * unit);
  context.lineTo(142 * unit, 34 * unit);
  context.quadraticCurveTo(86 * unit, 16 * unit, 16 * unit, 36 * unit);
  context.quadraticCurveTo(6 * unit, 38 * unit, 0, 52 * unit);
  context.stroke();

  context.beginPath();
  context.moveTo(-8 * unit, 52 * unit);
  context.quadraticCurveTo(0, 82 * unit, 8 * unit, 52 * unit);
  context.stroke();

  context.beginPath();
  context.moveTo(-136 * unit, -64 * unit);
  context.lineTo(-86 * unit, 20 * unit);
  context.stroke();

  context.beginPath();
  context.moveTo(136 * unit, -64 * unit);
  context.lineTo(86 * unit, 20 * unit);
  context.stroke();

  context.beginPath();
  context.moveTo(-116 * unit, 58 * unit);
  context.quadraticCurveTo(-68 * unit, 24 * unit, -20 * unit, 40 * unit);
  context.stroke();

  context.beginPath();
  context.moveTo(116 * unit, 58 * unit);
  context.quadraticCurveTo(68 * unit, 24 * unit, 20 * unit, 40 * unit);
  context.stroke();

  context.restore();
}

function calculateMetrics(records) {
  const weeklySeries = buildWeeklySeries(records);
  const weeklyPages = weeklySeries.reduce((total, day) => total + day.pages, 0);
  const weeklyMinutes = weeklySeries.reduce((total, day) => total + day.minutes, 0);
  const monthlyPages = getMonthlyTotal(records, "pages");
  const monthlyMinutes = getMonthlyTotal(records, "minutes");
  const averagePace = getPagesPerHour(weeklyPages, weeklyMinutes);

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

  const today = toISODate(new Date());
  const yesterday = shiftDate(1);

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
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

function getSessionDraft() {
  const startPage = parsePositiveInteger(formFields.startPage.value);
  const endPage = parsePositiveInteger(formFields.endPage.value);
  const minutes = parsePositiveInteger(formFields.minutes.value);

  if (startPage !== null && endPage !== null && endPage <= startPage) {
    return {
      startPage,
      endPage,
      minutes,
      pages: null,
      error: "End page must be higher than start page."
    };
  }

  return {
    startPage,
    endPage,
    minutes,
    pages: startPage !== null && endPage !== null ? endPage - startPage : null,
    error: ""
  };
}

function loadActivities() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedActivities();
      saveActivities(seeded);
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const seeded = createSeedActivities();
      saveActivities(seeded);
      return seeded;
    }

    const normalized = parsed
      .map((activity, index) => normalizeActivity(activity, index))
      .filter(Boolean);

    if (normalized.length === 0) {
      const seeded = createSeedActivities();
      saveActivities(seeded);
      return seeded;
    }

    saveActivities(normalized);
    return normalized;
  } catch (error) {
    const seeded = createSeedActivities();
    saveActivities(seeded);
    return seeded;
  }
}

function saveActivities(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function createSeedActivities() {
  return [
    buildSeedActivity(0, "Piranesi", "Susanna Clarke", 122, 160, 48, "Locked in", "Got to the part where the house itself feels like a character."),
    buildSeedActivity(1, "Braiding Sweetgrass", "Robin Wall Kimmerer", 74, 100, 34, "Reflective", "Slow reading, a lot of stopping to underline."),
    buildSeedActivity(2, "Orbital", "Samantha Harvey", 18, 40, 30, "Steady", "Perfect short session between meetings."),
    buildSeedActivity(3, "The Left Hand of Darkness", "Ursula K. Le Guin", 188, 219, 43, "Locked in", "The world-building finally snapped into focus."),
    buildSeedActivity(5, "On Writing", "Stephen King", 56, 74, 24, "Recovery read", "Quick craft refill before bed."),
    buildSeedActivity(6, "The Book of Delights", "Ross Gay", 12, 26, 16, "Reflective", "A compact session with enough warmth to keep the streak alive.")
  ];
}

function buildSeedActivity(daysAgo, title, author, startPage, endPage, minutes, mood, notes) {
  return {
    id: generateId(),
    title,
    author,
    startPage,
    endPage,
    pages: endPage - startPage,
    minutes,
    date: shiftDate(daysAgo),
    mood,
    notes,
    label: sessionLabels[daysAgo % sessionLabels.length],
    applause: Math.max(2, 8 - daysAgo)
  };
}

function normalizeActivity(activity, fallbackIndex = 0) {
  const startPage = parsePositiveInteger(activity.startPage);
  const endPage = parsePositiveInteger(activity.endPage);
  const rangedPages = startPage !== null && endPage !== null && endPage > startPage
    ? endPage - startPage
    : null;
  const pages = rangedPages ?? parsePositiveInteger(activity.pages);
  const minutes = parsePositiveInteger(activity.minutes);

  if (pages === null || minutes === null) {
    return null;
  }

  return {
    id: `${activity.id || generateId()}`,
    title: `${activity.title || "Reading Session"}`.trim(),
    author: `${activity.author || "Unknown Author"}`.trim(),
    startPage,
    endPage,
    pages,
    minutes,
    date: isISODate(`${activity.date || ""}`) ? `${activity.date}` : shiftDate(fallbackIndex),
    mood: `${activity.mood || "Steady"}`.trim(),
    notes: `${activity.notes || ""}`.trim(),
    label: `${activity.label || "Reading block"}`.trim(),
    applause: parseNonNegativeInteger(activity.applause) ?? 0
  };
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(`${value}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value) {
  const parsed = Number.parseInt(`${value}`, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getPagesPerHour(pages, minutes) {
  if (pages < 1 || minutes < 1) {
    return 0;
  }

  return Math.round((pages / minutes) * 60);
}

function formatPacePerPage(minutes, pages) {
  if (pages < 1 || minutes < 1) {
    return "00:00";
  }

  const totalSeconds = Math.round((minutes * 60) / pages);
  return formatSecondsClock(totalSeconds);
}

function formatDurationClock(totalMinutes) {
  const roundedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
}

function formatSecondsClock(totalSeconds) {
  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
  }

  return `${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
}

function formatPageRange(activity) {
  if (activity.startPage === null || activity.endPage === null) {
    return "";
  }

  return `pp. ${activity.startPage}-${activity.endPage}`;
}

function formatReadableDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function createShareText(activity) {
  const range = formatPageRange(activity);
  const segments = [
    `I logged ${activity.pages} pages`,
    range ? `(${range})` : "",
    `in ${formatDurationClock(activity.minutes)} on Reading Strava.`,
    location.href
  ].filter(Boolean);

  return segments.join(" ");
}

function makeShareFilename(activity) {
  const slug = `${activity.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "reading-session";

  return `reading-strava-${slug}.png`;
}

function canShareImageFile(file) {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }

  try {
    return navigator.canShare({ files: [file] });
  } catch (error) {
    return false;
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Canvas export failed."));
    }, "image/png");
  });
}

function downloadBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function getDefaultStoryStatus() {
  if (!window.isSecureContext) {
    return "Story sharing needs HTTPS. This works on the live site, but local previews may only support saving.";
  }

  if (typeof navigator.share === "function") {
    return "Use Share Story to open your phone's share sheet. If Instagram Story does not appear, save the image and add it from your gallery.";
  }

  return getSaveFallbackMessage();
}

function getSaveFallbackMessage() {
  if (isIOS()) {
    return "If your iPhone does not download automatically, save the poster from the preview or your browser downloads, then add it to Instagram Story from Photos.";
  }

  return "Save the poster, then add it to Instagram Story from your gallery.";
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
