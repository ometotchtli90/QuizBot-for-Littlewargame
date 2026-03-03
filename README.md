🎮 Littlewargame Quiz Bot

A browser-based quiz bot for the lobby chat on Littlewargame.com

This bot:

Loads quiz questions from a CSV file

Automatically posts questions in lobby chat

Detects correct answers in real-time

Awards dynamic points based on answer speed

Maintains a live scoreboard

Perfect for:

Community events

Tournament downtime

Fun lobby engagement

Stream interaction


🧠 Features

✅ Random question selection

✅ Multiple answer matching modes (exactly, includes, startswith, endswith)

✅ Speed-based scoring (faster answers = more points)

✅ Automatic scoreboard

✅ Fully client-side (no server required)

✅ Works directly in browser console


📦 Files
File	Purpose
quizbot.js	Main quiz bot script
questions.csv	Question database


🚀 How To Use
1️⃣ Open Littlewargame Lobby

Go to:

👉 https://www.littlewargame.com/

Log into the lobby.

2️⃣ Open Browser Console

Press:

F12 → Console tab

3️⃣ Load the Script

Copy the entire contents of quizbot.js
Paste it into the console and press Enter.

You should see:

🎮 Quiz Bot Initializing...
✅ Quiz Bot Ready.

4️⃣ Load Questions

In console, run:

quizBot.loadQuestionsFromFile()

Select your questions.csv.

You should see:

✅ Loaded X questions.

5️⃣ Start the Quiz
quizBot.start()

Stop the quiz:

quizBot.stop()

Show scoreboard:

quizBot.showScoreboard()

Reset scores:

quizBot.resetScores()


📄 CSV Format

Your questions.csv must follow this format:

question,answer,method
Who created Littlewargame?,dominik,exactly
What race has dragons?,elf,includes

Columns Explained
Column	Meaning
question	The quiz question text
answer	The correct answer (lowercase recommended)
method	Matching method
Available Matching Methods
Method	Description
exactly	Must match answer exactly
includes	Answer must contain the word
startswith	Answer must start with the word
endswith	Answer must end with the word

If method is omitted, it defaults to exactly.

🏆 Scoring System

Points are awarded based on answer speed:

Faster answer = more points

Maximum: 100

Minimum: 10

30-second answer window

After each correct answer:

Winner announced

Scoreboard displayed

New question starts automatically

⚙ Customization

Inside quizbot.js, you can tweak:

minPoints: 10,
maxPoints: 100,
answerWindowMs: 30000,
questionDelayMs: 10000,

You can adjust:

Max points

Minimum points

Time window

Delay between questions
