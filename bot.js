require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const yts = require("yt-search");

//================ EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("V11 PRO BOT 🚀"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("Server:", PORT));

//================ BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

//================ TMP =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

//================ QUEUE + JOBS =================
const queue = [];
let running = false;
const jobs = new Map();

//================ UTIL =================
const safe = (t = "") => t.replace(/[\u0000-\u001F]/g, "").slice(0, 80);

//================ QUEUE ENGINE =================
function addJob(job) {
  const id = crypto.randomUUID();
  job.id = id;
  jobs.set(id, job);

  queue.push(id);
  if (!running) worker();

  return id;
}

async function worker() {
  running = true;

  while (queue.length) {
    const id = queue.shift();
    const job = jobs.get(id);
    if (!job || job.cancelled) continue;

    await runJob(job);
    jobs.delete(id);
  }

  running = false;
}

//================ DOWNLOAD (PROGRESS + SPEED) =================
function download(job) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const args =
      job.type === "audio"
        ? [
            "--no-update",
            "--no-playlist",
            "--newline",
            "-x",
            "--audio-format",
            "mp3",
            "-o",
            out,
            job.url
          ]
        : [
            "--no-update",
            "--no-playlist",
            "--newline",
            "-f",
            "bv*+ba/b",
            "--merge-output-format",
            "mp4",
            "-o",
            out,
            job.url
          ];

    const proc = spawn("yt-dlp", args);

    job.proc = proc;

    let lastMsg = 0;

    proc.stdout.on("data", async (data) => {
      const text = data.toString();

      // progress %
      const percent = text.match(/(\d{1,3}\.\d|\d{1,3})%/);
      const speed = text.match(/at\s+([0-9.]+\w+\/s)/);

      const now = Date.now();

      if (percent && now - lastMsg > 2000) {
        lastMsg = now;

        try {
          await job.ctx.telegram.editMessageText(
            job.chatId,
            job.msgId,
            undefined,
            `📥 Yuklanmoqda...\n\n📊 ${percent[0]}\n🚀 ${speed?.[1] || "..."}`,
            job.cancelBtn
          );
        } catch {}
      }
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (job.cancelled) return reject("CANCELLED");
      if (code !== 0) return reject(new Error("yt-dlp error"));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("file not found"));

      resolve(path.join(DIR, file));
    });
  });
}

//================ RUN JOB =================
async function runJob(job) {
  const msg = await job.ctx.telegram.sendMessage(
    job.chatId,
    "⏳ Yuklanmoqda...",
    job.cancelBtn
  );

  job.msgId = msg.message_id;

  try {
    const file = await download(job);

    if (job.type === "audio") {
      await job.ctx.telegram.sendAudio(job.chatId, {
        source: file,
        title: job.title || "Audio"
      });
    } else {
      await job.ctx.telegram.sendVideo(job.chatId, {
        source: file,
        caption: job.title || "Video"
      });
    }

    fs.unlinkSync(file);

    await job.ctx.telegram.deleteMessage(job.chatId, msg.message_id).catch(() => {});
  } catch (e) {
    await job.ctx.telegram.sendMessage(job.chatId, "❌ Error / Cancelled");
  }
}

//================ START =================
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

//================ MODE =================
bot.action("movie", async (ctx) => {
  ctx.session.mode = "movie";
  await ctx.answerCbQuery();
  ctx.reply("🎬 Kino nomi:");
});

bot.action("music", async (ctx) => {
  ctx.session.mode = "music";
  await ctx.answerCbQuery();
  ctx.reply("🎵 Qo'shiq nomi:");
});

//================ SEARCH =================
async function search(ctx, q) {
  const r = await yts(q);
  const videos = r.videos.slice(0, 8);

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

//================ TEXT =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;

    return ctx.reply(
      "📥 Format:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "lvid"),
          Markup.button.callback("🎵 MP3", "laud"),
          Markup.button.callback("❌ Cancel", "cancel")
        ]
      ])
    );
  }

  if (!ctx.session.mode) return;

  const q = ctx.session.mode === "movie" ? text + " trailer" : text;
  await search(ctx, q);
});

//================ SELECT =================
bot.action(/sel_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  const url = `https://youtube.com/watch?v=${v.videoId}`;

  const cancelBtn = Markup.inlineKeyboard([
    [Markup.button.callback("❌ Cancel", `stop_${url}`)]
  ]);

  addJob({
    ctx,
    chatId: ctx.chat.id,
    url,
    type: ctx.session.mode === "music" ? "audio" : "video",
    title: v.title,
    cancelBtn
  });
});

//================ LINK =================
bot.action("lvid", async (ctx) => {
  addJob({
    ctx,
    chatId: ctx.chat.id,
    url: ctx.session.link,
    type: "video",
    cancelBtn: Markup.inlineKeyboard([
      [Markup.button.callback("❌ Cancel", "cancel_job")]
    ])
  });
});

bot.action("laud", async (ctx) => {
  addJob({
    ctx,
    chatId: ctx.chat.id,
    url: ctx.session.link,
    type: "audio",
    cancelBtn: Markup.inlineKeyboard([
      [Markup.button.callback("❌ Cancel", "cancel_job")]
    ])
  });
});

//================ CANCEL =================
bot.action(/stop_(.+)/, async (ctx) => {
  const job = [...jobs.values()].find(j => j.url.includes(ctx.match[1]));
  if (!job) return ctx.answerCbQuery("Topilmadi");

  job.cancelled = true;
  job.proc?.kill("SIGKILL");

  await ctx.answerCbQuery("❌ Cancel qilindi");
});

//================ LAUNCH =================
bot.launch();
console.log("🚀 V11 PRO READY");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));