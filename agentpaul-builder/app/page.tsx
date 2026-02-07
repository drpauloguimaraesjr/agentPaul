"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
} from "@xyflow/react";
import { useCallback } from "react";
import TriggerNode from "./components/nodes/TriggerNode";
import AnalyzeNode from "./components/nodes/AnalyzeNode";
import PrepareNode from "./components/nodes/PrepareNode";
import ConfirmNode from "./components/nodes/ConfirmNode";
import SendNode from "./components/nodes/SendNode";
import ConditionNode from "./components/nodes/ConditionNode";
import Sidebar from "./components/Sidebar";

const nodeTypes = {
  trigger: TriggerNode,
  analyze: AnalyzeNode,
  prepare: PrepareNode,
  confirm: ConfirmNode,
  send: SendNode,
  condition: ConditionNode,
};

// Fluxo inicial do AgentPaul
const initialNodes = [
  {
    id: "1",
    type: "trigger",
    position: { x: 50, y: 200 },
    data: { label: "Receber Mensagem" },
  },
  {
    id: "2",
    type: "condition",
    position: { x: 300, y: 200 },
    data: { label: "Tem Foto?", condition: "hasImage" },
  },
  {
    id: "3",
    type: "analyze",
    position: { x: 550, y: 100 },
    data: { label: "Analisar Foto" },
  },
  {
    id: "4",
    type: "prepare",
    position: { x: 800, y: 100 },
    data: { label: "Preparar Refeição" },
  },
  {
    id: "5",
    type: "send",
    position: { x: 1050, y: 100 },
    data: { label: "Pedir Confirmação" },
  },
  {
    id: "6",
    type: "condition",
    position: { x: 550, y: 300 },
    data: { label: "Confirmou?", condition: "isConfirmation" },
  },
  {
    id: "7",
    type: "confirm",
    position: { x: 800, y: 250 },
    data: { label: "Registrar Refeição" },
  },
  {
    id: "8",
    type: "send",
    position: { x: 1050, y: 250 },
    data: { label: "Enviar Resposta" },
  },
];

const initialEdges = [
  { id: "e1-2", source: "1", target: "2", animated: true },
  { id: "e2-3", source: "2", target: "3", label: "Sim", style: { stroke: "#10b981" } },
  { id: "e2-6", source: "2", target: "6", label: "Não", style: { stroke: "#f59e0b" } },
  { id: "e3-4", source: "3", target: "4", animated: true },
  { id: "e4-5", source: "4", target: "5", animated: true },
  { id: "e6-7", source: "6", target: "7", label: "Sim", style: { stroke: "#10b981" } },
  { id: "e7-8", source: "7", target: "8", animated: true },
];

export default function Home() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = {
        x: event.clientX - 280,
        y: event.clientY - 40,
      };

      const newNode = {
        id: `${Date.now()}`,
        type,
        position,
        data: { label: `Novo ${type}` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#0a0a0f]"
        >
          <Background color="#2a2a3a" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case "trigger": return "#3b82f6";
                case "analyze": return "#10b981";
                case "prepare": return "#f59e0b";
                case "confirm": return "#10b981";
                case "send": return "#6366f1";
                case "condition": return "#8b5cf6";
                default: return "#666";
              }
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
