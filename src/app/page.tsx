"use client";

import { useState, useEffect } from "react";
import { PlusIcon, Globe, Bot } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  suggestedQueries?: string[];
};

export default function Home() {
  const [message, setMessage] = useState("");
  const [currentChat, setCurrentChat] = useState<Chat>({
    id: Date.now().toString(),
    title: "New Chat",
    messages: [
      { role: "assistant", content: "Hello! How can I help you today?" },
    ],
    createdAt: new Date(),
    suggestedQueries: [
      "Summarize this article",
      "How do I use tools with the Groq API?",
      "Tell me about the new Gemini model",
    ],
  });
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial chat on mount - removed duplicate useEffect
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    loadChatHistory(currentChat.id);
    setChats([currentChat]);
  }, []);

  const loadChatHistory = async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat?chatId=${chatId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.messages) {
          const existingChat = chats.find(chat => chat.id === chatId);
          if (existingChat) {
            const updatedChat = {
              ...existingChat,
              messages: data.messages || existingChat.messages,
            };
            setCurrentChat(updatedChat);
            setChats(prev =>
              prev.map(chat => (chat.id === chatId ? updatedChat : chat))
            );
          }
        }
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
      setError("Failed to load chat history");
    }
  };

  const handleNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [
        { role: "assistant", content: "Hello! How can I help you today?" },
      ],
      createdAt: new Date(),
      suggestedQueries: [
        "Summarize this article",
        "How do I use tools with the Groq API?",
        "Tell me about the new Gemini model",
      ],
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChat(newChat);
  };

  const handleSendQuery = (query: string) => {
    setMessage(query);
    handleSend(query);
  };

  const handleSend = async (customMessage?: string) => {
    const messageToSend = customMessage || message;
    if (!messageToSend.trim()) return;
    setError(null);

    // Add user message to UI immediately
    const userMessage = { role: "user" as const, content: messageToSend };
    const updatedMessages = [...currentChat.messages, userMessage];

    const title =
      currentChat.messages.length === 1
        ? messageToSend.slice(0, 30) + "..."
        : currentChat.title;

    const updatedChat = {
      ...currentChat,
      messages: updatedMessages,
      title,
    };
    setCurrentChat(updatedChat);
    setChats(prev =>
      prev.map(chat => (chat.id === currentChat.id ? updatedChat : chat))
    );

    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageToSend,
          messages: updatedMessages,
          chatId: currentChat.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          setError(
            `${errorData.message} Try again in ${errorData.timeRemaining} seconds.`
          );
          return;
        }
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      // Add assistant's response
      const assistantMessage = {
        role: "assistant" as const,
        content: data.message,
      };
      const finalMessages = [...updatedMessages, assistantMessage];

      const finalChat = {
        ...updatedChat,
        messages: finalMessages,
      };

      setCurrentChat(finalChat);
      setChats(prev =>
        prev.map(chat => (chat.id === currentChat.id ? finalChat : chat))
      );
    } catch (error) {
      console.error("Error:", error);
      setError("Failed to send message. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatSelect = (chat: Chat) => {
    // Clear the current chat state first
    setCurrentChat(chat);
  };

  // Rest of your component remains exactly the same from here on
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4">
          <div className="flex items-center gap-2 px-4 py-2">
            <Globe className="h-6 w-6 text-cyan-500" />
            <h1 className="text-lg font-semibold text-white">History</h1>
          </div>
        </div>
        <div className="p-4 border-t border-b border-gray-700">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 text-white bg-gray-700 hover:bg-gray-600 transition-colors rounded-lg px-4 py-2 w-full"
          >
            <PlusIcon size={20} />
            <span>New Chat</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => handleChatSelect(chat)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors ${
                currentChat.id === chat.id ? "bg-gray-700" : ""
              }`}
            >
              <h3 className="text-sm text-white truncate">{chat.title}</h3>
              <p className="text-xs text-gray-400">
                {new Date(chat.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-2 px-4 py-2 text-gray-400 text-sm">
            <span>Made with ❤️ by Victor</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="w-full bg-gray-800 border-b border-gray-700 p-4">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <Bot className="h-6 w-6 text-cyan-500" />
            <h1 className="text-xl font-semibold text-white">Chat Assistant</h1>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto pb-32 pt-4">
          <div className="max-w-3xl mx-auto px-4">
            {currentChat.messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-4 mb-4 ${
                  msg.role === "assistant"
                    ? "justify-start"
                    : "justify-end flex-row-reverse"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-cyan-500" />
                  </div>
                )}
                <div
                  className={`px-4 py-2 rounded-2xl max-w-[80%] ${
                    msg.role === "assistant"
                      ? "bg-gray-800 border border-gray-700 text-gray-100"
                      : "bg-cyan-600 text-white ml-auto"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Show suggested queries only if it's a new chat */}
            {currentChat.messages.length === 1 &&
              currentChat.suggestedQueries && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {currentChat.suggestedQueries.map((query, index) => (
                    <button
                      key={index}
                      onClick={() => handleSendQuery(query)}
                      className="px-4 py-2 rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors text-sm"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              )}

            {isLoading && (
              <div className="flex gap-4 mb-4">
                <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-cyan-500" />
                </div>
                <div className="px-4 py-2 rounded-2xl bg-gray-800 border border-gray-700 text-gray-100">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-center mb-4">
                <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                  {error}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="fixed bottom-0 w-full bg-gray-800 border-t border-gray-700 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyPress={e => e.key === "Enter" && handleSend()}
                placeholder="Type your message..."
                className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-gray-400"
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading}
                className="bg-cyan-600 text-white px-5 py-3 rounded-xl hover:bg-cyan-700 transition-all disabled:bg-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
