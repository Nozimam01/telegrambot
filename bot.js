require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const youtubesearchapi = require("youtube-search-api");

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 High-Speed Movie & Music Engine Online"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ================= MONGOOSE DATABASE =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).catch(() => console.log("🍃 DB Offline rejimda"));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

// Yangilangan asosiy menyu
const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]
]).resize();

// ================= COMMANDS =================
bot.start(async (ctx) => {
  ctx.session = {};
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { username: ctx.from.username, firstName: ctx.from.first_name },
      { upsert: true }
    );
  } catch (e) {}
  
  ctx.reply("🚀 Salom! Kino treylerlari va musiqalarni 5 soniyada yuklovchi botga xush kelibsiz.\n\nBo'limni tanlang yoki to'g'ridan-to'g'ri havola yuboring:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Yuklamoqchi bo'lgan qo'shiq yoki ijrochi nomini kiriting:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Qidirilayotgan kino yoki serial nomini yozing (Men treylerini topaman):");
});

// Maxsus belgilarni tozalash
function cleanTitle(title) {
  if (!title) return "Media fayl";
  return title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[<>]/g, "");
}

function cleanUrl(url) {
  try {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      const urlObj = new URL(url);
      if (urlObj.searchParams.has("list")) {
        urlObj.searchParams.delete("list");
        urlObj.searchParams.delete("index");
      }
      return urlObj.toString();
    }
  } catch (e) {}
  return url;
}

// ================= 🔍 ULTRA TEZKOR YOUTUBE QIDIRUV =================
async function searchYouTube(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  
  try {
    const searchResults = await youtubesearchapi.GetListByKeyword(query, false, 5);

    if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕. Boshqa nom yozib ko'ring.");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";

    searchResults.items.forEach((item) => {
      const videoId = item.id;
      if (!videoId) return;
      
      const title = cleanTitle(item.title);
      const displayTitle = title.length > 40 ? title.slice(0, 37) + "..." : title;

      buttons.push([
        Markup.button.callback(
          isMusic ? `🎵 ${displayTitle}` : `🎬 ${displayTitle}`, 
          `dl_${isMusic ? 'm' : 'v'}_${videoId}`
        )
      ]);
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Topilgan natijalar. Yuklab olish uchun ustiga bosing:", Markup.inlineKeyboard(buttons));

  } catch (err) {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruv tizimida uzilish bo'ldi. Qayta urinib ko'ring.");
  }
}

// ================= ⚡️ 5 SONIYALIK ULTRA TEZKOR YUKLOVCHI =================
async function fastDownloadEngine(ctx, targetUrl, isAudio = false) {
  const waiting = await ctx.reply("⏳ 5 soniyada tayyorlanmoqda...").catch(() => null);
  const url = cleanUrl(targetUrl);

  try {
    let apiEndpoint = "";
    if (url.includes("instagram.com") || url.includes("tiktok.com")) {
      apiEndpoint = `https://api.sandipbaruwal.com/insta/download?url=${encodeURIComponent(url)}`;
    } else {
      apiEndpoint = `https://api.cobalt.tools/api/json`;
    }

    if (url.includes("instagram.com") || url.includes("tiktok.com")) {
      const res = await axios.get(apiEndpoint, { timeout: 7000 });
      const directUrl = res.data?.data?.[0]?.url;

      if (directUrl) {
        if (isAudio) await ctx.replyWithAudio({ url: directUrl }).catch(() => {});
        else await ctx.replyWithVideo({ url: directUrl }, { caption: "🎬 @SizningBotiz" }).catch(() => {});
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } else {
      // YouTube/Treylerlar uchun ultra tezkor Cobalt yuklagich
      const res = await axios.post(apiEndpoint, {
        url: url,
        isAudioOnly: isAudio,
        aFormat: "mp3",
        vQuality: "720"
      }, {
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        timeout: 8000
      });

      if (res.data && res.data.url) {
        if (isAudio) {
          await ctx.replyWithAudio({ url: res.data.url }).catch(() => {});
        } else {
          await ctx.replyWithVideo({ url: res.data.url }, { caption: "🎬 Treyler tayyor! @SizningBotiz" }).catch(() => {});
        }
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    }
    
    throw new Error("Tezkor shlyuz javob bermadi");

  } catch (error) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Zaxira tarmoq ulanmoqda...").catch(() => {});
      const backupRes = await axios.get(`https://co.wuk.sh/api/json?url=${encodeURIComponent(url)}`);
      if (backupRes.data && backupRes.data.url) {
        if (isAudio) await ctx.replyWithAudio({ url: backupRes.data.url });
        else await ctx.replyWithVideo({ url: backupRes.data.url }, { caption: "🎬 @SizningBotiz" });
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (e) {}

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Kechirasiz, yuklash amalga oshmadi. Link noto'g'ri yoki yuklash limiti tugagan.").catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Treyler) qidirish" || text === "🎵 Musiqa qidirish") return;

  // Havolalarni formatlashga o'tkazish
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  // Aqlli Qidiruv algoritmi
  if (!ctx.session.mode) ctx.session.mode = "music";
  
  // Agar foydalanuvchi kino rejimida bo'lsa, so'rov oxiriga "trailer" so'zi qo'shiladi
  const searchQuery = ctx.session.mode === "movie" ? `${text} official trailer` : text;
  await searchYouTube(ctx, searchQuery);
});

// ================= BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan. Linkni qayta yuboring.");
    await fastDownloadEngine(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    await fastDownloadEngine(ctx, `https://youtube.com/watch?v=${ctx.match[2]}`, ctx.match[1] === "m");
  } catch (e) {}
});

// ================= START BOT =================
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 MOVIE & MUSIC ULTRA ENGINE READY!"))
  .catch((err) => console.error("Launch Error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));