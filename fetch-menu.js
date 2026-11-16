// Menüyü kaynak siteden çekip menu.json'a yazar. Yalnızca Node stdlib kullanır.
// Kullanım: node fetch-menu.js        (günde 1 kez çalıştırılması yeterli)
const http = require('http');
const fs = require('fs');
const path = require('path');

// Kaynak adres herkese açık depoda görünmesin diye koda yazılmadı:
// önce MENU_URL ortam değişkeni (GitHub Secret), yoksa yanındaki menu-url.txt okunur.
const URL_ = (process.env.MENU_URL || (fs.existsSync(path.join(__dirname, 'menu-url.txt')) ? fs.readFileSync(path.join(__dirname, 'menu-url.txt'), 'utf8') : '')).trim();
if (!URL_) { console.error('HATA: MENU_URL ya da menu-url.txt yok'); process.exit(1); }
const OUT = path.join(__dirname, 'menu.json');
const MEALS = ['ÖĞLE', 'AKŞAM', 'GECE'];       // gösterilecek öğünler
const VARIANTS = ['NORMAL', 'SALATBAR'];       // gösterilecek menü türleri

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { 'User-Agent': 'YemekListesi/1.0 (is-yeri-ici-menu-gosterimi)' }, timeout: 30000 }, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('zaman aşımı')));
    req.on('error', reject);
  });
}

const clean = s => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

function parse(html) {
  const out = { date: null, meals: {} };
  for (const t of html.split('<table').slice(1)) {
    const h = t.match(/<th colspan="2"[^>]*>([^<]*)<\/th>\s*<th[^>]*>([^<]*)<\/th>/);
    if (!h) continue;
    const date = h[1].trim();
    const [meal, variant] = h[2].split('-').map(s => s.trim().toLocaleUpperCase('tr'));
    if (!MEALS.includes(meal) || !VARIANTS.includes(variant)) continue;
    out.date = date;
    const body = (t.split('<tbody>')[1] || '').split('</tbody>')[0];
    const dishes = [];
    for (const part of body.split('class="baslik2"').slice(1)) {
      const n = part.match(/<span class="d-block">([^<]*)<\/span>/);
      if (!n) continue;
      const name = clean(n[1]).replace(/^\d+\s*-\s*/, '');
      const a = part.match(/<tr class="alerjen">([\s\S]*?)<\/tr>/);
      const allergens = a ? [...a[1].matchAll(/<span>([^<]*)<\/span>/g)].map(m => clean(m[1]).replace(/^[|,;\s]+/, '')).filter(Boolean) : [];
      dishes.push({ name, allergens, section: variant });
    }
    out.meals[meal] = (out.meals[meal] || []).concat(dishes);
  }
  return out;
}

function todayTR() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

(async () => {
  const data = parse(await get(URL_));
  if (!data.date || !Object.keys(data.meals).length) throw new Error('Sayfada menü bulunamadı (yapı değişmiş olabilir)');
  if (data.date !== todayTR()) throw new Error(`Sayfadaki tarih (${data.date}) bugün (${todayTR()}) değil, menu.json değiştirilmedi`);
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf8');
console.log('Yazıldı:', OUT, '-', data.date, Object.entries(data.meals).map(([k, v]) => `${k}:${v.length}`).join(' '));
})().catch(e => { console.error('HATA:', e.message); process.exit(1); });
