// Uploads a food photo to Supabase Storage and points foods.image_url at it,
// replacing whatever placeholder (base64 or otherwise) was there before.
//
// Usage: node scripts/upload-food-image.mjs <foodId> <path-to-image>
// Example: node scripts/upload-food-image.mjs r01 "./Menu tuần 1/Thịt chiên riềng xả.png"
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

const [, , foodId, filePath] = process.argv;
if (!foodId || !filePath) {
  console.error('Usage: node scripts/upload-food-image.mjs <foodId> <path-to-image>');
  process.exit(1);
}
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
  const { data: food, error: foodErr } = await supabase
    .from('foods')
    .select('id,name,category')
    .eq('id', foodId)
    .maybeSingle();
  if (foodErr) throw foodErr;
  if (!food) {
    console.error(`No food row with id "${foodId}" — check public/foods.json for the right id.`);
    process.exit(1);
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
