import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface ChatMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

export async function getGroqResponse(chatMessages: ChatMessage[]) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an academic expert, you always cite your sources and base your responses only on the context that have been provided.",
    },
    ...chatMessages,
  ];

  console.log("messages:", messages);
  console.log("Starting chat with Groq...");
  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages,
  });
  // console.log("Groq request:", response);

  return response.choices[0].message.content;
}
