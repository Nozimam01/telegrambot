require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// ================= EXPRESS SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 System Online"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Port: ${PORT}`));

// ================= DATABASE =================
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

const mainMenu = Markup.keyboard([["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]]).resize();

bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Salom! Bot mutlaqo yangilandi.\n\nQo'shiq nomini yozing yoki Instagram/TikTok/YouTube havolasini yuboring:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => { ctx.session.mode = "music"; ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:"); });
bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => { ctx.session.mode = "movie"; ctx.reply("🎬 Kino nomini yozing:"); });

// ================= 🔍 100% ISHLAYDIGAN YANGI QIDIRUV TIZIMI =================
async function searchYouTube(ctx, query) {
  try {
    // Eng so'nggi va barqaror kalitsiz YouTube qidiruv shlyuzi
    const res = await axios.get(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=videos`, { timeout: 10000 });
    
    if (!res.data || !res.data.streams || res.data.streams.length === 0) {
      return ctx.reply("Hech narsa topilmadi 😕. Boshqa nom yozib ko'ring.");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";
    const videos = res.data.streams.slice(0, 5);

    videos.forEach((v) => {
      const videoId = v.url.split("v=")[1] || v.url.split("/").pop();
      if (!videoId) return;
      const shortTitle = v.title.length > 25 ? v.title.slice(0, 22) + "..." : v.title;
      buttons.push([Markup.button.callback(isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, isMusic ? `dl_m_${videoId}` : `dl_v_${videoId}`)]);
    });

    return ctx.reply("📋 Natijalar topildi. Tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error("Qidiruv xatosi:", err.message);
    ctx.reply("⚠️ Qidiruv tizimi yuklanishda xatolik berdi. Qaytadan urinib ko'ring.");
  }
}

// ================= 🔥 MUKAMMAL UNIVERSAL YUKLASH TIZIMI =================
function runLocalDl(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ Media qayta ishlanmoqda, kuting...").catch(() => null);

  // INSTAGRAM VA TIKTOK UCHUN GLOBAL API SHLYUZ (yt-dlp kabi bloklanmaydi)
  if (url.includes("instagram.com") || url.includes("tiktok.com")) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Instagram/TikTok serveridan yuklanmoqda...").catch(() => {});
      
      const response = await axios.get(`https://api.bhawanigarg.com/social/downloader?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      if (response.data && response.data.data && response.data.data.url) {
        const mediaUrl = response.data.data.url;
        
        if (isAudio) {
          await ctx.replyWithAudio({ url: mediaUrl }).catch(() => {});
        } else {
          await ctx.replyWithVideo({ url: mediaUrl }, { caption: "🎬 Instagram/TikTok'dan yuklab olindi!" }).catch(() => {});
        }
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (e) {
      console.log("Instagram API shlyuzi band, mahalliy tizimga o'tildi.");
    }
  }

  // YOUTUBE UCHUN YOKI ZAXIRA UCHUN LOCAL YT-DLP CORE
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);

  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Mahalliy server orqali yuklanmoqda...").catch(() => {});
    
    let command = isAudio 
      ? `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`
      : `yt-dlp -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${outputTemplate}" "${url}"`;

    await runLocalDl(command);

    const files = fs.readdirSync(__dirname);
    const downloadedFile = files.find(f => f.startsWith(`media_${fileId}`));

    if (downloadedFile) {
      const finalPath = path.join(__dirname, downloadedFile);
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      } else {
        await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Muvaffaqiyatli yuklandi!" });
      }
      fs.unlinkSync(finalPath);
    } else {
      throw new Error("Fayl yaratilmadi");
    }
  } catch (error) {
    console.error("Yuklash xatosi:", error.message);
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Kechirasiz, ushbu havolani hozircha yuklab bo'lmadi.").catch(() => {});
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) return ctx.reply("💡 Bo'limni tanlang yoki link tashlang.", mainMenu);
  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    await downloadAndSend(ctx, `https://youtube.com/watch?v=${ctx.match[2]}`, ctx.match[1] === "m");
  } catch (e) {}
});

bot.launch({ dropPendingUpdates: true }).then(() => console.log("🔥 BOT TAYYOR!"));