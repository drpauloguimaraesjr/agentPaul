"use client";

const nodeTypes = [
  { type: "trigger", label: "Trigger", icon: "📥", color: "blue" },
  { type: "analyze", label: "Analisar Foto", icon: "🔍", color: "emerald" },
  { type: "prepare", label: "Preparar Refeição", icon: "🍽️", color: "orange" },
  { type: "confirm", label: "Confirmar", icon: "✅", color: "green" },
  { type: "send", label: "Enviar Mensagem", icon: "💬", color: "indigo" },
  { type: "condition", label: "Condição", icon: "❓", color: "purple" },
];

export default function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 bg-[#12121a] border-r border-[#2a2a3a] p-4 flex flex-col">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🤖</span> AgentPaul Builder
        </h1>
        <p className="text-xs text-gray-400 mt-1">Arraste os nodes para o canvas</p>
      </div>

      <div className="flex-1 space-y-2">
        <div className="text-xs uppercase text-gray-500 font-medium mb-2">Nodes</div>
        
        {nodeTypes.map((node) => (
          <div
            key={node.type}
            className={`
              p-3 rounded-lg cursor-grab active:cursor-grabbing
              border border-${node.color}-500/30 bg-${node.color}-500/10
              hover:bg-${node.color}-500/20 transition-colors
              flex items-center gap-2
            `}
            style={{
              borderColor: `var(--${node.color}-500, #666)`,
              backgroundColor: `color-mix(in srgb, var(--${node.color}-500, #666) 10%, transparent)`,
            }}
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
          >
            <span className="text-lg">{node.icon}</span>
            <span className="text-sm text-white">{node.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-4 border-t border-[#2a2a3a]">
        <div className="text-xs text-gray-500">
          <p>💡 Dica: Conecte os nodes arrastando dos handles</p>
        </div>
      </div>
    </div>
  );
}
