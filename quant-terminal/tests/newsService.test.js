const assert = require('assert');
const newsService = require('../server/services/newsService');

console.log('🧪 Starting News & Sentiment Service Tests...\n');

// Test 1: Fetch all news
const allNews = newsService.getNews('ALL');
assert(Array.isArray(allNews), 'News items should be an array');
assert(allNews.length >= 5, 'Should have at least 5 curated news items');
console.log('  ✔ NewsService returns complete news catalog');

// Test 2: Filter by category
const goldNews = newsService.getNews('GOLD');
assert(goldNews.length > 0, 'Should have gold news items');
assert(goldNews.every(n => n.category === 'GOLD'), 'All filtered items must be in GOLD category');
console.log('  ✔ Category filtering works correctly');

// Test 3: Sentiment score validity
const sentiment = newsService.getSentiment();
assert(typeof sentiment.score === 'number', 'Sentiment score must be numeric');
assert(sentiment.score >= 0 && sentiment.score <= 100, 'Sentiment score must be 0-100');
assert(typeof sentiment.label === 'string', 'Sentiment label must be string');
console.log('  ✔ Market Sentiment score and label conform to bounds');

// Test 4: Telegram formatting
const formattedTg = newsService.formatTelegramNews();
assert(typeof formattedTg === 'string', 'Formatted Telegram message should be string');
assert(formattedTg.includes('BREAKING FINANCIAL NEWS'), 'Must contain header');
assert(formattedTg.includes('Macro Sentiment:'), 'Must include sentiment score');
console.log('  ✔ Telegram news broadcast formatting validated');

console.log('\n🎉 ALL NEWS SERVICE TESTS PASSED SUCCESSFULLY!\n');
