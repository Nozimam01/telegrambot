const { Telegraf, Markup } = require("telegraf");
const mongoose = require("mongoose");
const ytSearch = require("youtube-search-api");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ================= KONFIGURATSIYA VA ENV =================
const BOT_TOKEN = process.env.BOT_TOKEN || "BOT_TOKENINI_SHUYERGA_YOZING";
const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 123456789; // O'zingizning Telegram ID'ingiz
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/mediabot";

const bot = new Telegraf(BOT_TOKEN);

// ================= MONGOOSE BAZA MODELI =================
mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB muvaffaqiyatli ulandi!"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err.message));

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// ================= TELEGRAF SESSION INTEGRATSIYASI =================
// Sodda xotira (In-memory) seans mexanizmi
const sessions = {};
bot.use((ctx, next) => {
  if (!ctx.from) return next();
  const id = ctx.from.id;
  if (!sessions[id]) sessions[id] = {};
  ctx.session = sessions[id];
  return next();
});

// ================= MENYULAR (KEYBOARDS) =================
const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"],
]).resize();

const adminMenu = Markup.keyboard([
  ["📊 Statistika", "📢 Xabar yuborish"],
  ["⬅️ Bosh menyu"]
]).resize();

// Yordamchi funksiya: HTML xatoliklarni oldini olish uchun
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ================= BOT BUYRUQLARI (COMMANDS) =================
bot.start(async (ctx) => {
  ctx.session = {};
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { 
        username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", 
        firstName: ctx.from.first_name || "Ismsiz" 
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (e) {
    console.error("Foydalanuvchini bazaga yozishda xato:", e.message);
  }

  let text = "🚀 Bot muvaffaqiyatli ishga tushdi.\n\nHavola yuboring yoki pastdagi menyudan foydalanib qo'shiq/kino nomini yozing:";
  if (ctx.from.id === ADMIN_ID) {
    text += "\n\n👨‍💻 Admin panel: /admin";
  }
  ctx.reply(text, mainMenu);
});

bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Bu buyruq faqat bot admini uchun!");
  ctx.reply("👨‍💻 Admin panel:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => {
  ctx.reply("Bosh menyu:", mainMenu);
});

bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const waiting = await ctx.reply("📊 Ma'lumotlar yig'ilmoqda...").catch(() => null);
  try {
    const users = await User.find().sort({ date: -1 });
    const count = users.length;
    if (count === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("📊 <b>Bot statistikasi:</b>\n\nHozircha obunachilar bazasi mavjud emas.", { parse_mode: "HTML" });
    }
    let report = `📊 <b>BOT STATISTIKASI</b>\n👥 Jami obunachilar: <b>${count} ta</b>\n\n📋 <b>Foydalanuvchilar ro'yxati:</b>\n`;
    users.forEach((user, index) => {
      report += `${index + 1}. 👤 <b>${escapeHTML(user.firstName)}</b> — ${escapeHTML(user.username)} (ID: <code>${user.telegramId}</code>)\n`;
    });
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    if (report.length > 4000) {
      const chunks = report.match(/[\s\S]{1,4000}/g);
      for (const chunk of chunks) await ctx.reply(chunk, { parse_mode: "HTML" }).catch(() => {});
    } else {
      await ctx.reply(report, { parse_mode: "HTML" }).catch(() => {});
    }
  } catch (error) {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Statistika yuklashda xatolik yuz berdi.");
  }
});

bot.hears("📢 Xabar yuborish", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.session.adminMode = "send_post";
  ctx.reply("📢 Barcha obunachilarga yuboriladigan xabar matnini kiriting:");
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino yoki treyler nomini yozing:");
});

// ================= YOUTUBE QIDIRUV TIZIMI =================
async function searchYouTubeLive(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  try {
    const searchResults = await ytSearch.GetListByKeyword(query, false, 5);
    const videos = searchResults.items ? searchResults.items.slice(0, 5) : [];

    if (!videos || videos.length === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕.");
    }

    const isMusic = ctx.session.mode === "music";
    const buttons = [];

    videos.forEach((video) => {
      const cleanTitle = video.title ? video.title.replace(/[<>:"/\\|?*]/g, "").trim() : "Media";
      const cleanAuthor = (video.username || "YouTube").replace(/[<>:"/\\|?*]/g, "").trim();
      
      const trackKey = crypto.randomUUID().slice(0, 8);
      ctx.session[trackKey] = {
        url: `https://www.youtube.com/watch?v=${video.id}`,
        title: cleanTitle,
        performer: cleanAuthor
      };

      const displayTitle = cleanTitle.length > 35 ? cleanTitle.slice(0, 32) + "..." : cleanTitle;
      const emoji = isMusic ? "🎵" : "🎬";
      
      buttons.push([Markup.button.callback(`${emoji} ${displayTitle}`, `dl_${isMusic ? 'm' : 'v'}_${trackKey}`)]);
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Topilgan natijalar:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruv amalga oshmadi.");
  }
}

// ================= UNIVERSAL RAPIDAPI DOWNLOAD ENGINE =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "", customPerformer = "") {
  const waiting = await ctx.reply("⏳ Sifatli server ulanmoqda, iltimos kuting...").catch(() => null);
  let url = targetUrl;
  
  let videoTitle = customTitle;
  let performerName = customPerformer;

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isTikTok = url.includes("tiktok.com");
  const isInstagram = url.includes("instagram.com");

  // YouTube havola ma'lumotlarini qidirish
  if (!videoTitle && isYouTube) {
    try {
      const urlObj = new URL(targetUrl);
      if (urlObj.searchParams.has("list")) {
        urlObj.searchParams.delete("list");
        urlObj.searchParams.delete("index");
        url = urlObj.toString();
      }
      const searchResults = await ytSearch.GetListByKeyword(url, false, 1);
      if (searchResults && searchResults.items && searchResults.items[0]) {
        videoTitle = searchResults.items[0].title.replace(/[<>:"/\\|?*]/g, "").trim();
        performerName = searchResults.items[0].username || "YouTube Player";
      }
    } catch (e) {}
  }

  const fileId = crypto.randomUUID().slice(0, 8);
  const ext = isAudio ? "mp3" : "mp4";
  const finalPath = path.join(__dirname, `media_${fileId}.${ext}`);

  // ================= PROFESSIONAL RAPIDAPI ENGINE =================
  if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_HOST) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Premium kanal orqali yuklanmoqda...").catch(() => {});
      
      const options = {
        method: 'GET',
        url: `https://${process.env.RAPIDAPI_HOST}/api/video/download`,
        params: { url: url },
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': process.env.RAPIDAPI_HOST
        },
        timeout: 20000
      };

      const res = await axios.request(options);
      
      let directDownloadUrl = null;
      if (res.data && res.data.url) directDownloadUrl = res.data.url;
      else if (res.data && res.data.links && res.data.links[0]) directDownloadUrl = res.data.links[0].url;
      else if (res.data && res.data.data && res.data.data.video) directDownloadUrl = res.data.data.video;

      if (directDownloadUrl) {
        if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Telegram ekotizimiga yuklanmoqda...").catch(() => {});
        
        if (!videoTitle) videoTitle = isTikTok ? "TikTok Media" : isInstagram ? "Instagram Reel" : "Social Video";
        if (!performerName) performerName = "Media Bot";

        const writer = fs.createWriteStream(finalPath);
        const response = await axios({ url: directDownloadUrl, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);

        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        if (isAudio) {
          await ctx.replyWithAudio({ source: finalPath }, { title: videoTitle, performer: performerName, filename: `${videoTitle}.mp3` });
        } else {
          await ctx.replyWithVideo({ source: finalPath }, { caption: `🎬 <b>${videoTitle}</b>\n\n📥 @${ctx.botInfo.username} orqali yuklandi`, parse_mode: "HTML" });
        }

        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (rapidErr) {
      console.log("RapidAPI premium kanali xatosi:", rapidErr.message);
    }
  }

  // Agar RapidAPI ishlamasa muqobil ogohlantirish texti
  if (waiting) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      waiting.message_id, 
      null, 
      `❌ <b>Yuklab olish imkoni bo'lmadi!</b>\n\nUshbu ijtimoiy tarmoq xavfsizlik tizimi vaqtincha hosting serverimiz IP manzilini bloklab qo'ydi.\n\n💡 <b>Siz uchun 100% ishlaydigan ajoyib yechim:</b> Pastdagi tugmalardan foydalanib o'zingizga kerakli qo'shiq yoki kino nomini shunchaki matn ko'rinishida yozib yuboring (Masalan: <i>Yulduz Usmonova - Muhabbat</i>). Bot uni ichki qidiruv tizimi orqali sizga 100% muammosiz topib va yuklab beradi!`, 
      { parse_mode: "HTML" }
    ).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("message", async (ctx) => {
  if (ctx.from.id === ADMIN_ID && ctx.session.adminMode === "send_post") {
    ctx.session.adminMode = null;
    const users = await User.find();
    ctx.reply(`📢 Reklama tarqatilmoqda...`);
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

  if (/https?:\/\//.test(text)) {
    let cleanUrl = text;
    
    if (cleanUrl.includes("instagram.com")) {
      try {
        const urlObj = new URL(cleanUrl);
        cleanUrl = urlObj.origin + urlObj.pathname;
      } catch (e) {}
    }

    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = cleanUrl;
    
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
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
    if (!url) return ctx.reply("❌ Seans muddati tugagan.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const trackData = ctx.session[ctx.match[2]];
    if (!trackData) return ctx.reply("❌ Qidiruv seansi muddati tugagan. Iltimos, qaytadan qidiring.");
    await downloadAndSend(ctx, trackData.url, ctx.match[1] === "m", trackData.title, trackData.performer);
  } catch (e) {}
});

// ================= BOT SYSTEM START =================
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 ULTRA-SPEED PREMIUM ENGINE ONLINE!"))
  .catch((err) => console.error(err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));