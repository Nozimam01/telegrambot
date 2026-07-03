require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, execSync } = require("child_process");
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

// ================= TEMP & BINARIES =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const YTDLP_PATH = path.join(DIR, "yt-dlp");
function initYtdlp() {
  try {
    console.log("🔄 yt-dlp tekshirilmoqda...");
    execSync(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${YTDLP_PATH}`);
    execSync(`chmod a+rx ${YTDLP_PATH}`);
    console.log("✅ yt-dlp muvaffaqiyatli o'rnatildi va tayyor!");
  } catch (err) {
    console.error("❌ yt-dlp yuklashda xatolik:", err.message);
  }
}
initYtdlp();

// ================= JOB CONTROL =================
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
    const msg = await job.ctx.reply("⏳ Fayl yuklanmoqda, kuting...").catch(() => null);

    try {
      const fileId = crypto.randomUUID().slice(0, 8);
      const safeFileName = `media_${fileId}`;

      const file = await download(job.url, job.type, safeFileName);

      if (msg) {
        await job.ctx.telegram.editMessageText(job.ctx.chat.id, msg.message_id, null, "🚀 Fayl tayyor! Telegramga yuborilmoqda...").catch(() => {});
      }

      // Fayl nomidan noqulay belgilarni tozalash (Telegram xavfsizligi uchun)
      const cleanTitle = (job.title || "Media").replace(/[\\/:*?"<>|]/g, "");

      if (job.type === "audio") {
        await job.ctx.replyWithAudio({
          source: file,
          title: cleanTitle,
          performer: "V13 Downloader"
        });
      } else {
        await job.ctx.replyWithVideo({
          source: file,
          caption: `🎬 ${cleanTitle}`
        });
      }

      if (fs.existsSync(file)) fs.unlinkSync(file);
      if (msg) await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    } catch (e) {
      console.log("DOWNLOAD ERROR DETAILS:", e);
      
      let errorText = `❌ Yuklab bo'lmadi. Sababi: ${e.message}`;
      if (e.message === "TOO_LARGE") {
        errorText = "⚠️ Fayl hajmi juda katta! Maksimal limit: 2 GB.";
      } else if (e.message === "TIMEOUT") {
        errorText = "❌ Kutish vaqti tugadi (Timeout). Server juda sekin.";
      }

      job.ctx.reply(errorText);
      if (msg) await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    }
  }

  running = false;
}

// ================= DOWNLOAD FUNCTION =================
function download(url, type, fileName) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(YTDLP_PATH)) {
      initYtdlp();
    }

    const out = path.join(DIR, `${fileName}.%(ext)s`);

    const commonArgs = [
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "--socket-timeout", "30",
      "--retries", "5",
      "--fragment-retries", "5",
      "--max-filesize", "2G", 
      "--extractor-args", "youtube:player_client=android,web", 
      "-o", out,
      url
    ];

    let specificArgs = [];
    if (type === "audio") {
      specificArgs = ["-x", "--audio-format", "mp3", "--audio-quality", "5"];
    } else {
      specificArgs = ["-f", "worst[ext=mp4]/b[ext=mp4]"];
    }

    const args = [...specificArgs, ...commonArgs];
    const proc = spawn(YTDLP_PATH, args);
    
    let killed = false;
    let isTooLarge = false;

    proc.stderr.on("data", (d) => {
      const s = d.toString();
      if (s.includes("File is larger than max-filesize")) {
        isTooLarge = true;
      }
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      reject(new Error("TIMEOUT"));
    }, 420000); 

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return;
      
      if (isTooLarge) return reject(new Error("TOO_LARGE"));

      if (code !== 0) {
        return reject(new Error(`yt-dlp xatosi (Kod: ${code}).`));
      }

      const file = fs.readdirSync(DIR).find(f => f.includes(fileName));
      if (!file) return reject(new Error("Fayl topilmadi"));

      resolve(path.join(DIR, file));
    });
  });
}

// ================= BOT COMMANDS =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply(
    "🚀 V13 PRO MEDIA BOT",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🎬 Kino (Trailer)", "movie"),
        Markup.button.callback("🎵 Musiqa", "music")
      ]
    ])
  );
});

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

async function search(ctx, q) {
  try {
    const r = await yts(q);
    const videos = r.videos.slice(0, 8);
    if (!videos.length) return ctx.reply("Hech narsa topilmadi 😕");

    const typeKey = ctx.session.mode === "music" ? "m" : "v";

    return ctx.reply(
      "📋 Natijalar:",
      Markup.inlineKeyboard(
        videos.map((v) => [
          Markup.button.callback(v.title.slice(0, 35), `dl_${typeKey}_${v.videoId}`)
        ])
      )
    );
  } catch (err) {
    ctx.reply("Qidiruvda xatolik yuz berdi.");
  }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;
    return ctx.reply(
      "📥 Havola aniqlandi. Formatni tanlang:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", "link_video"),
          Markup.button.callback("🎵 MP3", "link_audio")
        ]
      ])
    );
  }

  if (!ctx.session.mode) return ctx.reply("Avval Kino yoki Musiqa tanlang");

  const q = ctx.session.mode === "movie" ? text + " trailer" : text;
  await search(ctx, q);
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const typeFlag = ctx.match[1]; 
  const videoId = ctx.match[2];  
  
  const url = `https://youtube.com/watch?v=${videoId}`;
  
  let mediaTitle = "Media Fayl";
  try {
    // ID orqali videoning to'liq ma'lumotlarini olib, o'z nomini aniqlaymiz
    const videoInfo = await yts({ videoId: videoId });
    if (videoInfo && videoInfo.title) mediaTitle = videoInfo.title;
  } catch (_) {}

  addJob({
    ctx,
    url,
    type: typeFlag === "m" ? "audio" : "video",
    title: mediaTitle
  });
});

bot.action("link_video", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session.link) return ctx.reply("❌ Havola esdan chiqdi. Iltimos linkni qayta yuboring.");
  
  let linkTitle = "Video fayl";
  try {
    const r = await yts(ctx.session.link);
    if (r && r.title) linkTitle = r.title;
  } catch (_) {}

  addJob({ ctx, url: ctx.session.link, type: "video", title: linkTitle });
});

bot.action("link_audio", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session.link) return ctx.reply("❌ Havola esdan chiqdi. Iltimos linkni qayta yuboring.");
  
  let linkTitle = "Audio fayl";
  try {
    const r = await yts(ctx.session.link);
    if (r && r.title) linkTitle = r.title;
  } catch (_) {}

  addJob({ ctx, url: ctx.session.link, type: "audio", title: linkTitle });
});

// ================= SAFE LAUNCH =================
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 V13 PRO STABLE READY"))
  .catch((err) => console.error("❌ Botni ishga tushirishda xatolik:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));