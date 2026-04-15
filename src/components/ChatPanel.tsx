"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, Mic, Square, X } from "lucide-react";
import { deepMergeFormData, type ExtractedDeedData } from "@/lib/merge";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  onExtractedData: (data: ExtractedDeedData) => void;
  onClose: () => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  latestExtractedData: ExtractedDeedData;
  setLatestExtractedData: React.Dispatch<React.SetStateAction<ExtractedDeedData>>;
}

// ─── ChatPanel ───────────────────────────────────────────────────────────────

export function ChatPanel({
  onExtractedData,
  onClose,
  messages,
  setMessages,
  latestExtractedData,
  setLatestExtractedData,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice input state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice input refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // AbortController for in-flight fetch calls
  const abortControllerRef = useRef<AbortController | null>(null);

  const extractedCount = Object.keys(latestExtractedData).length;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, transcribing]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Detect voice support
  useEffect(() => {
    setVoiceSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined"
    );
  }, []);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      if (mediaRecorderRef.current?.state === "recording")
        mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Abort in-flight fetch on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || sending) return;

      if (!overrideText) setInput("");
      setError(null);

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setSending(true);

      try {
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const res = await fetch("/api/ai-intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages,
            currentExtractedData: latestExtractedData,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res
            .json()
            .catch(() => ({ error: `Request failed (${res.status})` }));
          throw new Error(errBody.error || `Request failed (${res.status})`);
        }

        const data = await res.json();

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);

        // Deep merge + push to form in real-time
        if (data.extractedData && typeof data.extractedData === "object") {
          setLatestExtractedData((prev) => {
            const merged = deepMergeFormData(prev, data.extractedData);
            return merged;
          });
          // Fire real-time form update
          onExtractedData(data.extractedData);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again."
        );
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [input, sending, messages, latestExtractedData, onExtractedData, setMessages, setLatestExtractedData]
  );

  // ── Voice: process recorded audio ───────────────────────────────────────

  const handleVoiceProcess = useCallback(
    async (blob: Blob) => {
      if (!blob || blob.size === 0) {
        setError("No audio detected. Please try again.");
        return;
      }

      setTranscribing(true);

      try {
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const res = await fetch("/api/stt", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res
            .json()
            .catch(() => ({ error: `STT failed (${res.status})` }));
          throw new Error(errBody.error || `STT failed (${res.status})`);
        }

        const data = await res.json();

        if (!data.success || !data.text?.trim()) {
          setError("Couldn't understand audio. Please try again.");
          return;
        }

        await handleSend(data.text.trim());
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "Voice transcription failed. Please try typing instead."
        );
      } finally {
        setTranscribing(false);
      }
    },
    [handleSend]
  );

  // ── Voice: start recording ──────────────────────────────────────────────

  const handleVoiceStart = useCallback(async () => {
    if (recording || sending || transcribing) return;
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        handleVoiceProcess(blob);
      };

      mediaRecorder.start();
      setRecording(true);

      autoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          handleVoiceStop();
        }
      }, 30_000);
    } catch {
      setError(
        "Microphone access denied. Please allow microphone in browser settings."
      );
    }
  }, [recording, sending, transcribing, handleVoiceProcess]);

  // ── Voice: stop recording ───────────────────────────────────────────────

  const handleVoiceStop = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setRecording(false);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-100 bg-navy-50/80 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-navy-900">AI Assistant</h2>
          {extractedCount > 0 && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
              {extractedCount} field{extractedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-navy-400 hover:text-navy-600 hover:bg-navy-100 rounded-lg transition-colors"
          aria-label="Close AI panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Sparkles className="w-8 h-8 text-accent/40 mx-auto mb-3" />
              <p className="text-sm text-navy-500 font-medium">
                Hi! I can help you fill in your partnership deed.
              </p>
              <p className="text-xs text-navy-400 mt-1">
                Tell me about your business and partners, and I&apos;ll fill the form for you.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-navy-900 text-white rounded-br-md"
                    : "bg-navy-50 text-navy-700 rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-navy-50 rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-navy-400 animate-spin" />
                  <span className="text-xs text-navy-400 font-medium">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {transcribing && (
            <div className="flex justify-start">
              <div className="bg-navy-50 rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-navy-400 animate-spin" />
                  <span className="text-xs text-navy-400 font-medium">Transcribing...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 pb-2 shrink-0">
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs flex items-center justify-between">
            <span className="line-clamp-2">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 text-[10px] font-semibold ml-2 shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-navy-100 px-3 py-2.5 bg-white shrink-0">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              recording
                ? "Recording... click stop"
                : transcribing
                  ? "Transcribing..."
                  : "Tell me about your partnership..."
            }
            disabled={sending || recording || transcribing}
            className="flex-1 px-3 py-2 rounded-lg border border-navy-200 text-[13px]
              focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
              hover:border-navy-300 transition-all duration-150
              bg-white disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
          />
          {voiceSupported && (
            <button
              onClick={recording ? handleVoiceStop : handleVoiceStart}
              disabled={sending || transcribing}
              className={`p-2 rounded-lg transition-all duration-150 focus:outline-none shrink-0
                ${
                  recording
                    ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                    : "bg-navy-100 text-navy-500 hover:bg-navy-200 hover:text-navy-700"
                }
                disabled:opacity-40 disabled:cursor-not-allowed`}
              aria-label={recording ? "Stop recording" : "Start voice input"}
            >
              {recording ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending || recording || transcribing}
            className="p-2 rounded-lg bg-navy-900 text-white hover:bg-navy-800
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-150 focus:outline-none shrink-0"
            aria-label="Send message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
