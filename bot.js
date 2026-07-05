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
app.get("/", (req, res) => res.send("🟢 Core System Active"));
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

// ================= BOT INTIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

const mainMenu = Markup.keyboard([["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]]).resize();

bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Salom! Bot mutlaqo yangi API shlyuzlariga o'tkazildi.\n\nQo'shiq nomini yozing yoki istalgan linkni yuboring:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => { ctx.session.mode = "music"; ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:"); });
bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => { ctx.session.mode = "movie"; ctx.reply("🎬 Kino yoki trailer nomini yozing:"); });

// ================= 🔍 KAFOLATLANGAN KO'P LINIYALI QIDIRUV =================
async function searchYouTube(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  
  // 1-Liniya: Yangi faol Piped API shlyuzi
  const endpoints = [
    `https://pipedapi.oxymoron.biz/search?q=${encodeURIComponent(query)}&filter=videos`,
    `https://pipedapi.adminforge.de/search?q=${encodeURIComponent(query)}&filter=videos`,
    `https://vid.puffyan.us/api/v1/search?q=${encodeURIComponent(query)}&type=video`
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, { timeout: 8000 });
      const streams = res.data.streams || res.data;
      
      if (streams && streams.length > 0) {
        const buttons = [];
        const isMusic = ctx.session.mode === "music";
        const videos = streams.slice(0, 5);

        videos.forEach((v) => {
          const videoId = v.videoId || (v.url ? v.url.split("v=")[1] || v.url.split("/").pop() : null);
          if (!videoId) return;
          const title = v.title || "Musiqa";
          const shortTitle = title.length > 25 ? title.slice(0, 22) + "..." : title;
          buttons.push([Markup.button.callback(isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, isMusic ? `dl_m_${videoId}` : `dl_v_${videoId}`)]);
        });

        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return ctx.reply("📋 Topilgan natijalar:", Markup.inlineKeyboard(buttons));
      }
    } catch (e) {
      console.log(`Qidiruv shlyuzi ulanmadi (${url}), keyingisiga o'tilmoqda...`);
    }
  }

  if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  return ctx.reply("⚠️ Afsuski, qidiruv xizmatlari vaqtincha band. Birozdan so'ng qayta urinib ko'ring yoki to'g'ridan-to'g'ri havola yuboring.");
}

// ================= 🔥 MUAMMOSIZ UNIVERSAL YUKLOVCHI =================
function runLocalDl(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ So'rov ishlanmoqda...").catch(() => null);

  // 1. INSTAGRAM VA TIKTOK REELS BLOKLARINI AYLANIB O'TUVCHI GLOBAL SHLYUZ
  if (url.includes("instagram.com") || url.includes("tiktok.com")) {
    const apiGateways = [
      `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
      `https://www.lovetik.com/api/ajaxSearch`, // Zaxira
    ];

    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Global tarmoq shlyuzi orqali yuklanmoqda...").catch(() => {});
      
      // Tiklydown va muqobil API orqali sinab ko'rish
      const res = await axios.get(apiGateways[0], { timeout: 12000 });
      let directUrl = res.data?.result?.video?.noWatermark || res.data?.result?.images?.[0]?.url || res.data?.result?.url;

      if (!directUrl && url.includes("instagram.com")) {
        // Instagram muqobil ochiq parser API
        const instaRes = await axios.get(`https://api.sandipbaruwal.com/insta/download?url=${encodeURIComponent(url)}`, { timeout: 12000 });
        directUrl = instaRes.data?.data?.[0]?.url;
      }

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
      console.log("Tashqi API xatosi, mahalliy tizimga o'tildi:", apiErr.message);
    }
  }

  // 2. YOUTUBE UCHUN YOKI ZAXIRA UCHUN SERVERNINIG O'ZIDAGI YT-DLP CORE
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);

  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Mahalliy serverda yuklash jarayoni boshlandi...").catch(() => {});
    
    // Cookie muammosini aylanib o'tish uchun YouTube yuklovchisini barqaror sozlamalari
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
        await ctx.replyWithAudio({ source: finalPath }, { filename: "audio.mp3" });
      } else {
        await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Medianingiz tayyor!" });
      }
      fs.unlinkSync(finalPath);
    } else {
      throw new Error("Fayl serverda saqlanmadi.");
    }
  } catch (error) {
    console.error("Yuklash yakuniy xatosi:", error.message);
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Kechirasiz, ushbu havola himoyalangan yoki tizim vaqtincha yuklay olmaydi.").catch(() => {});
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART DETECTOR CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  // Har doim birinchi bo'lib linkligini tekshirish
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola qabul qilindi. Formatni tanlang:", Markup.inlineKeyboard([
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
  .then(() => console.log("🔥 MULTI-PORT MULTI-API CORE IS ONLINE!"))
  .catch((err) => console.error("Launch Error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));