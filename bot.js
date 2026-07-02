require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const yts = require("yt-search");

//================ EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("V9 PRO BOT 🚀"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server:", PORT));

//================ BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

//================ TEMP =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

//================ QUEUE =================
const queue = [];
let running = false;

function addJob(job) {
  queue.push(job);
  if (!running) worker();
}

async function worker() {
  running = true;

  while (queue.length) {
    const job = queue.shift();

    try {
      const msg = await job.ctx.telegram.sendMessage(
        job.ctx.chat.id,
        "⏳ Yuklanmoqda..."
      );

      const file = await download(job.url, job.type);

      if (job.type === "audio") {
        await job.ctx.telegram.sendAudio(job.ctx.chat.id, {
          source: file
        });
      } else {
        await job.ctx.telegram.sendDocument(job.ctx.chat.id, {
          source: file
        });
      }

      fs.unlinkSync(file);
      await job.ctx.telegram.deleteMessage(job.ctx.chat.id, msg.message_id).catch(() => {});
    } catch (e) {
      console.log("ERROR:", e.message);
      job.ctx.telegram.sendMessage(job.ctx.chat.id, "❌ Xatolik");
    }
  }

  running = false;
}

//================ DOWNLOAD ENGINE =================
function download(url, type = "video") {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const base = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--restrict-filenames",
      "--socket-timeout", "15",
      "--retries", "2"
    ];

    const args =
      type === "audio"
        ? [...base, "-x", "--audio-format", "mp3", "-o", out, url]
        : [...base, "-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", out, url];

    const proc = execFile("yt-dlp", [
  "--no-update",
  "--no-warnings",
  "--newline",
  "--restrict-filenames",
  "-f",
  "bv*+ba/b",
  "--merge-output-format",
  "mp4",
  "-o",
  out,
  url
]);

    proc.on("error", reject);

    proc.on("exit", (code) => {
      if (code !== 0) return reject(new Error("yt-dlp error"));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("File not found"));

      resolve(path.join(DIR, file));
    });

    setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("TIMEOUT"));
    }, 5 * 60 * 1000);
  });
}

//================ START =================
bot.start((ctx) => {
  ctx.session = {};

  ctx.reply(
    "🎬 V9 PRO MEDIA BOT",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino", "movie"),
        Markup.button.callback("🎵 Musiqa", "music")
      ]
    ])
  );
});

//================ MODE =================
bot.action("movie", (ctx) => {
  ctx.session.mode = "movie";
  ctx.session.flow = "search";
  ctx.answerCbQuery();
  ctx.reply("🎬 Kino nomini yozing:");
});

bot.action("music", (ctx) => {
  ctx.session.mode = "music";
  ctx.session.flow = "search";
  ctx.answerCbQuery();
  ctx.reply("🎵 Qo‘shiq nomini yozing:");
});

//================ SEARCH =================
async function search(ctx, q) {
  const r = await yts(q);
  const videos = r.videos.slice(0, 10);

  ctx.session.list = videos;

  ctx.reply(
    "📋 Natijalar:",
    Markup.inlineKeyboard(
      videos.map((v, i) => [
        Markup.button.callback(v.title.slice(0, 35), `sel_${i}`)
      ])
    )
  );
}

//================ TEXT HANDLER (FIXED LOGIC) =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // 🔗 LINK ONLY MODE
  if (/https?:\/\//.test(text)) {
    ctx.session.mode = "link";
    ctx.session.link = text;

    return ctx.reply(
      "📥 Format tanlang:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "lvid"),
          Markup.button.callback("🎵 MP3", "laud")
        ]
      ])
    );
  }

  // 🎬 MOVIE / 🎵 MUSIC SEARCH
  if (!ctx.session.mode)
    return ctx.reply("Avval Kino yoki Musiqa tanlang");

  const q =
    ctx.session.mode === "movie"
      ? text + " trailer"
      : text;

  await search(ctx, q);
});

//================ SELECT =================
bot.action(/sel_(\d+)/, async (ctx) => {
  ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  const url = `https://youtube.com/watch?v=${v.videoId}`;

  // 🔥 STRICT RULE (NO FORMAT HERE)
  if (ctx.session.mode === "movie") {
    return addJob({
      ctx,
      url,
      type: "video"
    });
  }

  if (ctx.session.mode === "music") {
    return addJob({
      ctx,
      url,
      type: "audio"
    });
  }
});

//================ LINK DOWNLOAD =================
bot.action("lvid", (ctx) => {
  if (!ctx.session.link) return;

  addJob({
    ctx,
    url: ctx.session.link,
    type: "video"
  });
});

bot.action("laud", (ctx) => {
  if (!ctx.session.link) return;

  addJob({
    ctx,
    url: ctx.session.link,
    type: "audio"
  });
});

//================ LAUNCH =================
bot.launch();
console.log("🚀 V9 PRO LEVEL BOT READY");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));