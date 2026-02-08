"use client";

import { useState } from "react";

const AGENTPAUL_URL = process.env.NEXT_PUBLIC_AGENTPAUL_URL || "https://agentpaul-production.up.railway.app";

export default function TestPanel() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const sendTest = async () => {
    if (!message.trim()) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      const res = await fetch(`${AGENTPAUL_URL}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagem: {
            patientId: "test-builder",
            conversationId: "test-conv-" + Date.now(),
            patientName: "Builder Test",
            content: message,
            messageId: "test-" + Date.now(),
          },
          dryRun: true,
        }),
      });
      
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setResult("Erro: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">🧪 Testar Agente</h3>
      
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendTest()}
          placeholder="Digite uma mensagem de teste..."
          className="flex-1 bg-[#0a0a0f] border border-[#2a2a3a] rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={sendTest}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 rounded text-sm font-medium transition-colors"
        >
          {loading ? "..." : "Enviar"}
        </button>
      </div>

      {result && (
        <div className="bg-[#0a0a0f] border border-[#2a2a3a] rounded p-3 text-xs font-mono text-gray-300 max-h-[200px] overflow-auto whitespace-pre-wrap">
          {result}
        </div>
      )}
    </div>
  );
}
