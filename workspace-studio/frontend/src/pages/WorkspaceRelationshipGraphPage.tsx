import { useMemo } from 'react';
import dagre from 'dagre';
import { Card, Empty, Typography, theme } from 'antd';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
} from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkspaceContext } from '../workspace-context';

const { Paragraph } = Typography;

function layoutGraph(nodes: Node[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 140, marginx: 40, marginy: 40 });

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: 180, height: 64 });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });
  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: { x: position.x - 90, y: position.y - 32 },
    };
  });
}

export default function WorkspaceRelationshipGraphPage() {
  const { token } = theme.useToken();
  const { data } = useWorkspaceContext();

  const graph = useMemo(() => {
    const characterNodes: Node[] = data.characters.map((character) => ({
      id: `char-${character.name}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: {
        label: (
          <div style={{ padding: 10 }}>
            <div style={{ fontWeight: 700 }}>{character.name}</div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>
              {character.is_organization ? '组织角色' : character.role_type || '角色'}
            </div>
          </div>
        ),
      },
      style: {
        width: 180,
        borderRadius: 18,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        boxShadow: '0 12px 28px rgba(17,24,39,0.08)',
      },
    }));

    const careerNodes: Node[] = data.careers.slice(0, 12).map((career) => ({
      id: `career-${career.name}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: {
        label: (
          <div style={{ padding: 10 }}>
            <div style={{ fontWeight: 700 }}>{career.name}</div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>{career.type === 'main' ? '主职业' : '副职业'}</div>
          </div>
        ),
      },
      style: {
        width: 180,
        borderRadius: 18,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: 'rgba(213, 174, 107, 0.14)',
      },
    }));

    const edges: Edge[] = [];

    data.relationships.forEach((relationship, index) => {
      edges.push({
        id: `rel-${index}`,
        source: `char-${relationship.source_name}`,
        target: `char-${relationship.target_name}`,
        label: relationship.relationship_name || '关系',
        type: 'bezier',
        markerEnd: { type: MarkerType.ArrowClosed, color: token.colorPrimary },
        style: { stroke: token.colorPrimary, strokeWidth: 2.2 },
      });
    });

    data.organization_members.forEach((member, index) => {
      edges.push({
        id: `org-${index}`,
        source: `char-${member.organization_name}`,
        target: `char-${member.character_name}`,
        label: member.position,
        type: 'bezier',
        markerEnd: { type: MarkerType.ArrowClosed, color: token.colorInfo },
        style: { stroke: token.colorInfo, strokeDasharray: '7 5', strokeWidth: 2 },
      });
    });

    data.character_careers.forEach((mapping, index) => {
      edges.push({
        id: `career-${index}`,
        source: `char-${mapping.character_name}`,
        target: `career-${mapping.career_name}`,
        label: mapping.career_type === 'main' ? '主职业' : '副职业',
        type: 'bezier',
        markerEnd: { type: MarkerType.ArrowClosed, color: token.colorWarning },
        style: {
          stroke: mapping.career_type === 'main' ? token.colorWarning : token.colorSuccess,
          strokeWidth: 2,
        },
      });
    });

    const nodes = layoutGraph([...characterNodes, ...careerNodes], edges).filter((node) =>
      edges.some((edge) => edge.source === node.id || edge.target === node.id),
    );
    const validNodeIds = new Set(nodes.map((node) => node.id));
    const validEdges = edges.filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target));
    return { nodes, edges: validEdges };
  }, [data, token]);

  if (graph.nodes.length === 0) {
    return <Empty description="当前工作区没有可展示的关系图数据" />;
  }

  return (
    <Card className="studio-card" bodyStyle={{ padding: 0, height: 'calc(100vh - 220px)' }}>
      <div style={{ padding: '16px 20px 0' }}>
        <Typography.Title level={4}>本地关系图谱</Typography.Title>
        <Paragraph type="secondary">
          这里不使用 MuMu 原页面的折线效果，统一改成曲线边，方便查看角色、组织和职业之间的关系。
        </Paragraph>
      </div>
      <div style={{ height: 'calc(100% - 98px)' }}>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          attributionPosition="bottom-left"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
          <Controls position="top-left" />
        </ReactFlow>
      </div>
    </Card>
  );
}
