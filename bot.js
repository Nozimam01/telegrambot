require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const axios = require("axios");
const ytSearch = require("yt-search");
const mongoose = require("mongoose");

// ================= ADMINLAR SOZLAMASI =================
const ADMINS = [
  8125836834, // Sizning Telegram ID
   
 
];

const MONGO_URI = process.env.MONGO_URI;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "d8d01b8fc7msh4b21e81a8a871bcp1307d7jsnd76c8175e018";
const RAPIDAPI_HOST = "social-media-video-downloader.p.rapidapi.com";

// ================= DATABASE (MongoDB) =================
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log("🍃 MongoDB ulandi!"))
    .catch(err => console.error("❌ DB xatosi:", err.message));
}

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

// ================= SERVER (RENDER UCHUN) =================
const app = express();
const PORT = process.env.PORT || 4000;
app.get("/", (req, res) => res.send("🟢 Bot faol holatda!"));
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server port: ${PORT}`));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
const userSessions = {};

// ================= RAPIDAPI YUKLASH FUNKSIYASI (AUDIO UCHUN TO'G'RILANDI) =================
async function getSocialMediaDownloadUrl(youtubeUrl, isAudio = false) {
  let videoId = youtubeUrl;
  const match = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (match && match[1]) {
    videoId = match[1];
  }

  const options = {
    method: 'GET',
    url: `https://${RAPIDAPI_HOST}/youtube/v3/video/details`,
    params: {
      videoId: videoId,
      urlAccess: 'proxied',
      renderableFormats: '720p,highres',
      getTranscript: 'false'
    },
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST,
      'Content-Type': 'application/json'
    }
  };

  const response = await axios.request(options);
  const data = response.data;

  if (!data) throw new Error("API ma'lumot qaytarmadi.");

  if (isAudio) {
    // 1-urinish: Adaptive formatlardan faqat audioni topish
    if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
      const audioFormat = data.adaptiveFormats.find(f => f.mimeType && f.mimeType.includes('audio'));
      if (audioFormat && audioFormat.url) return audioFormat.url;
    }

    // 2-urinish: Oddiy formats ro'yxatidan audio topish
    if (data.formats && Array.isArray(data.formats)) {
      const audioFormat = data.formats.find(f => f.mimeType && f.mimeType.includes('audio'));
      if (audioFormat && audioFormat.url) return audioFormat.url;
    }

    // 3-urinish: Past sifatli video stream (Telegram audio qilib berishi uchun)
    if (data.formats && data.formats.length > 0 && data.formats[0].url) {
      return data.formats[0].url;
    }
  } else {
    // Video formatni qidirish
    if (data.formats && Array.isArray(data.formats)) {
      const videoFormat = data.formats.find(f => f.url && (f.qualityLabel || f.height));
      if (videoFormat) return videoFormat.url;
    }
    if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
      const videoFormat = data.adaptiveFormats.find(f => f.url && f.mimeType && f.mimeType.includes('video'));
      if (videoFormat) return videoFormat.url;
    }
  }

  if (data.downloadUrl) return data.downloadUrl;
  if (data.url) return data.url;

  throw new Error("Tegishli yuklash havolasi topilmadi.");
}

// ================= /START VA /XUSHKELEBSIZ BUYRUG'I =================
const sendStartMessage = async (ctx) => {
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { firstName: ctx.from.first_name || "Ismsiz" },
      { upsert: true }
    );
  } catch (e) {}

  const userId = Number(ctx.from.id);
  const isAdmin = ADMINS.map(Number).includes(userId);

  let welcomeText = 
    `👋 **Assalomu alaykum, ${ctx.from.first_name}!**\n\n` +
    `🤖 Ushbu bot orqali siz:\n` +
    `• Qo'shiqlar va kino treylerlarini izlashingiz;\n` +
    `• Instagram, TikTok va YouTube'dan videolarni yuklab olishingiz mumkin.\n\n` +
    `👇 Qidiruv bo'limini tanlang yoki havola (link) yuboring:`;

  if (isAdmin) {
    welcomeText += `\n\n/xushkelibsiz\n/admin`;
  }

  const inlineKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("🎵 Musiqa", "mode_music"),
      Markup.button.callback("🎬 Kino treyler", "mode_movie")
    ]
  ]);

  ctx.replyWithMarkdown(welcomeText, inlineKeyboard);
};

bot.start(sendStartMessage);
bot.command("xushkelibsiz", sendStartMessage);

// ================= ADMIN PANEL =================
bot.command("admin", (ctx) => {
  const userId = Number(ctx.from.id);
  if (!ADMINS.map(Number).includes(userId)) return ctx.reply("❌ Siz admin emassiz.");

  ctx.reply(
    `👨‍💻 **Admin panelga xush kelibsiz!**`,
    Markup.inlineKeyboard([
      [Markup.button.callback("📊 Statistika", "admin_stats")],
      [Markup.button.callback("📢 Xabar yuborish (Rassilka)", "admin_broadcast")]
    ])
  );
});

bot.action("admin_stats", async (ctx) => {
  const userId = Number(ctx.from.id);
  if (!ADMINS.map(Number).includes(userId)) return;
  ctx.answerCbQuery();
  
  const users = await User.find().sort({ date: -1 });
  if (users.length === 0) return ctx.reply("📊 Bazada hali foydalanuvchilar yo'q.");

  let text = `📊 **Botingizdan foydalanayotganlar:** ${users.length} ta\n\n👤 **Foydalanuvchilar ro'yxati:**\n`;

  users.forEach((u, index) => {
    const safeName = (u.firstName || "Ismsiz").replace(/[_*`\[\]]/g, ""); 
    text += `${index + 1}. **${safeName}** — \`${u.telegramId}\`\n`;
  });

  if (text.length > 4000) {
    const chunks = text.match(/[\s\S]{1,4000}/g);
    for (const chunk of chunks) await ctx.reply(chunk, { parse_mode: "Markdown" });
  } else {
    ctx.reply(text, { parse_mode: "Markdown" });
  }
});

bot.action("admin_broadcast", (ctx) => {
  const userId = Number(ctx.from.id);
  if (!ADMINS.map(Number).includes(userId)) return;
  ctx.answerCbQuery();

  userSessions[ctx.from.id] = { action: "awaiting_broadcast_text" };
  ctx.reply("📢 **Barcha foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring:**", { parse_mode: "Markdown" });
});

// ================= REJIMLAR (MUSIQA / KINO) =================
bot.action("mode_music", (ctx) => {
  ctx.answerCbQuery();
  userSessions[ctx.from.id] = { mode: "music" };
  ctx.reply("🎵 **Qo'shiq yoki xonanda nomini yozing:**", { parse_mode: "Markdown" });
});

bot.action("mode_movie", (ctx) => {
  ctx.answerCbQuery();
  userSessions[ctx.from.id] = { mode: "movie" };
  ctx.reply("🎬 **Kino yoki treyler nomini yozing:**", { parse_mode: "Markdown" });
});

// ================= XABARLARNI QABUL QILISH =================
bot.on("message", async (ctx) => {
  const userId = Number(ctx.from.id);
  const session = userSessions[userId] || {};

  // RASSILKA
  if (ADMINS.map(Number).includes(userId) && session.action === "awaiting_broadcast_text") {
    delete userSessions[userId].action;
    const users = await User.find();
    
    ctx.reply(`🚀 **${users.length} ta** foydalanuvchiga xabar yuborilmoqda...`, { parse_mode: "Markdown" });

    let countSuccess = 0;
    for (const user of users) {
      try {
        await ctx.telegram.copyMessage(user.telegramId, ctx.chat.id, ctx.message.message_id);
        countSuccess++;
      } catch (e) {}
    }

    return ctx.reply(`✅ Xabar yuborish yakunlandi!\n\nYetib bordi: **${countSuccess} / ${users.length}** ta.`, { parse_mode: "Markdown" });
  }

  if (!ctx.message.text) return;
  const text = ctx.message.text.trim();

  // HAVOLA YUBORILSA
  if (/https?:\/\//.test(text)) {
    userSessions[userId] = { ...userSessions[userId], targetUrl: text };

    return ctx.reply("✨ **Qaysi formatda yuklamoqchisiz?**", Markup.inlineKeyboard([
      [
        Markup.button.callback("🎵 MP3 (Audio)", "format_mp3"),
        Markup.button.callback("🎬 Video (MP4)", "format_mp4")
      ]
    ]));
  }

  // NOMI BO'YICHA QIDIRUV (10 TA RO'YXAT)
  const waiting = await ctx.reply("🔍 **Qidirilmoqda...**", { parse_mode: "Markdown" });

  try {
    const query = session.mode === "movie" ? `${text} trailer` : text;
    const searchResults = await ytSearch(query);
    const videos = searchResults.videos.slice(0, 10);

    if (!videos || videos.length === 0) {
      await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("❌ Hech narsa topilmadi.");
    }

    userSessions[userId] = { ...session, searchResults: videos };

    let messageText = `📋 **"${text}" bo'yicha topilgan natijalar:**\n\n`;
    videos.forEach((v, idx) => {
      messageText += `**${idx + 1}.** ${v.title} (${v.timestamp})\n`;
    });
    messageText += `\n👇 **Yuklab olish uchun quyidagi raqamlardan birini bosing:**`;

    const row1 = [], row2 = [];
    for (let i = 1; i <= videos.length; i++) {
      const btn = Markup.button.callback(`${i}`, `select_${i - 1}`);
      if (i <= 5) row1.push(btn);
      else row2.push(btn);
    }

    await ctx.deleteMessage(waiting.message_id).catch(() => {});
    await ctx.replyWithMarkdown(messageText, Markup.inlineKeyboard(row2.length > 0 ? [row1, row2] : [row1]));

  } catch (err) {
    await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruv jarayonida xatolik yuz berdi.");
  }
});

// ================= LINK FORMATINI SELEKT QILISH =================
bot.action(/format_(mp3|mp4)/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const isAudio = ctx.match[1] === "mp3";
  const session = userSessions[ctx.from.id];

  if (!session || !session.targetUrl) return ctx.reply("❌ Havola topilmadi. Qaytadan yuboring.");

  const waiting = await ctx.reply("⚡ **Fayl ishlanmoqda, kuting...**", { parse_mode: "Markdown" });

  try {
    const directUrl = await getSocialMediaDownloadUrl(session.targetUrl, isAudio);

    if (isAudio) {
      await ctx.replyWithAudio(directUrl).catch(async () => {
        // Telegram to'g'ridan-to'g meva qilib yubora olmasa link beradi
        await ctx.reply("🎵 Audio faylni quyidagi tugma orqali yuklab oling:", Markup.inlineKeyboard([
          Markup.button.url("📥 Musiqani yuklab olish", directUrl)
        ]));
      });
    } else {
      await ctx.replyWithVideo(directUrl, { caption: `🎬 @${ctx.botInfo.username}` }).catch(async () => {
        await ctx.reply("🎬 Videoni quyidagi tugma orqali yuklab oling:", Markup.inlineKeyboard([
          Markup.button.url("📥 Videoni yuklab olish", directUrl)
        ]));
      });
    }

    await ctx.deleteMessage(waiting.message_id).catch(() => {});
  } catch (err) {
    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Ushbu havoladan media olib bo'lmadi.");
  }
});

// ================= 1-10 TUGMALARI BOSILGANDA YUKLASH =================
bot.action(/select_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const index = parseInt(ctx.match[1]);
  const session = userSessions[ctx.from.id];

  if (!session || !session.searchResults || !session.searchResults[index]) {
    return ctx.reply("❌ Qidiruv muddati tugagan. Qaytadan nomi yozib qidiring.");
  }

  const item = session.searchResults[index];
  const isAudio = session.mode === "music";

  const waiting = await ctx.reply(`⚡ **"${item.title}" yuklanmoqda...**`, { parse_mode: "Markdown" });

  try {
    const directUrl = await getSocialMediaDownloadUrl(item.url, isAudio);

    if (isAudio) {
      await ctx.replyWithAudio(directUrl, { title: item.title, performer: item.author.name }).catch(async () => {
        await ctx.reply(`🎵 **${item.title}** musiqasi olinmadi. Direct link orqali yuklab oling:`, Markup.inlineKeyboard([
          Markup.button.url("📥 Musiqani yuklab olish", directUrl)
        ]));
      });
    } else {
      await ctx.replyWithVideo(directUrl, { caption: `🎬 **${item.title}**\n\n📥 @${ctx.botInfo.username}`, parse_mode: "HTML" }).catch(async () => {
        await ctx.reply(`🎬 **${item.title}** videosini yuklab olish uchun tugmani bosing:`, Markup.inlineKeyboard([
          Markup.button.url("📥 Videoni yuklab olish", directUrl)
        ]));
      });
    }

    await ctx.deleteMessage(waiting.message_id).catch(() => {});
  } catch (err) {
    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ RapidAPI orqali faylni olib bo'lmadi. Boshqa qo'shiq tanlab ko'ring.");
  }
});

bot.launch({ dropPendingUpdates: true }).then(() => console.log("🔥 BOT ISHGA TUSHDI!"));