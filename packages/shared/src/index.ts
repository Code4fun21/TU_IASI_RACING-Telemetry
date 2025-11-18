import { z } from 'zod';

// --- 1. DRIVER SCHEMA ---
export const DriverSchema = z.object({
  driverId: z.number().optional(), // Optional because new drivers won't have an ID yet
  name: z.string().min(1, "Name is required"),
  greutate: z.number().optional(), // 'Weight' in Romanian
  other: z.string().optional(),
});

// --- 2. TRACK SCHEMA ---
export const TrackSchema = z.object({
  trackId: z.number().optional(),
  name: z.string().min(1, "Track name is required"),
  gates: z.string().optional(), // Storing complex data as JSON string or simple string
  trackCoordinates: z.string().optional(), // Storing coords as JSON string usually
});

// --- 3. MONOPOST (CAR) SCHEMA ---
export const MonopostSchema = z.object({
  monopostId: z.number().optional(),
  details: z.string().optional(),
  other: z.string().optional(),
  cauciucuri: z.string().optional(), // 'Tires'
});

// --- 4. SESSION SCHEMA (The most important one) ---
export const SessionSchema = z.object({
  id: z.number().optional(),
  csvFileName: z.string(), // The link to R2
  monopostId: z.number(),
  trackId: z.number(),
  driverId: z.number(),    // From RaceTimeStamps, linking session to driver
  startTime: z.number(),   // Unix timestamp
  endTime: z.number(),     // Unix timestamp
});

// --- 5. API RESPONSE TYPES ---
// This is what the Frontend expects to receive when asking for a generic upload URL
export const UploadUrlResponseSchema = z.object({
  url: z.string(),
  fileName: z.string(),
});

// --- EXPORT TYPES ---
// This magic line converts the Zod schemas into TypeScript types automatically!
export type Driver = z.infer<typeof DriverSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Monopost = z.infer<typeof MonopostSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type UploadUrlResponse = z.infer<typeof UploadUrlResponseSchema>;