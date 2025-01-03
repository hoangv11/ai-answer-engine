// TODO: Implement the chat API with Groq and web scraping with Cheerio and Puppeteer
// Refer to the Next.js Docs on how to read the Request body: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
// Refer to the Groq SDK here on how to use an LLM: https://www.npmjs.com/package/groq-sdk
// Refer to the Cheerio docs here on how to parse HTML: https://cheerio.js.org/docs/basics/loading
// Refer to Puppeteer docs here: https://pptr.dev/guides/what-is-puppeteer
import { NextResponse } from "next/server";
import { getGroqResponse } from "@/app/utils/groqClient";
import { urlPattern, scrapeUrl } from "@/app/utils/scraper";

export async function POST(req: Request) {
  try {
    const { message, messages } = await req.json();

    console.log("message received", message);
    console.log("messages", messages);

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

    return NextResponse.json({ message: response });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ message: "Error", error: String(error) });
  }
}
