import { Logger } from "./logger";
import { Redis } from "@upstash/redis";

const logger = new Logger("scraper");

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
