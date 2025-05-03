// src/lib/__mocks__/prisma.ts
// Mock Prisma client for testing purposes

import { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "jest-mock-extended";
import { DeepMockProxy } from "jest-mock-extended/lib/Mock";

// Tell Jest to mock the prisma module
jest.mock("../prisma", () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

// Export the mocked prisma client and a reset function
export const prismaMock = jest.requireMock("../prisma").prisma as DeepMockProxy<PrismaClient>;

export const resetPrismaMock = () => {
  mockReset(prismaMock);
};

