import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SessionSchema, UploadUrlResponseSchema } from '@telemetry/shared';

// Define the bindings (The resources we configured in wrangler.json)
type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// 1. Enable CORS (So your React app can talk to this Worker)
app.use('/*', cors());

// --- ROUTE 1: Get Upload URL (For saving files) ---
// Frontend asks: "I have a file named session_123.csv, give me a link to upload it."
app.put('/api/upload-url', async (c) => {
  const fileName = c.req.query('fileName');
  if (!fileName) return c.json({ error: 'fileName is required' }, 400);

  // Create a unique key for the file
  const key = `${Date.now()}_${fileName}`;

  // Generate a pre-signed URL valid for 10 minutes (600 seconds)
  // Note: In local dev, R2 doesn't support pre-signed URLs perfectly, 
  // so we do a simplified logic, but this standard code works in production.
  const signedUrl = await c.env.BUCKET.get(key); 
  // WAIT: R2 Signed URLs are tricky in Workers. 
  // For simple "Free" usage, we usually use the standard AWS SDK, 
  // OR for simplicity in this stack, we can proxy the upload if signed URLs are too complex.
  
  // ACTUALLY: To keep this "High End" and simple without extra AWS SDK bloat:
  // We will use a PUT endpoint where the frontend sends the file to the WORKER,
  // and the WORKER streams it to R2. It's slightly less efficient than direct-to-R2 
  // but requires ZERO external dependencies.
  
  return c.json({ message: "For this stack, we will stream uploads directly via the API for simplicity." });
});

// Let's Rewrite the Upload Logic to be simpler for your first iteration:
// Frontend -> POST /api/upload -> Worker -> R2
app.post('/api/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file']; // Expecting form-data with 'file'

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const fileName = `${Date.now()}_${file.name}`;
  
  // Stream to R2
  await c.env.BUCKET.put(fileName, file.stream());

  return c.json({ 
    success: true, 
    fileName: fileName 
  });
});

// --- ROUTE 2: Get Session Metadata (List) ---
app.get('/api/sessions', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM Session ORDER BY startTime DESC'
  ).all();
  return c.json(results);
});

// --- ROUTE 3: Save Session Metadata ---
app.post('/api/sessions', async (c) => {
  // 1. Validate Input using our Shared Zod Schema
  const body = await c.req.json();
  const result = SessionSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const session = result.data;

  // 2. Insert into D1
  const info = await c.env.DB.prepare(`
    INSERT INTO Session (csvFileName, monopostId, trackId, driverId, startTime, endTime)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    session.csvFileName,
    session.monopostId,
    session.trackId,
    session.driverId,
    session.startTime,
    session.endTime
  ).run();

  return c.json({ success: true, id: info.meta.last_row_id });
});

// --- ROUTE 4: Download File ---
app.get('/api/download/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.BUCKET.get(filename);

  if (object === null) {
    return c.text('File not found', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, {
    headers,
  });
});

export default app;