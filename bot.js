require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ytSearch = require("yt-search");
const youtubedl = require("youtube-dl-exec");
const ffmpegStatic = require("ffmpeg-static");

const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 High-Speed Internal Engine Active"));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ================= MONGOOSE DATABASE =================
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI).catch((err) => console.log("🍃 DB Error:", err.message));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]
]).resize();

const adminMenu = Markup.keyboard([
  ["📊 Statistika", "📢 Xabar yuborish"],
  ["⬅️ Bosh menyu"]
]).resize();

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
      { 
        username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", 
        firstName: ctx.from.first_name || "Ismsiz" 
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (e) {}

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
      return ctx.reply("📊 <b>Bot statistikasi:</b>\n\nHozircha obunachilar macrosi mavjud emas.", { parse_mode: "HTML" });
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
      const cleanAuthor = (video.author?.name || "YouTube").replace(/[<>:"/\\|?*]/g, "").trim();
      
      const trackKey = crypto.randomUUID().slice(0, 8);
      ctx.session[trackKey] = {
        id: video.videoId,
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

// ================= INTERNAL YT-DLP CORE DOWNLOAD ENGINE (API-SIZ VARIANT) =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "", customPerformer = "") {
  const waiting = await ctx.reply("⚡ Server ichida yuklash boshlandi. Biroz kuting...").catch(() => null);
  
  let videoTitle = customTitle;
  let performerName = customPerformer;
  const fileId = crypto.randomUUID().slice(0, 8);
  
  // Vaqtinchalik fayllar uchun yo'llar
  const outputPattern = path.join(__dirname, `media_${fileId}.%(ext)s`);
  const finalPath = path.join(__dirname, `media_${fileId}.${isAudio ? 'mp3' : 'mp4'}`);

  // Agar havola orqali kelgan bo'lsa va nomi yo'q bo'lsa, qidirib aniqlaymiz
  if (!videoTitle && (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be"))) {
    try {
      const searchResults = await ytSearch(targetUrl);
      if (searchResults && searchResults.title) {
        videoTitle = searchResults.title.replace(/[<>:"/\\|?*]/g, "").trim();
        performerName = searchResults.author?.name || "YouTube Player";
      }
    } catch (e) {}
  }

  if (!videoTitle) videoTitle = targetUrl.includes("tiktok.com") ? "TikTok Media" : targetUrl.includes("instagram.com") ? "Instagram Reel" : "Requested Track";
  if (!performerName) performerName = "Audio Downloader";

  try {
    // yt-dlp sozlamalari (Tashqi API mutlaqo ishlatilmaydi, hammasi serverni o'zida bajariladi)
    const dlOptions = isAudio ? {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '0', // Eng yuqori sifat
      ffmpegLocation: ffmpegStatic,
      output: outputPattern,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true
    } : {
      format: 'mp4',
      ffmpegLocation: ffmpegStatic,
      output: outputPattern,
      noCheckCertificates: true,
      noWarnings: true
    };

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Kontent yuklab olinmoqda va formatlanmoqda...").catch(() => {});

    // yt-dlp ni ishga tushiramiz
    await youtubedl(targetUrl, dlOptions);

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📤 Telegram pleyeriga yuborilmoqda...").catch(() => {});

    // Telegramga jismoniy faylni yuborish
    if (isAudio) {
      await ctx.replyWithAudio(
        { source: finalPath, filename: `${videoTitle}.mp3` },
        { title: videoTitle, performer: performerName }
      );
    } else {
      await ctx.replyWithVideo(
        { source: finalPath },
        { caption: `🎬 <b>${videoTitle}</b>\n\n📥 @${ctx.botInfo.username} orqali yuklandi`, parse_mode: "HTML" }
      );
    }

  } catch (err) {
    console.error("Yt-dlp yuklash xatosi:", err.message);
    if (waiting) {
      await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `❌ <b>Yuklab olish imkoni bo'lmadi!</b>\n\nHavola noto'g'ri yoki ushbu kontent yosh chekloviga ega yoki muallif tomonidan bloklangan.`, { parse_mode: "HTML" }).catch(() => {});
    }
  } finally {
    // Kesh va vaqtinchalik o'lik fayllarni diskdan o'chirish
    try {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      // Ba'zida boshqa formatda qolib ketgan fayllar bo'lsa ham tozalaydi
      const origMp4 = path.join(__dirname, `media_${fileId}.mp4`);
      if (fs.existsSync(origMp4)) fs.unlinkSync(origMp4);
    } catch (e) {}
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
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
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    
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
    if (!url) return ctx.reply("❌ Seans muddati tugagan, iltimos havolani qayta yuboring.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const isAudio = ctx.match[1] === "m";
    const trackKey = ctx.match[2]; 
    
    const trackData = ctx.session[trackKey];
    if (!trackData) {
      return ctx.reply("❌ Qidiruv seansi muddati tugagan. Iltimos, qaytadan yozib qidiring.");
    }

    const fullYoutubeUrl = `https://www.youtube.com/watch?v=${trackData.id}`;
    await downloadAndSend(ctx, fullYoutubeUrl, isAudio, trackData.title, trackData.performer);
  } catch (e) {
    console.error("Tugma boshqaruv xatosi:", e.message);
  }
});

bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 INTERNAL YT-DLP ENGINE ONLINE!"))
  .catch((err) => console.error(err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));