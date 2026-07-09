require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { session } = require("telegraf-session-mongodb"); 
const { MongoClient } = require("mongodb"); 
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ytSearch = require("yt-search");
const axios = require("axios");

// ================= ENVIRONMENT VARIABLES (ENV) =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 
const MONGO_URI = process.env.MONGO_URI; 
const PORT = process.env.PORT || 4000;

// Adminlar ro'yxati
const EXTRA_ADMINS = [
  process.env.ADMIN1, 
  process.env.ADMIN2, 
  process.env.ADMIN3
].filter(Boolean);

// YouTube Cookie drayveri
const YT_COOKIES = process.env.YT_COOKIES_STRING ? process.env.YT_COOKIES_STRING.replace(/\s+/g, ' ').trim() : "";

if (!BOT_TOKEN || !MONGO_URI) {
  console.error("❌ XATOLIK: .env faylida BOT_TOKEN yoki MONGO_URI xato yoki kiritilmagan!");
  process.exit(1);
}

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 Ultimate Stable Engine Active"));
app.listen(PORT, () => console.log(`🚀 Server fully connected to port ${PORT}`));

// ================= MONGOOSE DATABASE =================
mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB muvaffaqiyatli ulandi!"))
  .catch((err) => console.log("🍃 Database Error:", err.message));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9000000 });
const client = new MongoClient(MONGO_URI);
const db = client.db(); 
bot.use(session(db, { collectionName: "telegraf_sessions" }));

const mainMenu = Markup.keyboard([["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]]).resize();
const adminMenu = Markup.keyboard([["📊 Statistika", "📢 Xabar yuborish"], ["⬅️ Bosh menyu"]]).resize();

function isAdmin(ctx) {
  if (ctx.from.id === ADMIN_ID) return true;
  const username = ctx.from.username ? `@${ctx.from.username}` : "";
  return EXTRA_ADMINS.includes(username) || EXTRA_ADMINS.includes(ctx.from.username);
}

// ================= COMMANDS =================
bot.start(async (ctx) => {
  ctx.session = {};
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", firstName: ctx.from.first_name || "Ismsiz" },
      { upsert: true }
    );
  } catch (e) {}
  let text = "🚀 Bot muvaffaqiyatli ishga tushdi. Havola (YouTube, Instagram, TikTok) yuboring yoki nomini yozib qidiring:";
  if (isAdmin(ctx)) text += "\n\n👨‍💻 Admin panel buyrug'i: /admin";
  ctx.reply(text, mainMenu);
});

bot.command("admin", (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.reply("👨‍💻 Admin panel:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => ctx.reply("Bosh menyu:", mainMenu));

bot.hears("📊 Statistika", async (ctx) => {
  if (!isAdmin(ctx)) return;
  const count = await User.countDocuments();
  ctx.reply(`📊 Jami obunachilar soni: <b>${count} ta</b>`, { parse_mode: "HTML" });
});

bot.hears("📢 Xabar yuborish", (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session.adminMode = "send_post";
  ctx.reply("📢 Barcha obunachilarga yuboriladigan xabar matnini (yoki media faylni) kiriting:");
});

bot.hears("🎵 Musiqa qidirish", (ctx) => { ctx.session.mode = "music"; ctx.reply("🎵 Qo'shiq nomini yozing:"); });
bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => { ctx.session.mode = "movie"; ctx.reply("🎬 Kino nomini yozing:"); });

// ================= YOUTUBE INTERNAL QIDIRUV =================
async function searchYouTubeLive(ctx, query) {
  const waiting = await ctx.reply("🔍 YouTube qidirilmoqda...").catch(() => null);
  try {
    const searchResults = await ytSearch(query);
    const videos = searchResults.videos.slice(0, 5);
    if (!videos || videos.length === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕.");
    }

    const isMusic = ctx.session.mode === "music";
    const buttons = [];

    videos.forEach((video) => {
      const cleanTitle = video.title.replace(/[<>:"/\\|?*]/g, "").trim();
      const trackKey = crypto.randomUUID().slice(0, 8);
      ctx.session[trackKey] = { id: video.videoId, title: cleanTitle };
      const displayTitle = cleanTitle.length > 35 ? cleanTitle.slice(0, 32) + "..." : cleanTitle;
      buttons.push([Markup.button.callback(`${isMusic ? '🎵' : '🎬'} ${displayTitle}`, `dl_${isMusic ? 'm' : 'v'}_${trackKey}`)]);
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Natijalar:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruvda xatolik yuz berdi.");
  }
}

// ================= 2 BOSQICHLI SUG'URTALANGAN YUKLASH TIZIMI =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "") {
  const waiting = await ctx.reply("⚡ Yuklash tayyorlanmoqda...").catch(() => null);
  const fileId = crypto.randomUUID().slice(0, 8);
  const finalPath = path.join(__dirname, `media_${fileId}.${isAudio ? 'mp3' : 'mp4'}`);

  let directDownloadUrl = null;

  // --- 1-BOSQICH: COBALT ENGINE BILAN URINISH ---
  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 1-Drayver: Tahlil qilinmoqda...").catch(() => {});
    
    const cobaltConfig = {
      url: targetUrl,
      videoQuality: "720",
      audioFormat: "mp3",
      filenameStyle: "classic",
      downloadMode: isAudio ? "audio" : "video"
    };

    const cobaltHeaders = { "Accept": "application/json", "Content-Type": "application/json" };
    if (!targetUrl.includes("instagram.com") && !targetUrl.includes("tiktok.com") && YT_COOKIES) {
      cobaltHeaders["Cookie"] = YT_COOKIES;
    }

    const response = await axios.post("https://api.cobalt.tools/api/json", cobaltConfig, { headers: cobaltHeaders, timeout: 20000 });
    directDownloadUrl = response.data.url;
  } catch (e) {
    console.log("Cobalt drayveri o'ta olmadi, 2-Zaxira drayveriga o'tilmoqda...");
  }

  // --- 2-BOSQICH: AGAR COBALT XATO BERSA, CHEKSIZ OPEN-API'GA O'TISH ---
  if (!directDownloadUrl) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 2-Drayver (Zaxira): Oqim yuklanmoqda...").catch(() => {});
      
      // Zaxira universal ijtimoiy tarmoqlar API tarmog'i
      const fallbackRes = await axios.get(`https://api.vkrdown.com/api/download.php?url=${encodeURIComponent(targetUrl)}`, { timeout: 25000 });
      const data = fallbackRes.data;

      if (isAudio) {
        directDownloadUrl = data.audio || (data.data && data.data.audio) || data.url;
      } else {
        directDownloadUrl = data.video || data.url || (data.data && data.data.video);
      }
    } catch (fallbackErr) {
      console.error("Zaxira drayver ham o'ta olmadi:", fallbackErr.message);
    }
  }

  // --- YUKLAB OLISH VA TELEGRAMGA JONATISH BLOCKI ---
  if (!directDownloadUrl) {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ <b>Kechirasiz, yuklab bo'lmadi.</b>\n\nIjtimoiy tarmoq serverlari xavfsizlik tizimini yangilagan yoki havola noto'g'ri. Birozdan so'ng qayta urinib ko'ring.", { parse_mode: "HTML" }).catch(() => {});
    return;
  }

  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Server faylni xotiraga yuklamoqda...").catch(() => {});

    const fileStream = fs.createWriteStream(finalPath);
    const downloadBuffer = await axios.get(directDownloadUrl, { responseType: "stream" });
    downloadBuffer.data.pipe(fileStream);

    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📤 Telegramga uzatilmoqda...").catch(() => {});

    const title = customTitle || "Media_File";
    let sourcePlatform = "Ijtimoiy tarmoq";
    if (targetUrl.includes("instagram.com")) sourcePlatform = "Instagram 📸";
    if (targetUrl.includes("tiktok.com")) sourcePlatform = "TikTok 🎵";
    if (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be")) sourcePlatform = "YouTube 🎬";

    if (isAudio) {
      await ctx.replyWithAudio({ source: finalPath, filename: `${title}.mp3` }, { title: title });
    } else {
      await ctx.replyWithVideo({ source: finalPath }, { caption: `📥 <b>Yuklab olindi!</b>\n\nPlatforma: ${sourcePlatform}\nBot: @${ctx.botInfo.username}`, parse_mode: "HTML" });
    }
  } catch (err) {
    console.error("Uzutilishda xatolik:", err.message);
    if (waiting) await ctx.reply("❌ Faylni Telegramga yuklash jarayonida uzilish sodir bo'ldi.");
  } finally {
    try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch (e) {}
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("message", async (ctx) => {
  ctx.session = ctx.session || {};

  // 📢 JONLI ADMIN REKLAMA TARQATISH TIZIMI
  if (isAdmin(ctx) && ctx.session.adminMode === "send_post") {
    ctx.session.adminMode = null; 
    const users = await User.find();
    ctx.reply(`📢 Reklama ${users.length} ta foydalanuvchiga yuborilmoqda...`);
    
    let success = 0;
    for (const user of users) {
      try {
        await ctx.telegram.copyMessage(user.telegramId, ctx.chat.id, ctx.message.message_id);
        success++;
      } catch (err) {}
    }
    return ctx.reply(`✅ Reklama yakunlandi! Muvaffaqiyatli: ${success}/${users.length}`);
  }

  if (!ctx.message.text) return;
  const text = ctx.message.text.trim();
  
  if (text === "🎬 Kino (Treyler) qidirish" || text === "🎵 Musiqa qidirish" || text === "📊 Statistika" || text === "📢 Xabar yuborish" || text === "⬅️ Bosh menyu") return;

  // 🔗 BARCHA LINKLARDAN MAJBURIY FORMAT SO'RASH
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;

    return ctx.reply("📥 Havola aniqlandi. Yuklamoqchi bo'lgan formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) ctx.session.mode = "music";
  await searchYouTubeLive(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan, havolani qayta yuboring.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const isAudio = ctx.match[1] === "m";
    const trackData = ctx.session[ctx.match[2]];
    if (!trackData) return ctx.reply("❌ Qidiruv muddati tugagan.");
    await downloadAndSend(ctx, `https://www.youtube.com/watch?v=${trackData.id}`, isAudio, trackData.title);
  } catch (e) {}
});

client.connect().then(() => {
  bot.launch({ dropPendingUpdates: true }).then(() => console.log("🔥 THE ABSOLUTE STABLE ENGINE IS ONLINE!"));
});