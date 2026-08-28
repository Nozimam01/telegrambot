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

// ================= ENVIRONMENT & CONFIG =================
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 
const MONGO_URI = process.env.MONGO_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!MONGO_URI || !BOT_TOKEN) {
  console.error("❌ XATOLIK: MONGO_URI yoki BOT_TOKEN topilmadi!");
  process.exit(1);
}

// ================= EXPRESS & WEBHOOK SETUP =================
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;

const bot = new Telegraf(BOT_TOKEN);
const SECRET_PATH = `/webhook/${bot.secretPathComponent()}`;

app.use(bot.webhookCallback(SECRET_PATH));

app.get("/", (req, res) => {
  res.status(200).json({ status: "Online", engine: "Cobalt & Render Webhook" });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  if (RENDER_URL) {
    try {
      await bot.telegram.setWebhook(`${RENDER_URL}${SECRET_PATH}`);
      console.log(`🔥 Webhook muvaffaqiyatli o'rnatildi: ${RENDER_URL}${SECRET_PATH}`);
    } catch (e) {
      console.error("Webhook o'rnatishda xatolik:", e.message);
    }
  }

  setInterval(async () => {
    try {
      if (RENDER_URL) {
        await axios.get(RENDER_URL);
      }
    } catch (e) {}
  }, 4 * 60 * 1000);
});

// ================= DATABASE =================
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log("🍃 Mongoose muvaffaqiyatli ulandi!"))
  .catch((err) => console.error("🍃 Mongoose ulanish xatosi:", err.message));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

const mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
mongoClient.connect()
  .then(() => console.log("🍃 MongoDB Client sessiyalar uchun ulandi!"))
  .catch((err) => console.error("🍃 MongoDB Client xatosi:", err.message));

const db = mongoClient.db(); 
bot.use(session(db, { collectionName: "telegraf_sessions" }));

// ================= UI MENUS & HELPERS =================
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

// ================= BOT COMMANDS =================
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

  let welcomeText = "🚀 Bot muvaffaqiyatli ishga tushdi.\n\nQo'shiq yoki kino qidirish uchun quyidagi menyudan foydalaning yoxud istalgan havolani yuboring:";
  if (ctx.from.id === ADMIN_ID) {
    welcomeText += "\n\n👨‍💻 Admin panel: /admin";
  }
  return ctx.reply(welcomeText, mainMenu);
});

bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Bu buyruq faqat bot egasi uchun!");
  return ctx.reply("👨‍💻 Admin paneliga xush kelibsiz:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => {
  ctx.session.mode = null;
  return ctx.reply("Bosh menyu:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  return ctx.reply("🎵 Qidirilayotgan qo'shiq yoki ijrochi nomini yozing:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  return ctx.reply("🎬 Qidirilayotgan kino yoki treyler nomini yozing:");
});

// ================= ADMIN STATS & BROADCAST =================
bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const waitingMsg = await ctx.reply("📊 Ma'lumotlar hisoblanmoqda...").catch(() => null);
  
  try {
    const users = await User.find().sort({ date: -1 });
    const count = users.length;
    
    if (count === 0) {
      if (waitingMsg) await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});
      return ctx.reply("📊 <b>Statistika:</b>\n\nHozircha foydalanuvchilar mavjud emas.", { parse_mode: "HTML" });
    }

    let report = `📊 <b>BOT STATISTIKASI</b>\n👥 Jami obunachilar: <b>${count} ta</b>\n\n📋 <b>So'nggi foydalanuvchilar:</b>\n`;
    users.slice(0, 30).forEach((user, index) => {
      report += `${index + 1}. 👤 <b>${escapeHTML(user.firstName)}</b> — ${escapeHTML(user.username)} (ID: <code>${user.telegramId}</code>)\n`;
    });

    if (waitingMsg) await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});
    await ctx.reply(report, { parse_mode: "HTML" }).catch(() => {});
  } catch (error) {
    if (waitingMsg) await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});
    return ctx.reply("⚠️ Statistikani olishda xatolik yuz berdi.");
  }
});

bot.hears("📢 Xabar yuborish", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.session.adminMode = "send_post";
  return ctx.reply("📢 Barcha foydalanuvchilarga yuboriladigan xabar matnini yuboring:");
});

// ================= YOUTUBE SEARCH =================
async function searchYouTube(ctx, query) {
  const waitingMsg = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  
  const instances = [
    "https://invidious.privacyredirect.com",
    "https://vid.priv.au",
    "https://inv.nadeko.net"
  ];

  let videos = [];
  for (const instance of instances) {
    try {
      const response = await axios.get(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 8000 });
      if (response.data && response.data.length > 0) {
        videos = response.data.slice(0, 5);
        break;
      }
    } catch (e) {}
  }

  if (!videos.length) {
    if (waitingMsg) await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});
    return ctx.reply("Hech narsa topilmadi 😕. Boshqa nom bilan qidirib ko'ring.");
  }

  const isMusic = ctx.session.mode === "music";
  const inlineButtons = [];

  videos.forEach((video) => {
    const cleanTitle = (video.title || "").replace(/[<>:"/\\|?*]/g, "").trim();
    const trackKey = crypto.randomUUID().slice(0, 8);
    ctx.session[trackKey] = `https://www.youtube.com/watch?v=${video.videoId}`;
    const displayTitle = cleanTitle.length > 35 ? cleanTitle.slice(0, 32) + "..." : cleanTitle;
    const emoji = isMusic ? "🎵" : "🎬";
    inlineButtons.push([Markup.button.callback(`${emoji} ${displayTitle}`, `dl_${trackKey}`)]);
  });

  if (waitingMsg) await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});
  return ctx.reply("📋 Topilgan natijalar:", Markup.inlineKeyboard(inlineButtons));
}

// ================= MEDIA DOWNLOAD =================
async function downloadAndSendMedia(ctx, targetUrl) {
  const waitingMsg = await ctx.reply("⚡ Fayl yuklanmoqda...").catch(() => null);
  const fileId = crypto.randomUUID().slice(0, 8);
  const isAudio = ctx.session.mode === "music";
  const tempFilePath = path.join(__dirname, `media_${fileId}.${isAudio ? 'mp3' : 'mp4'}`);

  try {
    const response = await axios.post("https://co.wuk.sh/api/json", {
      url: targetUrl,
      isAudioOnly: isAudio,
      aFormat: "mp3",
      vQuality: "720"
    }, {
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      timeout: 35000
    });

    let downloadStreamUrl = response.data?.url || response.data?.picker?.[0]?.url;
    if (!downloadStreamUrl) throw new Error("URL topilmadi");

    const writer = fs.createWriteStream(tempFilePath);
    const streamRes = await axios.get(downloadStreamUrl, { responseType: "stream", timeout: 45000 });
    streamRes.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    if (waitingMsg) await ctx.telegram.editMessageText(ctx.chat.id, waitingMsg.message_id, null, "📤 Yuborilmoqda...").catch(() => {});

    if (isAudio) {
      await ctx.replyWithAudio({ source: tempFilePath, filename: `Audio_${fileId}.mp3` });
    } else {
      await ctx.replyWithVideo({ source: tempFilePath }, { caption: `✅ @${ctx.botInfo.username} orqali yuklandi` });
    }
  } catch (err) {
    if (waitingMsg) await ctx.telegram.editMessageText(ctx.chat.id, waitingMsg.message_id, null, "❌ Yuklab bo'lmadi.").catch(() => {});
  } finally {
    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) {}
    if (waitingMsg) await ctx.deleteMessage(waitingMsg.message_id).catch(() => {});
  }
}

// ================= MESSAGE HANDLER =================
bot.on("message", async (ctx) => {
  ctx.session = ctx.session || {};

  if (ctx.from.id === ADMIN_ID && ctx.session.adminMode === "send_post") {
    ctx.session.adminMode = null;
    const users = await User.find();
    let successCount = 0;
    for (const u of users) {
      try {
        await ctx.telegram.copyMessage(u.telegramId, ctx.chat.id, ctx.message.message_id);
        successCount++;
      } catch (e) {}
    }
    return ctx.reply(`✅ Xabar yuborildi: ${successCount}/${users.length}`);
  }

  if (!ctx.message.text) return;
  const userText = ctx.message.text.trim();

  if (["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish", "📊 Statistika", "📢 Xabar yuborish", "⬅️ Bosh menyu"].includes(userText)) {
    return;
  }

  if (/https?:\/\//.test(userText)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = userText;
    return ctx.reply("📥 Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) {
    return ctx.reply("Iltimos, avval menyudan bo'limni tanlang yoki havola yuboring.");
  }

  const searchQuery = ctx.session.mode === "movie" ? userText + " trailer" : userText;
  await searchYouTube(ctx, searchQuery);
});

// ================= CALLBACK ACTIONS =================
bot.action(/dl_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    ctx.session = ctx.session || {};
    const targetUrl = ctx.session[ctx.match[1]];
    if (!targetUrl) return ctx.reply("❌ Seans muddati tugagan.");
    await downloadAndSendMedia(ctx, targetUrl);
  } catch (e) {}
});

bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    ctx.session = ctx.session || {};
    const targetUrl = ctx.session[ctx.match[2]];
    if (!targetUrl) return ctx.reply("❌ Seans muddati tugagan.");
    ctx.session.mode = ctx.match[1] === "m" ? "music" : "video";
    await downloadAndSendMedia(ctx, targetUrl);
  } catch (e) {}
});

// ================= SAFETY SHUTDOWN =================
process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));