const DB_NAME = "external-brain-db";
const DB_VERSION = 1;
const STORE_NAME = "appState";
const STATE_KEY = "singleton";

const emotionOptions = [
  { value: 1, label: "崩溃", color: "#A9B8C8", face: "🥲" },
  { value: 2, label: "失控", color: "#E8A87C", face: "😤" },
  { value: 3, label: "低落", color: "#B9A7C9", face: "😔" },
  { value: 4, label: "平和", color: "#A9C8B9", face: "🙂" },
  { value: 5, label: "愉悦", color: "#E8D58A", face: "😊" },
  { value: 6, label: "狂喜", color: "#E8A0A8", face: "🤩" }
];

const reviewTemplates = {
  daily: ["一句话反思", "明天最重要的一件事"],
  weekly: [
    "本周最大收获是什么？",
    "本周最需要改进的问题是什么？",
    "本周情绪状态如何？",
    "下周最重要的一件事是什么？"
  ],
  monthly: [
    "本月最大收获？",
    "本月最需改进？",
    "本月整体情绪？",
    "各项目推进对照？",
    "下月最重要的一件事/目标？"
  ],
  quarterly: [
    "这个季度最关键的里程碑是什么？",
    "这个季度最大的偏差或拖延点是什么？",
    "哪些项目真正推进了，哪些只是看起来很忙？",
    "下个季度最值得集中火力的一件事是什么？"
  ],
  yearly: [
    "今年最重要的成长是什么？",
    "今年最需要面对的问题是什么？",
    "今年哪些项目真正完成了闭环？",
    "明年最重要的一条主线是什么？"
  ]
};

const defaultReviewTemplates = JSON.parse(JSON.stringify(reviewTemplates));

const app = {
  state: null,
  activeScreen: "today",
  selectedDate: localDateString(),
  activeProjectId: "",
  taskFilter: {
    projectId: "",
    status: "open",
    priority: "",
    window: "focus"
  },
  knowledgeFilter: {
    query: "",
    category: "",
    status: "",
    starredOnly: false
  },
  searchQuery: "",
  searchDate: "",
  forcedReviewDismissedAt: "",
  emotionWindowDays: 7,
  expandedContactId: ""
};

const nodes = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheNodes();
  bindGlobalEvents();
  applyRuntimeOverrides();
  await registerServiceWorker();
  app.state = await loadState();
  maybeSeedSampleData();
  renderAll();
  maybeAutoBackup();
  maybeSurfaceReminder();
  maybeShowForcedReview();
});

function applyRuntimeOverrides() {
  renderProjectFilters = function renderProjectFiltersFinal() {
    const summary = getTaskWindowSummary();
    const stageStats = getProjectStageStats();
    const stalledCount = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled).length;
    nodes.projectFilterCard.innerHTML = `
      <div class="section-head">
        <h2>项目与任务</h2>
        <button class="text-button" id="resetTaskFiltersBtn" type="button">重置</button>
      </div>
      <div class="review-banner">
        <span class="subtle">当前共有 ${app.state.projects.length} 个项目，停滞项目 ${stalledCount} 个。优先处理“下一步动作”为空或超过 7 天没推进的项目。</span>
      </div>
      <div class="stage-strip">
        ${stageStats.map((item) => `
          <div class="stage-row">
            <strong>${item.label}</strong>
            <span class="mini-pill">${item.count} 个</span>
            <span class="mini-pill">${item.openTasks} 项待办</span>
          </div>
        `).join("")}
      </div>
      <div class="metric-grid">
        <div class="metric"><span class="item-meta">逾期</span><strong>${summary.overdue}</strong></div>
        <div class="metric"><span class="item-meta">今天</span><strong>${summary.today}</strong></div>
        <div class="metric"><span class="item-meta">7天内</span><strong>${summary.upcoming}</strong></div>
      </div>
      <div class="filter-row">
        <select id="taskProjectFilter">
          <option value="">全部项目</option>
          ${app.state.projects.map((item) => `<option value="${item.id}" ${app.taskFilter.projectId === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
        </select>
        <select id="taskStatusFilter">
          <option value="open" ${app.taskFilter.status === "open" ? "selected" : ""}>只看未完成</option>
          <option value="done" ${app.taskFilter.status === "done" ? "selected" : ""}>只看已完成</option>
          <option value="all" ${app.taskFilter.status === "all" ? "selected" : ""}>全部状态</option>
        </select>
      </div>
      <div class="filter-row">
        <select id="taskPriorityFilter">
          <option value="">全部优先级</option>
          <option value="high" ${app.taskFilter.priority === "high" ? "selected" : ""}>高优先级</option>
          <option value="medium" ${app.taskFilter.priority === "medium" ? "selected" : ""}>中优先级</option>
          <option value="low" ${app.taskFilter.priority === "low" ? "selected" : ""}>低优先级</option>
        </select>
        <select id="taskWindowFilter">
          <option value="focus" ${app.taskFilter.window === "focus" ? "selected" : ""}>默认聚焦</option>
          <option value="overdue" ${app.taskFilter.window === "overdue" ? "selected" : ""}>只看逾期</option>
          <option value="today" ${app.taskFilter.window === "today" ? "selected" : ""}>只看今天</option>
          <option value="upcoming" ${app.taskFilter.window === "upcoming" ? "selected" : ""}>只看7天内</option>
          <option value="all" ${app.taskFilter.window === "all" ? "selected" : ""}>全部任务</option>
        </select>
      </div>
      <div class="inline-actions tight">
        <button class="chip-button" id="batchCompleteBtn" type="button">批量完成</button>
        <button class="chip-button" id="batchPostponeBtn" type="button">批量顺延</button>
        <button class="chip-button" id="batchDeleteDoneBtn" type="button">删除已完成</button>
      </div>
    `;

    document.querySelector("#taskProjectFilter").addEventListener("change", (event) => {
      app.taskFilter.projectId = event.target.value;
      renderProjects();
    });
    document.querySelector("#taskStatusFilter").addEventListener("change", (event) => {
      app.taskFilter.status = event.target.value;
      renderProjects();
    });
    document.querySelector("#taskPriorityFilter").addEventListener("change", (event) => {
      app.taskFilter.priority = event.target.value;
      renderProjects();
    });
    document.querySelector("#taskWindowFilter").addEventListener("change", (event) => {
      app.taskFilter.window = event.target.value;
      renderProjects();
    });
    document.querySelector("#resetTaskFiltersBtn").addEventListener("click", (event) => {
      event.preventDefault();
      app.taskFilter = { projectId: "", status: "open", priority: "", window: "focus" };
      app.activeProjectId = "";
      renderProjects();
      if (typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      showToast("已重置项目筛选");
    });
    document.querySelector("#batchCompleteBtn").addEventListener("click", () => batchTaskAction("complete"));
    document.querySelector("#batchPostponeBtn").addEventListener("click", () => batchTaskAction("postpone"));
    document.querySelector("#batchDeleteDoneBtn").addEventListener("click", () => batchTaskAction("delete-done"));
  };

  maybeShowForcedReview = function maybeShowForcedReviewFinal() {
    if (!app.state) {
      return;
    }
    const overdueDays = getReviewOverdueDays();
    if (overdueDays < 14) {
      return;
    }

    const now = new Date();
    if (now.getHours() < 22) {
      return;
    }

    app.state.meta = app.state.meta || {};
    const today = localDateString(now);
    if (app.state.meta.lastForcedReviewPromptAt === today) {
      return;
    }

    app.state.meta.lastForcedReviewPromptAt = today;
    saveState();
    nodes.forcedReviewDialog.showModal();
  };

  submitForcedReview = async function submitForcedReviewFinal() {
    const reason = document.querySelector("#forcedReasonInput").value.trim();
    const change = document.querySelector("#forcedChangeInput").value.trim();
    const next = document.querySelector("#forcedNextInput").value.trim();
    if (!change || !next) {
      alert("最小复盘至少填写“这段时间最重要的变化”和“接下来最重要的一件事”。");
      return;
    }

    app.state.meta = app.state.meta || {};
    app.state.meta.lastForcedReviewPromptAt = localDateString();
    app.state.reviews.unshift({
      id: uid(),
      kind: "daily",
      date: localDateString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      answers: [
        { question: "最近一直没复盘的原因", answer: reason || "未填写" },
        { question: "这段时间最重要的变化", answer: change },
        { question: "接下来最重要的一件事", answer: next }
      ],
      snapshot: buildReviewSnapshot(),
      forced: true,
      skipped: false
    });
    await saveState();
    nodes.forcedReviewDialog.close();
    renderAll();
    showToast("已完成最小复盘");
  };

  skipForcedReview = async function skipForcedReviewFinal() {
    const reason = document.querySelector("#forcedReasonInput").value.trim();
    if (!reason) {
      alert("至少写一下这次跳过的原因。");
      return;
    }

    app.state.meta = app.state.meta || {};
    app.state.meta.lastForcedReviewPromptAt = localDateString();
    app.state.reviews.unshift({
      id: uid(),
      kind: "daily",
      date: localDateString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      answers: [{ question: "这次跳过复盘的原因", answer: reason }],
      snapshot: buildReviewSnapshot(),
      forced: true,
      skipped: true
    });
    await saveState();
    nodes.forcedReviewDialog.close();
    renderAll();
    showToast("已记录跳过原因");
  };

  buildReviewPrompts = function buildReviewPromptsFinal() {
    const latestReview = app.state.reviews[0];
    const daysSinceLatestReview = latestReview ? daysBetween(latestReview.date, localDateString()) : null;
    const overdueDays = getReviewOverdueDays();
    const week = getReviewWindowSummary(7);
    const month = getReviewWindowSummary(30);
    const stalledProjects = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled);
    return [
      {
        kind: "daily",
        title: "每日小结",
        badge: latestReview
          ? `距离上次复盘 ${daysSinceLatestReview} 天`
          : `今天 ${app.state.settings.reminderDailyTime} 提醒`,
        level: overdueDays > 0 ? "warning" : "normal",
        description: `用 2 分钟收束今天，并把明天最重要的一件事直接写进待办。今天已有 ${getDayRecordCount(localDateString())} 条记录。`
      },
      {
        kind: "weekly",
        title: "每周复盘",
        badge: `4 个问题 / ${week.records} 条记录`,
        level: stalledProjects.length ? "warning" : "normal",
        description: `最近 7 天完成习惯 ${week.doneHabits} 次、完成任务 ${week.doneTasks} 项。${stalledProjects.length ? `当前有 ${stalledProjects.length} 个项目停滞，适合本周一起处理。` : "适合检查项目推进节奏。"}`
      },
      {
        kind: "monthly",
        title: "每月复盘",
        badge: `5 个问题 / ${month.records} 条记录`,
        level: "normal",
        description: `最近 30 天新增经验 ${month.knowledge} 条，情绪均值 ${month.emotionAverage || "-"}，适合做月度归档和策略调整。`
      },
      {
        kind: "quarterly",
        title: "季度复盘",
        badge: "4 个问题 / 节点校准",
        level: "normal",
        description: "回看这个季度哪些推进是真的闭环，哪些只是忙碌感。"
      },
      {
        kind: "yearly",
        title: "年度复盘",
        badge: "4 个问题 / 年度主线",
        level: "normal",
        description: "把今年的成长、问题和主线重新对齐，避免只顾执行不顾方向。"
      }
    ];
  };

  renderProjects = function renderProjectsPlannerFinal() {
    const openTasks = getPlannerOpenTasks();
    const dueTodayTasks = getPlannerTodayDueTasks();
    const recentTasks = getPlannerRecentTasks();
    const looseTasks = getPlannerLooseTasks();
    const bundles = getPlannerBundles();
    const rankedProjects = getPlannerProjects();

    nodes.projectFilterCard.innerHTML = renderPlannerSectionCard("今日到期", "planner-today-card", dueTodayTasks.length
      ? `
        <div class="planner-summary danger">今天到期但还没完成的事会在这里提醒你，先清掉最容易卡住的一批。</div>
        <div class="planner-list">${dueTodayTasks.map((task) => renderPlannerTaskCard(task, "today")).join("")}</div>
      `
      : `
        <div class="empty-state">
          <p class="empty-title">今天没有到期未完成任务</p>
          <p class="empty-text">今天到期区会只保留真正需要你今天处理的任务。</p>
        </div>
      `
    );

    nodes.dueTodayList.innerHTML = recentTasks.length
      ? `
        <div class="planner-module planner-recent-card">
          <div class="planner-module-head">
            <div>
              <h3>近日待办</h3>
              <p class="item-meta">只显示今天和本周要完成的事，点“已完成”后会立刻移出这里。</p>
            </div>
            <span class="planner-count">${recentTasks.length}</span>
          </div>
          <div class="planner-list">${recentTasks.map((task) => renderPlannerTaskCard(task, "recent")).join("")}</div>
        </div>
      `
      : document.querySelector("#emptyStateTemplate").innerHTML;

    nodes.bundleList.innerHTML = looseTasks.length
      ? `
        <div class="planner-module planner-task-card">
          <div class="planner-module-head">
            <div>
              <h3>任务</h3>
              <p class="item-meta">普通任务按截止排序，高优先级红字置顶；进度型任务会显示进度条、剩余量和期限。</p>
            </div>
            <span class="planner-count">${looseTasks.length}</span>
          </div>
          <div class="planner-list">${looseTasks.map((task) => renderPlannerTaskCard(task, "task")).join("")}</div>
        </div>
      `
      : `
        <div class="planner-module planner-task-card">
          <div class="planner-module-head">
            <div>
              <h3>任务</h3>
              <p class="item-meta">新建的独立任务会放在这里，事件包里的任务不会混进来。</p>
            </div>
          </div>
          ${document.querySelector("#emptyStateTemplate").innerHTML}
        </div>
      `;

    nodes.projectList.innerHTML = bundles.length
      ? `
        <div class="planner-module planner-bundle-card">
          <div class="planner-module-head">
            <div>
              <h3>事件包</h3>
              <p class="item-meta">给一组关联任务命名打包，可选总截止日期，整包完成后自动下沉。</p>
            </div>
            <span class="planner-count">${bundles.length}</span>
          </div>
          <div class="planner-list">${bundles.map((bundle) => renderPlannerBundleCard(bundle)).join("")}</div>
        </div>
      `
      : `
        <div class="planner-module planner-bundle-card">
          <div class="planner-module-head">
            <div>
              <h3>事件包</h3>
              <p class="item-meta">比如“期末周”“搬家准备”“读完一本书”这类成组任务。</p>
            </div>
          </div>
          ${document.querySelector("#emptyStateTemplate").innerHTML}
        </div>
      `;

    nodes.projectDetailCard.innerHTML = `
      <div class="planner-module planner-project-card">
        <div class="planner-module-head">
          <div>
            <h3>长期项目</h3>
            <p class="item-meta">长期项目暂时保留在最后，先不大改，只负责展示主线和入口。</p>
          </div>
          <div class="inline-actions tight">
            <span class="planner-count">${rankedProjects.length}</span>
            <button class="chip-button" id="plannerCreateProjectBtn" type="button">新建长期项目</button>
          </div>
        </div>
        ${rankedProjects.length
          ? `<div class="planner-list">${rankedProjects.map((project) => renderPlannerProjectCard(project)).join("")}</div>`
          : document.querySelector("#emptyStateTemplate").innerHTML}
      </div>
    `;

    syncPlannerProjectHeaders();
    bindPlannerProjectScreenEvents();
  };

  handleTaskManage = async function handleTaskManagePlannerFinal(action, taskId) {
    const task = app.state.tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    if (action === "edit") {
      openEntryModal("task", task);
      return;
    }
    if (action === "postpone") {
      openPlannerPostponeDialog("task", taskId);
      return;
    }
    if (action === "delete") {
      if (!confirm(`确定删除任务“${task.title}”吗？`)) {
        return;
      }
      moveToTrash("task", structuredClone(task));
      app.state.tasks = app.state.tasks.filter((item) => item.id !== taskId);
      await saveState();
      renderAll();
      showToast("任务已移入回收站");
    }
  };

  handleBundleManage = async function handleBundleManagePlannerFinal(action, bundleId) {
    const bundle = app.state.bundles.find((item) => item.id === bundleId);
    if (!bundle) {
      return;
    }
    if (action === "edit") {
      openEntryModal("bundle", bundle);
      return;
    }
    if (action === "postpone") {
      openPlannerPostponeDialog("bundle", bundleId);
      return;
    }
    if (action === "complete") {
      const bundleTasks = app.state.tasks.filter((task) => task.bundleId === bundleId && task.status !== "done");
      if (!bundleTasks.length) {
        showToast("这个事件包已经完成了");
        return;
      }
      bundleTasks.forEach((task) => {
        task.status = "done";
        task.updatedAt = new Date().toISOString();
      });
      bundle.updatedAt = new Date().toISOString();
      await saveState();
      renderAll();
      showToast("事件包已整包完成");
      return;
    }
    if (action === "delete") {
      if (!confirm(`确定删除事件包“${bundle.title}”吗？包内任务会保留，但不再归属这个事件包。`)) {
        return;
      }
      moveToTrash("bundle", structuredClone(bundle));
      app.state.bundles = app.state.bundles.filter((item) => item.id !== bundleId);
      app.state.tasks.forEach((task) => {
        if (task.bundleId === bundleId) {
          task.bundleId = "";
        }
      });
      await saveState();
      renderAll();
      showToast("事件包已删除");
    }
  };
}

function renderPlannerSectionCard(title, className, content) {
  return `
    <div class="planner-module ${className}">
      <div class="planner-module-head">
        <div>
          <h3>${title}</h3>
        </div>
      </div>
      ${content}
    </div>
  `;
}

function getPlannerOpenTasks() {
  return app.state.tasks.filter((task) => task.status !== "done");
}

function getPlannerTaskDiff(task) {
  if (!task.deadline) {
    return null;
  }
  return daysBetween(localDateString(), task.deadline);
}

function getPlannerTodayDueTasks() {
  return getPlannerOpenTasks()
    .filter((task) => getPlannerTaskDiff(task) === 0)
    .sort(comparePlannerTasks);
}

function getPlannerRecentTasks() {
  return getPlannerOpenTasks()
    .filter((task) => {
      const diff = getPlannerTaskDiff(task);
      return diff !== null && diff >= 0 && diff <= 7;
    })
    .sort(comparePlannerTasks);
}

function getPlannerLooseTasks() {
  return getPlannerOpenTasks()
    .filter((task) => !task.bundleId)
    .sort(comparePlannerTasks);
}

function getPlannerBundles() {
  return [...app.state.bundles].sort((left, right) => {
    const leftMeta = getPlannerBundleMeta(left);
    const rightMeta = getPlannerBundleMeta(right);
    if (leftMeta.isDone !== rightMeta.isDone) {
      return leftMeta.isDone ? 1 : -1;
    }
    if (leftMeta.percent !== rightMeta.percent) {
      return rightMeta.percent - leftMeta.percent;
    }
    return String(left.deadline || "9999-99-99").localeCompare(String(right.deadline || "9999-99-99"));
  });
}

function getPlannerProjects() {
  return [...app.state.projects].sort((left, right) => {
    const score = getProjectHealthScore(right) - getProjectHealthScore(left);
    if (score !== 0) {
      return score;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function comparePlannerTasks(left, right) {
  const priorityDiff = priorityScore(left.priority) - priorityScore(right.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  const leftDiff = getPlannerTaskDiff(left);
  const rightDiff = getPlannerTaskDiff(right);
  if (leftDiff === null && rightDiff !== null) {
    return 1;
  }
  if (leftDiff !== null && rightDiff === null) {
    return -1;
  }
  if (leftDiff !== rightDiff) {
    return Number(leftDiff ?? 9999) - Number(rightDiff ?? 9999);
  }
  return left.title.localeCompare(right.title, "zh-CN");
}

function getPlannerBundleMeta(bundle) {
  const tasks = app.state.tasks.filter((task) => task.bundleId === bundle.id);
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const openCount = tasks.filter((task) => task.status !== "done").length;
  return {
    tasks,
    doneCount,
    openCount,
    totalCount: tasks.length,
    percent: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
    isDone: tasks.length > 0 && openCount === 0
  };
}

function renderPlannerTaskCard(task, section) {
  const isProgress = task.type === "progress";
  const diff = getPlannerTaskDiff(task);
  const bundle = app.state.bundles.find((item) => item.id === task.bundleId);
  const project = getTaskProject(task);
  const progressPercent = isProgress && task.targetValue ? Math.min(100, Math.round((Number(task.currentValue || 0) / Number(task.targetValue || 1)) * 100)) : 0;
  const remaining = isProgress ? Math.max(0, Number(task.targetValue || 0) - Number(task.currentValue || 0)) : 0;
  const progressDays = isProgress && task.createdAt ? Math.max(1, daysBetween(localDateString(new Date(task.createdAt)), localDateString()) + 1) : 0;
  const deadlineText = diff === null ? "未设截止" : diff < 0 ? `已超期 ${Math.abs(diff)} 天` : diff === 0 ? "今天到期" : `还剩 ${diff} 天`;
  const countdownText = isProgress && task.targetDeadline
    ? (() => {
        const targetDiff = daysBetween(localDateString(), task.targetDeadline);
        return targetDiff < 0 ? `目标期限已过 ${Math.abs(targetDiff)} 天` : `距期限 ${targetDiff} 天`;
      })()
    : "";
  const priorityClass = task.priority === "high" ? "is-high" : task.priority === "medium" ? "is-medium" : "is-low";
  return `
    <div class="planner-task-item ${priorityClass} ${section === "today" ? "is-today" : ""}">
      <div class="planner-task-head">
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <p class="item-meta">${[task.type === "progress" ? "进度型任务" : "普通任务", priorityLabel(task.priority), bundle?.title ? `事件包 ${bundle.title}` : "", project?.title ? `项目 ${project.title}` : ""].filter(Boolean).join(" / ")}</p>
        </div>
        <span class="planner-deadline-badge ${diff !== null && diff <= 0 ? "is-danger" : ""}">${deadlineText}</span>
      </div>
      <p class="item-meta">${task.deadline ? `截止 ${task.deadline}` : "暂未设置截止"}${task.postponeCount ? ` / 已顺延 ${task.postponeCount} 次` : ""}${countdownText ? ` / ${countdownText}` : ""}</p>
      ${isProgress ? `
        <div class="progress-bar"><div class="progress-fill" style="width:${progressPercent}%"></div></div>
        <p class="item-meta">进度 ${task.currentValue || 0}/${task.targetValue || 0}${task.unit || ""} / 剩余 ${remaining}${task.unit || ""} / 已进行 ${progressDays} 天</p>
      ` : ""}
      <div class="inline-actions tight">
        <button class="chip-button" data-task-action="complete" data-task-id="${task.id}" type="button">已完成</button>
        ${isProgress ? `<button class="chip-button" data-task-action="progress" data-task-id="${task.id}" type="button">更新进度 +1</button>` : ""}
        <button class="chip-button" data-task-manage="postpone" data-task-id="${task.id}" type="button">顺延</button>
        <button class="chip-button" data-task-manage="edit" data-task-id="${task.id}" type="button">编辑</button>
        <button class="chip-button" data-task-manage="delete" data-task-id="${task.id}" type="button">删除</button>
      </div>
    </div>
  `;
}

function renderPlannerBundleCard(bundle) {
  const meta = getPlannerBundleMeta(bundle);
  return `
    <div class="planner-bundle-item ${meta.isDone ? "is-done" : ""}">
      <div class="planner-task-head">
        <div>
          <strong>${escapeHtml(bundle.title)}</strong>
          <p class="item-meta">${bundle.deadline ? `总截止 ${bundle.deadline}` : "可选总截止日期"} / ${meta.totalCount} 项任务</p>
        </div>
        <span class="planner-deadline-badge">${meta.percent}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${meta.percent}%"></div></div>
      <p class="item-meta">已完成 ${meta.doneCount} 项 / 未完成 ${meta.openCount} 项${bundle.note ? ` / ${escapeHtml(bundle.note)}` : ""}</p>
      ${meta.tasks.length ? `<div class="planner-inline-list">${meta.tasks.slice(0, 4).map((task) => `<span class="mini-pill">${escapeHtml(task.title)}</span>`).join("")}</div>` : ""}
      <div class="inline-actions tight">
        <button class="chip-button" data-bundle-manage="complete" data-bundle-id="${bundle.id}" type="button">整包完成</button>
        <button class="chip-button" data-bundle-manage="postpone" data-bundle-id="${bundle.id}" type="button">整包顺延</button>
        <button class="chip-button" data-bundle-manage="edit" data-bundle-id="${bundle.id}" type="button">编辑</button>
        <button class="chip-button" data-bundle-manage="delete" data-bundle-id="${bundle.id}" type="button">删除</button>
      </div>
    </div>
  `;
}

function renderPlannerProjectCard(project) {
  const health = getProjectHealth(project.id);
  return `
    <div class="planner-project-item ${health.stateClass}">
      <div class="planner-task-head">
        <div>
          <strong>${escapeHtml(project.title)}</strong>
          <p class="item-meta">${project.stage || "未设阶段"} / ${project.yearlyGoal || "还没补长期主线"}</p>
        </div>
        <span class="planner-deadline-badge">${health.completionRate}%</span>
      </div>
      <p class="item-meta">下一步动作：${escapeHtml(project.nextAction || project.monthlyGoal || "待补充")}</p>
      <div class="inline-actions tight">
        <button class="chip-button" data-project-manage="open" data-project-id="${project.id}" type="button">查看详情</button>
        <button class="chip-button" data-project-manage="edit" data-project-id="${project.id}" type="button">编辑</button>
        <button class="chip-button" data-project-manage="delete" data-project-id="${project.id}" type="button">删除</button>
      </div>
    </div>
  `;
}

function bindPlannerProjectScreenEvents() {
  nodes.projectFilterCard.querySelectorAll("[data-task-action]").forEach((button) => {
    button.addEventListener("click", () => handlePlannerTaskAction(button.dataset.taskAction, button.dataset.taskId));
  });
  nodes.projectFilterCard.querySelectorAll("[data-task-manage]").forEach((button) => {
    button.addEventListener("click", () => handleTaskManage(button.dataset.taskManage, button.dataset.taskId));
  });
  nodes.dueTodayList.querySelectorAll("[data-task-action]").forEach((button) => {
    button.addEventListener("click", () => handlePlannerTaskAction(button.dataset.taskAction, button.dataset.taskId));
  });
  nodes.dueTodayList.querySelectorAll("[data-task-manage]").forEach((button) => {
    button.addEventListener("click", () => handleTaskManage(button.dataset.taskManage, button.dataset.taskId));
  });
  nodes.bundleList.querySelectorAll("[data-task-action]").forEach((button) => {
    button.addEventListener("click", () => handlePlannerTaskAction(button.dataset.taskAction, button.dataset.taskId));
  });
  nodes.bundleList.querySelectorAll("[data-task-manage]").forEach((button) => {
    button.addEventListener("click", () => handleTaskManage(button.dataset.taskManage, button.dataset.taskId));
  });
  nodes.projectList.querySelectorAll("[data-bundle-manage]").forEach((button) => {
    button.addEventListener("click", () => handleBundleManage(button.dataset.bundleManage, button.dataset.bundleId));
  });
  nodes.projectDetailCard.querySelectorAll("[data-project-manage]").forEach((button) => {
    button.addEventListener("click", () => handleProjectManage(button.dataset.projectManage, button.dataset.projectId));
  });
  const createProjectButton = document.querySelector("#plannerCreateProjectBtn");
  if (createProjectButton) {
    createProjectButton.addEventListener("click", () => openEntryModal("project"));
  }
}

async function handlePlannerTaskAction(action, taskId) {
  const task = app.state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }
  if (action === "complete") {
    task.status = "done";
    task.updatedAt = new Date().toISOString();
    await saveState();
    renderAll();
    showToast("任务已完成");
    return;
  }
  if (action === "progress") {
    const suggested = String(Number(task.currentValue || 0) + 1);
    const rawValue = prompt(`请输入当前进度（单位：${task.unit || "个"}）`, suggested);
    if (rawValue === null) {
      return;
    }
    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      alert("请输入正确的数字进度。");
      return;
    }
    task.currentValue = nextValue;
    task.progressLogs = [...(task.progressLogs || []), { value: task.currentValue, at: new Date().toISOString() }];
    if (Number(task.targetValue || 0) > 0 && Number(task.currentValue || 0) >= Number(task.targetValue || 0)) {
      task.status = "done";
    }
    task.updatedAt = new Date().toISOString();
    await saveState();
    renderAll();
    showToast(task.status === "done" ? "进度达标，任务已自动完成" : "进度已更新");
  }
}

function ensurePlannerPostponeDialog() {
  if (document.querySelector("#plannerPostponeDialog")) {
    return;
  }
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="plannerPostponeDialog" class="dialog">
      <form class="dialog-panel" id="plannerPostponeForm">
        <div class="dialog-head">
          <h2>顺延任务</h2>
          <button type="button" class="icon-button ghost" id="plannerPostponeCloseBtn">关闭</button>
        </div>
        <div class="dialog-fields">
          <p class="note" id="plannerPostponeTitle"></p>
          <label>
            <span>新日期</span>
            <input id="plannerPostponeDateInput" type="date">
          </label>
          <div class="inline-actions tight planner-quick-grid">
            <button type="button" class="chip-button" data-postpone-quick="tomorrow">明天</button>
            <button type="button" class="chip-button" data-postpone-quick="dayAfterTomorrow">后天</button>
            <button type="button" class="chip-button" data-postpone-quick="weekend">周末</button>
            <button type="button" class="chip-button" data-postpone-quick="nextWeek">下周</button>
          </div>
        </div>
        <menu class="dialog-actions">
          <button type="button" class="secondary-button" id="plannerPostponeCancelBtn">取消</button>
          <button type="submit" class="primary-button">保存新日期</button>
        </menu>
      </form>
    </dialog>
  `);

  const dialog = document.querySelector("#plannerPostponeDialog");
  const dateInput = document.querySelector("#plannerPostponeDateInput");
  document.querySelector("#plannerPostponeCloseBtn").addEventListener("click", () => dialog.close());
  document.querySelector("#plannerPostponeCancelBtn").addEventListener("click", () => dialog.close());
  dialog.querySelectorAll("[data-postpone-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      dateInput.value = getPlannerQuickDate(button.dataset.postponeQuick);
    });
  });
  document.querySelector("#plannerPostponeForm").addEventListener("submit", handlePlannerPostponeSubmit);
}

function openPlannerPostponeDialog(targetType, targetId) {
  ensurePlannerPostponeDialog();
  const dialog = document.querySelector("#plannerPostponeDialog");
  const titleNode = document.querySelector("#plannerPostponeTitle");
  const dateInput = document.querySelector("#plannerPostponeDateInput");
  let title = "";
  let current = addDays(localDateString(), 1);
  if (targetType === "task") {
    const task = app.state.tasks.find((item) => item.id === targetId);
    if (!task) {
      return;
    }
    title = `正在顺延任务：${task.title}`;
    current = task.deadline || current;
  }
  if (targetType === "bundle") {
    const bundle = app.state.bundles.find((item) => item.id === targetId);
    if (!bundle) {
      return;
    }
    title = `正在整包顺延：${bundle.title}`;
    current = bundle.deadline || current;
  }
  titleNode.textContent = title;
  dateInput.value = current;
  app.pendingPostponeTarget = { targetType, targetId };
  dialog.showModal();
}

function getPlannerQuickDate(mode) {
  const today = localDateString();
  if (mode === "tomorrow") {
    return addDays(today, 1);
  }
  if (mode === "dayAfterTomorrow") {
    return addDays(today, 2);
  }
  if (mode === "weekend") {
    const day = new Date().getDay();
    const diff = day === 0 ? 6 : 6 - day;
    return addDays(today, diff <= 0 ? 6 : diff);
  }
  if (mode === "nextWeek") {
    const day = new Date().getDay();
    const diff = day === 0 ? 1 : 8 - day;
    return addDays(today, diff);
  }
  return addDays(today, 1);
}

async function handlePlannerPostponeSubmit(event) {
  event.preventDefault();
  const dateInput = document.querySelector("#plannerPostponeDateInput");
  const dialog = document.querySelector("#plannerPostponeDialog");
  const nextDeadline = String(dateInput.value || "");
  if (!isValidDateString(nextDeadline)) {
    alert("请选择正确的新日期。");
    return;
  }

  const target = app.pendingPostponeTarget;
  if (!target) {
    dialog.close();
    return;
  }

  if (target.targetType === "task") {
    const task = app.state.tasks.find((item) => item.id === target.targetId);
    if (task) {
      const from = task.deadline || "";
      task.deadline = nextDeadline;
      task.postponeCount = Number(task.postponeCount || 0) + 1;
      task.postponeHistory = [...(task.postponeHistory || []), { from, to: nextDeadline, at: new Date().toISOString() }];
      task.updatedAt = new Date().toISOString();
      if (task.targetDeadline) {
        task.targetDeadline = nextDeadline;
      }
    }
  }

  if (target.targetType === "bundle") {
    const bundle = app.state.bundles.find((item) => item.id === target.targetId);
    if (bundle) {
      bundle.deadline = nextDeadline;
      bundle.updatedAt = new Date().toISOString();
      app.state.tasks.forEach((task) => {
        if (task.bundleId === bundle.id && task.status !== "done") {
          const from = task.deadline || "";
          task.deadline = nextDeadline;
          task.postponeCount = Number(task.postponeCount || 0) + 1;
          task.postponeHistory = [...(task.postponeHistory || []), { from, to: nextDeadline, at: new Date().toISOString() }];
          task.updatedAt = new Date().toISOString();
          if (task.targetDeadline) {
            task.targetDeadline = nextDeadline;
          }
        }
      });
    }
  }

  await saveState();
  app.pendingPostponeTarget = null;
  dialog.close();
  renderAll();
  showToast("顺延已保存");
}

function syncPlannerProjectHeaders() {
  const recentCard = nodes.dueTodayList.closest(".card");
  const taskCard = nodes.bundleList.closest(".card");
  const bundleCard = nodes.projectList.closest(".card");
  if (recentCard) {
    const title = recentCard.querySelector(".section-head h2");
    const button = recentCard.querySelector("[data-open-modal]");
    if (title) {
      title.textContent = "近日待办";
    }
    if (button) {
      button.textContent = "新建任务";
      button.dataset.openModal = "task";
    }
  }
  if (taskCard) {
    const title = taskCard.querySelector(".section-head h2");
    const button = taskCard.querySelector("[data-open-modal]");
    if (title) {
      title.textContent = "任务";
    }
    if (button) {
      button.textContent = "新建任务";
      button.dataset.openModal = "task";
    }
  }
  if (bundleCard) {
    const title = bundleCard.querySelector(".section-head h2");
    const button = bundleCard.querySelector("[data-open-modal]");
    if (title) {
      title.textContent = "事件包";
    }
    if (button) {
      button.textContent = "新建事件包";
      button.dataset.openModal = "bundle";
    }
  }
}

function cacheNodes() {
  Object.assign(nodes, {
    todayDateText: document.querySelector("#todayDateText"),
    emotionCard: document.querySelector("#emotionCard"),
    todayBrowserCard: document.querySelector("#todayBrowserCard"),
    todayPanoramaCard: document.querySelector("#todayPanoramaCard"),
    reviewStatusCard: document.querySelector("#reviewStatusCard"),
    todayQuickHabits: document.querySelector("#todayQuickHabits"),
    todayTimeline: document.querySelector("#todayTimeline"),
    habitOverviewCard: document.querySelector("#habitOverviewCard"),
    habitList: document.querySelector("#habitList"),
    contactList: document.querySelector("#contactList"),
    dueTodayList: document.querySelector("#dueTodayList"),
    projectFilterCard: document.querySelector("#projectFilterCard"),
    bundleList: document.querySelector("#bundleList"),
    projectList: document.querySelector("#projectList"),
    projectDetailCard: document.querySelector("#projectDetailCard"),
    knowledgeList: document.querySelector("#knowledgeList"),
    reviewInsightsCard: document.querySelector("#reviewInsightsCard"),
    statsVisualCard: document.querySelector("#statsVisualCard"),
    reviewPressureCard: document.querySelector("#reviewPressureCard"),
    reviewLinkCard: document.querySelector("#reviewLinkCard"),
    reviewPromptList: document.querySelector("#reviewPromptList"),
    reviewHistoryList: document.querySelector("#reviewHistoryList"),
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
    dailyReminderTime: document.querySelector("#dailyReminderTime"),
    weeklyReminderTime: document.querySelector("#weeklyReminderTime"),
    forcedReviewDays: document.querySelector("#forcedReviewDays"),
    autoBackupDays: document.querySelector("#autoBackupDays"),
    dailyTemplateInput: document.querySelector("#dailyTemplateInput"),
    weeklyTemplateInput: document.querySelector("#weeklyTemplateInput"),
    monthlyTemplateInput: document.querySelector("#monthlyTemplateInput"),
    quarterlyTemplateInput: document.querySelector("#quarterlyTemplateInput"),
    yearlyTemplateInput: document.querySelector("#yearlyTemplateInput"),
    settingsNote: document.querySelector("#settingsNote"),
    restoreInput: document.querySelector("#restoreInput"),
    restoreLastDeletedBtn: document.querySelector("#restoreLastDeletedBtn"),
    clearTrashBtn: document.querySelector("#clearTrashBtn"),
    toast: document.querySelector("#toast"),
    openSearchBtn: document.querySelector("#openSearchBtn"),
    searchInput: document.querySelector("#searchInput"),
    searchDateInput: document.querySelector("#searchDateInput"),
    searchResults: document.querySelector("#searchResults"),
    knowledgeFilterCard: document.querySelector("#knowledgeFilterCard"),
    forcedReviewDialog: document.querySelector("#forcedReviewDialog")
  });
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-screen-target]").forEach((button) => {
    button.addEventListener("click", () => setActiveScreen(button.dataset.screenTarget));
  });

  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openEntryModal(button.dataset.openModal));
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
  document.querySelectorAll("[data-close-dialog='forced-review']").forEach((button) => {
    button.addEventListener("click", () => nodes.forcedReviewDialog.close());
  });

  nodes.fabBtn.addEventListener("click", () => nodes.fabMenu.classList.toggle("hidden"));
  nodes.openSettingsBtn.addEventListener("click", openSettings);
  nodes.openSearchBtn.addEventListener("click", openSearch);
  document.querySelector("#saveSettingsBtn").addEventListener("click", saveSettings);
  document.querySelector("#enableNotificationBtn").addEventListener("click", enableNotifications);
  document.querySelector("#backupNowBtn").addEventListener("click", () => backupJson(true));
  document.querySelector("#exportCsvBtn").addEventListener("click", exportCsvBundle);
  document.querySelector("#exportMarkdownBtn").addEventListener("click", exportReviewMarkdown);
  nodes.restoreLastDeletedBtn.addEventListener("click", restoreLastDeleted);
  nodes.clearTrashBtn.addEventListener("click", clearTrash);
  document.querySelector("#generateDailyReviewBtn").addEventListener("click", () => openReviewComposer("daily"));
  nodes.restoreInput.addEventListener("change", restoreFromFile);
  nodes.searchInput.addEventListener("input", (event) => {
    app.searchQuery = event.target.value.trim();
    renderSearchResults();
  });
  nodes.searchDateInput.addEventListener("change", (event) => {
    app.searchDate = event.target.value;
    renderSearchResults();
  });
  document.querySelector("#forcedSubmitBtn").addEventListener("click", submitForcedReview);
  document.querySelector("#forcedSkipBtn").addEventListener("click", skipForcedReview);
  document.querySelector("#resetTemplatesBtn").addEventListener("click", resetReviewTemplates);
  nodes.entryForm.addEventListener("submit", handleDialogSubmit);
  nodes.dialogSubmitBtn.addEventListener("click", () => {
    handleDialogSubmit();
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

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

function createDefaultState() {
  return {
    schemaVersion: 1,
    meta: {
      lastBackupAt: "",
      installedAt: new Date().toISOString()
    },
    settings: {
      reminderDailyTime: "22:00",
      reminderWeeklyTime: "20:00",
      forcedReviewDays: 14,
      autoBackupDays: 7,
      notificationPermissionAskedAt: "",
      reviewTemplates: JSON.parse(JSON.stringify(defaultReviewTemplates))
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
    trash: []
  };
}

function maybeSeedSampleData() {
  if (app.state.records.length || app.state.habits.length || app.state.projects.length) {
    return;
  }

  const today = localDateString();
  app.state.records.push({
    id: uid(),
    date: today,
    createdAt: new Date().toISOString(),
    content: "欢迎来到你的外置大脑。这里的每一条记录，都会成为之后复盘的素材。",
    tags: ["开始"]
  });
  app.state.emotions.push({
    id: uid(),
    date: today,
    level: 4,
    note: "今天把第一版产品搭起来。"
  });
  app.state.habits.push({
    id: uid(),
    name: "睡前复盘",
    createdAt: new Date().toISOString()
  });
  app.state.projects.push({
    id: uid(),
    title: "我的外置大脑 APP",
    stage: "MVP 开发",
    monthlyGoal: "完成离线可用首版",
    recentProgress: "已建立 6 Tab、备份恢复和复盘引擎骨架。"
  });
  app.activeProjectId = app.state.projects[0].id;
  saveState();
}

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
      `
    },
    habit: {
      title: preset.id ? "编辑习惯" : "新增习惯",
      fields: `
        <input type="hidden" name="entryType" value="habit">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>习惯名称</span><input name="name" required placeholder="例如：背单词" value="${escapeHtml(preset.name || "")}"></label>
      `
    },
    contact: {
      title: preset.id ? "编辑人物" : "新增人物",
      fields: `
        <input type="hidden" name="entryType" value="contact">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>姓名</span><input name="name" required value="${escapeHtml(preset.name || "")}"></label>
        <label><span>关系标签</span><input name="relation" placeholder="同学 / 导师 / 朋友" value="${escapeHtml(preset.relation || "")}"></label>
        <label><span>联系方式</span><input name="contactInfo" value="${escapeHtml(preset.contactInfo || "")}"></label>
        <label><span>生日</span><input name="birthday" type="date" value="${escapeHtml(preset.birthday || "")}"></label>
        <label><span>备注</span><textarea name="note">${escapeHtml(preset.note || "")}</textarea></label>
      `
    },
    bundle: {
      title: preset.id ? "编辑事件包" : "新增事件包",
      fields: `
        <input type="hidden" name="entryType" value="bundle">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>事件包名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>颜色</span><input name="color" type="color" value="${escapeHtml(preset.color || "#5B7C99")}"></label>
        <label><span>总截止</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
      `
    },
    task: {
      title: preset.id ? "编辑任务" : "新增任务",
      fields: `
        <input type="hidden" name="entryType" value="task">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>任务名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>所属事件包</span>${bundleSelectHtml("bundleId", preset.bundleId || "")}</label>
        <label><span>类型</span>
          <select name="taskType">
            <option value="normal" ${preset.type !== "progress" ? "selected" : ""}>普通任务</option>
            <option value="progress" ${preset.type === "progress" ? "selected" : ""}>进度型任务</option>
          </select>
        </label>
        <label><span>截止日期</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
        <label><span>优先级</span>
          <select name="priority">
            <option value="high" ${preset.priority === "high" ? "selected" : ""}>高</option>
            <option value="medium" ${!preset.priority || preset.priority === "medium" ? "selected" : ""}>中</option>
            <option value="low" ${preset.priority === "low" ? "selected" : ""}>低</option>
          </select>
        </label>
        <label><span>目标单位（进度型任务可填）</span><input name="unit" placeholder="页 / 分钟 / 个" value="${escapeHtml(preset.unit || "")}"></label>
        <label><span>目标值（进度型任务可填）</span><input name="targetValue" type="number" min="1" value="${preset.targetValue || ""}"></label>
        <label><span>当前进度</span><input name="currentValue" type="number" min="0" value="${preset.currentValue ?? 0}"></label>
      `
    },
    project: {
      title: preset.id ? "编辑项目" : "新增长期项目",
      fields: `
        <input type="hidden" name="entryType" value="project">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>项目名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>当前阶段</span><input name="stage" placeholder="例如：信息收集" value="${escapeHtml(preset.stage || "")}"></label>
        <label><span>本月任务</span><input name="monthlyGoal" value="${escapeHtml(preset.monthlyGoal || "")}"></label>
        <label><span>最近进展</span><textarea name="recentProgress">${escapeHtml(preset.recentProgress || "")}</textarea></label>
        <label><span>项目信息收集</span><textarea name="infoInbox">${escapeHtml(preset.infoInbox || "")}</textarea></label>
        <label><span>项目笔记</span><textarea name="notes">${escapeHtml(preset.notes || "")}</textarea></label>
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
            <option value="交往" ${preset.category === "交往" ? "selected" : ""}>交往</option>
            <option value="工作" ${preset.category === "工作" ? "selected" : ""}>工作</option>
            <option value="爱好" ${preset.category === "爱好" ? "selected" : ""}>爱好</option>
          </select>
        </label>
        <label><span>分类路径</span><input name="path" placeholder="例如：生活 / 洗衣 / 防串色" value="${escapeHtml(preset.path || "")}"></label>
        <label><span>正文</span><textarea name="body" required>${escapeHtml(preset.body || "")}</textarea></label>
        <label><span>标签（逗号分隔）</span><input name="tags" value="${escapeHtml((preset.tags || []).join(", "))}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
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
            ${emotionOptions.map((item) => `<option value="${item.value}" ${Number(preset.level) === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </label>
        <label><span>一句话备注</span><textarea name="note" placeholder="今天发生了什么？">${escapeHtml(preset.note || "")}</textarea></label>
      `
    }
  };

  const config = configs[type];
  nodes.dialogTitle.textContent = config.title;
  nodes.dialogFields.innerHTML = config.fields;
  nodes.entryDialog.showModal();
}

function openReviewComposer(kind) {
  const questions = getReviewQuestions(kind);
  nodes.dialogTitle.textContent = reviewKindLabel(kind);
  nodes.dialogFields.innerHTML = `
    <input type="hidden" name="entryType" value="review">
    <input type="hidden" name="reviewKind" value="${kind}">
    ${questions.map((question, index) => `
      <label><span>${question}</span><textarea name="answer_${index}" required></textarea></label>
    `).join("")}
  `;
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

  const handlers = {
    record: () => {
      const id = String(formData.get("id") || "");
      const payload = {
        date: String(formData.get("date") || app.selectedDate),
        content: String(formData.get("content")).trim(),
        tags: splitTags(formData.get("tags"))
      };
      if (id) {
        const record = app.state.records.find((item) => item.id === id);
        if (record) {
          Object.assign(record, payload);
        }
        return;
      }
      app.state.records.unshift({
        id: uid(),
        createdAt: new Date().toISOString(),
        ...payload
      });
    },
    habit: () => {
      const id = String(formData.get("id") || "");
      if (id) {
        const habit = app.state.habits.find((item) => item.id === id);
        if (habit) {
          habit.name = String(formData.get("name")).trim();
        }
        return;
      }
      app.state.habits.push({
        id: uid(),
        name: String(formData.get("name")).trim(),
        createdAt: new Date().toISOString()
      });
    },
    contact: () => {
      const payload = {
        name: String(formData.get("name")).trim(),
        relation: String(formData.get("relation") || "").trim(),
        contactInfo: String(formData.get("contactInfo") || "").trim(),
        birthday: String(formData.get("birthday") || ""),
        note: String(formData.get("note") || "").trim()
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const contact = app.state.contacts.find((item) => item.id === id);
        if (contact) {
          Object.assign(contact, payload);
        }
        return;
      }
      app.state.contacts.push({
        id: uid(),
        ...payload
      });
    },
    bundle: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        projectId: String(formData.get("projectId") || ""),
        color: String(formData.get("color")),
        deadline: String(formData.get("deadline") || "")
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const bundle = app.state.bundles.find((item) => item.id === id);
        if (bundle) {
          Object.assign(bundle, payload);
        }
        return;
      }
      app.state.bundles.push({ id: uid(), ...payload });
    },
    task: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        projectId: String(formData.get("projectId") || ""),
        bundleId: String(formData.get("bundleId") || ""),
        type: String(formData.get("taskType")),
        deadline: String(formData.get("deadline") || ""),
        priority: String(formData.get("priority")),
        unit: String(formData.get("unit") || "").trim(),
        targetValue: Number(formData.get("targetValue") || 0),
        currentValue: Number(formData.get("currentValue") || 0)
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const task = app.state.tasks.find((item) => item.id === id);
        if (task) {
          Object.assign(task, payload);
        }
        return;
      }
      app.state.tasks.push({
        id: uid(),
        ...payload,
        status: "todo",
        postponeCount: 0,
        createdAt: new Date().toISOString()
      });
    },
    project: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        yearlyGoal: String(formData.get("yearlyGoal") || "").trim(),
        stage: String(formData.get("stage") || "").trim(),
        monthlyGoal: String(formData.get("monthlyGoal") || "").trim(),
        weeklyFocus: String(formData.get("weeklyFocus") || "").trim(),
        nextAction: String(formData.get("nextAction") || "").trim(),
        recentProgress: String(formData.get("recentProgress") || "").trim(),
        infoInbox: String(formData.get("infoInbox") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
        relatedContactIds: formData.getAll("relatedContactIds").map((item) => String(item))
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const project = app.state.projects.find((item) => item.id === id);
        if (project) {
          Object.assign(project, payload);
        }
        return;
      }
      const projectId = uid();
      app.state.projects.push({ id: projectId, ...payload });
      app.activeProjectId = projectId;
    },
    knowledge: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        category: String(formData.get("category")),
        path: String(formData.get("path") || "").trim(),
        body: String(formData.get("body")).trim(),
        tags: splitTags(formData.get("tags")),
        projectId: String(formData.get("projectId") || ""),
        status: String(formData.get("status"))
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.knowledge.find((knowledge) => knowledge.id === id);
        if (item) {
          Object.assign(item, payload);
        }
        return;
      }
      app.state.knowledge.unshift({
        id: uid(),
        ...payload,
        starred: false,
        createdAt: new Date().toISOString()
      });
    },
    emotion: () => {
      const targetDate = String(formData.get("date") || app.selectedDate);
      const existing = app.state.emotions.find((item) => item.date === targetDate);
      const payload = {
        id: existing?.id || uid(),
        date: targetDate,
        level: Number(formData.get("level")),
        note: String(formData.get("note") || "").trim()
      };
      app.state.emotions = app.state.emotions.filter((item) => item.date !== targetDate).concat(payload);
    },
    review: () => {
      const kind = String(formData.get("reviewKind"));
      const questions = getReviewQuestions(kind);
      const answers = questions.map((question, index) => ({
        question,
        answer: String(formData.get(`answer_${index}`)).trim()
      }));
      app.state.reviews.unshift({
        id: uid(),
        kind,
        date: localDateString(),
        createdAt: new Date().toISOString(),
        answers,
        snapshot: buildReviewSnapshot()
      });

      if (kind === "daily" && answers[1]?.answer) {
        app.state.tasks.push({
          id: uid(),
          title: answers[1].answer,
          bundleId: "",
          type: "normal",
          deadline: addDays(localDateString(), 1),
          priority: "high",
          status: "todo",
          unit: "",
          targetValue: 0,
          currentValue: 0,
          postponeCount: 0,
          createdAt: new Date().toISOString(),
          autoGeneratedFromReview: true
        });
      }
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
    alert("保存失败。请再试一次；如果还是不行，我继续帮你修。");
  }
}

function buildReviewSnapshot() {
  const today = localDateString();
  return {
    records: app.state.records.filter((item) => item.date === today).length,
    completedHabits: app.state.habits.filter((habit) => getHabitStatus(habit.id, today) === "done").length,
    totalHabits: app.state.habits.length,
    dueTasks: getDueTasks().length
  };
}

function renderAll() {
  nodes.todayDateText.textContent = formatLongDate(new Date());
  if (!app.activeProjectId && app.state.projects[0]) {
    app.activeProjectId = app.state.projects[0].id;
  }
  renderEmotionCard();
  renderTodayBrowser();
  renderDayPanorama();
  renderReviewStatus();
  renderTodayHabits();
  renderTimeline();
  renderHabits();
  renderContacts();
  renderProjects();
  renderKnowledge();
  renderReviewInsights();
  renderStatsVisual();
  renderReviews();
}

function renderEmotionCard() {
  const todayEmotion = getEmotionByDate(app.selectedDate);
  const emotion = todayEmotion || emotionOptions[3];
  const trend = getEmotionTrend(app.emotionWindowDays);
  nodes.emotionCard.style.background = `linear-gradient(135deg, ${emotion.color} 0%, rgba(255,255,255,.92) 100%)`;
  nodes.emotionCard.innerHTML = `
    <div class="section-head">
      <h2>${app.selectedDate === localDateString() ? "今日情绪" : "当天情绪"}</h2>
      <div class="inline-actions tight">
        <button class="chip-button ${app.emotionWindowDays === 7 ? "star-button is-active" : ""}" data-emotion-window="7">7天</button>
        <button class="chip-button ${app.emotionWindowDays === 30 ? "star-button is-active" : ""}" data-emotion-window="30">30天</button>
        <button class="text-button" id="editEmotionBtn">更新</button>
      </div>
    </div>
    <div class="emotion-top">
      <div class="emotion-face">${emotion.face}</div>
      <div class="emotion-meta">
        <strong>${emotion.label}</strong>
        <span class="subtle">${todayEmotion ? "已记录今日心情" : "还没写，先给今天一个表情。"}</span>
      </div>
    </div>
    <p class="emotion-note">${todayEmotion?.note || "记录今天的心情，会自动进入你的复盘素材池。"}</p>
    <div class="section-block">
      ${renderBarRows(`最近 ${app.emotionWindowDays} 天情绪分布`, emotionOptions.map((option) => ({
        label: `${option.face} ${option.label}`,
        value: trend.counts[option.value] || 0
      })))}
    </div>
  `;
  document.querySelector("#editEmotionBtn").addEventListener("click", () => openEntryModal("emotion", todayEmotion || { date: app.selectedDate }));
  nodes.emotionCard.querySelectorAll("[data-emotion-window]").forEach((button) => {
    button.addEventListener("click", () => {
      app.emotionWindowDays = Number(button.dataset.emotionWindow);
      renderEmotionCard();
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
              <strong>${emotion ? emotion.face : "•"}</strong>
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
  const dayTasks = app.state.tasks.filter((item) => item.deadline === date);
  const dayKnowledge = app.state.knowledge.filter((item) => item.createdAt && localDateString(new Date(item.createdAt)) === date);
  const dayReviews = app.state.reviews.filter((item) => item.date === date);
  const dayHabitStats = app.state.habits.map((habit) => ({
    name: habit.name,
    status: getHabitStatus(habit.id, date)
  }));
  const completedHabits = dayHabitStats.filter((item) => item.status === "done" || item.status === "patched");
  const missedHabits = dayHabitStats.filter((item) => item.status === "miss");
  const inProgressTasks = dayTasks.filter((item) => item.status !== "done");
  const doneTasks = dayTasks.filter((item) => item.status === "done");
  const birthdays = app.state.contacts.filter((item) => item.birthday && item.birthday.slice(5) === date.slice(5));
  const linkedProjects = app.state.projects.filter((project) => {
    const relatedTask = app.state.tasks.some((task) => task.projectId === project.id && task.deadline === date);
    const relatedKnowledge = dayKnowledge.some((item) => item.projectId === project.id);
    return relatedTask || relatedKnowledge;
  });

  nodes.todayPanoramaCard.innerHTML = `
    <div class="section-head">
      <h2>当天全景</h2>
      <span class="pill">${date === localDateString() ? "今天" : date}</span>
    </div>
    <div class="project-detail-grid">
      <div class="detail-tile">
        <span class="item-meta">记录</span>
        <strong>${dayRecords.length}</strong>
        <p class="item-meta">${dayRecords[0] ? `${dayRecords[0].content.slice(0, 28)}${dayRecords[0].content.length > 28 ? "..." : ""}` : "当天还没有记录"}</p>
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
        <span class="item-meta">任务推进</span>
        <strong>${doneTasks.length}/${dayTasks.length || 0}</strong>
        <p class="item-meta">${inProgressTasks[0] ? `待推进：${inProgressTasks[0].title}` : "当天没有截止任务"}</p>
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
          <strong>复盘素材</strong>
          <p class="item-meta">${dayReviews.length ? `${dayReviews.length} 条复盘记录` : "当天还没有写复盘"}</p>
        </div>
        <div class="detail-tile">
          <strong>人际提醒</strong>
          <p class="item-meta">${birthdays.length ? birthdays.map((item) => item.name).join(" / ") : "当天没有生日提醒"}</p>
        </div>
        <div class="detail-tile">
          <strong>关联项目</strong>
          <p class="item-meta">${linkedProjects.length ? linkedProjects.map((item) => item.title).slice(0, 3).join(" / ") : "当天没有明显项目联动"}</p>
        </div>
      </div>
    </div>
  `;
}

function renderReviewStatus() {
  const latestReview = app.state.reviews[0];
  const overdueDays = getReviewOverdueDays();
  const stageText =
    overdueDays <= 0 ? "未超期" : overdueDays <= 6 ? "0-6 天提醒档" : overdueDays <= 13 ? "7-13 天加强档" : "14 天以上强制档";

  nodes.reviewStatusCard.innerHTML = `
    <div class="section-head">
      <h2>复盘状态</h2>
      <span class="badge ${overdueDays > 0 ? "warning" : "success"}">${stageText}</span>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">距上次复盘</span><strong>${latestReview ? daysBetween(latestReview.date, localDateString()) : "∞"} 天</strong></div>
      <div class="metric"><span class="item-meta">强制阈值</span><strong>${app.state.settings.forcedReviewDays} 天</strong></div>
      <div class="metric"><span class="item-meta">累计复盘</span><strong>${app.state.reviews.length} 次</strong></div>
    </div>
    <div class="review-banner">
      <span class="subtle">今天最重要的动作，是继续让自己打开这个界面。</span>
      <button class="primary-button" id="reviewNowBtn">去复盘</button>
    </div>
  `;

  document.querySelector("#reviewNowBtn").addEventListener("click", () => {
    setActiveScreen("reviews");
    openReviewComposer("daily");
  });
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
          <strong>${habit.name}</strong>
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
  renderCollection(nodes.todayTimeline, items, (record) => `
    <div class="timeline-item">
      <div class="list-item-head">
        <strong>${record.content}</strong>
        <span class="timestamp">${formatTime(record.createdAt)}</span>
      </div>
      <p>${record.tags.map((tag) => `<span class="pill">${tag}</span>`).join(" ")}</p>
      <div class="inline-actions tight">
        <button class="chip-button" data-record-manage="edit" data-record-id="${record.id}">编辑</button>
        <button class="chip-button" data-record-manage="delete" data-record-id="${record.id}">删除</button>
      </div>
    </div>
  `);
  nodes.todayTimeline.querySelectorAll("[data-record-manage]").forEach((button) => {
    button.addEventListener("click", () => handleRecordManage(button.dataset.recordManage, button.dataset.recordId));
  });
}

function renderHabits() {
  renderHabitOverview();
  renderCollection(nodes.habitList, app.state.habits, (habit) => {
    const doneDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "done").length;
    const missDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "miss").length;
    const patchedDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "patched").length;
    const monthStats = getHabitMonthStats(habit.id, localDateString().slice(0, 7));
    return `
      <div class="list-item">
        <div class="list-item-head">
          <strong>${habit.name}</strong>
          <span class="badge">${computeStreak(habit.id)} 天 streak</span>
        </div>
        <p class="item-meta">完成 ${doneDays} 次，补卡 ${patchedDays} 次，打叉 ${missDays} 次。本月完成率 ${monthStats.completionRate}% 。</p>
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
        <div class="calendar-wrap">${renderHabitCalendar(habit.id, localDateString().slice(0, 7))}</div>
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

function renderContacts() {
  renderCollection(nodes.contactList, app.state.contacts, (contact) => `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${contact.name}</strong>
        <span class="pill">${contact.relation || "未分类"}</span>
      </div>
      <p class="item-meta">${[contact.contactInfo, contact.birthday, contact.note].filter(Boolean).join(" · ") || "还没有补充细节。"}</p>
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
          <p class="item-meta">称呼/关系：${contact.relation || "未填写"}</p>
          <p class="item-meta">联系方式：${contact.contactInfo || "未填写"}</p>
          <p class="item-meta">生日：${contact.birthday || "未填写"}</p>
          <p class="item-meta">备注：${contact.note || "未填写"}</p>
        </div>
      ` : ""}
    </div>
  `);
  nodes.contactList.querySelectorAll("[data-contact-manage]").forEach((button) => {
    button.addEventListener("click", () => handleContactManage(button.dataset.contactManage, button.dataset.contactId));
  });
}

function renderProjects() {
  renderProjectFilters();
  renderTaskGroups();
  nodes.dueTodayList.querySelectorAll("[data-task-action]").forEach((button) => bindTaskAction(button));
  nodes.dueTodayList.querySelectorAll("[data-task-manage]").forEach((button) => {
    button.addEventListener("click", () => handleTaskManage(button.dataset.taskManage, button.dataset.taskId));
  });

  renderCollection(nodes.bundleList, app.state.bundles, (bundle) => {
    const bundleTasks = app.state.tasks.filter((task) => task.bundleId === bundle.id);
    const completed = bundleTasks.filter((task) => task.status === "done").length;
    const percent = bundleTasks.length ? Math.round((completed / bundleTasks.length) * 100) : 0;
    return `
      <div class="bundle-card">
        <div class="bundle-head">
          <div>
            <strong>${bundle.title}</strong>
            <p class="item-meta">${bundle.deadline ? `总截止 ${bundle.deadline}` : "未设置总截止"}</p>
          </div>
          <span class="pill" style="background:${bundle.color}22;color:${bundle.color}">${bundleTasks.length} 项</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="inline-actions tight">
          <button class="chip-button" data-bundle-manage="edit" data-bundle-id="${bundle.id}">编辑</button>
          <button class="chip-button" data-bundle-manage="postpone" data-bundle-id="${bundle.id}">整包顺延</button>
          <button class="chip-button" data-bundle-manage="delete" data-bundle-id="${bundle.id}">删除</button>
        </div>
      </div>
    `;
  });
  nodes.bundleList.querySelectorAll("[data-bundle-manage]").forEach((button) => {
    button.addEventListener("click", () => handleBundleManage(button.dataset.bundleManage, button.dataset.bundleId));
  });

  renderCollection(nodes.projectList, app.state.projects, (project) => `
    <div class="project-card">
      <div class="list-item-head">
        <strong>${project.title}</strong>
        <span class="pill">${project.stage || "未设阶段"}</span>
      </div>
      <p class="item-meta">本月任务：${project.monthlyGoal || "待补充"}</p>
      <p class="item-meta">最近进展：${project.recentProgress || "待补充"}</p>
      <div class="inline-actions tight">
        <button class="chip-button" data-project-manage="open" data-project-id="${project.id}">${app.activeProjectId === project.id ? "已展开" : "查看详情"}</button>
        <button class="chip-button" data-project-manage="edit" data-project-id="${project.id}">编辑</button>
        <button class="chip-button" data-project-manage="delete" data-project-id="${project.id}">删除</button>
      </div>
    </div>
  `);
  nodes.projectList.querySelectorAll("[data-project-manage]").forEach((button) => {
    button.addEventListener("click", () => handleProjectManage(button.dataset.projectManage, button.dataset.projectId));
  });
  renderProjectDetail();
}

function renderTaskGroups() {
  const tasks = getFilteredTasks();
  if (!tasks.length) {
    nodes.dueTodayList.innerHTML = document.querySelector("#emptyStateTemplate").innerHTML;
    return;
  }
  const groups = [
    { key: "overdue", title: "已逾期" },
    { key: "today", title: "今天要处理" },
    { key: "upcoming", title: "7 天内" },
    { key: "later", title: "更后面" },
    { key: "unscheduled", title: "未设截止" }
  ];
  nodes.dueTodayList.innerHTML = groups
    .map((group) => {
      const items = tasks.filter((task) => getTaskBucket(task) === group.key);
      if (!items.length) {
        return "";
      }
      return `
        <div class="section-block">
          <div class="section-head">
            <h3>${group.title}</h3>
            <span class="pill">${items.length}</span>
          </div>
          <div class="list">
            ${items.map((task) => renderTaskCard(task)).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderProjectFilters() {
  const summary = getTaskWindowSummary();
  nodes.projectFilterCard.innerHTML = `
    <div class="section-head">
      <h2>任务筛选</h2>
      <button class="text-button" id="resetTaskFiltersBtn">重置</button>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">逾期</span><strong>${summary.overdue}</strong></div>
      <div class="metric"><span class="item-meta">今天</span><strong>${summary.today}</strong></div>
      <div class="metric"><span class="item-meta">7天内</span><strong>${summary.upcoming}</strong></div>
    </div>
    <div class="filter-row">
      <select id="taskProjectFilter">
        <option value="">全部项目</option>
        ${app.state.projects.map((project) => `<option value="${project.id}" ${app.taskFilter.projectId === project.id ? "selected" : ""}>${project.title}</option>`).join("")}
      </select>
      <select id="taskWindowFilter">
        <option value="focus" ${app.taskFilter.window === "focus" ? "selected" : ""}>重点窗口</option>
        <option value="overdue" ${app.taskFilter.window === "overdue" ? "selected" : ""}>只看逾期</option>
        <option value="today" ${app.taskFilter.window === "today" ? "selected" : ""}>只看今天</option>
        <option value="upcoming" ${app.taskFilter.window === "upcoming" ? "selected" : ""}>7天内</option>
        <option value="all" ${app.taskFilter.window === "all" ? "selected" : ""}>全部日期</option>
      </select>
      <select id="taskStatusFilter">
        <option value="open" ${app.taskFilter.status === "open" ? "selected" : ""}>未完成</option>
        <option value="done" ${app.taskFilter.status === "done" ? "selected" : ""}>已完成</option>
        <option value="all" ${app.taskFilter.status === "all" ? "selected" : ""}>全部状态</option>
      </select>
      <select id="taskPriorityFilter">
        <option value="">全部优先级</option>
        <option value="high" ${app.taskFilter.priority === "high" ? "selected" : ""}>高</option>
        <option value="medium" ${app.taskFilter.priority === "medium" ? "selected" : ""}>中</option>
        <option value="low" ${app.taskFilter.priority === "low" ? "selected" : ""}>低</option>
      </select>
    </div>
    <div class="filter-row">
      <button class="chip-button" id="batchCompleteTasksBtn">批量完成当前列表</button>
      <button class="chip-button" id="batchPostponeTasksBtn">批量顺延 1 天</button>
      <button class="chip-button" id="batchDeleteDoneTasksBtn">批量删已完成</button>
    </div>
  `;
  document.querySelector("#taskProjectFilter").addEventListener("change", (event) => {
    app.taskFilter.projectId = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskStatusFilter").addEventListener("change", (event) => {
    app.taskFilter.status = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskWindowFilter").addEventListener("change", (event) => {
    app.taskFilter.window = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskPriorityFilter").addEventListener("change", (event) => {
    app.taskFilter.priority = event.target.value;
    renderProjects();
  });
  document.querySelector("#resetTaskFiltersBtn").addEventListener("click", () => {
    app.taskFilter = { projectId: "", status: "open", priority: "", window: "focus" };
    renderProjects();
  });
  document.querySelector("#batchCompleteTasksBtn").addEventListener("click", () => batchTaskAction("complete"));
  document.querySelector("#batchPostponeTasksBtn").addEventListener("click", () => batchTaskAction("postpone"));
  document.querySelector("#batchDeleteDoneTasksBtn").addEventListener("click", () => batchTaskAction("delete-done"));
}

function renderTaskCard(task) {
  const isProgress = task.type === "progress";
  const percent = isProgress && task.targetValue ? Math.min(100, Math.round((task.currentValue / task.targetValue) * 100)) : 0;
  const bundle = app.state.bundles.find((item) => item.id === task.bundleId);
  const project = getTaskProject(task);
  const dateLabel = describeTaskTiming(task.deadline);
  return `
    <div class="list-item">
      <div class="task-meta">
        <strong>${task.title}</strong>
        <span class="badge ${task.priority === "high" ? "warning" : ""}">${priorityLabel(task.priority)}</span>
      </div>
      <p class="item-meta">${project ? `项目：${project.title} · ` : ""}${bundle ? `事件包：${bundle.title} · ` : ""}${task.deadline ? `截止 ${task.deadline}（${dateLabel}）` : "无截止"}${task.postponeCount ? ` · 已顺延 ${task.postponeCount} 次` : ""}</p>
      ${isProgress ? `<div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div><p class="item-meta">${task.currentValue}/${task.targetValue} ${task.unit || ""}</p>` : ""}
      <div class="inline-actions">
        <button class="chip-button" data-task-action="done" data-task-id="${task.id}">完成</button>
        <button class="chip-button" data-task-action="postpone" data-task-id="${task.id}">顺延日期</button>
        ${isProgress ? `<button class="chip-button" data-task-action="progress" data-task-id="${task.id}">+1 进度</button>` : ""}
        <button class="chip-button" data-task-manage="edit" data-task-id="${task.id}">编辑</button>
        <button class="chip-button" data-task-manage="delete" data-task-id="${task.id}">删除</button>
      </div>
    </div>
  `;
}

function bindTaskAction(button) {
  button.addEventListener("click", async () => {
    const task = app.state.tasks.find((item) => item.id === button.dataset.taskId);
    if (!task) {
      return;
    }

    if (button.dataset.taskAction === "done") {
      task.status = "done";
    }
    if (button.dataset.taskAction === "postpone") {
      const current = task.deadline || addDays(localDateString(), 1);
      const nextDeadline = prompt("请输入新的截止日期（格式：2026-08-27）", current);
      if (!nextDeadline) {
        return;
      }
      if (!isValidDateString(nextDeadline)) {
        alert("日期格式不对，请按 2026-08-27 这种格式填写。");
        return;
      }
      task.deadline = nextDeadline;
      task.postponeCount += 1;
    }
    if (button.dataset.taskAction === "progress") {
      task.currentValue += 1;
      if (task.targetValue && task.currentValue >= task.targetValue) {
        task.status = "done";
      }
    }

    await saveState();
    renderAll();
  });
}

function renderProjectDetail() {
  const project = app.state.projects.find((item) => item.id === app.activeProjectId);
  if (!project) {
    nodes.projectDetailCard.innerHTML = document.querySelector("#emptyStateTemplate").innerHTML;
    return;
  }
  const relatedKnowledge = app.state.knowledge.filter((item) => item.projectId === project.id);
  const relatedTasks = app.state.tasks.filter((item) => {
    const bundle = app.state.bundles.find((bundleItem) => bundleItem.id === item.bundleId);
    return item.projectId === project.id || bundle?.projectId === project.id;
  });
  const openTasks = relatedTasks.filter((item) => item.status !== "done");
  const doneTasks = relatedTasks.filter((item) => item.status === "done");
  const bundles = app.state.bundles.filter((item) => item.projectId === project.id);
  const relatedReviews = app.state.reviews.filter((review) =>
    review.answers.some((answer) => answer.answer.includes(project.title))
  );
  nodes.projectDetailCard.innerHTML = `
    <div class="section-head">
      <h2>项目详情</h2>
      <span class="pill">${project.title}</span>
    </div>
    <div class="project-detail-grid">
      <div class="detail-tile">
        <span class="item-meta">当前阶段</span>
        <strong>${project.stage || "未设置"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">本月任务</span>
        <strong>${project.monthlyGoal || "待补充"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">相关任务</span>
        <strong>${relatedTasks.length} 项</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">相关经验</span>
        <strong>${relatedKnowledge.length} 条</strong>
      </div>
    </div>
    <div class="inline-actions">
      <button class="chip-button" id="generateProjectTaskBtn">月任务生成待办</button>
      <button class="chip-button" id="quickProjectNoteBtn">补最近进展</button>
    </div>
    <div class="project-section">
      <h3>当前待推进任务</h3>
      <div class="project-task-list">
        ${openTasks.length ? openTasks.slice(0, 5).map((task) => `<div class="detail-tile"><strong>${task.title}</strong><p class="item-meta">${task.deadline || "无截止"} · ${priorityLabel(task.priority)}</p></div>`).join("") : `<p class="item-meta">当前没有未完成任务。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>已完成任务</h3>
      <div class="project-task-list">
        ${doneTasks.length ? doneTasks.slice(0, 5).map((task) => `<div class="detail-tile"><strong>${task.title}</strong><p class="item-meta">已完成 · ${task.deadline || "无截止"}</p></div>`).join("") : `<p class="item-meta">还没有完成任务记录。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目事件包</h3>
      <div class="project-task-list">
        ${bundles.length ? bundles.map((bundle) => `<div class="detail-tile"><strong>${bundle.title}</strong><p class="item-meta">${bundle.deadline || "未设总截止"}</p></div>`).join("") : `<p class="item-meta">还没有关联事件包。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>最近进展</h3>
      <p class="item-meta">${project.recentProgress || "还没写最近进展。"}</p>
    </div>
    <div class="project-section">
      <h3>信息收集</h3>
      <p class="item-meta">${project.infoInbox || "还没记录信息收集内容。"}</p>
    </div>
    <div class="project-section">
      <h3>项目笔记</h3>
      <p class="item-meta">${project.notes || "还没写项目笔记。"}</p>
    </div>
    <div class="project-section">
      <h3>关联经验</h3>
      <div class="project-task-list">
        ${relatedKnowledge.length ? relatedKnowledge.slice(0, 4).map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.category} · ${item.status}</p></div>`).join("") : `<p class="item-meta">还没有关联经验。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>关联复盘</h3>
      <div class="project-task-list">
        ${relatedReviews.length ? relatedReviews.slice(0, 4).map((review) => `<div class="detail-tile"><strong>${reviewKindLabel(review.kind)} ${review.date}</strong><p class="item-meta">${review.answers[0]?.answer || "无摘要"}</p></div>`).join("") : `<p class="item-meta">还没有明显提到这个项目的复盘。</p>`}
      </div>
    </div>
  `;
  document.querySelector("#generateProjectTaskBtn").addEventListener("click", () => generateProjectTask(project.id));
  document.querySelector("#quickProjectNoteBtn").addEventListener("click", () => openEntryModal("project", project));
}

function renderKnowledge() {
  renderKnowledgeFilters();
  const filtered = getFilteredKnowledge();
  renderCollection(nodes.knowledgeList, filtered, (item) => {
    const project = app.state.projects.find((projectItem) => projectItem.id === item.projectId);
    return `
      <div class="list-item">
        <div class="list-item-head">
          <strong>${item.title}</strong>
          <span class="pill">${item.category}</span>
        </div>
        <p>${item.body}</p>
        <p class="item-meta">${item.path ? `路径：${item.path} · ` : ""}${item.tags.join(" · ") || "无标签"} · ${item.status}${project ? ` · 关联项目：${project.title}` : ""}</p>
        <div class="inline-actions tight">
          <button class="chip-button star-button ${item.starred ? "is-active" : ""}" data-knowledge-manage="star" data-knowledge-id="${item.id}">${item.starred ? "已星标" : "星标"}</button>
          <button class="chip-button" data-knowledge-manage="toggle-status" data-knowledge-id="${item.id}">${item.status === "已实践" ? "改为待验证" : "标为已实践"}</button>
          <button class="chip-button" data-knowledge-manage="edit" data-knowledge-id="${item.id}">编辑</button>
          <button class="chip-button" data-knowledge-manage="delete" data-knowledge-id="${item.id}">删除</button>
        </div>
      </div>
    `;
  });
  nodes.knowledgeList.querySelectorAll("[data-knowledge-manage]").forEach((button) => {
    button.addEventListener("click", () => handleKnowledgeManage(button.dataset.knowledgeManage, button.dataset.knowledgeId));
  });
}

function renderReviews() {
  renderReviewLinks();
  renderCollection(nodes.reviewPromptList, buildReviewPrompts(), (prompt) => `
    <div class="prompt-card">
      <div class="list-item-head">
        <strong>${prompt.title}</strong>
        <span class="badge ${prompt.level === "warning" ? "warning" : ""}">${prompt.badge}</span>
      </div>
      <p class="item-meta">${prompt.description}</p>
      <div class="inline-actions">
        <button class="primary-button" data-review-kind="${prompt.kind}">开始${prompt.title}</button>
      </div>
    </div>
  `);

  nodes.reviewPromptList.querySelectorAll("[data-review-kind]").forEach((button) => {
    button.addEventListener("click", () => openReviewComposer(button.dataset.reviewKind));
  });

  renderCollection(nodes.reviewHistoryList, app.state.reviews, (review) => `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${reviewKindLabel(review.kind)} · ${review.date}</strong>
        <span class="pill">${review.snapshot.records} 条记录</span>
      </div>
      <p class="item-meta">${review.answers.map((item) => `${item.question}：${item.answer}`).join(" / ")}</p>
      <div class="inline-actions tight">
        <button class="chip-button" data-review-history="reuse" data-review-id="${review.id}">继续这次思路</button>
      </div>
    </div>
  `);
  nodes.reviewHistoryList.querySelectorAll("[data-review-history]").forEach((button) => {
    button.addEventListener("click", () => handleReviewHistoryAction(button.dataset.reviewHistory, button.dataset.reviewId));
  });
}

function renderHabitOverview() {
  const monthKey = localDateString().slice(0, 7);
  const stats = app.state.habits.map((habit) => ({
    habit,
    stats: getHabitMonthStats(habit.id, monthKey)
  }));
  const totalDone = stats.reduce((sum, item) => sum + item.stats.doneCount + item.stats.patchedCount, 0);
  const totalMiss = stats.reduce((sum, item) => sum + item.stats.missCount, 0);
  const avgRate = stats.length ? Math.round(stats.reduce((sum, item) => sum + item.stats.completionRate, 0) / stats.length) : 0;
  nodes.habitOverviewCard.innerHTML = `
    <div class="section-head">
      <h2>本月习惯概览</h2>
      <span class="pill">${monthKey}</span>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">平均完成率</span><strong>${avgRate}%</strong></div>
      <div class="metric"><span class="item-meta">完成 + 补卡</span><strong>${totalDone}</strong></div>
      <div class="metric"><span class="item-meta">打叉次数</span><strong>${totalMiss}</strong></div>
    </div>
    <div class="review-banner">
      <span class="subtle">打钩计入完成，补卡也计入完成但会保留补卡标记；打叉记缺勤但不断 streak。</span>
    </div>
  `;
}

function renderReviewInsights() {
  const week = getReviewWindowSummary(7);
  const month = getReviewWindowSummary(30);
  const latestDaily = app.state.reviews.find((item) => item.kind === "daily");
  nodes.reviewInsightsCard.innerHTML = `
    <div class="section-head">
      <h2>复盘看板</h2>
      <span class="pill">截至 ${localDateString()}</span>
    </div>
    <div class="review-insights-grid">
      <div class="detail-tile">
        <span class="item-meta">最近 7 天记录</span>
        <strong>${week.records}</strong>
        <p class="item-meta">情绪均值 ${week.emotionAverage || "-"} / 完成习惯 ${week.doneHabits}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">最近 30 天记录</span>
        <strong>${month.records}</strong>
        <p class="item-meta">待办完成 ${month.doneTasks} / 新增经验 ${month.knowledge}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">最近每日小结</span>
        <strong>${latestDaily ? latestDaily.date : "还没有"}</strong>
        <p class="item-meta">${latestDaily ? latestDaily.answers[0]?.answer || "已填写" : "先写第一条每日小结"}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">强制档状态</span>
        <strong>${reviewStageLabel(getReviewOverdueDays())}</strong>
        <p class="item-meta">${buildReviewPressureText(getReviewOverdueDays())}</p>
      </div>
    </div>
  `;
  renderReviewPressure();
}

function renderStatsVisual() {
  const moodCounts = emotionOptions.map((option) => ({
    label: `${option.face} ${option.label}`,
    value: app.state.emotions.filter((item) => item.level === option.value).length
  }));
  const taskSummary = getTaskWindowSummary();
  const habitSummary = {
    done: app.state.habitLogs.filter((item) => item.status === "done").length,
    patched: app.state.habitLogs.filter((item) => item.status === "patched").length,
    miss: app.state.habitLogs.filter((item) => item.status === "miss").length
  };
  nodes.statsVisualCard.innerHTML = `
    <div class="section-head">
      <h2>统计图</h2>
      <span class="pill">简版趋势</span>
    </div>
    <div class="bar-chart">
      ${renderBarRows("情绪分布", moodCounts)}
      ${renderBarRows("任务窗口", [
        { label: "逾期", value: taskSummary.overdue },
        { label: "今天", value: taskSummary.today },
        { label: "7天内", value: taskSummary.upcoming }
      ])}
      ${renderBarRows("习惯状态", [
        { label: "完成", value: habitSummary.done },
        { label: "补卡", value: habitSummary.patched },
        { label: "打叉", value: habitSummary.miss }
      ])}
    </div>
  `;
}

function renderReviewPressure() {
  const overdueDays = getReviewOverdueDays();
  const pressureStep = getForcedReviewStep(overdueDays);
  nodes.reviewPressureCard.className = `card${overdueDays > 0 ? " pressure-card" : ""}`;
  nodes.reviewPressureCard.innerHTML = `
    <div class="section-head">
      <h2>强制复盘梯度</h2>
      <span class="badge ${overdueDays > 0 ? "warning" : "success"}">${reviewStageLabel(overdueDays)}</span>
    </div>
    <p class="item-meta">${buildReviewPressureText(overdueDays)}</p>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">当前超期</span><strong>${overdueDays} 天</strong></div>
      <div class="metric"><span class="item-meta">当前动作</span><strong>${pressureStep}</strong></div>
      <div class="metric"><span class="item-meta">默认阈值</span><strong>${app.state.settings.forcedReviewDays} 天</strong></div>
    </div>
    <div class="review-banner">
      <span class="subtle">超期 14 天以上时，建议先完成最小复盘，再继续其他操作。</span>
      <button class="primary-button" id="openForcedReviewBtn">打开最小复盘</button>
    </div>
  `;
  document.querySelector("#openForcedReviewBtn").addEventListener("click", () => nodes.forcedReviewDialog.showModal());
}

function renderReviewLinks() {
  const starredKnowledge = app.state.knowledge.filter((item) => item.starred).slice(0, 4);
  const activeProjects = app.state.projects.slice(0, 4);
  nodes.reviewLinkCard.innerHTML = `
    <div class="section-head">
      <h2>复盘辅助材料</h2>
      <span class="pill">写复盘时可参考</span>
    </div>
    <div class="section-block">
      <p class="item-meta">星标经验</p>
      <div class="project-task-list">
        ${starredKnowledge.length ? starredKnowledge.map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.category} · ${item.status}</p></div>`).join("") : `<p class="item-meta">还没有星标经验，可以先去经验库标几条。</p>`}
      </div>
    </div>
    <div class="section-block">
      <p class="item-meta">当前项目主线</p>
      <div class="project-task-list">
        ${activeProjects.length ? activeProjects.map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.monthlyGoal || "还没写本月任务"}</p></div>`).join("") : `<p class="item-meta">还没有项目主线。</p>`}
      </div>
    </div>
  `;
}

function renderKnowledgeFilters() {
  nodes.knowledgeFilterCard.innerHTML = `
    <div class="section-head">
      <h2>经验筛选</h2>
      <button class="text-button" id="resetKnowledgeFiltersBtn">重置</button>
    </div>
    <div class="filter-row">
      <input id="knowledgeQueryInput" type="search" placeholder="搜标题、正文、标签" value="${escapeHtml(app.knowledgeFilter.query)}">
      <select id="knowledgeCategorySelect">
        <option value="">全部分类</option>
        ${["学习", "生活", "交往", "工作", "爱好"].map((item) => `<option value="${item}" ${app.knowledgeFilter.category === item ? "selected" : ""}>${item}</option>`).join("")}
      </select>
    </div>
    <div class="filter-row">
      <select id="knowledgeStatusSelect">
        <option value="">全部状态</option>
        <option value="待验证" ${app.knowledgeFilter.status === "待验证" ? "selected" : ""}>待验证</option>
        <option value="已实践" ${app.knowledgeFilter.status === "已实践" ? "selected" : ""}>已实践</option>
      </select>
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
  document.querySelector("#knowledgeStatusSelect").addEventListener("change", (event) => {
    app.knowledgeFilter.status = event.target.value;
    renderKnowledge();
  });
  document.querySelector("#knowledgeStarFilterBtn").addEventListener("click", () => {
    app.knowledgeFilter.starredOnly = !app.knowledgeFilter.starredOnly;
    renderKnowledge();
  });
  document.querySelector("#resetKnowledgeFiltersBtn").addEventListener("click", () => {
    app.knowledgeFilter = { query: "", category: "", status: "", starredOnly: false };
    renderKnowledge();
  });
}

function buildReviewPrompts() {
  const overdueDays = getReviewOverdueDays();
  const week = getReviewWindowSummary(7);
  const month = getReviewWindowSummary(30);
  return [
    {
      kind: "daily",
      title: "每日小结",
      badge: overdueDays > 0 ? `已超期 ${overdueDays} 天` : `今日 ${app.state.settings.reminderDailyTime} 提醒`,
      level: overdueDays > 0 ? "warning" : "normal",
      description: `用 2 分钟收束今天，并把明天最重要的一件事直接写进待办。今天已有 ${getDayRecordCount(localDateString())} 条记录。`
    },
    {
      kind: "weekly",
      title: "每周复盘",
      badge: `4 个问题 · ${week.records} 条记录`,
      level: "normal",
      description: `最近 7 天已记录 ${week.records} 条内容、完成 ${week.doneHabits} 次习惯、完成 ${week.doneTasks} 项任务。`
    },
    {
      kind: "monthly",
      title: "每月复盘",
      badge: `5 个问题 · ${month.records} 条记录`,
      level: "normal",
      description: `最近 30 天新增 ${month.knowledge} 条经验，情绪均值 ${month.emotionAverage || "-"}，适合做月度归档。`
    },
    {
      kind: "quarterly",
      title: "季度复盘",
      badge: "4 个问题 · 里程碑对照",
      level: "normal",
      description: "回看这个季度哪些推进是真正的，哪些只是忙碌感。"
    },
    {
      kind: "yearly",
      title: "年度复盘",
      badge: "4 个问题 · 年度主线",
      level: "normal",
      description: "把全年成长、问题和下一年主线收束成一份总账。"
    }
  ];
}

function openSettings() {
  nodes.dailyReminderTime.value = app.state.settings.reminderDailyTime;
  nodes.weeklyReminderTime.value = app.state.settings.reminderWeeklyTime;
  nodes.forcedReviewDays.value = app.state.settings.forcedReviewDays;
  nodes.autoBackupDays.value = app.state.settings.autoBackupDays;
  nodes.dailyTemplateInput.value = getReviewQuestions("daily").join("\n");
  nodes.weeklyTemplateInput.value = getReviewQuestions("weekly").join("\n");
  nodes.monthlyTemplateInput.value = getReviewQuestions("monthly").join("\n");
  nodes.quarterlyTemplateInput.value = getReviewQuestions("quarterly").join("\n");
  nodes.yearlyTemplateInput.value = getReviewQuestions("yearly").join("\n");
  nodes.settingsNote.textContent = `最近备份：${app.state.meta.lastBackupAt ? app.state.meta.lastBackupAt.slice(0, 16).replace("T", " ") : "还没有"}；回收站：${app.state.trash.length} 条。`;
  nodes.settingsDialog.showModal();
}

async function saveSettings() {
  app.state.settings.reminderDailyTime = nodes.dailyReminderTime.value || "22:00";
  app.state.settings.reminderWeeklyTime = nodes.weeklyReminderTime.value || "20:00";
  app.state.settings.forcedReviewDays = Number(nodes.forcedReviewDays.value || 14);
  app.state.settings.autoBackupDays = Number(nodes.autoBackupDays.value || 7);
  app.state.settings.reviewTemplates = {
    daily: parseTemplateLines(nodes.dailyTemplateInput.value, defaultReviewTemplates.daily),
    weekly: parseTemplateLines(nodes.weeklyTemplateInput.value, defaultReviewTemplates.weekly),
    monthly: parseTemplateLines(nodes.monthlyTemplateInput.value, defaultReviewTemplates.monthly),
    quarterly: parseTemplateLines(nodes.quarterlyTemplateInput.value, defaultReviewTemplates.quarterly),
    yearly: parseTemplateLines(nodes.yearlyTemplateInput.value, defaultReviewTemplates.yearly)
  };
  await saveState();
  nodes.settingsDialog.close();
  renderAll();
  showToast("设置已保存");
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    nodes.settingsNote.textContent = "当前浏览器不支持 Web Notification。";
    return;
  }

  const permission = await Notification.requestPermission();
  app.state.settings.notificationPermissionAskedAt = new Date().toISOString();
  await saveState();
  nodes.settingsNote.textContent = `通知权限状态：${permission}。浏览器通知在 Android 上可能受系统限制，建议配合系统闹钟兜底。`;
}

function maybeSurfaceReminder() {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const latestReviewDate = app.state.reviews[0]?.date;
  const today = localDateString();
  if (latestReviewDate === today) {
    return;
  }

  const now = new Date();
  const [hour, minute] = app.state.settings.reminderDailyTime.split(":").map(Number);
  if (now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute)) {
    new Notification("我的外置大脑", {
      body: "今天还没复盘，花 2 分钟把今天收住。"
    });
  }
}

function getReviewOverdueDays() {
  const latestReview = app.state.reviews[0];
  if (!latestReview) {
    return app.state.settings.forcedReviewDays;
  }
  return Math.max(0, daysBetween(latestReview.date, localDateString()) - app.state.settings.forcedReviewDays);
}

function maybeAutoBackup() {
  const lastBackup = app.state.meta.lastBackupAt;
  if (!lastBackup) {
    backupJson(false);
    return;
  }

  const daysSinceBackup = daysBetween(lastBackup.slice(0, 10), localDateString());
  if (daysSinceBackup >= app.state.settings.autoBackupDays) {
    backupJson(false);
  }
}

async function backupJson(showMessage) {
  const filename = `我的外置大脑-备份-${localDateString()}.json`;
  downloadFile(filename, JSON.stringify(app.state, null, 2), "application/json");
  app.state.meta.lastBackupAt = new Date().toISOString();
  await saveState();
  if (showMessage) {
    nodes.settingsNote.textContent = `已导出 ${filename}。`;
    showToast(`已导出 ${filename}`);
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
        note: item.note
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
      name: `tasks-${localDateString()}.csv`,
      content: toCsv(app.state.tasks.map((item) => ({
        title: item.title,
        deadline: item.deadline,
        priority: item.priority,
        status: item.status,
        postponeCount: item.postponeCount
      })))
    },
    {
      name: `projects-${localDateString()}.csv`,
      content: toCsv(app.state.projects.map((item) => ({
        title: item.title,
        stage: item.stage,
        monthlyGoal: item.monthlyGoal,
        recentProgress: item.recentProgress
      })))
    },
    {
      name: `reviews-${localDateString()}.csv`,
      content: toCsv(app.state.reviews.map((item) => ({
        date: item.date,
        kind: item.kind,
        summary: item.answers[0]?.answer || ""
      })))
    }
  ];

  files.forEach((file) => downloadFile(file.name, file.content, "text/csv;charset=utf-8"));
  nodes.settingsNote.textContent = "已导出主要模块 CSV。";
}

function exportReviewMarkdown() {
  const lines = ["# 我的外置大脑复盘导出", ""];
  lines.push("## 项目摘要");
  app.state.projects.forEach((project) => {
    lines.push(`- ${project.title}｜阶段：${project.stage || "未设置"}｜本月任务：${project.monthlyGoal || "待补充"}`);
  });
  lines.push("");
  lines.push("## 联系人摘要");
  app.state.contacts.forEach((contact) => {
    lines.push(`- ${contact.name}｜${contact.relation || "未分类"}｜${contact.contactInfo || "无联系方式"}`);
  });
  lines.push("");
  app.state.reviews.forEach((review) => {
    lines.push(`## ${reviewKindLabel(review.kind)} · ${review.date}`);
    review.answers.forEach((item) => lines.push(`- ${item.question}：${item.answer}`));
    lines.push("");
  });
  downloadFile(`我的外置大脑-复盘-${localDateString()}.md`, lines.join("\n"), "text/markdown;charset=utf-8");
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
      `任务 ${preview.tasks.length} 项`,
      `项目 ${preview.projects.length} 个`,
      `经验 ${preview.knowledge.length} 条`,
      `复盘 ${preview.reviews.length} 条`
    ].join("，");
    if (!confirm(`将要恢复这个备份：${summary}。是否继续？`)) {
      return;
    }
    const backupName = `我的外置大脑-恢复前备份-${localDateString()}.json`;
    downloadFile(backupName, JSON.stringify(app.state, null, 2), "application/json");
    app.state = preview;
    await saveState();
    nodes.settingsNote.textContent = `已恢复，旧数据已备份为 ${backupName}。`;
    renderAll();
    showToast("备份已恢复");
  } catch (error) {
    nodes.settingsNote.textContent = "恢复失败：文件不是可识别的备份 JSON。";
    console.error(error);
  } finally {
    event.target.value = "";
  }
}

renderProjectFilters = function renderProjectFiltersFinal() {
  const summary = getTaskWindowSummary();
  const stageStats = getProjectStageStats();
  const stalledCount = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled).length;
  nodes.projectFilterCard.innerHTML = `
    <div class="section-head">
      <h2>项目与任务</h2>
      <button class="text-button" id="resetTaskFiltersBtn" type="button">重置</button>
    </div>
    <div class="review-banner">
      <span class="subtle">当前共有 ${app.state.projects.length} 个项目，停滞项目 ${stalledCount} 个。优先处理“下一步动作”为空或超过 7 天没推进的项目。</span>
    </div>
    <div class="stage-strip">
      ${stageStats.map((item) => `
        <div class="stage-row">
          <strong>${item.label}</strong>
          <span class="mini-pill">${item.count} 个</span>
          <span class="mini-pill">${item.openTasks} 项待办</span>
        </div>
      `).join("")}
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">逾期</span><strong>${summary.overdue}</strong></div>
      <div class="metric"><span class="item-meta">今天</span><strong>${summary.today}</strong></div>
      <div class="metric"><span class="item-meta">7天内</span><strong>${summary.upcoming}</strong></div>
    </div>
    <div class="filter-row">
      <select id="taskProjectFilter">
        <option value="">全部项目</option>
        ${app.state.projects.map((item) => `<option value="${item.id}" ${app.taskFilter.projectId === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
      </select>
      <select id="taskStatusFilter">
        <option value="open" ${app.taskFilter.status === "open" ? "selected" : ""}>只看未完成</option>
        <option value="done" ${app.taskFilter.status === "done" ? "selected" : ""}>只看已完成</option>
        <option value="all" ${app.taskFilter.status === "all" ? "selected" : ""}>全部状态</option>
      </select>
    </div>
    <div class="filter-row">
      <select id="taskPriorityFilter">
        <option value="">全部优先级</option>
        <option value="high" ${app.taskFilter.priority === "high" ? "selected" : ""}>高优先级</option>
        <option value="medium" ${app.taskFilter.priority === "medium" ? "selected" : ""}>中优先级</option>
        <option value="low" ${app.taskFilter.priority === "low" ? "selected" : ""}>低优先级</option>
      </select>
      <select id="taskWindowFilter">
        <option value="focus" ${app.taskFilter.window === "focus" ? "selected" : ""}>默认聚焦</option>
        <option value="overdue" ${app.taskFilter.window === "overdue" ? "selected" : ""}>只看逾期</option>
        <option value="today" ${app.taskFilter.window === "today" ? "selected" : ""}>只看今天</option>
        <option value="upcoming" ${app.taskFilter.window === "upcoming" ? "selected" : ""}>只看7天内</option>
        <option value="all" ${app.taskFilter.window === "all" ? "selected" : ""}>全部任务</option>
      </select>
    </div>
    <div class="inline-actions tight">
      <button class="chip-button" id="batchCompleteBtn" type="button">批量完成</button>
      <button class="chip-button" id="batchPostponeBtn" type="button">批量顺延</button>
      <button class="chip-button" id="batchDeleteDoneBtn" type="button">删除已完成</button>
    </div>
  `;

  document.querySelector("#taskProjectFilter").addEventListener("change", (event) => {
    app.taskFilter.projectId = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskStatusFilter").addEventListener("change", (event) => {
    app.taskFilter.status = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskPriorityFilter").addEventListener("change", (event) => {
    app.taskFilter.priority = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskWindowFilter").addEventListener("change", (event) => {
    app.taskFilter.window = event.target.value;
    renderProjects();
  });
  document.querySelector("#resetTaskFiltersBtn").addEventListener("click", (event) => {
    event.preventDefault();
    app.taskFilter = { projectId: "", status: "open", priority: "", window: "focus" };
    app.activeProjectId = "";
    renderProjects();
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    showToast("已重置项目筛选");
  });
  document.querySelector("#batchCompleteBtn").addEventListener("click", () => batchTaskAction("complete"));
  document.querySelector("#batchPostponeBtn").addEventListener("click", () => batchTaskAction("postpone"));
  document.querySelector("#batchDeleteDoneBtn").addEventListener("click", () => batchTaskAction("delete-done"));
};

renderProjectFilters = function renderProjectFiltersFinal() {
  const summary = getTaskWindowSummary();
  const stageStats = getProjectStageStats();
  const stalledCount = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled).length;
  nodes.projectFilterCard.innerHTML = `
    <div class="section-head">
      <h2>项目与任务</h2>
      <button class="text-button" id="resetTaskFiltersBtn" type="button">重置</button>
    </div>
    <div class="review-banner">
      <span class="subtle">当前共有 ${app.state.projects.length} 个项目，停滞项目 ${stalledCount} 个。优先处理“下一步动作”为空或超过 7 天没推进的项目。</span>
    </div>
    <div class="stage-strip">
      ${stageStats.map((item) => `
        <div class="stage-row">
          <strong>${item.label}</strong>
          <span class="mini-pill">${item.count} 个</span>
          <span class="mini-pill">${item.openTasks} 项待办</span>
        </div>
      `).join("")}
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">逾期</span><strong>${summary.overdue}</strong></div>
      <div class="metric"><span class="item-meta">今天</span><strong>${summary.today}</strong></div>
      <div class="metric"><span class="item-meta">7天内</span><strong>${summary.upcoming}</strong></div>
    </div>
    <div class="filter-row">
      <select id="taskProjectFilter">
        <option value="">全部项目</option>
        ${app.state.projects.map((item) => `<option value="${item.id}" ${app.taskFilter.projectId === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
      </select>
      <select id="taskStatusFilter">
        <option value="open" ${app.taskFilter.status === "open" ? "selected" : ""}>只看未完成</option>
        <option value="done" ${app.taskFilter.status === "done" ? "selected" : ""}>只看已完成</option>
        <option value="all" ${app.taskFilter.status === "all" ? "selected" : ""}>全部状态</option>
      </select>
    </div>
    <div class="filter-row">
      <select id="taskPriorityFilter">
        <option value="">全部优先级</option>
        <option value="high" ${app.taskFilter.priority === "high" ? "selected" : ""}>高优先级</option>
        <option value="medium" ${app.taskFilter.priority === "medium" ? "selected" : ""}>中优先级</option>
        <option value="low" ${app.taskFilter.priority === "low" ? "selected" : ""}>低优先级</option>
      </select>
      <select id="taskWindowFilter">
        <option value="focus" ${app.taskFilter.window === "focus" ? "selected" : ""}>默认聚焦</option>
        <option value="overdue" ${app.taskFilter.window === "overdue" ? "selected" : ""}>只看逾期</option>
        <option value="today" ${app.taskFilter.window === "today" ? "selected" : ""}>只看今天</option>
        <option value="upcoming" ${app.taskFilter.window === "upcoming" ? "selected" : ""}>只看7天内</option>
        <option value="all" ${app.taskFilter.window === "all" ? "selected" : ""}>全部任务</option>
      </select>
    </div>
    <div class="inline-actions tight">
      <button class="chip-button" id="batchCompleteBtn" type="button">批量完成</button>
      <button class="chip-button" id="batchPostponeBtn" type="button">批量顺延</button>
      <button class="chip-button" id="batchDeleteDoneBtn" type="button">删除已完成</button>
    </div>
  `;

  document.querySelector("#taskProjectFilter").addEventListener("change", (event) => {
    app.taskFilter.projectId = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskStatusFilter").addEventListener("change", (event) => {
    app.taskFilter.status = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskPriorityFilter").addEventListener("change", (event) => {
    app.taskFilter.priority = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskWindowFilter").addEventListener("change", (event) => {
    app.taskFilter.window = event.target.value;
    renderProjects();
  });
  document.querySelector("#resetTaskFiltersBtn").addEventListener("click", (event) => {
    event.preventDefault();
    app.taskFilter = { projectId: "", status: "open", priority: "", window: "focus" };
    app.activeProjectId = "";
    renderProjects();
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    showToast("已重置项目筛选");
  });
  document.querySelector("#batchCompleteBtn").addEventListener("click", () => batchTaskAction("complete"));
  document.querySelector("#batchPostponeBtn").addEventListener("click", () => batchTaskAction("postpone"));
  document.querySelector("#batchDeleteDoneBtn").addEventListener("click", () => batchTaskAction("delete-done"));
};

function renderProjectFilters() {
  const summary = getTaskWindowSummary();
  const stageStats = getProjectStageStats();
  const stalledCount = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled).length;
  nodes.projectFilterCard.innerHTML = `
    <div class="section-head">
      <h2>项目与任务</h2>
      <button class="text-button" id="resetTaskFiltersBtn" type="button">重置</button>
    </div>
    <div class="review-banner">
      <span class="subtle">当前共有 ${app.state.projects.length} 个项目，停滞项目 ${stalledCount} 个。优先处理“下一步动作”为空或超过 7 天没推进的项目。</span>
    </div>
    <div class="stage-strip">
      ${stageStats.map((item) => `
        <div class="stage-row">
          <strong>${item.label}</strong>
          <span class="mini-pill">${item.count} 个</span>
          <span class="mini-pill">${item.openTasks} 项待办</span>
        </div>
      `).join("")}
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">逾期</span><strong>${summary.overdue}</strong></div>
      <div class="metric"><span class="item-meta">今天</span><strong>${summary.today}</strong></div>
      <div class="metric"><span class="item-meta">7天内</span><strong>${summary.upcoming}</strong></div>
    </div>
    <div class="filter-row">
      <select id="taskProjectFilter">
        <option value="">全部项目</option>
        ${app.state.projects.map((item) => `<option value="${item.id}" ${app.taskFilter.projectId === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
      </select>
      <select id="taskStatusFilter">
        <option value="open" ${app.taskFilter.status === "open" ? "selected" : ""}>只看未完成</option>
        <option value="done" ${app.taskFilter.status === "done" ? "selected" : ""}>只看已完成</option>
        <option value="all" ${app.taskFilter.status === "all" ? "selected" : ""}>全部状态</option>
      </select>
    </div>
    <div class="filter-row">
      <select id="taskPriorityFilter">
        <option value="">全部优先级</option>
        <option value="high" ${app.taskFilter.priority === "high" ? "selected" : ""}>高优先级</option>
        <option value="medium" ${app.taskFilter.priority === "medium" ? "selected" : ""}>中优先级</option>
        <option value="low" ${app.taskFilter.priority === "low" ? "selected" : ""}>低优先级</option>
      </select>
      <select id="taskWindowFilter">
        <option value="focus" ${app.taskFilter.window === "focus" ? "selected" : ""}>默认聚焦</option>
        <option value="overdue" ${app.taskFilter.window === "overdue" ? "selected" : ""}>只看逾期</option>
        <option value="today" ${app.taskFilter.window === "today" ? "selected" : ""}>只看今天</option>
        <option value="upcoming" ${app.taskFilter.window === "upcoming" ? "selected" : ""}>只看7天内</option>
        <option value="all" ${app.taskFilter.window === "all" ? "selected" : ""}>全部任务</option>
      </select>
    </div>
    <div class="inline-actions tight">
      <button class="chip-button" id="batchCompleteBtn" type="button">批量完成</button>
      <button class="chip-button" id="batchPostponeBtn" type="button">批量顺延</button>
      <button class="chip-button" id="batchDeleteDoneBtn" type="button">删除已完成</button>
    </div>
  `;

  document.querySelector("#taskProjectFilter").addEventListener("change", (event) => {
    app.taskFilter.projectId = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskStatusFilter").addEventListener("change", (event) => {
    app.taskFilter.status = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskPriorityFilter").addEventListener("change", (event) => {
    app.taskFilter.priority = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskWindowFilter").addEventListener("change", (event) => {
    app.taskFilter.window = event.target.value;
    renderProjects();
  });
  document.querySelector("#resetTaskFiltersBtn").addEventListener("click", (event) => {
    event.preventDefault();
    app.taskFilter = { projectId: "", status: "open", priority: "", window: "focus" };
    app.activeProjectId = "";
    renderProjects();
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    showToast("已重置项目筛选");
  });
  document.querySelector("#batchCompleteBtn").addEventListener("click", () => batchTaskAction("complete"));
  document.querySelector("#batchPostponeBtn").addEventListener("click", () => batchTaskAction("postpone"));
  document.querySelector("#batchDeleteDoneBtn").addEventListener("click", () => batchTaskAction("delete-done"));
}

function renderProjectFilters() {
  const summary = getTaskWindowSummary();
  const stageStats = getProjectStageStats();
  const stalledCount = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled).length;
  nodes.projectFilterCard.innerHTML = `
    <div class="section-head">
      <h2>项目与任务</h2>
      <button class="text-button" id="resetTaskFiltersBtn" type="button">重置</button>
    </div>
    <div class="review-banner">
      <span class="subtle">当前共有 ${app.state.projects.length} 个项目，停滞项目 ${stalledCount} 个。优先处理“下一步动作”为空或超过 7 天没推进的项目。</span>
    </div>
    <div class="stage-strip">
      ${stageStats.map((item) => `
        <div class="stage-row">
          <strong>${item.label}</strong>
          <span class="mini-pill">${item.count} 个</span>
          <span class="mini-pill">${item.openTasks} 项待办</span>
        </div>
      `).join("")}
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">逾期</span><strong>${summary.overdue}</strong></div>
      <div class="metric"><span class="item-meta">今天</span><strong>${summary.today}</strong></div>
      <div class="metric"><span class="item-meta">7天内</span><strong>${summary.upcoming}</strong></div>
    </div>
    <div class="filter-row">
      <select id="taskProjectFilter">
        <option value="">全部项目</option>
        ${app.state.projects.map((item) => `<option value="${item.id}" ${app.taskFilter.projectId === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
      </select>
      <select id="taskStatusFilter">
        <option value="open" ${app.taskFilter.status === "open" ? "selected" : ""}>只看未完成</option>
        <option value="done" ${app.taskFilter.status === "done" ? "selected" : ""}>只看已完成</option>
        <option value="all" ${app.taskFilter.status === "all" ? "selected" : ""}>全部状态</option>
      </select>
    </div>
    <div class="filter-row">
      <select id="taskPriorityFilter">
        <option value="">全部优先级</option>
        <option value="high" ${app.taskFilter.priority === "high" ? "selected" : ""}>高优先级</option>
        <option value="medium" ${app.taskFilter.priority === "medium" ? "selected" : ""}>中优先级</option>
        <option value="low" ${app.taskFilter.priority === "low" ? "selected" : ""}>低优先级</option>
      </select>
      <select id="taskWindowFilter">
        <option value="focus" ${app.taskFilter.window === "focus" ? "selected" : ""}>默认聚焦</option>
        <option value="overdue" ${app.taskFilter.window === "overdue" ? "selected" : ""}>只看逾期</option>
        <option value="today" ${app.taskFilter.window === "today" ? "selected" : ""}>只看今天</option>
        <option value="upcoming" ${app.taskFilter.window === "upcoming" ? "selected" : ""}>只看7天内</option>
        <option value="all" ${app.taskFilter.window === "all" ? "selected" : ""}>全部任务</option>
      </select>
    </div>
    <div class="inline-actions tight">
      <button class="chip-button" id="batchCompleteBtn" type="button">批量完成</button>
      <button class="chip-button" id="batchPostponeBtn" type="button">批量顺延</button>
      <button class="chip-button" id="batchDeleteDoneBtn" type="button">删除已完成</button>
    </div>
  `;

  document.querySelector("#taskProjectFilter").addEventListener("change", (event) => {
    app.taskFilter.projectId = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskStatusFilter").addEventListener("change", (event) => {
    app.taskFilter.status = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskPriorityFilter").addEventListener("change", (event) => {
    app.taskFilter.priority = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskWindowFilter").addEventListener("change", (event) => {
    app.taskFilter.window = event.target.value;
    renderProjects();
  });
  document.querySelector("#resetTaskFiltersBtn").addEventListener("click", (event) => {
    event.preventDefault();
    app.taskFilter = { projectId: "", status: "open", priority: "", window: "focus" };
    app.activeProjectId = "";
    renderProjects();
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    showToast("已重置项目筛选");
  });
  document.querySelector("#batchCompleteBtn").addEventListener("click", () => batchTaskAction("complete"));
  document.querySelector("#batchPostponeBtn").addEventListener("click", () => batchTaskAction("postpone"));
  document.querySelector("#batchDeleteDoneBtn").addEventListener("click", () => batchTaskAction("delete-done"));
}

function createDefaultState() {
  return {
    schemaVersion: 3,
    meta: {
      lastBackupAt: "",
      installedAt: new Date().toISOString()
    },
    settings: {
      reminderDailyTime: "22:00",
      reminderWeeklyTime: "20:00",
      forcedReviewDays: 14,
      autoBackupDays: 7,
      notificationPermissionAskedAt: "",
      reviewTemplates: JSON.parse(JSON.stringify(defaultReviewTemplates))
    },
    records: [],
    emotions: [],
    habits: [],
    habitLogs: [],
    contacts: [],
    bundles: [],
    tasks: [],
    projects: [],
    experienceCategories: [],
    knowledge: [],
    reviews: [],
    trash: [],
    backupLogs: []
  };
}

function normalizeState(data) {
  const defaults = createDefaultState();
  const normalized = {
    ...defaults,
    ...data,
    schemaVersion: Math.max(3, Number(data?.schemaVersion || 1)),
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
    impression: ""
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
  normalized.experienceCategories = normalizeEntityList(normalized.experienceCategories, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    name: "",
    parent: ""
  });
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
  normalized.experienceCategories = buildExperienceCategories(normalized.knowledge, normalized.experienceCategories);
  return normalized;
}

function buildExperienceCategories(knowledgeList, existing = []) {
  const categories = new Map();
  (existing || []).forEach((item) => {
    categories.set(`${item.parent}>${item.name}`, item);
  });
  (knowledgeList || []).forEach((item) => {
    const parts = (item.path || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    let parent = item.category || "";
    parts.forEach((name) => {
      const key = `${parent}>${name}`;
      if (!categories.has(key)) {
        categories.set(key, {
          id: uid(),
          createdAt: new Date().toISOString(),
          updatedAt: "",
          deletedAt: "",
          version: 1,
          name,
          parent
        });
      }
      parent = name;
    });
  });
  return [...categories.values()];
}

function maybeShowForcedReview() {
  const overdueDays = getReviewOverdueDays();
  if (overdueDays < 14) {
    return;
  }

  const now = new Date();
  const hour = now.getHours();
  if (hour < 22) {
    return;
  }

  const today = localDateString(now);
  if (app.state.meta?.lastForcedReviewPromptAt === today) {
    return;
  }

  app.state.meta.lastForcedReviewPromptAt = today;
  saveState();
  nodes.forcedReviewDialog.showModal();
}

async function submitForcedReview() {
  const reason = document.querySelector("#forcedReasonInput").value.trim();
  const change = document.querySelector("#forcedChangeInput").value.trim();
  const next = document.querySelector("#forcedNextInput").value.trim();
  if (!change || !next) {
    alert("最小复盘至少填写“最重要的变化”和“接下来最重要的一件事”。");
    return;
  }
  app.state.reviews.unshift({
    id: uid(),
    kind: "daily",
    date: localDateString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    answers: [
      { question: "最近一直没复盘的原因", answer: reason || "未填写" },
      { question: "这段时间最重要的变化", answer: change },
      { question: "接下来最重要的一件事", answer: next }
    ],
    snapshot: buildReviewSnapshot(),
    forced: true,
    skipped: false
  });
  await saveState();
  app.forcedReviewDismissedAt = localDateString();
  nodes.forcedReviewDialog.close();
  renderAll();
  showToast("已完成最小复盘");
}

async function skipForcedReview() {
  const reason = document.querySelector("#forcedReasonInput").value.trim();
  if (!reason) {
    alert("至少写一下这次跳过的原因。");
    return;
  }
  app.state.reviews.unshift({
    id: uid(),
    kind: "daily",
    date: localDateString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    answers: [{ question: "这次跳过复盘的原因", answer: reason }],
    snapshot: buildReviewSnapshot(),
    skipped: true,
    forced: true
  });
  await saveState();
  app.forcedReviewDismissedAt = localDateString();
  nodes.forcedReviewDialog.close();
  renderAll();
  showToast("已记录跳过原因");
}

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
    bundle: {
      title: preset.id ? "编辑事件包" : "新增事件包",
      fields: `
        <input type="hidden" name="entryType" value="bundle">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>事件包名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>颜色</span><input name="color" type="color" value="${escapeHtml(preset.color || "#5B7C99")}"></label>
        <label><span>总截止</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
      `
    },
    task: {
      title: preset.id ? "编辑任务" : "新增任务",
      fields: `
        <input type="hidden" name="entryType" value="task">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>任务名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>所属事件包</span>${bundleSelectHtml("bundleId", preset.bundleId || "")}</label>
        <label><span>类型</span>
          <select name="taskType">
            <option value="normal" ${preset.type !== "progress" ? "selected" : ""}>普通任务</option>
            <option value="progress" ${preset.type === "progress" ? "selected" : ""}>进度型任务</option>
          </select>
        </label>
        <label><span>截止日期</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
        <label><span>优先级</span>
          <select name="priority">
            <option value="high" ${preset.priority === "high" ? "selected" : ""}>高</option>
            <option value="medium" ${!preset.priority || preset.priority === "medium" ? "selected" : ""}>中</option>
            <option value="low" ${preset.priority === "low" ? "selected" : ""}>低</option>
          </select>
        </label>
        <label><span>目标单位</span><input name="unit" placeholder="页 / 分钟 / 次" value="${escapeHtml(preset.unit || "")}"></label>
        <label><span>目标值</span><input name="targetValue" type="number" min="1" value="${preset.targetValue || ""}"></label>
        <label><span>目标期限</span><input name="targetDeadline" type="date" value="${escapeHtml(preset.targetDeadline || "")}"></label>
        <label><span>当前进度</span><input name="currentValue" type="number" min="0" value="${preset.currentValue ?? 0}"></label>
      `
    },
    project: {
      title: preset.id ? "编辑项目" : "新增长期项目",
      fields: `
        <input type="hidden" name="entryType" value="project">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>项目名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>年度主线</span><input name="yearlyGoal" value="${escapeHtml(preset.yearlyGoal || "")}"></label>
        <label><span>当前阶段</span><input name="stage" placeholder="例如：信息收集 / 搭建 / 输出" value="${escapeHtml(preset.stage || "")}"></label>
        <label><span>本月任务</span><input name="monthlyGoal" value="${escapeHtml(preset.monthlyGoal || "")}"></label>
        <label><span>本周推进</span><input name="weeklyFocus" value="${escapeHtml(preset.weeklyFocus || "")}"></label>
        <label><span>下一步动作</span><input name="nextAction" value="${escapeHtml(preset.nextAction || "")}"></label>
        <label><span>最近进展</span><textarea name="recentProgress">${escapeHtml(preset.recentProgress || "")}</textarea></label>
        <label><span>信息收集</span><textarea name="infoInbox">${escapeHtml(preset.infoInbox || "")}</textarea></label>
        <label><span>项目笔记</span><textarea name="notes">${escapeHtml(preset.notes || "")}</textarea></label>
        <label><span>关联人脉</span>${contactChecklistHtml("relatedContactIds", preset.relatedContactIds || [])}</label>
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
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
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
            ${emotionOptions.map((item) => `<option value="${item.value}" ${Number(preset.level) === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </label>
        <label><span>一句话备注</span><textarea name="note" placeholder="今天发生了什么？">${escapeHtml(preset.note || "")}</textarea></label>
      `
    }
  };

  const config = configs[type];
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
      app.state.records.unshift({ id: uid(), createdAt: now, version: 1, relatedBundleId: "", relatedHabitId: "", ...payload });
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
    bundle: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        projectId: String(formData.get("projectId") || ""),
        color: String(formData.get("color")),
        deadline: String(formData.get("deadline") || ""),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.bundles.find((bundle) => bundle.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.bundles.push({ id: uid(), createdAt: now, version: 1, note: "", ...payload });
    },
    task: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        projectId: String(formData.get("projectId") || ""),
        bundleId: String(formData.get("bundleId") || ""),
        type: String(formData.get("taskType")),
        deadline: String(formData.get("deadline") || ""),
        priority: String(formData.get("priority")),
        unit: String(formData.get("unit") || "").trim(),
        targetValue: Number(formData.get("targetValue") || 0),
        targetDeadline: String(formData.get("targetDeadline") || ""),
        currentValue: Number(formData.get("currentValue") || 0),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.tasks.find((task) => task.id === id);
        if (item) {
          if (payload.deadline && item.deadline && payload.deadline !== item.deadline) {
            item.postponeHistory = [...(item.postponeHistory || []), { from: item.deadline, to: payload.deadline, at: now }];
          }
          if (payload.type === "progress" && payload.currentValue !== item.currentValue) {
            item.progressLogs = [...(item.progressLogs || []), { value: payload.currentValue, at: now }];
          }
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.tasks.push({
        id: uid(),
        createdAt: now,
        version: 1,
        status: "todo",
        postponeCount: 0,
        postponeHistory: [],
        progressLogs: payload.type === "progress" ? [{ value: payload.currentValue, at: now }] : [],
        ...payload
      });
    },
    project: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        yearlyGoal: String(formData.get("yearlyGoal") || "").trim(),
        stage: String(formData.get("stage") || "").trim(),
        monthlyGoal: String(formData.get("monthlyGoal") || "").trim(),
        weeklyFocus: String(formData.get("weeklyFocus") || "").trim(),
        nextAction: String(formData.get("nextAction") || "").trim(),
        recentProgress: String(formData.get("recentProgress") || "").trim(),
        infoInbox: String(formData.get("infoInbox") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
        relatedContactIds: formData.getAll("relatedContactIds").map((item) => String(item)),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.projects.find((project) => project.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      const projectId = uid();
      app.state.projects.push({ id: projectId, createdAt: now, version: 1, projectInfoItems: [], projectNoteItems: [], ...payload });
      app.activeProjectId = projectId;
    },
    knowledge: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        category: String(formData.get("category")),
        path: String(formData.get("path") || "").trim(),
        body: String(formData.get("body")).trim(),
        tags: splitTags(formData.get("tags")),
        projectId: String(formData.get("projectId") || ""),
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
    },
    review: () => {
      const kind = String(formData.get("reviewKind"));
      const questions = getReviewQuestions(kind);
      const answers = questions.map((question, index) => ({
        question,
        answer: String(formData.get(`answer_${index}`)).trim()
      }));
      app.state.reviews.unshift({
        id: uid(),
        kind,
        date: localDateString(),
        createdAt: now,
        updatedAt: now,
        version: 1,
        answers,
        snapshot: buildReviewSnapshot(),
        skipped: false
      });
      if (kind === "daily" && answers[1]?.answer) {
        app.state.tasks.push({
          id: uid(),
          createdAt: now,
          updatedAt: now,
          version: 1,
          title: answers[1].answer,
          bundleId: "",
          projectId: "",
          type: "normal",
          deadline: addDays(localDateString(), 1),
          priority: "high",
          status: "todo",
          unit: "",
          targetValue: 0,
          targetDeadline: "",
          currentValue: 0,
          postponeCount: 0,
          postponeHistory: [],
          progressLogs: [],
          autoGeneratedFromReview: true
        });
      }
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
          <strong>${habit.name}</strong>
          <p class="item-meta">${[habit.category || "未分类", habit.target || "未写目标", habit.reminderTime ? `提醒 ${habit.reminderTime}` : ""].filter(Boolean).join(" / ")}</p>
        </div>
        <div class="habit-actions">
          <button class="chip-button" data-habit-action="done" data-habit-id="${habit.id}">${status === "done" ? "已打勾" : "打勾"}</button>
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

function renderHabits() {
  renderHabitOverview();
  renderCollection(nodes.habitList, app.state.habits, (habit) => {
    const doneDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "done").length;
    const missDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "miss").length;
    const patchedDays = app.state.habitLogs.filter((log) => log.habitId === habit.id && log.status === "patched").length;
    const monthStats = getHabitMonthStats(habit.id, localDateString().slice(0, 7));
    return `
      <div class="list-item">
        <div class="list-item-head">
          <strong>${habit.name}</strong>
          <span class="badge">${computeStreak(habit.id)} 天 streak</span>
        </div>
        <p class="item-meta">${[habit.frequency === "weekly" ? "每周" : "每天", habit.category || "未分类", habit.target || "未写目标", habit.reminderTime ? `提醒 ${habit.reminderTime}` : ""].filter(Boolean).join(" / ")}</p>
        <p class="item-meta">完成 ${doneDays} 次，补卡 ${patchedDays} 次，打叉 ${missDays} 次。本月完成率 ${monthStats.completionRate}% 。</p>
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
        <div class="calendar-wrap">${renderHabitCalendar(habit.id, localDateString().slice(0, 7))}</div>
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

function renderContacts() {
  renderCollection(nodes.contactList, app.state.contacts, (contact) => `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${contact.name}</strong>
        <span class="pill">${contact.relation || "未分类"}</span>
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
          <p class="item-meta">称呼：${contact.title || "未填写"}</p>
          <p class="item-meta">关系标签：${(contact.relationTags || []).join(" / ") || contact.relation || "未填写"}</p>
          <p class="item-meta">联系方式：${contact.contactInfo || "未填写"}</p>
          <p class="item-meta">生日：${contact.birthday || "未填写"}</p>
          <p class="item-meta">印象备注：${contact.impression || contact.note || "未填写"}</p>
        </div>
      ` : ""}
    </div>
  `);
  nodes.contactList.querySelectorAll("[data-contact-manage]").forEach((button) => {
    button.addEventListener("click", () => handleContactManage(button.dataset.contactManage, button.dataset.contactId));
  });
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
    const targetDate = prompt("请输入要补卡的日期（格式：2026-08-27）", app.selectedDate);
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
    const targetDate = prompt("请输入要清空记录的日期（格式：2026-08-27）", app.selectedDate);
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

async function handleTaskManage(action, taskId) {
  const task = app.state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }
  if (action === "edit") {
    openEntryModal("task", task);
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定删除任务「${task.title}」吗？`)) {
      return;
    }
    moveToTrash("task", structuredClone(task));
    app.state.tasks = app.state.tasks.filter((item) => item.id !== taskId);
    await saveState();
    renderAll();
    showToast("任务已移入回收站");
  }
}

async function handleBundleManage(action, bundleId) {
  const bundle = app.state.bundles.find((item) => item.id === bundleId);
  if (!bundle) {
    return;
  }
  if (action === "edit") {
    openEntryModal("bundle", bundle);
    return;
  }
  if (action === "postpone") {
    const nextDeadline = prompt("请输入这个事件包新的总截止日期（格式：2026-08-27）", bundle.deadline || addDays(localDateString(), 1));
    if (!nextDeadline) {
      return;
    }
    if (!isValidDateString(nextDeadline)) {
      alert("日期格式不对，请按 2026-08-27 填写。");
      return;
    }
    bundle.deadline = nextDeadline;
    app.state.tasks.forEach((task) => {
      if (task.bundleId === bundleId && task.status !== "done") {
        task.deadline = nextDeadline;
        task.postponeCount += 1;
      }
    });
    await saveState();
    renderAll();
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定删除事件包「${bundle.title}」吗？包内任务会保留，但不再归属这个事件包。`)) {
      return;
    }
    moveToTrash("bundle", structuredClone(bundle));
    app.state.bundles = app.state.bundles.filter((item) => item.id !== bundleId);
    app.state.tasks.forEach((task) => {
      if (task.bundleId === bundleId) {
        task.bundleId = "";
      }
    });
    await saveState();
    renderAll();
  }
}

async function handleProjectManage(action, projectId) {
  const project = app.state.projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }
  if (action === "open") {
    app.activeProjectId = projectId;
    renderAll();
    return;
  }
  if (action === "edit") {
    openEntryModal("project", project);
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定删除项目「${project.title}」吗？关联的经验会保留，但会解除项目关联。`)) {
      return;
    }
    moveToTrash("project", structuredClone(project));
    app.state.projects = app.state.projects.filter((item) => item.id !== projectId);
    app.state.knowledge.forEach((item) => {
      if (item.projectId === projectId) {
        item.projectId = "";
      }
    });
    app.activeProjectId = app.state.projects[0]?.id || "";
    await saveState();
    renderAll();
  }
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

async function generateProjectTask(projectId) {
  const project = app.state.projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }
  const title = project.monthlyGoal || `${project.title} 本月推进`;
  app.state.tasks.push({
    id: uid(),
    title,
    bundleId: "",
    projectId,
    type: "normal",
    deadline: addDays(localDateString(), 7),
    priority: "high",
    status: "todo",
    unit: "",
    targetValue: 0,
    currentValue: 0,
    postponeCount: 0,
    createdAt: new Date().toISOString(),
    generatedFromProject: true
  });
  await saveState();
  renderAll();
}

async function batchTaskAction(action) {
  const tasks = getFilteredTasks();
  if (!tasks.length) {
    alert("当前筛选结果里没有可操作的任务。");
    return;
  }
  if (action === "complete" && !confirm(`确定把当前筛选结果中的 ${tasks.length} 个任务批量标记为完成吗？`)) {
    return;
  }
  if (action === "postpone" && !confirm(`确定把当前筛选结果中的 ${tasks.length} 个未完成任务统一顺延 1 天吗？`)) {
    return;
  }
  if (action === "complete") {
    tasks.forEach((task) => {
      task.status = "done";
    });
    showToast(`已完成 ${tasks.length} 个任务`);
  }
  if (action === "postpone") {
    tasks.forEach((task) => {
      if (task.status !== "done") {
        task.deadline = task.deadline ? addDays(task.deadline, 1) : addDays(localDateString(), 1);
        task.postponeCount += 1;
      }
    });
    showToast("当前任务已顺延 1 天");
  }
  if (action === "delete-done") {
    const ids = new Set(tasks.filter((task) => task.status === "done").map((task) => task.id));
    if (!ids.size) {
      alert("当前筛选结果里没有已完成任务。");
      return;
    }
    if (!confirm(`确定删除当前筛选结果中的 ${ids.size} 个已完成任务吗？`)) {
      return;
    }
    tasks.filter((task) => ids.has(task.id)).forEach((task) => moveToTrash("task", structuredClone(task)));
    app.state.tasks = app.state.tasks.filter((task) => !ids.has(task.id));
    showToast(`已删除 ${ids.size} 个已完成任务`);
  }
  await saveState();
  renderAll();
}

function createDefaultState() {
  return {
    schemaVersion: 3,
    meta: {
      lastBackupAt: "",
      installedAt: new Date().toISOString()
    },
    settings: {
      reminderDailyTime: "22:00",
      reminderWeeklyTime: "20:00",
      forcedReviewDays: 14,
      autoBackupDays: 7,
      notificationPermissionAskedAt: "",
      reviewTemplates: JSON.parse(JSON.stringify(defaultReviewTemplates))
    },
    records: [],
    emotions: [],
    habits: [],
    habitLogs: [],
    contacts: [],
    bundles: [],
    tasks: [],
    projects: [],
    experienceCategories: [],
    knowledge: [],
    reviews: [],
    trash: [],
    backupLogs: []
  };
}

function normalizeState(data) {
  const defaults = createDefaultState();
  const normalized = {
    ...defaults,
    ...data,
    schemaVersion: Math.max(3, Number(data?.schemaVersion || 1)),
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
    impression: ""
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
  normalized.experienceCategories = normalizeEntityList(normalized.experienceCategories, {
    updatedAt: "",
    deletedAt: "",
    version: 1,
    name: "",
    parent: ""
  });
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
  normalized.experienceCategories = buildExperienceCategories(normalized.knowledge, normalized.experienceCategories);
  return normalized;
}

function buildExperienceCategories(knowledgeList, existing = []) {
  const categories = new Map();
  (existing || []).forEach((item) => {
    categories.set(`${item.parent}>${item.name}`, item);
  });
  (knowledgeList || []).forEach((item) => {
    const parts = (item.path || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    let parent = item.category || "";
    parts.forEach((name) => {
      const key = `${parent}>${name}`;
      if (!categories.has(key)) {
        categories.set(key, {
          id: uid(),
          createdAt: new Date().toISOString(),
          updatedAt: "",
          deletedAt: "",
          version: 1,
          name,
          parent
        });
      }
      parent = name;
    });
  });
  return [...categories.values()];
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
    app.state.habitLogs.push(...entry.payload.logs);
  }
  if (entry.kind === "contact") {
    app.state.contacts.push(entry.payload);
  }
  if (entry.kind === "task") {
    app.state.tasks.push(entry.payload);
  }
  if (entry.kind === "bundle") {
    app.state.bundles.push(entry.payload);
  }
  if (entry.kind === "project") {
    app.state.projects.push(entry.payload);
    app.activeProjectId = entry.payload.id;
  }
  if (entry.kind === "knowledge") {
    app.state.knowledge.unshift(entry.payload);
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

function getFilteredTasks() {
  return app.state.tasks
    .filter((task) => {
      if (!matchesTaskWindow(task, app.taskFilter.window)) {
        return false;
      }
      if (app.taskFilter.projectId) {
        const bundle = app.state.bundles.find((item) => item.id === task.bundleId);
        const relatedProjectId = task.projectId || bundle?.projectId || "";
        if (relatedProjectId !== app.taskFilter.projectId) {
          return false;
        }
      }
      if (app.taskFilter.status === "open" && task.status === "done") {
        return false;
      }
      if (app.taskFilter.status === "done" && task.status !== "done") {
        return false;
      }
      if (app.taskFilter.priority && task.priority !== app.taskFilter.priority) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const priorityDiff = priorityScore(left.priority) - priorityScore(right.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return String(left.deadline || "").localeCompare(String(right.deadline || ""));
    });
}

function handleReviewHistoryAction(action, reviewId) {
  const review = app.state.reviews.find((item) => item.id === reviewId);
  if (!review) {
    return;
  }
  if (action === "reuse") {
    openReviewComposer(review.kind);
  }
}

function resetReviewTemplates() {
  nodes.dailyTemplateInput.value = defaultReviewTemplates.daily.join("\n");
  nodes.weeklyTemplateInput.value = defaultReviewTemplates.weekly.join("\n");
  nodes.monthlyTemplateInput.value = defaultReviewTemplates.monthly.join("\n");
  nodes.quarterlyTemplateInput.value = defaultReviewTemplates.quarterly.join("\n");
  nodes.yearlyTemplateInput.value = defaultReviewTemplates.yearly.join("\n");
  showToast("已恢复默认题目");
}

function getReviewQuestions(kind) {
  return app.state?.settings?.reviewTemplates?.[kind]?.length
    ? app.state.settings.reviewTemplates[kind]
    : defaultReviewTemplates[kind];
}

function parseTemplateLines(value, fallback) {
  const lines = String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  return lines.length ? lines : fallback;
}

function getTaskWindowSummary() {
  const tasks = app.state.tasks.filter((task) => task.status !== "done");
  return {
    overdue: tasks.filter((task) => matchesTaskWindow(task, "overdue")).length,
    today: tasks.filter((task) => matchesTaskWindow(task, "today")).length,
    upcoming: tasks.filter((task) => matchesTaskWindow(task, "upcoming")).length
  };
}

function getTaskBucket(task) {
  if (!task.deadline) {
    return "unscheduled";
  }
  const diff = daysBetween(localDateString(), task.deadline);
  if (diff < 0) {
    return "overdue";
  }
  if (diff === 0) {
    return "today";
  }
  if (diff <= 7) {
    return "upcoming";
  }
  return "later";
}

function matchesTaskWindow(task, windowMode) {
  if (windowMode === "all") {
    return true;
  }
  if (windowMode === "focus") {
    return matchesTaskWindow(task, "overdue") || matchesTaskWindow(task, "today") || matchesTaskWindow(task, "upcoming") || !task.deadline;
  }
  if (!task.deadline) {
    return windowMode === "focus";
  }
  const today = localDateString();
  const diff = daysBetween(today, task.deadline);
  if (windowMode === "overdue") {
    return diff < 0;
  }
  if (windowMode === "today") {
    return diff === 0;
  }
  if (windowMode === "upcoming") {
    return diff >= 0 && diff <= 7;
  }
  return true;
}

function describeTaskTiming(deadline) {
  if (!deadline) {
    return "未设置";
  }
  const diff = daysBetween(localDateString(), deadline);
  if (diff < 0) {
    return `已超期 ${Math.abs(diff)} 天`;
  }
  if (diff === 0) {
    return "今天";
  }
  if (diff === 1) {
    return "明天";
  }
  return `${diff} 天后`;
}

function getTaskProject(task) {
  if (task.projectId) {
    return app.state.projects.find((item) => item.id === task.projectId) || null;
  }
  const bundle = app.state.bundles.find((item) => item.id === task.bundleId);
  if (bundle?.projectId) {
    return app.state.projects.find((item) => item.id === bundle.projectId) || null;
  }
  return null;
}

function renderBarRows(title, items) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return `
    <div class="section-block">
      <p class="item-meta">${title}</p>
      ${items.map((item) => `
        <div class="chart-row">
          <div class="chart-head">
            <span>${item.label}</span>
            <span>${item.value}</span>
          </div>
          <div class="chart-track"><div class="chart-fill" style="width:${Math.round((item.value / max) * 100)}%"></div></div>
        </div>
      `).join("")}
    </div>
  `;
}

function trashKindLabel(kind) {
  return {
    record: "记录",
    habit: "习惯",
    contact: "人物",
    task: "任务",
    bundle: "事件包",
    project: "项目",
    knowledge: "经验"
  }[kind] || "内容";
}

let toastTimer = null;

function showToast(message) {
  if (!nodes.toast) {
    return;
  }
  nodes.toast.textContent = message;
  nodes.toast.classList.remove("hidden");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    nodes.toast.classList.add("hidden");
  }, 1800);
}

function reorderItem(list, id, action) {
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) {
    return;
  }
  const [item] = list.splice(index, 1);

  if (action === "top") {
    list.unshift(item);
    return;
  }

  if (action === "up") {
    const targetIndex = Math.max(0, index - 1);
    list.splice(targetIndex, 0, item);
    return;
  }

  if (action === "down") {
    const targetIndex = Math.min(list.length, index + 1);
    list.splice(targetIndex, 0, item);
  }
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

function bundleSelectHtml(name, selectedValue = "") {
  return `
    <select name="${name}">
      <option value="">不归属事件包</option>
      ${app.state.bundles.map((item) => `<option value="${item.id}" ${selectedValue === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
    </select>
  `;
}

function projectSelectHtml(name, selectedValue = "") {
  return `
    <select name="${name}">
      <option value="">不关联项目</option>
      ${app.state.projects.map((item) => `<option value="${item.id}" ${selectedValue === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
    </select>
  `;
}

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

function setHabitStatus(habitId, status, date = localDateString()) {
  app.state.habitLogs = app.state.habitLogs.filter((item) => !(item.habitId === habitId && item.date === date));
  app.state.habitLogs.push({
    id: uid(),
    habitId,
    date,
    status
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

function getDueTasks() {
  const today = localDateString();
  const tomorrow = addDays(today, 1);
  return app.state.tasks
    .filter((task) => task.status !== "done" && (!task.deadline || task.deadline <= today || task.deadline === tomorrow))
    .sort((left, right) => {
      const priorityDiff = priorityScore(left.priority) - priorityScore(right.priority);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return String(left.deadline || "").localeCompare(String(right.deadline || ""));
    });
}

function priorityScore(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
}

function priorityLabel(priority) {
  return { high: "高优先级", medium: "中优先级", low: "低优先级" }[priority] || "普通";
}

function reviewKindLabel(kind) {
  return { daily: "每日小结", weekly: "每周复盘", monthly: "每月复盘" }[kind] || "复盘";
}

function splitTags(text) {
  return String(text || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function changeSelectedDate(delta) {
  app.selectedDate = addDays(app.selectedDate, delta);
  renderAll();
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
      <button class="calendar-day ${status || "empty"} ${date === app.selectedDate ? "is-active" : ""}" data-habit-calendar="true" data-habit-id="${habitId}" data-habit-date="${date}">
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
        <strong>${result.title}</strong>
        <span class="pill">${result.type}</span>
      </div>
      <p class="item-meta">${result.meta}</p>
      <div class="inline-actions tight">
        <button class="chip-button" data-search-open="${result.id}" data-search-type="${result.type}">打开</button>
      </div>
    </div>
  `);
  nodes.searchResults.querySelectorAll("[data-search-open]").forEach((button) => {
    button.addEventListener("click", () => handleSearchOpen(button.dataset.searchType, button.dataset.searchOpen));
  });
}

function getFilteredKnowledge() {
  return app.state.knowledge.filter((item) => {
    if (app.knowledgeFilter.category && item.category !== app.knowledgeFilter.category) {
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

function maybeShowForcedReview() {
  const overdueDays = getReviewOverdueDays();
  if (overdueDays < 14) {
    return;
  }
  if (app.forcedReviewDismissedAt === localDateString()) {
    return;
  }
  nodes.forcedReviewDialog.showModal();
}

async function submitForcedReview() {
  const reason = document.querySelector("#forcedReasonInput").value.trim();
  const change = document.querySelector("#forcedChangeInput").value.trim();
  const next = document.querySelector("#forcedNextInput").value.trim();
  if (!change || !next) {
    alert("最小复盘至少填写“最重要的变化”和“接下来最重要的一件事”。");
    return;
  }
  app.state.reviews.unshift({
    id: uid(),
    kind: "daily",
    date: localDateString(),
    createdAt: new Date().toISOString(),
    answers: [
      { question: "最近一直没复盘的原因", answer: reason || "未填写" },
      { question: "这段时间最重要的变化", answer: change },
      { question: "接下来最重要的一件事", answer: next }
    ],
    snapshot: buildReviewSnapshot(),
    forced: true
  });
  app.state.tasks.push({
    id: uid(),
    title: next,
    bundleId: "",
    projectId: "",
    type: "normal",
    deadline: addDays(localDateString(), 1),
    priority: "high",
    status: "todo",
    unit: "",
    targetValue: 0,
    currentValue: 0,
    postponeCount: 0,
    createdAt: new Date().toISOString(),
    autoGeneratedFromReview: true
  });
  await saveState();
  nodes.forcedReviewDialog.close();
  app.forcedReviewDismissedAt = localDateString();
  renderAll();
}

async function skipForcedReview() {
  const reason = document.querySelector("#forcedReasonInput").value.trim();
  if (!reason) {
    alert("至少写一下这次跳过的原因。");
    return;
  }
  app.state.reviews.unshift({
    id: uid(),
    kind: "daily",
    date: localDateString(),
    createdAt: new Date().toISOString(),
    answers: [{ question: "这次跳过复盘的原因", answer: reason }],
    snapshot: buildReviewSnapshot(),
    skipped: true
  });
  await saveState();
  app.forcedReviewDismissedAt = localDateString();
  nodes.forcedReviewDialog.close();
  renderAll();
}

function getSearchResults() {
  const query = app.searchQuery.toLowerCase();
  const date = app.searchDate;
  const results = [];
  const pushIfMatch = (type, id, title, meta, haystack, itemDate, action) => {
    if (date && itemDate !== date) {
      return;
    }
    if (query && !haystack.toLowerCase().includes(query)) {
      return;
    }
    if (!query && !date) {
      return;
    }
    results.push({ type, id, title, meta, action });
  };

  app.state.records.forEach((item) => {
    pushIfMatch("记录", item.id, item.content.slice(0, 24), `${item.date} · ${item.tags.join(" / ") || "无标签"}`, `${item.content} ${item.tags.join(" ")}`, item.date, "record");
  });
  app.state.tasks.forEach((item) => {
    pushIfMatch("任务", item.id, item.title, `${item.deadline || "无截止"} · ${priorityLabel(item.priority)}`, `${item.title} ${item.unit || ""}`, item.deadline || "", "task");
  });
  app.state.contacts.forEach((item) => {
    pushIfMatch("人物", item.id, item.name, `${item.relation || "未分类"} · ${item.contactInfo || ""}`, `${item.name} ${item.relation || ""} ${item.note || ""}`, item.birthday || "", "contact");
  });
  app.state.knowledge.forEach((item) => {
    pushIfMatch("经验", item.id, item.title, `${item.category}${item.path ? ` · ${item.path}` : ""} · ${item.status}`, `${item.title} ${item.path || ""} ${item.body} ${item.tags.join(" ")}`, item.createdAt ? localDateString(new Date(item.createdAt)) : "", "knowledge");
  });
  app.state.reviews.forEach((item) => {
    pushIfMatch("复盘", item.id, `${reviewKindLabel(item.kind)} ${item.date}`, item.answers[0]?.answer || "无摘要", item.answers.map((answer) => `${answer.question} ${answer.answer}`).join(" "), item.date, "review");
  });

  return results.slice(0, 50);
}

function handleSearchOpen(type, id) {
  if (type === "记录") {
    const item = app.state.records.find((record) => record.id === id);
    if (item) {
      app.selectedDate = item.date;
      setActiveScreen("today");
    }
  }
  if (type === "任务") {
    setActiveScreen("projects");
  }
  if (type === "人物") {
    setActiveScreen("contacts");
  }
  if (type === "经验") {
    setActiveScreen("knowledge");
  }
  if (type === "复盘") {
    setActiveScreen("reviews");
  }
  nodes.searchDialog.close();
  renderAll();
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

function getReviewWindowSummary(days) {
  const dates = Array.from({ length: days }, (_, index) => addDays(localDateString(), -index));
  const dateSet = new Set(dates);
  const records = app.state.records.filter((item) => dateSet.has(item.date)).length;
  const doneHabits = app.state.habitLogs.filter((item) => dateSet.has(item.date) && (item.status === "done" || item.status === "patched")).length;
  const doneTasks = app.state.tasks.filter((item) => item.status === "done" && item.createdAt && dateSet.has(localDateString(new Date(item.createdAt)))).length;
  const knowledge = app.state.knowledge.filter((item) => item.createdAt && dateSet.has(localDateString(new Date(item.createdAt)))).length;
  const emotions = app.state.emotions.filter((item) => dateSet.has(item.date));
  const emotionAverage = emotions.length ? (emotions.reduce((sum, item) => sum + item.level, 0) / emotions.length).toFixed(1) : "";
  return { records, doneHabits, doneTasks, knowledge, emotionAverage };
}

function getDayRecordCount(date) {
  return app.state.records.filter((item) => item.date === date).length;
}

function reviewStageLabel(overdueDays) {
  return overdueDays <= 0 ? "未超期" : overdueDays <= 6 ? "提醒档" : overdueDays <= 13 ? "加强档" : "强制档";
}

function getForcedReviewStep(overdueDays) {
  if (overdueDays <= 0) {
    return "普通提醒";
  }
  if (overdueDays <= 6) {
    return "可稍后一次";
  }
  if (overdueDays <= 13) {
    return "需要更强提醒";
  }
  return "最小复盘 / 跳过原因";
}

function buildReviewPressureText(overdueDays) {
  if (overdueDays <= 0) {
    return "还在温和提醒阶段，可以正常补写，不惩罚。";
  }
  if (overdueDays <= 6) {
    return "进入 0-6 天提醒档，建议今天就补一次每日小结。";
  }
  if (overdueDays <= 13) {
    return "进入 7-13 天加强档，拖延已经开始有模式可看了。";
  }
  return "已进入 14 天以上强制档，建议先做最小复盘，再继续使用。";
}

function uid() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function getMonthDays(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function getWeekdayOffset(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function daysBetween(startDate, endDate) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function formatTime(isoString) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(isoString));
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

function normalizeState(data) {
  const defaults = createDefaultState();
  return {
    ...defaults,
    ...data,
    settings: { ...defaults.settings, ...(data.settings || {}) },
    meta: { ...defaults.meta, ...(data.meta || {}) }
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function loadState() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(STATE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(normalizeState(request.result || createDefaultState()));
  });
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

function renderProjectDetail() {
  const project = app.state.projects.find((item) => item.id === app.activeProjectId);
  if (!project) {
    nodes.projectDetailCard.innerHTML = document.querySelector("#emptyStateTemplate").innerHTML;
    return;
  }
  const relatedKnowledge = app.state.knowledge.filter((item) => item.projectId === project.id);
  const relatedTasks = app.state.tasks.filter((item) => {
    const bundle = app.state.bundles.find((bundleItem) => bundleItem.id === item.bundleId);
    return item.projectId === project.id || bundle?.projectId === project.id;
  });
  const openTasks = relatedTasks.filter((item) => item.status !== "done");
  const doneTasks = relatedTasks.filter((item) => item.status === "done");
  const bundles = app.state.bundles.filter((item) => item.projectId === project.id);
  const relatedContacts = app.state.contacts.filter((item) => (project.relatedContactIds || []).includes(item.id));
  const relatedReviews = app.state.reviews.filter((review) =>
    review.answers.some((answer) =>
      answer.answer.includes(project.title) ||
      (project.monthlyGoal && answer.answer.includes(project.monthlyGoal)) ||
      (project.nextAction && answer.answer.includes(project.nextAction))
    )
  );

  nodes.projectDetailCard.innerHTML = `
    <div class="section-head">
      <h2>项目详情</h2>
      <span class="pill">${project.title}</span>
    </div>
    <div class="project-detail-grid">
      <div class="detail-tile">
        <span class="item-meta">年度主线</span>
        <strong>${project.yearlyGoal || "待补充"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">当前阶段</span>
        <strong>${project.stage || "未设置"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">本月任务</span>
        <strong>${project.monthlyGoal || "待补充"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">本周推进</span>
        <strong>${project.weeklyFocus || "待补充"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">相关任务</span>
        <strong>${relatedTasks.length} 项</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">相关经验</span>
        <strong>${relatedKnowledge.length} 条</strong>
      </div>
    </div>
    <div class="inline-actions">
      <button class="chip-button" id="generateProjectTaskBtn">生成项目推进任务</button>
      <button class="chip-button" id="quickLinkedTaskBtn">新增关联任务</button>
      <button class="chip-button" id="quickLinkedKnowledgeBtn">新增关联经验</button>
      <button class="chip-button" id="quickProjectNoteBtn">编辑项目</button>
    </div>
    <div class="project-section">
      <h3>年 → 月 → 周 → 下一步</h3>
      <div class="project-task-list">
        <div class="detail-tile">
          <strong>年度主线</strong>
          <p class="item-meta">${project.yearlyGoal || "还没写年度主线"}</p>
        </div>
        <div class="detail-tile">
          <strong>本月任务</strong>
          <p class="item-meta">${project.monthlyGoal || "还没拆出本月任务"}</p>
        </div>
        <div class="detail-tile">
          <strong>本周推进</strong>
          <p class="item-meta">${project.weeklyFocus || "还没写本周推进"}</p>
        </div>
        <div class="detail-tile">
          <strong>下一步动作</strong>
          <p class="item-meta">${project.nextAction || "还没确定下一步动作"}</p>
        </div>
      </div>
    </div>
    <div class="project-section">
      <h3>当前待推进任务</h3>
      <div class="project-task-list">
        ${openTasks.length ? openTasks.slice(0, 5).map((task) => `<div class="detail-tile"><strong>${task.title}</strong><p class="item-meta">${task.deadline || "无截止"} / ${priorityLabel(task.priority)}</p></div>`).join("") : `<p class="item-meta">当前没有未完成任务。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>已完成任务</h3>
      <div class="project-task-list">
        ${doneTasks.length ? doneTasks.slice(0, 5).map((task) => `<div class="detail-tile"><strong>${task.title}</strong><p class="item-meta">已完成 / ${task.deadline || "无截止"}</p></div>`).join("") : `<p class="item-meta">还没有完成任务记录。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目事件包</h3>
      <div class="project-task-list">
        ${bundles.length ? bundles.map((bundle) => `<div class="detail-tile"><strong>${bundle.title}</strong><p class="item-meta">${bundle.deadline || "未设总截止"}</p></div>`).join("") : `<p class="item-meta">还没有关联事件包。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目人脉</h3>
      <div class="project-task-list">
        ${relatedContacts.length ? relatedContacts.map((contact) => `<div class="detail-tile"><strong>${contact.name}</strong><p class="item-meta">${contact.relation || "未分类"} / ${contact.contactInfo || "未写联系方式"}</p></div>`).join("") : `<p class="item-meta">还没有关联人脉。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>最近进展</h3>
      <p class="item-meta">${project.recentProgress || "还没写最近进展。"}</p>
    </div>
    <div class="project-section">
      <h3>信息收集</h3>
      <p class="item-meta">${project.infoInbox || "还没记录信息收集内容。"}</p>
    </div>
    <div class="project-section">
      <h3>项目笔记</h3>
      <p class="item-meta">${project.notes || "还没写项目笔记。"}</p>
    </div>
    <div class="project-section">
      <h3>关联经验</h3>
      <div class="project-task-list">
        ${relatedKnowledge.length ? relatedKnowledge.slice(0, 4).map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.category} / ${item.status}</p></div>`).join("") : `<p class="item-meta">还没有关联经验。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>关联复盘</h3>
      <div class="project-task-list">
        ${relatedReviews.length ? relatedReviews.slice(0, 4).map((review) => `<div class="detail-tile"><strong>${reviewKindLabel(review.kind)} ${review.date}</strong><p class="item-meta">${review.answers[0]?.answer || "无摘要"}</p></div>`).join("") : `<p class="item-meta">还没有明显提到这个项目的复盘。</p>`}
      </div>
    </div>
  `;

  document.querySelector("#generateProjectTaskBtn").addEventListener("click", () => generateProjectTask(project.id));
  document.querySelector("#quickLinkedTaskBtn").addEventListener("click", () => openEntryModal("task", { projectId: project.id }));
  document.querySelector("#quickLinkedKnowledgeBtn").addEventListener("click", () => openEntryModal("knowledge", { projectId: project.id }));
  document.querySelector("#quickProjectNoteBtn").addEventListener("click", () => openEntryModal("project", project));
}

function renderReviewInsights() {
  const week = getReviewWindowSummary(7);
  const month = getReviewWindowSummary(30);
  const latestDaily = app.state.reviews.find((item) => item.kind === "daily");
  const skippedStats = getSkippedReviewStats();
  const narrative = buildReviewNarrative(week, month, skippedStats, latestDaily);

  nodes.reviewInsightsCard.innerHTML = `
    <div class="section-head">
      <h2>复盘看板</h2>
      <span class="pill">截至 ${localDateString()}</span>
    </div>
    <div class="review-insights-grid">
      <div class="detail-tile">
        <span class="item-meta">最近 7 天记录</span>
        <strong>${week.records}</strong>
        <p class="item-meta">情绪均值 ${week.emotionAverage || "-"} / 完成习惯 ${week.doneHabits}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">最近 30 天记录</span>
        <strong>${month.records}</strong>
        <p class="item-meta">任务完成 ${month.doneTasks} / 新增经验 ${month.knowledge}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">最近每日小结</span>
        <strong>${latestDaily ? latestDaily.date : "还没有"}</strong>
        <p class="item-meta">${latestDaily ? latestDaily.answers[0]?.answer || "已填写" : "先写第一条每日小结"}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">强制档状态</span>
        <strong>${reviewStageLabel(getReviewOverdueDays())}</strong>
        <p class="item-meta">${getForcedReviewStep(getReviewOverdueDays())}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">跳过复盘</span>
        <strong>${skippedStats.total}</strong>
        <p class="item-meta">${skippedStats.topReason || "最近没有跳过记录"}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">下一个抓手</span>
        <strong>${latestDaily?.answers?.[1]?.answer || "待写"}</strong>
        <p class="item-meta">把复盘直接转成下一步行动</p>
      </div>
    </div>
    <div class="review-banner">
      <span class="subtle">${narrative}</span>
    </div>
  `;
}

function getSearchResults() {
  const query = app.searchQuery.toLowerCase();
  const date = app.searchDate;
  const results = [];

  if (date && !query) {
    results.push(buildDayPanoramaResult(date));
  }

  const pushIfMatch = (type, id, title, meta, haystack, itemDate, action) => {
    if (date && itemDate !== date) {
      return;
    }
    if (query && !haystack.toLowerCase().includes(query)) {
      return;
    }
    if (!query && !date) {
      return;
    }
    results.push({ type, id, title, meta, action });
  };

  app.state.records.forEach((item) => {
    pushIfMatch("记录", item.id, item.content.slice(0, 24), `${item.date} / ${item.tags.join(" / ") || "无标签"}`, `${item.content} ${item.tags.join(" ")}`, item.date, "record");
  });
  app.state.tasks.forEach((item) => {
    pushIfMatch("任务", item.id, item.title, `${item.deadline || "无截止"} / ${priorityLabel(item.priority)}`, `${item.title} ${item.unit || ""}`, item.deadline || "", "task");
  });
  app.state.contacts.forEach((item) => {
    pushIfMatch("人物", item.id, item.name, `${item.relation || "未分类"} / ${item.contactInfo || ""}`, `${item.name} ${item.relation || ""} ${item.note || ""}`, item.birthday || "", "contact");
  });
  app.state.knowledge.forEach((item) => {
    pushIfMatch("经验", item.id, item.title, `${item.category}${item.path ? ` / ${item.path}` : ""} / ${item.status}`, `${item.title} ${item.path || ""} ${item.body} ${item.tags.join(" ")}`, item.createdAt ? localDateString(new Date(item.createdAt)) : "", "knowledge");
  });
  app.state.reviews.forEach((item) => {
    pushIfMatch("复盘", item.id, `${reviewKindLabel(item.kind)} ${item.date}`, item.answers[0]?.answer || "无摘要", item.answers.map((answer) => `${answer.question} ${answer.answer}`).join(" "), item.date, "review");
  });

  return results.slice(0, 50);
}

function handleSearchOpen(type, id) {
  if (type === "全景") {
    app.selectedDate = id;
    setActiveScreen("today");
  }
  if (type === "记录") {
    const item = app.state.records.find((record) => record.id === id);
    if (item) {
      app.selectedDate = item.date;
      setActiveScreen("today");
    }
  }
  if (type === "任务") {
    setActiveScreen("projects");
  }
  if (type === "人物") {
    setActiveScreen("contacts");
  }
  if (type === "经验") {
    setActiveScreen("knowledge");
  }
  if (type === "复盘") {
    setActiveScreen("reviews");
  }
  nodes.searchDialog.close();
  renderAll();
}

function buildDayPanoramaResult(date) {
  const recordCount = app.state.records.filter((item) => item.date === date).length;
  const taskCount = app.state.tasks.filter((item) => item.deadline === date).length;
  const reviewCount = app.state.reviews.filter((item) => item.date === date).length;
  const emotion = getEmotionByDate(date);
  return {
    type: "全景",
    id: date,
    title: `${date} 当天全景`,
    meta: `记录 ${recordCount} / 任务 ${taskCount} / 复盘 ${reviewCount}${emotion ? ` / 情绪 ${emotion.label}` : ""}`,
    action: "day"
  };
}

function getSkippedReviewStats() {
  const skipped = app.state.reviews.filter((item) => item.skipped);
  const reasonMap = new Map();
  skipped.forEach((review) => {
    const reason = review.answers?.[0]?.answer?.trim();
    if (!reason) {
      return;
    }
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
  });
  const topEntry = [...reasonMap.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    total: skipped.length,
    topReason: topEntry ? `最常见：${topEntry[0]}` : ""
  };
}

function buildReviewNarrative(week, month, skippedStats, latestDaily) {
  const parts = [];
  if (week.records >= 5) {
    parts.push("最近 7 天记录密度不错");
  } else if (week.records > 0) {
    parts.push("最近 7 天有在继续记录，但密度还可以再稳一点");
  } else {
    parts.push("最近 7 天几乎没有记录痕迹");
  }
  if (month.doneTasks >= 5) {
    parts.push("本月任务推进有明显积累");
  }
  if (skippedStats.total >= 3) {
    parts.push("跳过复盘已经出现重复模式，值得优先处理");
  }
  if (latestDaily?.answers?.[1]?.answer) {
    parts.push(`最近一次写下的下一步是“${latestDaily.answers[1].answer}”`);
  }
  return parts.join("；") || "先写下一条复盘，系统会开始帮你形成连续观察。";
}

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
      `
    },
    habit: {
      title: preset.id ? "编辑习惯" : "新增习惯",
      fields: `
        <input type="hidden" name="entryType" value="habit">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>习惯名称</span><input name="name" required placeholder="例如：背单词" value="${escapeHtml(preset.name || "")}"></label>
      `
    },
    contact: {
      title: preset.id ? "编辑人物" : "新增人物",
      fields: `
        <input type="hidden" name="entryType" value="contact">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>姓名</span><input name="name" required value="${escapeHtml(preset.name || "")}"></label>
        <label><span>关系标签</span><input name="relation" placeholder="同学 / 导师 / 朋友" value="${escapeHtml(preset.relation || "")}"></label>
        <label><span>联系方式</span><input name="contactInfo" value="${escapeHtml(preset.contactInfo || "")}"></label>
        <label><span>生日</span><input name="birthday" type="date" value="${escapeHtml(preset.birthday || "")}"></label>
        <label><span>备注</span><textarea name="note">${escapeHtml(preset.note || "")}</textarea></label>
      `
    },
    bundle: {
      title: preset.id ? "编辑事件包" : "新增事件包",
      fields: `
        <input type="hidden" name="entryType" value="bundle">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>事件包名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>颜色</span><input name="color" type="color" value="${escapeHtml(preset.color || "#5B7C99")}"></label>
        <label><span>总截止</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
      `
    },
    task: {
      title: preset.id ? "编辑任务" : "新增任务",
      fields: `
        <input type="hidden" name="entryType" value="task">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>任务名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>所属事件包</span>${bundleSelectHtml("bundleId", preset.bundleId || "")}</label>
        <label><span>类型</span>
          <select name="taskType">
            <option value="normal" ${preset.type !== "progress" ? "selected" : ""}>普通任务</option>
            <option value="progress" ${preset.type === "progress" ? "selected" : ""}>进度型任务</option>
          </select>
        </label>
        <label><span>截止日期</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
        <label><span>优先级</span>
          <select name="priority">
            <option value="high" ${preset.priority === "high" ? "selected" : ""}>高</option>
            <option value="medium" ${!preset.priority || preset.priority === "medium" ? "selected" : ""}>中</option>
            <option value="low" ${preset.priority === "low" ? "selected" : ""}>低</option>
          </select>
        </label>
        <label><span>目标单位</span><input name="unit" placeholder="页 / 分钟 / 次" value="${escapeHtml(preset.unit || "")}"></label>
        <label><span>目标值</span><input name="targetValue" type="number" min="1" value="${preset.targetValue || ""}"></label>
        <label><span>当前进度</span><input name="currentValue" type="number" min="0" value="${preset.currentValue ?? 0}"></label>
      `
    },
    project: {
      title: preset.id ? "编辑项目" : "新增长期项目",
      fields: `
        <input type="hidden" name="entryType" value="project">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>项目名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>年度主线</span><input name="yearlyGoal" value="${escapeHtml(preset.yearlyGoal || "")}"></label>
        <label><span>当前阶段</span><input name="stage" placeholder="例如：信息收集 / 搭建 / 输出" value="${escapeHtml(preset.stage || "")}"></label>
        <label><span>本月任务</span><input name="monthlyGoal" value="${escapeHtml(preset.monthlyGoal || "")}"></label>
        <label><span>本周推进</span><input name="weeklyFocus" value="${escapeHtml(preset.weeklyFocus || "")}"></label>
        <label><span>下一步动作</span><input name="nextAction" value="${escapeHtml(preset.nextAction || "")}"></label>
        <label><span>最近进展</span><textarea name="recentProgress">${escapeHtml(preset.recentProgress || "")}</textarea></label>
        <label><span>信息收集</span><textarea name="infoInbox">${escapeHtml(preset.infoInbox || "")}</textarea></label>
        <label><span>项目笔记</span><textarea name="notes">${escapeHtml(preset.notes || "")}</textarea></label>
        <label><span>关联人脉</span>${contactChecklistHtml("relatedContactIds", preset.relatedContactIds || [])}</label>
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
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
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
            ${emotionOptions.map((item) => `<option value="${item.value}" ${Number(preset.level) === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </label>
        <label><span>一句话备注</span><textarea name="note" placeholder="今天发生了什么？">${escapeHtml(preset.note || "")}</textarea></label>
      `
    }
  };

  const config = configs[type];
  nodes.dialogTitle.textContent = config.title;
  nodes.dialogFields.innerHTML = config.fields;
  nodes.entryDialog.showModal();
}

function normalizeState(data) {
  const defaults = createDefaultState();
  const normalized = {
    ...defaults,
    ...data,
    settings: { ...defaults.settings, ...(data.settings || {}) },
    meta: { ...defaults.meta, ...(data.meta || {}) }
  };
  normalized.projects = (normalized.projects || []).map((project) => ({
    yearlyGoal: "",
    weeklyFocus: "",
    nextAction: "",
    relatedContactIds: [],
    ...project,
    relatedContactIds: Array.isArray(project.relatedContactIds) ? project.relatedContactIds : []
  }));
  return normalized;
}

function renderStatsVisual() {
  const moodCounts = emotionOptions.map((option) => ({
    label: `${option.face} ${option.label}`,
    value: app.state.emotions.filter((item) => item.level === option.value).length
  }));
  const taskSummary = getTaskWindowSummary();
  const habitDone = app.state.habitLogs.filter((item) => item.status === "done" || item.status === "patched").length;
  const habitMiss = app.state.habitLogs.filter((item) => item.status === "miss").length;
  const reviewSummary = {
    total: app.state.reviews.length,
    skipped: app.state.reviews.filter((item) => item.skipped).length,
    monthly: app.state.reviews.filter((item) => item.kind === "monthly").length,
    weekly: app.state.reviews.filter((item) => item.kind === "weekly").length
  };

  nodes.statsVisualCard.innerHTML = `
    <div class="section-head">
      <h2>数据看板</h2>
      <span class="pill">累计统计</span>
    </div>
    <div class="review-insights-grid">
      <div class="detail-tile">
        <span class="item-meta">任务池</span>
        <strong>${taskSummary.openCount}</strong>
        <p class="item-meta">已完成 ${taskSummary.doneCount} / 逾期 ${taskSummary.overdueCount}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">习惯执行</span>
        <strong>${habitDone}</strong>
        <p class="item-meta">缺勤 ${habitMiss} / 习惯数 ${app.state.habits.length}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">经验库</span>
        <strong>${app.state.knowledge.length}</strong>
        <p class="item-meta">已实践 ${app.state.knowledge.filter((item) => item.status === "已实践").length} / 星标 ${app.state.knowledge.filter((item) => item.starred).length}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">复盘</span>
        <strong>${reviewSummary.total}</strong>
        <p class="item-meta">周复盘 ${reviewSummary.weekly} / 月复盘 ${reviewSummary.monthly} / 跳过 ${reviewSummary.skipped}</p>
      </div>
    </div>
    <div class="section-block">
      ${renderBarRows("情绪分布", moodCounts)}
    </div>
  `;
}

function contactChecklistHtml(name, selectedIds) {
  if (!app.state.contacts.length) {
    return `<p class="item-meta">先去人际页添加人物，再回来关联。</p>`;
  }
  const selected = new Set(selectedIds);
  return `
    <div class="checklist-grid">
      ${app.state.contacts.map((contact) => `
        <label class="check-card">
          <input type="checkbox" name="${name}" value="${contact.id}" ${selected.has(contact.id) ? "checked" : ""}>
          <span><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.relation || "未分类")}</small></span>
        </label>
      `).join("")}
    </div>
  `;
}

async function generateProjectTask(projectId) {
  const project = app.state.projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  const planItems = [
    { title: project.yearlyGoal, label: "年度主线" },
    { title: project.monthlyGoal, label: "本月任务" },
    { title: project.weeklyFocus, label: "本周推进" },
    { title: project.nextAction, label: "下一步动作" }
  ].filter((item) => item.title);

  if (!planItems.length) {
    alert("先给这个项目写一点年度主线、本月任务或下一步动作，再来自动拆解。");
    return;
  }

  const createdTitles = [];
  planItems.forEach((item, index) => {
    const taskTitle = `${project.title}｜${item.label}：${item.title}`;
    const exists = app.state.tasks.some((task) => task.projectId === projectId && task.title === taskTitle);
    if (exists) {
      return;
    }
    app.state.tasks.push({
      id: uid(),
      title: taskTitle,
      bundleId: "",
      projectId,
      type: "normal",
      deadline: addDays(localDateString(), index === 0 ? 30 : index === 1 ? 14 : index === 2 ? 7 : 2),
      priority: index >= 2 ? "high" : "medium",
      status: "todo",
      unit: "",
      targetValue: 0,
      currentValue: 0,
      postponeCount: 0,
      createdAt: new Date().toISOString(),
      generatedFromProject: true
    });
    createdTitles.push(taskTitle);
  });

  if (!createdTitles.length) {
    showToast("这些项目拆解任务之前已经生成过了");
    return;
  }

  await saveState();
  renderAll();
  showToast(`已生成 ${createdTitles.length} 条项目拆解任务`);
}

function renderProjectDetail() {
  const project = app.state.projects.find((item) => item.id === app.activeProjectId);
  if (!project) {
    nodes.projectDetailCard.innerHTML = document.querySelector("#emptyStateTemplate").innerHTML;
    return;
  }
  const relatedKnowledge = app.state.knowledge.filter((item) => item.projectId === project.id);
  const relatedTasks = app.state.tasks.filter((item) => {
    const bundle = app.state.bundles.find((bundleItem) => bundleItem.id === item.bundleId);
    return item.projectId === project.id || bundle?.projectId === project.id;
  });
  const openTasks = relatedTasks.filter((item) => item.status !== "done");
  const doneTasks = relatedTasks.filter((item) => item.status === "done");
  const bundles = app.state.bundles.filter((item) => item.projectId === project.id);
  const relatedContacts = app.state.contacts.filter((item) => (project.relatedContactIds || []).includes(item.id));
  const relatedReviews = app.state.reviews.filter((review) =>
    review.answers.some((answer) =>
      answer.answer.includes(project.title) ||
      (project.monthlyGoal && answer.answer.includes(project.monthlyGoal)) ||
      (project.nextAction && answer.answer.includes(project.nextAction))
    )
  );
  const completionRate = relatedTasks.length ? Math.round((doneTasks.length / relatedTasks.length) * 100) : 0;

  nodes.projectDetailCard.innerHTML = `
    <div class="section-head">
      <h2>项目详情</h2>
      <span class="pill">${project.title}</span>
    </div>
    <div class="project-detail-grid">
      <div class="detail-tile">
        <span class="item-meta">年度主线</span>
        <strong>${project.yearlyGoal || "待补充"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">当前阶段</span>
        <strong>${project.stage || "未设置"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">推进完成度</span>
        <strong>${completionRate}%</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">下一步动作</span>
        <strong>${project.nextAction || "待补充"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">相关任务</span>
        <strong>${relatedTasks.length} 项</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">关联人脉</span>
        <strong>${relatedContacts.length} 人</strong>
      </div>
    </div>
    <div class="inline-actions">
      <button class="chip-button" id="generateProjectTaskBtn">一键拆解任务</button>
      <button class="chip-button" id="quickLinkedTaskBtn">新增关联任务</button>
      <button class="chip-button" id="quickLinkedKnowledgeBtn">新增关联经验</button>
      <button class="chip-button" id="quickProjectNoteBtn">编辑项目</button>
    </div>
    <div class="project-section">
      <h3>年 → 月 → 周 → 日动作</h3>
      <div class="project-task-list">
        <div class="detail-tile">
          <strong>年度主线</strong>
          <p class="item-meta">${project.yearlyGoal || "还没写年度主线"}</p>
        </div>
        <div class="detail-tile">
          <strong>本月任务</strong>
          <p class="item-meta">${project.monthlyGoal || "还没拆出本月任务"}</p>
        </div>
        <div class="detail-tile">
          <strong>本周推进</strong>
          <p class="item-meta">${project.weeklyFocus || "还没写本周推进"}</p>
        </div>
        <div class="detail-tile">
          <strong>今日动作</strong>
          <p class="item-meta">${project.nextAction || "还没确定今天最小动作"}</p>
        </div>
      </div>
    </div>
    <div class="project-section">
      <h3>当前待推进任务</h3>
      <div class="project-task-list">
        ${openTasks.length ? openTasks.slice(0, 6).map((task) => `<div class="detail-tile"><strong>${task.title}</strong><p class="item-meta">${task.deadline || "无截止"} / ${priorityLabel(task.priority)}</p></div>`).join("") : `<p class="item-meta">当前没有未完成任务。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>已完成任务</h3>
      <div class="project-task-list">
        ${doneTasks.length ? doneTasks.slice(0, 4).map((task) => `<div class="detail-tile"><strong>${task.title}</strong><p class="item-meta">已完成 / ${task.deadline || "无截止"}</p></div>`).join("") : `<p class="item-meta">还没有完成任务记录。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目事件包</h3>
      <div class="project-task-list">
        ${bundles.length ? bundles.map((bundle) => `<div class="detail-tile"><strong>${bundle.title}</strong><p class="item-meta">${bundle.deadline || "未设总截止"}</p></div>`).join("") : `<p class="item-meta">还没有关联事件包。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目人脉</h3>
      <div class="project-task-list">
        ${relatedContacts.length ? relatedContacts.map((contact) => `<div class="detail-tile"><strong>${contact.name}</strong><p class="item-meta">${contact.relation || "未分类"} / ${contact.contactInfo || "未写联系方式"}</p></div>`).join("") : `<p class="item-meta">还没有关联人脉。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>最近进展</h3>
      <p class="item-meta">${project.recentProgress || "还没写最近进展。"}</p>
    </div>
    <div class="project-section">
      <h3>信息收集</h3>
      <p class="item-meta">${project.infoInbox || "还没记录信息收集内容。"}</p>
    </div>
    <div class="project-section">
      <h3>项目笔记</h3>
      <p class="item-meta">${project.notes || "还没写项目笔记。"}</p>
    </div>
    <div class="project-section">
      <h3>关联经验</h3>
      <div class="project-task-list">
        ${relatedKnowledge.length ? relatedKnowledge.slice(0, 4).map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.category} / ${item.status}</p></div>`).join("") : `<p class="item-meta">还没有关联经验。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>关联复盘</h3>
      <div class="project-task-list">
        ${relatedReviews.length ? relatedReviews.slice(0, 4).map((review) => `<div class="detail-tile"><strong>${reviewKindLabel(review.kind)} ${review.date}</strong><p class="item-meta">${review.answers[0]?.answer || "无摘要"}</p></div>`).join("") : `<p class="item-meta">还没有明显提到这个项目的复盘。</p>`}
      </div>
    </div>
  `;

  document.querySelector("#generateProjectTaskBtn").addEventListener("click", () => generateProjectTask(project.id));
  document.querySelector("#quickLinkedTaskBtn").addEventListener("click", () => openEntryModal("task", { projectId: project.id }));
  document.querySelector("#quickLinkedKnowledgeBtn").addEventListener("click", () => openEntryModal("knowledge", { projectId: project.id }));
  document.querySelector("#quickProjectNoteBtn").addEventListener("click", () => openEntryModal("project", project));
}

function renderReviews() {
  renderReviewLinks();
  renderCollection(nodes.reviewPromptList, buildReviewPrompts(), (prompt) => `
    <div class="prompt-card">
      <div class="list-item-head">
        <strong>${prompt.title}</strong>
        <span class="badge ${prompt.level === "warning" ? "warning" : ""}">${prompt.badge}</span>
      </div>
      <p class="item-meta">${prompt.description}</p>
      <div class="inline-actions">
        <button class="primary-button" data-review-kind="${prompt.kind}">开始${prompt.title}</button>
      </div>
    </div>
  `);

  nodes.reviewPromptList.querySelectorAll("[data-review-kind]").forEach((button) => {
    button.addEventListener("click", () => openReviewComposer(button.dataset.reviewKind));
  });

  renderCollection(nodes.reviewHistoryList, app.state.reviews, (review) => `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${reviewKindLabel(review.kind)} / ${review.date}</strong>
        <span class="pill">${review.snapshot.records} 条记录</span>
      </div>
      <p class="item-meta">${review.answers.map((item) => `${item.question}：${item.answer}`).join(" / ")}</p>
      <div class="inline-actions tight">
        <button class="chip-button" data-review-history="reuse" data-review-id="${review.id}">继续这次思路</button>
        <button class="chip-button" data-review-history="report" data-review-id="${review.id}">生成报告</button>
      </div>
    </div>
  `);
  nodes.reviewHistoryList.querySelectorAll("[data-review-history]").forEach((button) => {
    button.addEventListener("click", () => handleReviewHistoryAction(button.dataset.reviewHistory, button.dataset.reviewId));
  });
}

function handleReviewHistoryAction(action, reviewId) {
  const review = app.state.reviews.find((item) => item.id === reviewId);
  if (!review) {
    return;
  }
  if (action === "reuse") {
    openReviewComposer(review.kind);
    return;
  }
  if (action === "report") {
    const report = buildReviewReport(review);
    downloadFile(`复盘报告-${review.date}.md`, report, "text/markdown;charset=utf-8");
    showToast("复盘报告已导出");
  }
}

function buildReviewReport(review) {
  const lines = [
    `# ${reviewKindLabel(review.kind)} - ${review.date}`,
    "",
    "## 核心回答",
    ...review.answers.map((item) => `- ${item.question}：${item.answer}`),
    "",
    "## 当时快照",
    `- 记录数：${review.snapshot.records}`,
    `- 完成习惯：${review.snapshot.completedHabits}/${review.snapshot.totalHabits}`,
    `- 待处理任务：${review.snapshot.dueTasks}`,
    "",
    "## 自动总结",
    `- 当天最突出的关注点：${review.answers[0]?.answer || "未填写"}`,
    `- 下一步行动：${review.answers[1]?.answer || "未填写"}`,
    `- 是否为跳过记录：${review.skipped ? "是" : "否"}`
  ];

  const relatedProjects = app.state.projects.filter((project) =>
    review.answers.some((answer) => answer.answer.includes(project.title))
  );
  if (relatedProjects.length) {
    lines.push("", "## 提到的项目");
    relatedProjects.forEach((project) => {
      lines.push(`- ${project.title} / 当前阶段：${project.stage || "未设置"} / 下一步：${project.nextAction || "未填写"}`);
    });
  }

  return lines.join("\n");
}

function renderSearchResults() {
  const results = getSearchResults();
  renderCollection(nodes.searchResults, results, (result) => `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${result.title}</strong>
        <span class="pill">${result.type}</span>
      </div>
      <p class="item-meta">${result.meta}</p>
      ${result.preview ? `<p>${result.preview}</p>` : ""}
      <div class="inline-actions tight">
        <button class="chip-button" data-search-open="${result.id}" data-search-type="${result.type}">打开</button>
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

  if (date && !query) {
    results.push(buildDayPanoramaResult(date));
  }

  const pushIfMatch = (type, id, title, meta, haystack, itemDate, preview = "") => {
    if (date && itemDate !== date) {
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
    pushIfMatch("记录", item.id, item.content.slice(0, 24), `${item.date} / ${item.tags.join(" / ") || "无标签"}`, `${item.content} ${item.tags.join(" ")}`, item.date, item.content.slice(0, 80));
  });
  app.state.tasks.forEach((item) => {
    const project = app.state.projects.find((projectItem) => projectItem.id === item.projectId);
    pushIfMatch("任务", item.id, item.title, `${item.deadline || "无截止"} / ${priorityLabel(item.priority)}${project ? ` / ${project.title}` : ""}`, `${item.title} ${item.unit || ""} ${project?.title || ""}`, item.deadline || "", project?.nextAction || "");
  });
  app.state.contacts.forEach((item) => {
    pushIfMatch("人物", item.id, item.name, `${item.relation || "未分类"} / ${item.contactInfo || ""}`, `${item.name} ${item.relation || ""} ${item.note || ""}`, item.birthday || "", item.note || "");
  });
  app.state.projects.forEach((item) => {
    pushIfMatch("项目", item.id, item.title, `${item.stage || "未设置"} / ${item.monthlyGoal || "未写本月任务"}`, `${item.title} ${item.yearlyGoal || ""} ${item.monthlyGoal || ""} ${item.weeklyFocus || ""} ${item.nextAction || ""} ${item.notes || ""}`, "", item.nextAction || item.recentProgress || "");
  });
  app.state.knowledge.forEach((item) => {
    const project = app.state.projects.find((projectItem) => projectItem.id === item.projectId);
    pushIfMatch("经验", item.id, item.title, `${item.category}${item.path ? ` / ${item.path}` : ""} / ${item.status}`, `${item.title} ${item.path || ""} ${item.body} ${item.tags.join(" ")} ${project?.title || ""}`, item.createdAt ? localDateString(new Date(item.createdAt)) : "", item.body.slice(0, 80));
  });
  app.state.reviews.forEach((item) => {
    const summary = item.answers.map((answer) => `${answer.question} ${answer.answer}`).join(" ");
    pushIfMatch("复盘", item.id, `${reviewKindLabel(item.kind)} ${item.date}`, item.answers[0]?.answer || "无摘要", summary, item.date, buildShortReviewInsight(item));
  });

  return results
    .sort((left, right) => {
      if (left.type === "全景") {
        return -1;
      }
      if (right.type === "全景") {
        return 1;
      }
      return left.title.localeCompare(right.title, "zh-CN");
    })
    .slice(0, 60);
}

function handleSearchOpen(type, id) {
  if (type === "全景") {
    app.selectedDate = id;
    setActiveScreen("today");
  }
  if (type === "记录") {
    const item = app.state.records.find((record) => record.id === id);
    if (item) {
      app.selectedDate = item.date;
      setActiveScreen("today");
    }
  }
  if (type === "任务") {
    const item = app.state.tasks.find((task) => task.id === id);
    if (item) {
      const bundle = app.state.bundles.find((bundleItem) => bundleItem.id === item.bundleId);
      app.activeProjectId = item.projectId || bundle?.projectId || app.activeProjectId;
      app.taskFilter.projectId = app.activeProjectId || "";
      app.taskFilter.status = item.status === "done" ? "done" : "open";
      setActiveScreen("projects");
    }
  }
  if (type === "人物") {
    app.expandedContactId = id;
    setActiveScreen("contacts");
  }
  if (type === "项目") {
    app.activeProjectId = id;
    app.taskFilter.projectId = id;
    setActiveScreen("projects");
  }
  if (type === "经验") {
    const item = app.state.knowledge.find((knowledge) => knowledge.id === id);
    if (item) {
      app.knowledgeFilter = {
        query: item.title,
        category: item.category || "",
        status: "",
        starredOnly: false
      };
      if (item.projectId) {
        app.activeProjectId = item.projectId;
      }
    }
    setActiveScreen("knowledge");
  }
  if (type === "复盘") {
    setActiveScreen("reviews");
  }
  nodes.searchDialog.close();
  renderAll();
}

function buildReviewReport(review) {
  const relatedProjects = app.state.projects.filter((project) =>
    review.answers.some((answer) => answer.answer.includes(project.title))
  );
  const combinedAnswerText = review.answers.map((item) => item.answer).join(" ");
  const blockers = [
    "拖延",
    "没时间",
    "太累",
    "打断",
    "焦虑",
    "分心",
    "卡住",
    "不知道",
    "混乱"
  ].filter((keyword) => combinedAnswerText.includes(keyword));
  const wins = extractReviewKeywords(combinedAnswerText, ["完成", "推进", "开始", "坚持", "清楚", "解决", "写完"]);
  const risks = extractReviewKeywords(combinedAnswerText, ["拖延", "中断", "跳过", "焦虑", "分心", "混乱", "熬夜"]);
  const nextAction = review.answers[1]?.answer || relatedProjects[0]?.nextAction || "未填写";
  const lines = [
    `# ${reviewKindLabel(review.kind)} - ${review.date}`,
    "",
    "## 核心回答",
    ...review.answers.map((item) => `- ${item.question}：${item.answer}`),
    "",
    "## 当时快照",
    `- 记录数：${review.snapshot.records}`,
    `- 完成习惯：${review.snapshot.completedHabits}/${review.snapshot.totalHabits}`,
    `- 待处理任务：${review.snapshot.dueTasks}`,
    "",
    "## 自动总结",
    `- 当前主轴：${review.answers[0]?.answer || "未填写"}`,
    `- 下一步动作：${nextAction}`,
    `- 复盘状态：${review.skipped ? "这是一条跳过记录" : "这是一条正常复盘"}`,
    `- 主要阻塞：${blockers.length ? blockers.join(" / ") : "暂未识别到明显阻塞词"}`,
    `- 积极信号：${wins.length ? wins.join(" / ") : "需要更多连续记录才能总结"} `,
    `- 风险信号：${risks.length ? risks.join(" / ") : "暂未识别到明显风险词"}`
  ];

  if (relatedProjects.length) {
    lines.push("", "## 提到的项目");
    relatedProjects.forEach((project) => {
      lines.push(`- ${project.title} / 当前阶段：${project.stage || "未设置"} / 下一步：${project.nextAction || "未填写"}`);
    });
  }

  lines.push("", "## 建议动作");
  lines.push(`- 今天先完成这一件：${nextAction}`);
  if (blockers.length) {
    lines.push(`- 优先处理阻塞：${blockers[0]}`);
  }
  if (relatedProjects[0]?.weeklyFocus) {
    lines.push(`- 把动作对齐到本周推进：${relatedProjects[0].weeklyFocus}`);
  }

  return lines.join("\n");
}

function buildShortReviewInsight(review) {
  const first = review.answers[0]?.answer || "";
  const second = review.answers[1]?.answer || "";
  return [first, second].filter(Boolean).join(" / ").slice(0, 80);
}

function extractReviewKeywords(text, dictionary) {
  return dictionary.filter((keyword) => text.includes(keyword));
}

function renderProjects() {
  renderProjectFilters();
  renderTaskGroups();
  nodes.dueTodayList.querySelectorAll("[data-task-action]").forEach((button) => bindTaskAction(button));
  nodes.dueTodayList.querySelectorAll("[data-task-manage]").forEach((button) => {
    button.addEventListener("click", () => handleTaskManage(button.dataset.taskManage, button.dataset.taskId));
  });

  renderCollection(nodes.bundleList, app.state.bundles, (bundle) => {
    const bundleTasks = app.state.tasks.filter((task) => task.bundleId === bundle.id);
    const completed = bundleTasks.filter((task) => task.status === "done").length;
    const percent = bundleTasks.length ? Math.round((completed / bundleTasks.length) * 100) : 0;
    return `
      <div class="bundle-card">
        <div class="bundle-head">
          <div>
            <strong>${bundle.title}</strong>
            <p class="item-meta">${bundle.deadline ? `总截止 ${bundle.deadline}` : "未设置总截止"}</p>
          </div>
          <span class="pill" style="background:${bundle.color}22;color:${bundle.color}">${bundleTasks.length} 项</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="inline-actions tight">
          <button class="chip-button" data-bundle-manage="edit" data-bundle-id="${bundle.id}">编辑</button>
          <button class="chip-button" data-bundle-manage="postpone" data-bundle-id="${bundle.id}">整包顺延</button>
          <button class="chip-button" data-bundle-manage="delete" data-bundle-id="${bundle.id}">删除</button>
        </div>
      </div>
    `;
  });
  nodes.bundleList.querySelectorAll("[data-bundle-manage]").forEach((button) => {
    button.addEventListener("click", () => handleBundleManage(button.dataset.bundleManage, button.dataset.bundleId));
  });

  const rankedProjects = [...app.state.projects].sort((left, right) => {
    if (left.id === app.activeProjectId) {
      return -1;
    }
    if (right.id === app.activeProjectId) {
      return 1;
    }
    return getProjectHealthScore(right) - getProjectHealthScore(left);
  });

  renderCollection(nodes.projectList, rankedProjects, (project) => {
    const health = getProjectHealth(project.id);
    return `
      <div class="project-card ${health.stateClass}">
        <div class="list-item-head">
          <strong>${project.title}</strong>
          <span class="pill">${project.stage || "未设阶段"}</span>
        </div>
        <p class="item-meta">年度主线：${project.yearlyGoal || "待补充"}</p>
        <p class="item-meta">下一步：${project.nextAction || project.monthlyGoal || "待补充"}</p>
        <div class="inline-actions tight">
          <span class="mini-pill">完成度 ${health.completionRate}%</span>
          <span class="mini-pill">${health.statusText}</span>
        </div>
        <div class="inline-actions tight">
          <button class="chip-button" data-project-manage="open" data-project-id="${project.id}">${app.activeProjectId === project.id ? "已展开" : "查看详情"}</button>
          <button class="chip-button" data-project-manage="edit" data-project-id="${project.id}">编辑</button>
          <button class="chip-button" data-project-manage="delete" data-project-id="${project.id}">删除</button>
        </div>
      </div>
    `;
  });
  nodes.projectList.querySelectorAll("[data-project-manage]").forEach((button) => {
    button.addEventListener("click", () => handleProjectManage(button.dataset.projectManage, button.dataset.projectId));
  });
  renderProjectDetail();
}

function renderProjectFilters() {
  const summary = getTaskWindowSummary();
  const stageStats = getProjectStageStats();
  const stalledCount = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled).length;
  nodes.projectFilterCard.innerHTML = `
    <div class="section-head">
      <h2>项目与任务</h2>
      <button class="text-button" id="resetTaskFiltersBtn">重置</button>
    </div>
    <div class="review-banner">
      <span class="subtle">当前共有 ${app.state.projects.length} 个项目，停滞项目 ${stalledCount} 个。优先处理“下一步动作”为空或超过 7 天没推进的项目。</span>
    </div>
    <div class="stage-strip">
      ${stageStats.map((item) => `
        <div class="stage-row">
          <strong>${item.label}</strong>
          <span class="mini-pill">${item.count} 个</span>
          <span class="mini-pill">${item.openTasks} 项待办</span>
        </div>
      `).join("")}
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">逾期</span><strong>${summary.overdue}</strong></div>
      <div class="metric"><span class="item-meta">今天</span><strong>${summary.today}</strong></div>
      <div class="metric"><span class="item-meta">7天内</span><strong>${summary.upcoming}</strong></div>
    </div>
    <div class="filter-row">
      <select id="taskProjectFilter">
        <option value="">全部项目</option>
        ${app.state.projects.map((item) => `<option value="${item.id}" ${app.taskFilter.projectId === item.id ? "selected" : ""}>${item.title}</option>`).join("")}
      </select>
      <select id="taskStatusFilter">
        <option value="open" ${app.taskFilter.status === "open" ? "selected" : ""}>只看未完成</option>
        <option value="done" ${app.taskFilter.status === "done" ? "selected" : ""}>只看已完成</option>
        <option value="all" ${app.taskFilter.status === "all" ? "selected" : ""}>全部状态</option>
      </select>
    </div>
    <div class="filter-row">
      <select id="taskPriorityFilter">
        <option value="">全部优先级</option>
        <option value="high" ${app.taskFilter.priority === "high" ? "selected" : ""}>高优先级</option>
        <option value="medium" ${app.taskFilter.priority === "medium" ? "selected" : ""}>中优先级</option>
        <option value="low" ${app.taskFilter.priority === "low" ? "selected" : ""}>低优先级</option>
      </select>
      <select id="taskWindowFilter">
        <option value="focus" ${app.taskFilter.window === "focus" ? "selected" : ""}>默认聚焦</option>
        <option value="overdue" ${app.taskFilter.window === "overdue" ? "selected" : ""}>只看逾期</option>
        <option value="today" ${app.taskFilter.window === "today" ? "selected" : ""}>只看今天</option>
        <option value="upcoming" ${app.taskFilter.window === "upcoming" ? "selected" : ""}>只看7天内</option>
        <option value="all" ${app.taskFilter.window === "all" ? "selected" : ""}>全部任务</option>
      </select>
    </div>
    <div class="inline-actions tight">
      <button class="chip-button" id="batchCompleteBtn">批量完成</button>
      <button class="chip-button" id="batchPostponeBtn">批量顺延</button>
      <button class="chip-button" id="batchDeleteDoneBtn">删除已完成</button>
    </div>
  `;

  document.querySelector("#taskProjectFilter").addEventListener("change", (event) => {
    app.taskFilter.projectId = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskStatusFilter").addEventListener("change", (event) => {
    app.taskFilter.status = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskPriorityFilter").addEventListener("change", (event) => {
    app.taskFilter.priority = event.target.value;
    renderProjects();
  });
  document.querySelector("#taskWindowFilter").addEventListener("change", (event) => {
    app.taskFilter.window = event.target.value;
    renderProjects();
  });
  document.querySelector("#resetTaskFiltersBtn").addEventListener("click", () => {
    app.taskFilter = { projectId: "", status: "open", priority: "", window: "focus" };
    renderProjects();
  });
  document.querySelector("#batchCompleteBtn").addEventListener("click", () => batchTaskAction("complete"));
  document.querySelector("#batchPostponeBtn").addEventListener("click", () => batchTaskAction("postpone"));
  document.querySelector("#batchDeleteDoneBtn").addEventListener("click", () => batchTaskAction("delete-done"));
}

function renderStatsVisual() {
  const moodCounts = emotionOptions.map((option) => ({
    label: `${option.face} ${option.label}`,
    value: app.state.emotions.filter((item) => item.level === option.value).length
  }));
  const taskSummary = getTaskWindowSummary();
  const habitDone = app.state.habitLogs.filter((item) => item.status === "done" || item.status === "patched").length;
  const habitMiss = app.state.habitLogs.filter((item) => item.status === "miss").length;
  const reviewTrend = getRecentDayTrend(7);

  nodes.statsVisualCard.innerHTML = `
    <div class="section-head">
      <h2>数据看板</h2>
      <span class="pill">最近 7 天 + 累计</span>
    </div>
    <div class="review-insights-grid">
      <div class="detail-tile">
        <span class="item-meta">任务池</span>
        <strong>${taskSummary.openCount}</strong>
        <p class="item-meta">已完成 ${taskSummary.doneCount} / 逾期 ${taskSummary.overdueCount}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">习惯执行</span>
        <strong>${habitDone}</strong>
        <p class="item-meta">缺勤 ${habitMiss} / 习惯数 ${app.state.habits.length}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">知识沉淀</span>
        <strong>${app.state.knowledge.length}</strong>
        <p class="item-meta">已实践 ${app.state.knowledge.filter((item) => item.status === "已实践").length} / 星标 ${app.state.knowledge.filter((item) => item.starred).length}</p>
      </div>
      <div class="detail-tile">
        <span class="item-meta">复盘完成</span>
        <strong>${app.state.reviews.filter((item) => !item.skipped).length}</strong>
        <p class="item-meta">跳过 ${app.state.reviews.filter((item) => item.skipped).length} / 周复盘 ${app.state.reviews.filter((item) => item.kind === "weekly").length}</p>
      </div>
    </div>
    <div class="trend-strip">
      ${renderBarRows("最近 7 天记录量", reviewTrend.records)}
      ${renderBarRows("最近 7 天完成习惯", reviewTrend.habits)}
      ${renderBarRows("情绪分布", moodCounts)}
    </div>
  `;
}

function buildReviewPrompts() {
  const overdueDays = getReviewOverdueDays();
  const week = getReviewWindowSummary(7);
  const month = getReviewWindowSummary(30);
  const stalledProjects = app.state.projects.filter((project) => getProjectHealth(project.id).isStalled);
  return [
    {
      kind: "daily",
      title: "每日小结",
      badge: overdueDays > 0 ? `已超期 ${overdueDays} 天` : `今天 ${app.state.settings.reminderDailyTime} 提醒`,
      level: overdueDays > 0 ? "warning" : "normal",
      description: `用 2 分钟收束今天，并把明天最重要的一件事直接写进待办。今天已有 ${getDayRecordCount(localDateString())} 条记录。`
    },
    {
      kind: "weekly",
      title: "每周复盘",
      badge: `4 个问题 / ${week.records} 条记录`,
      level: stalledProjects.length ? "warning" : "normal",
      description: `最近 7 天完成习惯 ${week.doneHabits} 次、完成任务 ${week.doneTasks} 项。${stalledProjects.length ? `当前有 ${stalledProjects.length} 个项目停滞，适合本周一起处理。` : "适合检查项目推进节奏。"}`
    },
    {
      kind: "monthly",
      title: "每月复盘",
      badge: `5 个问题 / ${month.records} 条记录`,
      level: "normal",
      description: `最近 30 天新增经验 ${month.knowledge} 条，情绪均值 ${month.emotionAverage || "-"}，适合做月度归档和策略调整。`
    },
    {
      kind: "quarterly",
      title: "季度复盘",
      badge: "4 个问题 / 节点校准",
      level: "normal",
      description: "回看这个季度哪些推进是真的闭环，哪些只是忙碌感。"
    },
    {
      kind: "yearly",
      title: "年度复盘",
      badge: "4 个问题 / 年度主线",
      level: "normal",
      description: "把全年成长、卡点和下一年的主线收束成一份总账。"
    }
  ];
}

function getProjectStageStats() {
  const groups = new Map();
  app.state.projects.forEach((project) => {
    const label = project.stage || "未设阶段";
    const openTasks = app.state.tasks.filter((task) => task.status !== "done" && task.projectId === project.id).length;
    const current = groups.get(label) || { label, count: 0, openTasks: 0 };
    current.count += 1;
    current.openTasks += openTasks;
    groups.set(label, current);
  });
  return [...groups.values()].sort((left, right) => right.count - left.count).slice(0, 4);
}

function getProjectHealth(projectId) {
  const project = app.state.projects.find((item) => item.id === projectId);
  const relatedTasks = app.state.tasks.filter((item) => item.projectId === projectId);
  const doneCount = relatedTasks.filter((item) => item.status === "done").length;
  const completionRate = relatedTasks.length ? Math.round((doneCount / relatedTasks.length) * 100) : 0;
  const lastText = `${project?.recentProgress || ""} ${project?.nextAction || ""}`.trim();
  const isStalled = !project?.nextAction || (!relatedTasks.some((item) => item.status !== "done") && !lastText);
  return {
    completionRate,
    isStalled,
    statusText: isStalled ? "需要重启" : completionRate >= 60 ? "推进顺畅" : "持续推进中",
    stateClass: isStalled ? "is-stalled" : "is-active-track"
  };
}

function getProjectHealthScore(project) {
  const health = getProjectHealth(project.id);
  return (health.isStalled ? 0 : 20) + health.completionRate + ((project.nextAction || "").length ? 10 : 0);
}

function getRecentDayTrend(days) {
  const dates = Array.from({ length: days }, (_, index) => addDays(localDateString(), -(days - index - 1)));
  return {
    records: dates.map((date) => ({
      label: date.slice(5),
      value: app.state.records.filter((item) => item.date === date).length
    })),
    habits: dates.map((date) => ({
      label: date.slice(5),
      value: app.state.habitLogs.filter((item) => item.date === date && (item.status === "done" || item.status === "patched")).length
    }))
  };
}

function getTaskWindowSummary() {
  const openTasks = app.state.tasks.filter((task) => task.status !== "done");
  return {
    overdue: openTasks.filter((task) => matchesTaskWindow(task, "overdue")).length,
    today: openTasks.filter((task) => matchesTaskWindow(task, "today")).length,
    upcoming: openTasks.filter((task) => matchesTaskWindow(task, "upcoming")).length,
    openCount: openTasks.length,
    doneCount: app.state.tasks.filter((task) => task.status === "done").length,
    overdueCount: openTasks.filter((task) => matchesTaskWindow(task, "overdue")).length
  };
}

function renderKnowledge() {
  renderKnowledgeFilters();
  const filtered = getFilteredKnowledge();
  renderCollection(nodes.knowledgeList, filtered, (item) => {
    const project = app.state.projects.find((projectItem) => projectItem.id === item.projectId);
    return `
      <div class="list-item">
        <div class="list-item-head">
          <strong>${item.title}</strong>
          <span class="pill">${item.category}</span>
        </div>
        <p>${item.body}</p>
        <p class="item-meta">${item.path ? `路径：${item.path} / ` : ""}${item.tags.join(" / ") || "无标签"} / ${item.status}${project ? ` / 关联项目：${project.title}` : ""}</p>
        <div class="inline-actions tight">
          <span class="mini-pill">${formatKnowledgeTreeLabel(item)}</span>
          <button class="chip-button star-button ${item.starred ? "is-active" : ""}" data-knowledge-manage="star" data-knowledge-id="${item.id}">${item.starred ? "已星标" : "星标"}</button>
          <button class="chip-button" data-knowledge-manage="toggle-status" data-knowledge-id="${item.id}">${item.status === "已实践" ? "改为待验证" : "标为已实践"}</button>
          <button class="chip-button" data-knowledge-manage="edit" data-knowledge-id="${item.id}">编辑</button>
          <button class="chip-button" data-knowledge-manage="delete" data-knowledge-id="${item.id}">删除</button>
        </div>
      </div>
    `;
  });
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
        ${treeSummary.map((item) => `<option value="${escapeHtml(item.path)}" ${app.knowledgeFilter.path === item.path ? "selected" : ""}>${item.path} (${item.count})</option>`).join("")}
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

function renderProjectDetail() {
  const project = app.state.projects.find((item) => item.id === app.activeProjectId);
  if (!project) {
    nodes.projectDetailCard.innerHTML = document.querySelector("#emptyStateTemplate").innerHTML;
    return;
  }
  const relatedKnowledge = app.state.knowledge.filter((item) => item.projectId === project.id);
  const relatedTasks = app.state.tasks.filter((item) => {
    const bundle = app.state.bundles.find((bundleItem) => bundleItem.id === item.bundleId);
    return item.projectId === project.id || bundle?.projectId === project.id;
  });
  const openTasks = relatedTasks.filter((item) => item.status !== "done");
  const doneTasks = relatedTasks.filter((item) => item.status === "done");
  const bundles = app.state.bundles.filter((item) => item.projectId === project.id);
  const relatedContacts = app.state.contacts.filter((item) => (project.relatedContactIds || []).includes(item.id));
  const relatedReviews = app.state.reviews.filter((review) =>
    review.answers.some((answer) =>
      answer.answer.includes(project.title) ||
      (project.monthlyGoal && answer.answer.includes(project.monthlyGoal)) ||
      (project.nextAction && answer.answer.includes(project.nextAction))
    )
  );
  const completionRate = relatedTasks.length ? Math.round((doneTasks.length / relatedTasks.length) * 100) : 0;
  const infoItems = project.projectInfoItems || [];
  const noteItems = project.projectNoteItems || [];

  nodes.projectDetailCard.innerHTML = `
    <div class="section-head">
      <h2>项目详情</h2>
      <span class="pill">${project.title}</span>
    </div>
    <div class="project-detail-grid">
      <div class="detail-tile">
        <span class="item-meta">年度主线</span>
        <strong>${project.yearlyGoal || "待补充"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">当前阶段</span>
        <strong>${project.stage || "未设置"}</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">推进完成度</span>
        <strong>${completionRate}%</strong>
      </div>
      <div class="detail-tile">
        <span class="item-meta">下一步动作</span>
        <strong>${project.nextAction || "待补充"}</strong>
      </div>
    </div>
    <div class="inline-actions">
      <button class="chip-button" id="generateProjectTaskBtn">一键拆解任务</button>
      <button class="chip-button" id="quickLinkedTaskBtn">新增关联任务</button>
      <button class="chip-button" id="quickLinkedKnowledgeBtn">新增关联经验</button>
      <button class="chip-button" id="quickAddProjectInfoBtn">新增信息</button>
      <button class="chip-button" id="quickAddProjectNoteBtn">新增笔记</button>
      <button class="chip-button" id="quickProjectNoteBtn">编辑项目</button>
    </div>
    <div class="project-section">
      <h3>年 → 月 → 周 → 日动作</h3>
      <div class="project-task-list">
        <div class="detail-tile"><strong>年度主线</strong><p class="item-meta">${project.yearlyGoal || "还没写年度主线"}</p></div>
        <div class="detail-tile"><strong>本月任务</strong><p class="item-meta">${project.monthlyGoal || "还没拆出本月任务"}</p></div>
        <div class="detail-tile"><strong>本周推进</strong><p class="item-meta">${project.weeklyFocus || "还没写本周推进"}</p></div>
        <div class="detail-tile"><strong>今日动作</strong><p class="item-meta">${project.nextAction || "还没确定今天最小动作"}</p></div>
      </div>
    </div>
    <div class="project-section">
      <h3>当前待推进任务</h3>
      <div class="project-task-list">
        ${openTasks.length ? openTasks.slice(0, 6).map((task) => `<div class="detail-tile"><strong>${task.title}</strong><p class="item-meta">${task.deadline || "无截止"} / ${priorityLabel(task.priority)}</p></div>`).join("") : `<p class="item-meta">当前没有未完成任务。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目信息收集</h3>
      <div class="project-task-list">
        ${infoItems.length ? infoItems.map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.content}</p><div class="inline-actions tight"><button class="chip-button" data-project-subitem="delete-info" data-subitem-id="${item.id}">删除</button></div></div>`).join("") : `<p class="item-meta">还没有信息条目。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目笔记条目</h3>
      <div class="project-task-list">
        ${noteItems.length ? noteItems.map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.content}</p><div class="inline-actions tight"><button class="chip-button" data-project-subitem="delete-note" data-subitem-id="${item.id}">删除</button></div></div>`).join("") : `<p class="item-meta">还没有笔记条目。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目事件包</h3>
      <div class="project-task-list">
        ${bundles.length ? bundles.map((bundle) => `<div class="detail-tile"><strong>${bundle.title}</strong><p class="item-meta">${bundle.deadline || "未设总截止"}</p></div>`).join("") : `<p class="item-meta">还没有关联事件包。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>项目人脉</h3>
      <div class="project-task-list">
        ${relatedContacts.length ? relatedContacts.map((contact) => `<div class="detail-tile"><strong>${contact.name}</strong><p class="item-meta">${contact.relation || "未分类"} / ${contact.contactInfo || "未写联系方式"}</p></div>`).join("") : `<p class="item-meta">还没有关联人脉。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>关联经验</h3>
      <div class="project-task-list">
        ${relatedKnowledge.length ? relatedKnowledge.slice(0, 4).map((item) => `<div class="detail-tile"><strong>${item.title}</strong><p class="item-meta">${item.category} / ${item.status}</p></div>`).join("") : `<p class="item-meta">还没有关联经验。</p>`}
      </div>
    </div>
    <div class="project-section">
      <h3>关联复盘</h3>
      <div class="project-task-list">
        ${relatedReviews.length ? relatedReviews.slice(0, 4).map((review) => `<div class="detail-tile"><strong>${reviewKindLabel(review.kind)} ${review.date}</strong><p class="item-meta">${review.answers[0]?.answer || "无摘要"}</p></div>`).join("") : `<p class="item-meta">还没有明显提到这个项目的复盘。</p>`}
      </div>
    </div>
  `;

  document.querySelector("#generateProjectTaskBtn").addEventListener("click", () => generateProjectTask(project.id));
  document.querySelector("#quickLinkedTaskBtn").addEventListener("click", () => openEntryModal("task", { projectId: project.id }));
  document.querySelector("#quickLinkedKnowledgeBtn").addEventListener("click", () => openEntryModal("knowledge", { projectId: project.id }));
  document.querySelector("#quickAddProjectInfoBtn").addEventListener("click", () => appendProjectSubitem(project.id, "info"));
  document.querySelector("#quickAddProjectNoteBtn").addEventListener("click", () => appendProjectSubitem(project.id, "note"));
  document.querySelector("#quickProjectNoteBtn").addEventListener("click", () => openEntryModal("project", project));
  nodes.projectDetailCard.querySelectorAll("[data-project-subitem]").forEach((button) => {
    button.addEventListener("click", () => handleProjectSubitem(button.dataset.projectSubitem, project.id, button.dataset.subitemId));
  });
}

async function appendProjectSubitem(projectId, kind) {
  const project = app.state.projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }
  const title = prompt(kind === "info" ? "请输入信息标题" : "请输入笔记标题");
  if (!title) {
    return;
  }
  const content = prompt(kind === "info" ? "请输入信息内容" : "请输入笔记内容");
  if (!content) {
    return;
  }
  const field = kind === "info" ? "projectInfoItems" : "projectNoteItems";
  project[field] = [
    {
      id: uid(),
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString()
    },
    ...(project[field] || [])
  ];
  project.updatedAt = new Date().toISOString();
  project.version = Number(project.version || 1) + 1;
  await saveState();
  renderProjectDetail();
  showToast(kind === "info" ? "项目资料已添加" : "项目笔记已添加");
}

async function handleProjectSubitem(action, projectId, subitemId) {
  const project = app.state.projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }
  if (action === "delete-info") {
    project.projectInfoItems = (project.projectInfoItems || []).filter((item) => item.id !== subitemId);
  }
  if (action === "delete-note") {
    project.projectNoteItems = (project.projectNoteItems || []).filter((item) => item.id !== subitemId);
  }
  project.updatedAt = new Date().toISOString();
  project.version = Number(project.version || 1) + 1;
  await saveState();
  renderProjectDetail();
  showToast("条目已删除");
}

function getKnowledgeTreeSummary() {
  const map = new Map();
  app.state.knowledge.forEach((item) => {
    const path = (item.path || "").trim();
    if (!path) {
      return;
    }
    map.set(path, (map.get(path) || 0) + 1);
  });
  return [...map.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path, "zh-CN"))
    .slice(0, 20);
}

function formatKnowledgeTreeLabel(item) {
  const parts = [item.category, ...(item.path ? item.path.split("/").map((part) => part.trim()).filter(Boolean) : [])];
  return parts.join(" > ");
}

function habitSelectHtml(name, selectedValue = "") {
  return `
    <select name="${name}">
      <option value="">不关联习惯</option>
      ${app.state.habits.map((item) => `<option value="${item.id}" ${selectedValue === item.id ? "selected" : ""}>${item.name}</option>`).join("")}
    </select>
  `;
}

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
        <label><span>关联事件包</span>${bundleSelectHtml("relatedBundleId", preset.relatedBundleId || "")}</label>
        <label><span>关联习惯</span>${habitSelectHtml("relatedHabitId", preset.relatedHabitId || "")}</label>
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
    bundle: {
      title: preset.id ? "编辑事件包" : "新增事件包",
      fields: `
        <input type="hidden" name="entryType" value="bundle">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>事件包名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>颜色</span><input name="color" type="color" value="${escapeHtml(preset.color || "#5B7C99")}"></label>
        <label><span>总截止</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
        <label><span>备注</span><textarea name="note">${escapeHtml(preset.note || "")}</textarea></label>
      `
    },
    task: {
      title: preset.id ? "编辑任务" : "新增任务",
      fields: `
        <input type="hidden" name="entryType" value="task">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>任务名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
        <label><span>所属事件包</span>${bundleSelectHtml("bundleId", preset.bundleId || "")}</label>
        <label><span>类型</span>
          <select name="taskType">
            <option value="normal" ${preset.type !== "progress" ? "selected" : ""}>普通任务</option>
            <option value="progress" ${preset.type === "progress" ? "selected" : ""}>进度型任务</option>
          </select>
        </label>
        <label><span>截止日期</span><input name="deadline" type="date" value="${escapeHtml(preset.deadline || "")}"></label>
        <label><span>优先级</span>
          <select name="priority">
            <option value="high" ${preset.priority === "high" ? "selected" : ""}>高</option>
            <option value="medium" ${!preset.priority || preset.priority === "medium" ? "selected" : ""}>中</option>
            <option value="low" ${preset.priority === "low" ? "selected" : ""}>低</option>
          </select>
        </label>
        <label><span>目标单位</span><input name="unit" placeholder="页 / 分钟 / 次" value="${escapeHtml(preset.unit || "")}"></label>
        <label><span>目标值</span><input name="targetValue" type="number" min="1" value="${preset.targetValue || ""}"></label>
        <label><span>目标期限</span><input name="targetDeadline" type="date" value="${escapeHtml(preset.targetDeadline || "")}"></label>
        <label><span>当前进度</span><input name="currentValue" type="number" min="0" value="${preset.currentValue ?? 0}"></label>
      `
    },
    project: {
      title: preset.id ? "编辑项目" : "新增长期项目",
      fields: `
        <input type="hidden" name="entryType" value="project">
        <input type="hidden" name="id" value="${preset.id || ""}">
        <label><span>项目名称</span><input name="title" required value="${escapeHtml(preset.title || "")}"></label>
        <label><span>年度主线</span><input name="yearlyGoal" value="${escapeHtml(preset.yearlyGoal || "")}"></label>
        <label><span>当前阶段</span><input name="stage" placeholder="例如：信息收集 / 搭建 / 输出" value="${escapeHtml(preset.stage || "")}"></label>
        <label><span>本月任务</span><input name="monthlyGoal" value="${escapeHtml(preset.monthlyGoal || "")}"></label>
        <label><span>本周推进</span><input name="weeklyFocus" value="${escapeHtml(preset.weeklyFocus || "")}"></label>
        <label><span>下一步动作</span><input name="nextAction" value="${escapeHtml(preset.nextAction || "")}"></label>
        <label><span>最近进展</span><textarea name="recentProgress">${escapeHtml(preset.recentProgress || "")}</textarea></label>
        <label><span>信息收集</span><textarea name="infoInbox">${escapeHtml(preset.infoInbox || "")}</textarea></label>
        <label><span>项目笔记</span><textarea name="notes">${escapeHtml(preset.notes || "")}</textarea></label>
        <label><span>关联人脉</span>${contactChecklistHtml("relatedContactIds", preset.relatedContactIds || [])}</label>
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
        <label><span>关联项目</span>${projectSelectHtml("projectId", preset.projectId || "")}</label>
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
            ${emotionOptions.map((item) => `<option value="${item.value}" ${Number(preset.level) === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
          </select>
        </label>
        <label><span>一句话备注</span><textarea name="note" placeholder="今天发生了什么？">${escapeHtml(preset.note || "")}</textarea></label>
      `
    }
  };

  const config = configs[type];
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
        relatedBundleId: String(formData.get("relatedBundleId") || ""),
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
    bundle: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        projectId: String(formData.get("projectId") || ""),
        color: String(formData.get("color")),
        deadline: String(formData.get("deadline") || ""),
        note: String(formData.get("note") || "").trim(),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.bundles.find((bundle) => bundle.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.bundles.push({ id: uid(), createdAt: now, version: 1, ...payload });
    },
    task: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        projectId: String(formData.get("projectId") || ""),
        bundleId: String(formData.get("bundleId") || ""),
        type: String(formData.get("taskType")),
        deadline: String(formData.get("deadline") || ""),
        priority: String(formData.get("priority")),
        unit: String(formData.get("unit") || "").trim(),
        targetValue: Number(formData.get("targetValue") || 0),
        targetDeadline: String(formData.get("targetDeadline") || ""),
        currentValue: Number(formData.get("currentValue") || 0),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.tasks.find((task) => task.id === id);
        if (item) {
          if (payload.deadline && item.deadline && payload.deadline !== item.deadline) {
            item.postponeHistory = [...(item.postponeHistory || []), { from: item.deadline, to: payload.deadline, at: now }];
          }
          if (payload.type === "progress" && payload.currentValue !== item.currentValue) {
            item.progressLogs = [...(item.progressLogs || []), { value: payload.currentValue, at: now }];
          }
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      app.state.tasks.push({
        id: uid(),
        createdAt: now,
        version: 1,
        status: "todo",
        postponeCount: 0,
        postponeHistory: [],
        progressLogs: payload.type === "progress" ? [{ value: payload.currentValue, at: now }] : [],
        ...payload
      });
    },
    project: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        yearlyGoal: String(formData.get("yearlyGoal") || "").trim(),
        stage: String(formData.get("stage") || "").trim(),
        monthlyGoal: String(formData.get("monthlyGoal") || "").trim(),
        weeklyFocus: String(formData.get("weeklyFocus") || "").trim(),
        nextAction: String(formData.get("nextAction") || "").trim(),
        recentProgress: String(formData.get("recentProgress") || "").trim(),
        infoInbox: String(formData.get("infoInbox") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
        relatedContactIds: formData.getAll("relatedContactIds").map((item) => String(item)),
        updatedAt: now
      };
      const id = String(formData.get("id") || "");
      if (id) {
        const item = app.state.projects.find((project) => project.id === id);
        if (item) {
          Object.assign(item, payload);
          item.version = Number(item.version || 1) + 1;
        }
        return;
      }
      const projectId = uid();
      app.state.projects.push({ id: projectId, createdAt: now, version: 1, projectInfoItems: [], projectNoteItems: [], ...payload });
      app.activeProjectId = projectId;
    },
    knowledge: () => {
      const payload = {
        title: String(formData.get("title")).trim(),
        category: String(formData.get("category")),
        path: String(formData.get("path") || "").trim(),
        body: String(formData.get("body")).trim(),
        tags: splitTags(formData.get("tags")),
        projectId: String(formData.get("projectId") || ""),
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
    },
    review: () => {
      const kind = String(formData.get("reviewKind"));
      const questions = getReviewQuestions(kind);
      const answers = questions.map((question, index) => ({
        question,
        answer: String(formData.get(`answer_${index}`)).trim()
      }));
      app.state.reviews.unshift({
        id: uid(),
        kind,
        date: localDateString(),
        createdAt: now,
        updatedAt: now,
        version: 1,
        answers,
        snapshot: buildReviewSnapshot(),
        skipped: false
      });
      if (kind === "daily" && answers[1]?.answer) {
        app.state.tasks.push({
          id: uid(),
          createdAt: now,
          updatedAt: now,
          version: 1,
          title: answers[1].answer,
          bundleId: "",
          projectId: "",
          type: "normal",
          deadline: addDays(localDateString(), 1),
          priority: "high",
          status: "todo",
          unit: "",
          targetValue: 0,
          targetDeadline: "",
          currentValue: 0,
          postponeCount: 0,
          postponeHistory: [],
          progressLogs: [],
          autoGeneratedFromReview: true
        });
      }
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

function renderTimeline() {
  const items = app.state.records.filter((item) => item.date === app.selectedDate);
  renderCollection(nodes.todayTimeline, items, (record) => {
    const bundle = app.state.bundles.find((item) => item.id === record.relatedBundleId);
    const habit = app.state.habits.find((item) => item.id === record.relatedHabitId);
    return `
      <div class="timeline-item">
        <div class="list-item-head">
          <strong>${record.content}</strong>
          <span class="timestamp">${formatTime(record.createdAt)}</span>
        </div>
        <p>${record.tags.map((tag) => `<span class="pill">${tag}</span>`).join(" ")}</p>
        <p class="item-meta">${[bundle ? `事件包：${bundle.title}` : "", habit ? `习惯：${habit.name}` : ""].filter(Boolean).join(" / ") || "未关联其他内容"}</p>
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

function renderTaskCard(task) {
  const isProgress = task.type === "progress";
  const percent = isProgress && task.targetValue ? Math.min(100, Math.round((task.currentValue / task.targetValue) * 100)) : 0;
  const bundle = app.state.bundles.find((item) => item.id === task.bundleId);
  const project = getTaskProject(task);
  const dateLabel = describeTaskTiming(task.deadline);
  const postponeHistory = task.postponeHistory || [];
  const progressLogs = task.progressLogs || [];
  return `
    <div class="list-item">
      <div class="list-item-head">
        <strong>${task.title}</strong>
        <span class="badge ${task.priority === "high" ? "warning" : task.status === "done" ? "success" : ""}">${priorityLabel(task.priority)}</span>
      </div>
      <p class="item-meta">${[dateLabel, task.deadline ? `截止 ${task.deadline}` : "", task.targetDeadline ? `目标期限 ${task.targetDeadline}` : "", bundle?.title ? `事件包 ${bundle.title}` : "", project?.title ? `项目 ${project.title}` : ""].filter(Boolean).join(" / ")}</p>
      ${isProgress ? `<div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div><p class="item-meta">进度 ${task.currentValue}/${task.targetValue || 0}${task.unit || ""} / 记录 ${progressLogs.length} 次</p>` : ""}
      <p class="item-meta">${postponeHistory.length ? `顺延记录 ${postponeHistory.length} 次` : "还没有顺延记录"}${postponeHistory[0] ? ` / 最近：${postponeHistory[0].from} -> ${postponeHistory[0].to}` : ""}</p>
      <div class="inline-actions tight">
        <button class="chip-button" data-task-action="complete" data-task-id="${task.id}">${task.status === "done" ? "已完成" : "完成"}</button>
        <button class="chip-button" data-task-manage="edit" data-task-id="${task.id}">编辑</button>
        <button class="chip-button" data-task-manage="postpone" data-task-id="${task.id}">顺延</button>
        <button class="chip-button" data-task-manage="delete" data-task-id="${task.id}">删除</button>
      </div>
    </div>
  `;
}

function renderContacts() {
  renderCollection(nodes.contactList, app.state.contacts, (contact) => `
    <div class="list-item">
      <div class="contact-head">
        <span class="avatar-badge">${escapeHtml((contact.name || "人").slice(0, 1))}</span>
        <div>
          <div class="list-item-head">
            <strong>${contact.name}</strong>
            <span class="pill">${contact.relation || "未分类"}</span>
          </div>
          <p class="item-meta">${[contact.title, ...(contact.relationTags || []), contact.contactInfo].filter(Boolean).join(" / ") || "还没有补充细节。"}</p>
        </div>
      </div>
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
          <p class="item-meta">称呼：${contact.title || "未填写"}</p>
          <p class="item-meta">关系标签：${(contact.relationTags || []).join(" / ") || contact.relation || "未填写"}</p>
          <p class="item-meta">联系方式：${contact.contactInfo || "未填写"}</p>
          <p class="item-meta">生日：${contact.birthday || "未填写"}</p>
          <p class="item-meta">印象备注：${contact.impression || contact.note || "未填写"}</p>
        </div>
      ` : ""}
    </div>
  `);
  nodes.contactList.querySelectorAll("[data-contact-manage]").forEach((button) => {
    button.addEventListener("click", () => handleContactManage(button.dataset.contactManage, button.dataset.contactId));
  });
}

function openSettings() {
  nodes.dailyReminderTime.value = app.state.settings.reminderDailyTime;
  nodes.weeklyReminderTime.value = app.state.settings.reminderWeeklyTime;
  nodes.forcedReviewDays.value = app.state.settings.forcedReviewDays;
  nodes.autoBackupDays.value = app.state.settings.autoBackupDays;
  nodes.dailyTemplateInput.value = getReviewQuestions("daily").join("\n");
  nodes.weeklyTemplateInput.value = getReviewQuestions("weekly").join("\n");
  nodes.monthlyTemplateInput.value = getReviewQuestions("monthly").join("\n");
  nodes.quarterlyTemplateInput.value = getReviewQuestions("quarterly").join("\n");
  nodes.yearlyTemplateInput.value = getReviewQuestions("yearly").join("\n");
  nodes.settingsNote.textContent = `最近备份：${app.state.meta.lastBackupAt ? app.state.meta.lastBackupAt.slice(0, 16).replace("T", " ") : "还没有"}；回收站：${app.state.trash.length} 条。`;
  renderBackupLogList();
  nodes.settingsDialog.showModal();
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
        <p class="item-meta">${item.filename || "未命名文件"} / ${item.trigger || "manual"}</p>
      </div>
      <span class="mini-pill">${item.status === "failed" ? "失败" : "完成"}</span>
    </div>
  `).join("");
}

function maybeSurfaceReminder() {
  const latestReviewDate = app.state.reviews[0]?.date;
  const today = localDateString();
  if (latestReviewDate === today) {
    return;
  }
  const now = new Date();
  const [hour, minute] = app.state.settings.reminderDailyTime.split(":").map(Number);
  if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) {
    return;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("我的外置大脑", {
      body: "今天还没复盘，花 2 分钟把今天收住。"
    });
  }

  nodes.reviewStatusCard.dataset.reminderState = "due";
}

function renderReviewStatus() {
  const latestReview = app.state.reviews[0];
  const overdueDays = getReviewOverdueDays();
  const stageText =
    overdueDays <= 0 ? "未超期" : overdueDays <= 6 ? "0-6 天提醒档" : overdueDays <= 13 ? "7-13 天加强档" : "14 天以上强制档";

  nodes.reviewStatusCard.innerHTML = `
    <div class="section-head">
      <h2>复盘状态</h2>
      <span class="badge ${overdueDays > 0 ? "warning" : "success"}">${stageText}</span>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="item-meta">距上次复盘</span><strong>${latestReview ? daysBetween(latestReview.date, localDateString()) : "-"} 天</strong></div>
      <div class="metric"><span class="item-meta">强制阈值</span><strong>${app.state.settings.forcedReviewDays} 天</strong></div>
      <div class="metric"><span class="item-meta">累计复盘</span><strong>${app.state.reviews.length} 次</strong></div>
    </div>
    <div class="review-banner">
      <span class="subtle">=^.^= 今天最重要的动作，是继续打开这里把自己收回来。若浏览器通知不稳定，建议同时设系统闹钟兜底。</span>
      <button class="primary-button" id="reviewNowBtn">去复盘</button>
    </div>
  `;

  document.querySelector("#reviewNowBtn").addEventListener("click", () => {
    setActiveScreen("reviews");
    openReviewComposer("daily");
  });
}

function bindTaskAction(button) {
  button.addEventListener("click", async () => {
    const task = app.state.tasks.find((item) => item.id === button.dataset.taskId);
    if (!task) {
      return;
    }

    const action = button.dataset.taskAction;
    if (action === "done" || action === "complete") {
      task.status = "done";
      task.updatedAt = new Date().toISOString();
    }
    if (action === "postpone") {
      const current = task.deadline || addDays(localDateString(), 1);
      const nextDeadline = prompt("请输入新的截止日期（格式：2026-08-27）", current);
      if (!nextDeadline) {
        return;
      }
      if (!isValidDateString(nextDeadline)) {
        alert("日期格式不对，请按 2026-08-27 这种格式填写。");
        return;
      }
      task.postponeHistory = [...(task.postponeHistory || []), { from: task.deadline || "", to: nextDeadline, at: new Date().toISOString() }];
      task.deadline = nextDeadline;
      task.postponeCount = Number(task.postponeCount || 0) + 1;
      task.updatedAt = new Date().toISOString();
    }
    if (action === "progress") {
      task.currentValue = Number(task.currentValue || 0) + 1;
      task.progressLogs = [...(task.progressLogs || []), { value: task.currentValue, at: new Date().toISOString() }];
      task.updatedAt = new Date().toISOString();
    }

    await saveState();
    renderAll();
  });
}

async function handleTaskManage(action, taskId) {
  const task = app.state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }
  if (action === "edit") {
    openEntryModal("task", task);
    return;
  }
  if (action === "postpone") {
    const current = task.deadline || addDays(localDateString(), 1);
    const nextDeadline = prompt("请输入新的截止日期（格式：2026-08-27）", current);
    if (!nextDeadline) {
      return;
    }
    if (!isValidDateString(nextDeadline)) {
      alert("日期格式不对，请按 2026-08-27 这种格式填写。");
      return;
    }
    task.postponeHistory = [...(task.postponeHistory || []), { from: task.deadline || "", to: nextDeadline, at: new Date().toISOString() }];
    task.deadline = nextDeadline;
    task.postponeCount = Number(task.postponeCount || 0) + 1;
    task.updatedAt = new Date().toISOString();
    await saveState();
    renderAll();
    return;
  }
  if (action === "delete") {
    if (!confirm(`确定删除任务「${task.title}」吗？`)) {
      return;
    }
    moveToTrash("task", structuredClone(task));
    app.state.tasks = app.state.tasks.filter((item) => item.id !== taskId);
    await saveState();
    renderAll();
  }
}

async function batchTaskAction(action) {
  const tasks = getFilteredTasks();
  if (!tasks.length) {
    alert("当前筛选结果里没有可操作的任务。");
    return;
  }
  if (action === "complete" && !confirm(`确定把当前筛选结果中的 ${tasks.length} 个任务批量标记为完成吗？`)) {
    return;
  }
  if (action === "postpone" && !confirm(`确定把当前筛选结果中的 ${tasks.length} 个未完成任务统一顺延 1 天吗？`)) {
    return;
  }
  if (action === "complete") {
    tasks.forEach((task) => {
      task.status = "done";
      task.updatedAt = new Date().toISOString();
    });
  }
  if (action === "postpone") {
    tasks.forEach((task) => {
      if (task.status !== "done") {
        const from = task.deadline || "";
        task.deadline = task.deadline ? addDays(task.deadline, 1) : addDays(localDateString(), 1);
        task.postponeCount = Number(task.postponeCount || 0) + 1;
        task.postponeHistory = [...(task.postponeHistory || []), { from, to: task.deadline, at: new Date().toISOString() }];
        task.updatedAt = new Date().toISOString();
      }
    });
  }
  if (action === "delete-done") {
    const ids = new Set(tasks.filter((task) => task.status === "done").map((task) => task.id));
    if (!ids.size) {
      alert("当前筛选结果里没有已完成任务。");
      return;
    }
    if (!confirm(`确定删除当前筛选结果中的 ${ids.size} 个已完成任务吗？`)) {
      return;
    }
    tasks.filter((task) => ids.has(task.id)).forEach((task) => moveToTrash("task", structuredClone(task)));
    app.state.tasks = app.state.tasks.filter((task) => !ids.has(task.id));
  }
  await saveState();
  renderAll();
}

function createDefaultState() {
  return {
    schemaVersion: 2,
    meta: {
      lastBackupAt: "",
      installedAt: new Date().toISOString()
    },
    settings: {
      reminderDailyTime: "22:00",
      reminderWeeklyTime: "20:00",
      forcedReviewDays: 14,
      autoBackupDays: 7,
      notificationPermissionAskedAt: "",
      reviewTemplates: JSON.parse(JSON.stringify(defaultReviewTemplates))
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
    backupLogs: []
  };
}

function normalizeState(data) {
  const defaults = createDefaultState();
  const normalized = {
    ...defaults,
    ...data,
    schemaVersion: Math.max(2, Number(data?.schemaVersion || 1)),
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
    impression: ""
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
      `任务 ${preview.tasks.length} 项`,
      `项目 ${preview.projects.length} 个`,
      `经验 ${preview.knowledge.length} 条`,
      `复盘 ${preview.reviews.length} 条`
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
