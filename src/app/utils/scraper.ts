import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";
import { Logger } from "./logger";

const logger = new Logger("scraper");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CACHE_TTL = 7 * (24 * 60 * 60); // 7 days
const MAX_CACHE_SIZE = 1024000;

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

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

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
