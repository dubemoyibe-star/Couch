import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Neon computes scale to zero and can take a few seconds to wake. The pg
// driver defaults to no connect timeout, which would hang instead of fail, so
// the factory sets one that is longer than a cold start.
export const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000;

export type CreatePrismaClientOptions = {
  readonly connectionString: string;
  readonly connectionTimeoutMillis?: number;
};

// Uses the standard `pg` driver over TCP, so the same code runs against Neon
// (pooled URL) and against a plain Postgres server.
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MS,
  });
  return new PrismaClient({ adapter });
}

// Next.js dev reloads modules, and each reload would otherwise open a new pool.
// Keeping the instance on globalThis reuses one client across reloads. Created
// on first call, so importing this package needs no DATABASE_URL.
const globalForPrisma = globalThis as typeof globalThis & {
  couchPrismaClient?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.couchPrismaClient) return globalForPrisma.couchPrismaClient;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const client = createPrismaClient({ connectionString });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.couchPrismaClient = client;
  }
  return client;
}
