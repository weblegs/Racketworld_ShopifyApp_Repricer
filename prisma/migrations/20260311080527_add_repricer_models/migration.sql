-- CreateTable
CREATE TABLE "ScrapedPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "myProductUrl" TEXT,
    "myProductPrice" REAL,
    "competitor1Name" TEXT,
    "competitor1Url" TEXT,
    "competitor1Price" REAL,
    "competitor2Name" TEXT,
    "competitor2Url" TEXT,
    "competitor2Price" REAL,
    "competitor3Name" TEXT,
    "competitor3Url" TEXT,
    "competitor3Price" REAL,
    "competitor4Name" TEXT,
    "competitor4Url" TEXT,
    "competitor4Price" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ScrapedCompetitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT,
    "pageTitle" TEXT,
    "price" REAL,
    "scrapedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "productTitle" TEXT,
    "competitorName" TEXT,
    "competitorPrice" REAL,
    "oldPrice" REAL,
    "newPrice" REAL,
    "changeType" TEXT,
    "variantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SalesTracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "productTitle" TEXT,
    "oldPrice" REAL,
    "newPrice" REAL,
    "beforeStartDate" DATETIME,
    "beforeEndDate" DATETIME,
    "beforeUnitsSold" INTEGER DEFAULT 0,
    "beforeRevenue" REAL DEFAULT 0,
    "afterStartDate" DATETIME,
    "afterEndDate" DATETIME,
    "afterUnitsSold" INTEGER DEFAULT 0,
    "afterRevenue" REAL DEFAULT 0,
    "dataCollectionComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShippingCost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "pdhsports" REAL,
    "prodirectsport" REAL,
    "tennisnuts" REAL,
    "allthingstennis" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
