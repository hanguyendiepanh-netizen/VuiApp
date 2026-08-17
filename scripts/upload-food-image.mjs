// Uploads a food photo to Supabase Storage and points foods.image_url at it,
// replacing whatever placeholder (base64 or otherwise) was there before.
// If <foodId> doesn't exist yet, pass --name/--category to create it first.
//
// Usage: node scripts/upload-food-image.mjs <foodId> <path-to-image> [--name "Tên món" --category rice|breakfast]
// Example (existing food): node scripts/upload-food-image.mjs r01 "./Menu tuần 1/Thịt chiên riềng xả.png"
// Example (new food):      node scripts/upload-food-image.mjs r21 "./Menu tuần 1/Bò om dưa chua.png" --name "Bò om dưa chua" --category rice
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'food-images';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const [, , foodId, filePath, ...rest] = process.argv;
if (!foodId || !filePath) {
  console.error('Usage: node scripts/upload-food-image.mjs <foodId> <path-to-image> [--name "..." --category rice|breakfast]');
  process.exit(1);
}
function flag(name) {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? null : rest[i + 1];
}
const newName = flag('name');
const newCategory = flag('category');
if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked .env.local).');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets.some((b) => b.name === BUCKET)) return;
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB'
  });
  if (createErr) throw createErr;
  console.log(`Created public bucket "${BUCKET}".`);
}

async function main() {
  let { data: food, error: foodErr } = await supabase
    .from('foods')
    .select('id,name,category')
    .eq('id', foodId)
    .maybeSingle();
  if (foodErr) throw foodErr;

  if (!food) {
    if (!newName || !newCategory) {
      console.error(
        `No food row with id "${foodId}". To create it, pass --name "Tên món" --category rice|breakfast.`
      );
      process.exit(1);
    }
    const { count } = await supabase
      .from('foods')
      .select('id', { count: 'exact', head: true })
      .eq('category', newCategory);
    const { data: created, error: createErr } = await supabase
      .from('foods')
      .insert({ id: foodId, name: newName, category: newCategory, display_order: (count ?? 0) + 1 })
      .select('id,name,category')
      .single();
    if (createErr) throw createErr;
    food = created;
    console.log(`Created new food "${foodId}" (${newName}, ${newCategory}).`);
  } else if (newName && newName !== food.name) {
    const { error: renameErr } = await supabase.from('foods').update({ name: newName }).eq('id', foodId);
    if (renameErr) throw renameErr;
    console.log(`Renamed ${foodId}: "${food.name}" -> "${newName}"`);
    food = { ...food, name: newName };
  }

  await ensureBucket();

  const ext = path.extname(filePath) || '.jpg';
  const storagePath = `${food.category}/${foodId}${ext}`;
  const fileBuffer = readFileSync(filePath);
  const contentType = ext.toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, { contentType, upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub.publicUrl;

  const { error: updateErr } = await supabase
    .from('foods')
    .update({ image_url: publicUrl, image_size_kb: Math.round(fileBuffer.byteLength / 1024) })
    .eq('id', foodId);
  if (updateErr) throw updateErr;

  console.log(`✓ ${foodId} (${food.name}) -> ${publicUrl}`);
}

main().catch((e) => {
  console.error('Failed:', e.message || e);
  process.exit(1);
});
