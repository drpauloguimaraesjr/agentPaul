"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";

export default function AnalyzeNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border-2 border-emerald-500 bg-emerald-500/20 px-4 py-3 min-w-[150px]">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-lg">🔍</span>
        <span className="font-medium text-white">{data.label || "Analisar"}</span>
      </div>
      <div className="mt-1 text-xs text-emerald-300">GPT-4o Vision</div>
      <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-3 !h-3" />
    </div>
  );
}
