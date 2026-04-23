const STORAGE_KEY = "reading-strava.activities.v2";
const RECORDER_KEY = "reading-strava.recorder.v1";

const installButton = document.getElementById("installButton");
const installStatus = document.getElementById("installStatus");
const openRecorderButton = document.getElementById("openRecorderButton");
const focusRecorderButton = document.getElementById("focusRecorderButton");
const dashboardApp = document.getElementById("dashboardApp");
const recorderApp = document.getElementById("recorderApp");
const shareApp = document.getElementById("shareApp");
const exitRecorderButton = document.getElementById("exitRecorderButton");
const recorderModeBadge = document.getElementById("recorderModeBadge");
const recorderHint = document.getElementById("recorderHint");
const recorderStateLabel = document.getElementById("recorderStateLabel");
const recorderElapsed = document.getElementById("recorderElapsed");
const recorderPages = document.getElementById("recorderPages");
const recorderPace = document.getElementById("recorderPace");
const recorderRange = document.getElementById("recorderRange");
const recorderSummary = document.getElementById("recorderSummary");
const startSessionButton = document.getElementById("startSessionButton");
const pauseSessionButton = document.getElementById("pauseSessionButton");
const finishSessionButton = document.getElementById("finishSessionButton");
const resetSessionButton = document.getElementById("resetSessionButton");
const activityFeed = document.getElementById("activityFeed");
const shelfGrid = document.getElementById("shelfGrid");
const challengeGrid = document.getElementById("challengeGrid");
const leaderboardList = document.getElementById("leaderboardList");
const weekChart = document.getElementById("weekChart");
const storyCanvas = document.getElementById("storyCanvas");
const sharePagesValue = document.getElementById("sharePagesValue");
const sharePaceValue = document.getElementById("sharePaceValue");
const shareTimeValue = document.getElementById("shareTimeValue");
const shareHowTo = document.getElementById("shareHowTo");
const shareStatus = document.getElementById("shareStatus");
const sharePrimaryButton = document.getElementById("sharePrimaryButton");
const shareSecondaryButton = document.getElementById("shareSecondaryButton");

const recorderFields = {
  title: document.getElementById("recorderTitle"),
  author: document.getElementById("recorderAuthor"),
  startPage: document.getElementById("recorderStartPage"),
  currentPage: document.getElementById("recorderCurrentPage"),
  mood: document.getElementById("recorderMood"),
  notes: document.getElementById("recorderNotes")
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
let recorderState = loadRecorderState();
let activeStory = null;
let tickerId = null;
let shareScreenOpen = false;
let shareScreenSource = "feed";

renderApp();
attachEvents();
applyAppMode();
renderRecorder();
registerServiceWorker();

function attachEvents() {
  installButton.addEventListener("click", handleInstall);
  openRecorderButton.addEventListener("click", () => setRecorderPreview(true));
  focusRecorderButton.addEventListener("click", () => setRecorderPreview(true));
  exitRecorderButton.addEventListener("click", () => setRecorderPreview(false));

  Object.entries(recorderFields).forEach(([key, field]) => {
    field.addEventListener("input", () => handleRecorderFieldChange(key, field.value));
    field.addEventListener("change", () => handleRecorderFieldChange(key, field.value));
  });

  startSessionButton.addEventListener("click", handleStartSession);
  pauseSessionButton.addEventListener("click", handlePauseResumeSession);
  finishSessionButton.addEventListener("click", handleFinishSession);
  resetSessionButton.addEventListener("click", handleResetSession);

  activityFeed.addEventListener("click", handleFeedClick);
  sharePrimaryButton.addEventListener("click", handlePrimaryShareAction);
  shareSecondaryButton.addEventListener("click", handleShareSecondaryAction);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shareScreenOpen) {
      closeShareScreen();
    }
  });

  document.addEventListener("visibilitychange", () => {
    renderRecorder();
  });

  const displayMode = window.matchMedia("(display-mode: standalone)");
  if (typeof displayMode.addEventListener === "function") {
    displayMode.addEventListener("change", () => {
      applyAppMode();
      renderRecorder();
    });
  }

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
    applyAppMode();
    renderRecorder();
  });
}

function handleRecorderFieldChange(key, value) {
  recorderState = { ...recorderState, [key]: value };
  saveRecorderState(recorderState);
  renderRecorder();
}

function handleFeedClick(event) {
  const storyButton = event.target.closest("[data-story-id]");
  if (storyButton) {
    const targetId = storyButton.getAttribute("data-story-id");
    const activity = activities.find((item) => item.id === targetId);
    if (activity) {
      openShareScreen(activity, "feed");
    }
    return;
  }

  const applauseButton = event.target.closest("[data-applaud-id]");
  if (!applauseButton) {
    return;
  }

  const targetId = applauseButton.getAttribute("data-applaud-id");
  activities = activities.map((activity) => (
    activity.id === targetId
      ? { ...activity, applause: activity.applause + 1 }
      : activity
  ));

  saveActivities(activities);
  renderFeed(activities);
}

async function handleInstall() {
  if (detectStandalone()) {
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

function handleStartSession() {
  const validationError = validateRecorderSetup(recorderState);
  if (validationError) {
    setRecorderSummary(validationError, true);
    return;
  }

  recorderState = {
    ...recorderState,
    running: true,
    startedAt: Date.now(),
    accumulatedSeconds: 0,
    date: isISODate(recorderState.date) ? recorderState.date : toISODate(new Date())
  };

  saveRecorderState(recorderState);
  ensureTicker();
  renderRecorder();
}

function handlePauseResumeSession() {
  if (!hasStartedSession(recorderState)) {
    return;
  }

  if (recorderState.running) {
    recorderState = {
      ...recorderState,
      running: false,
      accumulatedSeconds: getElapsedSeconds(recorderState),
      startedAt: null
    };
  } else {
    recorderState = {
      ...recorderState,
      running: true,
      startedAt: Date.now()
    };
  }

  saveRecorderState(recorderState);
  ensureTicker();
  renderRecorder();
}

function handleFinishSession() {
  if (!hasStartedSession(recorderState)) {
    setRecorderSummary("Start a session before you finish it.", true);
    return;
  }

  const live = getRecorderSnapshot(recorderState);
  if (live.pages < 1) {
    setRecorderSummary("Set the page you finished on before ending the session.", true);
    return;
  }

  const finishedState = {
    ...recorderState,
    running: false,
    accumulatedSeconds: live.elapsedSeconds,
    startedAt: null
  };

  const newActivity = normalizeActivity({
    id: generateId(),
    title: finishedState.title,
    author: finishedState.author,
    startPage: live.startPage,
    endPage: live.currentPage,
    pages: live.pages,
    durationSeconds: live.elapsedSeconds,
    date: finishedState.date || toISODate(new Date()),
    mood: finishedState.mood,
    notes: finishedState.notes,
    label: sessionLabels[Math.floor(Math.random() * sessionLabels.length)],
    applause: 0
  });

  if (!newActivity) {
    setRecorderSummary("This session could not be saved.", true);
    return;
  }

  activities = [newActivity, ...activities].sort((left, right) => right.date.localeCompare(left.date));
  saveActivities(activities);
  recorderState = createEmptyRecorderState();
  saveRecorderState(recorderState);
  renderApp();
  renderRecorder();
  openShareScreen(newActivity, "finish");
}

function handleResetSession() {
  if (!hasRecorderDraft(recorderState)) {
    return;
  }

  recorderState = createEmptyRecorderState();
  saveRecorderState(recorderState);
  ensureTicker();
  renderRecorder();
}

function applyAppMode() {
  const recorderMode = isRecorderMode();

  document.body.classList.toggle("mode-standalone", detectStandalone());
  document.body.classList.toggle("mode-recorder", recorderMode);

  dashboardApp.hidden = recorderMode || shareScreenOpen;
  recorderApp.hidden = !recorderMode || shareScreenOpen;
  shareApp.hidden = !shareScreenOpen;
  exitRecorderButton.hidden = detectStandalone();
  recorderModeBadge.textContent = detectStandalone() ? "Installed" : "Preview";

  if (recorderMode || shareScreenOpen) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
}

function setRecorderPreview(enabled) {
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set("mode", "recorder");
  } else {
    url.searchParams.delete("mode");
  }

  history.replaceState({}, "", url);
  applyAppMode();
  renderRecorder();
}

function isRecorderMode() {
  return detectStandalone() || new URLSearchParams(window.location.search).get("mode") === "recorder";
}

function detectStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
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
    activityFeed.innerHTML = '<p class="empty-state">Finish a timed reading session to start your feed.</p>';
    return;
  }

  activityFeed.innerHTML = records.map((activity) => {
    const pace = getPagesPerHour(activity.pages, activity.durationSeconds);
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
          <li>${formatDurationCompact(activity.durationSeconds)}</li>
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
      durationSeconds: 0,
      sessions: 0
    };

    entry.pages += activity.pages;
    entry.durationSeconds += activity.durationSeconds;
    entry.sessions += 1;
    byBook.set(key, entry);
  });

  const topBooks = [...byBook.values()]
    .sort((left, right) => right.pages - left.pages)
    .slice(0, 4);

  shelfGrid.innerHTML = topBooks.map((book) => `
    <article class="shelf-card">
      <h3>${escapeHtml(book.title)}</h3>
      <p>${escapeHtml(book.author)}</p>
      <div class="shelf-card__pills">
        <span class="book-pill">${book.pages} pages</span>
        <span class="book-pill">${book.sessions} sessions</span>
        <span class="book-pill">${getPagesPerHour(book.pages, book.durationSeconds)} p/h</span>
      </div>
    </article>
  `).join("");
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

function renderRecorder() {
  const live = getRecorderSnapshot(recorderState);
  const hasStarted = hasStartedSession(recorderState);
  const isRunning = recorderState.running;

  recorderFields.title.value = recorderState.title;
  recorderFields.author.value = recorderState.author;
  recorderFields.startPage.value = recorderState.startPage;
  recorderFields.currentPage.value = recorderState.currentPage;
  recorderFields.mood.value = recorderState.mood;
  recorderFields.notes.value = recorderState.notes;

  recorderFields.title.disabled = hasStarted;
  recorderFields.author.disabled = hasStarted;
  recorderFields.startPage.disabled = hasStarted;
  recorderFields.currentPage.disabled = !hasStarted;

  recorderStateLabel.textContent = isRunning ? "Recording" : hasStarted ? "Paused" : "Ready";
  recorderElapsed.textContent = formatDurationClock(live.elapsedSeconds, true);
  recorderPages.textContent = `${live.pages}`;
  recorderPace.textContent = `${formatPacePerPage(live.elapsedSeconds, live.pages)}/p`;
  recorderRange.textContent = live.range || "Set your range";

  startSessionButton.hidden = hasStarted;
  pauseSessionButton.hidden = !hasStarted;
  pauseSessionButton.textContent = isRunning ? "Pause" : "Resume";
  finishSessionButton.disabled = !hasStarted || live.pages < 1 || live.elapsedSeconds < 1;
  finishSessionButton.hidden = !hasStarted;
  resetSessionButton.disabled = !hasRecorderDraft(recorderState);

  recorderHint.textContent = detectStandalone()
    ? "Installed mode opens straight into the recorder."
    : "Preview mode mirrors what the installed app will do.";

  if (isRunning) {
    setRecorderSummary("Session running. Update the page you finished on as you go.", false);
  } else if (hasStarted) {
    setRecorderSummary(`Paused at ${formatDurationClock(live.elapsedSeconds, true)}. Finish the session when you stop reading.`, false);
  } else if (live.startPage !== null) {
    setRecorderSummary(`Ready to begin from page ${live.startPage}. Tap Start Session to begin the timer.`, false);
  } else {
    setRecorderSummary("No active session.", false);
  }

  ensureTicker();
}

function setRecorderSummary(message, isError) {
  recorderSummary.textContent = message;
  recorderSummary.classList.toggle("recorder-summary--error", isError);
}

function ensureTicker() {
  if (recorderState.running) {
    if (tickerId === null) {
      tickerId = window.setInterval(() => {
        renderRecorder();
      }, 1000);
    }
    return;
  }

  if (tickerId !== null) {
    window.clearInterval(tickerId);
    tickerId = null;
  }
}

function openShareScreen(activity, source) {
  activeStory = activity;
  shareScreenSource = source;
  shareScreenOpen = true;
  document.body.classList.add("story-open");
  renderShareScreen(activity);
  applyAppMode();
}

function closeShareScreen() {
  shareScreenOpen = false;
  activeStory = null;
  document.body.classList.remove("story-open");
  applyAppMode();
}

async function handlePrimaryShareAction() {
  if (!activeStory) {
    return;
  }

  setShareStatus("Preparing your reading card...", false);

  const storyDataUrl = getStoryDataUrl();
  if (!storyDataUrl) {
    setShareStatus("The reading card could not be created on this device.", true);
    return;
  }

  const fileName = makeShareFilename(activeStory);
  const imageBlob = dataUrlToBlob(storyDataUrl);

  if (supportsImageClipboard()) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [imageBlob.type]: imageBlob })
      ]);
      setShareStatus("Image copied. If Instagram Story does not accept paste on this device, use Save Image and add it from your gallery.", false);
      return;
    } catch (error) {
      downloadBlob(imageBlob, fileName);
      setShareStatus("Copy Image is not supported on this browser, so the image was saved instead.", false);
      sharePrimaryButton.textContent = "Save Image";
      return;
    }
  }

  downloadBlob(imageBlob, fileName);
  setShareStatus(getSaveFallbackMessage(), false);
}

function handleShareSecondaryAction() {
  if (shareScreenSource === "finish") {
    closeShareScreen();
    renderRecorder();
    recorderFields.title.focus();
    return;
  }

  closeShareScreen();
}

function renderShareScreen(activity) {
  sharePagesValue.textContent = `${activity.pages}`;
  sharePaceValue.textContent = formatStoryMetricClock(activity.durationSeconds / activity.pages);
  shareTimeValue.textContent = formatStoryMetricClock(activity.durationSeconds);
  shareHowTo.textContent = "Save image -> Open Instagram Story -> Add from gallery";
  shareSecondaryButton.textContent = shareScreenSource === "finish" ? "New Session" : "Close";
  setShareStatus(getDefaultShareStatus(), false);
  updatePrimaryShareButton();
  renderStoryCard(activity);
}

function updatePrimaryShareButton() {
  sharePrimaryButton.textContent = supportsImageClipboard() ? "Copy Image" : "Save Image";
}

function setShareStatus(message, isError) {
  shareStatus.textContent = message;
  shareStatus.classList.toggle("share-screen__status--error", isError);
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

  drawStoryStat(context, {
    label: "PAGE(S)",
    value: `${activity.pages}`,
    labelY: 250,
    valueY: 470,
    valueSize: 250
  });

  drawStoryStat(context, {
    label: "PACE",
    value: formatStoryMetricClock(activity.durationSeconds / activity.pages),
    suffix: "/p",
    labelY: 670,
    valueY: 900,
    valueSize: 165
  });

  drawStoryStat(context, {
    label: "TIME",
    value: formatStoryMetricClock(activity.durationSeconds),
    labelY: 1095,
    valueY: 1320,
    valueSize: 185
  });

  drawStoryBookIcon(context, width / 2, 1600, 208);
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
  const weeklySeconds = weeklySeries.reduce((total, day) => total + day.durationSeconds, 0);
  const monthlyPages = getMonthlyTotal(records, "pages");
  const monthlySeconds = getMonthlyTotal(records, "durationSeconds");

  return {
    currentStreak: getCurrentStreak(records),
    weeklyPages,
    weeklyMinutes: Math.round(weeklySeconds / 60),
    monthlyPages,
    monthlyMinutes: Math.round(monthlySeconds / 60),
    averagePace: getPagesPerHour(weeklyPages, weeklySeconds),
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
      durationSeconds: matching.reduce((total, activity) => total + activity.durationSeconds, 0)
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

function validateRecorderSetup(state) {
  if (!`${state.title}`.trim()) {
    return "Add a book title before starting the timer.";
  }

  if (!`${state.author}`.trim()) {
    return "Add the author before starting the timer.";
  }

  if (parsePositiveInteger(state.startPage) === null) {
    return "Set a valid starting page before starting the timer.";
  }

  return "";
}

function getRecorderSnapshot(state) {
  const startPage = parsePositiveInteger(state.startPage);
  const currentPage = parsePositiveInteger(state.currentPage);
  const elapsedSeconds = getElapsedSeconds(state);

  let pages = 0;
  if (startPage !== null && currentPage !== null && currentPage >= startPage) {
    pages = currentPage - startPage + 1;
  }

  return {
    startPage,
    currentPage,
    elapsedSeconds,
    pages,
    range: startPage !== null && currentPage !== null && currentPage >= startPage
      ? `pp. ${startPage}-${currentPage}`
      : ""
  };
}

function getElapsedSeconds(state) {
  if (!state.running || !Number.isFinite(state.startedAt)) {
    return state.accumulatedSeconds;
  }

  return state.accumulatedSeconds + Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
}

function hasStartedSession(state) {
  return state.running || state.accumulatedSeconds > 0;
}

function hasRecorderDraft(state) {
  return hasStartedSession(state)
    || `${state.title}`.trim().length > 0
    || `${state.author}`.trim().length > 0
    || `${state.startPage}`.trim().length > 0
    || `${state.currentPage}`.trim().length > 0
    || `${state.notes}`.trim().length > 0;
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

function loadRecorderState() {
  try {
    const raw = localStorage.getItem(RECORDER_KEY);
    if (!raw) {
      return createEmptyRecorderState();
    }

    const parsed = JSON.parse(raw);
    return normalizeRecorderState(parsed);
  } catch (error) {
    return createEmptyRecorderState();
  }
}

function saveRecorderState(state) {
  localStorage.setItem(RECORDER_KEY, JSON.stringify(state));
}

function createEmptyRecorderState() {
  return {
    title: "",
    author: "",
    startPage: "",
    currentPage: "",
    mood: "Locked in",
    notes: "",
    date: toISODate(new Date()),
    running: false,
    startedAt: null,
    accumulatedSeconds: 0
  };
}

function normalizeRecorderState(raw) {
  const base = createEmptyRecorderState();
  const normalized = {
    ...base,
    title: `${raw.title || ""}`,
    author: `${raw.author || ""}`,
    startPage: `${raw.startPage || ""}`,
    currentPage: `${raw.currentPage || ""}`,
    mood: `${raw.mood || base.mood}`,
    notes: `${raw.notes || ""}`,
    date: isISODate(`${raw.date || ""}`) ? `${raw.date}` : base.date,
    running: raw.running === true,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : null,
    accumulatedSeconds: parseNonNegativeInteger(raw.accumulatedSeconds) ?? 0
  };

  if (!normalized.running) {
    normalized.startedAt = null;
  }

  return normalized;
}

function createSeedActivities() {
  return [
    buildSeedActivity(0, "Piranesi", "Susanna Clarke", 122, 160, 48 * 60, "Locked in", "Got to the part where the house itself feels like a character."),
    buildSeedActivity(1, "Braiding Sweetgrass", "Robin Wall Kimmerer", 74, 100, 34 * 60, "Reflective", "Slow reading, a lot of stopping to underline."),
    buildSeedActivity(2, "Orbital", "Samantha Harvey", 18, 40, 30 * 60, "Steady", "Perfect short session between meetings."),
    buildSeedActivity(3, "The Left Hand of Darkness", "Ursula K. Le Guin", 188, 219, 43 * 60, "Locked in", "The world-building finally snapped into focus."),
    buildSeedActivity(5, "On Writing", "Stephen King", 56, 74, 24 * 60, "Recovery read", "Quick craft refill before bed."),
    buildSeedActivity(6, "The Book of Delights", "Ross Gay", 12, 26, 16 * 60, "Reflective", "A compact session with enough warmth to keep the streak alive.")
  ];
}

function buildSeedActivity(daysAgo, title, author, startPage, endPage, durationSeconds, mood, notes) {
  return {
    id: generateId(),
    title,
    author,
    startPage,
    endPage,
    pages: endPage - startPage + 1,
    durationSeconds,
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
  const rangedPages = startPage !== null && endPage !== null && endPage >= startPage
    ? endPage - startPage + 1
    : null;
  const pages = rangedPages ?? parsePositiveInteger(activity.pages);
  const durationSeconds = parseNonNegativeInteger(activity.durationSeconds)
    ?? (parsePositiveInteger(activity.minutes) !== null ? parsePositiveInteger(activity.minutes) * 60 : null);

  if (pages === null || durationSeconds === null || durationSeconds < 1) {
    return null;
  }

  return {
    id: `${activity.id || generateId()}`,
    title: `${activity.title || "Reading Session"}`.trim(),
    author: `${activity.author || "Unknown Author"}`.trim(),
    startPage,
    endPage,
    pages,
    durationSeconds,
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

function getPagesPerHour(pages, durationSeconds) {
  if (pages < 1 || durationSeconds < 1) {
    return 0;
  }

  return Math.round((pages / durationSeconds) * 3600);
}

function formatPacePerPage(durationSeconds, pages) {
  if (pages < 1 || durationSeconds < 1) {
    return "00:00";
  }

  return formatDurationClock(Math.round(durationSeconds / pages));
}

function formatDurationClock(totalSeconds, alwaysHours = false) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (alwaysHours || hours > 0) {
    return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
  }

  return `${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
}

function formatDurationCompact(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes} min`;
  }

  return `${safeSeconds}s`;
}

function formatStoryMetricClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.round((safeSeconds % 3600) / 60);

  if (minutes === 60) {
    return `${`${hours + 1}`.padStart(2, "0")}:00`;
  }

  return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
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
    `I just logged ${activity.pages} pages`,
    range ? `(${range})` : "",
    `in ${formatDurationClock(activity.durationSeconds)} on Reading Strava.`,
    window.location.origin
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

function supportsImageClipboard() {
  return window.isSecureContext
    && typeof ClipboardItem !== "undefined"
    && !!navigator.clipboard
    && typeof navigator.clipboard.write === "function";
}

function getStoryDataUrl() {
  try {
    return storyCanvas.toDataURL("image/png");
  } catch (error) {
    return "";
  }
}

function dataUrlToBlob(dataUrl) {
  const [metadata, base64] = dataUrl.split(",");
  const mimeMatch = metadata.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
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

function getDefaultShareStatus() {
  if (!window.isSecureContext) {
    return "Saving and clipboard access need HTTPS. This works on the live site, but local previews may only support saving.";
  }

  if (supportsImageClipboard()) {
    return "Tap Copy Image if your browser supports it. If Instagram Story does not accept paste, use Save Image and add it from your gallery.";
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
