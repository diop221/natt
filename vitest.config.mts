import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Les tests utilisent une base Postgres dédiée (voir README) et les fournisseurs simulés.
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:natt@127.0.0.1:54329/natt_test";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    env: {
      DATABASE_URL: TEST_DB,
      DIRECT_URL: TEST_DB,
      PAYMENT_PROVIDER: "mock",
      CHAIN_PROVIDER: "mock",
      NOTIFY_PROVIDER: "mock",
      NATT_FEE_BPS: "100",
    },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
