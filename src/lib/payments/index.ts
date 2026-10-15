import { bitnobProvider } from "./bitnob";
import { mockProvider } from "./mock";
import type { PaymentProvider } from "./types";

export function getProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === "bitnob" ? bitnobProvider : mockProvider;
}

export const isMockProvider = () => getProvider().name === "mock";
