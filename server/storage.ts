export type StoredRecord = Record<string, unknown>;
export type Storage = {
  readonly setItem: <T extends StoredRecord>(key: string, value: T, exp?: number) => Promise<void>;
  readonly getItem: <T extends StoredRecord>(key: string) => Promise<T | null>;
  readonly isEmpty: () => Promise<boolean>;
  readonly getAll: <T extends StoredRecord>() => Promise<T[]>;
};

export function buildInMemoryStorage(): Storage {
  const store = new Map<string, { data: string; exp: number }>();
  const prune = () => {
    store.forEach(({ exp }, key) => {
      if (Date.now() < exp) return;
      store.delete(key);
    });
  };
  return {
    async isEmpty() {
      return store.size === 0;
    },
    async setItem(key, value, exp = 86400 * 1000) {
      store.set(key, {
        data: JSON.stringify(value),
        exp: Date.now() + exp * 1000,
      });
    },
    async getItem(key) {
      prune();
      const record = store.get(key);
      return record ? JSON.parse(record.data) : null;
    },
    async getAll() {
      return Array.from(store.values()).map(value => JSON.parse(value.data));
    },
  };
}

// TODO Unsupported yet
//
// export type RedisClientLike = {
//   get(key: string): Promise<string | null>;
//   set(key: string, value: string, expiryMode?: string, time?: number): Promise<string | null>;
// };
// export function buildRedisStorage<T extends StoredRecord>(client: Redis.Redis): Storage<T> {
//   return {
//     async setItem(key, value, exp = 86400 * 1000) {
//       await client.set(key, JSON.stringify(value), 'EX', exp);
//     },
//     async getItem(key) {
//       const record = await client.get(key);
//       return record ? JSON.parse(record) : null;
//     },
//     async isEmpty() {
//       const size = await client.dbsize();
//       return size === 0;
//     },
//   };
// }
