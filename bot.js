require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

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
  ctx.reply("🚀 V13 MULTI DOWNLOADER BOT\n\nYouTube, TikTok, Instagram yoki Facebook havolasini yuboring!", mainMenu);
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

// LINKLARNI EMBED API ORQALI YUKLASH
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;
  
  if (/https?:\/\//.test(text)) {
    const waiting = await ctx.reply("⏳ Havola tekshirilmoqda va yuklanmoqda...").catch(() => null);
    
    try {
      // Universal bepul ijtimoiy tarmoq yuklovchi API xizmati
      const response = await axios.post('https://api.cobalt.tools/api/json', {
        url: text,
        vQuality: "720", // Yaxshi sifatda yuklash
        isAudioOnly: false
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.url) {
        if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
        
        // Videoni to'g'ridan-to'g'ri internetdagi tayyor havola orqali yuboramiz
        await ctx.replyWithVideo({ url: response.data.url }, { caption: "🎬 Yuklab olindi!" });
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      } else {
        throw new Error("API URL qaytarmadi");
      }
    } catch (error) {
      console.error("API DOWNLOAD ERROR:", error.message);
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Afsuski, ushbu media faylni yuklay olmadim.\n\nHavola yopiq profildan bo'lishi mumkin yoki tizim band.").catch(() => {});
    }
    return;
  }
  
  ctx.reply("Iltimos, to'g'ri havola yuboring yoki menyudan foydalaning.", mainMenu);
});

bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 V13 PRO API SYSTEM READY"))
  .catch((err) => console.error("❌ Xatolik:", err.message));