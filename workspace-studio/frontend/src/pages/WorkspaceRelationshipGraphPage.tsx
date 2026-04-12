import { useEffect, useMemo, useState } from 'react';
import dagre from 'dagre';
import { Button, Card, Empty, Space, Switch, Tag, Typography, theme } from 'antd';
import {
  ApartmentOutlined,
  ReloadOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import type { Edge, EdgeChange, Node, NodeChange, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkspaceContext } from '../workspace-context';

const { Paragraph, Text, Title } = Typography;

type GraphNodeCategory = 'character' | 'organization' | 'career-main' | 'career-sub';
type GraphEdgeCategory = 'relationship' | 'organization-member' | 'career-main' | 'career-sub';

interface GraphNodeData extends Record<string, unknown> {
  name: string;
  subtitle: string;
  category: GraphNodeCategory;
  accent: string;
}

interface GraphEdgeData extends Record<string, unknown> {
  category: GraphEdgeCategory;
}

const NODE_SIZE = 132;

const hiddenHandleStyle = {
  opacity: 0,
  width: 10,
  height: 10,
  border: 'none',
  background: 'transparent',
  pointerEvents: 'none' as const,
};

function CircleGraphNode({ data }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  return (
    <div
      style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: NODE_SIZE,
        background: nodeData.accent,
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: '0 14px 28px rgba(17,24,39,0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 18,
        color: '#fff',
      }}
    >
      <Handle id="s-top" type="source" position={Position.Top} style={hiddenHandleStyle} />
      <Handle id="s-right" type="source" position={Position.Right} style={hiddenHandleStyle} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} style={hiddenHandleStyle} />
      <Handle id="s-left" type="source" position={Position.Left} style={hiddenHandleStyle} />
      <Handle id="t-top" type="target" position={Position.Top} style={hiddenHandleStyle} />
      <Handle id="t-right" type="target" position={Position.Right} style={hiddenHandleStyle} />
      <Handle id="t-bottom" type="target" position={Position.Bottom} style={hiddenHandleStyle} />
      <Handle id="t-left" type="target" position={Position.Left} style={hiddenHandleStyle} />
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{nodeData.name}</div>
        <div style={{ fontSize: 11, opacity: 0.84, marginTop: 8, lineHeight: 1.35 }}>{nodeData.subtitle}</div>
      </div>
    </div>
  );
}

function layoutGraph(nodes: Node<GraphNodeData>[], edges: Edge<GraphEdgeData>[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 100,
    ranksep: 170,
    edgesep: 70,
    marginx: 60,
    marginy: 60,
  });

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_SIZE, height: NODE_SIZE });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });
  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: { x: position.x - NODE_SIZE / 2, y: position.y - NODE_SIZE / 2 },
    };
  });
}

function getHandleIds(source: Node<GraphNodeData>, target: Node<GraphNodeData>) {
  const sourceCenter = {
    x: source.position.x + NODE_SIZE / 2,
    y: source.position.y + NODE_SIZE / 2,
  };
  const targetCenter = {
    x: target.position.x + NODE_SIZE / 2,
    y: target.position.y + NODE_SIZE / 2,
  };

  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      return { sourceHandle: 's-right', targetHandle: 't-left' };
    }
    return { sourceHandle: 's-left', targetHandle: 't-right' };
  }

  if (dy > 0) {
    return { sourceHandle: 's-bottom', targetHandle: 't-top' };
  }
  return { sourceHandle: 's-top', targetHandle: 't-bottom' };
}

function withFloatingHandles(nodes: Node<GraphNodeData>[], edges: Edge<GraphEdgeData>[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) return edge;
    const handles = getHandleIds(sourceNode, targetNode);
    return {
      ...edge,
      ...handles,
      type: 'bezier',
    };
  });
}

export default function WorkspaceRelationshipGraphPage() {
  const { token } = theme.useToken();
  const { data } = useWorkspaceContext();
  const [showOrganizations, setShowOrganizations] = useState(true);
  const [showCareers, setShowCareers] = useState(true);
  const [showRelationshipEdges, setShowRelationshipEdges] = useState(true);
  const [showMembershipEdges, setShowMembershipEdges] = useState(true);
  const [showCareerEdges, setShowCareerEdges] = useState(true);

  const nodeTypes = useMemo(() => ({ graphNode: CircleGraphNode }), []);

  const graphSource = useMemo(() => {
    const nodes: Node<GraphNodeData>[] = [];
    const edges: Edge<GraphEdgeData>[] = [];

    (data.characters || []).forEach((character: any) => {
      const isOrganization = Boolean(character.is_organization);
      const category: GraphNodeCategory = isOrganization ? 'organization' : 'character';
      nodes.push({
        id: `char:${character.name}`,
        type: 'graphNode',
        position: { x: 0, y: 0 },
        data: {
          category,
          name: character.name,
          subtitle: isOrganization ? character.organization_type || '组织角色' : character.role_type || '角色',
          accent: isOrganization
            ? 'linear-gradient(145deg, rgba(39,117,181,0.95), rgba(26,87,136,0.95))'
            : 'linear-gradient(145deg, rgba(31,111,95,0.95), rgba(18,78,66,0.95))',
        },
        draggable: true,
        selectable: true,
      });
    });

    (data.careers || []).forEach((career: any) => {
      const category: GraphNodeCategory = career.type === 'main' ? 'career-main' : 'career-sub';
      nodes.push({
        id: `career:${career.name}`,
        type: 'graphNode',
        position: { x: 0, y: 0 },
        data: {
          category,
          name: career.name,
          subtitle: career.type === 'main' ? '主职业' : '副职业',
          accent:
            career.type === 'main'
              ? 'linear-gradient(145deg, rgba(191,137,37,0.96), rgba(145,97,10,0.96))'
              : 'linear-gradient(145deg, rgba(40,140,93,0.96), rgba(24,97,61,0.96))',
        },
        draggable: true,
        selectable: true,
      });
    });

    (data.relationships || []).forEach((relationship: any, index: number) => {
      edges.push({
        id: `rel:${index}`,
        source: `char:${relationship.source_name}`,
        target: `char:${relationship.target_name}`,
        label: relationship.relationship_name || '关系',
        markerEnd: { type: MarkerType.ArrowClosed, color: token.colorPrimary },
        style: { stroke: token.colorPrimary, strokeWidth: 2.4 },
        data: { category: 'relationship' },
      });
    });

    (data.organization_members || []).forEach((member: any, index: number) => {
      edges.push({
        id: `member:${index}`,
        source: `char:${member.organization_name}`,
        target: `char:${member.character_name}`,
        label: member.position,
        markerEnd: { type: MarkerType.ArrowClosed, color: token.colorInfo },
        style: { stroke: token.colorInfo, strokeDasharray: '7 5', strokeWidth: 2 },
        data: { category: 'organization-member' },
      });
    });

    (data.character_careers || []).forEach((mapping: any, index: number) => {
      const category: GraphEdgeCategory = mapping.career_type === 'main' ? 'career-main' : 'career-sub';
      edges.push({
        id: `career-link:${index}`,
        source: `char:${mapping.character_name}`,
        target: `career:${mapping.career_name}`,
        label: mapping.career_type === 'main' ? '主职业' : '副职业',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: mapping.career_type === 'main' ? token.colorWarning : token.colorSuccess,
        },
        style: {
          stroke: mapping.career_type === 'main' ? token.colorWarning : token.colorSuccess,
          strokeWidth: 2,
        },
        data: { category },
      });
    });

    return { nodes, edges };
  }, [data, token]);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    graphSource.nodes.forEach((node) => {
      const category = node.data.category;
      if (category === 'organization' && !showOrganizations) return;
      if ((category === 'career-main' || category === 'career-sub') && !showCareers) return;
      ids.add(node.id);
    });
    return ids;
  }, [graphSource.nodes, showOrganizations, showCareers]);

  const filteredEdges = useMemo(() => {
    return graphSource.edges.filter((edge) => {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return false;
      const category = edge.data?.category;
      if (category === 'relationship' && !showRelationshipEdges) return false;
      if (category === 'organization-member' && !showMembershipEdges) return false;
      if ((category === 'career-main' || category === 'career-sub') && !showCareerEdges) return false;
      return true;
    });
  }, [graphSource.edges, visibleNodeIds, showCareerEdges, showMembershipEdges, showRelationshipEdges]);

  const filteredNodes = useMemo(() => graphSource.nodes.filter((node) => visibleNodeIds.has(node.id)), [graphSource.nodes, visibleNodeIds]);

  const layoutedNodes = useMemo(() => layoutGraph(filteredNodes, filteredEdges), [filteredNodes, filteredEdges]);
  const layoutedEdges = useMemo(() => withFloatingHandles(layoutedNodes, filteredEdges), [layoutedNodes, filteredEdges]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node<GraphNodeData>>(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<GraphEdgeData>>(layoutedEdges);

  useEffect(() => {
    setNodes((prev) => {
      const previousPositions = new Map(prev.map((node) => [node.id, node.position]));
      const merged = layoutedNodes.map((node) => ({
        ...node,
        position: previousPositions.get(node.id) ?? node.position,
      }));
      setEdges(withFloatingHandles(merged, filteredEdges));
      return merged;
    });
  }, [filteredEdges, layoutedNodes, setEdges, setNodes]);

  const handleRelayout = () => {
    const relayoutedNodes = layoutGraph(filteredNodes, filteredEdges);
    setNodes(relayoutedNodes);
    setEdges(withFloatingHandles(relayoutedNodes, filteredEdges));
  };

  const onNodesChange = (changes: NodeChange<Node<GraphNodeData>>[]) => {
    onNodesChangeBase(changes);
    setTimeout(() => {
      setNodes((currentNodes) => {
        setEdges(withFloatingHandles(currentNodes, filteredEdges));
        return currentNodes;
      });
    }, 0);
  };

  if (filteredNodes.length === 0) {
    return <Empty description="当前筛选条件下没有可展示的关系图数据" />;
  }

  return (
    <Card className="studio-card" bodyStyle={{ padding: 0, height: 'calc(100vh - 220px)' }}>
      <div style={{ padding: '16px 20px 0' }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <Title level={4} style={{ marginBottom: 0 }}>
                本地关系图谱
              </Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                现在节点可拖动、可重新整理、可隐藏组织或职业，并使用圆形节点与隐藏锚点，尽量贴近 graph 图效果。
              </Paragraph>
            </div>
            <Button icon={<ReloadOutlined />} onClick={handleRelayout}>
              重新整理
            </Button>
          </div>

          <Space wrap>
            <Tag icon={<UserOutlined />} color="blue">角色</Tag>
            <Tag icon={<TeamOutlined />} color="cyan">组织</Tag>
            <Tag icon={<TrophyOutlined />} color="gold">主职业</Tag>
            <Tag icon={<TrophyOutlined />} color="green">副职业</Tag>
          </Space>

          <Space wrap size="large">
            <Space>
              <Switch checked={showOrganizations} onChange={setShowOrganizations} />
              <Text>显示组织节点</Text>
            </Space>
            <Space>
              <Switch checked={showCareers} onChange={setShowCareers} />
              <Text>显示职业节点</Text>
            </Space>
            <Space>
              <Switch checked={showRelationshipEdges} onChange={setShowRelationshipEdges} />
              <Text>显示角色关系</Text>
            </Space>
            <Space>
              <Switch checked={showMembershipEdges} onChange={setShowMembershipEdges} />
              <Text>显示组织成员关系</Text>
            </Space>
            <Space>
              <Switch checked={showCareerEdges} onChange={setShowCareerEdges} />
              <Text>显示职业关联</Text>
            </Space>
          </Space>
        </Space>
      </div>

      <div style={{ height: 'calc(100% - 165px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange as any}
          onEdgesChange={onEdgesChange as any}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          connectionMode={ConnectionMode.Loose}
          attributionPosition="bottom-left"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
          <Controls position="top-left" />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => {
              const category = (node.data as unknown as GraphNodeData | undefined)?.category;
              if (category === 'organization') return token.colorInfo;
              if (category === 'career-main') return token.colorWarning;
              if (category === 'career-sub') return token.colorSuccess;
              return token.colorPrimary;
            }}
          />
        </ReactFlow>
      </div>
    </Card>
  );
}
