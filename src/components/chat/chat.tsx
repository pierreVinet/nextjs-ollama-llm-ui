"use client";

import ChatTopbar from "./chat-topbar";
import ChatList from "./chat-list";
import ChatBottombar from "./chat-bottombar";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BytesOutputParser } from "@langchain/core/output_parsers";
import { Attachment, ChatRequestOptions, generateId } from "ai";
import { Message, useChat } from "ai/react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useChatStore from "@/app/hooks/useChatStore";
import { useRouter } from "next/navigation";
import Image from "next/image";

export interface ChatProps {
  id: string;
  initialMessages: Message[] | [];
  isMobile?: boolean;
}

export default function Chat({ initialMessages, id, isMobile }: ChatProps) {
  const base64Images = useChatStore((state) => state.base64Images);
  const setBase64Images = useChatStore((state) => state.setBase64Images);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const saveMessages = useChatStore((state) => state.saveMessages);
  const getMessagesById = useChatStore((state) => state.getMessagesById);
  const generateChatTitle = useChatStore((state) => state.generateChatTitle);
  const getChatById = useChatStore((state) => state.getChatById);
  const router = useRouter();

  // Check if this is the first assistant message and trigger title generation
  const shouldGenerateTitle = React.useCallback(
    (allMessages: Message[]) => {
      const chat = getChatById(id);
      if (chat?.title) return false; // Already has a title

      const assistantMessages = allMessages.filter(
        (msg) => msg.role === "assistant"
      );
      const userMessages = allMessages.filter((msg) => msg.role === "user");

      // Generate title if this is the first assistant response
      return assistantMessages.length === 1 && userMessages.length >= 1;
    },
    [getChatById, id]
  );

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    setMessages,
    setInput,
    reload,
  } = useChat({
    id,
    initialMessages,
    onResponse: (response) => {
      if (response) {
        setLoadingSubmit(false);
      }
    },
    onFinish: (message) => {
      setLoadingSubmit(false);
      const updatedMessages = [...messages, message];
      saveMessages(id, updatedMessages);

      // Generate title if this is the first assistant message
      if (shouldGenerateTitle(updatedMessages)) {
        const firstUserMessage = updatedMessages.find(
          (msg) => msg.role === "user"
        );
        const firstAssistantMessage = updatedMessages.find(
          (msg) => msg.role === "assistant"
        );

        if (firstUserMessage && firstAssistantMessage) {
          generateChatTitle(
            id,
            firstUserMessage.content as string,
            firstAssistantMessage.content as string
          );
        }
      }

      router.replace(`/c/${id}`);
    },
    onError: (error) => {
      setLoadingSubmit(false);
      router.replace("/");
      console.error(error.message);
      console.error(error.cause);
    },
  });
  const [loadingSubmit, setLoadingSubmit] = React.useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      window.history.replaceState({}, "", `/c/${id}`);

      if (!selectedModel) {
        toast.error("Please select a model");
        return;
      }

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: input,
      };

      setLoadingSubmit(true);

      const attachments: Attachment[] = base64Images
        ? base64Images.map((image) => ({
            contentType: "image/base64",
            url: image,
          }))
        : [];

      const requestOptions: ChatRequestOptions = {
        body: {
          selectedModel: selectedModel,
        },
        ...(base64Images && {
          data: {
            images: base64Images,
          },
          experimental_attachments: attachments,
        }),
      };

      handleSubmit(e, requestOptions);
      setBase64Images(null);
    },
    [base64Images, handleSubmit, id, input, selectedModel, setBase64Images]
  );

  const removeLatestMessage = React.useCallback(() => {
    const updatedMessages = messages.slice(0, -1);
    setMessages(updatedMessages);
    saveMessages(id, updatedMessages);
    return updatedMessages;
  }, [id, messages, saveMessages, setMessages]);

  const handleStop = React.useCallback(() => {
    stop();
    setLoadingSubmit(false);
  }, [stop]);

  return (
    <div className="flex flex-col w-full max-w-5xl h-full">
      <ChatTopbar
        isLoading={isLoading}
        chatId={id}
        messages={messages}
        setMessages={setMessages}
      />

      {messages.length === 0 ? (
        <div className="flex flex-col h-full w-full items-center gap-4 justify-center">
          <Image
            src="/ollama.png"
            alt="AI"
            width={40}
            height={40}
            className="h-16 w-14 object-contain dark:invert"
          />
          <p className="text-center text-base text-muted-foreground">
            How can I help you today?
          </p>
          <ChatBottombar
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={onSubmit}
            isLoading={isLoading}
            stop={handleStop}
            setInput={setInput}
          />
        </div>
      ) : (
        <>
          <ChatList
            messages={messages}
            isLoading={isLoading}
            loadingSubmit={loadingSubmit}
            reload={async () => {
              removeLatestMessage();

              const requestOptions: ChatRequestOptions = {
                body: {
                  selectedModel: selectedModel,
                },
              };

              setLoadingSubmit(true);
              return reload(requestOptions);
            }}
          />
          <ChatBottombar
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={onSubmit}
            isLoading={isLoading}
            stop={handleStop}
            setInput={setInput}
          />
        </>
      )}
    </div>
  );
}
