import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";
import { Logger } from "./logger";
import puppeteer, { Browser } from "puppeteer";

const logger = new Logger("scraper");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CACHE_TTL = 7 * (24 * 60 * 60); // 7 days
const MAX_CACHE_SIZE = 1024000;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
    logger.info("Puppeteer browser launched");
  }
  return browser;
}

process.on("exit", async () => { 
  if (browser) {
    await browser.close();
    logger.info("Puppeteer browser closed");
  }
});

export const urlPattern =
  /https?:\/\/(www.)?[-a-zA-Z0-9@:%.+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%+.~#?&//=]*)/gi;

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\n+/g, "").trim();
}
export async function scrapeUrl(url: string) {
  try {
    logger.info(`Scraping URL: ${url}`);
    const cached = await getCachedContent(url);
    if (cached) {
      logger.info(`Returning cached content for url: ${url}`);
      return cached;
    }
    logger.info(`Cache miss for url: ${url}`);

    let html: string;

    const requiresDynamic = requiresDynamicScraping(url);

    if(requiresDynamic) {
      const pageContent = await scrapeWithPuppeteer(url);
      html = pageContent;
    } else {
      logger.info(`Using Axios to scrape static content for url: ${url}`);
      const response = await axios.get(url);
      html = response.data;
    }

    const $ = cheerio.load(html);

    $("script").remove();
    $("style").remove();
    $("noscript").remove();
    $("iframe").remove();

    const title = $("title").text();
    const metaDescription = $('meta[name="description"]').attr("content") || "";
    const h1 = $("h1")
      .map((_, el) => $(el).text())
      .get()
      .join("");
    const h2 = $("h2")
      .map((_, el) => $(el).text())
      .get()
      .join("");
    const articleText = $("article")
      .map((_, el) => $(el).text())
      .get()
      .join("");
    const mainText = $("main")
      .map((_, el) => $(el).text())
      .get()
      .join("");
    const contentText = $('.content, #content, [class*="content"]')
      .map((_, el) => $(el).text())
      .get()
      .join("");
    const paragraphs = $("p")
      .map((_, el) => $(el).text())
      .get()
      .join("");
    const listItemText = $("li")
      .map((_, el) => $(el).text())
      .get()
      .join("");
    let combinedContent = [
      title,
      metaDescription,
      h1,
      h2,
      articleText,
      mainText,
      contentText,
      paragraphs,
      listItemText,
    ].join(" ");

    combinedContent = cleanText(combinedContent).slice(0, 40000);

    const finalResponse = {
      url,
      title: cleanText(title),
      headings: {
        h1: cleanText(h1),
        h2: cleanText(h2),
      },
      metaDescription: cleanText(metaDescription),
      content: combinedContent,
      error: null,
    };

    await cacheContent(url, finalResponse);
    return finalResponse;
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return {
      url,
      title: "",
      headings: {
        h1: "",
        h2: "",
      },
      metaDescription: "",
      content: "",
      error,
    };
  }
}

export interface ScrapedContent {
  url: string;
  title: string;
  headings: {
    h1: string;
    h2: string;
  };
  metaDescription: string;
  content: string;
  error: string | null;
  cachedAt?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isValidScrapedContent(data: any): data is ScrapedContent {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.url === "string" &&
    typeof data.title === "string" &&
    typeof data.headings === "object" &&
    typeof data.headings.h1 === "string" &&
    typeof data.headings.h2 === "string" &&
    typeof data.metaDescription === "string" &&
    typeof data.content === "string" &&
    (data.error === null || typeof data.error === "string")
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCacheKey(url: any): string {
  const sanitizedUrl = url.substring(0, 200);
  return `scraped:${sanitizedUrl}`;
}

async function getCachedContent(url: string): Promise<ScrapedContent | null> {
  try {
    const cacheKey = getCacheKey(url);
    logger.info(`Checking cache for key: ${cacheKey}`);
    const cached = await redis.get(cacheKey);

    if (!cached) {
      logger.info(`Cache miss for key: ${url}`);
      return null;
    }

    logger.info(`Cache hit for key: ${url}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    if (typeof cached === "string") {
      try {
        parsed = JSON.parse(cached);
      } catch (parseError) {
        logger.error("Error parsing cached content", parseError);
        await redis.del(cacheKey);
        return null;
      }
    } else {
      parsed = cached;
    }

    if (isValidScrapedContent(parsed)) {
      const age = Date.now() - (parsed.cachedAt || 0);
      logger.info(`Cache content age: ${Math.round(age / 1000 / 60)} minutes`);
      return parsed;
    }

    logger.warn("Invalid cached content", `${url}`);
    await redis.del(cacheKey);
    return null;
  } catch (error) {
    logger.error("Error getting cached content", error);
    return null;
  }
}

async function cacheContent(
  url: string,
  content: ScrapedContent
): Promise<void> {
  try {
    const cacheKey = getCacheKey(url);
    content.cachedAt = Date.now();

    if (!isValidScrapedContent(content)) {
      logger.error("Invalid content to cache for url", url);
      return;
    }

    const serialized = JSON.stringify(content);

    if (serialized.length > MAX_CACHE_SIZE) {
      logger.warn(
        `Content too large to cache url: ${url} (${serialized.length} bytes)`
      );
      return;
    }

    await redis.set(cacheKey, serialized, { ex: CACHE_TTL });
    logger.info(
      `Cached content for url: ${url} (${serialized.length} bytes), TTL: ${CACHE_TTL}`
    );
  } catch (error) {
    logger.error("Error caching content", error);
  }
}

function requiresDynamicScraping(url: string): boolean {
  const dynamicSites = [
    "linkedin.com",
  ];

  return dynamicSites.some((site) => url.includes(site));
}

async function scrapeWithPuppeteer(url: string): Promise<string> {
  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/112.0.0.0 Safari/537.36"
    );

    await page.setViewport({ width: 1280, height: 800 });

    logger.info(`Navigating to ${url}`);
    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    if (!response || !response.ok()) {
      throw new Error(`Failed to load page, status: ${response?.status()}`);
    }
    const content = await page.content();
    return content;
  } catch (error) {
    logger.error(`Puppeteer error for url ${url}:`, error);
    throw error;
  } finally {
    await page.close();
    logger.info(`Page closed for url: ${url}`);
  }
}
