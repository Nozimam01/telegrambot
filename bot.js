require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const youtubesearchapi = require("youtube-search-api");

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 Immortal Hybrid Engine Online"));
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

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]
]).resize();

// ================= COMMANDS =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Tizim to'liq gibrid (Tezkor + Barqaror) rejimga o'tkazildi. Havola yuboring yoki qidiruvdan foydalaning:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino yoki treyler nomini yozing:");
});

function cleanTitle(title) {
  if (!title) return "Media";
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

// ================= YOUTUBE QIDIRUV TIZIMI =================
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
          isMusic ? `🎵 ${displayTitle}` : `🎥 ${displayTitle}`, 
          `dl_${isMusic ? 'm' : 'v'}_${videoId}`
        )
      ]);
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Topilgan natijalar. Yuklab olish uchun tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruv xizmatida vaqtincha uzilish. Havola yuborib ko'ring.");
  }
}

// ================= GIBRID YUKLOVCHI MOTOR (TEZKOR + LOCAL YT-DLP) =================
function runLocalDl(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function downloadAndSend(ctx, targetUrl, isAudio = false) {
  const waiting = await ctx.reply("⏳ Fayl tayyorlanmoqda (Ultra-Speed)...").catch(() => null);
  const url = cleanUrl(targetUrl);

  // --- 1-BOSQICH: ULTRA TEZKOR APILAR ORQALI SINASH (5 SONIYA) ---
  try {
    if (url.includes("instagram.com") || url.includes("tiktok.com")) {
      const res = await axios.get(`https://api.sandipbaruwal.com/insta/download?url=${encodeURIComponent(url)}`, { timeout: 7000 });
      const directUrl = res.data?.data?.[0]?.url;
      if (directUrl) {
        if (isAudio) await ctx.replyWithAudio({ url: directUrl }).catch(() => {});
        else await ctx.replyWithVideo({ url: directUrl }).catch(() => {});
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } else {
      const res = await axios.post(`https://api.cobalt.tools/api/json`, {
        url: url, isAudioOnly: isAudio, aFormat: "mp3", vQuality: "720"
      }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 7000 });

      if (res.data && res.data.url) {
        if (isAudio) await ctx.replyWithAudio({ url: res.data.url }).catch(() => {});
        else await ctx.replyWithVideo({ url: res.data.url }).catch(() => {});
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    }
  } catch (fastApiError) {
    console.log("Tezkor shlyuzda cheklov. Lokal dvigatel (yt-dlp) ishga tushirildi...");
  }

  // --- 2-BOSQICH: ZAXIRA LOKAL YT-DLP CORE (LIMITSIZ VA REJALI) ---
  if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Tarmoq band. Server orqali yuklanmoqda...").catch(() => {});
  
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);

  try {
    let command = isAudio 
      ? `yt-dlp --no-playlist --no-check-certificates --no-warnings -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`
      : `yt-dlp --no-playlist --no-check-certificates --no-warnings -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${outputTemplate}" "${url}"`;

    await runLocalDl(command);

    const files = fs.readdirSync(__dirname);
    const downloadedFile = files.find(f => f.startsWith(`media_${fileId}`));

    if (downloadedFile) {
      const finalPath = path.join(__dirname, downloadedFile);
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga uzatilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      } else {
        await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Medianingiz tayyor!" });
      }
      fs.unlinkSync(finalPath);
    } else {
      throw new Error("Fayl serverda saqlanmadi.");
    }
  } catch (error) {
    console.error("Gibrid yuklash xatosi:", error.message);
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Kechirasiz, ushbu faylni yuklab bo'lmadi. Havola o'chirilgan yoki yopiq profil.").catch(() => {});
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Treyler) qidirish" || text === "🎵 Musiqa qidirish") return;

  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) ctx.session.mode = "music";
  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan. Havolani qayta yuboring.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    await downloadAndSend(ctx, `https://youtube.com/watch?v=${ctx.match[2]}`, ctx.match[1] === "m");
  } catch (e) {}
});

// ================= SAFE START BOT =================
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 IMMORTAL GIBRID BOT READY!"))
  .catch((err) => console.error("Launch Error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));