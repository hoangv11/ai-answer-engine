import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function getGroqResponse(message: string) {
  const messages = [
    { role: "system", content: "You are an academic expert, you always cite your sources and base your responses only on the context that have been provided."},

  ]
}