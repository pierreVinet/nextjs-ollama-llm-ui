import { CoreMessage, generateId, Message } from "ai";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ChatSession {
  messages: Message[];
  createdAt: string;
  title?: string;
}

interface State {
  base64Images: string[] | null;
  chats: Record<string, ChatSession>;
  currentChatId: string | null;
  selectedModel: string | null;
  userName: string | "Anonymous";
  isDownloading: boolean;
  downloadProgress: number;
  downloadingModel: string | null;
}

interface Actions {
  setBase64Images: (base64Images: string[] | null) => void;
  setCurrentChatId: (chatId: string) => void;
  setSelectedModel: (selectedModel: string) => void;
  getChatById: (chatId: string) => ChatSession | undefined;
  getMessagesById: (chatId: string) => Message[];
  saveMessages: (chatId: string, messages: Message[]) => void;
  updateChatTitle: (chatId: string, title: string) => void;
  generateChatTitle: (
    chatId: string,
    firstUserMessage: string,
    firstAssistantMessage: string
  ) => Promise<void>;
  handleDelete: (chatId: string, messageId?: string) => void;
  setUserName: (userName: string) => void;
  startDownload: (modelName: string) => void;
  stopDownload: () => void;
  setDownloadProgress: (progress: number) => void;
}

const useChatStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      base64Images: null,
      chats: {},
      currentChatId: null,
      selectedModel: null,
      userName: "Anonymous",
      isDownloading: false,
      downloadProgress: 0,
      downloadingModel: null,

      setBase64Images: (base64Images) => set({ base64Images }),
      setUserName: (userName) => set({ userName }),

      setCurrentChatId: (chatId) => set({ currentChatId: chatId }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      getChatById: (chatId) => {
        const state = get();
        return state.chats[chatId];
      },
      getMessagesById: (chatId) => {
        const state = get();
        return state.chats[chatId]?.messages || [];
      },
      saveMessages: (chatId, messages) => {
        set((state) => {
          const existingChat = state.chats[chatId];

          return {
            chats: {
              ...state.chats,
              [chatId]: {
                messages: [...messages],
                createdAt: existingChat?.createdAt || new Date().toISOString(),
                title: existingChat?.title,
              },
            },
          };
        });
      },
      updateChatTitle: (chatId, title) => {
        set((state) => {
          const existingChat = state.chats[chatId];
          if (!existingChat) return state;

          return {
            chats: {
              ...state.chats,
              [chatId]: {
                ...existingChat,
                title,
              },
            },
          };
        });
      },
      generateChatTitle: async (
        chatId,
        firstUserMessage,
        firstAssistantMessage
      ) => {
        try {
          const prompt = `Based on this conversation, generate a short, concise title (maximum 6 words) that summarizes the main topic:

User: ${firstUserMessage}

Assistant: ${firstAssistantMessage}`;

          // Call API to generate title using llama3.2
          const response = await fetch("/api/generate-title", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt,
              selectedModel: "llama3.2:latest",
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to generate title");
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let generatedTitle = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split("\n");

              for (const line of lines) {
                if (line.startsWith("0:")) {
                  const data = line.slice(2);
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === "text") {
                      generatedTitle += parsed.text;
                    }
                  } catch (e) {
                    // Ignore parsing errors
                  }
                }
              }
            }
          }

          // Clean up the title and ensure it's within limits
          generatedTitle = generatedTitle.trim().replace(/['"]/g, "");
          const words = generatedTitle.split(" ");
          if (words.length > 6) {
            generatedTitle = words.slice(0, 6).join(" ");
          }

          // Fallback to first user message if title generation failed
          if (!generatedTitle) {
            generatedTitle =
              firstUserMessage.slice(0, 50) +
              (firstUserMessage.length > 50 ? "..." : "");
          }

          get().updateChatTitle(chatId, generatedTitle);
        } catch (error) {
          console.error("Error generating chat title:", error);
        }
      },
      handleDelete: (chatId, messageId) => {
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;

          // If messageId is provided, delete specific message
          if (messageId) {
            const updatedMessages = chat.messages.filter(
              (message) => message.id !== messageId
            );
            return {
              chats: {
                ...state.chats,
                [chatId]: {
                  ...chat,
                  messages: updatedMessages,
                },
              },
            };
          }

          // If no messageId, delete the entire chat
          const { [chatId]: _, ...remainingChats } = state.chats;
          return {
            chats: remainingChats,
          };
        });
      },

      startDownload: (modelName) =>
        set({
          isDownloading: true,
          downloadingModel: modelName,
          downloadProgress: 0,
        }),
      stopDownload: () =>
        set({
          isDownloading: false,
          downloadingModel: null,
          downloadProgress: 0,
        }),
      setDownloadProgress: (progress) => set({ downloadProgress: progress }),
    }),
    {
      name: "nextjs-ollama-ui-state",
      partialize: (state) => ({
        chats: state.chats,
        currentChatId: state.currentChatId,
        selectedModel: state.selectedModel,
        userName: state.userName,
      }),
    }
  )
);

export default useChatStore;
