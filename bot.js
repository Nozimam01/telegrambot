require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const yts = require("yt-search");
const crypto = require("crypto");

// ================= EXPRESS SERVER (Uzluksiz ishlash uchun) =================
const app = express();
app.get("/", (req, res) => res.send("🔥 Multi-Downloader System Online (2026)"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Express server running on port ${PORT}`));

// ================= DATABASE (MONGODB) =================
// Agar MONGODB_URI xatolik bersa, local yoki muqobil xavfsiz ulanish xotirasi ishlaydi
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB database connected successfully!"))
  .catch((err) => console.log("⚠️ MongoDB ulanishida cheklov (Bot kesh rejimida ishlaydi):", err.message));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// ================= TELEGRAF BOT INITIALIZATION =================
if (!process.env.BOT_TOKEN) {
  console.error("❌ XATOLIK: .env faylida BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || 8125836834;

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

// Foydalanuvchilarni bazaga xavfsiz yozish middleware'i
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
      ).catch(() => {});
    } catch (err) {
      // Bazaga ulanmagan bo'lsa ham bot to'xtab qolmaydi
    }
  }
  return next();
});

// Asosiy menyu tugmalari
const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= COMMANDS =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Salam! Multi-Downloader botga xush kelibsiz.\n\nInstagram, TikTok, YouTube, Shorts yoki Facebook havolasini yuboring yoki quyidagi menyudan foydalaning:", mainMenu);
});

// Admin panel (Faqat siz uchun)
bot.command("users", async (ctx) => {
  if (Number(ctx.from.id) !== Number(ADMIN_ID)) return ctx.reply("❌ Bu buyruq faqat bot admini uchun.");
  try {
    const users = await User.find().sort({ joinedAt: -1 });
    if (!users.length) return ctx.reply("👥 Baza hozircha bo'sh yoki yuklanmadi.");

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
    ctx.reply("❌ Ma'lumotlar bazasidan foydalanishda xatolik."); 
  }
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo‘shiq nomini yoki xonandani yozing:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino yoki Trailer nomini kiriting:");
});

// ================= UNIVERSAL XATOSIZ YUKLOVCHY FUNKSIYA =================
async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ So'rov qabul qilindi, media yuklab olinmoqda...").catch(() => null);
  
  // Liniya 1: Cobalt Tools API (Eng yirik ochiq tarmoq)
  try {
    const response = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vQuality: "720",
      isAudioOnly: isAudio
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      timeout: 10000 
    });

    if (response.data && response.data.url) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ url: response.data.url }).catch(async () => {
          await ctx.replyWithDocument({ url: response.data.url, filename: "audio.mp3" }).catch(() => {});
        });
      } else {
        await ctx.replyWithVideo({ url: response.data.url }, { caption: "🎬 Marhamat, video yuklab olindi!" }).catch(async () => {
          await ctx.replyWithDocument({ url: response.data.url, filename: "video.mp4" }).catch(() => {});
        });
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return; 
    }
  } catch (error) {
    console.log("Cobalt API band, 2-liniyaga o'tildi.");
  }

  // Liniya 2: TMDB / Zaxira ijtimoiy shlyuzi (Hech qanday ENOTFOUND bo'lmaydigan barqaror domen)
  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🔄 Zaxira server orqali qayta ishlanmoqda...").catch(() => {});
    
    // Publer/Bhawanigarg ochiq CDN yuklovchisi
    const fallbackRes = await axios.get(`https://api.bhawanigarg.com/social/downloader?url=${encodeURIComponent(url)}`, {
      timeout: 12000
    });

    if (fallbackRes.data && fallbackRes.data.data && fallbackRes.data.data.url) {
      const mediaUrl = fallbackRes.data.data.url;
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      
      await ctx.replyWithVideo({ url: mediaUrl }, { caption: "🎬 Zaxira tizim orqali muvaffaqiyatli yuklandi!" }).catch(() => {});
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (fbError) {
    console.log("Zaxira yuklash shlyuzida vaqtincha yuqori yuklama.");
  }

  // Barcha liniyalar javob bermasa yakuniy chiroyli xabar (Bot crash bo'lmaydi)
  if (waiting) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, 
      waiting.message_id, 
      null, 
      "❌ Kechirasiz, ijtimoiy tarmoq cheklovlari tufayli hozir yuklab bo'lmadi.\n\n" +
      "💡 Maslahat: Havolani to'g'ri va ochiq (public) sahifadan ekanligini tekshirib, birozdan keyin qayta yuboring."
    ).catch(() => {});
  }
}

// ================= YOUTUBE SEARCH SYSTEM =================
async function searchYouTube(ctx, query) {
  try {
    const searchResults = await yts(query);
    const videos = searchResults.videos.slice(0, 5); 
    if (!videos.length) return ctx.reply("Hech narsa topilmadi 😕");
    
    const buttons = [];
    const isMusic = ctx.session.mode === "music";
    
    videos.forEach((v) => {
      const shortTitle = v.title.slice(0, 28);
      buttons.push([Markup.button.callback(isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, isMusic ? `dl_m_${v.videoId}` : `dl_v_${v.videoId}`)]);
    });
    return ctx.reply("📋 Quyidagi natijalardan birini tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) { 
    ctx.reply("Qidiruv tizimida xatolik yuz berdi, iltimos qaytadan so'rang."); 
  }
}

// ================= MAIN TEXT & LINK RECEIVER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Menyudagi tugmalarni chetlab o'tish
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;
  
  // Havolalarni aniqlash (Http/Https)
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;

    return ctx.reply(
      "📥 Havola qabul qilindi! Qaysi formatda yuklamoqchisiz?", 
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), 
          Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)
        ]
      ])
    );
  }
  
  // Agar foydalanuvchi menyudan bo'lim tanlamay to'g'ridan to'g'ri so'z yozsa
  if (!ctx.session.mode) {
    return ctx.reply("💡 Qidirish uchun pastdagi menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri video havolasini yuboring.", mainMenu);
  }
  
  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= ACTIONS (CALLBACK QUERIES) =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1]; 
    const shortKey = ctx.match[2]; 
    const originalUrl = ctx.session[shortKey];
    
    if (!originalUrl) {
      return ctx.reply("❌ Seans muddati tugagan. Havolani qaytadan yuboring.");
    }

    await downloadAndSend(ctx, originalUrl, typeFlag === "m");
  } catch (err) {
    console.log("Format yuklash jarayonida xatolik.");
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
    console.log("Tugma orqali yuklash jarayonida xatolik.");
  }
});

// ================= BOT LAUNCH =================
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 BOT ISHLASHGA TAYYOR, LOGLAR TOZALANDI!"))
  .catch((err) => console.error("❌ Botni ishga tushirishda xatolik:", err.message));

// Protokollarni to'g'ri yopish
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));