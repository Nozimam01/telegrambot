require("dotenv").config();

const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");
const yts = require("yt-search");
const axios = require("axios");
const mongoose = require("mongoose");

// ================= EXPRESS =================
const app = express();
app.get("/", (req, res) => res.send("🔥 V13 PRO MULTI DOWNLOADER RUNNING"));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("PORT:", PORT));

// ================= DATABASE (MONGODB) =================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://botuser:botpass2026@cluster0.ixwxk0c.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("🍃 MongoDB ma'lumotlar bazasiga muvaffaqiyatli ulandi!"))
  .catch((err) => console.error("❌ MongoDB ulanishida xatolik:", err.message));

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: { type: String, default: "Mavjud emas" },
  firstName: { type: String, default: "Ismsiz" },
  joinedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// ================= BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID || 123456789;

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ||= {};
  return next();
});

const mainMenu = Markup.keyboard([
  ["🎵 Musiqa qidirish", "🎬 Kino (Trailer) qidirish"]
]).resize();

const DIR = "/tmp";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

// ================= JOB CONTROL =================
const queue = [];
let running = false;

function addJob(job) {
  queue.push(job);
  if (!running) worker();
}

async function worker() {
  running = true;

  while (queue.length) {
    const job = queue.shift();
    const msg = await job.ctx.reply("⏳ Fayl yuklanmoqda, kuting...").catch(() => null);

    try {
      const cleanTitle = (job.title || "Media").replace(/[\\/:*?"<>|]/g, " ").trim();
      const randomId = crypto.randomUUID().slice(0, 4);
      const safeFileName = `${cleanTitle.slice(0, 30)}_${randomId}`;

      const file = await download(job.url, job.type, safeFileName);

      if (msg) {
        await job.ctx.telegram.editMessageText(job.ctx.chat.id, msg.message_id, null, "🚀 Fayl tayyor! Telegramga yuborilmoqda...").catch(() => {});
      }

      if (job.type === "audio") {
        await job.ctx.replyWithAudio({
          source: file,
          title: cleanTitle,
          performer: "V13 Downloader"
        });
      } else {
        await job.ctx.replyWithVideo({
          source: file,
          caption: `🎬 Barcha ijtimoiy tarmoqlardan yuklovchi bot`
        });
      }

      if (fs.existsSync(file)) fs.unlinkSync(file);
      if (msg) await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    } catch (e) {
      console.log("DOWNLOAD ERROR DETAILS:", e);
      job.ctx.reply(`❌ Yuklab bo'lmadi. Havola noto'g'ri, yopiq profildan olingan yoki yuklash limiti oshib ketgan.`);
      if (msg) await job.ctx.deleteMessage(msg.message_id).catch(() => {});
    }
  }

  running = false;
}

// ================= DOWNLOAD FUNCTION =================
function download(url, type, fileName) {
  return new Promise((resolve, reject) => {
    const ext = type === "audio" ? "mp3" : "mp4";
    const outPath = path.join(DIR, `${fileName}.${ext}`);
    
    let cmd = `npx yt-dlp --no-playlist --no-warnings --quiet --max-filesize 2G -o "${outPath}" "${url}"`;
    
    if (type === "audio") {
      cmd += ` -x --audio-format mp3 --audio-quality 5`;
    } else {
      cmd += ` -f "mp4/bestvideo+bestaudio/best"`;
    }

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`yt-dlp xatosi: ${stderr || error.message}`));
      }
      if (!fs.existsSync(outPath)) {
        return reject(new Error("Fayl topilmadi"));
      }
      resolve(outPath);
    });
  });
}

// ================= BOT COMMANDS =================
bot.start(async (ctx) => {
  ctx.session = {};
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
    console.error("Foydalanuvchini saqlashda xatolik:", err.message);
  }
  ctx.reply("🚀 V13 MULTI DOWNLOADER BOT\n\nYouTube, TikTok, Instagram yoki Facebook havolasini yuboring!", mainMenu);
});

bot.command("statistika", async (ctx) => {
  if (ctx.from.id !== Number(ADMIN_ID)) return ctx.reply("❌ Faqat admin uchun.");
  try {
    const totalUsers = await User.countDocuments();
    ctx.reply(`👥 Jami foydalanuvchilar soni: *${totalUsers} ta*`, { parse_mode: "Markdown" });
  } catch (err) { ctx.reply("Xatolik yuz berdi."); }
});

bot.command("users", async (ctx) => {
  if (ctx.from.id !== Number(ADMIN_ID)) return ctx.reply("❌ Faqat admin uchun.");
  try {
    const users = await User.find().sort({ joinedAt: -1 });
    if (!users.length) return ctx.reply("👥 Baza hozircha bo'sh.");

    let msg = "👥 *Bot foydalanuvchilari ro'yxati:*\n\n";
    users.forEach((user, index) => {
      msg += `${index + 1}. 👤 *${user.firstName}* - ${user.username}\n   └ ID: \`${user.telegramId}\`\n\n`;
    });

    if (msg.length > 4000) {
      const chunks = msg.match(/[\s\S]{1,4000}/g);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      }
    } else {
      ctx.reply(msg, { parse_mode: "Markdown" });
    }
  } catch (err) {
    ctx.reply("❌ Ro'yxatni yuklashda xatolik yuz berdi.");
  }
});

bot.hears("🎵 Musiqa qidirish", (ctx) => {
  ctx.session.mode = "music";
  const musicInline = Markup.inlineKeyboard([
    [Markup.button.callback("🔥 Trend qo'shiqlar", "fast_search_Trend qo'shiqlar 2026")],
    [Markup.button.callback("🎸 Uzbek Tarona", "fast_search_Uzbek taronalari")]
  ]);
  ctx.reply("🎵 Qo‘shiq yoki xonanda nomini yozing:", musicInline);
});

bot.hears("🎬 Kino (Trailer) qidirish", (ctx) => {
  ctx.session.mode = "movie";
  const movieInline = Markup.inlineKeyboard([
    [Markup.button.callback("🍿 Yangi Kinolar 2026", "fast_search_Yangi kinolar 2026")]
  ]);
  ctx.reply("🎬 Kino nomini yozing:", movieInline);
});

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
    return ctx.reply("📋 Natijalar topildi. Tanlang:", Markup.inlineKeyboard(buttons));
  } catch (err) { ctx.reply("Qidiruvda xatolik."); }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text === "🎬 Kino (Trailer) qidirish" || text === "🎵 Musiqa qidirish") return;
  
  if (/https?:\/\//.test(text)) {
    const encodedUrl = Buffer.from(text).toString('base64').replace(/=/g, '');
    ctx.session[encodedUrl] = text; 

    return ctx.reply(
      "📥 Havola aniqlandi. Formatni tanlang:", 
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎥 Video", `uni_v_${encodedUrl}`), 
          Markup.button.callback("🎵 MP3", `uni_m_${encodedUrl}`)
        ]
      ])
    );
  }
  
  if (!ctx.session.mode) return ctx.reply("Avval menyudan bo'limni tanlang yoki to'g'ridan-to'g'ri havola yuboring.", mainMenu);
  await search(ctx, ctx.session.mode === "movie" ? text + " trailer" : text);
});

bot.action(/fast_search_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  await search(ctx, ctx.match[1]);
});

bot.action(/dl_(m|v)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const typeFlag = ctx.match[1]; 
  const videoId = ctx.match[2];  
  const url = `https://youtube.com/watch?v=${videoId}`;
  addJob({ ctx, url, type: typeFlag === "m" ? "audio" : "video", title: "Media Fayl" });
});

bot.action(/uni_(v|m)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const typeFlag = ctx.match[1];
  const encodedUrl = ctx.match[2];
  const url = ctx.session[encodedUrl];
  
  if (!url) {
    return ctx.reply("❌ Havola muddati eskirgan. Iltimos, qaytadan yuboring.");
  }

  addJob({ ctx, url, type: typeFlag === "m" ? "audio" : "video", title: typeFlag === "m" ? "Audio" : "Video" });
});

bot.launch({ allowedUpdates: [], dropPendingUpdates: true })
  .then(() => console.log("🔥 V13 PRO STABLE READY"))
  .catch((err) => console.error("❌ Xatolik:", err.message));