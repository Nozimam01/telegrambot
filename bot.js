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

const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 
const MONGO_URI = process.env.MONGO_URI;

// 🔑 SIZ TAQDIM ETGAN RAPIDAPI MA'LUMOTLARI
const RAPIDAPI_KEY = "d8d01b8fc7msh4b21e81a8a871bcp1307d7jsnd76c8175e018";
const RAPIDAPI_HOST = "social-media-video-downloader.p.rapidapi.com"; 

if (!MONGO_URI) {
  console.error("❌ XATOLIK: MONGO_URI topilmadi! Platformada uni sozlang.");
  process.exit(1);
}

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 All-In-One Hardcoded RapidAPI Engine Active"));
const PORT = process.env.PORT || 4000; 
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ================= MONGOOSE DATABASE =================
mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 Mongoose ulandi!"))
  .catch((err) => console.log("🍃 Mongoose Error:", err.message));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 9000000 });
const client = new MongoClient(MONGO_URI);
const db = client.db(); 
bot.use(session(db, { collectionName: "telegraf_sessions" }));

const mainMenu = Markup.keyboard([["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]]).resize();
const adminMenu = Markup.keyboard([["📊 Statistika", "📢 Xabar yuborish"], ["⬅️ Bosh menyu"]]).resize();

function escapeHTML(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  let text = "🚀 Bot faol. Istalgan YouTube, Instagram yoki TikTok havolasini yuboring yoki nomini yozib qidiring:";
  if (ctx.from.id === ADMIN_ID) text += "\n\n👨‍💻 Admin panel: /admin";
  ctx.reply(text, mainMenu);
});

bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply("👨‍💻 Admin panel:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => ctx.reply("Bosh menyu:", mainMenu));

bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const count = await User.countDocuments();
  ctx.reply(`📊 Jami obunachilar: <b>${count} ta</b>`, { parse_mode: "HTML" });
});

bot.hears("📢 Xabar yuborish", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.session.adminMode = "send_post";
  ctx.reply("📢 Barcha obunachilarga yuboriladigan xabar matnini kiriting:");
});

bot.hears("🎵 Musiqa qidirish", (ctx) => { ctx.session.mode = "music"; ctx.reply("🎵 Qo'shiq nomini yozing:"); });
bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => { ctx.session.mode = "movie"; ctx.reply("🎬 Kino nomini yozing:"); });

// ================= YOUTUBE QIDIRUV =================
async function searchYouTubeLive(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
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
    ctx.reply("⚠️ Qidiruvda xatolik.");
  }
}

// ================= UNIVERSAL STABLE DOWNLOAD ENGINE =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "") {
  const waiting = await ctx.reply("⚡ Yuklash tayyorlanmoqda...").catch(() => null);
  const fileId = crypto.randomUUID().slice(0, 8);
  const finalPath = path.join(__dirname, `media_${fileId}.${isAudio ? 'mp3' : 'mp4'}`);

  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 RapidAPI orqali media tahlil qilinmoqda...").catch(() => {});

    const options = {
      method: 'GET',
      url: `https://${RAPIDAPI_HOST}/v1/get-video`, 
      params: { url: targetUrl },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      timeout: 40000
    };

    const response = await axios.request(options);
    const resData = response.data;

    // 🧠 RapidAPI javob obyektining ichidan oqim (download link) qidirish algoritmik filtri
    let directDownloadUrl = null;

    if (isAudio) {
      directDownloadUrl = resData.audio_url || resData.audio || (resData.links && resData.links.find(l => l.type === 'audio' || l.quality === 'audio')?.url);
    } else {
      directDownloadUrl = resData.video_url || resData.video || resData.url || (resData.links && resData.links[0]?.url);
    }

    if (!directDownloadUrl && resData.data) {
      directDownloadUrl = isAudio ? resData.data.audio || resData.data.audio_url : resData.data.video || resData.data.video_url || resData.data.url;
    }

    // Agar yuqoridagilardan ham topilmasa, obyekt ichidagi birinchi uchragan urlni olishga urinish
    if (!directDownloadUrl && typeof resData === 'object') {
      const keys = Object.keys(resData);
      for (let key of keys) {
        if (typeof resData[key] === 'string' && resData[key].startsWith('http')) {
          directDownloadUrl = resData[key];
          break;
        }
      }
    }

    if (!directDownloadUrl) {
      throw new Error("RapidAPI javob qaytardi, lekin uning ichidan yuklab olish havolasini (URL) ajratib bo'lmadi.");
    }

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Server faylni xotiraga yuklamoqda...").catch(() => {});

    // Faylni qismlarga bo'lib oqimli yuklab olish
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
      await ctx.replyWithVideo({ source: finalPath }, { caption: `📥 <b>${title}</b>\n\nPlatforma: ${sourcePlatform}\nBot: @${ctx.botInfo.username}`, parse_mode: "HTML" });
    }

  } catch (err) {
    console.error("RapidAPI API muammosi:", err.message);
    if (waiting) {
      await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `❌ <b>RapidAPI xatoligi!</b>\n\n<b>Kalit holati:</b> Kalit qabul qilindi.\n<b>Xato sababi:</b> <code>${err.message}</code>\n\n💡 Agar havola to'g'ri bo'lsa, siz RapidAPI paneldan tanlagan downloader endpoint nomi yoki xostingiz (Host) koddagi xostga mos kelmayapti.`, { parse_mode: "HTML" }).catch(() => {});
    }
  } finally {
    try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch (e) {}
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("message", async (ctx) => {
  ctx.session = ctx.session || {};

  // 📢 ADMIN REKLAMA TIZIMI
  if (ctx.from.id === ADMIN_ID && ctx.session.adminMode === "send_post") {
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
    return ctx.reply(`✅ Reklama tarqatildi! Muvaffaqiyatli: ${success}/${users.length}`);
  }

  if (!ctx.message.text) return;
  const text = ctx.message.text.trim();
  
  if (text === "🎬 Kino (Treyler) qidirish" || text === "🎵 Musiqa qidirish" || text === "📊 Statistika" || text === "📢 Xabar yuborish" || text === "⬅️ Bosh menyu") return;

  // 🔗 BARCHA LINKLAR UCHUN FORMAT SO'RASH BLOCKI
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;

    // Qaysi tarmoq bo'lishidan qat'iy nazar format so'raydi
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
  bot.launch({ dropPendingUpdates: true }).then(() => console.log("🔥 ULTIMATE ENGINE WITH HARDCODED API KEY ONLINE!"));
});