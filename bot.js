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
app.get("/", (req, res) => res.send("V11 PRO BOT 🚀"));

const PORT = process.env.PORT || 10000;
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

// ================= SAFE =================
const safe = (t = "") =>
  t.replace(/[\u0000-\u001F]/g, "").substring(0, 80);

// ================= DOWNLOAD =================
function download(url, type = "video") {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const args =
      type === "audio"
        ? [
            "yt-dlp",
            "--no-update",
            "--no-warnings",
            "--restrict-filenames",
            "-x",
            "--audio-format",
            "mp3",
            "-o",
            out,
            url
          ]
        : [
            "yt-dlp",
            "--no-update",
            "--no-warnings",
            "--restrict-filenames",
            "-f",
            "bv*+ba/b",
            "--merge-output-format",
            "mp4",
            "-o",
            out,
            url
          ];

    const proc = execFile("yt-dlp", args);

    let done = false;

    proc.on("error", reject);

    proc.on("exit", (code) => {
      if (done) return;
      if (code !== 0) return reject(new Error("yt-dlp failed"));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("file not found"));

      resolve(path.join(DIR, file));
    });

    setTimeout(() => {
      done = true;
      proc.kill("SIGKILL");
      reject(new Error("timeout"));
    }, 5 * 60 * 1000);
  });
}

// ================= START =================
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

// ================= MODE =================
bot.action("movie", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomini yozing:");
});

bot.action("music", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "music";
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
        Markup.button.callback(`${i + 1}. ${v.title.slice(0, 35)}`, `sel_${i}`)
      ])
    )
  );
}

// ================= SINGLE TEXT HANDLER (FIXED) =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // LINK MODE
  if (/https?:\/\//.test(text)) {
    ctx.session.mode = "link";
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

  const q =
    ctx.session.mode === "movie"
      ? text + " trailer"
      : text;

  await search(ctx, q);
});

// ================= SELECT =================
bot.action(/sel_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  const url = `https://youtube.com/watch?v=${v.videoId}`;

  const type = ctx.session.mode === "music" ? "audio" : "video";

  await ctx.reply("⏳ Yuklanmoqda...");

  const file = await download(url, type);

  if (type === "audio") {
    await ctx.replyWithAudio({
      source: file,
      title: v.title,
      performer: v.author?.name || "Unknown"
    });
  } else {
    await ctx.replyWithVideo({ source: file, caption: v.title });
  }

  fs.unlinkSync(file);
});

// ================= LINK VIDEO =================
bot.action("link_video", async (ctx) => {
  await ctx.answerCbQuery();

  const url = ctx.session.link;
  if (!url) return;

  await ctx.reply("⏳ Yuklanmoqda...");

  const file = await download(url, "video");

  await ctx.replyWithVideo({ source: file });

  fs.unlinkSync(file);
});

// ================= LINK AUDIO =================
bot.action("link_audio", async (ctx) => {
  await ctx.answerCbQuery();

  const url = ctx.session.link;
  if (!url) return;

  await ctx.reply("⏳ MP3 tayyorlanmoqda...");

  const file = await download(url, "audio");

  await ctx.replyWithAudio({ source: file });

  fs.unlinkSync(file);
});

// ================= LAUNCH =================
bot.launch();
console.log("🚀 V11 PRO FIXED RUNNING");