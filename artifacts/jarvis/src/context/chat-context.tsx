import { createContext, useContext, useState, type ReactNode } from "react";

interface ChatContextType {
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
}

const ChatContext = createContext<ChatContextType>({
  activeConversationId: null,
  setActiveConversationId: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  return (
    <ChatContext.Provider value={{ activeConversationId, setActiveConversationId }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  return useContext(ChatContext);
}
