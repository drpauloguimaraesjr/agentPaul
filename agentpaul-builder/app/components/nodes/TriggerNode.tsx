"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";

export default function TriggerNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border-2 border-blue-500 bg-blue-500/20 px-4 py-3 min-w-[150px]">
      <div className="flex items-center gap-2">
        <span className="text-lg">📥</span>
        <span className="font-medium text-white">{data.label || "Trigger"}</span>
      </div>
      <div className="mt-1 text-xs text-blue-300">Foto / Áudio / Texto</div>
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  );
}
