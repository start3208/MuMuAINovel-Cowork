import { useMemo, useState } from 'react';
import { App, AutoComplete, Button, Card, Form, Input, Modal, Select, Slider, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ApartmentOutlined, EditOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspaceContext } from '../workspace-context';
import { updateRelationships } from '../workspace-utils';

const { TextArea } = Input;

interface RelationshipType {
  name: string;
  category: string;
  icon?: string;
}

const RELATIONSHIP_TYPES: RelationshipType[] = [
  { name: '同学', category: 'social' },
  { name: '朋友', category: 'social' },
  { name: '恋人', category: 'social' },
  { name: '家人', category: 'family' },
  { name: '师徒', category: 'professional' },
  { name: '上下级', category: 'professional' },
  { name: '敌对', category: 'hostile' },
];

const CATEGORY_LABELS: Record<string, string> = {
  family: '家族关系',
  social: '社交关系',
  professional: '职业关系',
  hostile: '敌对关系',
};

export default function WorkspaceRelationshipsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { workspaceName } = useParams<{ workspaceName: string }>();
  const { data, saveData } = useWorkspaceContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form] = Form.useForm();

  const relationships = data.relationships || [];
  const characters = (data.characters || []).filter((item: any) => !item.is_organization);

  const groupedTypes = RELATIONSHIP_TYPES.reduce((acc, type) => {
    if (!acc[type.category]) acc[type.category] = [];
    acc[type.category].push(type);
    return acc;
  }, {} as Record<string, RelationshipType[]>);

  const handleCreateOrUpdate = async (values: any) => {
    const nextRelationships = [...relationships];
    if (editingIndex !== null) {
      nextRelationships[editingIndex] = {
        ...nextRelationships[editingIndex],
        ...values,
      };
    } else {
      nextRelationships.push({
        ...values,
        source: 'manual',
      });
    }
    try {
      const nextData = updateRelationships(data, nextRelationships as any);
      await saveData(nextData);
      message.success(editingIndex !== null ? '关系更新成功' : '关系创建成功');
      setIsModalOpen(false);
      setEditingIndex(null);
      form.resetFields();
    } catch {}
  };

  const handleDelete = async (index: number) => {
    const nextRelationships = relationships.filter((_: any, currentIndex: number) => currentIndex !== index);
    try {
      const nextData = updateRelationships(data, nextRelationships as any);
      await saveData(nextData);
      message.success('关系删除成功');
    } catch {}
  };

  const openEdit = (record: any, index: number) => {
    setEditingIndex(index);
    form.setFieldsValue(record);
    setIsModalOpen(true);
  };

  const columns = [
    {
      title: '角色A',
      dataIndex: 'source_name',
      key: 'from',
      render: (value: string) => (
        <Tag icon={<UserOutlined />} color="blue">
          {value}
        </Tag>
      ),
    },
    {
      title: '关系',
      dataIndex: 'relationship_name',
      key: 'relationship',
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: '角色B',
      dataIndex: 'target_name',
      key: 'to',
      render: (value: string) => (
        <Tag icon={<UserOutlined />} color="purple">
          {value}
        </Tag>
      ),
    },
    {
      title: '亲密度',
      dataIndex: 'intimacy_level',
      key: 'intimacy',
      render: (value: number) => <Tag>{value}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color="green">{value}</Tag>,
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      render: (value: string) => <Tag>{value === 'ai' ? 'AI生成' : '手动创建'}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record, relationships.indexOf(record))}>
            编辑
          </Button>
          <Button size="small" danger onClick={() => handleDelete(relationships.indexOf(record))}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      className="studio-card"
      title={
        <Space>
          <ApartmentOutlined />
          <span>关系管理</span>
        </Space>
      }
      extra={
        <Space>
          <Button onClick={() => navigate(`/workspace/${workspaceName}/relationships-graph`)}>关系图谱</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingIndex(null);
              form.resetFields();
              form.setFieldsValue({ intimacy_level: 50, status: 'active' });
              setIsModalOpen(true);
            }}
          >
            添加关系
          </Button>
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'list',
            label: `关系列表 (${relationships.length})`,
            children: <Table columns={columns} dataSource={relationships} rowKey={(_, index) => String(index)} pagination={false} />,
          },
          {
            key: 'types',
            label: `关系类型 (${RELATIONSHIP_TYPES.length})`,
            children: (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {Object.entries(groupedTypes).map(([category, types]) => (
                  <Card key={category} size="small" title={CATEGORY_LABELS[category] || category}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {types.map((type) => (
                        <Tag key={type.name}>{type.name}</Tag>
                      ))}
                    </Space>
                  </Card>
                ))}
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={editingIndex !== null ? '编辑关系' : '添加关系'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingIndex(null);
          form.resetFields();
        }}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
          <Form.Item name="source_name" label="角色A" rules={[{ required: true }]}>
            <Select options={characters.map((item: any) => ({ label: item.name, value: item.name }))} />
          </Form.Item>
          <Form.Item name="relationship_name" label="关系类型" rules={[{ required: true }]}>
            <AutoComplete options={RELATIONSHIP_TYPES.map((item) => ({ label: item.name, value: item.name }))} />
          </Form.Item>
          <Form.Item name="target_name" label="角色B" rules={[{ required: true }]}>
            <Select options={characters.map((item: any) => ({ label: item.name, value: item.name }))} />
          </Form.Item>
          <Form.Item name="intimacy_level" label="亲密度" initialValue={50}>
            <Slider min={-100} max={100} marks={{ '-100': '-100', 0: '0', 100: '100' }} />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue="active">
            <Select
              options={[
                { label: 'active', value: 'active' },
                { label: 'broken', value: 'broken' },
                { label: 'past', value: 'past' },
                { label: 'complicated', value: 'complicated' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="关系描述">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                {editingIndex !== null ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
