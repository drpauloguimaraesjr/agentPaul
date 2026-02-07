"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";

export default function ConditionNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border-2 border-purple-500 bg-purple-500/20 px-4 py-3 min-w-[120px]">
      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <span className="text-lg">❓</span>
        <span className="font-medium text-white">{data.label || "Condição"}</span>
      </div>
      <div className="mt-1 text-xs text-purple-300">{data.condition || "if/else"}</div>
      <Handle 
        type="source" 
        position={Position.Right} 
        id="yes" 
        style={{ top: "30%" }}
        className="!bg-green-500 !w-3 !h-3" 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="no" 
        style={{ top: "70%" }}
        className="!bg-orange-500 !w-3 !h-3" 
      />
    </div>
  );
}
