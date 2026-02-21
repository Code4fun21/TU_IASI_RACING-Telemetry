import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SessionSchema, DriverSchema, MonopostSchema, TrackSchema, TimestampSchema } from '@telemetry/shared'; 
import { usageGuardMiddleware } from './middleware/usageGuard';

// Define the bindings
type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('/*', cors());


// --- R2 ROUTES (Storage) ---

// UPLOAD (Class A Op)
app.post('/api/upload', 
  usageGuardMiddleware('r2_uploads'), 
  async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded' }, 400);
    }
    const fileName = `${file.name}`;
    await c.env.BUCKET.put(fileName, file.stream());
    return c.json({ success: true, fileName: fileName });
  }
);

// 3. TRACKS (Update existing)
app.put('/api/tracks/:id', usageGuardMiddleware('d1_writes'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  // Validate the data against your shared schema
  const result = TrackSchema.safeParse(body);
  if (!result.success) return c.json({ error: result.error }, 400);

  const track = result.data;

  // This updates the filenames in D1 that point to the actual files in R2
  await c.env.DB.prepare(`
    UPDATE Track 
    SET name = ?, gates = ?, coordinates = ? 
    WHERE id = ?
  `)
  .bind(track.name, track.gates, track.coordinates, id)
  .run();

  return c.json({ success: true });
});

// DOWNLOAD (Class B Op)
app.get('/api/download/:filename', 
  usageGuardMiddleware('r2_downloads'), // <--- NEW PROTECTION
  async (c) => {
    const filename = c.req.param('filename');
    const object = await c.env.BUCKET.get(filename);

    if (object === null) return c.text('File not found', 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  }
);


// --- D1 ROUTES (Database) ---

// 1. SESSIONS
app.get('/api/sessions', 
  usageGuardMiddleware('d1_reads'), // <--- PROTECT READ
  async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM Session ORDER BY date DESC, time DESC').all();
    return c.json(results);
  }
);

app.get('/api/sessions/:id', 
  usageGuardMiddleware('d1_reads'), // <--- PROTECT READ
  async (c) => {
    const id = c.req.param('id');
    const { results } = await c.env.DB.prepare('SELECT * FROM Session WHERE id = ?').bind(id).all();
    if (!results || results.length === 0) return c.json({ error: 'Session not found' }, 404);
    return c.json(results[0]);
  }
);

app.post('/api/sessions', 
  usageGuardMiddleware('d1_writes'), // <--- PROTECT WRITE
  async (c) => {
    const body = await c.req.json();
    const result = SessionSchema.safeParse(body);
    if (!result.success) return c.json({ error: result.error }, 400);

    const session = result.data;
    const info = await c.env.DB.prepare(`
        INSERT INTO Session (csvFileName, decodedFileName, trackId, date, time)
        VALUES (?, ?, ?, ?, ?)
    `).bind(session.csvFileName, session.decodedFileName, session.trackId, session.date, session.time).run();

    return c.json({ success: true, id: info.meta.last_row_id });
  }
);

// 2. DRIVERS
app.get('/api/drivers', usageGuardMiddleware('d1_reads'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Driver').all();
  return c.json(results);
});

app.get('/api/drivers/:id', usageGuardMiddleware('d1_reads'), async (c) => {
  const id = c.req.param("id");
  const { results } = await c.env.DB.prepare('SELECT * FROM Driver WHERE id=?').bind(id).all();
  if (!results || results.length === 0) return c.json({ error: 'Driver not found' }, 404);
  return c.json(results[0]);
});

app.post('/api/drivers', usageGuardMiddleware('d1_writes'), async (c) => {
  const body = await c.req.json();
  const result = DriverSchema.safeParse(body);
  if (!result.success) return c.json({ error: result.error }, 400);
  const driver = result.data;
  await c.env.DB.prepare('INSERT INTO Driver (name, weight, other) VALUES (?, ?, ?)').bind(driver.name, driver.weight, driver.other).run();
  return c.json({ success: true });
});

app.put('/api/drivers/:id', usageGuardMiddleware('d1_writes'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  await c.env.DB.prepare('UPDATE Driver SET name = ?, weight = ?, other = ? WHERE id = ?').bind(body.name, body.weight, body.other, id).run();
  return c.json({ success: true });
});

app.delete('/api/drivers/:id', usageGuardMiddleware('d1_writes'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM Driver WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});


// 3. TRACKS
app.get('/api/tracks', usageGuardMiddleware('d1_reads'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Track').all();
  return c.json(results);
});

app.get('/api/tracks/:id', usageGuardMiddleware('d1_reads'), async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Track WHERE id = ?').bind(id).all();
  if (!results || results.length === 0) return c.json({ error: "Track not found" }, 404);
  return c.json(results[0]);
});

app.post('/api/tracks', usageGuardMiddleware('d1_writes'), async (c) => {
  const body = await c.req.json();
  const result = TrackSchema.safeParse(body);
  if (!result.success) return c.json({ error: result.error });
  const track = result.data;
  await c.env.DB.prepare('INSERT INTO Track (name, gates, coordinates) VALUES (?, ?, ?)').bind(track.name, track.gates, track.coordinates).run();
  return c.json({ success: true });
});

app.delete('/api/tracks/:id', usageGuardMiddleware('d1_writes'), async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM Track WHERE id=?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    if (e.message.includes('FOREIGN KEY') || e.message.includes('SQLITE_CONSTRAINT')) {
      return c.json({ error: "Cannot delete this Track because it is used in recorded Sessions." }, 409);
    }
    return c.json({ error: "Internal Server Error" }, 500);
  }
});


// 4. MONOPOSTS
app.get('/api/monoposts', usageGuardMiddleware('d1_reads'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Monopost').all();
  return c.json(results);
});

app.get('/api/monoposts/:id', usageGuardMiddleware('d1_reads'), async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Monopost WHERE id = ?').bind(id).all();
  if (!results || results.length === 0) return c.json({ error: 'Monopost not found' }, 404);
  return c.json(results);
});

app.post('/api/monoposts', usageGuardMiddleware('d1_writes'), async (c) => {
  const body = await c.req.json();
  const result = MonopostSchema.safeParse(body);
  if (!result.success) return c.json({ error: result.error }, 400);
  const monopost = result.data;
  await c.env.DB.prepare('INSERT INTO Monopost (details, tires, other) VALUES (?, ?, ?)').bind(monopost.details, monopost.tires, monopost.other).run();
  return c.json({ success: true });
});

app.put('/api/monoposts/:id', usageGuardMiddleware('d1_writes'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  await c.env.DB.prepare('UPDATE Monopost SET details = ?, tires = ?, other = ? WHERE id = ?').bind(body.details, body.tires, body.other, id).run();
  return c.json({ success: true });
});

app.delete('/api/monoposts/:id', usageGuardMiddleware('d1_writes'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM Monopost WHERE id=?').bind(id).run();
  return c.json({ success: true });
});


// 5. TIMESTAMPS
app.post('/api/timestamps', usageGuardMiddleware('d1_writes'), async (c) => {
  const body = await c.req.json();
  const result = TimestampSchema.safeParse(body);
  if (!result.success) return c.json({ error: result.error }, 404);
  const timestamp = result.data;
  await c.env.DB.prepare('INSERT INTO Timestamp (startTime, endTime, driverId, monopostId, sessionId) VALUES(?, ?, ?, ?, ?)').bind(timestamp.startTime, timestamp.endTime, timestamp.driverId, timestamp.monopostId, timestamp.sessionId).run();
  return c.json({ success: true });
});

app.get('/api/timestamps/filters', usageGuardMiddleware('d1_reads'), async (c) => {
  const column = c.req.query('column');
  const value = c.req.query('value');
  const validColumns = ['startTime', 'endTime', 'driverId', 'monopostId', 'sessionId'];
  
  if (!column || !validColumns.includes(column)) return c.json({ error: 'Invalid or missing column parameter.' }, 400);
  
  const { results } = await c.env.DB.prepare(`SELECT * FROM Timestamp WHERE ${column} = ?`).bind(value).all();
  if (!results || results.length === 0) return c.json([]); 
  return c.json(results);
});

app.delete('/api/timestamps/filters', usageGuardMiddleware('d1_writes'), async (c) => {
  const all = c.req.query('all');
  const id = c.req.query('id');
  if (all === "true") {
    await c.env.DB.prepare(`DELETE FROM Timestamp WHERE sessionId=?`).bind(id).run();
  } else {
    await c.env.DB.prepare('DELETE FROM Timestamp WHERE id=?').bind(id).run();
  }
  return c.json({ success: true });
});

export default app;