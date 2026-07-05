require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");

// ================= EXPRESS SERVER (Uzluksiz 24/7 ishlash uchun) =================
const app = express();
app.get("/", (req, res) => res.send("🔥 Multi-Downloader Infrastructure Online (2026)"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Express server running on port ${PORT}`));

// ================= MONGOOSE DATABASE CONNECT =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB muvaffaqiyatli ulandi!"))
  .catch((err) => console.log("⚠️ MongoDB ulanmadi (Bot local keshda ishlaydi):", err.message));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

// ================= BOT INITIALIZATION =================
if (!process.env.BOT_TOKEN) {
  console.error("❌ .env faylida BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || 8125836834;

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

// Foydalanuvchilarni bazaga xatosiz saqlash
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
        { upsert: true }
      ).catch(() => {});
    } catch (e) {}
  }
  return next();
});

// Bosh menyu tugmalari
const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

// ================= BOT BUYRUQLARI =================
bot.start((ctx) => {
  ctx.session = {};
  ctx.reply("🚀 Salom! Universal Yuklovchi Botga xush kelibsiz.\n\n" +
            "📌 **Nimalar qila olaman?**\n" +
            "• Instagram Reel/Story yuklash\n" +
            "• TikTok (Suv belgisiz) yuklash\n" +
            "• YouTube Video va Shorts yuklash\n" +
            "• YouTube'dan nomini yozib musiqa va kino qidirish\n\n" +
            "Shunchaki havola yuboring yoki quyidagi tugmalardan foydalaning:", mainMenu);
});

bot.command("users", async (ctx) => {
  if (Number(ctx.from.id) !== Number(ADMIN_ID)) return ctx.reply("❌ Bu buyruq faqat bot admini uchun.");
  try {
    const users = await User.find().sort({ joinedAt: -1 }).limit(100);
    if (!users.length) return ctx.reply("👥 Baza hozircha bo'sh.");

    let msg = "👥 **Bot foydalanuvchilari (Oxirgi 100 ta):**\n\n";
    users.forEach((u, i) => {
      msg += `${i + 1}. 👤 ${u.firstName} - ${u.username}\n`;
    });
    ctx.reply(msg).catch(() => {});
  } catch (err) {
    ctx.reply("❌ Bazadan ma'lumot olishda xatolik.");
  }
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Yuklamoqchi bo'lgan qo'shiq nomini yoki ijrochini yozing:");
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Qidirilayotgan kino yoki trailer nomini kiriting:");
});

// ================= ⚡️ MULTI-DOWNLOAD ENGINE (INSTAGRAM, TIKTOK, YOUTUBE) =================
async function downloadAndSend(ctx, url, isAudio = false) {
  const waiting = await ctx.reply("⏳ Media yuklab olinmoqda, kuting...").catch(() => null);

  // LINIYA 1: Global Ultra-Speed Content Delivery Network (Hech qanday cheklovsiz)
  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Tarmoq yuklanmoqda...").catch(() => {});
    
    const res = await axios.get(`https://api.vvext.info/api/v1/downloader?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    
    if (res.data && res.data.url) {
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Telegramga yuborilmoqda...").catch(() => {});
      const mediaUrl = res.data.url;

      if (isAudio) {
        await ctx.replyWithAudio({ url: mediaUrl }).catch(async () => {
          await ctx.replyWithDocument({ url: mediaUrl, filename: "audio.mp3" });
        });
      } else {
        await ctx.replyWithVideo({ url: mediaUrl }, { caption: "🎬 @Muvaffaqiyatli yuklab olindi!" }).catch(async () => {
          await ctx.replyWithDocument({ url: mediaUrl, filename: "video.mp4" });
        });
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (e) {
    console.log("1-Liniya band. 2-Liniyaga o'tildi.");
  }

  // LINIYA 2: Cobalt Global Open API Gateway
  try {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🔄 Muqobil shlyuzga ulanilmoqda...").catch(() => {});
    
    const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vQuality: "720",
      isAudioOnly: isAudio
    }, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      timeout: 12000
    });

    if (cobaltRes.data && cobaltRes.data.url) {
      const mediaUrl = cobaltRes.data.url;
      if (isAudio) {
        await ctx.replyWithAudio({ url: mediaUrl }).catch(() => {});
      } else {
        await ctx.replyWithVideo({ url: mediaUrl }, { caption: "🎬 Yuklab olindi (Zaxira)!" }).catch(() => {});
      }
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (e) {
    console.log("Barcha yuklash liniyalari band.");
  }

  // Agar hamma liniya javob bermasa (Foydalanuvchiga xavfsiz xabar)
  if (waiting) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waiting.message_id,
      null,
      "❌ Yuklab olish muvaffaqiyatsiz tugadi.\n\n" +
      "💡 **Mumkin bo'lgan sabablar:**\n" +
      "1. Havola xato yoki yopiq (private) profildan olingan.\n" +
      "2. Serverda juda katta yuklama mavjud. Birozdan so'ng qayta urinib ko'ring."
    ).catch(() => {});
  }
}

// ================= 🔍 RASMIY YOUTUBE API QIDIRUV TIZIMI =================
async function searchYouTube(ctx, query) {
  try {
    if (!process.env.YOUTUBE_API_KEY) {
      return ctx.reply("❌ .env faylida YOUTUBE_API_KEY kiritilmagan! Admin bilan bog'laning.");
    }

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${process.env.YOUTUBE_API_KEY}`;
    const res = await axios.get(searchUrl);

    if (!res.data.items || res.data.items.length === 0) {
      return ctx.reply("Hech narsa topilmadi 😕");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";

    res.data.items.forEach((item) => {
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

    return ctx.reply("📋 Natijalar topildi. Yuklab olish formatini tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error("YouTube API error:", err.message);
    ctx.reply("⚠️ Qidiruv tizimida xatolik. Birozdan so'ng qayta urinib ko'ring.");
  }
}

// ================= TEXT VA LINK QABUL QILUVChI ASOSIY BLOK =================
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;

  // Havolalarni tekshirish (Instagram, TikTok, YouTube va b.)
  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;

    return ctx.reply(
      "📥 Havola aniqlandi! Yuklash formatini tanlang:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`),
          Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)
        ]
      ])
    );
  }

  // Agar havola bo'lmasa va qidiruv rejimi tanlanmagan bo'lsa
  if (!ctx.session.mode) {
    return ctx.reply("💡 Qidirish uchun quyidagi menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri ijtimoiy tarmoq havolasini yuboring.", mainMenu);
  }

  // Tanlangan rejim bo'yicha qidirish
  await searchYouTube(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTON ACTIONS (CALLBACK QUERIES) =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const typeFlag = ctx.match[1];
    const shortKey = ctx.match[2];
    const originalUrl = ctx.session[shortKey];

    if (!originalUrl) {
      return ctx.reply("❌ Seans muddati tugagan. Iltimos havolani qayta yuboring.");
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

// ================= BOT LAUNCH =================
bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 BOT MUVAFFAQIYATLI ISHGA TUSHDI! XATOLIKLAR BARTARAF ETILDI."))
  .catch((err) => console.error("❌ Bot start error:", err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));