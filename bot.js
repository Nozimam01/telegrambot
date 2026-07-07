require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const ytSearch = require("yt-search");

const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 Ultimate Stable Bot Engine Active"));
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

  let text = "🚀 Bot ishga tushdi.\nHavola yuboring yoki quyidagi menyudan foydalanib qo'shiq/kino nomini yozing:";
  if (ctx.from.id === ADMIN_ID) text += "\n\n👨‍💻 Admin panel: /admin";
  ctx.reply(text, mainMenu);
});

bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Taqiqlangan!");
  ctx.reply("👨‍💻 Admin panel:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => ctx.reply("Bosh menyu:", mainMenu));

bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  try {
    const users = await User.find().sort({ date: -1 });
    let report = `👥 Jami obunachilar: <b>${users.length} ta</b>\n\n`;
    users.forEach((user, index) => {
      report += `${index + 1}. 👤 <b>${escapeHTML(user.firstName)}</b> — ${escapeHTML(user.username)} (ID: <code>${user.telegramId}</code>)\n`;
    });
    if (report.length > 4000) {
      const chunks = report.match(/[\s\S]{1,4000}/g);
      for (const chunk of chunks) await ctx.reply(chunk, { parse_mode: "HTML" }).catch(() => {});
    } else {
      await ctx.reply(report, { parse_mode: "HTML" }).catch(() => {});
    }
  } catch (error) {}
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

// ================= YOUTUBE SEARCH TIZIMI =================
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

// ================= NO-BLACK-SCREEN DOWNLOAD ENGINE =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "", customPerformer = "") {
  const waiting = await ctx.reply("⚡️").catch(() => null);
  let url = targetUrl;
  let videoTitle = customTitle;
  let performerName = customPerformer;

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isInstagram = url.includes("instagram.com");
  
  if (!videoTitle && isYouTube) {
    try {
      const searchResults = await ytSearch(url);
      if (searchResults && searchResults.title) {
        videoTitle = searchResults.title.replace(/[<>:"/\\|?*]/g, "").trim();
        performerName = searchResults.author?.name || "YouTube";
      }
    } catch (e) {}
  }

  if (!videoTitle) videoTitle = url.includes("tiktok.com") ? "TikTok Video" : isInstagram ? "Instagram Reel" : "Media Fayl";
  if (!performerName) performerName = "Downloader";

  try {
    let directUrl = null;

    // 🚀 1-MANBA: INSTAGRAM UCHUN ENG TEZKOR DIRECT VIDEO LINK (MP4 H264)
    if (isInstagram) {
      try {
        const instaRes = await axios.get(`https://api.ahmedali.tech/download?url=${encodeURIComponent(url)}`, { timeout: 5000 });
        if (instaRes.data && instaRes.data.url) {
          directUrl = instaRes.data.url;
        }
      } catch (e) {}
    }

    // 🚀 2-MANBA: GLOBAL COBALT & YT-DLP SERVERS POOL
    if (!directUrl) {
      const apiPool = [
        'https://api.cobalt.tools/api/json',
        'https://cobalt.samet.live/api/json',
        'https://co.wuk.sh/api/json'
      ];

      for (const server of apiPool) {
        try {
          const res = await axios.post(server, 
            { 
              url: url, 
              downloadMode: isAudio ? 'audio' : 'video', 
              audioFormat: 'mp3',
              videoQuality: '720',
              vCodec: 'h264'
            },
            { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 5000 }
          );
          if (res.data && res.data.url) {
            directUrl = res.data.url;
            break;
          }
        } catch (e) {}
      }
    }

    // 🚀 3-MANBA: ZAXIRA PREMIUM RAPIDAPI
    if (!directUrl) {
      try {
        const responseApi = await axios({
          method: 'POST',
          url: 'https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink',
          headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-host': 'social-download-all-in-one.p.rapidapi.com',
            'x-rapidapi-key': 'd8d01b8fc7msh4b21e81a8a871bcp1307d7jsnd76c8175e018'
          },
          data: { url: url },
          timeout: 6000
        });

        const apiData = responseApi.data;
        if (apiData) {
          if (apiData.links && apiData.links.length > 0) {
            const linkObj = isAudio ? apiData.links.find(l => l.type === 'audio') : apiData.links.find(l => l.type === 'video' || l.quality === 'hd');
            directUrl = linkObj ? linkObj.url : apiData.links[0].url;
          } else if (apiData.url) {
            directUrl = apiData.url;
          }
        }
      } catch (apiErr) {}
    }

    // ⚡️ TELEGRAMGA YUBORISH
    if (directUrl) {
      if (isAudio) {
        await ctx.replyWithAudio({ url: directUrl }, { title: videoTitle, performer: performerName });
      } else {
        // 🛠 MANA SHU YERDA QORA EKRAN MUAMMOSINI TUZATAMIZ:
        // supports_streaming: false - Telegram pleyerini chalg'itmasdan videoni toza fayl qilib yuklaydi!
        await ctx.replyWithVideo(
          { url: directUrl }, 
          { 
            caption: `🎬 <b>${videoTitle}</b>\n\n📥 @${ctx.botInfo.username}`, 
            parse_mode: "HTML",
            supports_streaming: false 
          }
        );
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return; 
    }
  } catch (err) {}

  if (waiting) {
    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, `❌ Yuklashda xatolik yuz berdi. Qaytadan urinib ko'ring.`).catch(() => {});
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
    if (!trackData) return ctx.reply("❌ Qidiruv muddati tugagan.");
    await downloadAndSend(ctx, trackData.url, ctx.match[1] === "m", trackData.title, trackData.performer);
  } catch (e) {}
});

bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 METADATA-FIXED ENGINE ONLINE!"))
  .catch((err) => console.error(err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));