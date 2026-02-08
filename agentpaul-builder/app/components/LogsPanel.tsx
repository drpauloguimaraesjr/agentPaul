"use client";

import { useState, useEffect, useRef } from "react";

const AGENTPAUL_URL = process.env.NEXT_PUBLIC_AGENTPAUL_URL || "https://agentpaul-production-d5f8.up.railway.app";

type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  metadata?: {
    patientName?: string;
    contentPreview?: string;
    elapsedMs?: number;
  };
};

export default function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${AGENTPAUL_URL}/logs?limit=30`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error": return "text-red-400 bg-red-500/20";
      case "warn": return "text-yellow-400 bg-yellow-500/20";
      default: return "text-blue-400 bg-blue-500/20";
    }
  };

  return (
    <div className="bg-[#1a1a24] border border-[#2a2a3a] rounded-lg flex flex-col h-[300px]">
      <div className="flex items-center justify-between p-3 border-b border-[#2a2a3a]">
        <h3 className="text-sm font-medium text-gray-300">📋 Logs</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3 h-3"
            />
            Auto
          </label>
          <button 
            onClick={fetchLogs}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            🔄
          </button>
        </div>
      </div>

      <div ref={logsRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="text-gray-500 text-sm p-2">Carregando logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-gray-500 text-sm p-2">Nenhum log encontrado</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2 text-xs py-1 px-2 hover:bg-[#2a2a3a] rounded">
              <span className="text-gray-600 font-mono shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-medium ${getLevelColor(log.level)}`}>
                {log.level}
              </span>
              <span className="text-gray-300 truncate flex-1">
                {log.message}
                {log.metadata?.patientName && (
                  <span className="text-gray-500 ml-1">({log.metadata.patientName})</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
