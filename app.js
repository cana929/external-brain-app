/* ============================================================
   我的外置大脑 v2 —— 记录 / 四板块待办 / 日历复盘 / 习惯
   数据层兼容 v1（schemaVersion 3 -> 4），旧数据全部保留
   ============================================================ */

const DB_NAME = "external-brain-db";
const DB_VERSION = 1;
const STORE_NAME = "appState";
const STATE_KEY = "singleton";

const emotionOptions = [
  { value: 1, label: "狂喜", color: "#F7A8B8", img: "./assets/emotion-1.jpg" },
  { value: 2, label: "愉悦", color: "#F6C98A", img: "./assets/emotion-2.jpg" },
  { value: 3, label: "疲惫", color: "#A9C8B9", img: "./assets/emotion-3.jpg" },
  { value: 4, label: "生气", color: "#E89888", img: "./assets/emotion-4.jpg" },
  { value: 5, label: "伤心", color: "#9FB8D8", img: "./assets/emotion-5.jpg" },
  { value: 6, label: "绝望", color: "#B9A7C9", img: "./assets/emotion-6.jpg" }
];

/* v4：旧情绪体系（1-6 = 崩溃/失控/低落/平和/愉悦/狂喜）→ 新体系（1-6 = 狂喜/愉悦/疲惫/生气/伤心/绝望）语义映射 */
const LEGACY_EMOTION_MAP = { 1: 6, 2: 4, 3: 5, 4: 2, 5: 2, 6: 1 };

const BOARD_DEFS = [
  { key: "study", label: "学习", icon: "📚" },
  { key: "work", label: "工作", icon: "💼" },
  { key: "life", label: "生活", icon: "🏠" },
  { key: "other", label: "其他", icon: "📌" }
];

const app = {
  state: null,
  activeScreen: "today",
  selectedDate: localDateString(),
  activeBoardKey: "study",
  boardQuery: "",
  editingBoardId: "",
  calendarMonth: localDateString().slice(0, 7),
  calendarSelectedDate: localDateString(),
  habitMonth: localDateString().slice(0, 7),
  knowledgeFilter: { query: "", category: "", path: "", status: "", starredOnly: false },
  searchQuery: "",
  searchDate: "",
  emotionWindowDays: 7,
  expandedContactId: ""
};

const nodes = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheNodes();
  bindGlobalEvents();
  await registerServiceWorker();
  app.state = await loadState();
  maybeSeedSampleData();
  renderAll();
  maybeAutoBackup();
  maybeSurfaceReminder();
});

/* ============ 数据层 ============ */

function createDefaultState() {
  return {
    schemaVersion: 5,
    meta: {
      lastBackupAt: "",
      installedAt: new Date().toISOString()
    },
    settings: {
      reminderDailyTime: "22:00",
      autoBackupDays: 7,
      notificationPermissionAskedAt: ""
    },
    records: [],
    emotions: [],
    habits: [],
    habitLogs: [],
    contacts: [],
    bundles: [],
    tasks: [],
    projects: [],
    knowledge: [],
    reviews: [],
    trash: [],
    backupLogs: [],
    boards: { study: [], work: [], life: [], other: [] },
    weeklyReviews: {},
    experienceCategories: []
  };
}

function normalizeState(data) {
  const defaults = createDefaultState();
  const normalized = {
    ...defaults,
    ...data,
    schemaVersion: Math.max(5, Number(data?.schemaVersion || 1)),
    settings: { ...defaults.settings, ...(data.settings || {}) },
    meta: { ...defaults.meta, ...(data.meta || {}) }
  };

  normalized.records = normalizeEntityList(normalized.records, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    tags: [],
    relatedBundleId: "",
    relatedHabitId: ""
  });
  normalized.emotions = normalizeEntityList(normalized.emotions, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    note: ""
  });
  normalized.habits = normalizeEntityList(normalized.habits, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    frequency: "daily",
    reminderTime: "",
    category: "",
    target: ""
  });
  normalized.habitLogs = normalizeEntityList(normalized.habitLogs, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    status: "",
    type: ""
  });
  normalized.contacts = normalizeEntityList(normalized.contacts, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    title: "",
    relationTags: [],
    impression: "",
    relation: "",
    contactInfo: "",
    birthday: "",
    note: ""
  });
  normalized.bundles = normalizeEntityList(normalized.bundles, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    note: ""
  });
  normalized.tasks = normalizeEntityList(normalized.tasks, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    postponeCount: 0,
    postponeHistory: [],
    targetDeadline: "",
    progressLogs: []
  });
  normalized.projects = normalizeEntityList(normalized.projects, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    yearlyGoal: "",
    weeklyFocus: "",
    nextAction: "",
    infoInbox: "",
    notes: "",
    relatedContactIds: [],
    projectInfoItems: [],
    projectNoteItems: []
  }).map((project) => ({
    ...project,
    relatedContactIds: Array.isArray(project.relatedContactIds) ? project.relatedContactIds : [],
    projectInfoItems: Array.isArray(project.projectInfoItems) ? project.projectInfoItems : [],
    projectNoteItems: Array.isArray(project.projectNoteItems) ? project.projectNoteItems : []
  }));
  normalized.knowledge = normalizeEntityList(normalized.knowledge, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    tags: [],
    starred: false,
    status: "待验证"
  });
  normalized.reviews = normalizeEntityList(normalized.reviews, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    skipped: false
  });
  normalized.trash = normalizeEntityList(normalized.trash, {
    updatedAt: "",
    deletedAt: "",
    version: 1
  });
  normalized.backupLogs = normalizeEntityList(normalized.backupLogs, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    type: "backup",
    filename: "",
    trigger: "",
    status: "done"
  });
  normalized.boards = {
    study: normalizeEntityList(normalized.boards?.study, { updatedAt: "", deletedAt: "", version: 1, done: false, content: "" }),
    work: normalizeEntityList(normalized.boards?.work, { updatedAt: "", deletedAt: "", version: 1, done: false, content: "" }),
    life: normalizeEntityList(normalized.boards?.life, { updatedAt: "", deletedAt: "", version: 1, done: false, content: "" }),
    other: normalizeEntityList(normalized.boards?.other, { updatedAt: "", deletedAt: "", version: 1, done: false, content: "" })
  };
  normalized.experienceCategories = buildExperienceCategories(normalized.knowledge, normalized.experienceCategories);

  /* v4 迁移：旧情绪体系（schemaVersion < 5 时，1-6=崩溃/失控/低落/平和/愉悦/狂喜）映射到新 6 情绪 */
  if (Number(data?.schemaVersion || 1) < 5) {
    normalized.emotions = normalized.emotions.map((item) => ({
      ...item,
      level: LEGACY_EMOTION_MAP[item.level] ?? item.level
    }));
  }

  return normalized;
}

function normalizeEntityList(list, defaults) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const createdAt = item?.createdAt || item?.deletedAt || new Date().toISOString();
    return {
      id: item?.id || uid(),
      createdAt,
      updatedAt: item?.updatedAt || "",
      deletedAt: item?.deletedAt || "",
      version: Number(item?.version || 1),
      ...defaults,
      ...item
    };
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadState() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const get = store.get(STATE_KEY);
      get.onsuccess = () => {
        const raw = get.result;
        resolve(raw ? normalizeState(raw) : normalizeState(createDefaultState()));
      };
      get.onerror = () => reject(get.error);
    });
  } catch (error) {
    console.error(error);
    return normalizeState(createDefaultState());
  }
}

async function saveState() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(app.state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function maybeSeedSampleData() {
  const hasAnything =
    app.state.records.length ||
    app.state.habits.length ||
    app.state.contacts.length ||
    app.state.knowledge.length ||
    app.state.reviews.length ||
    Object.values(app.state.boards).some((list) => list.length);
  if (hasAnything) {
    return;
  }
  const now = new Date().toISOString();
  app.state.records.push({
    id: uid(),
    date: localDateString(),
    content: "欢迎来到你的外置大脑。这里的每一条记录，都会成为之后复盘的素材。",
    tags: [],
    relatedBundleId: "",
    relatedHabitId: "",
    createdAt: now,
    updatedAt: now,
    version: 1
  });
  app.state.habits.push({
    id: uid(),
    name: "睡前复盘",
    frequency: "daily",
    reminderTime: "",
    category: "",
    target: "",
    createdAt: now,
    updatedAt: now,
    version: 1
  });
  saveState();
}

/* ============ 工具函数 ============ */

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function getMonthDays(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function getWeekdayOffset(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return (date.getDay() + 6) % 7;
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function formatLongDate(date = new Date()) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTime(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function splitTags(text) {
  return String(text || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => `"${String(row[header] ?? "").replaceAll('"', '""')}"`).join(",")
    )
  ];
  return `\ufeff${csvRows.join("\n")}`;
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  nodes.toast.textContent = message;
  nodes.toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => nodes.toast.classList.add("hidden"), 2200);
}

function renderCollection(container, items, renderer) {
  if (!items.length) {
    container.innerHTML = document.querySelector("#emptyStateTemplate").innerHTML;
    return;
  }
  container.innerHTML = items.map(renderer).join("");
}

function moveToTrash(kind, payload) {
  app.state.trash.unshift({
    id: uid(),
    kind,
    deletedAt: new Date().toISOString(),
    payload
  });
}

function trashKindLabel(kind) {
  return { record: "记录", habit: "习惯", contact: "人物", knowledge: "经验", "board-item": "待办", task: "任务", bundle: "事件包", project: "项目" }[kind] || "内容";
}

function changeSelectedDate(delta) {
  app.selectedDate = addDays(app.selectedDate, delta);
  renderAll();
}

/* ============ 情绪 ============ */

function getEmotionByDate(date) {
  const entry = app.state.emotions.find((item) => item.date === date);
  if (!entry) {
    return null;
  }
  const config = emotionOptions.find((option) => option.value === entry.level);
  return { ...entry, ...config };
}

function getEmotionTrend(days) {
  const dates = Array.from({ length: days }, (_, index) => addDays(localDateString(), -index));
  const set = new Set(dates);
  const emotions = app.state.emotions.filter((item) => set.has(item.date));
  const counts = {};
  emotions.forEach((item) => {
    counts[item.level] = (counts[item.level] || 0) + 1;
  });
  return { counts, emotions };
}

/* ============ 习惯 ============ */

function setHabitStatus(habitId, status, date = localDateString()) {
  app.state.habitLogs = app.state.habitLogs.filter((item) => !(item.habitId === habitId && item.date === date));
  app.state.habitLogs.push({
    id: uid(),
    habitId,
    date,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: ""
  });
}

function clearHabitStatus(habitId, date) {
  app.state.habitLogs = app.state.habitLogs.filter((item) => !(item.habitId === habitId && item.date === date));
}

function getHabitStatus(habitId, date) {
  return app.state.habitLogs.find((item) => item.habitId === habitId && item.date === date)?.status || "";
}

function computeStreak(habitId) {
  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 365; index += 1) {
    const date = localDateString(cursor);
    const status = getHabitStatus(habitId, date);
    if (status === "done" || status === "miss" || status === "patched") {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }
  return streak;
}

function getHabitMonthStats(habitId, monthKey) {
  const logs = app.state.habitLogs.filter((item) => item.habitId === habitId && item.date.startsWith(monthKey));
  const doneCount = logs.filter((item) => item.status === "done").length;
  const patchedCount = logs.filter((item) => item.status === "patched").length;
  const missCount = logs.filter((item) => item.status === "miss").length;
  const trackedDays = getMonthDays(monthKey);
  const completionRate = trackedDays ? Math.round(((doneCount + patchedCount) / trackedDays) * 100) : 0;
  return { doneCount, patchedCount, missCount, trackedDays, completionRate };
}

function renderHabitCalendar(habitId, monthKey) {
  const days = getMonthDays(monthKey);
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
  const firstDay = getWeekdayOffset(`${monthKey}-01`);
  const cells = [];
  for (let index = 0; index < firstDay; index += 1) {
    cells.push(`<div class="calendar-day outside"></div>`);
  }
  for (let day = 1; day <= days; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const status = getHabitStatus(habitId, date);
    const label = status === "done" ? "✓" : status === "miss" ? "×" : status === "patched" ? "补" : "";
    cells.push(`
      <button class="calendar-day ${status || "empty"} ${date === localDateString() ? "is-today" : ""}" data-habit-calendar="true" data-habit-id="${habitId}" data-habit-date="${date}">
        <span>${day}</span>
        <small>${label}</small>
      </button>
    `);
  }
  return `
    <div class="calendar-head">
      ${weekdays.map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
    </div>
    <div class="calendar-grid">
      ${cells.join("")}
    </div>
  `;
}

async function handleHabitCalendarClick(habitId, date) {
  const current = getHabitStatus(habitId, date);
  const next = current === "" ? "done" : current === "done" ? "miss" : current === "miss" ? "patched" : "";
  if (next) {
    setHabitStatus(habitId, next, date);
  } else {
    clearHabitStatus(habitId, date);
  }
  await saveState();
  renderAll();
}

async function handleHabitManage(action, habitId) {
  const habit = app.state.habits.find((item) => item.id === habitId);
  if (!habit) {
    return;
  }

  if (action === "edit") {
    openEntryModal("habit", habit);
    return;
  }

  if (action === "delete") {
    if (!confirm(`确定删除习惯「${habit.name}」吗？对应打卡记录也会一起删除。`)) {
      return;
    }
    moveToTrash("habit", {
      item: structuredClone(habit),
      logs: app.state.habitLogs.filter((item) => item.habitId === habitId)
    });
    app.state.habits = app.state.habits.filter((item) => item.id !== habitId);
    app.state.habitLogs = app.state.habitLogs.filter((item) => item.habitId !== habitId);
    await saveState();
    renderAll();
    showToast("习惯已移入回收站");
    return;
  }

  if (action === "patch") {
    const targetDate = prompt("请输入要补卡的日期（格式：2026-08-27）", localDateString());
    if (!targetDate) {
      return;
    }
    if (!isValidDateString(targetDate)) {
      alert("日期格式不对，请按 2026-08-27 填写。");
      return;
    }
    setHabitStatus(habitId, "patched", targetDate);
    await saveState();
    renderAll();
    return;
  }

  if (action === "clear") {
    const targetDate = prompt("请输入要清空记录的日期（格式：2026-08-27）", localDateString());
    if (!targetDate) {
      return;
    }
    if (!isValidDateString(targetDate)) {
      alert("日期格式不对，请按 2026-08-27 填写。");
      return;
    }
    clearHabitStatus(habitId, targetDate);
    await saveState();
    renderAll();
    return;
  }

  reorderItem(app.state.habits, habitId, action);
  await saveState();
  renderAll();
}

function reorderItem(list, id, action) {
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) {
    return;
  }
  const [item] = list.splice(index, 1);
  if (action === "top") {
    list.unshift(item);
  } else if (action === "up") {
    list.splice(Math.max(0, index - 1), 0, item);
  } else if (action === "down") {
    list.splice(Math.min(list.length, index + 1), 0, item);
  }
}

/* ============ 四板块待办 ============ */

function getBoardList(boardKey = app.activeBoardKey) {
  return app.state.boards[boardKey] || [];
}

function boardLabel(boardKey) {
  return BOARD_DEFS.find((item) => item.key === boardKey)?.label || boardKey;
}

async function addBoardTodo(content) {
  const text = String(content || "").trim();
  if (!text) {
    return;
  }
  const now = new Date().toISOString();
  getBoardList().push({
    id: uid(),
    content: text,
    done: false,
    createdAt: now,
    updatedAt: now,
    version: 1
  });
  await saveState();
  renderProjects();
}

async function setBoardDone(id, done) {
  const item = getBoardList().find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  item.done = done;
  item.updatedAt = new Date().toISOString();
  await saveState();
  renderProjects();
  showToast(done ? "已标记完成" : "已恢复未完成");
}

async function commitBoardEdit(id, content) {
  const item = getBoardList().find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  item.content = String(content || "").trim();
  item.updatedAt = new Date().toISOString();
  await saveState();
  renderProjects();
}

async function deleteBoardTodo(id) {
  const item = getBoardList().find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  if (!confirm(`确定删除这条待办吗？`)) {
    return;
  }
  moveToTrash("board-item", { item: structuredClone(item), boardKey: app.activeBoardKey });
  app.state.boards[app.activeBoardKey] = getBoardList().filter((entry) => entry.id !== id);
  await saveState();
  renderProjects();
  showToast("待办已移入回收站");
}

function renderProjects() {
  renderBoardSearchCard();
  if (app.boardQuery.trim()) {
    renderBoardSearchResults();
  } else {
    renderActiveBoard();
  }
}

function renderBoardSearchCard() {
  const counts = BOARD_DEFS.map((board) => ({
    ...board,
    open: getBoardList(board.key).filter((item) => !item.done).length,
    done: getBoardList(board.key).filter((item) => item.done).length
  }));
  nodes.boardSearchCard.innerHTML = `
    <div class="section-head">
      <h2>四板块待办</h2>
      <span class="subtle">右滑完成 · 拖动排序</span>
    </div>
    <div class="board-tabs">
      ${counts.map((board) => `
        <button class="board-tab ${app.activeBoardKey === board.key ? "is-active" : ""}" data-board-key="${board.key}">
          <span>${board.icon} ${board.label}</span>
          <small>${board.open}${board.done ? ` / ${board.done}` : ""}</small>
        </button>
      `).join("")}
    </div>
    <div class="board-search-row">
      <input id="boardSearchInput" type="search" placeholder="搜索任意板块的待办…" value="${escapeHtml(app.boardQuery)}">
    </div>
  `;
  nodes.boardSearchCard.querySelectorAll("[data-board-key]").forEach((button) => {
    button.addEventListener("click", () => {
      app.activeBoardKey = button.dataset.boardKey;
      app.boardQuery = "";
      renderProjects();
    });
  });
  document.querySelector("#boardSearchInput").addEventListener("input", (event) => {
    app.boardQuery = event.target.value.trim();
    renderProjects();
  });
}

function renderActiveBoard() {
  const list = getBoardList();
  const openItems = list.filter((item) => !item.done);
  const doneItems = list.filter((item) => item.done);
  nodes.boardCard.innerHTML = `
    <div class="section-head">
      <h2>${BOARD_DEFS.find((b) => b.key === app.activeBoardKey)?.icon || ""} ${boardLabel(app.activeBoardKey)}</h2>
      <span class="subtle">${openItems.length} 未完成 · ${doneItems.length} 已完成</span>
    </div>
    <div class="board-add-row">
      <input id="boardAddInput" type="text" placeholder="快速添加一条待办，回车保存…" maxlength="500">
      <button class="primary-button" id="boardAddBtn" type="button">添加</button>
    </div>
    <div class="board-list" id="boardOpenList">
      ${openItems.length ? openItems.map((item) => renderBoardTodoRow(item)).join("") : `
        <div class="empty-state">
          <p class="empty-title">这个板块还没有待办</p>
          <p class="empty-text">在上方输入内容，回车即可创建。</p>
        </div>
      `}
    </div>
    ${doneItems.length ? `
      <div class="board-done-head">
        <span>已完成</span>
        <small>${doneItems.length} 条（向左滑可恢复）</small>
      </div>
      <div class="board-list is-done" id="boardDoneList">
        ${doneItems.map((item) => renderBoardTodoRow(item)).join("")}
      </div>
    ` : ""}
  `;

  document.querySelector("#boardAddInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addBoardTodo(event.target.value);
    }
  });
  document.querySelector("#boardAddBtn").addEventListener("click", () => {
    const input = document.querySelector("#boardAddInput");
    addBoardTodo(input.value);
  });
  bindBoardRows(nodes.boardCard);
}

function renderBoardTodoRow(item) {
  const isEditing = app.editingBoardId === item.id;
  const content = isEditing
    ? `
      <input class="board-edit-input" data-board-edit-input="${item.id}" value="${escapeHtml(item.content)}" maxlength="500">
    `
    : `<span class="todo-content">${escapeHtml(item.content)}</span>`;
  return `
    <div class="todo-row ${item.done ? "is-done" : ""}" data-todo-id="${item.id}" data-done="${item.done ? "true" : "false"}">
      ${item.done ? "" : `<span class="drag-handle" data-drag-handle="${item.id}" title="按住拖动排序">⠿</span>`}
      <div class="todo-main">
        ${content}
        <div class="todo-actions">
          ${isEditing ? `
            <button class="chip-button" data-board-manage="save-edit" data-todo-id="${item.id}">保存</button>
            <button class="chip-button" data-board-manage="cancel-edit" data-todo-id="${item.id}">取消</button>
          ` : `
            <button class="chip-button" data-board-manage="done" data-todo-id="${item.id}">${item.done ? "恢复" : "完成"}</button>
            <button class="chip-button" data-board-manage="edit" data-todo-id="${item.id}">编辑</button>
            <button class="chip-button" data-board-manage="delete" data-todo-id="${item.id}">删除</button>
          `}
        </div>
      </div>
    </div>
  `;
}

function bindBoardRows(container) {
  container.querySelectorAll("[data-board-manage]").forEach((button) => {
    button.addEventListener("click", () => handleBoardManage(button.dataset.boardManage, button.dataset.todoId));
  });
  container.querySelectorAll("[data-board-edit-input]").forEach((input) => {
    input.focus();
    input.select();
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        commitBoardEdit(input.dataset.boardEditInput, input.value);
      }
      if (event.key === "Escape") {
        app.editingBoardId = "";
        renderProjects();
      }
    });
    input.addEventListener("blur", () => {
      if (app.editingBoardId === input.dataset.boardEditInput) {
        commitBoardEdit(input.dataset.boardEditInput, input.value);
      }
    });
  });
  initBoardInteractions(container);
}

async function handleBoardManage(action, id) {
  if (action === "done") {
    const item = getBoardList().find((entry) => entry.id === id);
    await setBoardDone(id, !item?.done);
    return;
  }
  const item = getBoardList().find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  if (action === "edit") {
    app.editingBoardId = id;
    renderProjects();
    return;
  }
  if (action === "save-edit") {
    const input = document.querySelector(`[data-board-edit-input="${id}"]`);
    await commitBoardEdit(id, input?.value || item.content);
    return;
  }
  if (action === "cancel-edit") {
    app.editingBoardId = "";
    renderProjects();
    return;
  }
  if (action === "delete") {
    await deleteBoardTodo(id);
  }
}

/* 拖拽排序（指针事件，鼠标/触屏通用） */
function initBoardInteractions(container) {
  const listEl = document.querySelector("#boardOpenList");
  if (!listEl) {
    return;
  }
  let dragId = "";
  let pointerId = null;
  let draggingRow = null;

  listEl.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle) {
      return;
    }
    const row = handle.closest("[data-todo-id]");
    if (!row) {
      return;
    }
    event.preventDefault();
    dragId = row.dataset.todoId;
    pointerId = event.pointerId;
    draggingRow = row;
    row.classList.add("is-dragging");
    try {
      row.setPointerCapture(pointerId);
    } catch (error) {
      /* ignore */
    }
  });

  listEl.addEventListener("pointermove", (event) => {
    if (!dragId || event.pointerId !== pointerId || !draggingRow) {
      return;
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-todo-id]");
    if (!target || target.dataset.todoId === dragId) {
      return;
    }
    const list = getBoardList();
    const fromIndex = list.findIndex((item) => item.id === dragId);
    const toIndex = list.findIndex((item) => item.id === target.dataset.todoId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return;
    }
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    if (fromIndex < toIndex) {
      target.after(draggingRow);
    } else {
      target.before(draggingRow);
    }
  });

  const endDrag = async (event) => {
    if (!dragId) {
      return;
    }
    if (event.pointerId === pointerId || !event.pointerId) {
      draggingRow?.classList.remove("is-dragging");
      dragId = "";
      pointerId = null;
      draggingRow = null;
      await saveState();
      renderProjects();
    }
  };
  listEl.addEventListener("pointerup", endDrag);
  listEl.addEventListener("pointercancel", endDrag);

  /* 右滑完成 / 左滑恢复 */
  let swipe = null;
  container.addEventListener("pointerdown", (event) => {
    const row = event.target.closest("[data-todo-id]");
    if (!row || event.target.closest("button") || event.target.closest("[data-drag-handle]") || event.target.closest("input")) {
      return;
    }
    swipe = {
      id: row.dataset.todoId,
      x: event.clientX,
      y: event.clientY,
      done: row.dataset.done === "true"
    };
  });
  container.addEventListener("pointerup", async (event) => {
    if (!swipe) {
      return;
    }
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx > 0 && !swipe.done) {
        await setBoardDone(swipe.id, true);
      } else if (dx < 0 && swipe.done) {
        await setBoardDone(swipe.id, false);
      }
    }
    swipe = null;
  });
  container.addEventListener("pointercancel", () => {
    swipe = null;
  });
}

/* 跨板块搜索 */
function renderBoardSearchResults() {
  const query = app.boardQuery.trim().toLowerCase();
  const results = [];
  BOARD_DEFS.forEach((board) => {
    getBoardList(board.key).forEach((item) => {
      if (item.content.toLowerCase().includes(query)) {
        results.push({ boardKey: board.key, item });
      }
    });
  });
  nodes.boardCard.innerHTML = `
    <div class="section-head">
      <h2>搜索结果</h2>
      <span class="subtle">${results.length} 条匹配</span>
    </div>
    <div class="list">
      ${results.length ? results.map((entry) => `
        <div class="todo-row ${entry.item.done ? "is-done" : ""}">
          <div class="todo-main">
            <span class="todo-content">${escapeHtml(entry.item.content)}</span>
            <div class="todo-actions">
              <span class="mini-pill">${boardLabel(entry.boardKey)}</span>
              <span class="mini-pill">${entry.item.done ? "已完成" : "未完成"}</span>
              <button class="chip-button" data-locate-board="${entry.boardKey}" data-locate-id="${entry.item.id}">定位</button>
            </div>
          </div>
        </div>
      `).join("") : `
        <div class="empty-state">
          <p class="empty-title">没有匹配的待办</p>
          <p class="empty-text">换个关键词试试。</p>
        </div>
      `}
    </div>
  `;
  nodes.boardCard.querySelectorAll("[data-locate-board]").forEach((button) => {
    button.addEventListener("click", () => {
      const boardKey = button.dataset.locateBoard;
      const id = button.dataset.locateId;
      app.activeBoardKey = boardKey;
      app.boardQuery = "";
      renderProjects();
      requestAnimationFrame(() => {
        const row = document.querySelector(`[data-todo-id="${id}"]`);
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        row?.classList.add("is-flash");
        setTimeout(() => row?.classList.remove("is-flash"), 1600);
      });
    });
  });
}

/* ============ 周度复盘 ============ */

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function getWeekMonday(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay() || 7; // 周一=1 … 周日=7
  date.setDate(date.getDate() - (weekday - 1));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortDate(dateString) {
  const [, month, day] = dateString.split("-").map(Number);
  return `${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
}

function weekdayLabelOf(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay() || 7;
  return WEEKDAY_LABELS[weekday - 1];
}

function renderWeeklyReview() {
  const today = localDateString();
  const monday = getWeekMonday(today);
  const weekLabel = `${formatShortDate(monday)} – ${formatShortDate(addDays(monday, 6))}`;
  const weekKey = monday;
  const summary = app.state.weeklyReviews?.[weekKey] || { content: "", updatedAt: "" };

  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    days.push(addDays(today, -offset));
  }

  const rows = days.map((date) => {
    const emotion = getEmotionByDate(date);
    const records = app.state.records.filter((item) => item.date === date);
    return `
      <div class="weekly-row">
        <div class="weekly-date">
          <span class="weekly-daynum">${formatShortDate(date)}</span>
          <span class="weekly-weekday">${weekdayLabelOf(date)}</span>
          ${emotion ? `<img class="weekly-face" src="${emotion.img}" alt="${emotion.label}">` : ""}
        </div>
        <div class="weekly-body">
          ${records.length ? records.map((record) => `
            <div class="weekly-record">
              <span class="weekly-record-text">${escapeHtml(record.content)}</span>
              <span class="timestamp">${formatTime(record.createdAt)}</span>
            </div>
          `).join("") : `<span class="weekly-empty">无记录</span>`}
        </div>
      </div>
    `;
  }).join("");

  nodes.weeklyReviewCard.innerHTML = `
    <div class="section-head">
      <h2>周度复盘 <img class="mascot-inline" src="./assets/review-mascot.jpg" alt="复盘"></h2>
      <span class="pill">最近 7 天</span>
    </div>
    <div class="weekly-week-range">${weekLabel} · ${weekdayLabelOf(today)}</div>
    <div class="weekly-list">
      ${rows}
    </div>
    <div class="weekly-summary">
      <div class="section-head">
        <h3>周度复盘小结</h3>
        <button class="chip-button" id="weeklySaveBtn">保存小结</button>
      </div>
      <textarea id="weeklySummaryInput" class="weekly-summary-input" rows="4" placeholder="回顾这七天：收获、问题、下一步……">${escapeHtml(summary.content)}</textarea>
      <p class="note" id="weeklySaveNote">${summary.updatedAt ? `已保存于 ${formatTime(summary.updatedAt)}` : "写下本周小结，自动保存在本机，跨月不丢。"}</p>
    </div>
  `;
  document.querySelector("#weeklySaveBtn").addEventListener("click", () => {
    const content = document.querySelector("#weeklySummaryInput").value.trim();
    app.state.weeklyReviews = app.state.weeklyReviews || {};
    if (content) {
      app.state.weeklyReviews[weekKey] = { content, updatedAt: new Date().toISOString() };
    } else {
      delete app.state.weeklyReviews[weekKey];
    }
    saveState();
    showToast(content ? "周度小结已保存" : "已清空本周小结");
    renderWeeklyReview();
  });
}

/* ============ 复盘日历 ============ */

function renderReviews() {
  renderWeeklyReview();
  renderReviewCalendar();
  renderReviewDay();
}

function getDayCalendarData(date) {
  const emotion = getEmotionByDate(date);
  const records = app.state.records.filter((item) => item.date === date);
  return { emotion, records };
}

function renderReviewCalendar() {
  const [year, month] = app.calendarMonth.split("-").map(Number);
  const days = getMonthDays(app.calendarMonth);
  const firstOffset = getWeekdayOffset(`${app.calendarMonth}-01`);
  const isCurrentMonth = app.calendarMonth === localDateString().slice(0, 7);
  const cells = [];
  for (let index = 0; index < firstOffset; index += 1) {
    cells.push(`<div class="cal-cell outside"></div>`);
  }
  for (let day = 1; day <= days; day += 1) {
    const date = `${app.calendarMonth}-${String(day).padStart(2, "0")}`;
    const { emotion, records } = getDayCalendarData(date);
    const isToday = date === localDateString();
    const isSelected = date === app.calendarSelectedDate;
    const style = emotion ? `style="--cell-tint:${emotion.color}66;background:linear-gradient(180deg,${emotion.color}52,rgba(13,18,34,.25))"` : "";
    cells.push(`
      <button class="cal-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${records.length ? "has-content" : ""}" data-cal-date="${date}" ${style}>
        <span class="cal-day-num">${day}</span>
        ${emotion ? `<img class="cal-face" src="${emotion.img}" alt="${emotion.label}">` : ""}
        <span class="cal-snippet">${records.length ? `${records.length}条${records[0].content ? " · " + truncate(records[0].content, 8) : ""}` : ""}</span>
      </button>
    `);
  }
  nodes.reviewCalendarCard.innerHTML = `
    <div class="section-head">
      <h2>日历复盘</h2>
      ${isCurrentMonth ? "" : `<button class="text-button" id="calendarBackTodayBtn">回到今天</button>`}
    </div>
    <div class="month-switcher">
      <button class="chip-button" id="calendarPrevMonthBtn">‹ 上月</button>
      <span class="month-label">${year}年${month}月</span>
      <button class="chip-button" id="calendarNextMonthBtn">下月 ›</button>
    </div>
    <div class="calendar-head">
      ${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
    </div>
    <div class="calendar-grid cal-review-grid">
      ${cells.join("")}
    </div>
    <div class="review-banner">
      <span class="subtle">每天的情绪和记录会自动落到日历上。点任意一天查看当天详情。</span>
    </div>
  `;
  document.querySelector("#calendarPrevMonthBtn").addEventListener("click", () => {
    app.calendarMonth = shiftMonth(app.calendarMonth, -1);
    renderReviews();
  });
  document.querySelector("#calendarNextMonthBtn").addEventListener("click", () => {
    app.calendarMonth = shiftMonth(app.calendarMonth, 1);
    renderReviews();
  });
  const backBtn = document.querySelector("#calendarBackTodayBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      app.calendarMonth = localDateString().slice(0, 7);
      app.calendarSelectedDate = localDateString();
      renderReviews();
    });
  }
  nodes.reviewCalendarCard.querySelectorAll("[data-cal-date]").forEach((button) => {
    button.addEventListener("click", () => {
      app.calendarSelectedDate = button.dataset.calDate;
      renderReviews();
    });
  });
}

function renderReviewDay() {
  const date = app.calendarSelectedDate;
  const { emotion, records } = getDayCalendarData(date);
  const habitRows = app.state.habits.map((habit) => ({
    name: habit.name,
    status: getHabitStatus(habit.id, date)
  }));
  const doneHabits = habitRows.filter((item) => item.status === "done" || item.status === "patched").length;
  const statusLabel = (status) => (status === "done" ? "✓" : status === "miss" ? "×" : status === "patched" ? "补" : "—");
  nodes.reviewDayCard.innerHTML = `
    <div class="section-head">
      <h2>${date} 详情</h2>
      <span class="pill">${date === localDateString() ? "今天" : "历史"}</span>
    </div>
    <div class="review-day-row">
      <div class="detail-tile">
        <span class="item-meta">情绪</span>
        <strong>${emotion ? `<img class="inline-face" src="${emotion.img}" alt=""> ${emotion.label}` : "未记录"}</strong>
        <p class="item-meta">${emotion?.note || "当天还没有情绪备注"}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">记录</span>
        <strong>${records.length} 条</strong>
        <p class="item-meta">习惯完成 ${doneHabits}/${app.state.habits.length}</p>
      </div>
    </div>
    ${habitRows.length ? `
      <div class="board-done-head" style="margin-top:12px;">
        <span>习惯打卡</span>
      </div>
      <div class="habit-status-row">
        ${habitRows.map((item) => `<span class="mini-pill">${escapeHtml(item.name)} ${statusLabel(item.status)}</span>`).join("")}
      </div>
    ` : ""}
    <div class="section-head" style="margin-top:14px;">
      <h3 style="font-size:15px;">当天记录</h3>
      <div class="inline-actions tight">
        <button class="chip-button" id="addRecordForDayBtn">新增记录</button>
        <button class="chip-button" id="updateEmotionForDayBtn">更新情绪</button>
      </div>
    </div>
    <div class="timeline" id="reviewDayRecords">
      ${records.length ? records.map((record) => `
        <div class="timeline-item">
          <div class="list-item-head">
            <strong>${escapeHtml(record.content)}</strong>
            <span class="timestamp">${formatTime(record.createdAt)}</span>
          </div>
          ${record.tags.length ? `<p>${record.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join(" ")}</p>` : ""}
          <div class="inline-actions tight">
            <button class="chip-button" data-review-record-manage="edit" data-review-record-id="${record.id}">编辑</button>
            <button class="chip-button" data-review-record-manage="delete" data-review-record-id="${record.id}">删除</button>
          </div>
        </div>
      `).join("") : `
        <div class="empty-state">
          <p class="empty-title">这一天还没有记录</p>
          <p class="empty-text">点“新增记录”补上当天最重要的事。</p>
        </div>
      `}
    </div>
  `;
  document.querySelector("#addRecordForDayBtn").addEventListener("click", () => openEntryModal("record", { date }));
  document.querySelector("#updateEmotionForDayBtn").addEventListener("click", () => openEntryModal("emotion", emotion || { date }));
  document.querySelectorAll("[data-review-record-manage]").forEach((button) => {
    button.addEventListener("click", () => handleRecordManage(button.dataset.reviewRecordManage, button.dataset.reviewRecordId));
  });
}

function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function truncate(text, length) {
  const value = String(text || "");
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

/* ============ 今日页 ============ */

function renderAll() {
  nodes.todayDateText.textContent = formatLongDate(new Date());
  renderTodayHero();
  renderEmotionCard();
  renderTodayBrowser();
  renderDayPanorama();
  renderTodayHabits();
  renderTimeline();
  renderProjects();
  renderReviews();
  renderHabits();
  renderKnowledge();
  renderContacts();
  renderContactsMascot();
}

function renderTodayHero() {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  nodes.todayHeroCard.innerHTML = `
    <div class="hero-inner">
      <div class="hero-text">
        <span class="pill">${greet} · ${weekdayLabelOf(localDateString())}</span>
        <h2>把不起眼的小事，攒成喜欢的日子。</h2>
        <p class="subtle">一天一点点，慢慢积攒。今天也好好过。</p>
      </div>
      <img class="hero-cat" src="./assets/cat-mood.jpg" alt="猫咪心情">
    </div>
  `;
}

function renderEmotionCard() {
  const todayEmotion = getEmotionByDate(app.selectedDate);
  const emotion = todayEmotion || emotionOptions[1];
  const trend = getEmotionTrend(app.emotionWindowDays);
  const isToday = app.selectedDate === localDateString();
  nodes.emotionCard.innerHTML = `
    <div class="section-head">
      <h2>${isToday ? "今日情绪" : "当天情绪"}</h2>
      <div class="inline-actions tight">
        <button class="chip-button ${app.emotionWindowDays === 7 ? "star-button is-active" : ""}" data-emotion-window="7">7天</button>
        <button class="chip-button ${app.emotionWindowDays === 30 ? "star-button is-active" : ""}" data-emotion-window="30">30天</button>
      </div>
    </div>
    <div class="emotion-top">
      <img class="emotion-face" src="${emotion.img}" alt="${emotion.label}">
      <div class="emotion-meta">
        <strong>${emotion.label}</strong>
        <span class="subtle">${todayEmotion ? "已记录当天心情" : "点下面的小表情，记下今天的心情～"}</span>
      </div>
    </div>
    <div class="emotion-picker">
      ${emotionOptions.map((option) => `
        <button class="emotion-pick ${option.value === emotion.value ? "is-active" : ""}" data-emotion-level="${option.value}" title="${option.label}">
          <img src="${option.img}" alt="${option.label}">
          <span>${option.label}</span>
        </button>
      `).join("")}
    </div>
    <p class="emotion-note">${todayEmotion?.note || "记录今天的心情，会自动进入你的复盘日历。"}</p>
    <div class="section-block">
      ${renderBarRows(`最近 ${app.emotionWindowDays} 天情绪分布`, emotionOptions.map((option) => ({
        label: `<img class="bar-face" src="${option.img}" alt=""> ${option.label}`,
        value: trend.counts[option.value] || 0
      })))}
    </div>
  `;
  nodes.emotionCard.querySelectorAll("[data-emotion-window]").forEach((button) => {
    button.addEventListener("click", () => {
      app.emotionWindowDays = Number(button.dataset.emotionWindow);
      renderEmotionCard();
    });
  });
  nodes.emotionCard.querySelectorAll("[data-emotion-level]").forEach((button) => {
    button.addEventListener("click", () => {
      const level = Number(button.dataset.emotionLevel);
      const targetDate = app.selectedDate;
      const existing = app.state.emotions.find((item) => item.date === targetDate);
      const payload = { date: targetDate, level, note: existing?.note || "" };
      app.state.emotions = app.state.emotions.filter((item) => item.date !== targetDate).concat(payload);
      saveState();
      showToast(`已记下今天的心情：${emotionOptions.find((option) => option.value === level).label}`);
      renderAll();
    });
  });
}

function renderTodayBrowser() {
  const selectedDate = app.selectedDate;
  const recentDates = Array.from({ length: 7 }, (_, index) => addDays(localDateString(), -6 + index));
  nodes.todayBrowserCard.innerHTML = `
    <div class="section-head">
      <h2>日期浏览</h2>
      <span class="subtle">${selectedDate === localDateString() ? "当前是今天" : "正在查看历史"}</span>
    </div>
    <div class="date-browser">
      <div class="date-row">
        <button class="chip-button" id="prevDateBtn">前一天</button>
        <input id="selectedDateInput" type="date" value="${selectedDate}">
        <button class="chip-button" id="nextDateBtn">后一天</button>
      </div>
      <div class="history-strip">
        ${recentDates.map((date) => {
          const emotion = getEmotionByDate(date);
          const count = app.state.records.filter((item) => item.date === date).length;
          return `
            <button class="history-day" data-jump-date="${date}">
              <span class="timestamp">${date.slice(5)}</span>
              <strong>${emotion ? `<img class="mini-face" src="${emotion.img}" alt="">` : "•"}</strong>
              <span class="timestamp">${count} 条</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
  document.querySelector("#prevDateBtn").addEventListener("click", () => changeSelectedDate(-1));
  document.querySelector("#nextDateBtn").addEventListener("click", () => changeSelectedDate(1));
  document.querySelector("#selectedDateInput").addEventListener("change", (event) => {
    app.selectedDate = event.target.value || localDateString();
    renderAll();
  });
  nodes.todayBrowserCard.querySelectorAll("[data-jump-date]").forEach((button) => {
    button.addEventListener("click", () => {
      app.selectedDate = button.dataset.jumpDate;
      renderAll();
    });
  });
}

function renderDayPanorama() {
  const date = app.selectedDate;
  const dayRecords = app.state.records.filter((item) => item.date === date);
  const dayEmotion = getEmotionByDate(date);
  const dayKnowledge = app.state.knowledge.filter((item) => item.createdAt && localDateString(new Date(item.createdAt)) === date);
  const dayHabitStats = app.state.habits.map((habit) => ({
    name: habit.name,
    status: getHabitStatus(habit.id, date)
  }));
  const completedHabits = dayHabitStats.filter((item) => item.status === "done" || item.status === "patched");
  const missedHabits = dayHabitStats.filter((item) => item.status === "miss");
  const birthdays = app.state.contacts.filter((item) => item.birthday && item.birthday.slice(5) === date.slice(5));

  nodes.todayPanoramaCard.innerHTML = `
    <div class="section-head">
      <h2>当天全景</h2>
      <span class="pill">${date === localDateString() ? "今天" : date}</span>
    </div>
    <div class="project-detail-grid">
      <div class="detail-tile">
        <span class="item-meta">记录</span>
        <strong>${dayRecords.length}</strong>
        <p class="item-meta">${dayRecords[0] ? `${truncate(dayRecords[0].content, 28)}` : "当天还没有记录"}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">情绪</span>
        <strong>${dayEmotion ? `${dayEmotion.face} ${dayEmotion.label}` : "未记录"}</strong>
        <p class="item-meta">${dayEmotion?.note || "当天还没有情绪备注"}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">习惯完成</span>
        <strong>${completedHabits.length}/${app.state.habits.length}</strong>
        <p class="item-meta">${missedHabits.length ? `缺勤 ${missedHabits.length} 项` : "当天没有缺勤习惯"}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">待办</span>
        <strong>${Object.values(app.state.boards).flat().filter((item) => !item.done).length}</strong>
        <p class="item-meta">四板块当前未完成总数</p>
      </div>
    </div>
    <div class="project-section">
      <h3>当天线索</h3>
      <div class="project-task-list">
        <div class="detail-tile">
          <strong>经验沉淀</strong>
          <p class="item-meta">${dayKnowledge.length ? dayKnowledge.slice(0, 2).map((item) => item.title).join(" / ") : "当天还没有新增经验"}</p>
        </div>
        <div class="detail-tile">
          <strong>人际提醒</strong>
          <p class="item-meta">${birthdays.length ? birthdays.map((item) => item.name).join(" / ") : "当天没有生日提醒"}</p>
        </div>
      </div>
    </div>
  `;
}

function renderTodayHabits() {
  const habits = app.state.habits;
  const isToday = app.selectedDate === localDateString();
  nodes.todayQuickHabits.innerHTML = `
    <div class="section-head">
      <h2>${isToday ? "今日打卡区" : "当天打卡区"}</h2>
      <span class="subtle">${habits.length} 个习惯</span>
    </div>
    <div class="list" id="todayHabitInner"></div>
  `;
  const container = document.querySelector("#todayHabitInner");
  renderCollection(container, habits, (habit) => {
    const status = getHabitStatus(habit.id, app.selectedDate);
    return `
      <div class="list-item habit-row">
        <div>
          <strong>${escapeHtml(habit.name)}</strong>
          <p class="item-meta">连续 ${computeStreak(habit.id)} 天</p>
        </div>
        <div class="habit-actions">
          <button class="chip-button" data-habit-action="done" data-habit-id="${habit.id}">${status === "done" ? "已打钩" : "打钩"}</button>
          <button class="chip-button" data-habit-action="miss" data-habit-id="${habit.id}">${status === "miss" ? "已打叉" : "打叉"}</button>
        </div>
      </div>
    `;
  });
  container.querySelectorAll("[data-habit-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      setHabitStatus(button.dataset.habitId, button.dataset.habitAction, app.selectedDate);
      await saveState();
      renderAll();
    });
  });
}

function renderTimeline() {
  const items = app.state.records.filter((item) => item.date === app.selectedDate);
  renderCollection(nodes.todayTimeline, items, (record) => {
    const habit = app.state.habits.find((item) => item.id === record.relatedHabitId);
    return `
      <div class="timeline-item">
        <div class="list-item-head">
          <strong>${escapeHtml(record.content)}</strong>
          <span class="timestamp">${formatTime(record.createdAt)}</span>
        </div>
        ${record.tags.length ? `<p>${record.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join(" ")}</p>` : ""}
        <p class="item-meta">${habit ? `习惯：${escapeHtml(habit.name)}` : "未关联其他内容"}</p>
        <div class="inline-actions tight">
          <button class="chip-button" data-record-manage="edit" data-record-id="${record.id}">编辑</button>
          <button class="chip-button" data-record-manage="delete" data-record-id="${record.id}">删除</button>
        </div>
      </div>
    `;
  });
  nodes.todayTimeline.querySelectorAll("[data-record-manage]").forEach((button) => {
    button.addEventListener("click", () => handleRecordManage(button.dataset.recordManage, button.dataset.recordId));
  });
}

async function handleRecordManage(action, recordId) {
  const record = app.state.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }
  if (action === "edit") {
    openEntryModal("record", record);
    return;
  }
  if (action === "delete") {
    if (!confirm("确定删除这条记录吗？")) {
      return;
    }
    moveToTrash("record", structuredClone(record));
    app.state.records = app.state.records.filter((item) => item.id !== recordId);
    await saveState();
    renderAll();
    showToast("记录已移入回收站");
  }
}

/* ============ 习惯页 ============ */

function renderHabits() {
  renderHabitOverview();
  renderCollection(nodes.habitList, app.state.habits, (habit) => {
    const doneDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "done").length;
    const missDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "miss").length;
    const patchedDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "patched").length;
    const monthStats = getHabitMonthStats(habit.id, app.habitMonth);
    return `
      <div class="list-item">
        <div class="list-item-head">
          <strong>${escapeHtml(habit.name)}</strong>
          <span class="badge">${computeStreak(habit.id)} 天 streak</span>
        </div>
        <p class="item-meta">${[habit.frequency === "weekly" ? "每周" : "每天", habit.category || "未分类", habit.target || "未写目标", habit.reminderTime ? `提醒 ${habit.reminderTime}` : ""].filter(Boolean).join(" / ")}</p>
        <p class="item-meta">完成 ${doneDays} 次，补卡 ${patchedDays} 次，打叉 ${missDays} 次。${app.habitMonth} 完成率 ${monthStats.completionRate}% 。</p>
        <div class="inline-actions">
          <button class="chip-button" data-habit-manage="edit" data-habit-id="${habit.id}">编辑</button>
          <button class="chip-button" data-habit-manage="top" data-habit-id="${habit.id}">置顶</button>
          <button class="chip-button" data-habit-manage="up" data-habit-id="${habit.id}">上移</button>
          <button class="chip-button" data-habit-manage="down" data-habit-id="${habit.id}">下移</button>
          <button class="chip-button" data-habit-manage="delete" data-habit-id="${habit.id}">删除</button>
        </div>
        <div class="inline-actions tight">
          <button class="chip-button" data-habit-manage="patch" data-habit-id="${habit.id}">补卡</button>
          <button class="chip-button" data-habit-manage="clear" data-habit-id="${habit.id}">清空某天</button>
        </div>
        <div class="calendar-wrap">${renderHabitCalendar(habit.id, app.habitMonth)}</div>
      </div>
    `;
  });
  nodes.habitList.querySelectorAll("[data-habit-manage]").forEach((button) => {
    button.addEventListener("click", () => handleHabitManage(button.dataset.habitManage, button.dataset.habitId));
  });
  nodes.habitList.querySelectorAll("[data-habit-calendar]").forEach((button) => {
    button.addEventListener("click", () => handleHabitCalendarClick(button.dataset.habitId, button.dataset.habitDate));
  });
}

function renderHabitOverview() {
  const monthKey = app.habitMonth;
  const isCurrentMonth = monthKey === localDateString().slice(0, 7);
  const stats = app.state.habits.map((habit) => ({
    habit,
    stats: getHabitMonthStats(habit.id, monthKey)
  }));
  const totalDone = stats.reduce((sum, item) => sum + item.stats.doneCount + item.stats.patchedCount, 0);
  const totalMiss = stats.reduce((sum, item) => sum + item.stats.missCount, 0);
  const avgRate = stats.length ? Math.round(stats.reduce((sum, item) => sum + item.stats.completionRate, 0) / stats.length) : 0;
  const [year, month] = monthKey.split("-").map(Number);
  nodes.habitOverviewCard.innerHTML = `
    <div class="section-head">
      <h2>习惯概览 <img class="mascot-inline" src="./assets/habit-mascot.jpg" alt="打卡"></h2>
      ${isCurrentMonth ? "" : `<button class="text-button" id="habitBackTodayBtn">回到本月</button>`}
    </div>
    <div class="month-switcher">
      <button class="chip-button" id="habitPrevMonthBtn">‹ 上月</button>
      <span class="month-label">${year}年${month}月</span>
      <button class="chip-button" id="habitNextMonthBtn">下月 ›</button>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">平均完成率</span><strong>${avgRate}%</strong></div>
      <div class="metric"><span class="item-meta">完成 + 补卡</span><strong>${totalDone}</strong></div>
      <div class="metric"><span class="item-meta">打叉次数</span><strong>${totalMiss}</strong></div>
    </div>
    <div class="review-banner">
      <span class="subtle">切换月份可回看任意一个月的打卡情况；点击日历格子可改当天状态。</span>
    </div>
  `;
  document.querySelector("#habitPrevMonthBtn").addEventListener("click", () => {
    app.habitMonth = shiftMonth(app.habitMonth, -1);
    renderHabits();
  });
  document.querySelector("#habitNextMonthBtn").addEventListener("click", () => {
    app.habitMonth = shiftMonth(app.habitMonth, 1);
    renderHabits();
  });
  const backBtn = document.querySelector("#habitBackTodayBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      app.habitMonth = localDateString().slice(0, 7);
      renderHabits();
    });
  }
}

/* ============ 经验 ============ */

function buildExperienceCategories(knowledgeList, existing = []) {
  const map = new Map((existing || []).map((item) => [item.key, { ...item }]));
  knowledgeList.forEach((item) => {
    const key = item.category || "未分类";
    if (!map.has(key)) {
      map.set(key, { key, label: key, createdAt: new Date().toISOString(), updatedAt: "", deletedAt: "", version: 1 });
    }
    map.get(key).count = (map.get(key).count || 0) + 1;
  });
  return [...map.values()];
}

function getKnowledgeTreeSummary() {
  const map = new Map();
  app.state.knowledge.forEach((item) => {
    if (!item.path) {
      return;
    }
    const segments = String(item.path).split("/").map((segment) => segment.trim()).filter(Boolean);
    let acc = "";
    segments.forEach((segment) => {
      acc = acc ? `${acc} / ${segment}` : segment;
      map.set(acc, (map.get(acc) || 0) + 1);
    });
  });
  return [...map.entries()].map(([path, count]) => ({ path, count }));
}

function formatKnowledgeTreeLabel(item) {
  const parts = [item.category, item.path].filter(Boolean);
  return parts.length ? parts.join(" / ") : "未分类";
}

function renderKnowledge() {
  renderKnowledgeFilters();
  const filtered = getFilteredKnowledge();
  renderCollection(nodes.knowledgeList, filtered, (item) => `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="pill">${escapeHtml(item.category)}</span>
      </div>
      <p>${escapeHtml(item.body)}</p>
      <p class="item-meta">${item.path ? `路径：${escapeHtml(item.path)} / ` : ""}${item.tags.join(" / ") || "无标签"} / ${escapeHtml(item.status)}</p>
      <div class="inline-actions tight">
        <span class="mini-pill">${escapeHtml(formatKnowledgeTreeLabel(item))}</span>
        <button class="chip-button star-button ${item.starred ? "is-active" : ""}" data-knowledge-manage="star" data-knowledge-id="${item.id}">${item.starred ? "已星标" : "星标"}</button>
        <button class="chip-button" data-knowledge-manage="toggle-status" data-knowledge-id="${item.id}">${item.status === "已实践" ? "改为待验证" : "标为已实践"}</button>
        <button class="chip-button" data-knowledge-manage="edit" data-knowledge-id="${item.id}">编辑</button>
        <button class="chip-button" data-knowledge-manage="delete" data-knowledge-id="${item.id}">删除</button>
      </div>
    </div>
  `);
  nodes.knowledgeList.querySelectorAll("[data-knowledge-manage]").forEach((button) => {
    button.addEventListener("click", () => handleKnowledgeManage(button.dataset.knowledgeManage, button.dataset.knowledgeId));
  });
}

function renderKnowledgeFilters() {
  const treeSummary = getKnowledgeTreeSummary();
  nodes.knowledgeFilterCard.innerHTML = `
    <div class="section-head">
      <h2>经验筛选</h2>
      <button class="text-button" id="resetKnowledgeFiltersBtn">重置</button>
    </div>
    <div class="review-banner">
      <span class="subtle">当前经验 ${app.state.knowledge.length} 条，已形成 ${treeSummary.length} 条常用分类路径。</span>
    </div>
    <div class="filter-row">
      <input id="knowledgeQueryInput" type="search" placeholder="搜标题、正文、标签" value="${escapeHtml(app.knowledgeFilter.query)}">
      <select id="knowledgeCategorySelect">
        <option value="">全部分类</option>
        ${["学习", "生活", "人际", "工作", "爱好"].map((item) => `<option value="${item}" ${app.knowledgeFilter.category === item ? "selected" : ""}>${item}</option>`).join("")}
      </select>
    </div>
    <div class="filter-row">
      <select id="knowledgePathSelect">
        <option value="">全部路径</option>
        ${treeSummary.map((item) => `<option value="${escapeHtml(item.path)}" ${app.knowledgeFilter.path === item.path ? "selected" : ""}>${escapeHtml(item.path)} (${item.count})</option>`).join("")}
      </select>
      <select id="knowledgeStatusSelect">
        <option value="">全部状态</option>
        <option value="待验证" ${app.knowledgeFilter.status === "待验证" ? "selected" : ""}>待验证</option>
        <option value="已实践" ${app.knowledgeFilter.status === "已实践" ? "selected" : ""}>已实践</option>
      </select>
    </div>
    <div class="filter-row">
      <button class="chip-button ${app.knowledgeFilter.starredOnly ? "star-button is-active" : ""}" id="knowledgeStarFilterBtn">${app.knowledgeFilter.starredOnly ? "只看星标中" : "只看星标"}</button>
    </div>
  `;
  document.querySelector("#knowledgeQueryInput").addEventListener("input", (event) => {
    app.knowledgeFilter.query = event.target.value.trim();
    renderKnowledge();
  });
  document.querySelector("#knowledgeCategorySelect").addEventListener("change", (event) => {
    app.knowledgeFilter.category = event.target.value;
    renderKnowledge();
  });
  document.querySelector("#knowledgePathSelect").addEventListener("change", (event) => {
    app.knowledgeFilter.path = event.target.value;
    renderKnowledge();
  });
  document.querySelector("#knowledgeStatusSelect").addEventListener("change", (event) => {
    app.knowledgeFilter.status = event.target.value;
    renderKnowledge();
  });
  document.querySelector("#knowledgeStarFilterBtn").addEventListener("click", () => {
    app.knowledgeFilter.starredOnly = !app.knowledgeFilter.starredOnly;
    renderKnowledge();
  });
  document.querySelector("#resetKnowledgeFiltersBtn").addEventListener("click", () => {
    app.knowledgeFilter = { query: "", category: "", path: "", status: "", starredOnly: false };
    renderKnowledge();
  });
}

function getFilteredKnowledge() {
  return app.state.knowledge.filter((item) => {
    if (app.knowledgeFilter.category && item.category !== app.knowledgeFilter.category) {
      return false;
    }
    if (app.knowledgeFilter.path && !(item.path || "").includes(app.knowledgeFilter.path)) {
      return false;
    }
    if (app.knowledgeFilter.status && item.status !== app.knowledgeFilter.status) {
      return false;
    }
    if (app.knowledgeFilter.starredOnly && !item.starred) {
      return false;
    }
    if (app.knowledgeFilter.query) {
      const haystack = `${item.title} ${item.path || ""} ${item.body} ${item.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(app.knowledgeFilter.query.toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}

async function handleKnowledgeManage(action, knowledgeId) {
  const item = app.state.knowledge.find((entry) => entry.id === knowledgeId);
  if (!item) {
    return;
  }
  if (action === "edit") {
    openEntryModal("knowledge", item);
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定删除经验「${item.title}」吗？`)) {
      return;
    }
    moveToTrash("knowledge", structuredClone(item));
    app.state.knowledge = app.state.knowledge.filter((entry) => entry.id !== knowledgeId);
    await saveState();
    renderAll();
    showToast("经验已移入回收站");
    return;
  }
  if (action === "star") {
    item.starred = !item.starred;
    await saveState();
    renderKnowledge();
    return;
  }
  if (action === "toggle-status") {
    item.status = item.status === "已实践" ? "待验证" : "已实践";
    await saveState();
    renderKnowledge();
  }
}

/* ============ 人际 ============ */

function renderContacts() {
  renderCollection(nodes.contactList, app.state.contacts, (contact) => `    <div class="list-item">
      <div class="list-item-head">
        <strong>${escapeHtml(contact.name)}</strong>
        <span class="pill">${escapeHtml(contact.relation || "未分类")}</span>
      </div>
      <p class="item-meta">${[contact.title, ...(contact.relationTags || []), contact.contactInfo].filter(Boolean).join(" / ") || "还没有补充细节。"}</p>
      <div class="inline-actions">
        <button class="chip-button" data-contact-manage="toggle" data-contact-id="${contact.id}">${app.expandedContactId === contact.id ? "收起详情" : "查看详情"}</button>
        <button class="chip-button" data-contact-manage="edit" data-contact-id="${contact.id}">编辑</button>
        <button class="chip-button" data-contact-manage="top" data-contact-id="${contact.id}">置顶</button>
        <button class="chip-button" data-contact-manage="up" data-contact-id="${contact.id}">上移</button>
        <button class="chip-button" data-contact-manage="down" data-contact-id="${contact.id}">下移</button>
        <button class="chip-button" data-contact-manage="delete" data-contact-id="${contact.id}">删除</button>
      </div>
      ${app.expandedContactId === contact.id ? `
        <div class="project-section">
          <p class="item-meta">称呼：${escapeHtml(contact.title) || "未填写"}</p>
          <p class="item-meta">关系标签：${(contact.relationTags || []).join(" / ") || escapeHtml(contact.relation) || "未填写"}</p>
          <p class="item-meta">联系方式：${escapeHtml(contact.contactInfo) || "未填写"}</p>
          <p class="item-meta">生日：${contact.birthday || "未填写"}</p>
          <p class="item-meta">印象备注：${escapeHtml(contact.impression || contact.note) || "未填写"}</p>
        </div>
      ` : ""}
    </div>
  `);
  nodes.contactList.querySelectorAll("[data-contact-manage]").forEach((button) => {
    button.addEventListener("click", () => handleContactManage(button.dataset.contactManage, button.dataset.contactId));
  });
}

function renderContactsMascot() {
  nodes.contactsMascotCard.innerHTML = `
    <div class="mascot-banner-inner">
      <img src="./assets/people-mascot.jpg" alt="人际">
      <div class="mascot-banner-text">
        <h3>把重要的人，放在心上。</h3>
        <p class="subtle">记录每一个值得惦记的名字与故事。</p>
      </div>
    </div>
  `;
}

async function handleContactManage(action, contactId) {
  const contact = app.state.contacts.find((item) => item.id === contactId);
  if (!contact) {
    return;
  }
  if (action === "toggle") {
    app.expandedContactId = app.expandedContactId === contactId ? "" : contactId;
    renderContacts();
    return;
  }
  if (action === "edit") {
    openEntryModal("contact", contact);
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定删除人物「${contact.name}」吗？`)) {
      return;
    }
    moveToTrash("contact", structuredClone(contact));
    app.state.contacts = app.state.contacts.filter((item) => item.id !== contactId);
    await saveState();
    renderAll();
    showToast("人物已移入回收站");
    return;
  }
  reorderItem(app.state.contacts, contactId, action);
  await saveState();
  renderAll();
}

/* ============ 录入弹窗 ============ */

function openEntryModal(type, preset = {}) {
  const configs = {
    record: {
      title: preset.id ? "编辑记录" : "新增今日记录",
      fields: `
        <input type="hidden" name="entryType" value="record">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <input type="hidden" name="date" value="${preset.date || app.selectedDate}">
        <label><span>内容</span><textarea name="content" required>${escapeHtml(preset.content || "")}</textarea></label>
        <label><span>标签（逗号分隔）</span><input name="tags" placeholder="学习, 灵感" value="${escapeHtml((preset.tags || []).join(", "))}"></label>
        <label><span>关联习惯</span>
          <select name="relatedHabitId">
            <option value="">不关联习惯</option>
            ${app.state.habits.map((item) => `<option value="${item.id}" ${preset.relatedHabitId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
          </select>
        </label>
      `
    },
    habit: {
      title: preset.id ? "编辑习惯" : "新增习惯",
      fields: `
        <input type="hidden" name="entryType" value="habit">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>习惯名称</span><input name="name" required placeholder="例如：背单词" value="${escapeHtml(preset.name || "")}"></label>
        <label><span>频率</span>
          <select name="frequency">
            <option value="daily" ${preset.frequency !== "weekly" ? "selected" : ""}>每天</option>
            <option value="weekly" ${preset.frequency === "weekly" ? "selected" : ""}>每周</option>
          </select>
        </label>
        <label><span>提醒时间</span><input name="reminderTime" type="time" value="${escapeHtml(preset.reminderTime || "")}"></label>
        <label><span>分类</span><input name="category" placeholder="学习 / 健康 / 生活" value="${escapeHtml(preset.category || "")}"></label>
        <label><span>目标</span><input name="target" placeholder="例如：每天 20 分钟" value="${escapeHtml(preset.target || "")}"></label>
      `
    },
    contact: {
      title: preset.id ? "编辑人物" : "新增人物",
      fields: `
        <input type="hidden" name="entryType" value="contact">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>姓名</span><input name="name" required value="${escapeHtml(preset.name || "")}"></label>
        <label><span>称呼</span><input name="title" placeholder="例如：师姐 / 表哥 / 导师" value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关系标签</span><input name="relationTags" placeholder="同学, 朋友, 合作" value="${escapeHtml((preset.relationTags || []).join(", "))}"></label>
        <label><span>主关系</span><input name="relation" placeholder="同学 / 导师 / 朋友" value="${escapeHtml(preset.relation || "")}"></label>
        <label><span>联系方式</span><input name="contactInfo" value="${escapeHtml(preset.contactInfo || "")}"></label>
        <label><span>生日</span><input name="birthday" type="date" value="${escapeHtml(preset.birthday || "")}"></label>
        <label><span>印象备注</span><textarea name="impression">${escapeHtml(preset.impression || preset.note || "")}</textarea></label>
      `
    },
    knowledge: {
      title: preset.id ? "编辑经验" : "新增经验",
      fields: `
        <input type="hidden" name="entryType" value="knowledge">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>标题</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>分类</span>
          <select name="category">
            <option value="学习" ${preset.category === "学习" ? "selected" : ""}>学习</option>
            <option value="生活" ${preset.category === "生活" ? "selected" : ""}>生活</option>
            <option value="人际" ${preset.category === "人际" ? "selected" : ""}>人际</option>
            <option value="工作" ${preset.category === "工作" ? "selected" : ""}>工作</option>
            <option value="爱好" ${preset.category === "爱好" ? "selected" : ""}>爱好</option>
          </select>
        </label>
        <label><span>分类路径</span><input name="path" placeholder="例如：生活 / 洗衣 / 防串色" value="${escapeHtml(preset.path || "")}"></label>
        <label><span>正文</span><textarea name="body" required>${escapeHtml(preset.body || "")}</textarea></label>
        <label><span>标签（逗号分隔）</span><input name="tags" value="${escapeHtml((preset.tags || []).join(", "))}"></label>
        <label><span>实践状态</span>
          <select name="status">
            <option value="待验证" ${preset.status !== "已实践" ? "selected" : ""}>待验证</option>
            <option value="已实践" ${preset.status === "已实践" ? "selected" : ""}>已实践</option>
          </select>
        </label>
      `
    },
    emotion: {
      title: "更新当天情绪",
      fields: `
        <input type="hidden" name="entryType" value="emotion">
        <input type="hidden" name="date" value="${preset.date || app.selectedDate}">
        <label><span>心情等级</span>
          <select name="level">
            ${emotionOptions.map((item) => `<option value="${item.value}" ${(Number(preset.level) || 2) === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </label>
        <label><span>一句话备注</span><textarea name="note" placeholder="今天发生了什么？">${escapeHtml(preset.note || "")}</textarea></label>
      `
    }
  };

  const config = configs[type];
  if (!config) {
    return;
  }
  nodes.dialogTitle.textContent = config.title;
  nodes.dialogFields.innerHTML = config.fields;
  nodes.entryDialog.showModal();
}

async function handleDialogSubmit(event) {
  if (event) {
    event.preventDefault();
  }
  if (!nodes.entryForm.reportValidity()) {
    return;
  }

  const formData = new FormData(nodes.entryForm);
  const entryType = formData.get("entryType");
  const now = new Date().toISOString();

  const handlers = {
    record: () => {
      const id = String(formData.get("id") || "");
      const payload = {
        date: String(formData.get("date") || app.selectedDate),
        content: String(formData.get("content")).trim(),
        tags: splitTags(formData.get("tags")),
        relatedHabitId: String(formData.get("relatedHabitId") || ""),
        updatedAt: now
      };
      if (id) {
        const item = app.state.records.find((record) => record.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.records.unshift({ id: uid(), createdAt: now, version: 1, ...payload });
    },
    habit: () => {
      const id = String(formData.get("id") || "");
      const payload = {
        name: String(formData.get("name")).trim(),
        frequency: String(formData.get("frequency") || "daily"),
        reminderTime: String(formData.get("reminderTime") || ""),
        category: String(formData.get("category") || "").trim(),
        target: String(formData.get("target") || "").trim(),
        updatedAt: now
      };
      if (id) {
        const item = app.state.habits.find((habit) => habit.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.habits.push({ id: uid(), createdAt: now, version: 1, ...payload });
    },
    contact: () => {
      const payload = {
        name: String(formData.get("name")).trim(),
        title: String(formData.get("title") || "").trim(),
        relationTags: splitTags(formData.get("relationTags")),
        relation: String(formData.get("relation") || "").trim(),
        contactInfo: String(formData.get("contactInfo") || "").trim(),
        birthday: String(formData.get("birthday") || ""),
        impression: String(formData.get("impression") || "").trim(),
        note: String(formData.get("impression") || "").trim(),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.contacts.find((contact) => contact.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.contacts.push({ id: uid(), createdAt: now, version: 1, ...payload });
    },
    knowledge: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        category: String(formData.get("category")),
        path: String(formData.get("path") || "").trim(),
        body: String(formData.get("body")).trim(),
        tags: splitTags(formData.get("tags")),
        status: String(formData.get("status")),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.knowledge.find((knowledge) => knowledge.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.knowledge.unshift({ id: uid(), createdAt: now, version: 1, starred: false, ...payload });
    },
    emotion: () => {
      const targetDate = String(formData.get("date") || app.selectedDate);
      const existing = app.state.emotions.find((item) => item.date === targetDate);
      const payload = {
        id: existing?.id || uid(),
        createdAt: existing?.createdAt || now,
        version: existing ? Number(existing.version || 1) + 1 : 1,
        date: targetDate,
        level: Number(formData.get("level")),
        note: String(formData.get("note") || "").trim(),
        updatedAt: now
      };
      app.state.emotions = app.state.emotions.filter((item) => item.date !== targetDate).concat(payload);
    }
  };

  try {
    handlers[entryType]?.();
    await saveState();
    nodes.entryDialog.close();
    renderAll();
    showToast("已保存");
  } catch (error) {
    console.error(error);
    alert("保存失败，请再试一次。");
  }
}

/* ============ 设置与备份 ============ */

function openSettings() {
  nodes.dailyReminderTime.value = app.state.settings.reminderDailyTime;
  nodes.autoBackupDays.value = app.state.settings.autoBackupDays;
  nodes.settingsNote.textContent = `最近备份：${app.state.meta.lastBackupAt ? app.state.meta.lastBackupAt.slice(0, 16).replace("T", " ") : "还没有"}；回收站：${app.state.trash.length} 条。`;
  renderBackupLogList();
  nodes.settingsDialog.showModal();
}

async function saveSettings() {
  app.state.settings.reminderDailyTime = nodes.dailyReminderTime.value || "22:00";
  app.state.settings.autoBackupDays = Number(nodes.autoBackupDays.value || 7);
  await saveState();
  nodes.settingsDialog.close();
  showToast("设置已保存");
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("当前浏览器不支持通知。");
    return;
  }
  const permission = await Notification.requestPermission();
  app.state.settings.notificationPermissionAskedAt = new Date().toISOString();
  await saveState();
  showToast(permission === "granted" ? "通知已启用" : "通知未开启，可稍后在浏览器设置里打开");
}

function maybeSurfaceReminder() {
  const today = localDateString();
  const hasRecordToday = app.state.records.some((item) => item.date === today);
  if (hasRecordToday) {
    return;
  }
  const now = new Date();
  const [hour, minute] = app.state.settings.reminderDailyTime.split(":").map(Number);
  if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) {
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("我的外置大脑", {
      body: "今天还没有记录，花一分钟记下今天最重要的事。"
    });
  }
}

async function backupJson(showMessage, reason = "manual") {
  const filename = `我的外置大脑-备份-${localDateString()}.json`;
  const snapshot = structuredClone(app.state);
  downloadFile(filename, JSON.stringify(snapshot, null, 2), "application/json");
  app.state.meta.lastBackupAt = new Date().toISOString();
  app.state.backupLogs.unshift({
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: "",
    deletedAt: "",
    version: 1,
    type: "backup",
    trigger: reason,
    filename,
    status: "done"
  });
  await saveState();
  if (showMessage) {
    nodes.settingsNote.textContent = `已导出 ${filename}。`;
    showToast(`已导出 ${filename}`);
  }
  return filename;
}

function maybeAutoBackup() {
  const lastBackup = app.state.meta.lastBackupAt;
  if (!lastBackup) {
    backupJson(false, "first-open");
    return;
  }
  const daysSinceBackup = daysBetween(lastBackup.slice(0, 10), localDateString());
  if (daysSinceBackup >= app.state.settings.autoBackupDays) {
    backupJson(false, "auto");
  }
}

function exportCsvBundle() {
  const files = [
    {
      name: `records-${localDateString()}.csv`,
      content: toCsv(app.state.records.map((item) => ({
        date: item.date,
        content: item.content,
        tags: item.tags.join("|")
      })))
    },
    {
      name: `habits-${localDateString()}.csv`,
      content: toCsv(app.state.habitLogs)
    },
    {
      name: `contacts-${localDateString()}.csv`,
      content: toCsv(app.state.contacts.map((item) => ({
        name: item.name,
        relation: item.relation,
        contactInfo: item.contactInfo,
        birthday: item.birthday,
        note: item.note || item.impression
      })))
    },
    {
      name: `knowledge-${localDateString()}.csv`,
      content: toCsv(app.state.knowledge.map((item) => ({
        title: item.title,
        category: item.category,
        path: item.path || "",
        status: item.status,
        tags: item.tags.join("|")
      })))
    },
    {
      name: `boards-${localDateString()}.csv`,
      content: toCsv(BOARD_DEFS.flatMap((board) =>
        getBoardList(board.key).map((item) => ({
          board: board.label,
          content: item.content,
          done: item.done ? "是" : "否"
        }))
      ))
    }
  ];
  files.forEach((file) => downloadFile(file.name, file.content, "text/csv;charset=utf-8"));
  nodes.settingsNote.textContent = "已导出主要模块 CSV。";
}

async function restoreFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const preview = normalizeState(parsed);
    const summary = [
      `记录 ${preview.records.length} 条`,
      `习惯 ${preview.habits.length} 个`,
      `人物 ${preview.contacts.length} 个`,
      `经验 ${preview.knowledge.length} 条`,
      `待办 ${Object.values(preview.boards).reduce((sum, list) => sum + list.length, 0)} 条`
    ].join("，");

    if (!confirm(`将要恢复这个备份：${summary}。恢复前会先自动备份你当前的数据。是否继续？`)) {
      return;
    }

    const backupName = `我的外置大脑-恢复前备份-${localDateString()}.json`;
    const currentSnapshot = structuredClone(app.state);
    downloadFile(backupName, JSON.stringify(currentSnapshot, null, 2), "application/json");

    const previousLogs = Array.isArray(preview.backupLogs) ? preview.backupLogs.slice(0, 30) : [];
    app.state = normalizeState({
      ...preview,
      backupLogs: [
        {
          id: uid(),
          createdAt: new Date().toISOString(),
          updatedAt: "",
          deletedAt: "",
          version: 1,
          type: "backup",
          trigger: "pre-restore",
          filename: backupName,
          status: "done"
        },
        {
          id: uid(),
          createdAt: new Date().toISOString(),
          updatedAt: "",
          deletedAt: "",
          version: 1,
          type: "restore",
          trigger: "file-import",
          filename: file.name,
          status: "done"
        },
        ...previousLogs
      ]
    });
    await saveState();
    nodes.settingsNote.textContent = `已恢复，旧数据已备份为 ${backupName}。如果想反悔，可以再把这个文件导回。`;
    renderAll();
    showToast("备份已恢复");
  } catch (error) {
    if (app.state?.backupLogs) {
      app.state.backupLogs.unshift({
        id: uid(),
        createdAt: new Date().toISOString(),
        updatedAt: "",
        deletedAt: "",
        version: 1,
        type: "restore",
        trigger: "file-import",
        filename: file?.name || "",
        status: "failed"
      });
      await saveState();
    }
    nodes.settingsNote.textContent = "恢复失败：文件不是可识别的备份 JSON。";
    console.error(error);
  } finally {
    event.target.value = "";
  }
}

function renderBackupLogList() {
  const container = document.querySelector("#backupLogList");
  if (!container) {
    return;
  }
  const logs = (app.state.backupLogs || []).slice(0, 8);
  if (!logs.length) {
    container.innerHTML = `<div class="empty-state"><p class="empty-title">还没有备份日志</p><p class="empty-text">手动备份、自动备份和恢复操作会记录在这里。</p></div>`;
    return;
  }
  container.innerHTML = logs.map((item) => `
    <div class="backup-log-card">
      <div>
        <strong>${item.type === "restore" ? "恢复记录" : "备份记录"}</strong>
        <p class="item-meta">${escapeHtml(item.filename || "未命名文件")} / ${escapeHtml(item.trigger || "manual")}</p>
      </div>
      <span class="mini-pill">${item.status === "failed" ? "失败" : "完成"}</span>
    </div>
  `).join("");
}

async function restoreLastDeleted() {
  const entry = app.state.trash.shift();
  if (!entry) {
    showToast("回收站是空的");
    return;
  }
  if (entry.kind === "record") {
    app.state.records.unshift(entry.payload);
  }
  if (entry.kind === "habit") {
    app.state.habits.push(entry.payload.item);
    app.state.habitLogs.push(...(entry.payload.logs || []));
  }
  if (entry.kind === "contact") {
    app.state.contacts.push(entry.payload);
  }
  if (entry.kind === "knowledge") {
    app.state.knowledge.unshift(entry.payload);
  }
  if (entry.kind === "board-item") {
    const boardKey = entry.payload.boardKey;
    if (boardKey && app.state.boards[boardKey]) {
      app.state.boards[boardKey].push(entry.payload.item);
      app.activeBoardKey = boardKey;
    }
  }
  await saveState();
  renderAll();
  showToast(`已恢复最近删除的${trashKindLabel(entry.kind)}`);
}

async function clearTrash() {
  if (!app.state.trash.length) {
    showToast("回收站已经是空的");
    return;
  }
  if (!confirm(`确定清空回收站吗？这会永久删除 ${app.state.trash.length} 条内容。`)) {
    return;
  }
  app.state.trash = [];
  await saveState();
  showToast("回收站已清空");
  if (nodes.settingsDialog.open) {
    nodes.settingsNote.textContent = `最近备份：${app.state.meta.lastBackupAt ? app.state.meta.lastBackupAt.slice(0, 16).replace("T", " ") : "还没有"}；回收站：0 条。`;
  }
}

/* ============ 全局搜索 ============ */

function openSearch() {
  nodes.searchInput.value = app.searchQuery;
  nodes.searchDateInput.value = app.searchDate;
  nodes.searchDialog.showModal();
  renderSearchResults();
}

function renderSearchResults() {
  const results = getSearchResults();
  renderCollection(nodes.searchResults, results, (result) => `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${escapeHtml(result.title)}</strong>
        <span class="pill">${escapeHtml(result.type)}</span>
      </div>
      <p class="item-meta">${escapeHtml(result.meta)}</p>
      ${result.preview ? `<p>${escapeHtml(result.preview)}</p>` : ""}
      <div class="inline-actions tight">
        <button class="chip-button" data-search-open="${result.id}" data-search-type="${escapeHtml(result.type)}">打开</button>
      </div>
    </div>
  `);
  nodes.searchResults.querySelectorAll("[data-search-open]").forEach((button) => {
    button.addEventListener("click", () => handleSearchOpen(button.dataset.searchType, button.dataset.searchOpen));
  });
}

function getSearchResults() {
  const query = app.searchQuery.toLowerCase();
  const date = app.searchDate;
  const results = [];
  const pushIfMatch = (type, id, title, meta, haystack, itemDate, preview = "") => {
    if (date && itemDate && itemDate !== date) {
      return;
    }
    if (query && !haystack.toLowerCase().includes(query)) {
      return;
    }
    if (!query && !date) {
      return;
    }
    results.push({ type, id, title, meta, preview });
  };

  app.state.records.forEach((item) => {
    pushIfMatch("记录", item.id, truncate(item.content, 24), `${item.date} / ${item.tags.join(" / ") || "无标签"}`, `${item.content} ${item.tags.join(" ")}`, item.date, truncate(item.content, 80));
  });
  BOARD_DEFS.forEach((board) => {
    getBoardList(board.key).forEach((item) => {
      pushIfMatch("待办", item.id, truncate(item.content, 24), `${board.label} / ${item.done ? "已完成" : "未完成"}`, item.content, "", truncate(item.content, 80));
    });
  });
  app.state.contacts.forEach((item) => {
    pushIfMatch("人物", item.id, item.name, `${item.relation || "未分类"} / ${item.contactInfo || ""}`, `${item.name} ${item.relation || ""} ${item.note || item.impression || ""}`, item.birthday || "", item.note || item.impression || "");
  });
  app.state.knowledge.forEach((item) => {
    pushIfMatch("经验", item.id, item.title, `${item.category}${item.path ? ` / ${item.path}` : ""} / ${item.status}`, `${item.title} ${item.path || ""} ${item.body} ${item.tags.join(" ")}`, item.createdAt ? localDateString(new Date(item.createdAt)) : "", truncate(item.body, 80));
  });

  return results
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"))
    .slice(0, 60);
}

function handleSearchOpen(type, id) {
  if (type === "记录") {
    const record = app.state.records.find((item) => item.id === id);
    if (record) {
      app.selectedDate = record.date;
      setActiveScreen("today");
    }
  }
  if (type === "待办") {
    setActiveScreen("projects");
    app.boardQuery = "";
    app.activeBoardKey = "study";
    const found = BOARD_DEFS.find((board) => getBoardList(board.key).some((item) => item.id === id));
    if (found) {
      app.activeBoardKey = found.key;
      renderProjects();
      requestAnimationFrame(() => {
        const row = document.querySelector(`[data-todo-id="${id}"]`);
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        row?.classList.add("is-flash");
        setTimeout(() => row?.classList.remove("is-flash"), 1600);
      });
    }
  }
  if (type === "人物") {
    setActiveScreen("contacts");
  }
  if (type === "经验") {
    setActiveScreen("knowledge");
  }
  nodes.searchDialog.close();
}

/* ============ 视图与事件 ============ */

function cacheNodes() {
  Object.assign(nodes, {
    todayDateText: document.querySelector("#todayDateText"),
    todayHeroCard: document.querySelector("#todayHeroCard"),
    emotionCard: document.querySelector("#emotionCard"),
    todayBrowserCard: document.querySelector("#todayBrowserCard"),
    todayPanoramaCard: document.querySelector("#todayPanoramaCard"),
    todayQuickHabits: document.querySelector("#todayQuickHabits"),
    todayTimeline: document.querySelector("#todayTimeline"),
    boardSearchCard: document.querySelector("#boardSearchCard"),
    boardCard: document.querySelector("#boardCard"),
    reviewCalendarCard: document.querySelector("#reviewCalendarCard"),
    weeklyReviewCard: document.querySelector("#weeklyReviewCard"),
    reviewDayCard: document.querySelector("#reviewDayCard"),
    habitOverviewCard: document.querySelector("#habitOverviewCard"),
    habitList: document.querySelector("#habitList"),
    knowledgeList: document.querySelector("#knowledgeList"),
    knowledgeFilterCard: document.querySelector("#knowledgeFilterCard"),
    contactList: document.querySelector("#contactList"),
    contactsMascotCard: document.querySelector("#contactsMascotCard"),
    entryDialog: document.querySelector("#entryDialog"),
    entryForm: document.querySelector("#entryForm"),
    dialogTitle: document.querySelector("#dialogTitle"),
    dialogFields: document.querySelector("#dialogFields"),
    dialogSubmitBtn: document.querySelector("#dialogSubmitBtn"),
    settingsDialog: document.querySelector("#settingsDialog"),
    searchDialog: document.querySelector("#searchDialog"),
    fabBtn: document.querySelector("#fabBtn"),
    fabMenu: document.querySelector("#fabMenu"),
    openSettingsBtn: document.querySelector("#openSettingsBtn"),
    openSearchBtn: document.querySelector("#openSearchBtn"),
    dailyReminderTime: document.querySelector("#dailyReminderTime"),
    autoBackupDays: document.querySelector("#autoBackupDays"),
    settingsNote: document.querySelector("#settingsNote"),
    restoreInput: document.querySelector("#restoreInput"),
    restoreLastDeletedBtn: document.querySelector("#restoreLastDeletedBtn"),
    clearTrashBtn: document.querySelector("#clearTrashBtn"),
    toast: document.querySelector("#toast"),
    searchInput: document.querySelector("#searchInput"),
    searchDateInput: document.querySelector("#searchDateInput"),
    searchResults: document.querySelector("#searchResults")
  });
}

function setActiveScreen(screenName) {
  app.activeScreen = screenName;
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === screenName);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.screenTarget === screenName);
  });
  nodes.fabMenu.classList.add("hidden");
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-screen-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveScreen(button.dataset.screenTarget));
  });
  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openEntryModal(button.dataset.openModal));
  });
  document.querySelectorAll("[data-fab-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveScreen(button.dataset.fabTarget));
  });
  document.querySelectorAll("[data-close-dialog='entry']").forEach((button) => {
    button.addEventListener("click", () => nodes.entryDialog.close());
  });
  document.querySelectorAll("[data-close-dialog='settings']").forEach((button) => {
    button.addEventListener("click", () => nodes.settingsDialog.close());
  });
  document.querySelectorAll("[data-close-dialog='search']").forEach((button) => {
    button.addEventListener("click", () => nodes.searchDialog.close());
  });

  nodes.fabBtn.addEventListener("click", () => nodes.fabMenu.classList.toggle("hidden"));
  nodes.openSettingsBtn.addEventListener("click", openSettings);
  nodes.openSearchBtn.addEventListener("click", openSearch);
  document.querySelector("#saveSettingsBtn").addEventListener("click", saveSettings);
  document.querySelector("#enableNotificationBtn").addEventListener("click", enableNotifications);
  document.querySelector("#backupNowBtn").addEventListener("click", () => backupJson(true));
  document.querySelector("#exportCsvBtn").addEventListener("click", exportCsvBundle);
  nodes.restoreLastDeletedBtn.addEventListener("click", restoreLastDeleted);
  nodes.clearTrashBtn.addEventListener("click", clearTrash);
  nodes.restoreInput.addEventListener("change", restoreFromFile);
  nodes.searchInput.addEventListener("input", (event) => {
    app.searchQuery = event.target.value.trim();
    renderSearchResults();
  });
  nodes.searchDateInput.addEventListener("change", (event) => {
    app.searchDate = event.target.value;
    renderSearchResults();
  });
  nodes.entryForm.addEventListener("submit", handleDialogSubmit);
  nodes.dialogSubmitBtn.addEventListener("click", () => handleDialogSubmit());
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.error("Service Worker 注册失败", error);
  }
}

function renderBarRows(title, items) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return `
    <div class="section-block-head">
      <span class="subtle">${title}</span>
    </div>
    <div class="chart-rows">
      ${items.map((item) => `
        <div class="chart-row">
          <div class="chart-head">
            <span>${item.label}</span>
            <span>${item.value}</span>
          </div>
          <div class="chart-track">
            <div class="chart-fill" style="width:${Math.round((item.value / max) * 100)}%"></div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
