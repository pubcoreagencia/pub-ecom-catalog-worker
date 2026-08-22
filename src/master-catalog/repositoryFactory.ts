import { Env } from "../types";
import { IMasterCatalogRepository, globalMasterCatalogRepository } from "./repository";
import { D1MasterCatalogRepository } from "./repositories/D1MasterCatalogRepository";

export function createMasterCatalogRepository(env?: Partial<Env>): IMasterCatalogRepository {
  if (env?.DB) {
    return new D1MasterCatalogRepository(env.DB);
  }
  if ((env as any)?.TEST_REPO) {
    return (env as any).TEST_REPO;
  }
  return globalMasterCatalogRepository;
}
