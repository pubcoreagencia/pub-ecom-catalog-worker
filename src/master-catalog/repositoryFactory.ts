import { Env } from "../types";
import { IMasterCatalogRepository, globalMasterCatalogRepository } from "./repository";
import { D1MasterCatalogRepository } from "./repositories/D1MasterCatalogRepository";
import { ICatalogStoreRepository, globalCatalogStoreRepository } from "./storeRepository";
import { D1CatalogStoreRepository } from "./repositories/D1CatalogStoreRepository";

export function createMasterCatalogRepository(env?: Partial<Env>): IMasterCatalogRepository {
  if (env?.DB) {
    return new D1MasterCatalogRepository(env.DB);
  }
  if ((env as any)?.TEST_REPO) {
    return (env as any).TEST_REPO;
  }
  return globalMasterCatalogRepository;
}

export function createCatalogStoreRepository(env?: Partial<Env>): ICatalogStoreRepository {
  if (env?.DB) {
    return new D1CatalogStoreRepository(env.DB);
  }
  if ((env as any)?.TEST_STORE_REPO) {
    return (env as any).TEST_STORE_REPO;
  }
  return globalCatalogStoreRepository;
}
