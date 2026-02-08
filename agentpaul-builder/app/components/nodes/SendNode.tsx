"use client";

import { Handle, Position } from "@xyflow/react";

type NodeData = {
  label?: string;
};

export default function SendNode({ data }: { data: NodeData }) {
  return (
    <div className="rounded-lg border-2 border-indigo-500 bg-indigo-500/20 px-4 py-3 min-w-[150px]">
      <Handle type="target" position={Position.Left} className="!bg-indigo-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-lg">💬</span>
        <span className="font-medium text-white">{data.label || "Enviar"}</span>
      </div>
      <div className="mt-1 text-xs text-indigo-300">WhatsApp</div>
      <Handle type="source" position={Position.Right} className="!bg-indigo-500 !w-3 !h-3" />
    </div>
  );
}
