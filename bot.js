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

// ⚠️ DIQQAT: Bu yerga o'zingizning Telegram ID raqamingizni yozing!
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) :8125836834; 

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 Ultra Stable Engine with Admin Panel Online"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ================= MONGOOSE DATABASE =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).catch(() => console.log("🍃 DB Offline rejimda"));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Nozima" },
  date: { type: Date, default: Date.now }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

// Klaviaturalar
const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]
]).resize();

const adminMenu = Markup.keyboard([
  ["📊 Statistika", "📢 Xabar yuborish"],
  ["⬅️ Bosh menyu"]
]).resize();

// ================= COMMANDS =================
bot.start(async (ctx) => {
  ctx.session = {};
  
  // Foydalanuvchini bazaga qo'shish
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { username: ctx.from.username || "Mavjud emas", firstName: ctx.from.first_name || "Nozima" },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.error("Bazaga yozishda xato:", e.message);
  }

  let text = "🚀 Tizim to'liq gibrid rejimda ishlamoqda. Havola yuboring yoki pastdagi qidiruvdan foydalaning:";
  if (ctx.from.id === ADMIN_ID) {
    text += "\n\n👨‍💻 Admin aniqlandi! Panelga kirish uchun /admin buyrug'ini yozing.";
  }
  ctx.reply(text, mainMenu);
});

// Admin panel buyrug'i
bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Bu buyruq faqat bot admini uchun!");
  ctx.reply("👨‍💻 Admin paneliga xush kelibsiz! Kerakli bo'limni tanlang:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => {
  ctx.reply("Bosh menyuga qaytdingiz:", mainMenu);
});

// Statistika: nechta obunachi borligini ko'rish
bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const count = await User.countDocuments();
  ctx.reply(`📊 *Bot statistikasi:*\n\n👥 Jami obunachilar soni: *${count} ta*`, { parse_mode: "Markdown" });
});

// Xabar yuborish rejimi
bot.hears("📢 Xabar yuborish", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.session.adminMode = "send_post";
  ctx.reply("📢 Barcha obunachilarga yuboriladigan xabar matnini (yoki rasm, video) kiriting:");
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

// ================= MULTI-API SMART DOWNLOAD ENGINE =================
function runLocalDl(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function downloadAndSend(ctx, targetUrl, isAudio = false) {
  const waiting = await ctx.reply("⏳ 5 soniyada tayyorlanmoqda...").catch(() => null);
  const url = cleanUrl(targetUrl);

  if (url.includes("instagram.com") || url.includes("tiktok.com")) {
    try {
      const res = await axios.get(`https://api.sandipbaruwal.com/insta/download?url=${encodeURIComponent(url)}`, { timeout: 6000 });
      const directUrl = res.data?.data?.[0]?.url;
      if (directUrl) {
        if (isAudio) await ctx.replyWithAudio({ url: directUrl }).catch(() => {});
        else await ctx.replyWithVideo({ url: directUrl }).catch(() => {});
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (e) {}

    try {
      const res = await axios.post(`https://api.cobalt.tools/api/json`, {
        url: url, isAudioOnly: isAudio, vQuality: "720"
      }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 6000 });
      
      if (res.data && res.data.url) {
        if (isAudio) await ctx.replyWithAudio({ url: res.data.url }).catch(() => {});
        else await ctx.replyWithVideo({ url: res.data.url }).catch(() => {});
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (e) {}

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Ushbu videoni yuklab bo'lmadi (Profil yopiq yoki havola xato).").catch(() => {});
    return;
  }

  try {
    const res = await axios.post(`https://api.cobalt.tools/api/json`, {
      url: url, isAudioOnly: isAudio, aFormat: "mp3", vQuality: "720"
    }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 6000 });

    if (res.data && res.data.url) {
      if (isAudio) await ctx.replyWithAudio({ url: res.data.url }).catch(() => {});
      else await ctx.replyWithVideo({ url: res.data.url }).catch(() => {});
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (fastApiError) {}

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
      
      if (isAudio) await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      else await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Tayyor!" });
      fs.unlinkSync(finalPath);
    } else {
      throw new Error("Fayl topilmadi");
    }
  } catch (error) {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Yuklash imkoni bo'lmadi.").catch(() => {});
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("message", async (ctx) => {
  // Xabar yuborish funksiyasi (Admin uchun)
  if (ctx.from.id === ADMIN_ID && ctx.session.adminMode === "send_post") {
    ctx.session.adminMode = null;
    const users = await User.find();
    ctx.reply(`📢 Reklama tarqatilmoqda... Jami obunachilar: ${users.length} ta.`);
    
    let success = 0;
    for (const user of users) {
      try {
        await ctx.telegram.copyMessage(user.telegramId, ctx.chat.id, ctx.message.message_id);
        success++;
      } catch (err) {}
    }
    return ctx.reply(`✅ Reklama tarqatildi! Yuklandi: ${success}/${users.length} foydalanuvchiga.`);
  }

  // Agar matn bo'lmasa pastga o'tkazmaymiz
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

// ================= START BOT =================
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 BOT IS RUNNING WITH ADMIN PANEL!"))
  .catch((err) => console.error("Launch Error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));