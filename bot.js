require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const yts = require("yt-search");
const crypto = require("crypto");

// ================= EXPRESS SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🔥 Multi-Downloader System Online"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Express server running on port ${PORT}`));

// ================= DATABASE (MONGODB) =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB database connected successfully!"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// ================= TELEGRAF BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || 123456789;

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

// Foydalanuvchilarni bazaga saqlash middleware
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
      console.error("Database user save log:", err.message);
    }
  }
  return next();
});

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= COMMANDS & HEARS =================
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
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" }).catch(() => {});
      }
    } else {
      ctx.reply(msg, { parse_mode: "HTML" }).catch(() => {});
    }
  } catch (err) { 
    ctx.reply("❌ Foydalanuvchilarni yuklashda xatolik yuz berdi."); 
  }
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo‘shiq yoki xonanda nomini yozing:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino nomini yozing:");
});

// ================= UNIVERSAL MEDIA DOWNLOADER FUNCTION =================
async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ Media qayta ishlanmoqda, kuting...").catch(() => null);
  
  // 1-URUNISH: Cobalt Global API
  try {
    const response = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vQuality: "720",
      isAudioOnly: isAudio
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      timeout: 12000 
    });

    if (response.data && response.data.url) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ url: response.data.url }).catch(async () => {
          await ctx.replyWithDocument({ url: response.data.url, filename: "audio.mp3" });
        });
      } else {
        await ctx.replyWithVideo({ url: response.data.url }, { caption: "🎬 Yuklab olindi!" }).catch(async () => {
          await ctx.replyWithDocument({ url: response.data.url, filename: "video.mp4" });
        });
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return; 
    }
  } catch (error) {
    console.log("Cobalt API limitga duch keldi, zaxira gatewayga o'tilmoqda...");
  }

  // 2-URUNISH: Muqobil ijtimoiy tarmoqlar yuklovchi API shlyuzi
  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🔄 Muqobil shlyuz orqali qayta urinilmoqda...").catch(() => {});
    
    const fallbackRes = await axios.get(`https://api.azz.uz/v1/downloader?url=${encodeURIComponent(url)}`, {
      timeout: 15000
    });

    if (fallbackRes.data && fallbackRes.data.url) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      
      await ctx.replyWithVideo({ url: fallbackRes.data.url }, { caption: "🎬 Zaxira serverdan yuklab olindi!" });
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (fbError) {
    console.log("Zaxira API serverida uzilish:", fbError.message);
  }

  // 3-URUNISH: Instagram uchun maxsus qo'shimcha ochiq API shlyuzi
  if (url.includes("instagram.com")) {
    try {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🔄 Instagram shlyuzi ishga tushirildi...").catch(() => {});
      
      const igRes = await axios.get(`https://api.bhawanigarg.com/social/instagram?url=${encodeURIComponent(url)}`, { timeout: 12000 });
      if (igRes.data && igRes.data.data && igRes.data.data.url) {
        await ctx.replyWithVideo({ url: igRes.data.data.url }, { caption: "🎬 Instagram shlyuzi orqali yuklab olindi!" });
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (igErr) {
      console.log("Instagram maxsus API liniyasida ham yuklama yuqori:", igErr.message);
    }
  }

  // AGAR BARCHA APILAR BAND BO'LSA YAKUNIY JAVOB
  if (waiting) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      waiting.message_id, 
      null, 
      "❌ Kechirasiz, tarmoqdagi yuqori yuklama tufayli tizim ushbu mediani yuklay olmadi.\n\n" +
      "💡 Pro-Maslahat: Havola ochiq (public) sahifadan ekanligini tekshiring va birozdan so'ng qayta urinib ko'ring."
    ).catch(() => {});
  }
}

// INLINE REZULTATLAR QIDIRUV TIZIMI (YOUTUBE UCHUN)
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
  } catch (err) { 
    ctx.reply("Qidiruv tizimida xatolik yuz berdi."); 
  }
}

// TEXT INPUT MONITORING (HAVOLALAR VA SO'ZLAR UCHUN)
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;
  
  // Havola tekshiruvi
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
  
  if (!ctx.session.mode) return ctx.reply("Avval menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri havola yuboring.", mainMenu);
  await search(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ACTIONS (FORMAT VA INLINE TUGMALAR UCHUN CALLBACK)
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1]; 
    const shortKey = ctx.match[2]; 
    const originalUrl = ctx.session[shortKey];
    
    if (!originalUrl) {
      return ctx.reply("❌ Havola xotiradan o'chib ketgan. Iltimos, linkni qaytadan yuboring.");
    }

    await downloadAndSend(ctx, originalUrl, typeFlag === "m");
  } catch (err) {
    console.error("Callback format xatosi:", err.message);
  }
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1]; 
    const videoId = ctx.match[2];  
    const url = `https://youtube.com/watch?v=${videoId}`;
    
    await downloadAndSend(ctx, url, typeFlag === "m");
  } catch (err) {
    console.error("Callback direct download xatosi:", err.message);
  }
});

// BOTNI ISHGA TUSHIRISH
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 SYSTEM COMPLETE WITHOUT ERRORS READY"))
  .catch((err) => console.error("❌ Fatal Bot Launch Error:", err.message));

// Xavfsiz to'xtash jarayonlari
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));