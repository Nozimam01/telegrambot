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
app.get("/", (req, res) => res.send("🟢 High-Performance Engine Online"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ================= MONGOOSE DATABASE =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).catch(() => {});

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= COMMANDS =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Salom! Bot yangilandi va barcha xatoliklar tuzatildi.\n\nQo'shiq nomini yozing yoki Instagram/TikTok/YouTube havolasini yuboring:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino yoki trailer nomini yozing:");
});

// ================= 🔍 100% RASMIY YOUTUBE QIDIRUV TIZIMI =================
async function searchYouTube(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  
  try {
    // Agar serverda .env topilmasa, mana shu ishchi kalit ishlatiladi
    const API_KEY = process.env.YOUTUBE_API_KEY || "AIzaSyBQt88s7Z8CZ9IsnHl_LuTU1ARxtme8s1U";

    // Google YouTube API v3 uchun mutlaqo to'g'ri so'rov formati
    const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
    const response = await axios.get(searchUrl, {
      params: {
        part: "snippet",
        maxResults: 5,
        q: query,
        type: "video",
        key: API_KEY
      },
      timeout: 10000
    });

    if (!response.data || !response.data.items || response.data.items.length === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕. Boshqa nom yozib ko'ring.");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";

    response.data.items.forEach((item) => {
      const videoId = item.id.videoId;
      if (!videoId) return;
      
      const title = item.snippet.title || "Musiqa";
      const shortTitle = title.length > 25 ? title.slice(0, 22) + "..." : title;

      buttons.push([
        Markup.button.callback(
          isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, 
          isMusic ? `dl_m_${videoId}` : `dl_v_${videoId}`
        )
      ]);
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Natijalar topildi. Tanlang:", Markup.inlineKeyboard(buttons));

  } catch (err) {
    console.error("YouTube API Xatosi:", err.message);
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruv xizmatida vaqtincha uzilish bor. Birozdan so'ng qayta urinib ko'ring yoki to'g'ridan-to'g'ri havola yuboring.");
  }
}

// ================= 🔥 MUAMMOSIZ INSTAGRAM & YOUTUBE YUKLOVCHI =================
function runLocalDl(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ So'rov qayta ishlanmoqda...").catch(() => null);

  // 1. INSTAGRAM & TIKTOK BLOKLARINI AYLANIB O'TUVCHI YANGI SHLYUZ (2026)
  if (url.includes("instagram.com") || url.includes("tiktok.com")) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Tarmoqdan yuklanmoqda...").catch(() => {});
      
      const res = await axios.get(`https://api.sandipbaruwal.com/insta/download?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      const directUrl = res.data?.data?.[0]?.url;

      if (directUrl) {
        if (isAudio) {
          await ctx.replyWithAudio({ url: directUrl }).catch(() => {});
        } else {
          await ctx.replyWithVideo({ url: directUrl }, { caption: "🎬 Instagram/TikTok'dan yuklab olindi!" }).catch(() => {});
        }
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (apiErr) {
      console.log("Instagram API band, zaxira tizimga o'tildi.");
    }
  }

  // 2. YOUTUBE UCHUN SERVERNINIG O'ZIDAGI YT-DLP CORE (BLOKSIZ)
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);

  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Server orqali yuklanmoqda...").catch(() => {});
    
    let command = isAudio 
      ? `yt-dlp --no-check-certificates --no-warnings -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`
      : `yt-dlp --no-check-certificates --no-warnings -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${outputTemplate}" "${url}"`;

    await runLocalDl(command);

    const files = fs.readdirSync(__dirname);
    const downloadedFile = files.find(f => f.startsWith(`media_${fileId}`));

    if (downloadedFile) {
      const finalPath = path.join(__dirname, downloadedFile);
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      } else {
        await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Medianingiz tayyor!" });
      }
      fs.unlinkSync(finalPath);
    } else {
      throw new Error("Fayl topilmadi.");
    }
  } catch (error) {
    console.error("Yuklash xatosi:", error.message);
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Kechirasiz, ushbu media faylni yuklab bo'lmadi.").catch(() => {});
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  // Birinchi havola ekanligini tekshiramiz
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) return ctx.reply("💡 Davom etish uchun pastki menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri link yuboring.", mainMenu);
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
  .then(() => console.log("🔥 BOT MUAMMOSIZ ISHGA TUSHDI!"))
  .catch((err) => console.error("Launch Error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));