import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SessionSchema, DriverSchema, MonopostSchema, TrackSchema, TimestampSchema } from '@telemetry/shared'; // Ensure all schemas are imported

// Define the bindings
type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// 1. Enable CORS
app.use('/*', cors());

// --- FILE UPLOAD (R2) ---
app.post('/api/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const fileName = `${file.name}`;
  await c.env.BUCKET.put(fileName, file.stream());

  return c.json({ success: true, fileName: fileName });
});

// --- FILE DOWNLOAD (R2) ---
app.get('/api/download/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.BUCKET.get(filename);

  if (object === null) {
    return c.text('File not found', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
});


// --- SESSION METADATA (D1) ---

// GET /api/sessions (All Sessions) - ✅ Existing Route
app.get('/api/sessions', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM Session ORDER BY date DESC, time DESC'
  ).all();
  return c.json(results);
});

// GET /api/sessions/:id (Single Session) - ❌ NEW
app.get('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM Session WHERE id = ?'
  ).bind(id).all();
  
  if (!results || results.length === 0) {
    return c.json({ error: 'Session not found' }, 404);
  }
  return c.json(results[0]);
});

// POST /api/sessions (Create Session) - ✅ Existing Route
app.post('/api/sessions', async (c) => {
  const body = await c.req.json();
  const result = SessionSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  const session = result.data;

  
  const info = await c.env.DB.prepare(`
    INSERT INTO Session (csvFileName, trackId, date, time)
    VALUES (?, ?, ?, ?)`
  ).bind(
    session.csvFileName,
    session.trackId,
    session.date,
    session.time
  ).run();

  return c.json({ success: true, id: info.meta.last_row_id });
});

// DELETE /api/sessions/:id - ❌ NEW
app.delete('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const sessionResult = await c.env.DB.prepare(
    'SELECT csvFileName FROM Session WHERE id = ?'
  ).bind(id).first<{ csvFileName: string }>();
  if (!sessionResult || !sessionResult.csvFileName) {
    await c.env.DB.prepare('DELETE FROM Session WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: 'Metadata deleted, file not found or already gone.' });
  }

  const fileName = sessionResult.csvFileName;

  await c.env.DB.prepare('DELETE FROM Session WHERE id = ?').bind(id).run();

  try {
    
    await c.env.BUCKET.delete(fileName);
    return c.json({ success: true, message: 'Session and file deleted.' });

  } catch (error) {

    console.error(`Failed to delete R2 file ${fileName}:`, error);
    return c.json({ success: true, message: 'Metadata deleted, R2 deletion failed.' }, 500);
  }
});

// --- DRIVER METADATA (D1) ---

// GET /api/drivers - ❌ NEW
app.get('/api/drivers', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Driver').all();
  return c.json(results);
});

//GET /api/drivers/:id (Single driver)
app.get('/api/drivers/:id',async (c)=>{
  const id=c.req.param("id");
  const {results} = await c.env.DB.prepare(
    'SELECT * FROM Driver WHERE id=?'
  ).bind().all();

  if(!results || results.length === 0) return c.json({error:'Driver not found'},404);
  return c.json(results[0]);
})

// POST /api/drivers - ❌ NEW
app.post('/api/drivers', async (c) => {
  const body = await c.req.json();
  const result = DriverSchema.safeParse(body);
  if (!result.success) return c.json({ error: result.error }, 400);

  const driver = result.data;
  await c.env.DB.prepare(
    'INSERT INTO Driver (name, weight, other) VALUES (?, ?, ?)'
  ).bind(driver.name, driver.weight, driver.other).run();

  return c.json({ success: true });
});

//DELETE app/drivers/:id
app.delete('app/drivers/:id',async (c) => {
  const id=c.req.param('id');
  await c.env.DB.prepare('DELETE FROM Driver WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// --- TRACK METADATA (D1) ---

//POST /api/tracks
app.post('/api/tracks', async (c)=>{
  const body = await c.req.json();
  const result=TrackSchema.safeParse(body);
  if(!result.success) return c.json({error:result.error})
  const track = result.data;
  await c.env.DB.prepare(
    'INSERT INTO Track (name, gates, coordinates) VALUES (?, ?, ?)'
  ).bind(
    track.name,
    track.gates,
    track.coordinates
  ).run();

  return c.json({ success: true });
});

// GET /api/tracks - ❌ NEW
app.get('/api/tracks', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Track').all();
  return c.json(results);
});

//GET /api/tracks/:id

app.get('/api/tracks/:id', async (c)=>{
  const id=c.req.param('id');
  const {results}= await c.env.DB.prepare(
    'SELECT * FROM Track WHERE id = ?'
  ).bind(id).all();

  if(!results||results.length===0) return c.json({error:"Driver not found"},404);
  return c.json(results[0]);
})

//DELETE /api/tracks/:id
app.delete('/api/tracks/:id',async (c)=>{
  const id=c.req.param('id');
  await c.env.DB.prepare('DELETE FROM Track WHERE id=?').bind(id).run();

  return c.json({success: true});
});

// --- MONOPOST METADATA (D1) ---

// POST /api/monoposts - ❌ NEW
app.post('/api/monoposts', async (c) => {
  const body = await c.req.json();
  const result = MonopostSchema.safeParse(body);
  if (!result.success) return c.json({ error: result.error }, 400);

  const monopost = result.data;
  await c.env.DB.prepare(
    'INSERT INTO Monopost (details, tires, other) VALUES (?, ?, ?)'
  ).bind(monopost.details,monopost.tires,monopost.other).run();

  return c.json({ success: true });
});
// GET /api/monoposts
app.get('/api/monoposts', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Monopost').all();
  return c.json(results);
});

// GET /api/monoposts/:id
app.get('/api/monoposts/:id', async (c) =>{
  const id = c.req.param('id');
  const {results}=  await c.env.DB.prepare('SELECT * FROM Monopost WHERE id = ?').bind(id).all();
  if(!results ||results.length===0 ){
    return c.json({error: 'Monopost not found'},404);
  }
  return c.json(results);
});

//DELETE /api/monoposts/:id
app.delete('/api/monoposts/:id', async (c)=>{
  const id=c.req.param('id');
  await c.env.DB.prepare('DELETE FROM Monopost WHERE id=?').bind(id).run();
  
  return c.json({success: true});
})


// --- TIMESTAMP METADATA (D1) ---

//POST /api/timestamps
app.post('/api/timestamps', async (c)=>{
  const body=await c.req.json();
  const result= TimestampSchema.safeParse(body);
  
  if(!result.success) return c.json({error: result.error},404);

  const timestamp=result.data;
  await c.env.DB.prepare(
    'INSERT INTO Timestamp (startTime, endTime, driverId, monopostId, sessionId) VALUES(?, ?, ?, ?, ?)'
  ).bind(
    timestamp.startTime,
    timestamp.endTime,
    timestamp.driverId,
    timestamp.monopostId,
    timestamp.sessionId
  ).run();

});

//GET /api/timestamps/filter
app.get('/api/timestamps/filters', async (c)=>{
  const column=c.req.query('column');
  const value=c.req.query('value');
  const validColumns = [ 'startTime', 'endTime', 'driverId', 'monopostId','sessionId'];
    
  if (!column || !validColumns.includes(column)) {
      return c.json({ error: 'Invalid or missing column parameter.' }, 400);
  }
  const {results}=await c.env.DB.prepare(
    `SELECT * FROM Timestamp WHERE ${column}=?`
  ).bind(value).all();

  if(!results || results.length===0) return c.json({error:'Timestamp not found'},404);

  return c.json(results)
});

//DELETE /api/timestamps/filter
app.delete('/api/timestamps/filters', async (c)=>{
  const all=c.req.query('all');
  const id=c.req.query('id');

  if(all==="true")
    await c.env.DB.prepare(
    `DELETE FROM Timestamp WHERE sessionId=?`
    ).bind(id).run();
  else
    await c.env.DB.prepare(
  'DELETE FROM Timestamp WHERE id=?'
).bind(id).run();
  

  
});

export default app;