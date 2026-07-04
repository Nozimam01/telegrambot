require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, execSync } = require("child_process");
const yts = require("yt-search");
const axios = require("axios"); // Railway uyg'oq tizimi uchun

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

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= TEMP & BINARIES =================
const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const YTDLP_PATH = path.join(DIR, "yt-dlp");

function initYtdlp(force = false) {
  try {
    if (fs.existsSync(YTDLP_PATH) && !force) {
      return;
    }
    console.log("🔄 yt-dlp yuklanmoqda/yangilanmoqda...");
    execSync(`curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${YTDLP_PATH}`);
    execSync(`chmod a+rx ${YTDLP_PATH}`);
    console.log("✅ yt-dlp tayyor!");
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
      const cleanTitle = (job.title || "Media").replace(/[\\/:*?"<>|]/g, " ").trim();
      const randomId = crypto.randomUUID().slice(0, 4);
      const safeFileName = `${cleanTitle.slice(0, 30)}_${randomId}`;

      const file = await download(job.url, job.type, safeFileName);

      if (msg) {
        await job.ctx.telegram.editMessageText(job.ctx.chat.id, msg.message_id, null, "🚀 Fayl tayyor! Telegramga yuborilmoqda...").catch(() => {});
      }

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
      } else if (e.message.includes("Kod: 1")) {
        errorText = "⚠️ YouTube tizimi yuklashni rad etdi. Server qayta urinmoqda...";
        initYtdlp(true);
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
      "-o", out,
      url
    ];

    const cookiesPath = path.join(__dirname, "cookies.txt");
    if (fs.existsSync(cookiesPath)) {
      commonArgs.push("--cookies", cookiesPath);
    } else {
      commonArgs.push("--extractor-args", "youtube:player_client=android,web");
    }

    let specificArgs = [];
    if (type === "audio") {
      specificArgs = ["-x", "--audio-format", "mp3", "--audio-quality", "5", "--embed-metadata"];
    } else {
      specificArgs = ["-f", "mp4[height<=480]/worst[ext=mp4]/b[ext=mp4]"];
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
    "🚀 V13 PRO MEDIA BOT\n\nPastdagi menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri YouTube havolasini yuboring!",
    mainMenu
  );
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomini yozing:");
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo‘shiq nomini yozing:");
});

async function search(ctx, q) {
  try {
    const r = await yts(q);
    const videos = r.videos.slice(0, 5); 
    if (!videos.length) return ctx.reply("Hech narsa topilmadi 😕");

    const buttons = [];
    const isMusic = ctx.session.mode === "music";

    videos.forEach((v) => {
      const shortTitle = v.title.slice(0, 30);
      if (isMusic) {
        buttons.push([Markup.button.callback(`🎵 ${shortTitle}`, `dl_m_${v.videoId}`)]);
      } else {
        buttons.push([Markup.button.callback(`🎥 ${shortTitle}`, `dl_v_${v.videoId}`)]);
      }
    });

    return ctx.reply("📋 Natijalar topildi. Yuklab olish uchun ustiga bosing:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    ctx.reply("Qidiruvda xatolik yuz berdi.");
  }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  if (/https?:\/\//.test(text)) {
    ctx.session.link = text;
    return ctx.reply(
      "📥 Havola aniqlandi. Formatni tanlang:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video yuklash", "link_video"),
          Markup.button.callback("🎵 MP3 yuklash", "link_audio")
        ]
      ])
    );
  }

  if (!ctx.session.mode) {
    return ctx.reply("Avval pastdagi menyudan Kino yoki Musiqa bo'limini tanlang.", mainMenu);
  }

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
  if (!ctx.session.link) return ctx.reply("❌ Havola topilmadi. Qayta yuboring.");
  addJob({ ctx, url: ctx.session.link, type: "video", title: "Video Fayl" });
});

bot.action("link_audio", async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session.link) return ctx.reply("❌ Havola topilmadi. Qayta yuboring.");
  addJob({ ctx, url: ctx.session.link, type: "audio", title: "Audio Fayl" });
});

// ================= SELF-PING (KEEP ALIVE) =================
setInterval(() => {
  // GitHub loyihangiz nomidan kelib chiqib, havola qo'shildi
  const myUrl = "https://telegrambot-production.up.railway.app"; 
  axios.get(myUrl)
    .then(() => console.log("⏰ Self-ping muvaffaqiyatli: Bot uyg'oq!"))
    .catch((err) => console.log("⏰ Self-pingda xato:", err.message));
}, 600000); 

// ================= SAFE LAUNCH =================
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 V13 PRO STABLE READY"))
  .catch((err) => console.error("❌ Botni ishga tushirishda xatolik:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));