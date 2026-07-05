require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 Local Heavy Core Downloader Online (2026)"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server port: ${PORT}`));

// ================= DATABASE CONNECTION =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB muvaffaqiyatli ulandi"))
  .catch((err) => console.log("⚠️ MongoDB offline rejimda"));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

// ================= INITIALIZATION =================
if (!process.env.BOT_TOKEN) {
  console.error("❌ ERROR: .env faylida BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

// Foydalanuvchini bazaga saqlash
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

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("👋 Salom! Local dvijokli universal yuklovchi botga xush kelibsiz.\n\nIstalgan havolani (Instagram, TikTok, YouTube) yuboring:", mainMenu);
});

bot.hears("🎵 Musiqa qidirish", (ctx) => { ctx.session.mode = "music"; ctx.reply("🎵 Qo'shiq nomini yozing:"); });
bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => { ctx.session.mode = "movie"; ctx.reply("🎬 Kino yoki trailer nomini yozing:"); });

// ================= 🔥 LOCAL SERVER ENGINE (yt-dlp + ffmpeg) =================
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ Mahalliy server yuklamoqda, kuting...").catch(() => null);
  
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `file_${fileId}.%(ext)s`);

  try {
    let command = "";
    if (isAudio) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Audio oqim yuklanmoqda va MP3 ga o'girilmoqda...").catch(() => {});
      // Eng yaxshi audioni oladi va ffmpeg orqali xatoliksiz MP3 qiladi
      command = `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`;
    } else {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Video yuklab olinmoqda (Maksimal tezlikda)...").catch(() => {});
      // Telegram qo'llaydigan eng barqaror MP4 formatda yuklaydi
      command = `yt-dlp -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${outputTemplate}" "${url}"`;
    }

    // Serverda yuklash buyrug'ini ishga tushirish
    await runCommand(command);

    // Kengaytmasini aniqlash (chunki %(ext)s o'zgarishi mumkin)
    const files = fs.readdirSync(__dirname);
    const downloadedFile = files.find(f => f.startsWith(`file_${fileId}`));

    if (downloadedFile) {
      const finalPath = path.join(__dirname, downloadedFile);
      
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegram tizimiga yuklanmoqda...").catch(() => {});
      
      if (isAudio) {
        await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      } else {
        await ctx.replyWithVideo({ source: finalPath }, { caption: "🎬 Marhamat, medianingiz tayyor!" });
      }
      
      // Server xotirasini tozalash
      fs.unlinkSync(finalPath);
    } else {
      throw new Error("Yuklangan fayl serverda topilmadi.");
    }
  } catch (error) {
    console.error("yt-dlp Core Error:", error.message);
    if (waiting) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        waiting.message_id, 
        null, 
        "❌ Yuklashda xatolik yuz berdi.\n\n" +
        "💡 Sababi: Havola xato, video o'chirilgan yoki yopiq profildan olingan."
      ).catch(() => {});
    }
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= 🔍 GOOGLE YOUTUBE API SEARCH =================
async function searchYouTube(ctx, query) {
  try {
    if (!process.env.YOUTUBE_API_KEY) return ctx.reply("❌ YOUTUBE_API_KEY kiritilmagan.");

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${process.env.YOUTUBE_API_KEY}`;
    const response = await axios.get(searchUrl);

    if (!response.data.items || response.data.items.length === 0) return ctx.reply("Hech narsa topilmadi 😕");

    const buttons = [];
    const isMusic = ctx.session.mode === "music";

    response.data.items.forEach((item) => {
      const videoId = item.id.videoId;
      const title = item.snippet.title;
      const shortTitle = title.length > 25 ? title.slice(0, 22) + "..." : title;

      buttons.push([Markup.button.callback(isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`, isMusic ? `dl_m_${videoId}` : `dl_v_${videoId}`)]);
    });

    return ctx.reply("📋 Natijalar topildi. Formatni tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    ctx.reply("⚠️ Qidiruv xizmati vaqtincha band.");
  }
}

// ================= TEXT CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) return ctx.reply("💡 Bo'limni tanlang yoki link tashlang.", mainMenu);
  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1];
    const originalUrl = ctx.session[ctx.match[2]];
    if (!originalUrl) return ctx.reply("❌ Seans muddati tugagan.");
    await downloadAndSend(ctx, originalUrl, typeFlag === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    await downloadAndSend(ctx, `https://youtube.com/watch?v=${ctx.match[2]}`, ctx.match[1] === "m");
  } catch (e) {}
});

bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 BOT LOCAL CORE ORQALI ISHGA TUSHDI!"))
  .catch((err) => console.error("❌ Xatolik:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));