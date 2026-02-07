"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";

export default function ConfirmNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border-2 border-green-500 bg-green-500/20 px-4 py-3 min-w-[150px]">
      <Handle type="target" position={Position.Left} className="!bg-green-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-lg">✅</span>
        <span className="font-medium text-white">{data.label || "Confirmar"}</span>
      </div>
      <div className="mt-1 text-xs text-green-300">Registrar no diário</div>
      <Handle type="source" position={Position.Right} className="!bg-green-500 !w-3 !h-3" />
    </div>
  );
}
