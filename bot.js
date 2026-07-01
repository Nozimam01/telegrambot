require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const yts = require("yt-search");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= WEB SERVER (Render requirement)
const app = express();
app.get("/", (req, res) => res.send("Bot is alive 🚀"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));

// ================= SESSION
bot.use(session());

// ================= CLEAN TEMP DIR
const DOWNLOAD_DIR = "/tmp";

// ================= SAFE TEXT
function safeText(text = "") {
  return text.toString().slice(0, 60);
}

// ================= LINK REGEX
const LINK_REGEX =
  /(https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)\/\S+)/i;

// ================= START
bot.start(async (ctx) => {
  ctx.session = {};

  return ctx.reply(
    "🎬 Botga xush kelibsiz!",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino", "movie_mode"),
        Markup.button.callback("🎵 Musiqa", "music_mode")
      ]
    ])
  );
});

// ================= MODE
bot.action("movie_mode", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomini yuboring");
});

bot.action("music_mode", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yuboring");
});

// ================= SEARCH
async function search(ctx, query, type) {
  try {
    const result = await yts(query);
    const videos = result.videos.slice(0, 5);

    ctx.session.list = videos;

    return ctx.reply(
      "📌 Natijalar:",
      Markup.inlineKeyboard(
        videos.map((v, i) => [
          Markup.button.callback(
            safeText(v.title),
            `${type}_${i}`
          )
        ])
      )
    );
  } catch (e) {
    console.log(e);
    ctx.reply("❌ Qidiruv xatosi");
  }
}

// ================= TEXT HANDLER
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (!ctx.session) ctx.session = {};

  if (!ctx.session.mode) {
    return ctx.reply("Avval Kino yoki Musiqa tanlang");
  }

  if (ctx.session.mode === "movie") {
    return search(ctx, text + " trailer", "movie");
  }

  if (ctx.session.mode === "music") {
    return search(ctx, text, "music");
  }
});

// ================= DOWNLOAD (CLEAN)
function download(url, type) {
  return new Promise((resolve, reject) => {
    const fileName = `${Date.now()}.mp4`;
    const output = path.join(DOWNLOAD_DIR, fileName);

    const args =
      type === "audio"
        ? [
            "-x",
            "--audio-format",
            "mp3",
            "-o",
            output,
            url
          ]
        : [
            "-f",
            "best[height<=720]",
            "-o",
            output,
            url
          ];

    execFile("yt-dlp", args, (err) => {
      if (err) return reject(err);
      resolve(output);
    });
  });
}

// ================= MOVIE
bot.action(/movie_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const video = ctx.session.list?.[ctx.match[1]];
  if (!video) return ctx.reply("❌ Topilmadi");

  try {
    const file = await download(
      `https://youtube.com/watch?v=${video.videoId}`,
      "video"
    );

    await ctx.replyWithVideo({ source: file });

    fs.unlinkSync(file);
  } catch (e) {
    console.log(e);
    ctx.reply("❌ Video error");
  }
});

// ================= MUSIC
bot.action(/music_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const song = ctx.session.list?.[ctx.match[1]];
  if (!song) return ctx.reply("❌ Topilmadi");

  try {
    const file = await download(
      `https://youtube.com/watch?v=${song.videoId}`,
      "audio"
    );

    await ctx.replyWithAudio({ source: file });

    fs.unlinkSync(file);
  } catch (e) {
    console.log(e);
    ctx.reply("❌ Audio error");
  }
});

// ================= LAUNCH (IMPORTANT)
bot.launch({
  dropPendingUpdates: true
});

console.log("🚀 Bot running");

// ================= STOP HANDLER
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));