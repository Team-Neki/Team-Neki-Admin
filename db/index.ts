export type DatabaseStatement = {
  bind(...values: unknown[]): DatabaseStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};

export type AnalyticsDatabase = {
  prepare(sql: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<unknown>;
};

type NodeRawStatement = {
  all(...values: unknown[]): unknown[];
  get(...values: unknown[]): unknown;
  run(...values: unknown[]): unknown;
};

type NodeRawDatabase = {
  exec(sql: string): void;
  prepare(sql: string): NodeRawStatement;
};

type NodeSqliteModule = {
  DatabaseSync: new (path: string) => NodeRawDatabase;
};

const ANALYTICS_SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS analytics_daily_event_metrics (
    metric_date TEXT NOT NULL,
    event_name TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    daily_uniques INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (metric_date, event_name)
  );
  CREATE TABLE IF NOT EXISTS analytics_daily_statuses (
    metric_date TEXT PRIMARY KEY NOT NULL,
    finalized INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analytics_range_snapshots (
    cache_key TEXT PRIMARY KEY NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    granularity TEXT NOT NULL,
    event_uniques_json TEXT NOT NULL,
    active_users_json TEXT NOT NULL,
    finalized INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL
  );
`;

class NodeStatement implements DatabaseStatement {
  private readonly statement: NodeRawStatement;
  private readonly values: unknown[];

  constructor(statement: NodeRawStatement, values: unknown[] = []) {
    this.statement = statement;
    this.values = values;
  }

  bind(...values: unknown[]) {
    return new NodeStatement(this.statement, values);
  }

  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }

  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }

  async run() {
    return this.statement.run(...this.values);
  }
}

class NodeDatabase implements AnalyticsDatabase {
  private readonly database: NodeRawDatabase;

  constructor(database: NodeRawDatabase) {
    this.database = database;
  }

  prepare(sql: string) {
    return new NodeStatement(this.database.prepare(sql));
  }

  async batch(statements: DatabaseStatement[]) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

let databasePromise: Promise<AnalyticsDatabase> | undefined;

const getCloudflareDatabase = async () => {
  try {
    const workerModule = await import(String("cloudflare:workers"));
    const database = (workerModule.env as unknown as { DB?: unknown }).DB;
    return database ? database as AnalyticsDatabase : undefined;
  } catch {
    return undefined;
  }
};

const getNodeDatabase = async () => {
  const [{ DatabaseSync }, { mkdir }, { dirname, resolve }] = await Promise.all([
    import("node:sqlite") as unknown as Promise<NodeSqliteModule>,
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const configuredPath = process.env.NEKI_ADMIN_DATABASE_PATH?.trim();
  const databasePath = configuredPath === ":memory:"
    ? configuredPath
    : resolve(configuredPath || ".data/neki-admin.sqlite");
  if (databasePath !== ":memory:") await mkdir(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(ANALYTICS_SCHEMA);
  return new NodeDatabase(database);
};

export const getDatabase = () => {
  databasePromise ??= getCloudflareDatabase().then((database) => database ?? getNodeDatabase());
  return databasePromise;
};
