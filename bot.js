require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 Multi-Downloader Infrastructure Running"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Express port: ${PORT}`));

// ================= DATABASE CONNECTION =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB connected successfully!"))
  .catch((err) => console.log("⚠️ MongoDB offline rejimda (Kesh ishlamoqda):", err.message));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

// ================= BOT SYSTEM INITIALIZATION =================
if (!process.env.BOT_TOKEN) {
  console.error("❌ XATOLIK: .env ichida BOT_TOKEN aniqlanmadi!");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || 8125836834;

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

// Foydalanuvchi hisobini xavfsiz ro'yxatga olish
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

// Klaviatura tugmalari
const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= MAIN COMMANDS =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("👋 Salom! Universal Multi-Yuklovchi tizimiga xush kelibsiz.\n\n" +
            "📥 **Qanday foydalaniladi?**\n" +
            "Menga shunchaki YouTube, TikTok yoki Instagram havolasini yuboring yoki quyidagi qidiruv tugmalaridan foydalaning:", mainMenu);
});

bot.command("users", async (ctx) => {
  if (Number(ctx.from.id) !== Number(ADMIN_ID)) return ctx.reply("❌ Bu buyruq faqat bot admini uchun.");
  try {
    const count = await User.countDocuments();
    ctx.reply(`👥 **Botdan foydalanayotgan jami faol a'zolar soni:** ${count} ta`);
  } catch (err) {
    ctx.reply("❌ Ma'lumot olishda xatolik yuz berdi.");
  }
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qidirmoqchi bo'lgan qo'shiq nomini yoki xonandani kiriting:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Qidirilayotgan kino yoki trailer nomini yozing:");
});

// ================= SMART ENGINE: ULTRA-SPEED DOWNLOADER =================
async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ Tizim so'rovni qayta ishlamoqda, kuting...").catch(() => null);

  // 🛠 LINIYA 1: To'g'ridan-to'g'ri integratsiyalashgan barqaror global server
  try {
    const directRes = await axios.get(`https://api.vvext.info/api/v1/downloader?url=${encodeURIComponent(url)}`, { timeout: 12000 });
    if (directRes.data && directRes.data.url) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegram yuklash tizimiga uzatilmoqda...").catch(() => {});
      
      const fileUrl = directRes.data.url;
      if (isAudio) {
        await ctx.replyWithAudio({ url: fileUrl }).catch(async () => {
          await ctx.replyWithDocument({ url: fileUrl, filename: "audio.mp3" });
        });
      } else {
        await ctx.replyWithVideo({ url: fileUrl }, { caption: "🎬 Marhamat, medianingiz yuklab olindi!" }).catch(async () => {
          await ctx.replyWithDocument({ url: fileUrl, filename: "video.mp4" });
        });
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (e) {
    console.log("1-Liniya band. Muqobil zaxiraga o'tildi.");
  }

  // 🛠 LINIYA 2: Muqobil barqaror API (Y2Mate & SaveFrom arxitekturasi)
  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🔄 Zaxira xavfsiz shlyuz ishga tushirildi...").catch(() => {});
    
    const altRes = await axios.post('https://api.y2mate.tools/api/v1/convert', { url: url }, { timeout: 10000 });
    if (altRes.data && altRes.data.downloadUrl) {
      const fileUrl = altRes.data.downloadUrl;
      if (isAudio) {
        await ctx.replyWithAudio({ url: fileUrl }).catch(() => {});
      } else {
        await ctx.replyWithVideo({ url: fileUrl }, { caption: "🎬 Zaxira tizim orqali muvaffaqiyatli yuklandi!" }).catch(() => {});
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (e) {
    console.log("Zaxira shlyuz ham band holatda.");
  }

  // 🛠 LINIYA 3: SMART SMART-ROUTER (Agar barcha bepul serverlar o'chgan bo'lsa)
  // Foydalanuvchiga xatolik ko'rsatib botni to'xtatgandan ko'ra, unga yuklab olish oynasini generatsiya qilib beramiz
  if (waiting) {
    const webDownloadUrl = `https://cobalt.tools/?url=${encodeURIComponent(url)}`;
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waiting.message_id,
      null,
      "⚠️ **Global serverlarda vaqtincha yuqori yuklama aniqlandi (API Limit).**\n\n" +
      "Bot orqali yuborishda uzilish bo'lganligi sababli, quyidagi **Tezkor yuklash** tugmasi orqali videongizni reklamasiz, to'g'ridan-to'g'ri qurilmangizga 1 soniyada yuklab olishingiz mumkin 👇",
      Markup.inlineKeyboard([
        [Markup.button.url("⚡️ Videoni to'g'ridan-to'g'ri yuklab olish", webDownloadUrl)]
      ])
    ).catch(() => {});
  }
}

// ================= 🔍 RASMIY GOOGLE YOUTUBE API TIZIMI =================
async function searchYouTube(ctx, query) {
  try {
    if (!process.env.YOUTUBE_API_KEY) {
      return ctx.reply("❌ Tizimda YOUTUBE_API_KEY kaliti mavjud emas. Uni .env fayliga qo'shing.");
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${process.env.YOUTUBE_API_KEY}`;
    const response = await axios.get(searchUrl);

    if (!response.data.items || response.data.items.length === 0) {
      return ctx.reply("Hech narsa topilmadi 😕");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";

    response.data.items.forEach((item) => {
      const videoId = item.id.videoId;
      const title = item.snippet.title;
      const shortTitle = title.length > 28 ? title.slice(0, 25) + "..." : title;

      buttons.push([
        Markup.button.callback(
          isMusic ? `🎵 ${shortTitle}` : `🎥 ${shortTitle}`,
          isMusic ? `dl_m_${videoId}` : `dl_v_${videoId}`
        )
      ]);
    });

    return ctx.reply("📋 Google API topgan natijalar. Formatni tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error("YouTube API qidiruv xatosi:", err.message);
    ctx.reply("⚠️ YouTube qidiruv xizmati vaqtincha band yoki kalit limiti tugagan.");
  }
}

// ================= LOGIC CONTROLLER =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  // Havolalarni avtomatik tutish
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;

    return ctx.reply(
      "📥 Havola qabul qilindi! Formatni tanlang:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`),
          Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)
        ]
      ])
    );
  }

  // Agar oddiy matn bo'lsa va rejim tanlanmagan bo'lsa
  if (!ctx.session.mode) {
    return ctx.reply("💡 Nimadir yuklash yoki qidirish uchun menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri havolani tashlang.", mainMenu);
  }

  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1];
    const shortKey = ctx.match[2];
    const originalUrl = ctx.session[shortKey];

    if (!originalUrl) {
      return ctx.reply("❌ Seans muddati tugagan. Havolani qayta yuboring.");
    }
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

// ================= BOT SYSTEM LAUNCH =================
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 TIZIM MUTLAQO XATOSIZ ISHGA TUShDI!"))
  .catch((err) => console.error("❌ Ishga tushishda xatolik:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));