(async function() {

console.log("🎮 Quiz Bot Initializing...");

const bot = {
    questions: [],
    scores: {},
    currentQuestion: null,
    correctAnswer: null,
    answered: false,
    questionStartTime: null,
    observer: null,
    minPoints: 10,
    maxPoints: 100,
    answerWindowMs: 30000,
    questionDelayMs: 10000,
    running: false
};

// =====================
// CHAT SENDER
// =====================
function sendChatMessage(text) {
    const input = document.getElementById("lobbyChatInput");
    if (!input) return console.error("Chat input not found.");

    input.value = text;

    input.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        keyCode: 13
    }));
}

// =====================
// LOAD CSV
// =====================
bot.loadCSV = async function(file) {
    const text = await file.text();
    const lines = text.split("\n").slice(1);

    bot.questions = lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            const parts = line.split(",");
            return {
                question: parts[0].trim(),
                answer: parts[1].trim().toLowerCase(),
                method: (parts[2] || "exactly").trim().toLowerCase()
            };
        });

    console.log(`✅ Loaded ${bot.questions.length} questions.`);
};

// =====================
// RANDOM QUESTION
// =====================
bot.askRandomQuestion = function() {
    if (!bot.questions.length) {
        console.warn("No questions loaded.");
        return;
    }

    const q = bot.questions[Math.floor(Math.random() * bot.questions.length)];

    bot.currentQuestion = q.question;
    bot.correctAnswer = q.answer;
    bot.currentMethod = q.method;
    bot.answered = false;
    bot.questionStartTime = Date.now();

    sendChatMessage("🧠 QUIZ: " + bot.currentQuestion);
};

// =====================
// CHECK ANSWERS
// =====================
bot.checkAnswer = function(username, message) {
    if (!bot.running) return;
    if (bot.answered) return;
    if (!bot.correctAnswer) return;

    const msg = message.toLowerCase().trim();
    const ans = bot.correctAnswer;
    const method = bot.currentMethod || "exactly";

    const isCorrect =
        method === "exactly"    ? msg === ans :
        method === "includes"   ? ans.includes(msg)&& ans.length >= 2 :
        method === "startswith" ? msg.startsWith(ans) :
        method === "endswith"   ? msg.endsWith(ans) :
        false;

    if (isCorrect) {
        bot.answered = true;

        const responseTime = Date.now() - bot.questionStartTime;
        let points = Math.max(
            bot.minPoints,
            bot.maxPoints - Math.floor(responseTime / (bot.answerWindowMs / bot.maxPoints))
        );

        bot.scores[username] = (bot.scores[username] || 0) + points;

        sendChatMessage(`🏆 ${username} correct! +${points} points`);

        setTimeout(() => bot.showScoreboard(), 1000);
        setTimeout(() => bot.askRandomQuestion(), bot.questionDelayMs);
    }
};

// =====================
// SCOREBOARD
// =====================
bot.showScoreboard = function() {
    const ranking = Object.entries(bot.scores)
        .sort((a,b) => b[1] - a[1])
        .map(([u,s],i) => `${i+1}.${u}:${s}`)
        .join(" | ");

    sendChatMessage("📊 SCORE: " + ranking);
};

// =====================
// OBSERVE CHAT
// =====================
bot.startObserver = function() {
    const chatArea = document.getElementById("lobbyChatTextArea");
    if (!chatArea) return console.error("Chat area not found.");

    bot.observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.id && node.id.startsWith("chat")) {

                    const username = node.querySelector("a.playerNameInList")?.innerText;
                    const message = node.querySelector("span:last-child")?.innerText?.replace(/^:\s*/, "");

                    if (!username || !message) return;

                    bot.checkAnswer(username, message);
                }
            });
        });
    });

    bot.observer.observe(chatArea, { childList: true });
};

// =====================
// CONTROL FUNCTIONS
// =====================
bot.start = function() {
    if (bot.running) return;
    bot.running = true;
    sendChatMessage("🎉 Quiz starting!");
    bot.askRandomQuestion();
};

bot.stop = function() {
    bot.running = false;
    sendChatMessage("🛑 Quiz stopped.");
};

bot.resetScores = function() {
    bot.scores = {};
    console.log("Scores reset.");
};

// =====================
// FILE PICKER
// =====================
bot.loadQuestionsFromFile = function() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";

    input.onchange = async (e) => {
        const file = e.target.files[0];
        await bot.loadCSV(file);
    };

    input.click();
};

// =====================
// INIT
// =====================
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