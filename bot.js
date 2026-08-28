require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { session } = require("telegraf-session-mongodb"); 
const { MongoClient } = require("mongodb"); 
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ XATOLIK: MONGO_URI topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 9000000 });
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://telegrambot-s0v5.onrender.com";

// ================= EXPRESS WEB SERVER & WEBHOOK =================
const app = express();
const PORT = process.env.PORT || 4000; 

const SECRET_PATH = `/webhook/${bot.token}`;
app.use(express.json());
app.use(bot.webhookCallback(SECRET_PATH));

app.get("/", (req, res) => res.send("🟢 Engine Active"));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  setInterval(async () => {
    try {
      const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      await axios.get(serverUrl);
    } catch (e) {}
  }, 5 * 60 * 1000);
});

// ================= MONGOOSE DATABASE =================
mongoose.connect(MONGO_URI).catch((err) => console.log("Mongoose Error:", err.message));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

// ================= BOT INITIALIZATION & SESSION =================
const client = new MongoClient(MONGO_URI);
const db = client.db(); 

bot.use(session(db, { collectionName: "telegraf_sessions" }));

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
  ctx.session = ctx.session || {}; 
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", firstName: ctx.from.first_name || "Ismsiz" },
      { upsert: true }
    );
  } catch (e) {}

  let text = "🚀 Bot muvaffaqiyatli ishga tushdi.\n\nHavola yuboring yoki pastdagi menyudan foydalanib qo'shiq/kino nomini yozing:";
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
  const users = await User.find().sort({ date: -1 });
  let report = `📊 <b>BOT STATISTIKASI</b>\n👥 Obunachilar: <b>${users.length} ta</b>\n\n`;
  users.forEach((u, i) => report += `${i + 1}. ${escapeHTML(u.firstName)} - ${escapeHTML(u.username)}\n`);
  ctx.reply(report.slice(0, 4000), { parse_mode: "HTML" });
});

bot.hears("📢 Xabar yuborish", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.session = ctx.session || {};
  ctx.session.adminMode = "send_post";
  ctx.reply("📢 Barcha obunachilarga yuboriladigan xabarni kiriting:");
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino yoki treyler nomini yozing:");
});

// ================= YOUTUBE INVIDIOUS QIDIRUV (KAFOLATLI) =================
async function searchYouTubeLive(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  try {
    const isMusic = ctx.session.mode === "music";
    
    // Invidious ochiq API orqali bloklanmasdan qidiramiz
    const res = await axios.get(`https://inv.tux.pizza/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 10000 });
    const videos = res.data ? res.data.slice(0, 5) : [];

    if (!videos || videos.length === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕.");
    }

    const buttons = [];
    ctx.session = ctx.session || {};

    videos.forEach((video) => {
      const cleanTitle = video.title.replace(/[<>:"/\\|?*]/g, "").trim();
      const cleanAuthor = video.author || "YouTube";
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
    ctx.reply("⚠️ Qidiruv amalga oshmadi. Havolani to'g'ridan-to'g'ri yuborib ko'ring.");
  }
}

// ================= UNIVERSAL COBALT ENGINE (TIKTOK/YOUTUBE/INSTAGRAM) =================
async function downloadAndSend(ctx, targetUrl, isAudio = false, customTitle = "", customPerformer = "") {
  const waiting = await ctx.reply("⚡ Yuklash tayyorlanmoqda...").catch(() => null);
  const fileId = crypto.randomUUID().slice(0, 8);
  const finalPath = path.join(__dirname, `media_${fileId}.${isAudio ? 'mp3' : 'mp4'}`);

  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Server tayyorlanmoqda...").catch(() => {});

    // COBALT API INTEGRATSIYASI (Cheklovsiz yuklash serveri)
    const response = await axios.post("https://co.wuk.sh/api/json", {
      url: targetUrl,
      isAudioOnly: isAudio,
      aFormat: "mp3",
      vQuality: "720"
    }, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 30000
    });

    let downloadStreamUrl = null;

    if (response.data && response.data.url) {
      downloadStreamUrl = response.data.url;
    } else if (response.data && response.data.picker && response.data.picker.length > 0) {
      downloadStreamUrl = response.data.picker[0].url;
    }

    if (!downloadStreamUrl) throw new Error("API stream URL qaytara olmadi.");

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📥 Yuklanmoqda...").catch(() => {});

    // Faylni oqim orqali yuklab olamiz
    const writer = fs.createWriteStream(finalPath);
    const streamRes = await axios.get(downloadStreamUrl, { responseType: "stream" });
    streamRes.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📤 Telegramga yuborilmoqda...").catch(() => {});

    if (isAudio) {
      await ctx.replyWithAudio({ source: finalPath, filename: `Audio_${fileId}.mp3` }, { title: customTitle || "Music", performer: customPerformer || "Downloader" });
    } else {
      await ctx.replyWithVideo({ source: finalPath }, { caption: `🎬 <b>${escapeHTML(customTitle) || "Yuklab olindi!"}</b>\n\n📥 @${ctx.botInfo.username} orqali yuklandi`, parse_mode: "HTML" });
    }

  } catch (err) {
    console.error("Yuklash xatosi:", err.message);
    if (waiting) {
      await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Yuklab bo'lmadi. Havolani to'g'riligini tekshiring yoki keyinroq urinib ko'ring.").catch(() => {});
    }
  } finally {
    try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch (e) {}
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= LISTENERS =================
bot.on("message", async (ctx) => {
  ctx.session = ctx.session || {};

  if (ctx.from.id === ADMIN_ID && ctx.session.adminMode === "send_post") {
    ctx.session.adminMode = null;
    const users = await User.find();
    let success = 0;
    for (const u of users) {
      try {
        await ctx.telegram.copyMessage(u.telegramId, ctx.chat.id, ctx.message.message_id);
        success++;
      } catch (err) {}
    }
    return ctx.reply(`✅ Yuborildi: ${success}/${users.length}`);
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

bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    ctx.session = ctx.session || {};
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    ctx.session = ctx.session || {};
    const isAudio = ctx.match[1] === "m";
    const trackData = ctx.session[ctx.match[2]];
    if (!trackData) return ctx.reply("❌ Qidiruv muddati tugagan.");

    const fullYoutubeUrl = `https://www.youtube.com/watch?v=${trackData.id}`;
    await downloadAndSend(ctx, fullYoutubeUrl, isAudio, trackData.title, trackData.performer);
  } catch (e) {}
});

// SERVER INTEGRATSIYASI
client.connect().then(async () => {
  const webhookUrl = `${RENDER_URL}${SECRET_PATH}`;
  await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
  console.log(`🔥 Engine Running: ${webhookUrl}`);
});