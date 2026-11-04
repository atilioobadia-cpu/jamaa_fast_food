// Downloads demo food photography from Wikimedia Commons (CC licensed) into public/images/food.
// Run once during setup: node scripts/fetch-images.mjs
import fs from "node:fs/promises";
import path from "node:path";

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "JamaaFastFoodDemo/1.0 (prototype setup; contact: demo@jamaa.co.tz)";
const OUT = path.resolve("public/images/food");

const WANTED = {
  "hero-feast": "Traditional Tanzanian food - pilau kuku, mishkaki, ndizi, &c..JPG",
  "cheeseburger": "190524-classic-american-cheeseburger-ew-207p.jpg",
  "double-burger": "Beautiful Burger.jpg",
  "fries": "941f50-splendid-table-french-fries.jpg",
  "fried-chicken": "Boneless Fried Chicken.jpg",
  "chips-mayai": "Chips mayai na mboga mboga (Zege).jpg",
  "chapati": "2 Chapati warm and ready to be eaten.jpg",
  "pilau": "Pilau lovers here we go.jpg",
  "mishkaki": "Mishkaki, Chipsi and Traditional Kachumbari (E-African Salsa).jpg",
  "samosa": "Kerala samosa.jpg",
  "juice-orange": "02024 1286 Orange juice.jpg",
  "juice-mango": "Glass of Mango Juice.jpg",
  "cola": "Glass cola.jpg",
  "tea": "A cup of black tea with biscuits.jpg",
  "milkshake": "Batido en cadena de restaurantes Johnny Rockets (Los Angeles, California).jpg",
  "chicken-chips": "Benny&Co Chicken Leg with Fries Meal.jpg",
  "club-sandwich": "Club-sandwich.jpg",
  "grilled-chicken": "Chicken Alfaham Grilled pieces.jpg",
};

const credits = [];

async function infoFor(title) {
  const url = `${API}?action=query&format=json&titles=${encodeURIComponent("File:" + title)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const json = await res.json();
  const page = Object.values(json.query?.pages ?? {})[0];
  return page?.imageinfo?.[0];
}

await fs.mkdir(OUT, { recursive: true });

for (const [slug, title] of Object.entries(WANTED)) {
  try {
    const info = await infoFor(title);
    if (!info?.thumburl) {
      console.log(`SKIP ${slug}: no image info`);
      continue;
    }
    const res = await fetch(info.thumburl, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.log(`FAIL ${slug}: HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(path.join(OUT, `${slug}.jpg`), buf);
    const meta = info.extmetadata ?? {};
    credits.push({
      slug,
      title,
      file: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title).replace(/%20/g, "_")}`,
      artist: (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim(),
      license: meta.LicenseShortName?.value ?? "see Commons",
    });
    console.log(`OK ${slug} ${Math.round(buf.length / 1024)}KB`);
  } catch (err) {
    console.log(`ERR ${slug}: ${err.message}`);
  }
}

const lines = [
  "# Food image credits",
  "",
  "Demo photography sourced from Wikimedia Commons. Replace with Jamaa Fast Food's own",
  "photography before going live.",
  "",
  "| File | Source | Author | License |",
  "| --- | --- | --- | --- |",
  ...credits.map((c) => `| ${c.slug}.jpg | [${c.title}](${c.file}) | ${c.artist} | ${c.license} |`),
  "",
];
await fs.writeFile(path.join(OUT, "CREDITS.md"), lines.join("\n"));
console.log("credits written");
