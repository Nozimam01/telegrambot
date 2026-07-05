require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// ================= EXPRESS WEB SERVER (24/7 Aktivlik) =================
const app = express();
app.get("/", (req, res) => res.send("🟢 High-Performance Local Core Engine Online (2026)"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server faol, port: ${PORT}`));

// ================= MONGOOSE DATABASE CONNECT =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB ma'lumotlar bazasi muvaffaqiyatli ulandi"))
  .catch((err) => console.log("⚠️ MongoDB offline rejimda (Bot local keshda ishlaydi)"));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

// ================= BOT INITIALIZATION =================
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

// Foydalanuvchilarni bazaga xavfsiz yozish
bot.use(async (ctx, next) => {
  if (ctx.from) {
    try {
      await User.findOneAndUpdate(
        { telegramId: ctx.from.id },
        { 
          username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", 
          firstName: ctx.from.first_name || "Ismsiz" 
        },
        { upsert: true }
      ).catch(() => {});
    } catch (e) {}
  }
  return next();
});

// Asosiy menyu
const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= COMMANDS =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Salom! Universal Multi-Yuklovchi botga xush kelibsiz.\n\n" +
            "📌 **Imkoniyatlar:**\n" +
            "• Instagram Reels & Stories yuklash\n" +
            "• TikTok (Suv belgisiz) yuklash\n" +
            "• YouTube Video & Shorts yuklash\n" +
            "• Ism bo'yicha musiqa va kino qidirish\n\n" +
            "Menga shunchaki havola (link) yuboring yoki quyidagi menyudan foydalaning:", mainMenu);
});

bot.command("users", async (ctx) => {
  if (Number(ctx.from.id) !== Number(ADMIN_ID)) return ctx.reply("❌ Bu buyruq faqat bot admini uchun.");
  try {
    const count = await User.countDocuments();
    ctx.reply(`👥 **Botdan foydalanayotgan jami a'zolar soni:** ${count} ta`);
  } catch (err) {
    ctx.reply("❌ Ma'lumot olishda xatolik yuz berdi.");
  }
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Yuklamoqchi bo'lgan qo'shiq nomini yoki xonandani yozing:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Qidirilayotgan kino yoki trailer nomini kiriting:");
});

// ================= 🔥 LOCAL DOWNLOADING SYSTEM (yt-dlp + ffmpeg) =================
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ So'rov qabul qilindi. Server yuklamoqda...").catch(() => null);
  
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);

  try {
    let command = "";
    if (isAudio) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Audio oqim yuklanmoqda va MP3 formatga o'girilmoqda...").catch(() => {});
      command = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`;
    } else {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Video yuklab olinmoqda (Maksimal tezlikda)...").catch(() => {});
      command = `yt-dlp -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${outputTemplate}" "${url}"`;
    }

    // Serverda yuklash jarayonini boshlash
    await runCommand(command);

    // Yuklangan faylni kengaytmasi bilan aniqlash
    const files = fs.readdirSync(__dirname);
    const downloadedFile = files.find(f => f.startsWith(`media_${fileId}`));

    if (downloadedFile) {
      const finalPath = path.join(__dirname, downloadedFile);
      
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegram tizimiga yuborilmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      } else {
        await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Marhamat, medianingiz tayyor!" });
      }
      
      // Server xotirasini darhol tozalash
      fs.unlinkSync(finalPath);
    } else {
      throw new Error("Fayl topilmadi.");
    }
  } catch (error) {
    console.error("Local Engine Error:", error.message);
    if (waiting) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        waiting.message_id, 
        null, 
        "❌ Yuklashda xatolik yuz berdi.\n\n" +
        "💡 Maslahat: Havola to'g'ri ekanligini yoki sahifa ochiq (public) ekanligini tekshiring."
      ).catch(() => {});
    }
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= 🔍 100% BEPUL OPEN-SOURCE QIDIRUV TIZIMI =================
async function searchYouTube(ctx, query) {
  try {
    // Invidious API orqali mutlaqo kalitsiz va bepul qidiruv
    const searchUrl = `https://vid.puffyan.us/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
    const response = await axios.get(searchUrl, { timeout: 10000 });

    if (!response.data || response.data.length === 0) {
      return ctx.reply("Hech narsa topilmadi 😕. Boshqa nom yozib ko'ring.");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";
    const videos = response.data.slice(0, 5); // 5 ta eng yaxshi natija

    videos.forEach((video) => {
      const videoId = video.videoId;
      if (!videoId) return;

      const title = video.title || "Musiqa";
      const shortTitle = title.length > 25 ? title.slice(0, 22) + "..." : title;

      buttons.push([
        Markup.button.callback(
          isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, 
          isMusic ? `dl_m_${videoId}` : `dl_v_${videoId}`
        )
      ]);
    });

    return ctx.reply("📋 Tizim topgan natijalar. Formatni tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.log("1-qidiruv liniyasida uzilish. Zaxira ishga tushmoqda...");
    
    // Zaxira qidiruv liniyasi (Agar birinchisi vaqtincha band bo'lsa)
    try {
      const fallbackUrl = `https://invidious.flokinet.to/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const fbResponse = await axios.get(fallbackUrl, { timeout: 10000 });
      
      const buttons = [];
      const isMusic = ctx.session.mode === "music";
      const videos = fbResponse.data.slice(0, 5);

      videos.forEach((video) => {
        const shortTitle = video.title.length > 25 ? video.title.slice(0, 22) + "..." : video.title;
        buttons.push([Markup.button.callback(isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, isMusic ? `dl_m_${video.videoId}` : `dl_v_${video.videoId}`)]);
      });

      return ctx.reply("📋 Natijalar (Zaxira liniyasi):", Markup.inlineKeyboard(buttons));
    } catch (fbErr) {
      ctx.reply("⚠️ Qidiruv xizmati vaqtincha band. Iltimos, qaytadan urinib ko'ring.");
    }
  }
}

// ================= CONTROLLER ENGINE =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  // Havolalarni avtomatik aniqlash
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    
    return ctx.reply("📥 Havola aniqlandi. Yuklash formatini tanlang:", Markup.inlineKeyboard([
      [
        Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), 
        Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)
      ]
    ]));
  }

  // Agar matn bo'lsa va menyudan rejim tanlanmagan bo'lsa
  if (!ctx.session.mode) {
    return ctx.reply("💡 Bo'limni tanlang yoki to'g'ridan-to'g'ri havolani yuboring.", mainMenu);
  }

  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= INLINE BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1];
    const originalUrl = ctx.session[ctx.match[2]];
    
    if (!originalUrl) return ctx.reply("❌ Seans muddati tugagan. Linkni qayta yuboring.");
    await downloadAndSend(ctx, originalUrl, typeFlag === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1];
    const videoId = ctx.match[2];
    const url = `https://youtube.com/watch?v=${videoId}`;
    
    await downloadAndSend(ctx, url, typeFlag === "m");
  } catch (e) {}
});

// ================= BOT LAUNCH =================
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 BOT LOCAL CORE VA KALITSIZ ENGINE BILAN MUVAFFAQIYATLI ISHLADI!"))
  .catch((err) => console.error("❌ Bot start error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));