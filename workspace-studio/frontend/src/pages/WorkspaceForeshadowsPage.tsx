import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  FlagOutlined,
  InfoCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useWorkspaceContext } from '../workspace-context';
import { cloneData } from '../workspace-utils';

const { TextArea } = Input;
const { Title, Text } = Typography;
const { Option } = Select;

type ForeshadowStatus = 'pending' | 'planted' | 'resolved' | 'partially_resolved' | 'abandoned';

interface LocalForeshadow {
  _index: number;
  id: string;
  title: string;
  content: string;
  hint_text?: string;
  resolution_text?: string;
  source_type: string;
  status: ForeshadowStatus;
  is_long_term: boolean;
  importance: number;
  strength: number;
  subtlety: number;
  urgency: number;
  category?: string;
  notes?: string;
  resolution_notes?: string;
  related_characters: string[];
  related_foreshadow_ids: string[];
  tags: string[];
  plant_chapter_number?: number;
  target_resolve_chapter_number?: number;
  actual_resolve_chapter_number?: number;
  auto_remind: boolean;
  remind_before_chapters: number;
  include_in_context: boolean;
  created_at?: string;
  updated_at?: string;
  planted_at?: string;
  resolved_at?: string;
}

const STATUS_CONFIG: Record<ForeshadowStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '待埋入', color: 'default', icon: <ClockCircleOutlined /> },
  planted: { label: '已埋入', color: 'green', icon: <BulbOutlined /> },
  resolved: { label: '已回收', color: 'blue', icon: <CheckCircleOutlined /> },
  partially_resolved: { label: '部分回收', color: 'orange', icon: <ExclamationCircleOutlined /> },
  abandoned: { label: '已废弃', color: 'default', icon: <CloseCircleOutlined /> },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  identity: { label: '身世', color: 'purple' },
  mystery: { label: '悬念', color: 'magenta' },
  item: { label: '物品', color: 'gold' },
  relationship: { label: '关系', color: 'cyan' },
  event: { label: '事件', color: 'blue' },
  ability: { label: '能力', color: 'green' },
  prophecy: { label: '预言', color: 'volcano' },
};

function normalizeForeshadows(data: any[]): LocalForeshadow[] {
  return data.map((item, index) => ({
    _index: index,
    id: item.id || `foreshadow-${index}`,
    title: item.title || '未命名伏笔',
    content: item.content || '',
    hint_text: item.hint_text,
    resolution_text: item.resolution_text,
    source_type: item.source_type || 'manual',
    status: (item.status || 'pending') as ForeshadowStatus,
    is_long_term: Boolean(item.is_long_term),
    importance: typeof item.importance === 'number' ? item.importance : 0.5,
    strength: typeof item.strength === 'number' ? item.strength : 5,
    subtlety: typeof item.subtlety === 'number' ? item.subtlety : 5,
    urgency: typeof item.urgency === 'number' ? item.urgency : 0,
    category: item.category,
    notes: item.notes,
    resolution_notes: item.resolution_notes,
    related_characters: Array.isArray(item.related_characters) ? item.related_characters : [],
    related_foreshadow_ids: Array.isArray(item.related_foreshadow_ids) ? item.related_foreshadow_ids : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    plant_chapter_number: item.plant_chapter_number,
    target_resolve_chapter_number: item.target_resolve_chapter_number,
    actual_resolve_chapter_number: item.actual_resolve_chapter_number,
    auto_remind: item.auto_remind ?? true,
    remind_before_chapters: item.remind_before_chapters ?? 5,
    include_in_context: item.include_in_context ?? true,
    created_at: item.created_at,
    updated_at: item.updated_at,
    planted_at: item.planted_at,
    resolved_at: item.resolved_at,
  }));
}

function computeStats(foreshadows: LocalForeshadow[], currentChapter: number) {
  return {
    total: foreshadows.length,
    pending: foreshadows.filter((item) => item.status === 'pending').length,
    planted: foreshadows.filter((item) => item.status === 'planted').length,
    resolved: foreshadows.filter((item) => item.status === 'resolved').length,
    partially_resolved: foreshadows.filter((item) => item.status === 'partially_resolved').length,
    abandoned: foreshadows.filter((item) => item.status === 'abandoned').length,
    long_term_count: foreshadows.filter((item) => item.is_long_term).length,
    overdue_count: foreshadows.filter((item) => {
      if (item.status !== 'planted') return false;
      if (!item.target_resolve_chapter_number) return false;
      return item.target_resolve_chapter_number < currentChapter;
    }).length,
  };
}

function statusOrder(status: ForeshadowStatus) {
  const order: Record<ForeshadowStatus, number> = {
    planted: 1,
    pending: 2,
    partially_resolved: 3,
    resolved: 4,
    abandoned: 5,
  };
  return order[status];
}

export default function WorkspaceForeshadowsPage() {
  const { message } = App.useApp();
  const { data, saveData, reload } = useWorkspaceContext();
  const { token } = theme.useToken();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [categoryFilter, setCategoryFilter] = useState<string>();
  const [sourceFilter, setSourceFilter] = useState<string>();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [plantModalVisible, setPlantModalVisible] = useState(false);
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [currentForeshadowIndex, setCurrentForeshadowIndex] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [plantForm] = Form.useForm();
  const [resolveForm] = Form.useForm();

  const chapters = data.chapters || [];
  const chapterOptions = chapters.map((chapter: any) => ({
    label: `第${chapter.chapter_number}章 - ${chapter.title}`,
    value: chapter.chapter_number,
  }));
  const currentMaxChapter =
    chapters.filter((chapter: any) => chapter.content && String(chapter.content).trim() !== '').reduce(
      (max: number, chapter: any) => Math.max(max, chapter.chapter_number || 0),
      0,
    ) || 0;

  const foreshadows = useMemo(() => normalizeForeshadows(data.foreshadows || []), [data.foreshadows]);
  const stats = useMemo(() => computeStats(foreshadows, currentMaxChapter), [foreshadows, currentMaxChapter]);

  const filteredForeshadows = useMemo(() => {
    return foreshadows.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (sourceFilter && item.source_type !== sourceFilter) return false;
      return true;
    });
  }, [foreshadows, statusFilter, categoryFilter, sourceFilter]);

  const currentForeshadow =
    currentForeshadowIndex !== null
      ? foreshadows.find((item) => item._index === currentForeshadowIndex) || null
      : null;

  const persistForeshadows = async (updater: (items: any[]) => any[]) => {
    const nextData = cloneData(data);
    nextData.foreshadows = updater(nextData.foreshadows || []);
    await saveData(nextData);
  };

  const openEditModal = (item?: LocalForeshadow) => {
    if (item) {
      setCurrentForeshadowIndex(item._index);
      form.setFieldsValue({
        ...item,
      });
    } else {
      setCurrentForeshadowIndex(null);
      form.resetFields();
      form.setFieldsValue({
        importance: 0.5,
        strength: 5,
        subtlety: 5,
        is_long_term: false,
        auto_remind: true,
        include_in_context: true,
        remind_before_chapters: 5,
      });
    }
    setEditModalVisible(true);
  };

  const openDetailModal = (item: LocalForeshadow) => {
    setCurrentForeshadowIndex(item._index);
    setDetailModalVisible(true);
  };

  const openPlantModal = (item: LocalForeshadow) => {
    setCurrentForeshadowIndex(item._index);
    plantForm.resetFields();
    plantForm.setFieldsValue({
      plant_chapter_number: item.plant_chapter_number,
      hint_text: item.hint_text,
    });
    setPlantModalVisible(true);
  };

  const openResolveModal = (item: LocalForeshadow) => {
    setCurrentForeshadowIndex(item._index);
    resolveForm.resetFields();
    resolveForm.setFieldsValue({
      actual_resolve_chapter_number: item.actual_resolve_chapter_number,
      resolution_text: item.resolution_text,
      is_partial: item.status === 'partially_resolved',
    });
    setResolveModalVisible(true);
  };

  const handleSave = async (values: any) => {
    const payload = {
      ...values,
      source_type: currentForeshadow?.source_type || 'manual',
      status: currentForeshadow?.status || 'pending',
      related_characters: values.related_characters || [],
    };

    if (currentForeshadow) {
      await persistForeshadows((items) =>
        items.map((item, index) => (index === currentForeshadow._index ? { ...item, ...payload } : item)),
      );
      message.success('伏笔更新成功');
    } else {
      await persistForeshadows((items) => [
        ...items,
        {
          ...payload,
          source_type: 'manual',
          status: 'pending',
        },
      ]);
      message.success('伏笔创建成功');
    }

    setEditModalVisible(false);
    setCurrentForeshadowIndex(null);
    form.resetFields();
  };

  const handleDelete = async (item: LocalForeshadow) => {
    await persistForeshadows((items) => items.filter((_: any, index: number) => index !== item._index));
    message.success('伏笔删除成功');
  };

  const handlePlant = async (values: any) => {
    if (!currentForeshadow) return;
    await persistForeshadows((items) =>
      items.map((item, index) =>
        index === currentForeshadow._index
          ? {
              ...item,
              status: 'planted',
              plant_chapter_number: values.plant_chapter_number,
              hint_text: values.hint_text,
              planted_at: new Date().toISOString(),
            }
          : item,
      ),
    );
    message.success('伏笔已标记为埋入');
    setPlantModalVisible(false);
    plantForm.resetFields();
  };

  const handleResolve = async (values: any) => {
    if (!currentForeshadow) return;
    await persistForeshadows((items) =>
      items.map((item, index) =>
        index === currentForeshadow._index
          ? {
              ...item,
              status: values.is_partial ? 'partially_resolved' : 'resolved',
              actual_resolve_chapter_number: values.actual_resolve_chapter_number,
              resolution_text: values.resolution_text,
              resolution_notes: values.resolution_text,
              resolved_at: new Date().toISOString(),
            }
          : item,
      ),
    );
    message.success('伏笔已标记为回收');
    setResolveModalVisible(false);
    resolveForm.resetFields();
  };

  const handleAbandon = async (item: LocalForeshadow) => {
    await persistForeshadows((items) =>
      items.map((entry, index) =>
        index === item._index
          ? {
              ...entry,
              status: 'abandoned',
            }
          : entry,
      ),
    );
    message.success('伏笔已标记为废弃');
  };

  const getUrgencyBadge = (item: LocalForeshadow) => {
    if (item.status !== 'planted' || !item.target_resolve_chapter_number) return null;
    const remaining = item.target_resolve_chapter_number - currentMaxChapter;
    if (remaining < 0) {
      return <Badge status="error" text={`已超期 ${Math.abs(remaining)} 章`} />;
    }
    if (remaining <= 3) {
      return <Badge status="warning" text={`还剩 ${remaining} 章`} />;
    }
    return null;
  };

  const columns: ColumnsType<LocalForeshadow> = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      sorter: (a, b) => statusOrder(a.status) - statusOrder(b.status),
      render: (status: ForeshadowStatus) => {
        const config = STATUS_CONFIG[status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (title, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <a onClick={() => openDetailModal(record)}>{title}</a>
            {record.is_long_term && <Tag color="purple">长线</Tag>}
          </Space>
          {getUrgencyBadge(record)}
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      render: (category) =>
        category && CATEGORY_CONFIG[category] ? <Tag color={CATEGORY_CONFIG[category].color}>{CATEGORY_CONFIG[category].label}</Tag> : '-',
    },
    {
      title: '埋入章节',
      dataIndex: 'plant_chapter_number',
      key: 'plant_chapter_number',
      width: 100,
      render: (value) => (value ? `第${value}章` : '-'),
    },
    {
      title: '计划回收',
      dataIndex: 'target_resolve_chapter_number',
      key: 'target_resolve_chapter_number',
      width: 100,
      render: (value) => (value ? `第${value}章` : '-'),
    },
    {
      title: '重要性',
      dataIndex: 'importance',
      key: 'importance',
      width: 100,
      render: (importance) => {
        const stars = Math.round(importance * 5);
        return '★'.repeat(stars) + '☆'.repeat(5 - stars);
      },
    },
    {
      title: '来源',
      dataIndex: 'source_type',
      key: 'source_type',
      width: 90,
      render: (source) => (
        <Tag color={source === 'analysis' ? 'blue' : 'green'}>
          {source === 'analysis' ? '分析' : '手动'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetailModal(record)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          {record.status === 'pending' && (
            <Tooltip title="标记埋入">
              <Button type="text" size="small" icon={<FlagOutlined />} onClick={() => openPlantModal(record)} />
            </Tooltip>
          )}
          {record.status === 'planted' && (
            <Tooltip title="标记回收">
              <Button type="text" size="small" icon={<CheckCircleOutlined />} onClick={() => openResolveModal(record)} />
            </Tooltip>
          )}
          {record.status !== 'abandoned' && record.status !== 'resolved' && (
            <Popconfirm title="确定要废弃这个伏笔吗？" onConfirm={() => handleAbandon(record)}>
              <Tooltip title="废弃">
                <Button type="text" size="small" danger icon={<CloseCircleOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
          <Popconfirm title="确定要删除这个伏笔吗？" onConfirm={() => handleDelete(record)}>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="总计" value={stats.total} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="待埋入" value={stats.pending} valueStyle={{ color: token.colorTextSecondary }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="已埋入" value={stats.planted} valueStyle={{ color: token.colorSuccess }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="已回收" value={stats.resolved} valueStyle={{ color: token.colorPrimary }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="长线伏笔" value={stats.long_term_count} valueStyle={{ color: token.colorInfo }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="超期未回收"
              value={stats.overdue_count}
              valueStyle={{ color: stats.overdue_count > 0 ? token.colorError : token.colorTextSecondary }}
              prefix={stats.overdue_count > 0 ? <WarningOutlined /> : null}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message={
          <Space>
            <InfoCircleOutlined />
            <span>本地工作区版：伏笔状态需要手动维护，只有同步时才会回写到 MuMu。</span>
          </Space>
        }
        type="info"
        showIcon={false}
        style={{ marginBottom: 16 }}
        closable
      />

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }} value={statusFilter} onChange={setStatusFilter}>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <Option key={key} value={key}>
                {config.label}
              </Option>
            ))}
          </Select>
          <Select placeholder="分类筛选" allowClear style={{ width: 120 }} value={categoryFilter} onChange={setCategoryFilter}>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <Option key={key} value={key}>
                {config.label}
              </Option>
            ))}
          </Select>
          <Select placeholder="来源筛选" allowClear style={{ width: 120 }} value={sourceFilter} onChange={setSourceFilter}>
            <Option value="analysis">分析</Option>
            <Option value="manual">手动</Option>
          </Select>
        </Space>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={reload} />
          <Button icon={<MoreOutlined />} disabled>
            更多
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditModal()}>
            添加伏笔
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Table
          dataSource={filteredForeshadows}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          scroll={{ y: 'calc(100vh - 380px)' as any }}
          locale={{
            emptyText: <Empty description="暂无伏笔，点击右上角添加" />,
          }}
        />
      </div>

      <Modal
        title={currentForeshadow ? '编辑伏笔' : '添加伏笔'}
        open={editModalVisible}
        centered
        onCancel={() => {
          setEditModalVisible(false);
          setCurrentForeshadowIndex(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={860}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            importance: 0.5,
            strength: 5,
            subtlety: 5,
            is_long_term: false,
            auto_remind: true,
            remind_before_chapters: 5,
            include_in_context: true,
          }}
        >
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="title" label="伏笔标题" rules={[{ required: true, message: '请输入标题' }]}>
                <Input maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="分类">
                <Select allowClear>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <Option key={key} value={key}>
                      {config.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="content" label="伏笔内容" rules={[{ required: true, message: '请输入内容' }]}>
            <TextArea rows={3} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="plant_chapter_number" label="计划埋入">
                <InputNumber min={1} placeholder="章节号" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="target_resolve_chapter_number" label="计划回收">
                <InputNumber min={1} placeholder="章节号" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="related_characters" label="关联角色">
                <Select
                  mode="multiple"
                  placeholder="选择关联角色"
                  options={(data.characters || [])
                    .filter((item: any) => !item.is_organization)
                    .map((item: any) => ({
                      label: `${item.name} ${item.role_type ? `(${item.role_type})` : ''}`,
                      value: item.name,
                    }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="importance" label="重要性 (0-1)">
                <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="strength" label="强度 (1-10)">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="subtlety" label="隐藏度 (1-10)">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="is_long_term" label="长线伏笔" valuePropName="checked">
                <Switch checkedChildren="是" unCheckedChildren="否" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="hint_text" label="暗示文本">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="notes" label="备注">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }}>AI辅助设置</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="auto_remind" label="自动提醒" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="include_in_context" label="包含在生成上下文" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren="是" unCheckedChildren="否" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="remind_before_chapters" label="提前几章提醒" style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="标记埋入"
        open={plantModalVisible}
        centered
        onCancel={() => {
          setPlantModalVisible(false);
          plantForm.resetFields();
        }}
        onOk={() => plantForm.submit()}
      >
        <Form form={plantForm} layout="vertical" onFinish={handlePlant}>
          <Form.Item name="plant_chapter_number" label="选择埋入章节" rules={[{ required: true, message: '请选择章节' }]}>
            <Select options={chapterOptions} />
          </Form.Item>
          <Form.Item name="hint_text" label="暗示文本（可选）">
            <TextArea rows={3} placeholder="记录埋伏笔时使用的暗示性描写" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="标记回收"
        open={resolveModalVisible}
        centered
        onCancel={() => {
          setResolveModalVisible(false);
          resolveForm.resetFields();
        }}
        onOk={() => resolveForm.submit()}
      >
        <Form form={resolveForm} layout="vertical" onFinish={handleResolve}>
          <Form.Item name="actual_resolve_chapter_number" label="选择回收章节" rules={[{ required: true, message: '请选择章节' }]}>
            <Select options={chapterOptions} />
          </Form.Item>
          <Form.Item name="resolution_text" label="揭示文本（可选）">
            <TextArea rows={3} placeholder="记录回收伏笔时的揭示内容" />
          </Form.Item>
          <Form.Item name="is_partial" label="是否部分回收" valuePropName="checked">
            <Switch checkedChildren="部分" unCheckedChildren="完全" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="伏笔详情"
        open={detailModalVisible}
        centered
        onCancel={() => {
          setDetailModalVisible(false);
          setCurrentForeshadowIndex(null);
        }}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          <Button
            key="edit"
            type="primary"
            onClick={() => {
              setDetailModalVisible(false);
              if (currentForeshadow) openEditModal(currentForeshadow);
            }}
          >
            编辑
          </Button>,
        ]}
        width={760}
      >
        {currentForeshadow && (
          <div>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <h3>{currentForeshadow.title}</h3>
                <Space>
                  <Tag color={STATUS_CONFIG[currentForeshadow.status].color}>{STATUS_CONFIG[currentForeshadow.status].label}</Tag>
                  {currentForeshadow.is_long_term && <Tag color="purple">长线伏笔</Tag>}
                  {currentForeshadow.category && CATEGORY_CONFIG[currentForeshadow.category] && (
                    <Tag color={CATEGORY_CONFIG[currentForeshadow.category].color}>{CATEGORY_CONFIG[currentForeshadow.category].label}</Tag>
                  )}
                </Space>
              </Col>

              <Col span={24}>
                <Text strong>伏笔内容：</Text>
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{currentForeshadow.content}</div>
              </Col>

              {currentForeshadow.hint_text && (
                <Col span={24}>
                  <Text strong>暗示文本：</Text>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: token.colorTextSecondary }}>
                    {currentForeshadow.hint_text}
                  </div>
                </Col>
              )}

              {currentForeshadow.resolution_text && (
                <Col span={24}>
                  <Text strong>揭示文本：</Text>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: token.colorTextSecondary }}>
                    {currentForeshadow.resolution_text}
                  </div>
                </Col>
              )}

              <Col span={12}>
                <Text strong>埋入章节：</Text> {currentForeshadow.plant_chapter_number ? `第${currentForeshadow.plant_chapter_number}章` : '未设定'}
              </Col>
              <Col span={12}>
                <Text strong>计划回收：</Text> {currentForeshadow.target_resolve_chapter_number ? `第${currentForeshadow.target_resolve_chapter_number}章` : '未设定'}
              </Col>

              {currentForeshadow.actual_resolve_chapter_number && (
                <Col span={24}>
                  <Text strong>实际回收：</Text> 第{currentForeshadow.actual_resolve_chapter_number}章
                </Col>
              )}

              <Col span={8}>
                <Text strong>重要性：</Text> {'★'.repeat(Math.round(currentForeshadow.importance * 5))}
              </Col>
              <Col span={8}>
                <Text strong>强度：</Text> {currentForeshadow.strength}/10
              </Col>
              <Col span={8}>
                <Text strong>隐藏度：</Text> {currentForeshadow.subtlety}/10
              </Col>

              {currentForeshadow.related_characters.length > 0 && (
                <Col span={24}>
                  <Text strong>关联角色：</Text>
                  <div style={{ marginTop: 4 }}>
                    {currentForeshadow.related_characters.map((name) => (
                      <Tag key={name}>{name}</Tag>
                    ))}
                  </div>
                </Col>
              )}

              {currentForeshadow.notes && (
                <Col span={24}>
                  <Text strong>备注：</Text>
                  <div style={{ marginTop: 8, color: token.colorTextSecondary }}>{currentForeshadow.notes}</div>
                </Col>
              )}

              <Col span={24}>
                <Text strong>来源：</Text> {currentForeshadow.source_type === 'analysis' ? '章节分析提取' : '手动添加'}
              </Col>
            </Row>
          </div>
        )}
      </Modal>
    </div>
  );
}
