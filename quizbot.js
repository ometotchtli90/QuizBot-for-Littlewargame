(async function () {
  console.log("🎮 Quiz Bot Initializing...");

  const bot = {
    questions: [],
    activePool: [],

    scores: {},
    currentQuestion: null,
    correctAnswer: null,
    currentMethod: "exactly",
    currentQObj: null,

    answered: false,
    questionStartTime: null,
    observer: null,

    defaultTimeToAnswerMs: 60000,
    defaultMaxPoints: 100,
    minPoints: 10,

    questionDelayMs: 10000,
    running: false,

    _hintTimeouts: [],
    _expireTimeout: null,
  };

// =====================
// CHAT SENDER
// =====================

  function sendChatMessage(text) {
    const input = document.getElementById("lobbyChatInput");
    if (!input) return console.error("Chat input not found.");

    input.value = text;
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        keyCode: 13,
      })
    );
  }

// =====================
// sorting CSV
// =====================
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        row.push(cur);
        cur = "";
        continue;
      }
      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (cur.length || row.length) row.push(cur);
        cur = "";
        if (row.length) rows.push(row);
        row = [];
        if (ch === "\r" && next === "\n") i++;
        continue;
      }
      cur += ch;
    }

    if (cur.length || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows;
  }

  // =====================
  // LOAD CSV (adds order + flags)
  // =====================
  bot.loadCSV = async function (file) {
    const text = await file.text();
    const rows = parseCSV(text).filter(r => r.some(cell => String(cell).trim().length));

    if (!rows.length) {
      console.warn("Empty CSV.");
      bot.questions = [];
      bot.activePool = [];
      return;
    }

    const header = rows[0].map(h => String(h).trim().toLowerCase());
    const hasHeader = header.includes("question") && header.includes("answer");

    const idx = (name, fallback) => {
      const i = header.indexOf(name);
      return i >= 0 ? i : fallback;
    };

    const dataRows = hasHeader ? rows.slice(1) : rows;

    const qIdx = hasHeader ? idx("question", 0) : 0;
    const aIdx = hasHeader ? idx("answer", 1) : 1;
    const mIdx = hasHeader ? idx("method", 2) : 2;
    const tIdx = hasHeader ? idx("time_to_answer", 3) : 3;
    const pIdx = hasHeader ? idx("points", 4) : 4;

    bot.questions = dataRows
      .map(r => r.map(c => String(c ?? "").trim()))
      .filter(r => (r[qIdx] || "").length && (r[aIdx] || "").length)
      .map((r, i) => {
        const question = (r[qIdx] || "").trim();
        const answer = (r[aIdx] || "").trim().toLowerCase();
        const method = ((r[mIdx] || "exactly") + "").trim().toLowerCase();

        const timeSecRaw = (r[tIdx] || "").trim();
        const pointsRaw = (r[pIdx] || "").trim();

        const timeMs =
          timeSecRaw && !Number.isNaN(Number(timeSecRaw))
            ? Math.max(1, Number(timeSecRaw)) * 1000
            : bot.defaultTimeToAnswerMs;

        const maxPoints =
          pointsRaw && !Number.isNaN(Number(pointsRaw))
            ? Math.max(1, Math.floor(Number(pointsRaw)))
            : bot.defaultMaxPoints;

        return {
          order: i + 1,
          question,
          answer,
          method,
          timeMs,
          maxPoints,

          answered: false, // answered correctly
          skipped: false,  // timed out / expired
        };
      });

    bot.activePool = bot.questions.filter(q => !q.answered && !q.skipped);

    console.log(`✅ Loaded ${bot.questions.length} questions.`);
  };

  function buildHint(answer, stage) {
    const chars = answer.split("");
    const n = chars.length;
    const reveal = new Set();

    if (stage >= 1 && n > 2) reveal.add(2);
    if (stage >= 2 && n > 0) reveal.add(0);
    if (stage >= 3 && n > 0) reveal.add(n - 1);

    if (n === 1 && stage >= 2) reveal.add(0);
    if (n === 2 && stage >= 2) reveal.add(0);
    if (n === 2 && stage >= 3) reveal.add(1);

    return chars
      .map((ch, i) => {
        if (ch === " ") return " ";
        return reveal.has(i) ? ch : "-";
      })
      .join("");
  }

  function clearQuestionTimers() {
    bot._hintTimeouts.forEach(id => clearTimeout(id));
    bot._hintTimeouts = [];
    if (bot._expireTimeout) clearTimeout(bot._expireTimeout);
    bot._expireTimeout = null;
  }

  function removeFromActivePool(qObj) {
    const idx = bot.activePool.indexOf(qObj);
    if (idx >= 0) bot.activePool.splice(idx, 1);
  }

  function scheduleHintsAndExpiry(qObj) {
    clearQuestionTimers();

    const total = qObj.timeMs;
    const t1 = Math.floor(total * 0.25);
    const t2 = Math.floor(total * 0.5);
    const t3 = Math.floor(total * 0.75);

    bot._hintTimeouts.push(
      setTimeout(() => {
        if (!bot.running || bot.answered) return;
        sendChatMessage(`💡 HINT: ${buildHint(bot.correctAnswer, 1)}`);
      }, t1)
    );
    bot._hintTimeouts.push(
      setTimeout(() => {
        if (!bot.running || bot.answered) return;
        sendChatMessage(`💡 HINT: ${buildHint(bot.correctAnswer, 2)}`);
      }, t2)
    );
    bot._hintTimeouts.push(
      setTimeout(() => {
        if (!bot.running || bot.answered) return;
        sendChatMessage(`💡 HINT: ${buildHint(bot.correctAnswer, 3)}`);
      }, t3)
    );

    bot._expireTimeout = setTimeout(() => {
      if (!bot.running || bot.answered) return;

      bot.answered = true; // lock this round
      sendChatMessage(`⏰ Time! No one got it. Answer was: ${bot.correctAnswer}`);

      // mark + remove from pool permanently
      if (bot.currentQObj) {
        bot.currentQObj.skipped = true;
        removeFromActivePool(bot.currentQObj);
      }

      setTimeout(() => bot.showScoreboard(), 1000);
      setTimeout(() => bot.askRandomQuestion(), bot.questionDelayMs);
    }, total);
  }

  // =====================
  // RANDOM QUESTION (only from activePool)
  // =====================
  bot.askRandomQuestion = function () {
    if (!bot.running) return;

    // rebuild pool defensively (in case flags changed)
    bot.activePool = bot.questions.filter(q => !q.answered && !q.skipped);

    if (!bot.activePool.length) {
      sendChatMessage("✅ Quiz over! No questions left in the pool.");
      bot.running = false;
      clearQuestionTimers();
      return;
    }

    const qObj = bot.activePool[Math.floor(Math.random() * bot.activePool.length)];

    bot.currentQObj = qObj;
    bot.currentQuestion = qObj.question;
    bot.correctAnswer = qObj.answer;
    bot.currentMethod = qObj.method || "exactly";

    bot.answered = false;
    bot.questionStartTime = Date.now();

    sendChatMessage(
      `🧠 QUESTION #${qObj.order}: ${qObj.question} (⏳ ${Math.round(qObj.timeMs / 1000)}s)`
    );

    scheduleHintsAndExpiry(qObj);
  };

  // =====================
  // CHECK ANSWERS (mark answered + remove)
  // =====================
  bot.checkAnswer = function (username, message) {
    if (!bot.running) return;
    if (bot.answered) return;
    if (!bot.correctAnswer) return;

    const msg = message.toLowerCase().trim();
    const ans = bot.correctAnswer;
    const method = bot.currentMethod || "exactly";

    const isCorrect =
      method === "exactly" ? msg === ans :
      method === "includes" ? ans.includes(msg) && msg.length > 1 :
      method === "startswith" ? msg.startsWith(ans) :
      method === "endswith" ? msg.endsWith(ans) :
      false;

    if (!isCorrect) return;

    bot.answered = true;
    clearQuestionTimers();

    const qObj = bot.currentQObj || {
      timeMs: bot.defaultTimeToAnswerMs,
      maxPoints: bot.defaultMaxPoints,
    };

    const responseTime = Date.now() - bot.questionStartTime;

    const maxP = qObj.maxPoints;
    const minP = Math.min(bot.minPoints, maxP);

    const raw = maxP - Math.floor((responseTime / qObj.timeMs) * maxP);
    const points = Math.max(minP, Math.min(maxP, raw));

    bot.scores[username] = (bot.scores[username] || 0) + points;

    sendChatMessage(`🏆 ${username} correct! +${points} points`);

    // mark + remove from pool permanently
    if (bot.currentQObj) {
      bot.currentQObj.answered = true;
      removeFromActivePool(bot.currentQObj);
    }

    setTimeout(() => bot.showScoreboard(), 1000);
    setTimeout(() => bot.askRandomQuestion(), bot.questionDelayMs);
  };

  bot.showScoreboard = function () {
    const ranking = Object.entries(bot.scores)
      .sort((a, b) => b[1] - a[1])
      .map(([u, s], i) => `${i + 1}.${u}:${s}`)
      .join(" | ");

    sendChatMessage("📊 SCORE: " + (ranking || "No scores yet"));
  };

  bot.startObserver = function () {
    const chatArea = document.getElementById("lobbyChatTextArea");
    if (!chatArea) return console.error("Chat area not found.");

    bot.observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.id && node.id.startsWith("chat")) {
            const username = node.querySelector("a.playerNameInList")?.innerText;
            const message = node
              .querySelector("span:last-child")
              ?.innerText?.replace(/^:\s*/, "");

            if (!username || !message) return;
            bot.checkAnswer(username, message);
          }
        });
      });
    });

    bot.observer.observe(chatArea, { childList: true });
  };

  bot.start = function () {
    if (bot.running) return;
    bot.running = true;
    sendChatMessage("🎉 Quiz starting!");
    bot.askRandomQuestion();
  };

  bot.stop = function () {
    bot.running = false;
    clearQuestionTimers();
    sendChatMessage("🛑 Quiz stopped.");
  };

  bot.resetScores = function () {
    bot.scores = {};
    console.log("Scores reset.");
  };

  bot.loadQuestionsFromFile = function () {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      await bot.loadCSV(file);
    };

    input.click();
  };

  bot.startObserver();
  window.quizBot = bot;

  console.log("✅ Quiz Bot Ready.");
  console.log("Commands:");
  console.log("quizBot.loadQuestionsFromFile()");
  console.log("quizBot.start()");
  console.log("quizBot.stop()");
  console.log("quizBot.showScoreboard()");
  console.log("quizBot.resetScores()");
})();