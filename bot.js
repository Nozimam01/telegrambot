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

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;

const bot = new Telegraf(process.env.BOT_TOKEN);
const SECRET_PATH = `/webhook/${bot.secretPathComponent()}`;

app.use(bot.webhookCallback(SECRET_PATH));
app.get("/", (req, res) => res.send("🟢 Bot Active"));

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (RENDER_URL) {
    try {
      await bot.telegram.setWebhook(`${RENDER_URL}${SECRET_PATH}`);
      console.log(`🔥 Webhook o'rnatildi: ${RENDER_URL}${SECRET_PATH}`);
    } catch (e) {}
  }

  setInterval(async () => {
    try {
      if (RENDER_URL) await axios.get(RENDER_URL);
    } catch (e) {}
  }, 4 * 60 * 1000);
});

mongoose.connect(MONGO_URI).catch(() => {});

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

const client = new MongoClient(MONGO_URI);
client.connect().catch(() => {});
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

bot.start(async (ctx) => {
  ctx.session = {}; 
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", firstName: ctx.from.first_name || "Ismsiz" },
      { upsert: true }
    );
  } catch (e) {}

  let text = "🚀 Bot ishga tushdi.\n\nMenyudan kerakli bo'limni tanlang yoki to'g'ridan-to'g'ri havola yuboring:";
  if (ctx.from.id === ADMIN_ID) text += "\n\n👨‍💻 Admin: /admin";
  ctx.reply(text, mainMenu);
});

bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply("👨‍💻 Admin panel:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => {
  ctx.session.mode = null;
  ctx.reply("Bosh menyu:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomini yozing:");
});

bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const users = await User.find().sort({ date: -1 });
  let report = `📊 <b>STATISTIKA</b>\n👥 Jami: <b>${users.length} ta</b>\n\n`;
  users.forEach((u, i) => report += `${i + 1}. ${escapeHTML(u.firstName)} - ${escapeHTML(u.username)}\n`);
  ctx.reply(report.slice(0, 4000), { parse_mode: "HTML" });
});

bot.hears("📢 Xabar yuborish", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.session.adminMode = "send_post";
  ctx.reply("📢 Xabarni kiriting:");
});

async function searchYouTube(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  try {
    const res = await axios.get(`https://inv.tux.pizza/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 10000 });
    const videos = res.data ? res.data.slice(0, 5) : [];

    if (!videos.length) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕.");
    }

    const isMusic = ctx.session.mode === "music";
    const buttons = [];

    videos.forEach((video) => {
      const cleanTitle = (video.title || "").replace(/[<>:"/\\|?*]/g, "").trim();
      const trackKey = crypto.randomUUID().slice(0, 8);
      
      ctx.session[trackKey] = `https://www.youtube.com/watch?v=${video.videoId}`;

      const displayTitle = cleanTitle.length > 35 ? cleanTitle.slice(0, 32) + "..." : cleanTitle;
      const emoji = isMusic ? "🎵" : "🎬";
      
      buttons.push([Markup.button.callback(`${emoji} ${displayTitle}`, `dl_${trackKey}`)]);
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Topilgan natijalar:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruv vaqtida xatolik yuz berdi.");
  }
}

async function downloadAndSend(ctx, targetUrl) {
  const waiting = await ctx.reply("⚡ Yuklanmoqda...").catch(() => null);
  const fileId = crypto.randomUUID().slice(0, 8);
  const isAudio = ctx.session.mode === "music";
  const finalPath = path.join(__dirname, `media_${fileId}.${isAudio ? 'mp3' : 'mp4'}`);

  try {
    const response = await axios.post("https://co.wuk.sh/api/json", {
      url: targetUrl,
      isAudioOnly: isAudio,
      aFormat: "mp3",
      vQuality: "720"
    }, {
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      timeout: 30000
    });

    let downloadStreamUrl = response.data?.url || response.data?.picker?.[0]?.url;
    if (!downloadStreamUrl) throw new Error("URL topilmadi");

    const writer = fs.createWriteStream(finalPath);
    const streamRes = await axios.get(downloadStreamUrl, { responseType: "stream" });
    streamRes.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    if (isAudio) {
      await ctx.replyWithAudio({ source: finalPath, filename: `Audio_${fileId}.mp3` });
    } else {
      await ctx.replyWithVideo({ source: finalPath }, { caption: `✅ @${ctx.botInfo.username} orqali yuklandi` });
    }
  } catch (err) {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Yuklab bo'lmadi.").catch(() => {});
  } finally {
    try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch (e) {}
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

bot.on("message", async (ctx) => {
  ctx.session = ctx.session || {};

  if (ctx.from.id === ADMIN_ID && ctx.session.adminMode === "send_post") {
    ctx.session.adminMode = null;
    const users = await User.find();
    let success = 0;
    for (const u of users) {
      try { await ctx.telegram.copyMessage(u.telegramId, ctx.chat.id, ctx.message.message_id); success++; } catch (e) {}
    }
    return ctx.reply(`✅ Yuborildi: ${success}/${users.length}`);
  }

  if (!ctx.message.text) return;
  const text = ctx.message.text.trim();

  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) {
    return ctx.reply("Iltimos, avval menyudan **🎵 Musiqa qidirish** yoki **🎬 Kino (Treyler) qidirish** tugmasini bosing.");
  }

  const query = ctx.session.mode === "movie" ? text + " trailer" : text;
  await searchYouTube(ctx, query);
});

bot.action(/dl_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    ctx.session = ctx.session || {};
    const url = ctx.session[ctx.match[1]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan.");
    await downloadAndSend(ctx, url);
  } catch (e) {}
});

bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    ctx.session = ctx.session || {};
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan.");
    const isAudio = ctx.match[1] === "m";
    ctx.session.mode = isAudio ? "music" : "video";
    await downloadAndSend(ctx, url);
  } catch (e) {}
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));