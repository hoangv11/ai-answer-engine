// TODO: Implement the chat API with Groq and web scraping with Cheerio and Puppeteer
// Refer to the Next.js Docs on how to read the Request body: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
// Refer to the Groq SDK here on how to use an LLM: https://www.npmjs.com/package/groq-sdk
// Refer to the Cheerio docs here on how to parse HTML: https://cheerio.js.org/docs/basics/loading
// Refer to Puppeteer docs here: https://pptr.dev/guides/what-is-puppeteer
import { NextResponse } from "next/server";
import { getGroqResponse } from "@/app/utils/groqClient";
import { urlPattern, scrapeUrl } from "@/app/utils/scraper";
import { Logger } from "../../utils/logger";
import { Redis } from "@upstash/redis";

const logger = new Logger("scraper");

export async function POST(req: Request) {
  try {
    const { message, messages, chatId } = await req.json();

    console.log("message received", message);
    console.log("messages", messages);
    console.log("chatId received", chatId);

    const url = message.match(urlPattern);

    let scrapedContent = "";

    if (url) {
      console.log("Url found:", url);
      const scrapedData = await scrapeUrl(url);
      console.log("Scraped data:", scrapedData);
      scrapedContent = scrapedData?.content || "";
    }

    const userQuery = message.replace(url ? url[0] : "", "").trim();

    const userPrompt = `
    I want you to help answer this question: "${userQuery}"

    If there is scraped content below, use it as context for your answer. If no content is provided, answer based on your general knowledge.

    Context from provided URL:
    <content> 
      ${scrapedContent}
    <content>

    Guidelines:
    - Be concise and accurate
    - If the content doesn't help answer the question, say so
    - If you're unsure about something, acknowledge it
    - Cite specific parts of the content when relevant
    `;

    const llmMessages = [
      ...messages,
      {
        role: "user",
        content: userPrompt,
      },
    ];

    console.log("Prompt:", userPrompt);

    console.log(llmMessages);
    const response = await getGroqResponse(llmMessages);

    const updatedMessages = [
      ...messages,
      { role: "user", content: message },
      { role: "assistant", content: response },
    ];

    await saveConversations(chatId, updatedMessages);

    return NextResponse.json({ message: response });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ message: "Error", error: String(error) });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chatId");

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 }
      );
    }

    const conversation = await getConversations(chatId);
    return NextResponse.json({ messages: conversation });
  } catch (error) {
    console.error("Error retrieving chat history:", error);
    return NextResponse.json(
      { error: "Failed to retrieve chat history" },
      { status: 500 }
    );
  }
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function saveConversations(id: string, messages: Message[]) {
  try {
    logger.info(`Saving conversation for user: ${id}`);
    await redis.set(`conversation:${id}`, JSON.stringify(messages));
    await redis.expire(`conversation:${id}`, 60 * 60 * 24 * 7); // 1 week
    logger.info(
      `Conversation saved for user: ${id} with ${messages.length} messages`
    );
  } catch (error) {
    logger.error(`Error saving conversation ${id}: ${error}`);
    throw error;
  }
}

export async function getConversations(id: string): Promise<Message[] | null> {
  try {
    logger.info(`Getting conversation for user: ${id}`);
    const data = await redis.get(`conversation:${id}`);

    if (!data) {
      logger.info(`No conversation found for user: ${id}`);
      return null;
    }

    if (typeof data === "string") {
      const messages = JSON.parse(data);
      logger.info(
        `Conversation found for user: ${id} with ${messages.length} messages`
      );
      return messages;
    }

    logger.info(`Successfully retrieved conversation for user: ${id}`);
    return data as Message[];
  } catch (error) {
    logger.error(`Error getting conversation ${id}: ${error}`);
    return null;
  }
}
