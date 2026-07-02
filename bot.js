require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const yts = require("yt-search");

const app = express();
app.get("/", (req, res) => res.send("V11 PRO 🚀"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("Server:", PORT));

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

/* ================= QUEUE ================= */
const queue = [];
let running = false;
let currentProc = null;

/* ================= CANCEL ================= */
function cancelCurrent() {
  if (currentProc) {
    currentProc.kill("SIGKILL");
    currentProc = null;
  }
}

/* ================= JOB ================= */
function addJob(job) {
  queue.push(job);
  if (!running) worker();
}

async function worker() {
  running = true;

  while (queue.length) {
    const job = queue.shift();

    const msg = await job.ctx.reply(
      "⏳ Yuklanmoqda...",
      Markup.inlineKeyboard([
        [Markup.button.callback("❌ Cancel", "cancel")]
      ])
    );

    try {
      const file = await download(job.url, job.type, (p, speed) => {
        job.ctx.telegram.editMessageText(
          job.ctx.chat.id,
          msg.message_id,
          null,
          `📊 ${p}% | ⚡ ${speed}`
        ).catch(() => {});
      });

      if (job.type === "audio") {
        await job.ctx.replyWithAudio({ source: file });
      } else {
        await job.ctx.replyWithVideo({ source: file });
      }

      fs.unlinkSync(file);
      await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    } catch (e) {
      console.log(e.message);
      job.ctx.reply("❌ Error / timeout");
    }
  }

  running = false;
}

/* ================= DOWNLOAD ================= */
function download(url, type, onProgress) {
  return new Promise((resolve, reject) => {

    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const args =
      type === "audio"
        ? [
            "--no-playlist",
            "--newline",
            "--progress",
            "-x",
            "--audio-format",
            "mp3",
            "-o",
            out,
            url
          ]
        : [
            "--no-playlist",
            "--newline",
            "--progress",
            "-f",
            "bv*+ba/b",
            "--merge-output-format",
            "mp4",
            "-o",
            out,
            url
          ];

    const proc = execFile("yt-dlp", args);
    currentProc = proc;

    let progress = "0";

    proc.stdout.on("data", (d) => {
      const text = d.toString();

      const p = text.match(/(\d{1,3}\.\d)%/);
      const s = text.match(/at\s+([\d\.]+\w+\/s)/i);

      if (p) progress = p[1];
      if (onProgress) onProgress(progress, s ? s[1] : "...");
    });

    proc.on("error", reject);

    proc.on("exit", (code) => {
      currentProc = null;

      if (code !== 0) return reject(new Error("yt-dlp error"));

      const file = fs.readdirSync(DIR)
        .map(f => path.join(DIR, f))
        .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime)[0];

      if (!file) return reject(new Error("file not found"));

      resolve(file);
    });

    setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("timeout"));
    }, 10 * 60 * 1000);
  });
}

/* ================= START ================= */
bot.start((ctx) => {
  ctx.session = {};

  ctx.reply(
    "🎬 V11 PRO MEDIA BOT",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino", "movie"),
        Markup.button.callback("🎵 Musiqa", "music")
      ]
    ])
  );
});

/* ================= MODE ================= */
bot.action("movie", (ctx) => {
  ctx.session.mode = "movie";
  ctx.answerCbQuery();
  ctx.reply("🎬 Kino nomi:");
});

bot.action("music", (ctx) => {
  ctx.session.mode = "music";
  ctx.answerCbQuery();
  ctx.reply("🎵 Qo‘shiq nomi:");
});

/* ================= SEARCH ================= */
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

/* ================= TEXT ================= */
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (!ctx.session.mode)
    return ctx.reply("Avval Kino yoki Musiqa tanlang");

  const q = ctx.session.mode === "movie"
    ? text + " trailer"
    : text;

  await search(ctx, q);
});

/* ================= SELECT ================= */
bot.action(/sel_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  const url = `https://youtube.com/watch?v=${v.videoId}`;

  addJob({
    ctx,
    url,
    type: ctx.session.mode === "music" ? "audio" : "video"
  });
});

/* ================= CANCEL ================= */
bot.action("cancel", (ctx) => {
  cancelCurrent();
  ctx.answerCbQuery("Cancelled");
  ctx.reply("❌ Download cancelled");
});

/* ================= LINK SUPPORT ================= */
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;

    return ctx.reply(
      "📥 Format:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "lvid"),
          Markup.button.callback("🎵 MP3", "laud")
        ]
      ])
    );
  }
});

bot.action("lvid", (ctx) => {
  addJob({ ctx, url: ctx.session.link, type: "video" });
});

bot.action("laud", (ctx) => {
  addJob({ ctx, url: ctx.session.link, type: "audio" });
});

bot.launch();
console.log("🚀 V11 PRO READY");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));