require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const yts = require("yt-search");

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("V12 PRO BOT 🚀"));

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

// ================= QUEUE =================
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
      const msg = await job.ctx.reply("⏳ Yuklanmoqda... 0%");

      const file = await download(job.url, job.type, async (p) => {
        try {
          await job.ctx.telegram.editMessageText(
            job.ctx.chat.id,
            msg.message_id,
            null,
            `⏳ Yuklanmoqda... ${p}%`
          );
        } catch {}
      });

      const thumb = job.thumb;

      if (job.type === "audio") {
        await job.ctx.telegram.sendAudio(job.ctx.chat.id, {
          source: file,
          title: job.title,
          performer: job.author,
          thumbnail: thumb
        });
      } else {
        await job.ctx.telegram.sendVideo(job.ctx.chat.id, {
          source: file,
          caption: job.title
        });
      }

      fs.unlinkSync(file);
      await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    } catch (e) {
      console.log(e);
      job.ctx.reply("❌ Xatolik / timeout");
    }
  }

  running = false;
}

// ================= DOWNLOAD ENGINE =================
function download(url, type, onProgress) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const args =
      type === "audio"
        ? [
            "yt-dlp",
            "--no-playlist",
            "--quiet",
            "--progress",
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
            "--quiet",
            "--progress",
            "-f",
            "bv*[height<=720]+ba/b",
            "--merge-output-format",
            "mp4",
            "-o",
            out,
            url
          ];

    const proc = execFile("yt-dlp", args);

    proc.stdout?.on("data", (data) => {
      const str = data.toString();
      const match = str.match(/(\d+\.?\d*)%/);
      if (match && onProgress) onProgress(Math.floor(match[1]));
    });

    proc.on("error", reject);

    proc.on("exit", (code) => {
      if (code !== 0) return reject(new Error("yt-dlp error"));

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
    "🎬 V12 PRO MEDIA BOT",
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
  ctx.reply("🎬 Kino nomi:");
});

bot.action("music", (ctx) => {
  ctx.session.mode = "music";
  ctx.answerCbQuery();
  ctx.reply("🎵 Qo‘shiq nomi:");
});

// ================= SEARCH =================
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

// ================= TEXT =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;

    return ctx.reply(
      "📥 Format tanlang:",
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
    author: v.author?.name || "Unknown",
    thumb: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
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
console.log("🚀 V12 PRO RUNNING");