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
app.get("/", (req, res) => res.send("V11 FIXED BOT 🚀"));

const PORT = process.env.PORT || 4000;
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

//================ DOWNLOAD =================
function download(url, type = "video") {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const out = path.join(DIR, `${id}.%(ext)s`);

    const args =
      type === "audio"
        ? [
            "--no-playlist",
            "--no-warnings",
            "--newline",
            "-x",
            "--audio-format",
            "mp3",
            "-o",
            out,
            url
          ]
        : [
            "--no-playlist",
            "--no-warnings",
            "--newline",
            "-f",
            "best[height<=480]",
            "--merge-output-format",
            "mp4",
            "-o",
            out,
            url
          ];

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
    "🎬 V11 FIXED BOT",
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
  ctx.reply("🎵 Qo‘shiq nomi:");
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

//================ TEXT (ONLY ONE HANDLER) =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // LINK ONLY
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

  const query =
    ctx.session.mode === "movie"
      ? text + " trailer"
      : text;

  const r = await yts(query);
  ctx.session.list = r.videos.slice(0, 8);

  ctx.reply(
    "📋 Natijalar:",
    Markup.inlineKeyboard(
      ctx.session.list.map((v, i) => [
        Markup.button.callback(v.title.slice(0, 35), `sel_${i}`)
      ])
    )
  );
});

//================ SELECT =================
bot.action(/sel_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const v = ctx.session.list?.[ctx.match[1]];
  if (!v) return;

  const url = `https://youtube.com/watch?v=${v.videoId}`;

  const type = ctx.session.mode === "music" ? "audio" : "video";

  const msg = await ctx.reply("⏳ Yuklanmoqda...");

  try {
    const file = await download(url, type);

    if (type === "audio") {
      await ctx.replyWithAudio({ source: file, title: v.title });
    } else {
      await ctx.replyWithVideo({ source: file, caption: v.title });
    }

    fs.unlinkSync(file);
    ctx.deleteMessage(msg.message_id).catch(() => {});
  } catch (e) {
    ctx.reply("❌ Yuklab bo‘lmadi");
  }
});

//================ LINK VIDEO =================
bot.action("link_video", async (ctx) => {
  const url = ctx.session.link;
  if (!url) return;

  const msg = await ctx.reply("⏳ Video yuklanmoqda...");

  try {
    const file = await download(url, "video");

    await ctx.replyWithVideo({ source: file });

    fs.unlinkSync(file);
    ctx.deleteMessage(msg.message_id).catch(() => {});
  } catch {
    ctx.reply("❌ Error");
  }
});

//================ LINK AUDIO =================
bot.action("link_audio", async (ctx) => {
  const url = ctx.session.link;
  if (!url) return;

  const msg = await ctx.reply("⏳ MP3 yuklanmoqda...");

  try {
    const file = await download(url, "audio");

    await ctx.replyWithAudio({ source: file });

    fs.unlinkSync(file);
    ctx.deleteMessage(msg.message_id).catch(() => {});
  } catch {
    ctx.reply("❌ Error");
  }
});

//================ LAUNCH =================
bot.launch();
console.log("🚀 V11 FIXED READY");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));