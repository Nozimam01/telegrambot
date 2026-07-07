require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const ytSearch = require("yt-search");

const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 High-Speed Bot Engine Active"));
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
        url: video.url,
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

function runLocalDl(command) {
  const localBin = path.join(__dirname, 'bin');
  const env = { ...process.env, PATH: `${process.env.PATH}:${localBin}` };
  return new Promise((resolve, reject) => {
    exec(command, { env }, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

// ================= UNIVERSAL PLATFORM DOWNLOAD ENGINE =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "", customPerformer = "") {
  const waiting = await ctx.reply("⏳ Yuklanmoqda, iltimos kuting...").catch(() => null);
  let url = targetUrl;
  
  let videoTitle = customTitle;
  let performerName = customPerformer;

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isTikTok = url.includes("tiktok.com");
  const isInstagram = url.includes("instagram.com");

  // ================= 1. INSTAGRAM ENGINES =================
  if (isInstagram) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Instagram kanali tahlil qilinmoqda...").catch(() => {});
      const instaApiUrl = `https://api.sandros.xyz/instagram?url=${encodeURIComponent(url)}`;
      const res = await axios.get(instaApiUrl, { timeout: 10000 });

      if (res.data && res.data.url) {
        const fileId = crypto.randomUUID().slice(0, 8);
        const ext = isAudio ? "mp3" : "mp4";
        const finalPath = path.join(__dirname, `media_${fileId}.${ext}`);

        const writer = fs.createWriteStream(finalPath);
        const response = await axios({ url: res.data.url, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);

        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        if (isAudio) {
          await ctx.replyWithAudio({ source: finalPath }, { title: "Instagram Audio", performer: "Instagram", filename: `insta_${fileId}.mp3` });
        } else {
          await ctx.replyWithVideo({ source: finalPath }, { caption: `🎬 <b>Instagram Media</b>\n\n📥 @${ctx.botInfo.username} orqali yuklandi`, parse_mode: "HTML" });
        }

        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (apiErr) {
      console.log("Instagram API muqobil kanali ishlamadi.");
    }
  }

  // YouTube sarlavhalarini tekshirish
  if (!videoTitle && isYouTube) {
    try {
      const urlObj = new URL(targetUrl);
      if (urlObj.searchParams.has("list")) {
        urlObj.searchParams.delete("list");
        urlObj.searchParams.delete("index");
        url = urlObj.toString();
      }
      const searchResults = await ytSearch(url);
      if (searchResults && searchResults.title) {
        videoTitle = searchResults.title.replace(/[<>:"/\\|?*]/g, "").trim();
        performerName = searchResults.author?.name || "YouTube Player";
      }
    } catch (e) {}
  }

  const fileId = crypto.randomUUID().slice(0, 8);
  const ext = isAudio ? "mp3" : "mp4";
  const finalPath = path.join(__dirname, `media_${fileId}.${ext}`);
  let successDownload = false;

  // ================= 2. YANGILANGAN COBALT API TIZIMI (YouTube va TikTok uchun) =================
  if (!isInstagram) {
    const cobaltMirrors = [
      "https://api.cobalt.tools/api/json",
      "https://cobalt.api.red.velvet.club/api/json",
      "https://co.wuk.sh/api/json",
      "https://api.co.wuk.sh/api/json"
    ];

    for (const mirror of cobaltMirrors) {
      if (successDownload) break;
      try {
        if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Tezkor server yuklamoqda...").catch(() => {});
        
        const res = await axios.post(mirror, {
          url: url,
          isAudioOnly: isAudio,
          aFormat: "mp3",
          vQuality: "720"
        }, {
          headers: { 
            "Accept": "application/json", 
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          },
          timeout: 12000
        });

        if (res.data && res.data.url) {
          if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Telegramga uzatilmoqda...").catch(() => {});
          
          if (!videoTitle) videoTitle = res.data.filename ? res.data.filename.replace(/\.[^/.]+$/, "").replace(/[<>:"/\\|?*]/g, "").trim() : "Social Video";
          if (!performerName) performerName = isTikTok ? "TikTok" : "Media Bot";

          const writer = fs.createWriteStream(finalPath);
          const response = await axios({ url: res.data.url, method: 'GET', responseType: 'stream' });
          response.data.pipe(writer);

          await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

          if (isAudio) {
            await ctx.replyWithAudio({ source: finalPath }, { title: videoTitle, performer: performerName, filename: `${videoTitle}.mp3` });
          } else {
            await ctx.replyWithVideo({ source: finalPath }, { caption: `🎬 <b>${videoTitle}</b>\n\n📥 @${ctx.botInfo.username} orqali yuklandi`, parse_mode: "HTML" });
          }

          if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
          successDownload = true;
          if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
          return;
        }
      } catch (err) {
        console.log(`Mirror xatosi (${mirror}):`, err.message);
      }
    }
  }

  // ================= 3. ZAXIRA YT-DLP CORE TIZIMI =================
  if (!successDownload) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Zaxira algoritmi tekshirilmoqda...").catch(() => {});
      const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);
      
      let command = isAudio 
        ? `yt-dlp --no-playlist --no-check-certificates --no-warnings -x --audio-format mp3 -o "${outputTemplate}" "${url}"`
        : `yt-dlp --no-playlist --no-check-certificates --no-warnings -f "b[ext=mp4]/bv*+ba/b" -o "${outputTemplate}" "${url}"`;

      await runLocalDl(command);
      const files = fs.readdirSync(__dirname);
      const downloadedFile = files.find(f => f.startsWith(`media_${fileId}`));

      if (downloadedFile) {
        const localPath = path.join(__dirname, downloadedFile);
        
        if (!videoTitle) videoTitle = isTikTok ? "TikTok Media" : isInstagram ? "Instagram Media" : "Musiqa";
        if (!performerName) performerName = "Media Downloader";

        if (isAudio) {
          await ctx.replyWithAudio({ source: localPath }, { title: videoTitle, performer: performerName, filename: `${videoTitle}.mp3` });
        } else {
          await ctx.replyWithVideo({ source: localPath }, { caption: `🎬 <b>${videoTitle}</b>\n\n📥 @${ctx.botInfo.username} orqali yuklandi`, parse_mode: "HTML" });
        }
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (error) {
      console.log("yt-dlp zaxira algoritmi to'liq bloklangan.");
    }
  }

  if (waiting) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      waiting.message_id, 
      null, 
      `❌ <b>Yuklab bo'lmadi!</b>\n\nIjtimoiy tarmoq xavfsizlik tizimi hostingimiz IP manzilini vaqtincha bot tekshiruvi (Captha) tufayli blokladi.\n\n💡 <b>Yechim:</b> Pastdagi tugmalardan foydalanib qo'shiq yoki kino nomini matn ko'rinishida yozib yuboring, bot ichki qidiruv orqali uni 100% yuklab beradi!`, 
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

bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 ULTRA-SPEED ENGINE ONLINE!"))
  .catch((err) => console.error(err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));