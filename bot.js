require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { session } = require("telegraf-session-mongodb"); 
const { MongoClient } = require("mongodb"); 
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const ytSearch = require("yt-search");
const crypto = require("crypto");

const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : 8125836834; 
const MONGO_URI = process.env.MONGO_URI;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "d8d01b8fc7msh4b21e81a8a871bcp1307d7jsnd76c8175e018";

if (!MONGO_URI) {
  console.error("❌ XATOLIK: MONGO_URI topilmadi!");
  process.exit(1);
}

// ================= EXPRESS WEB SERVER =================
const app = express();
const PORT = process.env.PORT || 4000;
app.get("/", (req, res) => res.send("🟢 Bot is Active"));
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server port: ${PORT}`));

// ================= DATABASE =================
mongoose.connect(MONGO_URI).then(() => console.log("🍃 Mongoose ulandi!"));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
const client = new MongoClient(MONGO_URI);
const db = client.db(); 

bot.use(session(db, { collectionName: "telegraf_sessions" }));

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]
]).resize();

const adminMenu = Markup.keyboard([
  ["📊 Statistika", "📢 Xabar yuborish"],
  ["⬅️ Bosh menyu"]
]).resize();

bot.start(async (ctx) => {
  ctx.session = {}; 
  try {
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { 
        username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", 
        firstName: ctx.from.first_name || "Ismsiz" 
      },
      { upsert: true }
    );
  } catch (e) {}

  let text = "🚀 Bot ishga tushdi.\n\nNomi bo'yicha qidiring yoki Instagram/TikTok/YouTube havolasini yuboring:";
  if (ctx.from.id === ADMIN_ID) text += "\n\n👨‍💻 Admin panel: /admin";
  ctx.reply(text, mainMenu);
});

bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply("👨‍💻 Admin panel:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => ctx.reply("Bosh menyu:", mainMenu));

bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const count = await User.countDocuments();
  ctx.reply(`📊 <b>Jami foydalanuvchilar:</b> ${count} ta`, { parse_mode: "HTML" });
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yozing:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino yoki treyler nomini yozing:");
});

// ================= ISHONCHLI RAPIDAPI YUKLASH TIZIMI =================
async function getMediaViaRapidApi(targetUrl, isAudio = false) {
  try {
    // 1-USUL: Best All In One Video Downloader
    const response = await axios({
      method: "POST",
      url: "https://best-all-in-one-video-downloader.p.rapidapi.com/index.php",
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": "best-all-in-one-video-downloader.p.rapidapi.com",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      data: new URLSearchParams({ url: targetUrl }).toString(),
      timeout: 20000
    });

    const data = response.data;
    if (data && (data.video || data.url || data.link)) {
      return data.video || data.url || data.link;
    }
  } catch (err) {
    console.log("RapidAPI 1 xatosi:", err.message);
  }

  // 2-USUL (Zahira): Cobalt API
  const cobaltRes = await axios.post("https://api.cobalt.tools/api/json", {
    url: targetUrl,
    isAudioOnly: isAudio,
    aFormat: "mp3",
    vQuality: "720"
  }, {
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    timeout: 15000
  });

  if (cobaltRes.data && cobaltRes.data.url) {
    return cobaltRes.data.url;
  }

  throw new Error("Ikkala API orqali ham yuklab bo'lmadi");
}

// ================= XABARLARNI QABUL QILISH =================
bot.on("message", async (ctx) => {
  ctx.session = ctx.session || {};
  if (!ctx.message.text) return;
  const text = ctx.message.text.trim();

  if (["🎬 Kino (Treyler) qidirish", "🎵 Musiqa qidirish", "📊 Statistika", "📢 Xabar yuborish", "⬅️ Bosh menyu"].includes(text)) return;

  // Havola yuborilgan bo'lsa (Instagram, TikTok, YouTube)
  if (/https?:\/\//.test(text)) {
    const waiting = await ctx.reply("📥 API orqali media fayl olinmoqda...");
    try {
      const downloadUrl = await getMediaViaRapidApi(text, false);
      await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📤 Telegramga yuklanmoqda...");
      
      await ctx.replyWithVideo(downloadUrl, { caption: `🎬 @${ctx.botInfo.username}` });
      await ctx.deleteMessage(waiting.message_id).catch(() => {});
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Ushbu havoladan videoni olib bo'lmadi. Boshqa havola bilan urinib ko'ring.");
    }
    return;
  }

  // YouTube nom bo'yicha qidiruv
  const waiting = await ctx.reply("🔍 Qidirilmoqda...");
  try {
    const query = ctx.session.mode === "movie" ? text + " trailer" : text;
    const searchResults = await ytSearch(query);
    const videos = searchResults.videos.slice(0, 5);

    if (!videos || videos.length === 0) {
      await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕.");
    }

    const isMusic = ctx.session.mode === "music";
    const buttons = [];

    videos.forEach((video) => {
      const cleanTitle = video.title.replace(/[<>:"/\\|?*]/g, "").trim();
      const trackKey = crypto.randomUUID().slice(0, 8);
      
      ctx.session[trackKey] = {
        url: video.url,
        title: cleanTitle,
        author: video.author?.name || "YouTube"
      };

      const displayTitle = cleanTitle.length > 35 ? cleanTitle.slice(0, 32) + "..." : cleanTitle;
      const emoji = isMusic ? "🎵" : "🎬";
      
      buttons.push([Markup.button.callback(`${emoji} ${displayTitle}`, `dl_${isMusic ? 'm' : 'v'}_${trackKey}`)]);
    });

    await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Topilgan natijalar:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruvda xatolik yuz berdi.");
  }
});

// ================= TUGMALAR BOSILGANDA YUKLASH =================
bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const isAudio = ctx.match[1] === "m";
  const trackKey = ctx.match[2]; 
  const trackData = ctx.session ? ctx.session[trackKey] : null;

  if (!trackData) return ctx.reply("❌ Qidiruv muddati tugagan. Qaytadan qidiring.");

  const waiting = await ctx.reply("⚡ API orqali yuklanmoqda...");

  try {
    const downloadUrl = await getMediaViaRapidApi(trackData.url, isAudio);

    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "📤 Yuborilmoqda...");

    if (isAudio) {
      await ctx.replyWithAudio(downloadUrl, { title: trackData.title, performer: trackData.author });
    } else {
      await ctx.replyWithVideo(downloadUrl, { caption: `🎬 <b>${trackData.title}</b>\n\n📥 @${ctx.botInfo.username}`, parse_mode: "HTML" });
    }

    await ctx.deleteMessage(waiting.message_id).catch(() => {});

  } catch (err) {
    console.error("Yuklashda xato:", err.message);
    await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Ushbu faylni yuklab bo'lmadi. Boshqasini tanlab ko'ring.");
  }
});

client.connect().then(() => {
  bot.launch({ dropPendingUpdates: true }).then(() => console.log("🔥 BOT API BILAN ISHGA TUSHDI!"));
});