"use client";

import StatusPanel from "./StatusPanel";
import LogsPanel from "./LogsPanel";
import TestPanel from "./TestPanel";

const nodeTypes = [
  { type: "trigger", label: "Trigger", icon: "📥", color: "#3b82f6" },
  { type: "analyze", label: "Analisar Foto", icon: "🔍", color: "#10b981" },
  { type: "prepare", label: "Preparar Refeição", icon: "🍽️", color: "#f59e0b" },
  { type: "confirm", label: "Confirmar", icon: "✅", color: "#22c55e" },
  { type: "send", label: "Enviar Mensagem", icon: "💬", color: "#6366f1" },
  { type: "condition", label: "Condição", icon: "❓", color: "#8b5cf6" },
];

export default function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-80 bg-[#12121a] border-r border-[#2a2a3a] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a3a]">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <span>🤖</span> AgentPaul Builder
        </h1>
        <p className="text-xs text-gray-500 mt-1">Visualize o fluxo do agente</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status Panel */}
        <StatusPanel />

        {/* Nodes */}
        <div>
          <div className="text-xs uppercase text-gray-500 font-medium mb-2">Nodes</div>
          <div className="space-y-1">
            {nodeTypes.map((node) => (
              <div
                key={node.type}
                className="p-2.5 rounded-lg cursor-grab active:cursor-grabbing border transition-all hover:scale-[1.02]"
                style={{
                  borderColor: node.color + "40",
                  backgroundColor: node.color + "15",
                }}
                draggable
                onDragStart={(e) => onDragStart(e, node.type)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{node.icon}</span>
                  <span className="text-sm text-white">{node.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Test Panel */}
        <TestPanel />

        {/* Logs Panel */}
        <LogsPanel />
      </div>
    </div>
  );
}
