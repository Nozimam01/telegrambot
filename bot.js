require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// ⚠️ DIQQAT: Bu yerga o'zingizning Telegram ID raqamingizni yozing!
const ADMIN_ID = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) :8125836834; 

// ================= EXPRESS WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("🟢 Stabilized HTML-Entities Engine Online"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ================= MONGOOSE DATABASE =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).catch(() => console.log("🍃 DB Offline rejimda"));

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  date: { type: Date, default: Date.now }
}));

// ================= BOT INITIALIZATION =================
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use((ctx, next) => { ctx.session ||= {}; return next(); });

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Treyler) qidirish"]
]).resize();

const adminMenu = Markup.keyboard([
  ["📊 Statistika", "📢 Xabar yuborish"],
  ["⬅️ Bosh menyu"]
]).resize();

// HTML uchun maxsus belgilarni xavfsiz qilish funksiyasi
function escapeHTML(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ================= COMMANDS =================
bot.start(async (ctx) => {
  ctx.session = {};
  try {
    // 🛠 MONGOOSE ESKIRISH OGOHLANTIRIShI TUZATILDI: returnDocument: 'after' qo'shildi
    await User.findOneAndUpdate(
      { telegramId: ctx.from.id },
      { 
        username: ctx.from.username ? `@${ctx.from.username}` : "Mavjud emas", 
        firstName: ctx.from.first_name || "Ismsiz" 
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (e) {
    console.error("User save error:", e.message);
  }

  let text = "🚀 Bot muvaffaqiyatli yangilandi.\n\nHavola yuboring yoki pastdagi menyudan foydalanib qo'shiq/kino nomini yozing:";
  if (ctx.from.id === ADMIN_ID) {
    text += "\n\n👨‍💻 Admin panel: /admin";
  }
  ctx.reply(text, mainMenu);
});

bot.command("admin", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("❌ Bu buyruq faqat bot admini uchun!");
  ctx.reply("👨‍💻 Admin panel:", adminMenu);
});

bot.hears("⬅️ Bosh menyu", (ctx) => {
  ctx.reply("Bosh menyu:", mainMenu);
});

// ================= 🔥 TUZATILGAN XAFSIZ STATISTIKA (HTML FORMATDA) =================
bot.hears("📊 Statistika", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const waiting = await ctx.reply("📊 Ma'lumotlar yig'ilmoqda...").catch(() => null);
  
  try {
    const users = await User.find().sort({ date: -1 });
    const count = users.length;

    if (count === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("📊 <b>Bot statistikasi:</b>\n\nHozircha obunachilar mavjud emas.", { parse_mode: "HTML" });
    }

    // Markdown'dan HTML'ga o'tildi - crash mutlaqo bo'lmaydi endi!
    let report = `📊 <b>BOT STATISTIKASI</b>\n👥 Jami obunachilar: <b>${count} ta</b>\n\n📋 <b>Foydalanuvchilar ro'yxati:</b>\n`;

    users.forEach((user, index) => {
      const safeName = escapeHTML(user.firstName);
      const safeUsername = escapeHTML(user.username);
      report += `${index + 1}. 👤 <b>${safeName}</b> — ${safeUsername} (ID: <code>${user.telegramId}</code>)\n`;
    });

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});

    if (report.length > 4000) {
      const chunks = report.match(/[\s\S]{1,4000}/g);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" }).catch(err => console.error("Chunk send error:", err.message));
      }
    } else {
      await ctx.reply(report, { parse_mode: "HTML" }).catch(err => console.error("Report send error:", err.message));
    }

  } catch (error) {
    console.error("Stats error:", error.message);
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Statistika yuklashda xatolik yuz berdi.");
  }
});

bot.hears("📢 Xabar yuborish", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.session.adminMode = "send_post";
  ctx.reply("📢 Barcha obunachilarga yuboriladigan xabar matnini kiriting:");
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  ctx.reply("🎵 Qo'shiq nomini yoki ijrochini yozing:");
});

bot.hears("🎬 Kino (Treyler) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  ctx.reply("🎬 Kino yoki treyler nomini yozing:");
});

function cleanTitle(title) {
  if (!title) return "Media";
  return title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[<>]/g, "").trim();
}

// ================= YOUTUBE LIVE SEARCH PARSER =================
async function searchYouTubeLive(ctx, query) {
  const waiting = await ctx.reply("🔍 Qidirilmoqda...").catch(() => null);
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const { data } = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    });

    const regex = /var ytInitialData = (\{.+?\});/;
    const match = data.match(regex);
    if (!match) throw new Error("No match");

    const json = JSON.parse(match[1]);
    const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents || contents.length === 0) {
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return ctx.reply("Hech narsa topilmadi 😕.");
    }

    const buttons = [];
    const isMusic = ctx.session.mode === "music";
    let count = 0;

    for (const item of contents) {
      if (count >= 5) break;
      const videoRenderer = item.videoRenderer;
      if (!videoRenderer) continue;

      const videoId = videoRenderer.videoId;
      const titleText = videoRenderer.title?.runs?.[0]?.text;

      if (videoId && titleText) {
        const title = cleanTitle(titleText);
        const displayTitle = title.length > 40 ? title.slice(0, 37) + "..." : title;
        buttons.push([Markup.button.callback(isMusic ? `🎵 ${displayTitle}` : `🎥 ${displayTitle}`, `dl_${isMusic ? 'm' : 'v'}_${videoId}`)]);
        count++;
      }
    }

    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    return ctx.reply("📋 Topilgan natijalar:", Markup.inlineKeyboard(buttons));
  } catch (err) {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
    ctx.reply("⚠️ Qidiruv amalga oshmadi. Qayta urinib ko'ring.");
  }
}

// ================= DOWNLOAD ENGINE =================
function runLocalDl(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout); });
  });
}

async function downloadAndSend(ctx, targetUrl, isAudio = false) {
  const waiting = await ctx.reply("⏳ Yuklanmoqda...").catch(() => null);
  let url = targetUrl;
  try {
    const urlObj = new URL(targetUrl);
    if (urlObj.searchParams.has("list")) {
      urlObj.searchParams.delete("list");
      urlObj.searchParams.delete("index");
      url = urlObj.toString();
    }
  } catch (e) {}

  if (url.includes("instagram.com") || url.includes("tiktok.com")) {
    try {
      const res = await axios.get(`https://api.sandipbaruwal.com/insta/download?url=${encodeURIComponent(url)}`, { timeout: 6000 });
      const directUrl = res.data?.data?.[0]?.url;
      if (directUrl) {
        if (isAudio) await ctx.replyWithAudio({ url: directUrl }).catch(() => {});
        else await ctx.replyWithVideo({ url: directUrl }).catch(() => {});
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (e) {}

    try {
      const res = await axios.post(`https://api.cobalt.tools/api/json`, { url: url, isAudioOnly: isAudio, vQuality: "720" }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 6000 });
      if (res.data && res.data.url) {
        if (isAudio) await ctx.replyWithAudio({ url: res.data.url }).catch(() => {});
        else await ctx.replyWithVideo({ url: res.data.url }).catch(() => {});
        if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
        return;
      }
    } catch (e) {}

    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Video topilmadi.").catch(() => {});
    return;
  }

  try {
    const res = await axios.post(`https://api.cobalt.tools/api/json`, { url: url, isAudioOnly: isAudio, aFormat: "mp3", vQuality: "720" }, { headers: { "Accept": "application/json", "Content-Type": "application/json" }, timeout: 6000 });
    if (res.data && res.data.url) {
      if (isAudio) await ctx.replyWithAudio({ url: res.data.url }).catch(() => {});
      else await ctx.replyWithVideo({ url: res.data.url }).catch(() => {});
      if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
      return;
    }
  } catch (fastApiError) {}

  if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "⚡️ Server orqali yuklanmoqda...").catch(() => {});
  const fileId = crypto.randomUUID().slice(0, 8);
  const outputTemplate = path.join(__dirname, `media_${fileId}.%(ext)s`);

  try {
    let command = isAudio 
      ? `yt-dlp --no-playlist --no-check-certificates --no-warnings -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`
      : `yt-dlp --no-playlist --no-check-certificates --no-warnings -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" -o "${outputTemplate}" "${url}"`;

    await runLocalDl(command);
    const files = fs.readdirSync(__dirname);
    const downloadedFile = files.find(f => f.startsWith(`media_${fileId}`));

    if (downloadedFile) {
      const finalPath = path.join(__dirname, downloadedFile);
      if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "🚀 Uzatilmoqda...").catch(() => {});
      if (isAudio) await ctx.replyWithAudio({ source: finalPath }, { filename: "musiqa.mp3" });
      else await ctx.replyWithVideo({ source: finalPath });
      fs.unlinkSync(finalPath);
    }
  } catch (error) {
    if (waiting) await ctx.telegram.editMessageText(ctx.chat.id, waiting.message_id, null, "❌ Xatolik.").catch(() => {});
  } finally {
    if (waiting) await ctx.deleteMessage(waiting.message_id).catch(() => {});
  }
}

// ================= SMART CONTROLLER =================
bot.on("message", async (ctx) => {
  if (ctx.from.id === ADMIN_ID && ctx.session.adminMode === "send_post") {
    ctx.session.adminMode = null;
    const users = await User.find();
    ctx.reply(`📢 Reklama tarqatilmoqda...`);
    let success = 0;
    for (const user of users) {
      try {
        await ctx.telegram.copyMessage(user.telegramId, ctx.chat.id, ctx.message.message_id);
        success++;
      } catch (err) {}
    }
    return ctx.reply(`✅ Reklama tarqatildi! Muvaffaqiyatli: ${success}/${users.length}`);
  }

  if (!ctx.message.text) return;
  const text = ctx.message.text.trim();
  
  if (text === "🎬 Kino (Treyler) qidirish" || text === "🎵 Musiqa qidirish" || text === "📊 Statistika" || text === "📢 Xabar yuborish" || text === "⬅️ Bosh menyu") return;

  if (/https?:\/\//.test(text)) {
    const shortKey = crypto.randomUUID().slice(0, 8);
    ctx.session[shortKey] = text;
    return ctx.reply("📥 Havola aniqlandi. Formatni tanlang:", Markup.inlineKeyboard([
      [Markup.button.callback("🎥 Video (MP4)", `fmt_v_${shortKey}`), Markup.button.callback("🎵 Audio (MP3)", `fmt_m_${shortKey}`)]
    ]));
  }

  if (!ctx.session.mode) ctx.session.mode = "music";
  await searchYouTubeLive(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

// ================= BUTTON ACTIONS =================
bot.action(/fmt_(v|m)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    const url = ctx.session[ctx.match[2]];
    if (!url) return ctx.reply("❌ Seans muddati tugagan.");
    await downloadAndSend(ctx, url, ctx.match[1] === "m");
  } catch (e) {}
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    await downloadAndSend(ctx, `https://youtube.com/watch?v=${ctx.match[2]}`, ctx.match[1] === "m");
  } catch (e) {}
});

// ================= START BOT =================
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log("🔥 BOT IS LIVE AND FULLY STABLE WITH HTML ESCAPING!"))
  .catch((err) => console.error(err.message));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));