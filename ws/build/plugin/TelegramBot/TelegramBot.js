// Remove warning
process.env.NTBA_FIX_319 = 1;

const os = require('os');
const config = require('../../../config.json')
const TelegramBot = require('node-telegram-bot-api');
const token = config.telegramBotKey;
const chatId = '-100' + config.telegramChatId;

module.exports.prepare = (msg, ...args) => {
    try {
        var msgBody = msg;
        if (typeof msg == 'object') {
            msg = "```"+ JSON.stringify(msg) +"```";
        }

        msgBody = `🔔 [SERVER] *${os.hostname()}*\n\n${msg}`;
        
        // Send
        this.send(msgBody, {}).catch(console.error)
    } catch (e) {
        // Ignore
        return e;
    }
}

module.exports.send = async (msg = 'Message is not set.', ...args) => {
    try {
        let options = args[0] || {};

        const bot = new TelegramBot(token, {
            polling: false // Disable waiting
        });
    
        let isSent = await bot.sendMessage(chatId, msg, {
            parse_mode: 'Markdown',
            ...options
        })
        .then(e => true)
        .catch(e => {
            console.error(e.message)
            return false
        })

        await bot.close()

        return isSent
    } catch (e) {
        return e
    }
}
