const state = {
  workbookList: [],
  currentWorkbook: null,
  questions: [],
  order: [],
  currentIndex: 0,
  mode: "normal",
  masteryTarget: 2,
  reviewItems: [],
  reviewTurn: 0,
  currentReviewItem: null,
  normalResults: [],
  correctCount: 0,
  attemptCount: 0,
};

const els = {
  titleTop: document.getElementById("titleTop"),
  status: document.getElementById("status"),
  setupPanel: document.getElementById("setupPanel"),
  quizPanel: document.getElementById("quizPanel"),
  finishPanel: document.getElementById("finishPanel"),
  workbookSelect: document.getElementById("workbookSelect"),
  reviewMode: document.getElementById("reviewMode"),
  masteryCount: document.getElementById("masteryCount"),
  startButton: document.getElementById("startButton"),
  progressText: document.getElementById("progressText"),
  promptText: document.getElementById("promptText"),
  questionImageWrap: document.getElementById("questionImageWrap"),
  questionImage: document.getElementById("questionImage"),
  questionText: document.getElementById("questionText"),
  answerTrue: document.getElementById("answerTrue"),
  answerFalse: document.getElementById("answerFalse"),
  resultArea: document.getElementById("resultArea"),
  resultText: document.getElementById("resultText"),
  explainText: document.getElementById("explainText"),
  nextButton: document.getElementById("nextButton"),
  scoreText: document.getElementById("scoreText"),
  answerListTitle: document.getElementById("answerListTitle"),
  answerList: document.getElementById("answerList"),
  restartButton: document.getElementById("restartButton"),
};

async function init() {
  bindEvents();

  try {
    const res = await fetch("./data/index.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`index fetch failed: ${res.status}`);
    }

    const index = await res.json();
    state.workbookList = Array.isArray(index.workbooks) ? index.workbooks : [];

    if (state.workbookList.length === 0) {
      throw new Error("workbook list is empty");
    }

    renderWorkbookSelect();
    els.status.textContent = `${state.workbookList.length} 件の Workbook を読み込みました。`;
  } catch (err) {
    els.status.textContent = "Workbook の読み込みに失敗しました。";
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

function bindEvents() {
  els.titleTop.addEventListener("click", scrollToTop);
  els.titleTop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      scrollToTop();
    }
  });
  els.startButton.addEventListener("click", startQuiz);
  els.answerTrue.addEventListener("click", () => answerQuestion(true));
  els.answerFalse.addEventListener("click", () => answerQuestion(false));
  els.nextButton.addEventListener("click", moveNext);
  els.restartButton.addEventListener("click", backToSetup);
}

function renderWorkbookSelect() {
  els.workbookSelect.innerHTML = "";

  for (const wb of state.workbookList) {
    const opt = document.createElement("option");
    opt.value = String(wb.workbook);
    opt.textContent = `Workbook ${wb.workbook}（${wb.question_count}問）`;
    els.workbookSelect.appendChild(opt);
  }
}

async function startQuiz() {
  const workbookId = Number(els.workbookSelect.value);
  const workbook = state.workbookList.find((v) => v.workbook === workbookId);

  if (!workbook) {
    els.status.textContent = "Workbook を選択してください。";
    return;
  }

  try {
    const res = await fetch(`./${workbook.path}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`workbook fetch failed: ${res.status}`);
    }

    const wb = await res.json();
    state.currentWorkbook = wb.workbook;
    state.questions = flattenQuestions(wb.questions, res.url);

    if (state.questions.length === 0) {
      throw new Error("question list is empty");
    }

    state.mode = els.reviewMode.checked ? "review" : "normal";
    state.masteryTarget = sanitizeMasteryTarget(Number(els.masteryCount.value));
    state.correctCount = 0;
    state.attemptCount = 0;
    state.normalResults = [];

    if (state.mode === "review") {
      initReviewSession();
    } else {
      initNormalSession();
    }

    els.setupPanel.classList.add("hidden");
    els.finishPanel.classList.add("hidden");
    els.quizPanel.classList.remove("hidden");

    renderQuestion();
    if (state.mode === "review") {
      els.status.textContent = `Workbook ${state.currentWorkbook} を復習モード（連続 ${state.masteryTarget} 回正解で卒業）で開始しました。`;
    } else {
      els.status.textContent = `Workbook ${state.currentWorkbook} を開始しました。`;
    }
  } catch (err) {
    els.status.textContent = "問題データの読み込みに失敗しました。";
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

function initNormalSession() {
  state.order = buildQuestionOrder(state.questions.length);
  state.currentIndex = 0;
  state.reviewItems = [];
  state.currentReviewItem = null;
  state.reviewTurn = 0;
}

function initReviewSession() {
  const order = buildQuestionOrder(state.questions.length);
  state.reviewItems = order.map((idx) => ({
    idx,
    streak: 0,
    dueAt: 0,
    mastered: false,
  }));
  state.reviewTurn = 0;
  state.currentReviewItem = pickNextReviewItem();
  state.order = [];
  state.currentIndex = 0;
}

function buildQuestionOrder(total) {
  const order = [];

  for (let i = 0; i < total; i += 1) {
    order.push(i);
  }

  return order;
}

function sanitizeMasteryTarget(value) {
  if (!Number.isInteger(value)) {
    return 2;
  }

  return Math.min(Math.max(value, 1), 5);
}

function flattenQuestions(questions, workbookBaseUrl) {
  if (!Array.isArray(questions)) {
    return [];
  }

  const out = [];
  for (const q of questions) {
    if (!Array.isArray(q.subs)) {
      continue;
    }

    for (const sub of q.subs) {
      out.push({
        qNum: q.q_num,
        qSub: sub.q_sub,
        prompt: q.prompt,
        imageUrl: resolveQuestionImageURL(q, workbookBaseUrl),
        text: sub.question,
        answer: sub.answer,
        explain: sub.explain,
      });
    }
  }
  return out;
}

function resolveQuestionImageURL(question, workbookBaseUrl) {
  if (question && typeof question.image_path === "string" && question.image_path) {
    try {
      return new URL(question.image_path, workbookBaseUrl).toString();
    } catch (err) {
      console.error("invalid image_path:", question.image_path, err);
    }
  }
  return "";
}

function getCurrentQuestion() {
  if (state.mode === "review") {
    if (!state.currentReviewItem) {
      return null;
    }
    return state.questions[state.currentReviewItem.idx];
  }

  const questionIdx = state.order[state.currentIndex];
  if (questionIdx == null) {
    return null;
  }
  return state.questions[questionIdx];
}

function renderQuestion() {
  const current = getCurrentQuestion();
  if (!current) {
    showFinish();
    return;
  }

  if (state.mode === "review") {
    const total = state.reviewItems.length;
    const mastered = countMastered();
    const remaining = total - mastered;
    els.progressText.textContent = `解答 ${state.attemptCount + 1} 回目 | 習得 ${mastered}/${total} | 残り ${remaining}`;
  } else {
    els.progressText.textContent = `${state.currentIndex + 1} / ${state.order.length} 問`;
  }

  els.questionText.textContent = current.text;

  if (current.prompt) {
    els.promptText.textContent = current.prompt;
    els.promptText.classList.remove("hidden");
  } else {
    els.promptText.classList.add("hidden");
  }

  if (els.questionImageWrap && els.questionImage) {
    if (current.imageUrl) {
      els.questionImage.src = current.imageUrl;
      els.questionImageWrap.classList.remove("hidden");
    } else {
      els.questionImage.removeAttribute("src");
      els.questionImageWrap.classList.add("hidden");
    }
  }

  els.resultArea.classList.add("hidden");
  els.resultText.textContent = "";
  els.resultText.classList.remove("ok", "ng");
  els.explainText.textContent = "";

  els.answerTrue.disabled = false;
  els.answerFalse.disabled = false;
}

function answerQuestion(answer) {
  const current = getCurrentQuestion();
  if (!current) {
    return;
  }

  state.attemptCount += 1;

  const isCorrect = current.answer === answer;
  if (isCorrect) {
    state.correctCount += 1;
  }

  if (state.mode === "review") {
    updateReviewItem(isCorrect);
  } else {
    state.normalResults.push({
      order: state.currentIndex + 1,
      qNum: current.qNum,
      qSub: current.qSub,
      question: current.text,
      userAnswer: answer,
      isCorrect,
    });
  }

  els.answerTrue.disabled = true;
  els.answerFalse.disabled = true;

  els.resultText.textContent = isCorrect ? "正解！" : "不正解…";
  els.resultText.classList.add(isCorrect ? "ok" : "ng");
  els.explainText.textContent = current.explain;
  els.resultArea.classList.remove("hidden");
}

function updateReviewItem(isCorrect) {
  const item = state.currentReviewItem;
  if (!item || item.mastered) {
    return;
  }

  if (isCorrect) {
    item.streak += 1;
    if (item.streak >= state.masteryTarget) {
      item.mastered = true;
      return;
    }
    item.dueAt = state.reviewTurn + getReviewInterval(item.streak);
    return;
  }

  item.streak = 0;
  item.dueAt = state.reviewTurn + 1;
}

function getReviewInterval(streak) {
  if (streak <= 0) {
    return 1;
  }

  return Math.min(Math.pow(2, streak), 12);
}

function countMastered() {
  let mastered = 0;
  for (const item of state.reviewItems) {
    if (item.mastered) {
      mastered += 1;
    }
  }
  return mastered;
}

function pickNextReviewItem() {
  const active = state.reviewItems.filter((item) => !item.mastered);
  if (active.length === 0) {
    return null;
  }

  let dueCandidates = active.filter((item) => item.dueAt <= state.reviewTurn);
  if (dueCandidates.length === 0) {
    let minDue = active[0].dueAt;
    for (const item of active) {
      if (item.dueAt < minDue) {
        minDue = item.dueAt;
      }
    }
    state.reviewTurn = minDue;
    dueCandidates = active.filter((item) => item.dueAt <= state.reviewTurn);
  }

  dueCandidates.sort((a, b) => {
    if (a.dueAt !== b.dueAt) {
      return a.dueAt - b.dueAt;
    }
    if (a.streak !== b.streak) {
      return a.streak - b.streak;
    }
    return a.idx - b.idx;
  });

  return dueCandidates[0];
}

function moveNext() {
  if (state.mode === "review") {
    if (countMastered() >= state.reviewItems.length) {
      showFinish();
      return;
    }

    state.reviewTurn += 1;
    state.currentReviewItem = pickNextReviewItem();

    if (!state.currentReviewItem) {
      showFinish();
      return;
    }

    renderQuestion();
    return;
  }

  state.currentIndex += 1;

  if (state.currentIndex >= state.order.length) {
    showFinish();
    return;
  }

  renderQuestion();
}

function showFinish() {
  els.quizPanel.classList.add("hidden");
  els.finishPanel.classList.remove("hidden");

  if (state.mode === "review") {
    const accuracy =
      state.attemptCount > 0
        ? Math.round((state.correctCount / state.attemptCount) * 100)
        : 0;
    els.scoreText.textContent = `習得完了: ${state.reviewItems.length}問 / 解答 ${state.attemptCount}回 / 正答率 ${accuracy}%`;
    els.answerListTitle.classList.add("hidden");
    els.answerList.classList.add("hidden");
    els.status.textContent = `Workbook ${state.currentWorkbook} の復習モードを完了しました。`;
    return;
  }

  els.scoreText.textContent = `${state.order.length}問中 ${state.correctCount}問 正解`;
  renderNormalResultList();
  els.status.textContent = `Workbook ${state.currentWorkbook} を完了しました。`;
}

function renderNormalResultList() {
  els.answerList.innerHTML = "";

  if (state.normalResults.length === 0) {
    els.answerListTitle.classList.add("hidden");
    els.answerList.classList.add("hidden");
    return;
  }

  for (const row of state.normalResults) {
    const li = document.createElement("li");
    li.className = "answer-item";

    const order = document.createElement("span");
    order.className = "answer-order";
    order.textContent = `${row.order}.`;

    const text = document.createElement("span");
    text.textContent = `Q${row.qNum}-${row.qSub} ${row.question}`;

    const judgement = document.createElement("span");
    judgement.className = `answer-judgement ${row.isCorrect ? "ok" : "ng"}`;
    const answerSymbol = row.userAnswer ? "◯" : "✕";
    judgement.textContent = row.isCorrect
      ? `正解 (${answerSymbol})`
      : `不正解 (${answerSymbol})`;

    li.appendChild(order);
    li.appendChild(text);
    li.appendChild(judgement);
    els.answerList.appendChild(li);
  }

  els.answerListTitle.classList.remove("hidden");
  els.answerList.classList.remove("hidden");
}

function backToSetup() {
  els.finishPanel.classList.add("hidden");
  els.setupPanel.classList.remove("hidden");
  els.answerListTitle.classList.add("hidden");
  els.answerList.classList.add("hidden");
  els.answerList.innerHTML = "";
  els.status.textContent = "Workbook を選択してください。";
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

init();
