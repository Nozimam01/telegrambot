require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
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

// ================= HIGH-SPEED DOWNLOAD ENGINE =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "", customPerformer = "") {
  const waiting = await ctx.reply("⚡ Qidirilmoqda va tayyorlanmoqda...").catch(() => null);
  let url = targetUrl;
  
  let videoTitle = customTitle;
  let performerName = customPerformer;

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isTikTok = url.includes("tiktok.com");
  const isInstagram = url.includes("instagram.com");

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

  if (!videoTitle) videoTitle = isTikTok ? "TikTok Video" : isInstagram ? "Instagram Media" : "Social Content";
  if (!performerName) performerName = "All-In-One Downloader";

  try {
    // 🚀 ULTRA-SPEED MUQOBIL AUDIO STRATEGEMASI (Faqat musiqani qidirib yuklash uchun eng tezkor yo'l)
    if (isAudio && isYouTube) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Telegram tarmog'iga uzatilmoqda...").catch(() => {});
      
      // Cobalt Tools API orqali diskka yozmasdan to'g'ridan-to'g'ri oqimli link olish
      const cobaltServers = ['https://api.cobalt.tools/api/json', 'https://cobalt.samet.live/api/json'];
      let streamUrl = null;

      for (const server of cobaltServers) {
        try {
          const res = await axios.post(server, {
            url: url,
            downloadMode: 'audio',
            audioFormat: 'mp3'
          }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 4000 });
          
          if (res.data && res.data.url) {
            streamUrl = res.data.url;
            break;
          }
        } catch (e) {}
      }

      if (streamUrl) {
        // Diskka saqlamasdan Telegramga URL orqali yuborish (Eng tezkor usul!)
        await ctx.replyWithAudio(
          { url: streamUrl, filename: `${videoTitle}.mp3` },
          { title: videoTitle, performer: performerName }
        );
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    }

    // ⚙️ ASOSIY ALL-IN-ONE RAPIDAPI TIZIMI (Linklar yoki videolar uchun zaxira)
    const responseApi = await axios.post(
      'https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink',
      { url: url },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'social-download-all-in-one.p.rapidapi.com',
          'x-rapidapi-key': 'd8d01b8fc7msh4b21e81a8a871bcp1307d7jsnd76c8175e018'
        },
        timeout: 25000
      }
    );

    let mediaUrl = null;
    const apiData = responseApi.data;

    if (apiData) {
      if (isAudio && apiData.audio) mediaUrl = apiData.audio;
      else if (apiData.video) mediaUrl = apiData.video;
      else if (apiData.medias && apiData.medias[0]) mediaUrl = apiData.medias[0].url;
      else if (apiData.url) mediaUrl = apiData.url;
    }

    if (mediaUrl) {
      // Yuklash tezligini oshirish maqsadida, agar link audio bo'lsa uni ham URL orqali yuborishga harakat qilamiz
      if (isAudio) {
        await ctx.replyWithAudio(
          { url: mediaUrl, filename: `${videoTitle}.mp3` },
          { title: videoTitle, performer: performerName }
        );
      } else {
        // Videolarni uzatishda muammolar bo'lmasligi uchun vaqtinchalik xavfsiz disk tizimidan foydalanamiz
        if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Video yuklanmoqda...").catch(() => {});
        const fileId = crypto.randomUUID().slice(0, 8);
        const finalPath = path.join(__dirname, `media_${fileId}.mp4`);
        const writer = fs.createWriteStream(finalPath);
        
        const streamResponse = await axios({ url: mediaUrl, method: 'GET', responseType: 'stream' });
        streamResponse.data.pipe(writer);

        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
        
        await ctx.replyWithVideo({ source: finalPath }, { caption: `🎬 <b>${videoTitle}</b>\n\n📥 @${ctx.botInfo.username} orqali yuklandi`, parse_mode: "HTML" });
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      }

      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (apiErr) {
    console.error("Yuklash xatoligi:", apiErr.message);
  }

  if (waiting) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      waiting.message_id, 
      null, 
      `❌ <b>Ushbu havolani yuklab bo'lmadi!</b>\n\nHavola xato kiritilgan, profil yopiq yoki ijtimoiy tarmoq xavfsizlik tizimi ushbu videoni yuklashga ruxsat bermadi.\n\n💡 <b>Siz uchun 100% ishlaydigan muqobil:</b> Pastdagi tugmalardan foydalanib o'zingizga kerakli qo'shiq yoki kino nomini shunchaki matn ko'rinishida yozib yuboring. Bot uni qidiruv tizimi orqali sizga 100% muammosiz topib beradi!`, 
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
  .then(() => console.log("🔥 ULTRA-SPEED PREMIUM ENGINE ONLINE!"))
  .catch((err) => console.error(err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));