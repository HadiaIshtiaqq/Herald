import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, Sparkles, MessageSquare, ChevronRight, RotateCcw } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const DEMO_COMMANDS = [
  { label: "@herald status", command: "status", description: "Pipeline status & active runs" },
  { label: "@herald analyze", command: "analyze", description: "Analyze latest PR risk & impact" },
  { label: "@herald readiness", command: "readiness", description: "Team certification readiness" },
  { label: "@herald help", command: "help", description: "All available @herald commands" },
] as const;

export default function CopilotChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("@herald ");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runCommand = async (command: string, displayText?: string) => {
    if (streaming) return;

    const userMsg = displayText ?? `@herald ${command}`;
    setMessages(prev => [
      ...prev,
      { role: "user", content: userMsg },
      { role: "assistant", content: "", streaming: true },
    ]);
    setStreaming(true);
    setInput("@herald ");
    inputRef.current?.focus();

    let accumulated = "";

    try {
      const response = await fetch(`/copilot/demo/stream?command=${encodeURIComponent(command)}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break outer;
          try {
            const parsed = JSON.parse(data);
            const token: string = parsed.delta?.content?.[0]?.text?.value ?? "";
            if (token) {
              accumulated += token;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated, streaming: true };
                return updated;
              });
            }
          } catch {
            // skip malformed SSE frame
          }
        }
      }
    } catch {
      accumulated = "Could not reach Herald server. Make sure the server is running on port 3000.";
    }

    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: "assistant", content: accumulated || "(no response)", streaming: false };
      return updated;
    });
    setStreaming(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    const match = trimmed.match(/^@herald\s+(\w+)/i);
    if (match) runCommand(match[1].toLowerCase(), trimmed);
  };

  const reset = () => {
    if (streaming) return;
    setMessages([]);
    setInput("@herald ");
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0" style={{ background: "#0d1117", color: "#c9d1d9" }}>
      {/* Header */}
      <div className="flex-none px-5 py-3 flex items-center gap-3 border-b" style={{ borderColor: "#21262d" }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#EC7A3C,#F6B048)" }}>
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white leading-none">GitHub Copilot Chat</p>
          <p className="text-[10px] mt-0.5" style={{ color: "#8b949e" }}>@herald · Herald Release Concierge</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={reset}
              disabled={streaming}
              title="Clear chat"
              className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#161b22")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <RotateCcw className="w-3.5 h-3.5" style={{ color: "#8b949e" }} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-8 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl" style={{ background: "linear-gradient(135deg,#EC7A3C,#F6B048)" }}>
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Herald Copilot Extension</h3>
              <p className="text-xs max-w-xs leading-relaxed" style={{ color: "#8b949e" }}>
                Analyze PRs, check team readiness, and control release runs — right from GitHub Copilot Chat.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {DEMO_COMMANDS.map(cmd => (
                <button
                  key={cmd.command}
                  onClick={() => runCommand(cmd.command, cmd.label)}
                  disabled={streaming}
                  className="flex items-start gap-2 p-3 rounded-lg text-left transition-all disabled:opacity-50 group"
                  style={{ border: "1px solid #30363d", background: "#161b22" }}
                  onMouseEnter={e => { if (!streaming) { e.currentTarget.style.borderColor = "#EC7A3C66"; e.currentTarget.style.background = "#1c2128"; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.background = "#161b22"; }}
                >
                  <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "#EC7A3C" }} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold font-mono text-white truncate">{cmd.label}</p>
                    <p className="text-[9px] mt-0.5 leading-snug" style={{ color: "#8b949e" }}>{cmd.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                style={msg.role === "user"
                  ? { background: "#238636", color: "#fff" }
                  : { background: "linear-gradient(135deg,#EC7A3C,#F6B048)" }
                }
              >
                {msg.role === "user" ? "You" : <Bot className="w-3.5 h-3.5 text-white" />}
              </div>

              {/* Bubble */}
              <div
                className="max-w-[82%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
                style={msg.role === "user"
                  ? { background: "#1c2128", border: "1px solid #30363d", color: "#c9d1d9" }
                  : { background: "#161b22", border: "1px solid #21262d", color: "#c9d1d9" }
                }
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-2 pb-2" style={{ borderBottom: "1px solid #21262d" }}>
                    <Sparkles className="w-2.5 h-2.5" style={{ color: "#EC7A3C" }} />
                    <span className="text-[8px] font-extrabold uppercase tracking-widest" style={{ color: "#EC7A3C" }}>herald</span>
                    {msg.streaming && <Loader2 className="w-2.5 h-2.5 animate-spin ml-auto" style={{ color: "#8b949e" }} />}
                  </div>
                )}
                <pre className="whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed">
                  {msg.content || (msg.streaming ? "▌" : "")}
                </pre>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-none px-5 py-4 border-t" style={{ borderColor: "#21262d" }}>
        <form onSubmit={handleSubmit}>
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors"
            style={{ border: "1px solid #30363d", background: "#161b22" }}
            onFocusCapture={e => (e.currentTarget.style.borderColor = "#EC7A3C66")}
            onBlurCapture={e => (e.currentTarget.style.borderColor = "#30363d")}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: "#8b949e" }} />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="@herald status"
              disabled={streaming}
              className="flex-1 bg-transparent text-xs outline-none font-mono"
              style={{ color: "#c9d1d9" }}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={streaming || !/^@herald\s+\w+/i.test(input.trim())}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: "#EC7A3C" }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#F6B048"; }}
              onMouseLeave={e => (e.currentTarget.style.background = "#EC7A3C")}
            >
              {streaming
                ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                : <Send className="w-3 h-3 text-white" />
              }
            </button>
          </div>
        </form>
        <div className="flex items-center justify-between mt-2">
          {/* Quick chips */}
          <div className="flex gap-1.5">
            {DEMO_COMMANDS.map(cmd => (
              <button
                key={cmd.command}
                onClick={() => runCommand(cmd.command, cmd.label)}
                disabled={streaming}
                className="text-[9px] font-mono px-2 py-0.5 rounded-full transition-colors disabled:opacity-40"
                style={{ border: "1px solid #30363d", color: "#8b949e", background: "transparent" }}
                onMouseEnter={e => { if (!streaming) { e.currentTarget.style.color = "#EC7A3C"; e.currentTarget.style.borderColor = "#EC7A3C66"; } }}
                onMouseLeave={e => { e.currentTarget.style.color = "#8b949e"; e.currentTarget.style.borderColor = "#30363d"; }}
              >
                {cmd.command}
              </button>
            ))}
          </div>
          <p className="text-[8px]" style={{ color: "#484f58" }}>
            Local demo · Register a GitHub App to use in real Copilot Chat
          </p>
        </div>
      </div>
    </div>
  );
}
