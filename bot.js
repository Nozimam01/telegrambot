require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 High-Performance YouTube API Core Online"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server faol, port: ${PORT}`));

// ================= MONGOOSE DATABASE CONNECT =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).catch(() => console.log("🍃 MongoDB offline rejimda."));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" }
}));

// ================= BOT INITIALIZATION =================
if (!process.env.BOT_TOKEN) {
  console.error("❌ XATOLIK: .env faylida BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= COMMANDS =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Salom! Rasmiy YouTube API tizimiga ega universal yuklovchi botga xush kelibsiz.\n\n" +
            "Qo'shiq nomini yozing yoki Instagram/TikTok/YouTube havolasini yuboring:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Yuklamoqchi bo'lgan qo'shiq nomini yoki xonandani yozing:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Qidirilayotgan kino yoki trailer nomini kiriting:");
});

// ================= 🔍 RASMIY GOOGLE YOUTUBE API V3 QIDIRUV TIZIMI =================
async function searchYouTube(ctx, query) {
  const waiting = await ctx.reply("🔍 Rasmiy tarmoqdan qidirilmoqda...").catch(() => null);
  
  try {
    const API_KEY = process.env.YOUTUBE_API_KEY;

    if (!API_KEY) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("❌ Xatolik: Serverda YOUTUBE_API_KEY kiritilmagan. Iltimos, .env faylini tekshiring.");
    }

    // Rasmiy Google YouTube API so'rovi
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}`;
    const response = await axios.get(searchUrl);

    if (!response.data.items || response.data.items.length === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕. Boshqa nom yozib ko'ring.");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";

    response.data.items.forEach((item) => {
      const videoId = item.id.videoId;
      if (!videoId) return;
      
      const title = item.snippet.title || "Musiqa";
      // Telegram tugmasiga chiroyli sig'ishi uchun nomini qisqartiramiz
      const shortTitle = title.length > 25 ? title.slice(0, 22) + "..." : title;

      buttons.push([
        Markup.button.callback(
          isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, 
          isMusic ? `dl_m_${videoId}` : `dl_v_${videoId}`
        )
      ]);
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Natijalar topildi. Formatni tanlang:", Markup.inlineKeyboard(buttons));

  } catch (err) {
    console.error("YouTube API Xatosi:", err.response ? err.response.data : err.message);
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    
    let errorMsg = "⚠️ YouTube qidiruv tizimida xatolik yuz berdi.";
    if (err.response && err.response.status === 403) {
      errorMsg = "⚠️ YouTube API Key limiti tugagan yoki kalit noto'g'ri kiritilgan.";
    }
    ctx.reply(errorMsg);
  }
}

// ================= 🔥 MUKAMMAL UNIVERSAL YUKLASH TIZIMI =================
function runLocalDl(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ So'rov qabul qilindi. Tayyorlanmoqda...").catch(() => null);

  // 1. INSTAGRAM & TIKTOK UCHUN SERVERT HIMOYaSINI AYLANIB O'TUVCHI API TIZIMI
  if (url.includes("instagram.com") || url.includes("tiktok.com")) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Yuqori tezlikdagi shlyuz orqali yuklanmoqda...").catch(() => {});
      
      // Instagram va TikTok xavfsizlik devorini buzib o'tuvchi maxsus API parser
      const res = await axios.get(`https://api.sandipbaruwal.com/insta/download?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      const directUrl = res.data?.data?.[0]?.url;

      if (directUrl) {
        if (isAudio) {
          await ctx.replyWithAudio({ url: directUrl }).catch(() => {});
        } else {
          await ctx.replyWithVideo({ url: directUrl }, { caption: "🎬 Muvaffaqiyatli yuklandi!" }).catch(() => {});
        }
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (apiErr) {
      console.log("Instagram maxsus API javob bermadi, mahalliy core ishga tushadi.");
    }
  }

  // 2. YOUTUBE VA ZAXIRA HAVOLALAR UCHUN SERVERNINIG O'ZIDAGI YT-DLP CORE
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);

  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Server yuklashni boshladi...").catch(() => {});
    
    let command = isAudio 
      ? `yt-dlp --no-check-certificates --no-warnings -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`
      : `yt-dlp --no-check-certificates --no-warnings -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${outputTemplate}" "${url}"`;

    await runLocalDl(command);

    const files = fs.readdirSync(__dirname);
    const downloadedFile = files.find(f => f.startsWith(`media_${fileId}`));

    if (downloadedFile) {
      const finalPath = path.join(__dirname, downloadedFile);
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegram tizimiga uzatilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      } else {
        await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Marhamat, tayyor!" });
      }
      fs.unlinkSync(finalPath); // Xotirani darhol bo'shatamiz
    } else {
      throw new Error("Fayl topilmadi.");
    }
  } catch (error) {
    console.error("Yuklash yakuniy xatosi:", error.message);
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Kechirasiz, ushbu havolani yuklash imkoni bo'lmadi (Havola yopiq yoki format xato).").catch(() => {});
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART DETECTOR CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  // Har qanday holatda birinchi linkligini tekshirish
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) return ctx.reply("💡 Davom etish uchun bo'limni tanlang yoki to'g'ridan-to'g'ri link yuboring.", mainMenu);
  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati yakunlangan. Linkni qayta yuboring.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    await downloadAndSend(ctx, `https://youtube.com/watch?v=${ctx.match[2]}`, ctx.match[1] === "m");
  } catch (e) {}
});

// ================= START BOT =================
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 BOT OFFICIAL YOUTUBE API BILAN ISHLAMOQDA!"))
  .catch((err) => console.error("Launch Error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));