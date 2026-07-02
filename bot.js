require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const yts = require("yt-search");

//================ EXPRESS (RENDER FIX) =================
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on", PORT));

//================ BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session = ctx.session || {};
  return next();
});

//================ TEMP DIR =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

//================ SAFE TEXT =================
const safe = (t = "") =>
  t.replace(/[\u0000-\u001F]/g, "").substring(0, 80);

//================ DOWNLOAD ENGINE =================
function download(url, type = "video") {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const base = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--restrict-filenames"
    ];

    const args =
      type === "audio"
        ? [...base, "-x", "--audio-format", "mp3", "-o", out, url]
        : [...base, "-f", "bv*+ba/b", "--merge-output-format", "mp4", "-o", out, url];

    const proc = execFile("yt-dlp", args);

    proc.on("error", reject);

    proc.on("exit", (code) => {
      if (code !== 0) return reject(new Error("yt-dlp error"));

      const file = fs.readdirSync(DIR).find(f => f.includes(id));
      if (!file) return reject(new Error("File not found"));

      resolve(path.join(DIR, file));
    });
  });
}

//================ START =================
bot.start((ctx) => {
  ctx.session = {};

  ctx.reply(
    "🎬 Media Bot\n\nTanlang:",
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
      "📥 Format tanlang",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "dl_video"),
          Markup.button.callback("🎵 MP3", "dl_audio")
        ]
      ])
    );
  }

  if (!ctx.session.mode)
    return ctx.reply("Avval menyudan tanlang");

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

  const msg = await ctx.reply("⏳ Yuklanmoqda...");

  try {
    const file = await download(
      `https://youtube.com/watch?v=${v.videoId}`,
      "video"
    );

    await ctx.replyWithDocument({ source: file });

    fs.unlinkSync(file);
    ctx.deleteMessage(msg.message_id);
  } catch (e) {
    ctx.reply("❌ Error");
  }
});

//================ MUSIC =================
bot.action(/music_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return ctx.reply("❌ Topilmadi");

  const msg = await ctx.reply("⏳ MP3...");

  try {
    const file = await download(
      `https://youtube.com/watch?v=${v.videoId}`,
      "audio"
    );

    await ctx.replyWithAudio({ source: file, title: safe(v.title) });

    fs.unlinkSync(file);
    ctx.deleteMessage(msg.message_id);
  } catch (e) {
    ctx.reply("❌ Error");
  }
});

//================ LINK VIDEO =================
bot.action("dl_video", async (ctx) => {
  await ctx.answerCbQuery();

  const url = ctx.session.link;
  if (!url) return ctx.reply("❌ Link yo'q");

  const msg = await ctx.reply("⏳ Yuklanmoqda...");

  try {
    const file = await download(url, "video");

    await ctx.replyWithDocument({ source: file });

    fs.unlinkSync(file);
    ctx.deleteMessage(msg.message_id);
  } catch (e) {
    ctx.reply("❌ Error");
  }
});

//================ LINK AUDIO =================
bot.action("dl_audio", async (ctx) => {
  await ctx.answerCbQuery();

  const url = ctx.session.link;
  if (!url) return ctx.reply("❌ Link yo'q");

  const msg = await ctx.reply("⏳ MP3...");

  try {
    const file = await download(url, "audio");

    await ctx.replyWithAudio({ source: file });

    fs.unlinkSync(file);
    ctx.deleteMessage(msg.message_id);
  } catch (e) {
    ctx.reply("❌ Error");
  }
});

//================ LAUNCH =================
bot.launch();
console.log("🚀 BOT RUNNING");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));