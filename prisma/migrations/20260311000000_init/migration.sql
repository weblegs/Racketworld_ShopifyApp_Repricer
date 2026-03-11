-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedPrice" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "myProductUrl" TEXT,
    "myProductPrice" DOUBLE PRECISION,
    "competitor1Name" TEXT,
    "competitor1Url" TEXT,
    "competitor1Price" DOUBLE PRECISION,
    "competitor2Name" TEXT,
    "competitor2Url" TEXT,
    "competitor2Price" DOUBLE PRECISION,
    "competitor3Name" TEXT,
    "competitor3Url" TEXT,
    "competitor3Price" DOUBLE PRECISION,
    "competitor4Name" TEXT,
    "competitor4Url" TEXT,
    "competitor4Price" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapedPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedCompetitor" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT,
    "pageTitle" TEXT,
    "price" DOUBLE PRECISION,
    "scrapedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapedCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "productTitle" TEXT,
    "competitorName" TEXT,
    "competitorPrice" DOUBLE PRECISION,
    "oldPrice" DOUBLE PRECISION,
    "newPrice" DOUBLE PRECISION,
    "changeType" TEXT,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTracking" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "productTitle" TEXT,
    "oldPrice" DOUBLE PRECISION,
    "newPrice" DOUBLE PRECISION,
    "beforeStartDate" TIMESTAMP(3),
    "beforeEndDate" TIMESTAMP(3),
    "beforeUnitsSold" INTEGER DEFAULT 0,
    "beforeRevenue" DOUBLE PRECISION DEFAULT 0,
    "afterStartDate" TIMESTAMP(3),
    "afterEndDate" TIMESTAMP(3),
    "afterUnitsSold" INTEGER DEFAULT 0,
    "afterRevenue" DOUBLE PRECISION DEFAULT 0,
    "dataCollectionComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingCost" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "pdhsports" DOUBLE PRECISION,
    "prodirectsport" DOUBLE PRECISION,
    "tennisnuts" DOUBLE PRECISION,
    "allthingstennis" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingCost_pkey" PRIMARY KEY ("id")
);
