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

app.get("/", (req, res) => res.send("Bot running 🚀"));

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

//================ SAFE =================
const safe = (t = "") =>
  t.replace(/[\u0000-\u001F]/g, "").substring(0, 80);

//================ QUEUE =================
const queue = [];
let running = false;

function addJob(job) {
  queue.push(job);
  if (!running) runQueue();
}

async function runQueue() {
  running = true;

  while (queue.length) {
    const job = queue.shift();
    try {
      await job();
    } catch (e) {
      console.log("Job error:", e.message);
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
      "--retries", "2",
      "--fragment-retries", "2"
    ];

    const args =
      type === "audio"
        ? [...base, "-x", "--audio-format", "mp3", "-o", out, url]
        : [...base, "-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", out, url];

    const proc = execFile("yt-dlp", args);

    let done = false;

    proc.on("error", (err) => {
      done = true;
      reject(err);
    });

    proc.on("exit", (code) => {
      if (done) return;

      if (code !== 0) return reject(new Error("yt-dlp error"));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("File not found"));

      resolve(path.join(DIR, file));
    });

    setTimeout(() => {
      if (!done) {
        proc.kill("SIGKILL");
        reject(new Error("TIMEOUT"));
      }
    }, 5 * 60 * 1000);
  });
}

//================ WRAPPER =================
function runSafe(ctx, fn) {
  addJob(async () => {
    const msg = await ctx.reply("⏳ Yuklanmoqda...");

    try {
      const file = await fn();

      await ctx.replyWithDocument({ source: file });

      fs.unlinkSync(file);
      ctx.deleteMessage(msg.message_id).catch(() => {});
    } catch (e) {
      console.log(e);
      ctx.reply("❌ Xatolik yoki timeout");
    }
  });
}

//================ START =================
bot.start((ctx) => {
  ctx.session = {};

  ctx.reply(
    "🎬 Media Bot",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino", "movie"),
        Markup.button.callback("🎵 Musiqa", "music")
      ],
      [Markup.button.callback("📥 Link", "link")]
    ])
  );
});

//================ MODE =================
bot.action("movie", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomi:");
});

bot.action("music", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomi:");
});

bot.action("link", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "link";
  ctx.reply("🔗 Link yuboring:");
});

//================ SEARCH =================
async function search(ctx, q, mode) {
  const r = await yts(q);

  const videos = r.videos.slice(0, 10);
  if (!videos.length) return ctx.reply("❌ Topilmadi");

  ctx.session.list = videos;

  ctx.reply(
    "📋 Natijalar",
    Markup.inlineKeyboard(
      videos.map((v, i) => [
        Markup.button.callback(`${i + 1}. ${safe(v.title)}`, `${mode}_${i}`)
      ])
    )
  );
}

//================ TEXT =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;

    return ctx.reply(
      "📥 Format",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "dl_video"),
          Markup.button.callback("🎵 MP3", "dl_audio")
        ]
      ])
    );
  }

  if (!ctx.session.mode)
    return ctx.reply("Avval menu tanlang");

  if (ctx.session.mode === "movie")
    return search(ctx, text + " official trailer", "movie");

  if (ctx.session.mode === "music")
    return search(ctx, text, "music");
});

//================ MOVIE =================
bot.action(/movie_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return ctx.reply("❌ Topilmadi");

  runSafe(ctx, () =>
    download(`https://youtube.com/watch?v=${v.videoId}`, "video")
  );
});

//================ MUSIC =================
bot.action(/music_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return ctx.reply("❌ Topilmadi");

  runSafe(ctx, () =>
    download(`https://youtube.com/watch?v=${v.videoId}`, "audio")
  );
});

//================ LINK VIDEO =================
bot.action("dl_video", async (ctx) => {
  await ctx.answerCbQuery();

  const url = ctx.session.link;
  if (!url) return ctx.reply("❌ Link yo'q");

  runSafe(ctx, () => download(url, "video"));
});

//================ LINK AUDIO =================
bot.action("dl_audio", async (ctx) => {
  await ctx.answerCbQuery();

  const url = ctx.session.link;
  if (!url) return ctx.reply("❌ Link yo'q");

  runSafe(ctx, () => download(url, "audio"));
});

//================ LAUNCH =================
bot.launch();
console.log("🚀 PRO BOT RUNNING");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));