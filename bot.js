require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const yts = require("yt-search");
const crypto = require("crypto");

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("🔥 V13 MULTI DOWNLOADER API RUNNING"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("PORT:", PORT));

// ================= DATABASE (MONGODB) =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB muvaffaqiyatli ulandi!"))
  .catch((err) => console.error("❌ MongoDB xatolik:", err.message));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// ================= BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || 123456789;

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

bot.use(async (ctx, next) => {
  if (ctx.from) {
    try {
      const from = ctx.from;
      await User.findOneAndUpdate(
        { telegramId: from.id },
        { 
          username: from.username ? `@${from.username}` : "Mavjud emas", 
          firstName: from.first_name || "Ismsiz" 
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (err) {
      console.error("User save error:", err.message);
    }
  }
  return next();
});

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 V13 MULTI DOWNLOADER BOT\n\nYouTube, Shorts, TikTok, Instagram yoki Facebook havolasini yuboring!", mainMenu);
});

bot.command("users", async (ctx) => {
  if (ctx.from.id !== Number(ADMIN_ID)) return ctx.reply("❌ Faqat admin uchun.");
  try {
    const users = await User.find().sort({ joinedAt: -1 });
    if (!users.length) return ctx.reply("👥 Baza hozircha bo'sh.");

    let msg = "👥 <b>Bot foydalanuvchilari ro'yxati:</b>\n\n";
    users.forEach((user, index) => {
      const safeName = (user.firstName || "Ismsiz").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      msg += `${index + 1}. 👤 <b>${safeName}</b> - ${user.username}\n`;
    });

    if (msg.length > 4000) {
      const chunks = msg.match(/[\s\S]{1,4000}/g);
      for (const chunk of chunks) await ctx.reply(chunk, { parse_mode: "HTML" });
    } else {
      ctx.reply(msg, { parse_mode: "HTML" });
    }
  } catch (err) { ctx.reply("❌ Xatolik."); }
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo‘shiq yoki xonanda nomini yozing:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomini yozing:");
});

// MULTIMEDIA YUKLASH FUNKSIYASI (IKKITALIK ZAXIRA TIZIMI BILAN)
async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ Media qayta ishlanmoqda, kuting...").catch(() => null);
  
  // 1-URUNISH: Cobalt API orqali
  try {
    const response = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vQuality: "720",
      isAudioOnly: isAudio
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      timeout: 10000 // 10 soniya kutish
    });

    if (response.data && response.data.url) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      if (isAudio) {
        await ctx.replyWithAudio({ url: response.data.url });
      } else {
        await ctx.replyWithVideo({ url: response.data.url }, { caption: "🎬 Yuklab olindi!" });
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return; // Agar muvaffaqiyatli bo'lsa funksiyani to'xtatamiz
    }
  } catch (error) {
    console.log("Cobalt API yuklay olmadi, Zaxira tizimga o'tilmoqda...");
  }

  // 2-URUNISH (ZAXIRA): Muqobil ochiq va barqaror API orqali (Ayniqsa Instagram uchun)
  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🔄 Muqobil server orqali qayta urinilmoqda...").catch(() => {});
    
    // Invidious / Soshdl muqobil bepul platforma API-si
    const fallbackRes = await axios.get(`https://v3.savetube.me/api/v2/download?url=${encodeURIComponent(url)}`, {
      timeout: 15000
    });

    if (fallbackRes.data && fallbackRes.data.url) {
      if (isAudio && fallbackRes.data.audio) {
        await ctx.replyWithAudio({ url: fallbackRes.data.audio });
      } else {
        await ctx.replyWithVideo({ url: fallbackRes.data.url }, { caption: "🎬 Yuklab olindi (Zaxira Server)!" });
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (fbError) {
    console.error("Zaxira API ham yuklay olmadi:", fbError.message);
  }

  // Agar ikkala tizim ham yuklay olmasa:
  if (waiting) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      waiting.message_id, 
      null, 
      "❌ Afsuski, ushbu Instagram videosini yuklab bo'lmadi.\n\n" +
      "⚠️ **Mumkin bo'lgan sabablar:**\n" +
      "1. Havola yopiq (Private) akkauntga tegishli (botlar yopiq profillarni ko'ra olmaydi).\n" +
      "2. Instagram serverlarimizni vaqtincha bloklagan.\n\n" +
      "Iltimos, havola ochiq profildan ekanligini tekshirib, birozdan so'ng qayta urinib ko'ring."
    ).catch(() => {});
  }
}

async function search(ctx, q) {
  try {
    const r = await yts(q);
    const videos = r.videos.slice(0, 5); 
    if (!videos.length) return ctx.reply("Hech narsa topilmadi 😕");
    const buttons = [];
    const isMusic = ctx.session.mode === "music";
    videos.forEach((v) => {
      const shortTitle = v.title.slice(0, 30);
      buttons.push([Markup.button.callback(isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, isMusic ? `dl_m_${v.videoId}` : `dl_v_${v.videoId}`)]);
    });
    return ctx.reply("📋 Natijalar topildi. Yuklash uchun bosing:", Markup.inlineKeyboard(buttons));
  } catch (err) { ctx.reply("Qidiruvda xatolik."); }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;
  
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;

    return ctx.reply(
      "📥 Havola aniqlandi. Qaysi formatda yuklamoqchisiz?", 
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), 
          Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)
        ]
      ])
    );
  }
  
  if (!ctx.session.mode) return ctx.reply("Avval menyudan bo'limni tanlang yoki to'g'diran-to'g'ri havola yuboring.", mainMenu);
  await search(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const typeFlag = ctx.match[1]; 
  const shortKey = ctx.match[2]; 
  const originalUrl = ctx.session[shortKey];
  
  if (!originalUrl) {
    return ctx.reply("❌ Havola muddati o'tgan. Iltimos, linkni qaytadan yuboring.");
  }

  await downloadAndSend(ctx, originalUrl, typeFlag === "m");
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const typeFlag = ctx.match[1]; 
  const videoId = ctx.match[2];  
  const url = `https://youtube.com/watch?v=${videoId}`;
  
  await downloadAndSend(ctx, url, typeFlag === "m");
});

bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 V13 SMART DOUBLE-API SYSTEM READY"))
  .catch((err) => console.error("❌ Xatolik:", err.message));