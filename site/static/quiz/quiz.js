const state = {
  workbookList: [],
  currentWorkbook: null,
  questions: [],
  nextBaseIndex: 0,
  currentItem: null,
  turn: 0,
  attemptCount: 0,
  score: 0,
  normalCorrect: 0,
  normalAnswered: 0,
  reviewItems: [],
  missedQuestionIndexes: new Set(),
  autoWorkbook: null,
};

const REVIEW_INITIAL_CORRECT_TARGET = 2;
const REVIEW_STAGE_GAPS = [3, 6];

const els = {
  quizStatus: document.getElementById("quizStatus"),
  setupPanel: document.getElementById("setupPanel"),
  playPanel: document.getElementById("playPanel"),
  finishPanel: document.getElementById("finishPanel"),
  workbookSelect: document.getElementById("workbookSelect"),
  startQuestion: document.getElementById("startQuestion"),
  endQuestion: document.getElementById("endQuestion"),
  startRandomButton: document.getElementById("startRandomButton"),
  startAscButton: document.getElementById("startAscButton"),
  progressText: document.getElementById("progressText"),
  questionImageWrap: document.getElementById("questionImageWrap"),
  questionImage: document.getElementById("questionImage"),
  questionPrompt: document.getElementById("questionPrompt"),
  questionText: document.getElementById("questionText"),
  answerTrue: document.getElementById("answerTrue"),
  answerFalse: document.getElementById("answerFalse"),
  resultArea: document.getElementById("resultArea"),
  resultText: document.getElementById("resultText"),
  explainText: document.getElementById("explainText"),
  nextButton: document.getElementById("nextButton"),
  scoreText: document.getElementById("scoreText"),
  missedTitle: document.getElementById("missedTitle"),
  missedList: document.getElementById("missedList"),
  restartButton: document.getElementById("restartButton"),
};

async function init() {
  bindEvents();
  state.autoWorkbook = Number(window.QUIZ_WORKBOOK) || null;

  const indexUrl = window.QUIZ_INDEX_URL;
  if (!indexUrl) {
    els.quizStatus.textContent = "設定エラー: index URL がありません。";
    return;
  }

  try {
    const res = await fetch(indexUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`index fetch failed: ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data.workbooks) || data.workbooks.length === 0) {
      throw new Error("workbook list is empty");
    }

    const base = new URL(res.url);
    state.workbookList = data.workbooks.map((wb) => ({
      workbook: wb.workbook,
      questionCount: wb.question_count,
      path: new URL(wb.path, base).toString(),
    }));

    renderWorkbookSelect();
    if (state.autoWorkbook) {
      els.quizStatus.textContent = "";
      return;
    }

    els.quizStatus.textContent = `${state.workbookList.length} 件の Workbook を読み込みました。`;
  } catch (err) {
    els.quizStatus.textContent = "問題データの読み込みに失敗しました。";
    console.error(err);
  }
}

function bindEvents() {
  if (els.startRandomButton) {
    els.startRandomButton.addEventListener("click", () => startQuiz("random"));
  }
  if (els.startAscButton) {
    els.startAscButton.addEventListener("click", () => startQuiz("asc"));
  }
  if (els.answerTrue) {
    els.answerTrue.addEventListener("click", () => submitAnswer(true));
  }
  if (els.answerFalse) {
    els.answerFalse.addEventListener("click", () => submitAnswer(false));
  }
  if (els.nextButton) {
    els.nextButton.addEventListener("click", nextQuestion);
  }
  if (els.restartButton) {
    els.restartButton.addEventListener("click", resetQuiz);
  }
}

function renderWorkbookSelect() {
  if (!els.workbookSelect) {
    return;
  }

  els.workbookSelect.innerHTML = "";
  for (const wb of state.workbookList) {
    const opt = document.createElement("option");
    opt.value = String(wb.workbook);
    opt.textContent = `Workbook ${wb.workbook} (${wb.questionCount}問)`;
    els.workbookSelect.appendChild(opt);
  }
}

async function startQuiz(orderMode = "random", overrideWorkbookId) {
  const workbookId = Number(
    overrideWorkbookId ||
      (els.workbookSelect && els.workbookSelect.value) ||
      state.autoWorkbook,
  );
  const selected = state.workbookList.find((wb) => wb.workbook === workbookId);
  if (!selected) {
    els.quizStatus.textContent = "Workbook を選択してください。";
    return;
  }

  try {
    const res = await fetch(selected.path, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`workbook fetch failed: ${res.status}`);
    }
    const wb = await res.json();
    const workbookBaseUrl = res.url;

    state.currentWorkbook = workbookId;
    const allQuestions = flattenQuestions(wb.questions, workbookBaseUrl);
    const range = parseQuestionRange();
    if (!range.ok) {
      els.quizStatus.textContent = range.message;
      return;
    }

    const inRangeQuestions = filterQuestionsByRange(
      allQuestions,
      range.start,
      range.end,
    );
    state.questions = applyQuestionOrder(inRangeQuestions, orderMode);
    state.nextBaseIndex = 0;
    state.currentItem = null;
    state.turn = 0;
    state.attemptCount = 0;
    state.score = 0;
    state.normalCorrect = 0;
    state.normalAnswered = 0;
    state.reviewItems = [];
    state.missedQuestionIndexes = new Set();

    if (state.questions.length === 0) {
      els.quizStatus.textContent =
        "指定範囲に問題がありません。範囲を見直してください。";
      return;
    }

    if (els.setupPanel) {
      els.setupPanel.classList.add("hidden");
    }
    if (els.finishPanel) {
      els.finishPanel.classList.add("hidden");
    }
    if (els.playPanel) {
      els.playPanel.classList.remove("hidden");
    }
    els.quizStatus.textContent = "";
    els.quizStatus.classList.remove("hidden");

    renderCurrentQuestion();
  } catch (err) {
    els.quizStatus.textContent = "Workbook の読み込みに失敗しました。";
    console.error(err);
  }
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
        label: `${q.q_num}-${sub.q_sub}`,
        qNum: Number(q.q_num),
        qSub: Number(sub.q_sub),
        prompt:
          typeof q.prompt === "string" && q.prompt.trim() !== ""
            ? q.prompt.trim()
            : "",
        text: sub.question || "",
        answer: Boolean(sub.answer),
        explain: sub.explain || "",
        imageUrl: resolveQuestionImageURL(q, workbookBaseUrl),
      });
    }
  }
  return out;
}

function resolveQuestionImageURL(question, workbookBaseUrl) {
  if (
    question &&
    typeof question.image_path === "string" &&
    question.image_path
  ) {
    try {
      return new URL(question.image_path, workbookBaseUrl).toString();
    } catch (err) {
      console.error("invalid image_path:", question.image_path, err);
    }
  }
  return "";
}

function renderCurrentQuestion() {
  state.currentItem = pickNextItem();
  const q = getCurrentQuestion();
  if (!q) {
    showFinish();
    return;
  }

  const range = parseQuestionRange();
  const rangeText = formatRangeText(range.start, range.end);
  const reviewRemaining = countPendingReview();
  els.progressText.textContent =
    `${state.normalAnswered}/${state.questions.length} 問` +
    ` | 復習待ち ${reviewRemaining} 問` +
    ` | 範囲: ${rangeText}`;
  // ` | 解答 ${state.attemptCount + 1} 回目`
  if (els.questionPrompt) {
    if (q.prompt) {
      els.questionPrompt.textContent = q.prompt;
      els.questionPrompt.classList.remove("hidden");
    } else {
      els.questionPrompt.textContent = "";
      els.questionPrompt.classList.add("hidden");
    }
  }
  els.questionText.textContent = q.text;
  if (els.questionImageWrap && els.questionImage) {
    if (q.imageUrl) {
      els.questionImage.src = q.imageUrl;
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
  clearSelectedAnswer();
  els.answerTrue.disabled = false;
  els.answerFalse.disabled = false;
}

function submitAnswer(answer) {
  const q = getCurrentQuestion();
  if (!q) {
    return;
  }

  state.attemptCount += 1;
  const ok = q.answer === answer;
  if (ok) {
    state.score += 1;
  } else if (state.currentItem) {
    state.missedQuestionIndexes.add(state.currentItem.idx);
  }

  if (state.currentItem && state.currentItem.isReview) {
    updateReviewByResult(state.currentItem.idx, ok, false);
  } else if (state.currentItem) {
    state.normalAnswered += 1;
    if (ok) {
      state.normalCorrect += 1;
    }
    updateReviewByResult(state.currentItem.idx, ok, true);
  }

  setSelectedAnswer(answer);
  els.answerTrue.disabled = true;
  els.answerFalse.disabled = true;
  els.resultArea.classList.remove("hidden");
  els.resultText.textContent = ok ? "正解です" : "不正解です";
  els.resultText.classList.add(ok ? "ok" : "ng");
  els.explainText.textContent = q.explain || "解説はありません。";
}

function setSelectedAnswer(answer) {
  clearSelectedAnswer();
  if (answer) {
    els.answerTrue.classList.add("quiz-answer-selected");
  } else {
    els.answerFalse.classList.add("quiz-answer-selected");
  }
}

function clearSelectedAnswer() {
  els.answerTrue.classList.remove("quiz-answer-selected");
  els.answerFalse.classList.remove("quiz-answer-selected");
}

function nextQuestion() {
  state.turn += 1;
  renderCurrentQuestion();
}

function showFinish() {
  if (els.playPanel) {
    els.playPanel.classList.add("hidden");
  }
  if (els.finishPanel) {
    els.finishPanel.classList.remove("hidden");
  }
  els.scoreText.textContent =
    `通常 ${state.questions.length} 問中 ${state.normalCorrect} 問正解` +
    `（総解答 ${state.attemptCount} 回 / 総正解 ${state.score} 回）`;
  renderMissedQuestions();
  els.quizStatus.textContent = `Workbook ${state.currentWorkbook} を終了しました。`;
}

function resetQuiz() {
  state.currentWorkbook = null;
  state.questions = [];
  state.nextBaseIndex = 0;
  state.currentItem = null;
  state.turn = 0;
  state.attemptCount = 0;
  state.score = 0;
  state.normalCorrect = 0;
  state.normalAnswered = 0;
  state.reviewItems = [];
  state.missedQuestionIndexes = new Set();

  if (els.finishPanel) {
    els.finishPanel.classList.add("hidden");
  }
  if (els.playPanel) {
    els.playPanel.classList.add("hidden");
  }
  if (els.setupPanel) {
    els.setupPanel.classList.remove("hidden");
  }
  if (state.autoWorkbook) {
    els.quizStatus.textContent = `Workbook ${state.autoWorkbook} の出題範囲を指定して開始してください。`;
  } else {
    els.quizStatus.textContent = "Workbook を選んで開始してください。";
  }
  els.quizStatus.classList.remove("hidden");
}

function renderMissedQuestions() {
  if (!els.missedTitle || !els.missedList) {
    return;
  }

  els.missedList.innerHTML = "";
  const missedIndexes = Array.from(state.missedQuestionIndexes).sort(
    (a, b) => a - b,
  );

  if (missedIndexes.length === 0) {
    els.missedTitle.classList.add("hidden");
    els.missedList.classList.remove("hidden");

    const li = document.createElement("li");
    li.textContent = "一度も間違えませんでした。";
    els.missedList.appendChild(li);
    return;
  }

  els.missedTitle.classList.remove("hidden");
  els.missedList.classList.remove("hidden");

  for (const idx of missedIndexes) {
    const q = state.questions[idx];
    if (!q) {
      continue;
    }
    const li = document.createElement("li");
    li.textContent = `問題 ${q.label}: ${q.text}`;
    els.missedList.appendChild(li);
  }
}

function pickNextItem() {
  const dueReview = getDueReviewItem();
  if (dueReview) {
    return { idx: dueReview.idx, isReview: true };
  }

  if (state.nextBaseIndex < state.questions.length) {
    const idx = state.nextBaseIndex;
    state.nextBaseIndex += 1;
    return { idx, isReview: false };
  }

  const fallbackReview = getEarliestPendingReviewItem();
  if (fallbackReview) {
    return { idx: fallbackReview.idx, isReview: true };
  }

  return null;
}

function getCurrentQuestion() {
  if (!state.currentItem) {
    return null;
  }
  return state.questions[state.currentItem.idx] || null;
}

function countPendingReview() {
  let count = 0;
  for (const item of state.reviewItems) {
    if (!item.mastered) {
      count += 1;
    }
  }
  return count;
}

function getDueReviewItem() {
  let best = null;
  for (const item of state.reviewItems) {
    if (item.mastered || item.dueTurn > state.turn) {
      continue;
    }
    if (!best || item.dueTurn < best.dueTurn) {
      best = item;
    }
  }
  return best;
}

function getEarliestPendingReviewItem() {
  let best = null;
  for (const item of state.reviewItems) {
    if (item.mastered) {
      continue;
    }
    if (!best || item.dueTurn < best.dueTurn) {
      best = item;
    }
  }
  return best;
}

function findReviewItem(idx) {
  return state.reviewItems.find((item) => item.idx === idx) || null;
}

function updateReviewByResult(idx, ok, fromNormal) {
  let item = findReviewItem(idx);

  if (fromNormal && ok) {
    return;
  }

  if (!item) {
    item = {
      idx,
      streak: 0,
      phase: 0,
      dueTurn: state.turn + 1,
      mastered: false,
    };
    state.reviewItems.push(item);
  }

  if (ok) {
    if (item.phase === 0) {
      item.streak += 1;
      if (item.streak < REVIEW_INITIAL_CORRECT_TARGET) {
        item.dueTurn = state.turn + 1;
        return;
      }
      item.phase = 1;
      item.dueTurn = state.turn + REVIEW_STAGE_GAPS[0] + 1;
      return;
    }

    if (item.phase === 1) {
      item.phase = 2;
      item.dueTurn = state.turn + REVIEW_STAGE_GAPS[1] + 1;
      return;
    }

    item.mastered = true;
    return;
  }

  // 途中で誤答した場合は段階をやり直す。
  item.streak = 0;
  item.phase = 0;
  item.mastered = false;
  item.dueTurn = state.turn + 1;
}

function parseQuestionRange() {
  const startRaw = els.startQuestion ? els.startQuestion.value.trim() : "";
  const endRaw = els.endQuestion ? els.endQuestion.value.trim() : "";

  let start = null;
  let end = null;

  if (startRaw !== "") {
    const value = Number(startRaw);
    if (!Number.isInteger(value) || value < 1) {
      return {
        ok: false,
        message: "開始番号は 1 以上の整数で入力してください。",
      };
    }
    start = value;
  }

  if (endRaw !== "") {
    const value = Number(endRaw);
    if (!Number.isInteger(value) || value < 1) {
      return {
        ok: false,
        message: "終了番号は 1 以上の整数で入力してください。",
      };
    }
    end = value;
  }

  if (start !== null && end !== null && start > end) {
    return { ok: false, message: "開始番号は終了番号以下にしてください。" };
  }

  return { ok: true, start, end };
}

function filterQuestionsByRange(questions, start, end) {
  return questions.filter((q) => {
    if (start !== null && q.qNum < start) {
      return false;
    }
    if (end !== null && q.qNum > end) {
      return false;
    }
    return true;
  });
}

function applyQuestionOrder(questions, mode) {
  const groupedQuestions = groupQuestionsByQNum(questions);
  if (mode === "asc") {
    groupedQuestions.sort((a, b) => a[0].qNum - b[0].qNum);
    return groupedQuestions.flat();
  }
  shuffleInPlace(groupedQuestions);
  return groupedQuestions.flat();
}

function groupQuestionsByQNum(questions) {
  const groups = new Map();
  for (const question of questions) {
    const qNum = question.qNum;
    if (!groups.has(qNum)) {
      groups.set(qNum, []);
    }
    groups.get(qNum).push(question);
  }

  const out = [];
  const sortedQNums = [...groups.keys()].sort((a, b) => a - b);
  for (const qNum of sortedQNums) {
    const group = groups.get(qNum);
    group.sort((a, b) => a.qSub - b.qSub);
    out.push(group);
  }
  return out;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function formatRangeText(start, end) {
  if (start === null && end === null) {
    return "全範囲";
  }
  if (start !== null && end !== null) {
    return `${start}〜${end}`;
  }
  if (start !== null) {
    return `${start}以上`;
  }
  return `${end}以下`;
}

init();
