/* eslint no-console: 0 */

const { LineBot, LineHandler } = require('bottender');
const { createServer } = require('bottender/express');
const airtable = require('airtable');
const ua = require('universal-analytics');
const kuroshiro = require('kuroshiro');

const mhxx = require('./mhxx');
const mhw = require('./mhw');

kuroshiro.init(err => {
  if (err) {
    console.log(`kuroshiro init failed: ${err}`);
  } else {
    console.log('kuroshiro init successed.');
  }
});

const visitor = ua('UA-105745910-1', { https: true });

let rulesCache = [];
let lastQueryDate;

async function fetchRules() {
  const CACHE_TIME = 60 * 1000;
  const current = new Date();
  let shouldUpdate = true;
  if (lastQueryDate) {
    shouldUpdate = current - lastQueryDate > CACHE_TIME;
  }
  if (shouldUpdate) {
    lastQueryDate = current;
    console.log('Query airtable', lastQueryDate);

    const base = airtable.base(process.env.AIRTABLE_BASE_ID);
    base('keyword')
      .select({
        view: 'Grid view',
      })
      .all()
      .then(newRules => {
        rulesCache = newRules || rulesCache;
      });
  }
  return rulesCache;
}

function toASCII(chars) {
  let ascii = '';
  for (let i = 0; i < chars.length; i += 1) {
    let c = chars[i].charCodeAt(0);
    // make sure we only convert half-full width char
    if (c >= 0xff00 && c <= 0xffef) {
      /* eslint-disable no-bitwise */
      c = 0xff & (c + 0x20);
      /* eslint-enable no-bitwise */
    }
    ascii += String.fromCharCode(c);
  }
  return ascii;
}

function matchRules(msg, rules) {
  const matchRule = rules.find(rule => {
    let text = msg;
    let key = rule.get('key');
    if (rule.get('insensitive')) {
      text = toASCII(text).toLowerCase().replace(/[()]/g, '');
      key = key.toLowerCase();
    }
    return text.includes(key);
  });
  return matchRule;
}

const rollWHandler = async context => {
  visitor.event('狩獵輪盤', 'MHW').send();
  await context.replyText(mhw.roulette());
};

const rollXXHandler = async context => {
  visitor.event('狩獵輪盤', 'MHXX').send();
  await context.replyText(mhxx.roulette());
};

const translationHandler = async (context, match) => {
  const src = match[1].trim();

  if (src) {
    visitor.event('假名翻譯', '假名翻譯', src).send();
    const result = kuroshiro.convert(src, {
      mode: 'okurigana',
      delimiter_start: ' ',
      delimiter_end: '\n',
    });
    await context.replyText(
      `${context.session.user.displayName}你的翻譯是：\n${result}`
    );
  }
};

const howHandler = async (context, match) => {
  const device = match[1].trim();
  visitor.event('組合回應', '設計失敗', device).send();
  const str = `${device}絕對不是設計失敗 是設計的太前衛了 一堆功能當時的用戶用不到才失敗\n\n${device}放到今天絕對大賣`;
  await context.replyText(str);
};

const keywordHandler = async context => {
  const rules = await fetchRules();

  const matchedRule = matchRules(context.event.text, rules);
  if (matchedRule) {
    visitor.event('關鍵字回應', matchedRule.get('key')).send();
    const type = matchedRule.get('type');
    switch (type) {
      case 'text': {
        const text = matchedRule.get('text').replace(/\\n/g, '\n');
        await context.replyText(text);
        break;
      }
      case 'image': {
        if (matchedRule.get('image')) {
          await context.replyImage(matchedRule.get('image')[0].url);
        }
        break;
      }
      default: {
        break;
      }
    }
  }
};

const handler = new LineHandler()
  .onText(/^\/roll$/i, rollWHandler)
  .onText(/^\/roll -xx$/i, rollXXHandler)
  .onText(/^巨巨幫我翻譯[:|：]?\s*(.*)/, translationHandler)
  .onText(/巨巨覺得(.*)怎麼樣/, howHandler)
  .onText(keywordHandler);

const bot = new LineBot({
  channelSecret: process.env.ChannelSecret,
  accessToken: process.env.ChannelAccessToken,
});

bot.onEvent(handler);

const server = createServer(bot);
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`server is running on ${PORT}...`);
});
