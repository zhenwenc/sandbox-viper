export type PassTemplateCache = ReturnType<typeof buildPassTemplateCache>;
export function buildPassTemplateCache<T extends { templateId: string }>() {
  const store = new Map<string, { data: T; exp: number }>();
  const prune = () => {
    store.forEach(({ exp }, key) => {
      if (Date.now() < exp) return;
      store.delete(key);
    });
  };
  return {
    get size(): number {
      return store.size;
    },
    async setItem(value: T, exp = 86400 * 1000): Promise<void> {
      store.set(value.templateId, {
        data: value,
        exp: Date.now() + exp * 1000,
      });
    },
    async getItem(key: string): Promise<T | undefined> {
      prune();
      const record = store.get(key);
      return record?.data;
    },
    async getAll(): Promise<T[]> {
      return Array.from(store.values()).map(value => value.data);
    },
  };
}
