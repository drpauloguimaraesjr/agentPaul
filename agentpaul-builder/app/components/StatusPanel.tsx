"use client";

import { useState, useEffect } from "react";

const AGENTPAUL_URL = process.env.NEXT_PUBLIC_AGENTPAUL_URL || "https://agentpaul-production-d5f8.up.railway.app";

type HealthData = {
  status: string;
  uptime: number;
  openai?: { status: string };
};

type DiagData = {
  apiKey: {
    defined: boolean;
    startsWithSk: boolean;
  };
  connectivity: {
    openai: string;
  };
};

export default function StatusPanel() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [diag, setDiag] = useState<DiagData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const [healthRes, diagRes] = await Promise.all([
        fetch(`${AGENTPAUL_URL}/health`),
        fetch(`${AGENTPAUL_URL}/diag`),
      ]);
      
      if (healthRes.ok) {
        setHealth(await healthRes.json());
      }
      if (diagRes.ok) {
        setDiag(await diagRes.json());
      }
      setError(null);
    } catch (e) {
      setError("Não foi possível conectar ao AgentPaul");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const isOnline = health?.status === "ok";

  return (
    <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300">Status AgentPaul</h3>
        <button 
          onClick={fetchStatus}
          className="text-xs text-gray-500 hover:text-white transition-colors"
        >
          🔄 Atualizar
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Conectando...</div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : (
        <div className="space-y-3">
          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            <span className={`text-sm ${isOnline ? "text-green-400" : "text-red-400"}`}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>

          {/* Uptime */}
          {health?.uptime && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Uptime</span>
              <span className="text-gray-300">{formatUptime(health.uptime)}</span>
            </div>
          )}

          {/* OpenAI */}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">OpenAI</span>
            <span className={diag?.connectivity?.openai?.includes("ok") ? "text-green-400" : "text-red-400"}>
              {diag?.connectivity?.openai || "—"}
            </span>
          </div>

          {/* API Key */}
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">API Key</span>
            <span className={diag?.apiKey?.defined ? "text-green-400" : "text-red-400"}>
              {diag?.apiKey?.defined ? "✓ Configurada" : "✗ Ausente"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
