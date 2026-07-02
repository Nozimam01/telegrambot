require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const yts = require("yt-search");

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("🔥 V13 PRO BOT RUNNING"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("PORT:", PORT));

// ================= BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

// ================= TEMP =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

// ================= JOB CONTROL =================
const queue = [];
let running = false;

// ================= QUEUE =================
function addJob(job) {
  queue.push(job);
  if (!running) worker();
}

async function worker() {
  running = true;

  while (queue.length) {
    const job = queue.shift();

    const msg = await job.ctx.reply("⏳ Yuklanmoqda...");

    try {
      const file = await download(job.url, job.type, job.onProgress);

      if (job.type === "audio") {
        await job.ctx.replyWithAudio({
          source: file,
          title: job.title || "Audio",
          performer: job.author || "Unknown"
        });
      } else {
        await job.ctx.replyWithVideo({
          source: file,
          caption: job.title || "Video"
        });
      }

      fs.unlinkSync(file);
      await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    } catch (e) {
      console.log("ERROR:", e.message);
      job.ctx.reply("❌ Download error / timeout");
    }
  }

  running = false;
}

// ================= FAST DOWNLOAD (NO FREEZE) =================
function download(url, type, onProgress) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const args =
      type === "audio"
        ? [
            "yt-dlp",
            "--no-playlist",
            "--no-warnings",
            "--quiet",
            "--socket-timeout", "10",
            "--retries", "1",
            "-x",
            "--audio-format",
            "mp3",
            "-o",
            out,
            url
          ]
        : [
            "yt-dlp",
            "--no-playlist",
            "--no-warnings",
            "--quiet",
            "--socket-timeout", "10",
            "--retries", "1",
            "-f",
            "bv[height<=480]+ba/b",
            "--merge-output-format",
            "mp4",
            "-o",
            out,
            url
          ];

    const proc = spawn(args[0], args.slice(1));

    let killed = false;

    // progress (optional)
    proc.stdout.on("data", (d) => {
      const s = d.toString();
      const match = s.match(/(\d+\.?\d*)%/);
      if (match && onProgress) {
        onProgress(Math.floor(match[1]));
      }
    });

    // HARD TIMEOUT (SAFE)
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      reject(new Error("TIMEOUT"));
    }, 120000);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code !== 0) return reject(new Error("yt-dlp failed"));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("file not found"));

      resolve(path.join(DIR, file));
    });
  });
}

// ================= START =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply(
    "🚀 V13 PRO MEDIA BOT",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino", "movie"),
        Markup.button.callback("🎵 Musiqa", "music")
      ]
    ])
  );
});

// ================= MODE =================
bot.action("movie", (ctx) => {
  ctx.session.mode = "movie";
  ctx.answerCbQuery();
  ctx.reply("🎬 Kino nomini yozing:");
});

bot.action("music", (ctx) => {
  ctx.session.mode = "music";
  ctx.answerCbQuery();
  ctx.reply("🎵 Qo‘shiq nomini yozing:");
});

// ================= SEARCH =================
async function search(ctx, q) {
  const r = await yts(q);
  const videos = r.videos.slice(0, 8);

  ctx.session.list = videos;

  return ctx.reply(
    "📋 Natijalar:",
    Markup.inlineKeyboard(
      videos.map((v, i) => [
        Markup.button.callback(v.title.slice(0, 35), `sel_${i}`)
      ])
    )
  );
}

// ================= TEXT =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;

    return ctx.reply(
      "📥 Format:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "link_video"),
          Markup.button.callback("🎵 MP3", "link_audio")
        ]
      ])
    );
  }

  if (!ctx.session.mode)
    return ctx.reply("Avval Kino yoki Musiqa tanlang");

  const q = ctx.session.mode === "movie" ? text + " trailer" : text;

  await search(ctx, q);
});

// ================= SELECT =================
bot.action(/sel_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  const url = `https://youtube.com/watch?v=${v.videoId}`;

  addJob({
    ctx,
    url,
    type: ctx.session.mode === "music" ? "audio" : "video",
    title: v.title,
    author: v.author?.name
  });
});

// ================= LINK =================
bot.action("link_video", (ctx) => {
  addJob({
    ctx,
    url: ctx.session.link,
    type: "video"
  });
});

bot.action("link_audio", (ctx) => {
  addJob({
    ctx,
    url: ctx.session.link,
    type: "audio"
  });
});

// ================= LAUNCH =================
bot.launch();
console.log("🔥 V13 PRO STABLE READY");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));