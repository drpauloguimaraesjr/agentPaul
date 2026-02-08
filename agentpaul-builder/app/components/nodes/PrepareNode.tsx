"use client";

import { Handle, Position } from "@xyflow/react";

type NodeData = {
  label?: string;
};

export default function PrepareNode({ data }: { data: NodeData }) {
  return (
    <div className="rounded-lg border-2 border-orange-500 bg-orange-500/20 px-4 py-3 min-w-[150px]">
      <Handle type="target" position={Position.Left} className="!bg-orange-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-lg">🍽️</span>
        <span className="font-medium text-white">{data.label || "Preparar"}</span>
      </div>
      <div className="mt-1 text-xs text-orange-300">Salvar como pendente</div>
      <Handle type="source" position={Position.Right} className="!bg-orange-500 !w-3 !h-3" />
    </div>
  );
}
