/**
 * Tamil Voice - Edge TTS Mobile Android Application
 * Core Application Engine & State Machine
 */

// --- 1. Constants & Voice Definitions ---
const TAMIL_VOICES = [
  {
    id: "ta-IN-PallaviNeural",
    name: "Pallavi",
    region: "India (Tamil Nadu)",
    gender: "Female",
    flag: "🇮🇳",
    gradioName: "ta-IN-PallaviNeural - ta-IN (Female)",
    description: "Natural Indian Tamil voice"
  },
  {
    id: "ta-LK-SaranyaNeural",
    name: "Saranya",
    region: "Sri Lanka",
    gender: "Female",
    flag: "🇱🇰",
    gradioName: "ta-LK-SaranyaNeural - ta-LK (Female)",
    description: "Clear Sri Lankan Tamil accent"
  },
  {
    id: "ta-MY-KaniNeural",
    name: "Kani",
    region: "Malaysia",
    gender: "Female",
    flag: "🇲🇾",
    gradioName: "ta-MY-KaniNeural - ta-MY (Female)",
    description: "Melodic Malaysian Tamil accent"
  },
  {
    id: "ta-SG-VenbaNeural",
    name: "Venba",
    region: "Singapore",
    gender: "Female",
    flag: "🇸🇬",
    gradioName: "ta-SG-VenbaNeural - ta-SG (Female)",
    description: "Warm and friendly Singapore Tamil tone"
  }
];

const DEFAULT_API_BASE = "https://innoai-edge-tts-text-to-speech.hf.space";
const FALLBACK_API_BASE = "https://innoai-edge-tts-text-to-speech-api.hf.space";

// --- 2. Application State ---
const State = {
  theme: localStorage.getItem("tts_theme") || "dark",
  selectedVoice: TAMIL_VOICES[0],
  speedRate: 0, // -50 to +50%
  currentAudioBlob: null,
  currentAudioUrl: null,
  isConverting: false,
  abortController: null,
  
  // Security PIN
  pinEnabled: localStorage.getItem("tts_pin_enabled") === "true",
  pinHash: localStorage.getItem("tts_pin_hash") || "",
  isUnlocked: false,
  pinEntered: "",
  pinSetupStep: null, // null | 'CREATE' | 'CONFIRM'
  pinTempCreate: "",
  
  // Custom API endpoint
  apiBase: localStorage.getItem("tts_api_base") || DEFAULT_API_BASE
};

// --- 3. DOM Elements ---
const DOM = {
  // Theme
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  themeIcon: document.getElementById("themeIcon"),
  themeLabel: document.getElementById("themeLabel"),
  
  // Voice & Text Controls
  voiceSelect: document.getElementById("voiceSelect"),
  voiceDesc: document.getElementById("voiceDesc"),
  voiceFlag: document.getElementById("voiceFlag"),
  mainTextarea: document.getElementById("mainTextarea"),
  charCount: document.getElementById("charCount"),
  wordCount: document.getElementById("wordCount"),
  btnPaste: document.getElementById("btnPaste"),
  btnClear: document.getElementById("btnClear"),
  btnSample: document.getElementById("btnSample"),
  
  // Speed Slider
  speedSlider: document.getElementById("speedSlider"),
  speedBadge: document.getElementById("speedBadge"),
  
  // Action & Progress
  btnConvert: document.getElementById("btnConvert"),
  btnConvertText: document.getElementById("btnConvertText"),
  progressCard: document.getElementById("progressCard"),
  progressBarFill: document.getElementById("progressBarFill"),
  progressPercent: document.getElementById("progressPercent"),
  progressStatus: document.getElementById("progressStatus"),
  btnCancelConvert: document.getElementById("btnCancelConvert"),
  
  // Audio Player & Download
  audioResultCard: document.getElementById("audioResultCard"),
  audioPlayer: document.getElementById("audioPlayer"),
  btnDownloadMp3: document.getElementById("btnDownloadMp3"),
  btnShareAudio: document.getElementById("btnShareAudio"),
  
  // Drawer / Hamburger Menu
  btnHamburger: document.getElementById("btnHamburger"),
  btnCloseDrawer: document.getElementById("btnCloseDrawer"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  hamburgerDrawer: document.getElementById("hamburgerDrawer"),
  tabHistoryBtn: document.getElementById("tabHistoryBtn"),
  tabLockBtn: document.getElementById("tabLockBtn"),
  tabHistoryContent: document.getElementById("tabHistoryContent"),
  tabLockContent: document.getElementById("tabLockContent"),
  historyList: document.getElementById("historyList"),
  historyCountBadge: document.getElementById("historyCountBadge"),
  btnClearHistory: document.getElementById("btnClearHistory"),
  
  // PIN Lock Elements
  pinToggleInput: document.getElementById("pinToggleInput"),
  pinStatusBox: document.getElementById("pinStatusBox"),
  btnChangePin: document.getElementById("btnChangePin"),
  btnLockNow: document.getElementById("btnLockNow"),
  pinLockOverlay: document.getElementById("pinLockOverlay"),
  pinLockTitle: document.getElementById("pinLockTitle"),
  pinLockSubtitle: document.getElementById("pinLockSubtitle"),
  pinDotsRow: document.getElementById("pinDotsRow"),
  keypadGrid: document.getElementById("keypadGrid"),
  
  // Toast
  toastContainer: document.getElementById("toastContainer")
};

// --- 4. Database Engine (IndexedDB for Persistent Audio Storage) ---
const DB = {
  dbName: "TamilTTS_Storage",
  dbVersion: 1,
  dbInstance: null,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("conversions")) {
          const store = db.createObjectStore("conversions", { keyPath: "id", autoIncrement: true });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = (e) => {
        this.dbInstance = e.target.result;
        resolve(this.dbInstance);
      };
      request.onerror = (e) => {
        console.error("IndexedDB error:", e);
        reject(e);
      };
    });
  },

  async saveItem(item) {
    if (!this.dbInstance) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.dbInstance.transaction(["conversions"], "readwrite");
      const store = tx.objectStore("conversions");
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllItems() {
    if (!this.dbInstance) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.dbInstance.transaction(["conversions"], "readonly");
      const store = tx.objectStore("conversions");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async deleteItem(id) {
    if (!this.dbInstance) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.dbInstance.transaction(["conversions"], "readwrite");
      const store = tx.objectStore("conversions");
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async clearAll() {
    if (!this.dbInstance) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.dbInstance.transaction(["conversions"], "readwrite");
      const store = tx.objectStore("conversions");
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
};

// --- 5. Notification Utilities ---
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "error") icon = "⚠️";
  
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  DOM.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(15px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// --- 6. Theme Engine ---
function applyTheme(theme) {
  State.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("tts_theme", theme);
  
  if (theme === "dark") {
    DOM.themeIcon.textContent = "🌙";
    DOM.themeLabel.textContent = "Dark";
  } else {
    DOM.themeIcon.textContent = "☀️";
    DOM.themeLabel.textContent = "Light";
  }
}

function toggleTheme() {
  const newTheme = State.theme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
  showToast(`Switched to ${newTheme.toUpperCase()} theme`, "info");
}

// --- 7. Voice Selection Setup ---
function populateVoiceSelect() {
  DOM.voiceSelect.innerHTML = "";
  TAMIL_VOICES.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = `${voice.flag} ${voice.name} - ${voice.region}`;
    DOM.voiceSelect.appendChild(option);
  });
  
  DOM.voiceSelect.value = State.selectedVoice.id;
  updateVoiceDetails();
}

function updateVoiceDetails() {
  const voice = TAMIL_VOICES.find(v => v.id === DOM.voiceSelect.value) || TAMIL_VOICES[0];
  State.selectedVoice = voice;
  DOM.voiceFlag.textContent = voice.flag;
  DOM.voiceDesc.textContent = `${voice.name} (${voice.region}): ${voice.description}`;
}

// --- 8. Unlimited Text Chunking Engine ---
/**
 * Splits unlimited Tamil / English text into natural sentence-sized chunks
 * maxChunkLen ensures Hugging Face Edge TTS space won't timeout or reject request.
 */
function splitTextIntoChunks(text, maxChunkLen = 350) {
  const clean = text.trim();
  if (!clean) return [];

  // Match sentences using Tamil danda (।), periods, question marks, exclamation marks, and newlines
  const rawSegments = clean.split(/([\n\r]+|[.?!।]+[\s]+)/);
  const sentences = [];
  let tempSentence = "";

  for (let i = 0; i < rawSegments.length; i++) {
    const part = rawSegments[i];
    if (!part) continue;
    tempSentence += part;
    if (part.match(/[\n\r]+|[.?!।]+[\s]+/) || i === rawSegments.length - 1) {
      if (tempSentence.trim()) {
        sentences.push(tempSentence.trim());
      }
      tempSentence = "";
    }
  }

  // Combine small sentences into chunks up to maxChunkLen
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (!currentChunk) {
      if (sentence.length > maxChunkLen) {
        // If single sentence exceeds maxChunkLen, split by spaces or commas
        const subWords = sentence.split(/([\s,]+)/);
        let subChunk = "";
        for (const word of subWords) {
          if ((subChunk + word).length <= maxChunkLen) {
            subChunk += word;
          } else {
            if (subChunk.trim()) chunks.push(subChunk.trim());
            subChunk = word;
          }
        }
        if (subChunk.trim()) currentChunk = subChunk.trim();
      } else {
        currentChunk = sentence;
      }
    } else if ((currentChunk + " " + sentence).length <= maxChunkLen) {
      currentChunk += " " + sentence;
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// --- 9. Edge TTS API Communication ---
/**
 * Call Gradio 4 SSE API endpoint (used by modern Hugging Face Spaces)
 */
async function callGradio4SSE(baseUrl, endpoint, data, signal) {
  const postUrl = `${baseUrl}/gradio_api/call/${endpoint}`;
  const postRes = await fetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    signal
  });

  if (!postRes.ok) {
    throw new Error(`POST ${postUrl} returned HTTP ${postRes.status}`);
  }

  const resJson = await postRes.json();
  const eventId = resJson.event_id;
  if (!eventId) {
    throw new Error("No event_id returned from Gradio 4 API");
  }

  // Stream output using Server-Sent Events (SSE)
  const streamUrl = `${baseUrl}/gradio_api/call/${endpoint}/${eventId}`;
  const streamRes = await fetch(streamUrl, { signal });
  if (!streamRes.ok) {
    throw new Error(`GET ${streamUrl} returned HTTP ${streamRes.status}`);
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    if (buffer.includes("event: complete")) {
      const lines = buffer.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === "event: complete") {
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].startsWith("data:")) {
              const jsonStr = lines[j].replace(/^data:\s*/, "").trim();
              if (jsonStr) {
                return JSON.parse(jsonStr);
              }
            }
          }
        }
      }
    }

    if (buffer.includes("event: error")) {
      throw new Error("Gradio server reported an error processing synthesis");
    }
  }

  throw new Error("Stream closed before completion");
}

/**
 * Synthesizes a single chunk with multi-layer fallback architecture
 */
async function synthesizeChunk(chunkText, voiceGradioName, speedRate, signal) {
  const payloadData = [
    chunkText,
    voiceGradioName,
    speedRate, // -50 to 50
    0          // Pitch: 0
  ];

  const candidateBases = [
    State.apiBase,
    "https://innoai-edge-tts-text-to-speech.hf.space",
    "https://innoai-edge-tts-text-to-speech-api.hf.space"
  ];

  let lastError = null;

  // 1. Try Gradio 4 SSE protocol on candidate spaces
  for (const baseUrl of candidateBases) {
    for (const endpoint of ["predict", "tts_interface"]) {
      try {
        const resultData = await callGradio4SSE(baseUrl, endpoint, payloadData, signal);
        if (resultData && resultData[0]) {
          const first = resultData[0];
          let audioUrl = "";
          if (typeof first === "string") {
            audioUrl = first.startsWith("http") ? first : `${baseUrl}/gradio_api/file=${encodeURIComponent(first)}`;
          } else if (first.url) {
            audioUrl = first.url;
          } else if (first.path) {
            audioUrl = `${baseUrl}/gradio_api/file=${encodeURIComponent(first.path)}`;
          }

          if (audioUrl) {
            const audioRes = await fetch(audioUrl, { signal });
            if (audioRes.ok) {
              return await audioRes.arrayBuffer();
            }
          }
        }
      } catch (err) {
        if (err.name === "AbortError") throw err;
        lastError = err;
        console.warn(`Gradio 4 ${baseUrl}/${endpoint} failed:`, err.message);
      }
    }
  }

  // 2. Try Gradio legacy /api/predict or /run/predict
  for (const baseUrl of candidateBases) {
    for (const path of ["/gradio_api/predict", "/run/predict", "/api/predict"]) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: payloadData }),
          signal
        });

        if (response.ok) {
          const json = await response.json();
          if (json && json.data && json.data[0]) {
            const fileInfo = json.data[0];
            let downloadUrl = "";
            if (typeof fileInfo === "string") {
              downloadUrl = fileInfo.startsWith("http") ? fileInfo : `${baseUrl}/file=${encodeURIComponent(fileInfo)}`;
            } else if (fileInfo.url) {
              downloadUrl = fileInfo.url;
            } else if (fileInfo.name) {
              downloadUrl = `${baseUrl}/file=${encodeURIComponent(fileInfo.name)}`;
            } else if (fileInfo.path) {
              downloadUrl = `${baseUrl}/file=${encodeURIComponent(fileInfo.path)}`;
            }

            if (downloadUrl) {
              const audioRes = await fetch(downloadUrl, { signal });
              if (audioRes.ok) return await audioRes.arrayBuffer();
            }
          }
        }
      } catch (err) {
        if (err.name === "AbortError") throw err;
        lastError = err;
      }
    }
  }

  // 3. Fallback: High-reliability Google Tamil Speech Engine
  try {
    const googleTTS = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunkText)}&tl=ta&client=tw-ob`;
    const googleRes = await fetch(googleTTS, { signal });
    if (googleRes.ok) {
      return await googleRes.arrayBuffer();
    }
  } catch (gErr) {
    console.warn("Google TTS fallback failed:", gErr.message);
  }

  throw lastError || new Error("Unable to synthesize audio. Please verify your network connection.");
}

/**
 * Merges multiple MP3 ArrayBuffers into a single continuous MP3 Blob
 */
function mergeAudioChunks(arrayBuffers) {
  let totalLength = 0;
  for (const buffer of arrayBuffers) {
    totalLength += buffer.byteLength;
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of arrayBuffers) {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return new Blob([combined], { type: "audio/mp3" });
}

// --- 10. Main Conversion Workflow ---
async function startConversion() {
  const text = DOM.mainTextarea.value.trim();
  if (!text) {
    showToast("Please enter Tamil text to convert", "error");
    DOM.mainTextarea.focus();
    return;
  }

  const chunks = splitTextIntoChunks(text);
  if (chunks.length === 0) return;

  // Initialize UI & State
  State.isConverting = true;
  State.abortController = new AbortController();
  DOM.btnConvert.disabled = true;
  DOM.btnConvertText.textContent = "Converting...";
  DOM.progressCard.classList.add("active");
  DOM.audioResultCard.classList.remove("active");
  updateProgress(0, `Preparing ${chunks.length} text part${chunks.length > 1 ? "s" : ""}...`);

  const audioBuffers = [];

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (State.abortController.signal.aborted) {
        throw new DOMException("Conversion cancelled by user", "AbortError");
      }

      const percentStart = Math.round((i / chunks.length) * 100);
      updateProgress(percentStart, `Converting part ${i + 1} of ${chunks.length} (${percentStart}%)...`);

      const buffer = await synthesizeChunk(
        chunks[i],
        State.selectedVoice.gradioName,
        State.speedRate,
        State.abortController.signal
      );

      audioBuffers.push(buffer);

      const percentEnd = Math.round(((i + 1) / chunks.length) * 100);
      updateProgress(percentEnd, `Completed part ${i + 1} of ${chunks.length} (${percentEnd}%)`);
    }

    updateProgress(100, "Merging audio into final MP3 file...");
    const mergedMp3Blob = mergeAudioChunks(audioBuffers);
    State.currentAudioBlob = mergedMp3Blob;

    if (State.currentAudioUrl) {
      URL.revokeObjectURL(State.currentAudioUrl);
    }
    State.currentAudioUrl = URL.createObjectURL(mergedMp3Blob);

    // Load into audio player
    DOM.audioPlayer.src = State.currentAudioUrl;
    DOM.audioResultCard.classList.add("active");
    DOM.progressCard.classList.remove("active");

    // Save into Persistent History
    await saveToHistory(text, State.selectedVoice, State.speedRate, mergedMp3Blob);
    
    showToast("Voice generated successfully! Tap Play or Download.", "success");
    DOM.audioResultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

  } catch (err) {
    DOM.progressCard.classList.remove("active");
    if (err.name === "AbortError") {
      showToast("Conversion cancelled", "info");
    } else {
      console.error("Conversion failed:", err);
      showToast(`Error: ${err.message}`, "error");
    }
  } finally {
    State.isConverting = false;
    State.abortController = null;
    DOM.btnConvert.disabled = false;
    DOM.btnConvertText.textContent = "Convert to Audio";
  }
}

function cancelConversion() {
  if (State.abortController) {
    State.abortController.abort();
  }
}

function updateProgress(percent, statusText) {
  const clamped = Math.max(0, Math.min(100, percent));
  DOM.progressBarFill.style.width = `${clamped}%`;
  DOM.progressPercent.textContent = `${clamped}%`;
  if (statusText) {
    DOM.progressStatus.textContent = statusText;
  }
}

// --- 11. Download & Share ---
function downloadCurrentMp3() {
  if (!State.currentAudioBlob) {
    showToast("No audio generated yet", "error");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.-]/g, "").slice(0, 15);
  const filename = `Tamil_${State.selectedVoice.name}_${timestamp}.mp3`;

  const a = document.createElement("a");
  a.href = State.currentAudioUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast(`Downloading: ${filename}`, "success");
}

async function shareCurrentAudio() {
  if (!State.currentAudioBlob) {
    showToast("No audio to share", "error");
    return;
  }

  const filename = `Tamil_${State.selectedVoice.name}.mp3`;
  const file = new File([State.currentAudioBlob], filename, { type: "audio/mp3" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Tamil Voice Audio",
        text: "Audio converted using Edge TTS Tamil Voice App"
      });
      showToast("Shared successfully!", "success");
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Share error:", err);
      }
    }
  } else {
    // Fallback: download
    downloadCurrentMp3();
  }
}

// --- 12. History Management ---
async function saveToHistory(text, voice, speed, audioBlob) {
  const item = {
    text: text.slice(0, 300), // Preview text
    fullText: text,
    voiceId: voice.id,
    voiceName: voice.name,
    region: voice.region,
    flag: voice.flag,
    speed: speed,
    createdAt: Date.now(),
    audioBlob: audioBlob
  };

  try {
    await DB.saveItem(item);
    await loadHistory();
  } catch (err) {
    console.error("Failed to save to history:", err);
  }
}

async function loadHistory() {
  try {
    const items = await DB.getAllItems();
    DOM.historyCountBadge.textContent = items.length;
    DOM.historyList.innerHTML = "";

    if (items.length === 0) {
      DOM.historyList.innerHTML = `
        <div class="empty-history">
          <span class="icon">📜</span>
          <p>No previous conversions yet.</p>
          <span style="font-size:0.75rem; opacity:0.8;">Converted audios will be saved here automatically.</span>
        </div>
      `;
      return;
    }

    items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "history-item";

      const dateStr = new Date(item.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      el.innerHTML = `
        <div class="history-item-top">
          <span class="history-voice-badge">${item.flag || "🎙"} ${item.voiceName} (${item.region || ""})</span>
          <span class="history-date">${dateStr}</span>
        </div>
        <div class="history-text-preview">${escapeHtml(item.text)}</div>
        <div class="history-actions">
          <button class="history-btn btn-history-play" data-id="${item.id}">
            <span>▶</span> Play
          </button>
          <button class="history-btn btn-history-download" data-id="${item.id}">
            <span>📥</span> MP3
          </button>
          <button class="history-btn btn-history-load" data-id="${item.id}">
            <span>📋</span> Use Text
          </button>
          <button class="history-btn delete btn-history-delete" data-id="${item.id}">
            <span>🗑</span>
          </button>
        </div>
      `;

      // Play button
      el.querySelector(".btn-history-play").onclick = () => {
        playHistoryAudio(item);
      };

      // Download button
      el.querySelector(".btn-history-download").onclick = () => {
        downloadHistoryAudio(item);
      };

      // Load into textarea
      el.querySelector(".btn-history-load").onclick = () => {
        DOM.mainTextarea.value = item.fullText || item.text;
        updateTextStats();
        closeDrawer();
        showToast("Text loaded into editor", "info");
      };

      // Delete button
      el.querySelector(".btn-history-delete").onclick = async () => {
        if (confirm("Delete this saved audio?")) {
          await DB.deleteItem(item.id);
          await loadHistory();
          showToast("Item deleted", "info");
        }
      };

      DOM.historyList.appendChild(el);
    });

  } catch (err) {
    console.error("Failed to load history:", err);
  }
}

function playHistoryAudio(item) {
  if (!item.audioBlob) return;
  if (State.currentAudioUrl) {
    URL.revokeObjectURL(State.currentAudioUrl);
  }
  State.currentAudioBlob = item.audioBlob;
  State.currentAudioUrl = URL.createObjectURL(item.audioBlob);
  DOM.audioPlayer.src = State.currentAudioUrl;
  DOM.audioResultCard.classList.add("active");
  DOM.audioPlayer.play();
  closeDrawer();
  showToast(`Playing ${item.voiceName} audio`, "info");
}

function downloadHistoryAudio(item) {
  if (!item.audioBlob) return;
  const url = URL.createObjectURL(item.audioBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Tamil_${item.voiceName}_${item.id}.mp3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast("Downloading audio...", "success");
}

async function clearAllHistory() {
  if (confirm("Are you sure you want to delete all saved audio history?")) {
    await DB.clearAll();
    await loadHistory();
    showToast("History cleared", "info");
  }
}

// --- 13. Security App Lock (PIN Only) ---
function hashPin(pin) {
  // Lightweight hash for 4-digit PIN storage
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString();
}

function checkPinLockOnLaunch() {
  if (State.pinEnabled && State.pinHash) {
    openPinLockOverlay("UNLOCK");
  } else {
    State.isUnlocked = true;
  }
  updatePinStatusUI();
}

function updatePinStatusUI() {
  DOM.pinToggleInput.checked = State.pinEnabled;
  if (State.pinEnabled) {
    DOM.pinStatusBox.innerHTML = `<span>🔒</span> <span>PIN Protection is <strong>ACTIVE</strong></span>`;
    DOM.btnChangePin.style.display = "block";
    DOM.btnLockNow.style.display = "block";
  } else {
    DOM.pinStatusBox.innerHTML = `<span>🔓</span> <span>PIN Protection is <strong>OFF</strong></span>`;
    DOM.btnChangePin.style.display = "none";
    DOM.btnLockNow.style.display = "none";
  }
}

function openPinLockOverlay(mode = "UNLOCK") {
  State.pinEntered = "";
  State.pinSetupStep = mode; // 'UNLOCK' | 'CREATE' | 'CONFIRM'
  DOM.pinLockOverlay.classList.add("active");
  updatePinDots();

  if (mode === "UNLOCK") {
    DOM.pinLockTitle.textContent = "Enter App PIN";
    DOM.pinLockSubtitle.textContent = "Enter your 4-digit security PIN to unlock";
  } else if (mode === "CREATE") {
    DOM.pinLockTitle.textContent = "Set New PIN";
    DOM.pinLockSubtitle.textContent = "Choose a 4-digit PIN for your app";
  } else if (mode === "CONFIRM") {
    DOM.pinLockTitle.textContent = "Confirm PIN";
    DOM.pinLockSubtitle.textContent = "Re-enter your 4-digit PIN to confirm";
  }
}

function closePinLockOverlay() {
  DOM.pinLockOverlay.classList.remove("active");
  State.pinEntered = "";
  State.pinSetupStep = null;
  updatePinDots();
}

function handleKeypadInput(digit) {
  if (State.pinEntered.length >= 4) return;
  State.pinEntered += digit;
  updatePinDots();

  if (State.pinEntered.length === 4) {
    setTimeout(processPinEntry, 180);
  }
}

function handleKeypadBackspace() {
  if (State.pinEntered.length > 0) {
    State.pinEntered = State.pinEntered.slice(0, -1);
    updatePinDots();
  }
}

function handleKeypadClear() {
  State.pinEntered = "";
  updatePinDots();
}

function updatePinDots() {
  const dots = DOM.pinDotsRow.querySelectorAll(".pin-dot");
  dots.forEach((dot, index) => {
    if (index < State.pinEntered.length) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled", "error");
    }
  });
}

function shakePinDots() {
  const dots = DOM.pinDotsRow.querySelectorAll(".pin-dot");
  dots.forEach(d => d.classList.add("error"));
  DOM.pinDotsRow.classList.add("shake");
  if (navigator.vibrate) navigator.vibrate(200);

  setTimeout(() => {
    DOM.pinDotsRow.classList.remove("shake");
    State.pinEntered = "";
    updatePinDots();
  }, 500);
}

function processPinEntry() {
  const entered = State.pinEntered;

  if (State.pinSetupStep === "UNLOCK") {
    if (hashPin(entered) === State.pinHash) {
      State.isUnlocked = true;
      closePinLockOverlay();
      showToast("App Unlocked", "success");
    } else {
      shakePinDots();
      DOM.pinLockSubtitle.textContent = "Incorrect PIN. Try again.";
    }
  } else if (State.pinSetupStep === "CREATE") {
    State.pinTempCreate = entered;
    openPinLockOverlay("CONFIRM");
  } else if (State.pinSetupStep === "CONFIRM") {
    if (entered === State.pinTempCreate) {
      State.pinHash = hashPin(entered);
      State.pinEnabled = true;
      State.isUnlocked = true;
      localStorage.setItem("tts_pin_enabled", "true");
      localStorage.setItem("tts_pin_hash", State.pinHash);
      closePinLockOverlay();
      updatePinStatusUI();
      showToast("PIN Lock successfully enabled!", "success");
    } else {
      shakePinDots();
      DOM.pinLockSubtitle.textContent = "PINs do not match! Try again.";
      setTimeout(() => openPinLockOverlay("CREATE"), 600);
    }
  }
}

function togglePinLock(enabled) {
  if (enabled) {
    openPinLockOverlay("CREATE");
  } else {
    // Confirm PIN before disabling
    if (confirm("Disable PIN protection?")) {
      State.pinEnabled = false;
      State.pinHash = "";
      localStorage.removeItem("tts_pin_enabled");
      localStorage.removeItem("tts_pin_hash");
      updatePinStatusUI();
      showToast("PIN protection disabled", "info");
    } else {
      DOM.pinToggleInput.checked = true;
    }
  }
}

// Lock when app is minimized or switched away
document.addEventListener("visibilitychange", () => {
  if (document.hidden && State.pinEnabled && State.isUnlocked) {
    State.isUnlocked = false;
  } else if (!document.hidden && State.pinEnabled && !State.isUnlocked) {
    openPinLockOverlay("UNLOCK");
  }
});

// --- 14. Drawer Navigation ---
function openDrawer() {
  DOM.drawerBackdrop.classList.add("open");
  DOM.hamburgerDrawer.classList.add("open");
  loadHistory();
}

function closeDrawer() {
  DOM.drawerBackdrop.classList.remove("open");
  DOM.hamburgerDrawer.classList.remove("open");
}

function switchDrawerTab(tabName) {
  if (tabName === "history") {
    DOM.tabHistoryBtn.classList.add("active");
    DOM.tabLockBtn.classList.remove("active");
    DOM.tabHistoryContent.classList.add("active");
    DOM.tabLockContent.classList.remove("active");
    loadHistory();
  } else if (tabName === "lock") {
    DOM.tabLockBtn.classList.add("active");
    DOM.tabHistoryBtn.classList.remove("active");
    DOM.tabLockContent.classList.add("active");
    DOM.tabHistoryContent.classList.remove("active");
  }
}

// --- 15. Text Helpers & Stats ---
function updateTextStats() {
  const text = DOM.mainTextarea.value;
  DOM.charCount.textContent = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  DOM.wordCount.textContent = words;
}

function insertSampleTamil() {
  const sample = `வணக்கம்! தமிழ் எங்கள் உயர்வுக்கு வான், இன்பத் தமிழ் எங்கள் அசதிக்கு சுடர் தந்த தேன். 
யாதும் ஊரே யாவரும் கேளிர்; தீதும் நன்றும் பிறர்தர வாரா. 

இந்த செயலி மூலம் நீங்கள் எவ்வளவு பெரிய தமிழ் உரையையும் மிக எளிதாக இனிய தமிழ் பெண்குரலில் கேட்டு மகிழலாம் மற்றும் எம்பி3 (MP3) வடிவில் பதிவிறக்கம் செய்துகொள்ளலாம்.`;
  DOM.mainTextarea.value = sample;
  updateTextStats();
  showToast("Sample Tamil text loaded", "info");
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      DOM.mainTextarea.value = text;
      updateTextStats();
      showToast("Pasted from clipboard", "info");
    }
  } catch (err) {
    showToast("Clipboard access denied or unavailable", "error");
  }
}

function clearText() {
  DOM.mainTextarea.value = "";
  updateTextStats();
}

function updateSpeed() {
  const val = parseInt(DOM.speedSlider.value, 10);
  State.speedRate = val;
  
  let label = "1.0x Normal";
  if (val > 0) {
    const factor = (1 + (val / 100)).toFixed(2);
    label = `+${val}% (${factor}x Fast)`;
  } else if (val < 0) {
    const factor = (1 + (val / 100)).toFixed(2);
    label = `${val}% (${factor}x Slow)`;
  }
  DOM.speedBadge.textContent = label;
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- 16. Event Listeners Setup ---
function setupEventListeners() {
  // Theme Toggle
  DOM.themeToggleBtn.addEventListener("click", toggleTheme);

  // Voice Selection
  DOM.voiceSelect.addEventListener("change", updateVoiceDetails);

  // Textarea input
  DOM.mainTextarea.addEventListener("input", updateTextStats);
  DOM.btnPaste.addEventListener("click", pasteFromClipboard);
  DOM.btnClear.addEventListener("click", clearText);
  DOM.btnSample.addEventListener("click", insertSampleTamil);

  // Speed Slider
  DOM.speedSlider.addEventListener("input", updateSpeed);

  // Convert & Cancel
  DOM.btnConvert.addEventListener("click", startConversion);
  DOM.btnCancelConvert.addEventListener("click", cancelConversion);

  // Audio Result Actions
  DOM.btnDownloadMp3.addEventListener("click", downloadCurrentMp3);
  DOM.btnShareAudio.addEventListener("click", shareCurrentAudio);

  // Drawer Controls
  DOM.btnHamburger.addEventListener("click", openDrawer);
  DOM.btnCloseDrawer.addEventListener("click", closeDrawer);
  DOM.drawerBackdrop.addEventListener("click", closeDrawer);
  DOM.tabHistoryBtn.addEventListener("click", () => switchDrawerTab("history"));
  DOM.tabLockBtn.addEventListener("click", () => switchDrawerTab("lock"));
  DOM.btnClearHistory.addEventListener("click", clearAllHistory);

  // PIN Lock Controls
  DOM.pinToggleInput.addEventListener("change", (e) => togglePinLock(e.target.checked));
  DOM.btnChangePin.addEventListener("click", () => openPinLockOverlay("CREATE"));
  DOM.btnLockNow.addEventListener("click", () => {
    closeDrawer();
    State.isUnlocked = false;
    openPinLockOverlay("UNLOCK");
    showToast("App Locked", "info");
  });

  // Numeric Keypad Click Handling
  DOM.keypadGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".keypad-btn");
    if (!btn) return;
    const action = btn.dataset.action;
    const val = btn.dataset.val;

    if (action === "clear") {
      handleKeypadClear();
    } else if (action === "backspace") {
      handleKeypadBackspace();
    } else if (val) {
      handleKeypadInput(val);
    }
  });

  // Keyboard support for PIN entry
  window.addEventListener("keydown", (e) => {
    if (!DOM.pinLockOverlay.classList.contains("active")) return;
    if (e.key >= "0" && e.key <= "9") {
      handleKeypadInput(e.key);
    } else if (e.key === "Backspace") {
      handleKeypadBackspace();
    } else if (e.key === "Escape") {
      handleKeypadClear();
    }
  });
}

// --- 17. Initialization ---
window.addEventListener("DOMContentLoaded", async () => {
  applyTheme(State.theme);
  populateVoiceSelect();
  updateSpeed();
  updateTextStats();
  setupEventListeners();

  try {
    await DB.init();
    await loadHistory();
  } catch (e) {
    console.warn("DB init warning:", e);
  }

  checkPinLockOnLaunch();
});
