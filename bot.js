require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const axios = require("axios");
const ytSearch = require("yt-search");
const mongoose = require("mongoose");

const ADMINS = [8125836834, 0, 0];
const MONGO_URI = process.env.MONGO_URI;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "d8d01b8fc7msh4b21e81a8a871bcp1307d7jsnd76c8175e018";
const RAPIDAPI_HOST = "social-media-video-downloader.p.rapidapi.com";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://telegrambot-s0v5.onrender.com";

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

const app = express();
const PORT = process.env.PORT || 4000;
const bot = new Telegraf(process.env.BOT_TOKEN);
const userSessions = {};

// Express Webhook ulash
const SECRET_PATH = `/webhook/${bot.token}`;
app.use(express.json());
app.use(bot.webhookCallback(SECRET_PATH));

app.get("/", (req, res) => res.send("🟢 Bot Webhook rejimida faol!"));

async function getSocialMediaDownloadUrl(youtubeUrl, isAudio = false) {
  let videoId = youtubeUrl;
  const match = youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (match && match[1]) videoId = match[1];

  const options = {
    method: 'GET',
    url: `https://${RAPIDAPI_HOST}/youtube/v3/video/details`,
    params: { videoId: videoId, urlAccess: 'proxied', renderableFormats: '720p,highres', getTranscript: 'false' },
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
    if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
      const audioFormat = data.adaptiveFormats.find(f => f.mimeType && f.mimeType.includes('audio'));
      if (audioFormat && audioFormat.url) return audioFormat.url;
    }
    if (data.formats && Array.isArray(data.formats)) {
      const audioFormat = data.formats.find(f => f.mimeType && f.mimeType.includes('audio'));
      if (audioFormat && audioFormat.url) return audioFormat.url;
    }
    if (data.formats && data.formats.length > 0 && data.formats[0].url) return data.formats[0].url;
  } else {
    if (data.formats && Array.isArray(data.formats)) {
      const videoFormat = data.formats.find(f => f.url && (f.qualityLabel || f.height));
      if (videoFormat) return videoFormat.url;
    }
  }
  if (data.downloadUrl) return data.downloadUrl;
  if (data.url) return data.url;
  throw new Error("Havola topilmadi.");
}

const sendStartMessage = async (ctx) => {
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { firstName: ctx.from.first_name || "Ismsiz" },
      { upsert: true }
    );
  } catch (e) {}

  const isAdmin = ADMINS.map(Number).includes(Number(ctx.from.id));
  let welcomeText = `👋 **Assalomu alaykum, ${ctx.from.first_name}!**\n\n🤖 Bot orqali qo'shiq qidirishingiz va videolarni yuklab olishingiz mumkin.\n\n👇 Qidiruv bo'limini tanlang:`;
  if (isAdmin) welcomeText += `\n\n/xushkelibsiz\n/admin`;

  ctx.replyWithMarkdown(welcomeText, Markup.inlineKeyboard([
    [Markup.button.callback("🎵 Musiqa", "mode_music"), Markup.button.callback("🎬 Kino treyler", "mode_movie")]
  ]));
};

bot.start(sendStartMessage);
bot.command("xushkelibsiz", sendStartMessage);

bot.command("admin", (ctx) => {
  if (!ADMINS.map(Number).includes(Number(ctx.from.id))) return ctx.reply("❌ Admin emassiz.");
  ctx.reply("👨‍💻 **Admin panel:**", Markup.inlineKeyboard([
    [Markup.button.callback("📊 Statistika", "admin_stats")],
    [Markup.button.callback("📢 Xabar yuborish", "admin_broadcast")]
  ]));
});

bot.action("admin_stats", async (ctx) => {
  if (!ADMINS.map(Number).includes(Number(ctx.from.id))) return;
  ctx.answerCbQuery();
  const users = await User.find().sort({ date: -1 });
  let text = `📊 **Foydalanuvchilar:** ${users.length} ta\n\n`;
  users.forEach((u, i) => { text += `${i + 1}. **${(u.firstName || "").replace(/[_*`\[\]]/g, "")}** — \`${u.telegramId}\`\n`; });
  ctx.reply(text, { parse_mode: "Markdown" });
});

bot.action("admin_broadcast", (ctx) => {
  if (!ADMINS.map(Number).includes(Number(ctx.from.id))) return;
  ctx.answerCbQuery();
  userSessions[ctx.from.id] = { action: "awaiting_broadcast_text" };
  ctx.reply("📢 **Xabarni kiriting:**");
});

bot.action("mode_music", (ctx) => {
  ctx.answerCbQuery();
  userSessions[ctx.from.id] = { mode: "music" };
  ctx.reply("🎵 **Qo'shiq nomini yozing:**", { parse_mode: "Markdown" });
});

bot.action("mode_movie", (ctx) => {
  ctx.answerCbQuery();
  userSessions[ctx.from.id] = { mode: "movie" };
  ctx.reply("🎬 **Kino nomini yozing:**", { parse_mode: "Markdown" });
});

bot.on("message", async (ctx) => {
  const userId = Number(ctx.from.id);
  const session = userSessions[userId] || {};

  if (ADMINS.map(Number).includes(userId) && session.action === "awaiting_broadcast_text") {
    delete userSessions[userId].action;
    const users = await User.find();
    ctx.reply(`🚀 **${users.length} ta** foydalanuvchiga yuborilmoqda...`);
    for (const u of users) {
      try { await ctx.telegram.copyMessage(u.telegramId, ctx.chat.id, ctx.message.message_id); } catch (e) {}
    }
    return ctx.reply("✅ Xabar yuborildi.");
  }

  if (!ctx.message.text) return;
  const text = ctx.message.text.trim();

  if (/https?:\/\//.test(text)) {
    userSessions[userId] = { ...userSessions[userId], targetUrl: text };
    return ctx.reply("✨ **Formatni tanlang:**", Markup.inlineKeyboard([
      [Markup.button.callback("🎵 MP3", "format_mp3"), Markup.button.callback("🎬 MP4", "format_mp4")]
    ]));
  }

  const waiting = await ctx.reply("🔍 **Qidirilmoqda...**");
  try {
    const query = session.mode === "movie" ? `${text} trailer` : text;
    const searchResults = await ytSearch({ query: query });
    const videos = searchResults?.videos ? searchResults.videos.slice(0, 10) : [];

    if (!videos.length) {
      await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("❌ Natija topilmadi.");
    }

    userSessions[userId] = { ...session, searchResults: videos };
    let msg = `📋 **"${text}" natijalari:**\n\n`;
    videos.forEach((v, i) => { msg += `**${i + 1}.** ${v.title} (${v.timestamp || '0:00'})\n`; });

    const row1 = [], row2 = [];
    for (let i = 1; i <= videos.length; i++) {
      const btn = Markup.button.callback(`${i}`, `select_${i - 1}`);
      if (i <= 5) row1.push(btn); else row2.push(btn);
    }

    await ctx.deleteMessage(waiting.message_id).catch(() => {});
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(row2.length ? [row1, row2] : [row1]));
  } catch (err) {
    await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruvda xatolik yuz berdi.");
  }
});

bot.action(/format_(mp3|mp4)/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const isAudio = ctx.match[1] === "mp3";
  const session = userSessions[ctx.from.id];
  if (!session?.targetUrl) return ctx.reply("❌ Havola topilmadi.");

  const waiting = await ctx.reply("⚡ **Fayl ishlanmoqda...**");
  try {
    const directUrl = await getSocialMediaDownloadUrl(session.targetUrl, isAudio);
    if (isAudio) {
      await ctx.replyWithAudio(directUrl).catch(async () => {
        await ctx.reply("🎵 Audio:", Markup.inlineKeyboard([Markup.button.url("📥 Yuklab olish", directUrl)]));
      });
    } else {
      await ctx.replyWithVideo(directUrl).catch(async () => {
        await ctx.reply("🎬 Video:", Markup.inlineKeyboard([Markup.button.url("📥 Yuklab olish", directUrl)]));
      });
    }
    await ctx.deleteMessage(waiting.message_id).catch(() => {});
  } catch (err) {
    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Xatolik yuz berdi.");
  }
});

bot.action(/select_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const index = parseInt(ctx.match[1]);
  const session = userSessions[ctx.from.id];
  if (!session?.searchResults?.[index]) return ctx.reply("❌ Muddati tugadi.");

  const item = session.searchResults[index];
  const isAudio = session.mode === "music";
  const waiting = await ctx.reply(`⚡ **"${item.title}" yuklanmoqda...**`);

  try {
    const directUrl = await getSocialMediaDownloadUrl(item.url, isAudio);
    if (isAudio) {
      await ctx.replyWithAudio(directUrl, { title: item.title, performer: item.author.name }).catch(async () => {
        await ctx.reply(`🎵 **${item.title}**:`, Markup.inlineKeyboard([Markup.button.url("📥 Yuklab olish", directUrl)]));
      });
    } else {
      await ctx.replyWithVideo(directUrl, { caption: `🎬 **${item.title}**` }).catch(async () => {
        await ctx.reply(`🎬 **${item.title}**:`, Markup.inlineKeyboard([Markup.button.url("📥 Yuklab olish", directUrl)]));
      });
    }
    await ctx.deleteMessage(waiting.message_id).catch(() => {});
  } catch (err) {
    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Yuklab bo'lmadi.");
  }
});

// Express serverni yurgazish va Webhook sozlash
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server port: ${PORT}`);
  const webhookUrl = `${RENDER_URL}${SECRET_PATH}`;
  await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
  console.log(`🔥 WEBHOOK ISHGA TUSHDI: ${webhookUrl}`);
});