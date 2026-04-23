const STORAGE_KEY = "reading-strava.simple-recorder.v1";

const landingApp = document.getElementById("landingApp");
const recorderApp = document.getElementById("recorderApp");
const installButton = document.getElementById("installButton");
const openRecorderButton = document.getElementById("openRecorderButton");
const installStatus = document.getElementById("installStatus");
const backButton = document.getElementById("backButton");

const screens = new Map(
  [...document.querySelectorAll(".screen")].map((screen) => [screen.dataset.screen, screen])
);

const startPageInput = document.getElementById("startPageInput");
const startButton = document.getElementById("startButton");
const setupStatus = document.getElementById("setupStatus");

const runningTimerValue = document.getElementById("runningTimerValue");
const pauseButton = document.getElementById("pauseButton");

const pausedTimerValue = document.getElementById("pausedTimerValue");
const continueButton = document.getElementById("continueButton");
const saveButton = document.getElementById("saveButton");
const discardButton = document.getElementById("discardButton");

const saveHint = document.getElementById("saveHint");
const endPageInput = document.getElementById("endPageInput");
const saveSessionButton = document.getElementById("saveSessionButton");
const saveBackButton = document.getElementById("saveBackButton");
const saveStatus = document.getElementById("saveStatus");

const resultPages = document.getElementById("resultPages");
const resultPace = document.getElementById("resultPace");
const resultTime = document.getElementById("resultTime");
const resultBookMark = document.getElementById("resultBookMark");
const shareHelp = document.getElementById("shareHelp");
const copyImageButton = document.getElementById("copyImageButton");
const newSessionButton = document.getElementById("newSessionButton");
const resultStatus = document.getElementById("resultStatus");
const storyCanvas = document.getElementById("storyCanvas");

const BOOK_MARK_PATHS = [
  "M34 70L25 24C24 18 21 14 17 14C12 14 10 19 12 27L21 118C22 123 26 125 31 123C48 117 64 118 82 124",
  "M36 72C50 64 64 64 79 71",
  "M47 42L73 96",
  "M27 129C44 121 60 121 78 126",
  "M44 141C58 133 72 134 86 141",
  "M88 140C93 152 97 152 102 140",
  "M98 83C111 69 126 57 145 46L181 26",
  "M181 26C188 22 193 23 194 28C194 34 192 42 190 50L184 109",
  "M121 69C138 63 154 62 173 66",
  "M116 82C136 76 153 76 175 83",
  "M109 95C131 90 149 91 171 98",
  "M100 108C118 110 136 116 154 127",
  "M106 120C125 114 143 114 162 118",
  "M113 132C130 124 146 124 163 128"
];

let deferredInstallPrompt = null;
let state = loadState();
let tickerId = null;
let resultFeedbackResetId = null;

const screenStatus = {
  setup: { text: "", error: false },
  save: { text: "", error: false },
  result: { text: "", error: false }
};

initialize();

function initialize() {
  renderBookMarkSvg();
  attachEvents();
  render();
  registerServiceWorker();
}

function attachEvents() {
  installButton.addEventListener("click", handleInstall);
  openRecorderButton.addEventListener("click", openRecorderPreview);
  backButton.addEventListener("click", closeRecorderPreview);

  startPageInput.addEventListener("input", () => {
    const nextValue = normalizeNumericString(startPageInput.value);
    startPageInput.value = nextValue;
    state = {
      ...state,
      startPage: nextValue
    };
    saveState(state);
    setStatus("setup", "", false);
  });

  endPageInput.addEventListener("input", () => {
    const nextValue = normalizeNumericString(endPageInput.value);
    endPageInput.value = nextValue;
    state = {
      ...state,
      endPage: nextValue
    };
    saveState(state);
    setStatus("save", "", false);
  });

  startButton.addEventListener("click", handleStartSession);
  pauseButton.addEventListener("click", handlePauseSession);
  continueButton.addEventListener("click", handleContinueSession);
  saveButton.addEventListener("click", handleOpenSaveScreen);
  discardButton.addEventListener("click", handleDiscardSession);
  saveSessionButton.addEventListener("click", handleSaveSession);
  saveBackButton.addEventListener("click", handleBackToPaused);
  copyImageButton.addEventListener("click", handleResultPrimaryAction);
  newSessionButton.addEventListener("click", handleNewSession);

  document.addEventListener("visibilitychange", () => {
    render();
  });

  const displayMode = window.matchMedia("(display-mode: standalone)");
  if (typeof displayMode.addEventListener === "function") {
    displayMode.addEventListener("change", () => {
      render();
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installStatus.textContent = "Install Reading Strava to open straight into the recorder.";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installStatus.textContent = "Reading Strava is installed. Open it from your home screen.";
    render();
  });
}

async function handleInstall() {
  if (detectStandalone()) {
    installStatus.textContent = "Reading Strava is already installed on this device.";
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    installStatus.textContent = choice.outcome === "accepted"
      ? "Install accepted. Open Reading Strava from your home screen."
      : "Install dismissed. You can still add it from your browser menu.";
    deferredInstallPrompt = null;
    return;
  }

  installStatus.textContent = isIOS()
    ? "On iPhone: tap Share, then Add to Home Screen."
    : "Use your browser menu to install this app on your phone.";
}

function openRecorderPreview() {
  setRecorderQuery(true);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function closeRecorderPreview() {
  if (detectStandalone()) {
    return;
  }

  setRecorderQuery(false);
  clearStatus("setup");
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handleStartSession() {
  const startPage = parsePositiveInteger(startPageInput.value);

  if (startPage === null) {
    setStatus("setup", "Enter a valid starting page.", true);
    return;
  }

  state = {
    screen: "running",
    startPage: `${startPage}`,
    endPage: "",
    startedAt: Date.now(),
    accumulatedSeconds: 0,
    result: null
  };

  saveState(state);
  clearStatus("setup");
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handlePauseSession() {
  const elapsedSeconds = getElapsedSeconds(state);

  state = {
    ...state,
    screen: "paused",
    startedAt: null,
    accumulatedSeconds: elapsedSeconds
  };

  saveState(state);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handleContinueSession() {
  state = {
    ...state,
    screen: "running",
    startedAt: Date.now()
  };

  saveState(state);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handleOpenSaveScreen() {
  if (getElapsedSeconds(state) < 1) {
    return;
  }

  state = {
    ...state,
    screen: "save"
  };

  saveState(state);
  clearStatus("save");
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handleBackToPaused() {
  state = {
    ...state,
    screen: "paused"
  };

  saveState(state);
  clearStatus("save");
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handleDiscardSession() {
  state = createDefaultState();
  saveState(state);
  clearAllStatuses();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handleSaveSession() {
  const startPage = parsePositiveInteger(state.startPage);
  const endPage = parsePositiveInteger(endPageInput.value);
  const durationSeconds = getElapsedSeconds(state);

  if (startPage === null) {
    setStatus("save", "The starting page is missing. Start a new session.", true);
    return;
  }

  if (durationSeconds < 1) {
    setStatus("save", "Read for at least one second before saving.", true);
    return;
  }

  if (endPage === null) {
    setStatus("save", "Enter the page where you stopped.", true);
    return;
  }

  if (endPage < startPage) {
    setStatus("save", "Ending page must be the same as or after the starting page.", true);
    return;
  }

  const result = buildResult(startPage, endPage, durationSeconds);

  state = {
    screen: "result",
    startPage: `${startPage}`,
    endPage: `${endPage}`,
    startedAt: null,
    accumulatedSeconds: durationSeconds,
    result
  };

  saveState(state);
  clearStatus("save");
  clearStatus("result");
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

function handleNewSession() {
  state = createDefaultState();
  saveState(state);
  clearAllStatuses();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  render();
}

async function handleResultPrimaryAction() {
  if (!state.result) {
    return;
  }

  copyImageButton.disabled = true;
  clearStatus("result");

  try {
    const blob = await buildStoryBlob(state.result);

    if (!blob) {
      throw new Error("No image blob was created.");
    }

    const action = getPrimaryShareAction();
    const fileName = makeShareFilename(state.result);

    if (action === "copy") {
      const copied = await tryCopyImage(blob);
      if (copied) {
        flashPrimaryButtonLabel("Copied");
        return;
      }

      downloadBlob(blob, fileName);
      flashPrimaryButtonLabel("Saved");
      return;
    }

    if (action === "share") {
      const shareResult = await tryShareImage(blob, fileName);
      if (shareResult === "shared") {
        flashPrimaryButtonLabel("Shared");
        return;
      }

      if (shareResult === "cancelled") {
        return;
      }
    }

    downloadBlob(blob, fileName);
    flashPrimaryButtonLabel("Saved");
  } catch (error) {
    setStatus("result", "Couldn't create image.", true);
  } finally {
    copyImageButton.disabled = false;
    renderStatus("result");
  }
}

function render() {
  const recorderMode = isRecorderMode();

  landingApp.hidden = recorderMode;
  recorderApp.hidden = !recorderMode;
  backButton.hidden = detectStandalone();
  installButton.hidden = detectStandalone();

  renderScreen();
  renderStatuses();
  ensureTicker();
}

function renderScreen() {
  const elapsedSeconds = getElapsedSeconds(state);
  const startPage = parsePositiveInteger(state.startPage);

  startPageInput.value = state.startPage;
  endPageInput.value = state.endPage;
  runningTimerValue.textContent = formatClock(elapsedSeconds);
  pausedTimerValue.textContent = formatClock(elapsedSeconds);
  saveHint.textContent = `Started on page ${startPage ?? 0}`;

  showScreen(state.screen);

  if (state.result) {
    resultPages.textContent = `${state.result.pages}`;
    resultPace.textContent = formatClock(state.result.paceSeconds);
    resultTime.textContent = formatClock(state.result.durationSeconds);
    shareHelp.textContent = getShareHelpText();
    syncPrimaryButtonLabel();
    void renderStoryCard(state.result);
  } else {
    resultPages.textContent = "0";
    resultPace.textContent = "00:00";
    resultTime.textContent = "00:00";
    shareHelp.textContent = "Save image -> Open Instagram Story -> Add from gallery";
    syncPrimaryButtonLabel();
  }
}

function showScreen(targetScreen) {
  screens.forEach((screen, key) => {
    screen.hidden = key !== targetScreen;
  });
}

function ensureTicker() {
  const shouldTick = state.screen === "running" && isRecorderMode();

  if (shouldTick) {
    if (tickerId === null) {
      tickerId = window.setInterval(() => {
        runningTimerValue.textContent = formatClock(getElapsedSeconds(state));
      }, 1000);
    }
    return;
  }

  if (tickerId !== null) {
    window.clearInterval(tickerId);
    tickerId = null;
  }
}

function renderStatuses() {
  renderStatus("setup");
  renderStatus("save");
  renderStatus("result");
}

function renderStatus(screenName) {
  const target = screenName === "setup"
    ? setupStatus
    : screenName === "save"
      ? saveStatus
      : resultStatus;

  const entry = screenStatus[screenName];
  target.textContent = entry.text;
  target.classList.toggle("screen__status--error", entry.error);
}

function setStatus(screenName, text, error) {
  screenStatus[screenName] = { text, error };
  renderStatus(screenName);
}

function clearStatus(screenName) {
  setStatus(screenName, "", false);
}

function clearAllStatuses() {
  clearStatus("setup");
  clearStatus("save");
  clearStatus("result");
}

function buildResult(startPage, endPage, durationSeconds) {
  const pages = endPage - startPage + 1;
  return {
    startPage,
    endPage,
    pages,
    durationSeconds,
    paceSeconds: Math.max(1, Math.round(durationSeconds / pages))
  };
}

function createDefaultState() {
  return {
    screen: "setup",
    startPage: "",
    endPage: "",
    startedAt: null,
    accumulatedSeconds: 0,
    result: null
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    return normalizeState(JSON.parse(raw));
  } catch (error) {
    return createDefaultState();
  }
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function normalizeState(raw) {
  const allowedScreens = new Set(["setup", "running", "paused", "save", "result"]);
  const normalized = {
    screen: allowedScreens.has(raw?.screen) ? raw.screen : "setup",
    startPage: normalizeNumericString(raw?.startPage),
    endPage: normalizeNumericString(raw?.endPage),
    startedAt: Number.isFinite(raw?.startedAt) ? raw.startedAt : null,
    accumulatedSeconds: parseNonNegativeInteger(raw?.accumulatedSeconds) ?? 0,
    result: normalizeResult(raw?.result)
  };

  const hasStartPage = parsePositiveInteger(normalized.startPage) !== null;

  if (normalized.screen === "running" && (normalized.startedAt === null || !hasStartPage)) {
    normalized.screen = normalized.accumulatedSeconds > 0 && hasStartPage ? "paused" : "setup";
    normalized.startedAt = null;
  }

  if ((normalized.screen === "paused" || normalized.screen === "save")
    && (!hasStartPage || normalized.accumulatedSeconds < 1)) {
    normalized.screen = "setup";
    normalized.startPage = hasStartPage ? normalized.startPage : "";
    normalized.endPage = "";
    normalized.startedAt = null;
    normalized.accumulatedSeconds = 0;
  }

  if (normalized.screen === "result") {
    if (!normalized.result) {
      return createDefaultState();
    }

    normalized.startPage = `${normalized.result.startPage}`;
    normalized.endPage = `${normalized.result.endPage}`;
    normalized.startedAt = null;
    normalized.accumulatedSeconds = normalized.result.durationSeconds;
  }

  if (normalized.screen === "setup") {
    normalized.startedAt = null;
    normalized.accumulatedSeconds = 0;
    normalized.result = null;
  }

  return normalized;
}

function normalizeResult(raw) {
  const startPage = parsePositiveInteger(raw?.startPage);
  const endPage = parsePositiveInteger(raw?.endPage);
  const durationSeconds = parseNonNegativeInteger(raw?.durationSeconds);

  if (startPage === null || endPage === null || endPage < startPage || durationSeconds === null || durationSeconds < 1) {
    return null;
  }

  return buildResult(startPage, endPage, durationSeconds);
}

function getElapsedSeconds(currentState) {
  if (currentState.screen !== "running" || !Number.isFinite(currentState.startedAt)) {
    return currentState.accumulatedSeconds;
  }

  const liveSeconds = Math.floor((Date.now() - currentState.startedAt) / 1000);
  return currentState.accumulatedSeconds + Math.max(0, liveSeconds);
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(`${value}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value) {
  const parsed = Number.parseInt(`${value}`, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeNumericString(value) {
  const digits = `${value ?? ""}`.replace(/[^\d]/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
  }

  return `${`${minutes}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
}

function getPrimaryShareAction() {
  if (supportsFileShare()) {
    return "share";
  }

  if (supportsImageClipboard()) {
    return "copy";
  }

  return "save";
}

function getPrimaryActionLabel() {
  const action = getPrimaryShareAction();

  if (action === "copy") {
    return "Copy Image";
  }

  if (action === "share") {
    return "Share";
  }

  return "Save Image";
}

function getShareHelpText() {
  const action = getPrimaryShareAction();

  if (action === "share") {
    return "If Instagram Story is missing, save image -> Add from gallery";
  }

  if (action === "copy") {
    return "Save image -> Open Instagram Story -> Add from gallery";
  }

  return "Save image -> Open Instagram Story -> Add from gallery";
}

async function renderStoryCard(result) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      // Font readiness is a nice-to-have for the export, not a blocker.
    }
  }

  const context = storyCanvas.getContext("2d");
  const { width, height } = storyCanvas;

  context.clearRect(0, 0, width, height);

  drawStoryStat(context, {
    label: "PAGE(S)",
    value: `${result.pages}`,
    labelY: 190,
    valueY: 470,
    valueSize: 260
  });

  drawStoryStat(context, {
    label: "PACE",
    value: formatClock(result.paceSeconds),
    suffix: "/p",
    labelY: 720,
    valueY: 990,
    valueSize: 190
  });

  drawStoryStat(context, {
    label: "TIME",
    value: formatClock(result.durationSeconds),
    labelY: 1230,
    valueY: 1495,
    valueSize: 190
  });

  drawStoryBookMark(context, width / 2, 1658, 290);
}

function drawStoryStat(context, options) {
  const centerX = storyCanvas.width / 2;

  context.save();
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.font = '700 68px "Space Grotesk", "Segoe UI", sans-serif';
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = 22;
  context.shadowOffsetY = 8;
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
    context.font = `700 ${options.valueSize}px "Space Grotesk", "Segoe UI", sans-serif`;
    context.fillStyle = "#ffffff";
    context.fillText(options.value, centerX, options.valueY);
  }

  context.restore();
}

function drawCenteredValueWithSuffix(context, value, suffix, centerX, y, valueSize, suffixSize) {
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.shadowColor = "rgba(0, 0, 0, 0.46)";
  context.shadowBlur = 34;
  context.shadowOffsetY = 12;

  context.font = `700 ${valueSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  const valueWidth = context.measureText(value).width;

  context.font = `700 ${suffixSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  const suffixText = ` ${suffix}`;
  const suffixWidth = context.measureText(suffixText).width;

  const startX = centerX - ((valueWidth + suffixWidth) / 2);

  context.fillStyle = "#ffffff";
  context.font = `700 ${valueSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  context.fillText(value, startX, y);

  context.fillStyle = "#ffffff";
  context.font = `700 ${suffixSize}px "Space Grotesk", "Segoe UI", sans-serif`;
  context.fillText(suffixText, startX + valueWidth, y);

  context.restore();
}

function drawStoryBookMark(context, centerX, centerY, width) {
  const scale = width / 208;
  const height = 168 * scale;

  context.save();
  context.translate(centerX - (width / 2), centerY - (height / 2));
  context.scale(scale, scale);
  context.strokeStyle = "#f48135";
  context.lineWidth = 10;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(0, 0, 0, 0.3)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;

  BOOK_MARK_PATHS.forEach((pathData) => {
    context.stroke(new Path2D(pathData));
  });

  context.restore();
}

function renderBookMarkSvg() {
  resultBookMark.innerHTML = BOOK_MARK_PATHS.map((pathData) => `<path d="${pathData}" />`).join("");
}

function syncPrimaryButtonLabel() {
  copyImageButton.textContent = getPrimaryActionLabel();
}

function flashPrimaryButtonLabel(label) {
  if (resultFeedbackResetId !== null) {
    window.clearTimeout(resultFeedbackResetId);
  }

  copyImageButton.textContent = label;
  resultFeedbackResetId = window.setTimeout(() => {
    resultFeedbackResetId = null;
    syncPrimaryButtonLabel();
  }, 1800);
}

async function buildStoryBlob(result) {
  await renderStoryCard(result);

  if (typeof storyCanvas.toBlob === "function") {
    return new Promise((resolve) => {
      storyCanvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  try {
    return dataUrlToBlob(storyCanvas.toDataURL("image/png"));
  } catch (error) {
    return null;
  }
}

async function tryCopyImage(blob) {
  if (!supportsImageClipboard()) {
    return false;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob
      })
    ]);
    return true;
  } catch (error) {
    return false;
  }
}

async function tryShareImage(blob, fileName) {
  if (!supportsFileShare()) {
    return "unsupported";
  }

  try {
    const file = new File([blob], fileName, { type: blob.type });
    await navigator.share({
      title: "Reading Strava",
      text: createShareText(state.result),
      files: [file]
    });
    return "shared";
  } catch (error) {
    return isAbortError(error) ? "cancelled" : "failed";
  }
}

function createShareText(result) {
  if (!result) {
    return "Reading session";
  }

  const pageLabel = result.pages === 1 ? "page" : "pages";
  return `I logged ${result.pages} ${pageLabel} in ${formatClock(result.durationSeconds)} on Reading Strava.`;
}

function makeShareFilename(result) {
  return `reading-strava-${result.startPage}-${result.endPage}.png`;
}

function supportsImageClipboard() {
  return window.isSecureContext
    && typeof ClipboardItem !== "undefined"
    && !!navigator.clipboard
    && typeof navigator.clipboard.write === "function";
}

function supportsFileShare() {
  if (!window.isSecureContext || typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || typeof File === "undefined") {
    return false;
  }

  try {
    const testFile = new File(["x"], "test.png", { type: "image/png" });
    return navigator.canShare({ files: [testFile] });
  } catch (error) {
    return false;
  }
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

function dataUrlToBlob(dataUrl) {
  const [meta, payload] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function isRecorderMode() {
  return detectStandalone() || new URLSearchParams(window.location.search).get("mode") === "recorder";
}

function setRecorderQuery(enabled) {
  const url = new URL(window.location.href);

  if (enabled) {
    url.searchParams.set("mode", "recorder");
  } else {
    url.searchParams.delete("mode");
  }

  history.replaceState({}, "", url);
}

function detectStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
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
      installStatus.textContent = "Offline mode could not be enabled in this browser.";
    });
  });
}
