require("dotenv").config();
const { Telegraf } = require("telegraf");
const LocalSession = require("telegraf-session-local");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(new LocalSession({ database: "session.json" }).middleware());

const YT_DLP_PATH = "/usr/local/bin/yt-dlp";
const MP3_DIR = path.join(__dirname, "../public/mp3");
const MP4_DIR = path.join(__dirname, "../public/mp4");
const ERROR_LOG = path.join(__dirname, "error_download.json");

// 🔹 Agar kataloglar mavjud bo‘lmasa, ularni yaratish
if (!fs.existsSync(MP3_DIR)) fs.mkdirSync(MP3_DIR, { recursive: true });
if (!fs.existsSync(MP4_DIR)) fs.mkdirSync(MP4_DIR, { recursive: true });

// 🔹 Agar error_download.json mavjud bo‘lmasa, yaratib qo‘yish
if (!fs.existsSync(ERROR_LOG)) {
    fs.writeFileSync(ERROR_LOG, JSON.stringify([], null, 2));
}

// 🗑 Fayllarni avtomatik o‘chirish
function deleteFile(filePath) {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑 Deleted: ${filePath}`);
        }
    }, 5000);
}

// ❌ Xatoliklarni JSON-ga yozish
function logError(url, username, chatId, errorMsg) {
    const errorData = {
        time: new Date().toISOString(),
        url,
        username: username || "Unknown",
        chatId,
        error: errorMsg
    };

    let errors = [];
    try {
        if (fs.existsSync(ERROR_LOG)) {
            const data = fs.readFileSync(ERROR_LOG, "utf8");
            errors = JSON.parse(data);
            if (!Array.isArray(errors)) {
                errors = []; // JSON formati noto‘g‘ri bo‘lsa, bo‘sh array
            }
        }
    } catch (err) {
        console.error("❌ JSON faylni o‘qishda xatolik:", err);
        errors = []; // Xatolik yuz bersa, bo‘sh array
    }

    errors.push(errorData);

    try {
        fs.writeFileSync(ERROR_LOG, JSON.stringify(errors, null, 2));
    } catch (err) {
        console.error("❌ JSON faylni yozishda xatolik:", err);
    }
}

// 📥 Video yuklab olish
async function downloadVideo(url, chatId, ctx) {
    try {
        const isYTB = url.includes("youtube.com") || url.includes("youtu.be");
        const fileId = Date.now();
        const fileName = `video_${fileId}.${isYTB ? "webm" : "mp4"}`;
        const filePath = path.join(MP4_DIR, fileName);

        // **ctx.session mavjudligini tekshirish**
        if (!ctx.session) {
            ctx.session = {}; // Agar mavjud bo‘lmasa, bo‘sh obyekt sifatida yaratish
        }

        if (!ctx.session[chatId]) {
            ctx.session[chatId] = { urls: [] };
        }

        // **urls massiv ekanligiga ishonch hosil qilish**
        if (!Array.isArray(ctx.session[chatId].urls)) {
            ctx.session[chatId].urls = [];
        }

        ctx.session[chatId].urls.push({ id: fileId, url });
        
        const loadingMessage = await ctx.reply("⏳");
        
        exec(`"${YT_DLP_PATH}" --age-limit 0 --no-check-certificate -o "${filePath}" "${url}"`, async(error, stdout, stderr) => {
            if (error) {
                await ctx.deleteMessage(loadingMessage.message_id);
                console.error("❌ Yuklab olishda xato:", error);
                ctx.reply("❌ Video yuklab bo‘lmadi.");
                logError(url, ctx.from?.username || "Unknown", chatId, stderr);
                return;
            }
            await ctx.deleteMessage(loadingMessage.message_id);
            ctx.replyWithVideo(
                { source: filePath },
                {
                    caption: `🎵 Musiqa yuklab olish uchun 👇👇\n[MediaDownloader](https://t.me/sector_downloader_bot)`,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🎵 Download Music", callback_data: `music_${fileId}` }]
                        ]
                    }
                }
            ).then(() => deleteFile(filePath));
        });

    } catch (error) {
        console.log("❌ Xato:", error);
    }
}

bot.start((ctx) => {
    const chatId = ctx.chat.id;

    // Agar chatId 7368717487 bo'lsa, tugmani qo'shamiz
    if (chatId === 7368717487) {
        ctx.reply("👋 Salom! Yuklab olish uchun link yuboring.", {
            reply_markup: {
                keyboard: [[{ text: "📄 Error Log" }]],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    } else {
        ctx.reply("👋 Salom! Yuklab olish uchun link yuboring.");
    }
});

// "📄 Error Log" tugmasi bosilganda fayl yuborish
bot.hears("📄 Error Log", async (ctx) => {
    const chatId = ctx.chat.id;

    if (chatId !== 7368717487) {
        return ctx.reply("⛔ Sizga bu tugmani ishlatish mumkin emas.");
    }

    const logFilePath = path.join(__dirname, "error_download.json"); // Error log fayli yo'li

    try {
        await ctx.replyWithDocument({ source: logFilePath, filename: "error.json" });
    } catch (error) {
        console.error("❌ Log fayl yuborishda xato:", error);
        ctx.reply("❌ Log faylni topib bo‘lmadi.");
    }
});

// 📥 Callback orqali musiqa yuklash
bot.on("callback_query", async (ctx) => {
    try {
        const chatId = ctx.callbackQuery.message.chat.id;
        const callbackData = ctx.callbackQuery.data;

        if (!callbackData.startsWith("music_")) {
            return ctx.answerCbQuery("❌ Noto‘g‘ri callback.");
        }

        const fileId = callbackData.split("_")[1];

        const sessionData = ctx.session[chatId];
        if (!sessionData || !sessionData.urls) {
            return ctx.answerCbQuery("❌ Musiqa URL topilmadi.");
        }

        const urlData = sessionData.urls.find(item => item.id == fileId);
        if (!urlData) {
            return ctx.answerCbQuery("❌ Ushbu fayl bo‘yicha URL topilmadi.");
        }

        const url = urlData.url;
        const audioFile = `music_${fileId}.mp3`;
        const audioPath = path.join(MP3_DIR, audioFile);

        const loadingMessage = await ctx.reply("⏳");

        exec(`"${YT_DLP_PATH}" --extract-audio --audio-format mp3 --audio-quality 0 --no-check-certificate -o "${audioPath}" "${url}"`, async (error, stdout, stderr) => {
            if (error) {
                console.error("❌ Musiqa yuklab olishda xato:", error);
                logError(url, ctx.from.username, chatId, stderr);
                await ctx.deleteMessage(loadingMessage.message_id);
                return ctx.reply("❌ Musiqa yuklab bo‘lmadi.");
            }

            if (!fs.existsSync(audioPath)) {
                console.error("❌ Yuklab olingan fayl topilmadi:", audioPath);
                await ctx.deleteMessage(loadingMessage.message_id);
                return ctx.reply("❌ Yuklab olingan fayl topilmadi.");
            }

            await ctx.deleteMessage(loadingMessage.message_id);
            await ctx.replyWithAudio(
                { source: audioPath },
                {
                    caption: `📥 Yuklab olingan musiqa`,
                    parse_mode: "Markdown",
                }
            ).then(() => deleteFile(audioPath));
        });
    } catch (error) {
        console.error("❌ Callback query handlerda xatolik:", error);
    }
});

// 📩 Foydalanuvchi video yoki musiqa yuklab olishi uchun URL yuborishi kerak
bot.on("text", async (ctx) => {
    const url = ctx.message.text;
    if (!url.includes("instagram.com") && !url.includes("youtube.com") && !url.includes("youtu.be")) {
        return ctx.reply("❌ Iltimos, faqat Instagram yoki YouTube havolasini yuboring.");
    }
    downloadVideo(url, ctx.chat.id, ctx);
});

// 🚀 Botni ishga tushirish
(async () => {
    try {
        bot.launch();
        console.log("🚀 Bot ishga tushdi!");
    } catch (error) {
        console.error("❌ Botni ishga tushirishda xatolik:", error);
    }
})();

// 🛑 Botni to‘xtatish uchun signal handler
process.on('SIGINT', async () => {
    console.log("❌ Bot to‘xtatilmoqda...");
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log("❌ Bot server tomonidan to‘xtatildi...");
    bot.stop();
    process.exit(0);
});
