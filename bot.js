require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const yts = require("yt-search");

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

// Foydalanuvchini avtomatik saqlash
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

// ================= BOT COMMANDS =================
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

// MULTIMEDIA YUKLASH FUNKSIYASI (UNIVERSAL API)
async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ Media qayta ishlanmoqda, kuting...").catch(() => null);
  try {
    const response = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vQuality: "720",
      isAudioOnly: isAudio
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
    });

    if (response.data && response.data.url) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ url: response.data.url });
      } else {
        await ctx.replyWithVideo({ url: response.data.url }, { caption: "🎬 Yuklab olindi!" });
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    } else {
      throw new Error("Havola topilmadi");
    }
  } catch (error) {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Ushbu mediani yuklab bo'lmadi (Hajmi juda katta yoki havola xato).").catch(() => {});
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
    // To'g'ridan-to'g'ri yuborilgan linklarni avtomatik video formatida yuklaydi
    return downloadAndSend(ctx, text, false);
  }
  
  if (!ctx.session.mode) return ctx.reply("Avval menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri havola yuboring.", mainMenu);
  await search(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const typeFlag = ctx.match[1]; 
  const videoId = ctx.match[2];  
  const url = `https://youtube.com/watch?v=${videoId}`;
  
  await downloadAndSend(ctx, url, typeFlag === "m");
});

bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 V13 PRO COMPLETE SYSTEM READY"))
  .catch((err) => console.error("❌ Xatolik:", err.message));